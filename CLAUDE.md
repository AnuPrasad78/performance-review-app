# CLAUDE.md — Annual Performance Review Application

Instructions for AI coding assistants (Claude Code, Codex, etc.) working in this repository. Follow these rules on every task without exception. If a rule conflicts with an explicit user instruction for a specific task, prefer the user instruction and note the deviation in code review.

## Tech Stack (Planned)

- **Frontend:** React with TypeScript (strict mode)
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL
- **Architecture:** Monorepo split as `frontend/` and `backend/`

### Version policy

- Use the **latest stable release** of every dependency at the time of project setup. Do not guess versions — check npm/PyPI/official release notes before pinning.
- Once pinned in `package.json` / lockfile and `pyproject.toml`, never bump versions casually or mid-task. Dependency upgrades are deliberate, reviewed changes.
- React: use functional components and hooks only. No class components, no legacy `defaultProps`.
- Python: no `setup.py`-only packaging; use `pyproject.toml`. Type hints are mandatory on every function signature.
- PostgreSQL: version-controlled schema via Alembic migrations only. Never edit the schema by hand or use raw `CREATE TABLE` outside migrations.

## Design & Branding (mandatory reads before UI work)

- `docs/ui.md` — the frontend design system (light theme, tokens, component spec). **Read before building or modifying any UI.** All visual code must conform to it; consume design tokens, never hardcode hex values.
- `docs/branding.md` — Emids Brand System digest (logo contract, color philosophy, voice). Consulted for intent and anything `ui.md` doesn't cover.
- Brand assets (logos) live in `branding/`. Use the supplied lockups; never redraw or recolor the mark.

## Core Engineering Principles

### Enterprise coding standard

- Code must be production-grade on first commit: no TODO-stub logic, no dead code, no commented-out blocks.
- All work happens on short-lived feature branches; Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- Naming must be unambiguous without comments. Add comments only for "why", never "what".
- Every module has a single, clear responsibility. If you cannot describe a file's job in one sentence, split it.

### DRY (Don't Repeat Yourself)

- No copy-pasted logic between files, services, or apps. Extract shared logic into dedicated modules/utils.
- Frontend: shared logic goes to `frontend/src/lib` or custom hooks (`frontend/src/hooks`); shared UI goes to `frontend/src/components`.
- Backend: business rules live in the service layer — never inside route handlers and never duplicated across routes.
- Validation rules must have a single source of truth. If a rule is enforced in both frontend and backend, comment the backend one and cross-reference, with the backend as authoritative.

### SOLID & separation of concerns

- **Single responsibility:** one component/service/class = one reason to change.
- **Open/closed:** extend via props, composition, and strategy patterns — not by editing stable code with new conditionals.
- **Liskov/Interface segregation:** typed contracts everywhere; narrow interfaces over broad ones.
- **Dependency inversion:** FastAPI `Depends()` for DB sessions, auth, and config. No imports of DB/engine or config objects at module level in route or service files.

## Frontend Standards

### Atomic Design (mandatory component structure)

Components are organized strictly in this hierarchy under `frontend/src/components`:

- `atoms/` — Button, Input, Label, Badge, Icon, etc. No business logic, no data fetching, no domain vocabulary.
- `molecules/` — combinations of atoms: `FormField` (label + input + error), `ReviewScoreSelector`, `SearchBar`.
- `organisms/` — complex, domain-aware sections: `ReviewCycleBuilder`, `GoalListPanel`, `FeedbackFormSection`, `AppShell`.
- `templates/` — page-level layouts arranging organisms (e.g., `ReviewWizardTemplate`). No data fetching.
- **Pages** live in `frontend/src/pages` (or route definitions) and are the only place data fetching + routing happen, delegating everything downward.

Rules:

- Atoms never import molecules or organisms. Molecules never import organisms. Enforce mentally and in code review.
- An atom must not assume anything about the application (prop names like `score`, `reviewCycle` are banned in atoms — use generic `value`, `onChange`).
- Reuse before creation: before writing a new component, grep the components tree for an existing match. If a component gains >2 responsibilities, split it along atomic boundaries.

