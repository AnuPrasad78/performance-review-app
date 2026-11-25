#!/usr/bin/env bash
# Shared helpers for the Azure Container Apps scripts (sourced, not run).
# Loads deploy/<env>.env and derives every resource reference from it.
#
# Everything here works with plain Contributor on the subscription: no Azure
# role assignments are ever created. Key Vault uses access policies and the
# apps pull from the registry with its admin credentials.

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

REPO_ROOT=$(git rev-parse --show-toplevel)

load_env() {
  ENV_NAME=${1:-}
  [[ -n $ENV_NAME ]] || die "environment name required (e.g. dev)"
  CONFIG="$REPO_ROOT/deploy/$ENV_NAME.env"
  [[ -f $CONFIG ]] || die "missing $CONFIG"
  # shellcheck disable=SC1090
  source "$CONFIG"

  local required=(SUBSCRIPTION_ID LOCATION RESOURCE_GROUP ACR_NAME ACR_RESOURCE_GROUP
    API_IMAGE_REPO WEB_IMAGE_REPO KEY_VAULT_NAME IDENTITY_NAME LOG_WORKSPACE_NAME
    POSTGRES_SERVER_NAME POSTGRES_DB CONTAINERAPPS_ENV_NAME API_APP_NAME WEB_APP_NAME
    MIGRATE_JOB_NAME APP_ENVIRONMENT)
  local v
  for v in "${required[@]}"; do
    [[ -n ${!v:-} ]] || die "$v is not set in $CONFIG"
  done
  [[ $APP_ENVIRONMENT == dev || $APP_ENVIRONMENT == prod ]] ||
    die "APP_ENVIRONMENT must be dev or prod in $CONFIG"

  command -v az >/dev/null || die "Azure CLI (az) not found"
  az account show >/dev/null 2>&1 || die "not logged in: run 'az login'"
  az account set --subscription "$SUBSCRIPTION_ID"

  ACR_SERVER="$ACR_NAME.azurecr.io"
  KV_URI="https://$KEY_VAULT_NAME.vault.azure.net"
}

# SSO is on when this environment names an Entra app registration.
sso_enabled() { [[ -n ${ENTRA_CLIENT_ID:-} ]]; }

# Fail before touching Azure when the settings cannot produce a bootable app
# (mirrors the validators in backend/app/core/config.py).
validate_settings() {
  local errs=()
  if sso_enabled && [[ -z ${ENTRA_TENANT_ID:-} ]]; then
    errs+=("ENTRA_CLIENT_ID is set but ENTRA_TENANT_ID is empty")
  fi
  if [[ $APP_ENVIRONMENT == prod ]] && ! sso_enabled; then
    errs+=("APP_ENVIRONMENT=prod requires SSO: set ENTRA_TENANT_ID and ENTRA_CLIENT_ID (the API refuses to boot without them)")
  fi
  if [[ $APP_ENVIRONMENT == dev ]]; then
    warn "APP_ENVIRONMENT=dev: the email-only sign-in is on, so anyone who can reach the URL can act as any roster employee. Test data only."
  fi
  if (( ${#errs[@]} )); then
    printf '  - %s\n' "${errs[@]}" >&2
    die "fix the settings above in $CONFIG"
  fi
}

# Key Vault secrets the API reads. Each maps to one PR_ setting.
api_secret_names() {
  echo database-url session-secret
  sso_enabled && echo entra-client-secret
  return 0
}
secret_setting() {
  case $1 in
    database-url) echo PR_DATABASE_URL ;;
    session-secret) echo PR_SESSION_SECRET ;;
    entra-client-secret) echo PR_ENTRA_CLIENT_SECRET ;;
    *) die "no setting is mapped to secret '$1'" ;;
  esac
}

# Resource id of the user-assigned identity (empty if it does not exist yet).
identity_id() {
  az identity show -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" --query id -o tsv 2>/dev/null
}

# "name=keyvaultref:<uri>,identityref:<id>" for az --secrets.
kv_ref() { echo "$1=keyvaultref:$KV_URI/secrets/$1,identityref:$(identity_id)"; }

image_ref() { echo "$ACR_SERVER/$1:$2"; }   # <repo> <tag>

image_exists() { # <repo> <tag>
  az acr repository show-tags -n "$ACR_NAME" --repository "$1" -o tsv 2>/dev/null | grep -qx "$2"
}

# Build <repo>:<tag> from a folder of this repo into the registry.
# BUILD_MODE=acr (default) builds in Azure via ACR Tasks; BUILD_MODE=docker
# builds locally and pushes (for subscriptions that block ACR Tasks).
build_image() { # <repo> <tag> <context dir>
  local repo=$1 tag=$2 context="$REPO_ROOT/$3"
  if [[ ${BUILD_MODE:-acr} == docker ]]; then
    command -v docker >/dev/null || die "BUILD_MODE=docker but docker is not installed"
    az acr login -n "$ACR_NAME"
    docker build -t "$(image_ref "$repo" "$tag")" "$context"
    docker push "$(image_ref "$repo" "$tag")"
  else
    az acr build --registry "$ACR_NAME" --resource-group "$ACR_RESOURCE_GROUP" \
      --image "$repo:$tag" "$context"
  fi
}

