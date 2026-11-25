# Deployment and database versioning — Azure Container Apps

How the portal runs in production, how a release ships, and how to roll back
the code, the schema, or the data. Infrastructure is `infra/main.bicep`; the
pipeline is `.github/workflows/deploy.yml`; CI is `.github/workflows/ci.yml`.

## Topology

```
internet ─HTTPS─▶ web  (nginx: SPA + /api proxy)        external ingress, the only public endpoint
                   │  private network inside the Container Apps environment
                   ▼
                  api  (FastAPI, uvicorn)                internal ingress only
                   │
                   ▼
           PostgreSQL Flexible Server                    VNet-injected, public access disabled, TLS
                   ▲
       migrate job (same image as api: `alembic upgrade head`)
```

- **Same origin.** The browser only talks to `web`; nginx forwards `/api/*` to
  `api`. No CORS in production, and the front-end image does not bake in an
  API URL, so one image works in every environment.
- **One image, two roles.** The api app and the migration job run the same
  image, so the code that migrates the schema is the code that serves it.
- **Secrets.** The database URL, the Entra client secret and the session
  signing key live in Key Vault. The apps read them through a user-assigned
  managed identity that also pulls images; the registry has no admin user and
  there are no stored registry passwords.
- **Sign-in.** Entra ID SSO runs through the same origin: the browser goes to
  `/api/auth/sso/login`, Microsoft redirects back to
  `https://<web>/api/auth/sso/callback`, and the api sets the session cookie.
  The template derives that redirect URI and `PR_APP_URL` from the web app's
  address and prints it as the `ssoRedirectUri` output.
- **Probes.**
  - `/api/health` is the liveness probe. It never touches the database.
  - `/api/ready` is the readiness probe. It requires the database to be
    reachable *and* its schema not to be behind this release.
  - A database outage therefore takes replicas out of rotation instead of
    restart-looping them.
  - A replica rolled out before its migration stays out of rotation until the
    migration has run.

## Sizing for ~2,000 employees

The data is small: one evaluation row per employee per year, tens of MB.
Request load peaks near the submission deadline and is mostly autosave PATCHes
of about four indexed single-row queries each. The defaults:

| Setting | Default | Where |
|---|---|---|
| Postgres SKU | `Standard_B2s` (Burstable) | `postgresSkuName` |
| api replicas | 1–4, scaling at 50 concurrent requests | `apiMinReplicas` / `apiMaxReplicas` |
| uvicorn workers per replica | 2 | `apiWorkers` → `WEB_CONCURRENCY` |
| pool per worker | 5 + 5 overflow | `PR_DB_POOL_SIZE` / `PR_DB_MAX_OVERFLOW` |

**Connection limit.** The most connections the API can open is
replicas × workers × (pool + overflow) = 4 × 2 × 10 = **80**. That must stay
below the server's `max_connections`. B2s allows several hundred; **B1ms
allows only about 50, so do not drop to B1ms without lowering the pool.**
If you scale out further, enable the server's built-in PgBouncer (General
Purpose tier) rather than raising the pool.

For a zero-downtime database failover, move to `GeneralPurpose` and set
`postgresHighAvailability=true`.

## First-time setup

1. **Create an Entra app registration for the pipeline.**
   - Give it a federated credential for this repo's GitHub environment.
   - Grant it `Contributor` and `User Access Administrator` (or `Role Based
     Access Control Administrator`) on the target resource group. The second
     role is needed because the template creates role assignments.
2. **Create (or reuse) the Entra app registration for sign-in.** This is a
   different registration from the pipeline's. Note its tenant id and client
   id, and create a client secret.
3. **Create a GitHub environment** (e.g. `prod`) with:
   - vars: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
     `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `APP_ENVIRONMENT`,
     `ADMIN_EMAILS` (a JSON array), `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`;
   - secrets: `POSTGRES_ADMIN_PASSWORD`, `ENTRA_CLIENT_SECRET`,
     `SESSION_SECRET` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`;
     keep it stable, since changing it signs everyone out).
4. **Run the deploy workflow** with mode `release`. On an empty database the
   migration job builds the whole schema from revision A0.
5. **Register the redirect URI.** Add the deployment's `ssoRedirectUri`
   output (`https://<prefix>-web.<environment domain>/api/auth/sso/callback`)
   under the sign-in app registration's *Authentication → Web → Redirect
   URIs*.

> **`APP_ENVIRONMENT=prod` requires SSO.** The API refuses to boot in `prod`
> without the Entra values and the session secret, and the workflow stops
> before deploying if any is missing. `dev` keeps the email-only stub sign-in,
> which trusts whatever address the caller types: use it only where every
> user is trusted.

### Moving the existing database across

The current database already carries every legacy table and is stamped with
a revision after A1. Revision A0 is an ancestor of that revision, so nothing
re-runs and no `alembic stamp` is needed; the first release's migration job
applies whatever revisions it is missing. To move it:

1. `pg_dump --format=custom --no-owner --no-privileges` from the old server.
   `alembic_version` travels with the data.
2. `pg_restore --no-owner --role=<admin> --dbname=performance_review` into the
   new server. The server is private, so run the restore from a container
   inside the VNet (a one-off Container Apps job using the `postgres:17`
   image), or open public access for the duration with a single-IP firewall
   rule and close it afterwards.