### TypeScript

- `strict: true` plus `noUncheckedIndexedAccess`. No `any` (use `unknown` + narrowing), no `@ts-ignore`, no non-null assertions (`!`) unless justified in a comment.
- All API responses are typed with discriminated unions (`ok`/`error` result types) — no throwing-and-hoping.
- No default exports except pages; named exports everywhere else.
- One concern per file; colocate test and colocated types with their module.

### State & data fetching

- Server state and client state are separate concerns; do not mirror API data into local state.
- Avoid prop drilling beyond 2 levels — use composition (children/slots) or context sparingly and only for genuinely global concerns (auth user, theme).

## Backend Standards (FastAPI)

- **Layered structure, enforced:**

  - `routers/` (or API endpoints) — thin: validate, delegate, format the response.
  - `services/` — all business logic. Routers must not contain `if/else` business rules.
  - `repositories/` (or DAL) — all SQL/ORM queries. Services must not build queries inline.
  - `schemas/` — Pydantic request/response models, shared between layers.
  - `models/` — SQLAlchemy ORM models.
  - `core/` — settings, security, dependencies.

- Dependency injection for everything: DB session, current user, settings. Nothing is instantiated in a service.
- Pydantic for all input validation and serialization. Never accept raw dicts into services.
- SQLAlchemy ORM (no raw SQL strings interpolated anywhere; parameterized queries if raw SQL is ever justified).
- Every endpoint declares its response model and status codes. Errors use the app's exception hierarchy, mapped to consistent HTTP error envelopes (`detail` + machine-readable `code`), defined once.
- Every route requires auth by default; explicitly opt out with a documented public dependency.
- One route = one use case. Shared behavior between routes becomes a service function.

## Database Standards (PostgreSQL)

- Schema lives only in Alembic migrations, one migration per logical change, never editing an applied migration.
- Migrations are expand-then-contract, always ship a working `downgrade()`, and must pass the migration suite (`tests/test_migrations.py`) and `alembic check`. Full rules, release order and rollback runbook: `docs/deployment.md`.
- All tables: `id` (PK), `created_at` / `updated_at` timestamps, FKs with explicit `ondelete`, and named constraints.
- Naming: `snake_case` tables and columns; join tables named `<a>_<b>`. IA: every FK indexed, and indexes for known query patterns.
- Soft deletes only where the domain requires audit history (performance reviews do — ratings/feedback must be immutable or versioned, never destroyed).
- No N+1 queries: services must use eager loading (`selectinload`) for relationships they render.

## Testing (ongoing, not an afterthought)

- Backend: pytest — service-layer unit tests and API integration tests (TestClient + a test Postgres container/local DB). Fixtures for a clean DB state per test.
- Frontend: Vitest + React Testing Library — test user-visible behavior, not implementation details.
- Every bug fix arrives with a regression test that fails without the fix.
- A feature is not done without tests. No skipping tests "temporarily".

## Security (non-negotiable)

- Hash passwords with a modern, dedicated password hashing algorithm (argon2/bcrypt) — never store or log plaintext or reversible secrets.
- All secrets/credentials come from environment variables via a typed settings module. Never hardcode, never commit `.env`.
- ORM/parameterized queries everywhere — no string-built SQL.
- CORS, rate limiting, and auth middleware configured at app level. Validate file uploads and all user input at the boundary.
- Log no PII at info level. Every permission change and review-field change is audit-logged.
- Assume all review/feedback data is confidential: endpoints must enforce both authentication and object-level authorization (a user can only read reviews/feedback they are authorized to see).

## Git & Review Workflow

- Small, focused commits. One logical change per PR.
- Never commit generated artifacts (lockfiles are committed; node_modules, `__pycache__`, `.venv`, build outputs are not).
- If a change touches shared atoms/components or shared backend services, call it out explicitly in the PR description.

## When Wrong, Fix the Cause

- Never code around a failing test or a poorly fitting abstraction — fix the abstraction or raise the issue with the user.
- A workaround added because "it currently fails" without understanding the root cause is rejected in review.
