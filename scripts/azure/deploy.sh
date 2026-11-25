#!/usr/bin/env bash
# Release the current commit to an environment (no CI needed).
#
#   ./scripts/azure/deploy.sh dev                  # build -> migrate -> roll -> check
#   ./scripts/azure/deploy.sh dev --tag <sha>      # roll back / redeploy, no build, no migration
#
# A release: clean-tree + branch check -> build both images <git-sha> ->
# migration job (waits; apps untouched on failure) -> api -> web -> /api/ready.
#
# --tag skips the migration on purpose: an older image does not know a newer
# schema revision, so `alembic upgrade head` would fail. The older code keeps
# working on the newer schema because migrations are expand-then-contract,
# and /api/ready stays green when the schema is ahead of the code. The job
# stays on the newer image, which holds the downgrade code if the schema
# itself must go back (scripts/azure/run-job.sh <env> downgrade <revision>).
#
# Run scripts/azure/setup.sh <env> once before the first release.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

usage() { echo "usage: $0 <env> [--tag <existing-image-tag>]" >&2; exit 2; }
[[ $# -ge 1 ]] || usage
ENV_ARG=$1; shift
TAG_OVERRIDE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --tag) TAG_OVERRIDE=${2:-}; [[ -n $TAG_OVERRIDE ]] || usage; shift 2 ;;
    *) usage ;;
  esac
done
load_env "$ENV_ARG"

for app in "$API_APP_NAME" "$WEB_APP_NAME"; do
  az containerapp show -n "$app" -g "$RESOURCE_GROUP" >/dev/null 2>&1 ||
    die "$app not found: run ./scripts/azure/setup.sh $ENV_NAME first"
done

# ---- 1. image tag --------------------------------------------------------------
if [[ -n $TAG_OVERRIDE ]]; then
  TAG=$TAG_OVERRIDE
  for repo in "$API_IMAGE_REPO" "$WEB_IMAGE_REPO"; do
    image_exists "$repo" "$TAG" || die "tag '$TAG' not found in $ACR_NAME/$repo"
  done
else
  cd "$REPO_ROOT"
  [[ -z $(git status --porcelain) ]] || die "working tree has uncommitted changes; commit or stash first"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ -n ${DEPLOY_BRANCH:-} && $BRANCH != "$DEPLOY_BRANCH" ]]; then
    die "$ENV_NAME deploys from '$DEPLOY_BRANCH', you are on '$BRANCH'"
  fi
  { git fetch -q origin "$BRANCH" 2>/dev/null &&
    [[ $(git rev-parse HEAD) == $(git rev-parse "origin/$BRANCH") ]]; } ||
    warn "HEAD is not what origin/$BRANCH has; push first so the deployed commit is shared"
  TAG=$(git rev-parse --short=12 HEAD)
fi
API_IMAGE=$(image_ref "$API_IMAGE_REPO" "$TAG")
WEB_IMAGE=$(image_ref "$WEB_IMAGE_REPO" "$TAG")

# ---- 2. build ------------------------------------------------------------------
if [[ -z $TAG_OVERRIDE ]]; then
  for pair in "$API_IMAGE_REPO:backend" "$WEB_IMAGE_REPO:frontend"; do
    repo=${pair%%:*}; context=${pair#*:}
    if image_exists "$repo" "$TAG"; then
      log "Image $repo:$TAG already built; reusing it"
    else
      log "Building $repo:$TAG"
      build_image "$repo" "$TAG" "$context"
    fi
  done
fi

# ---- 3. migrations -------------------------------------------------------------
if [[ -z $TAG_OVERRIDE ]]; then
  log "Running migrations ($MIGRATE_JOB_NAME)"
  JOB_PREVIOUS=$(az containerapp job show -n "$MIGRATE_JOB_NAME" -g "$RESOURCE_GROUP" \
    --query 'properties.template.containers[0].image' -o tsv)
  az containerapp job update -n "$MIGRATE_JOB_NAME" -g "$RESOURCE_GROUP" --image "$API_IMAGE" -o none
  if ! run_job "$MIGRATE_JOB_NAME"; then
    # The failed run rolled back its own transaction: schema and
    # alembic_version are as they were, and the apps were not touched.
    az containerapp job update -n "$MIGRATE_JOB_NAME" -g "$RESOURCE_GROUP" --image "$JOB_PREVIOUS" -o none
    die "migrations failed; apps NOT updated (migration job reset to $JOB_PREVIOUS)"
  fi
else
  log "Skipping migrations (--tag: an older image cannot migrate a newer schema)"
fi

# ---- 4. roll out: api first, so the new SPA never talks to the old api ---------
PREVIOUS=$(az containerapp show -n "$API_APP_NAME" -g "$RESOURCE_GROUP" \
  --query 'properties.template.containers[0].image' -o tsv)
log "Updating $API_APP_NAME: $PREVIOUS -> $API_IMAGE"
az containerapp update -n "$API_APP_NAME" -g "$RESOURCE_GROUP" --image "$API_IMAGE" -o none
log "Updating $WEB_APP_NAME -> $WEB_IMAGE"
az containerapp update -n "$WEB_APP_NAME" -g "$RESOURCE_GROUP" --image "$WEB_IMAGE" -o none

# ---- 5. smoke test through the public proxy ------------------------------------
FQDN=$(az containerapp show -n "$WEB_APP_NAME" -g "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv)
log "Checking https://$FQDN/api/ready"
for _ in $(seq 1 30); do
  if body=$(curl -fsS --max-time 15 "https://$FQDN/api/ready" 2>/dev/null); then
    echo "  $body"
    log "Deployed $TAG to $ENV_NAME: https://$FQDN"
    echo "Roll back with: $0 $ENV_NAME --tag ${PREVIOUS##*:}"
    exit 0
  fi
  sleep 10
done
die "readiness check failed for https://$FQDN/api/ready; roll back with: $0 $ENV_NAME --tag ${PREVIOUS##*:}"