3. Run `alembic check` against it (below). It must report *No new upgrade
   operations detected* before you send any traffic.

**Drift check against any live database.** Run it from a machine or job that
can reach the database:

```bash
PR_DATABASE_URL='postgresql+asyncpg://…?ssl=require' alembic check
```

It compares the live schema to what the code's models expect. It is
read-only.

## Releasing

Run the deploy workflow in `release` mode. It does four things in order and
stops at the first failure:

1. **Foundation.** Idempotent Bicep for the network, registry, vault, database
   and environment.
2. **Build.** `az acr build` both images, tagged with the commit SHA. Tags are
   immutable; never deploy `latest`.
3. **Migrate.** Update the migration job to the new image, start it, and wait.
   - A failed migration has already rolled back its own transaction: schema
     and `alembic_version` are untouched.
   - The apps are **not** rolled. Read the job's logs in Log Analytics, fix
     forward, and release again.
4. **Roll.** Point api and web at the new images. New revisions only take
   traffic once `/api/ready` passes.

**Why migrations are a job and not a container start-up step.** With several
replicas, each one would race to migrate. A failed migration would
crash-loop the app instead of failing the release.

**Concurrent runs.** The migration runtime still takes a Postgres advisory
lock, so two runs (a retried job, overlapping pipelines) serialize. The
second finds the schema at head and does nothing.

**Reviewing the SQL before a release.** Render exactly what will run, without
touching the database:

```bash
alembic upgrade <current_revision>:head --sql
```

## Rolling back

Decide which layer is broken. Roll back the narrowest one.

### 1. Code only (the common case)

Run the deploy workflow in `app-rollback` mode, choosing the last good commit
or tag under *Use workflow from*.

- It re-points api and web at that commit's images, which are already in the
  registry. It builds nothing and runs no migration.
- An older image cannot migrate a newer schema: it does not know the newer
  revision, so `alembic upgrade head` would fail. That is why this mode skips
  the migration.
- The older code runs fine on the newer schema because migrations are
  expand-then-contract (rules below). `/api/ready` deliberately stays green
  when the schema is *ahead* of the code.

### 2. Schema

Only do this when a migration itself is wrong, and only **after** step 1
(the apps are back on the previous code). Downgrade with the **newer** image,
since it is the one that contains the downgrade code:

```bash
az containerapp job start --name <prefix>-migrate --resource-group <rg> \
  --image <registry>/performance-review-api:<NEWER_SHA> \
  --command alembic --args "downgrade <previous_revision>"
```

The run is transactional and holds the advisory lock, exactly like an
upgrade. Every downgrade in the chain is exercised by CI's stairway test
(below), so a merged migration's rollback is known to run.

**Downgrades that lose data.** Some downgrades cannot restore what their
upgrade changed. A3's downgrade, for example, drops the text `org` values.
When a downgrade would destroy data, use step 3 instead.

**Never downgrade below A1 in production.** A0's downgrade drops every table;
it exists only for CI round trips.

### 3. Data

When data itself is damaged (a bad roster import, a destructive migration),
use **point-in-time restore**. Backups are kept 35 days by default
(`postgresBackupRetentionDays`) and are geo-redundant.

1. `az postgres flexible-server restore --source-server <server> --name <new-server> --restore-time <UTC time before the damage>`.
   This creates a new server and leaves the current one untouched.
2. Verify the restored data, then update the Key Vault secret `database-url`
   to point at the new server.
3. Restart the api revision so it picks up the new secret.

## Writing migrations (rules CI enforces or relies on)

- **One logical change per migration.** Never edit a migration after it has
  been applied anywhere. The one exception so far: A2's downgrade ran its
  cleanup query after dropping the column the query reads, so it could never
  succeed anywhere. It was fixed in place because no database could have
  applied it.
- **Expand, then contract.** A release may only *add* things the previous
  release's code ignores: nullable columns, new tables, new indexes. Removing
  or renaming something the previous code reads happens one release *later*,
  after no running code reads it. This is what keeps code-only rollback safe.
- **Every migration has a working `downgrade()`.** CI's stairway test runs
  upgrade → downgrade → upgrade on every revision, then a full head → base →
  head round trip, then checks that review data survives a one-step rollback.
  Document any downgrade that cannot preserve data, as A3 does.
- **The models match the schema.** CI runs `alembic check` on a database
  built from nothing. A model change without a migration (or the reverse)
  fails the build.
- **Keep migrations reviewable and safe to run on a live database:**
  - Revision ids are at most 32 characters (the width of `alembic_version`).
  - Migrations must render offline (`--sql`).
  - DDL waits at most 10 s for a table lock (`lock_timeout` in
    `alembic/env.py`). A migration that cannot get its lock fails cleanly
    instead of stalling live requests.
  - Build indexes on large tables with `CREATE INDEX CONCURRENTLY` in their
    own non-transactional migration.

## Known gaps

- **Audit history.** Ratings and feedback still have none; CLAUDE.md requires
  them to be versioned.
- **Custom domain.** The public address is the Container Apps default domain.
  Moving to a custom domain changes the SSO redirect URI: update the Entra
  registration in the same change.
