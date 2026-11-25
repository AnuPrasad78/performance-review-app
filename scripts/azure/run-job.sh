#!/usr/bin/env bash
# Run the migration job by hand and wait for the result.
#
#   ./scripts/azure/run-job.sh dev migrate                 # alembic upgrade head
#   ./scripts/azure/run-job.sh dev downgrade <revision>    # alembic downgrade <revision>
#
# deploy.sh already migrates on every release; use `migrate` to retry after
# fixing a transient failure. `downgrade` is the schema rollback: run it only
# after the apps are back on the older image (deploy.sh <env> --tag <sha>),
# and with the job still on the NEWER image, which holds the downgrade code.
# Downgrades that cannot preserve data are documented in their migration;
# for those, restore the database instead (docs/deployment.md).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

usage() { echo "usage: $0 <env> migrate | $0 <env> downgrade <revision>" >&2; exit 2; }
[[ $# -ge 2 ]] || usage
load_env "$1"

case $2 in
  migrate)
    [[ $# -eq 2 ]] || usage
    log "Running $MIGRATE_JOB_NAME (upgrade head)"
    run_job "$MIGRATE_JOB_NAME"
    ;;
  downgrade)
    [[ $# -eq 3 ]] || usage
    REVISION=$3
    # A0's downgrade drops every table; it exists only for CI round trips.
    [[ $REVISION != base && $REVISION != pr_0000_a0_baseline ]] ||
      die "refusing to downgrade to '$REVISION': that drops every table (restore a backup instead)"
    IMAGE=$(az containerapp job show -n "$MIGRATE_JOB_NAME" -g "$RESOURCE_GROUP" \
      --query 'properties.template.containers[0].image' -o tsv)
    warn "downgrading the $ENV_NAME schema to '$REVISION' with $IMAGE"
    read -rp "Type the environment name ('$ENV_NAME') to continue: " answer
    [[ $answer == "$ENV_NAME" ]] || die "aborted"
    # The job's saved arguments are swapped for this one run and always put
    # back, so the next release still runs `upgrade head`.
    restore() {
      az containerapp job update -n "$MIGRATE_JOB_NAME" -g "$RESOURCE_GROUP" \
        --args upgrade head -o none
    }
    trap restore EXIT
    az containerapp job update -n "$MIGRATE_JOB_NAME" -g "$RESOURCE_GROUP" \
      --args downgrade "$REVISION" -o none
    log "Running $MIGRATE_JOB_NAME (downgrade $REVISION)"
    run_job "$MIGRATE_JOB_NAME"
    ;;
  *) usage ;;
esac