# Start a job execution with its saved template and wait for the result.
# Never pass --image/--command/--args to `job start`: that replaces the
# container for the run and drops its env (the database URL). Update the job
# first instead.
run_job() {
  local job=$1 exec status
  exec=$(az containerapp job start -n "$job" -g "$RESOURCE_GROUP" --query name -o tsv)
  [[ -n $exec ]] || die "could not start job $job"
  echo "execution: $exec"
  for _ in $(seq 1 120); do
    status=$(az containerapp job execution show -n "$job" -g "$RESOURCE_GROUP" \
      --job-execution-name "$exec" --query properties.status -o tsv)
    case $status in
      Succeeded) echo " Succeeded"; return 0 ;;
      Failed|Stopped|Degraded)
        echo; warn "job $job execution $exec: $status"
        echo "logs: Azure portal -> $job -> Execution history -> $exec -> Console logs" >&2
        return 1 ;;
      *) printf '.'; sleep 10 ;;
    esac
  done
  echo; warn "job $job execution $exec timed out (last status: ${status:-unknown})"
  return 1
}

# Startup / readiness / liveness HTTP probes. az has no probe flags, so the
# template is patched through ARM once; later `az containerapp update` calls
# keep them.
#   api: liveness /api/health (never touches the database, so an outage does
#        not restart-loop replicas); readiness /api/ready (database reachable
#        and schema not behind this image).
#   web: /healthz served by nginx itself.
ensure_probes() { # <app> <port> <liveness path> <readiness path>
  local app=$1 port=$2 live=$3 ready=$4 id count
  id=$(az containerapp show -n "$app" -g "$RESOURCE_GROUP" --query id -o tsv)
  # shellcheck disable=SC2016  # backticks are a JMESPath literal, not shell
  count=$(az containerapp show -n "$app" -g "$RESOURCE_GROUP" \
    --query 'length(properties.template.containers[0].probes || `[]`)' -o tsv)
  if [[ ${count:-0} -ge 3 ]]; then echo "  $app probes: present"; return; fi
  command -v python3 >/dev/null || die "python3 is needed to add health probes"
  # Read and write through ARM with ONE pinned API version: `az containerapp
  # show` uses the CLI's newest (preview) API, whose extra fields an older
  # write version rejects.
  local api=2025-01-01 body
  body=$(mktemp)
  az rest --method get --url "https://management.azure.com$id?api-version=$api" -o json | python3 -c '
import json, sys
port, live, ready = int(sys.argv[1]), sys.argv[2], sys.argv[3]
t = json.load(sys.stdin)["properties"]["template"]
t.pop("revisionSuffix", None)
t["containers"][0]["probes"] = [
  {"type": "Startup", "httpGet": {"path": live, "port": port}, "initialDelaySeconds": 3,
   "periodSeconds": 5, "timeoutSeconds": 3, "failureThreshold": 24},
  {"type": "Readiness", "httpGet": {"path": ready, "port": port}, "periodSeconds": 10,
   "timeoutSeconds": 5, "failureThreshold": 3},
  {"type": "Liveness", "httpGet": {"path": live, "port": port}, "periodSeconds": 30,
   "timeoutSeconds": 5, "failureThreshold": 3},
]
json.dump({"properties": {"template": t}}, sys.stdout)' "$port" "$live" "$ready" > "$body"
  az rest --method patch --url "https://management.azure.com$id?api-version=$api" \
    --body "@$body" -o none
  rm -f "$body"
  echo "  $app probes: added (liveness $live, readiness $ready)"
}

# ---- helpers for setup.sh ------------------------------------------------------

# "--zone N" for regions with availability zones, nothing for regions without.
# POSTGRES_ZONE pins one; POSTGRES_ZONE=none forces no zone. Dies when the SKU
# is not offered at all.
pg_zone_args() {
  local sku=${POSTGRES_SKU:-Standard_B1ms} tier=${POSTGRES_TIER:-Burstable} found zone
  if [[ ${POSTGRES_ZONE:-} == none ]]; then return; fi
  if [[ -n ${POSTGRES_ZONE:-} ]]; then echo "--zone $POSTGRES_ZONE"; return; fi
  found=$(az postgres flexible-server list-skus -l "$LOCATION" --query \
    "[0].supportedServerEditions[?name=='$tier'] | [0].supportedServerSkus[?name=='$sku'] | [0].name" \
    -o tsv 2>/dev/null)
  [[ -n $found ]] || die "$sku is not offered in $LOCATION; pick another LOCATION or POSTGRES_SKU"
  zone=$(az postgres flexible-server list-skus -l "$LOCATION" --query \
    "[0].supportedServerEditions[?name=='$tier'] | [0].supportedServerSkus[?name=='$sku'] | [0].supportedZones[0]" \
    -o tsv 2>/dev/null)
  [[ -n $zone ]] && echo "--zone $zone"
  return 0
}

# Value for a missing Key Vault secret: KV_SEED_<UPPER_SNAKE> from the
# environment (non-interactive runs), else a hidden prompt.
read_secret_value() {
  local seed
  seed="KV_SEED_$(echo "$1" | tr 'a-z-' 'A-Z_')"
  if [[ -n ${!seed:-} ]]; then echo "${!seed}"; return; fi
  [[ -t 0 ]] || die "secret '$1' missing: set $seed or run in a terminal (or set it in $KEY_VAULT_NAME)"
  local value
  read -rsp "  $1 (input hidden): " value; echo >&2
  echo "$value"
}

random_secret() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "${1:-48}"; }
