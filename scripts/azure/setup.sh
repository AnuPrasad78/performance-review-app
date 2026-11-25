#!/usr/bin/env bash
# Create or update one environment's Azure resources (idempotent).
#
#   ./scripts/azure/setup.sh dev
#
# Creates whatever is missing: logs, (VNet), registry, identity, Key Vault
# (access policies), Postgres, the Container Apps environment, the api and web
# apps and the migration job. On re-runs it re-applies settings, scale and Key
# Vault references from deploy/<env>.env. Missing secrets are generated
# (database password, session key) or prompted for (Entra client secret).
# It never runs migrations: scripts/azure/deploy.sh does that on every release.
# Needs only Contributor on the subscription (no role assignments are made).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env "${1:-}"
validate_settings

exists() { "$@" >/dev/null 2>&1; }

kv_allow() { # <object-id> <secret permissions...>
  local oid=$1; shift
  az keyvault set-policy -n "$KEY_VAULT_NAME" -g "$RESOURCE_GROUP" \
    --object-id "$oid" --secret-permissions "$@" -o none
}

# ---- foundation ----------------------------------------------------------------
log "Resource group, providers, logs ($ENV_NAME)"
exists az group show -n "$RESOURCE_GROUP" || az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none
for p in Microsoft.App Microsoft.OperationalInsights Microsoft.DBforPostgreSQL \
         Microsoft.KeyVault Microsoft.ContainerRegistry Microsoft.Network; do
  [[ $(az provider show -n "$p" --query registrationState -o tsv) == Registered ]] ||
    az provider register -n "$p" --wait -o none
done
exists az monitor log-analytics workspace show -g "$RESOURCE_GROUP" -n "$LOG_WORKSPACE_NAME" ||
  az monitor log-analytics workspace create -g "$RESOURCE_GROUP" -n "$LOG_WORKSPACE_NAME" \
    -l "$LOCATION" --retention-time "${LOG_RETENTION_DAYS:-30}" -o none

PRIVATE=${PRIVATE_NETWORK:-true}
[[ $PRIVATE == true || $PRIVATE == false ]] || die "PRIVATE_NETWORK must be true or false"
if [[ $PRIVATE == true ]]; then
  [[ -n ${VNET_NAME:-} ]] || die "PRIVATE_NETWORK=true needs VNET_NAME"
  log "Network (private: VNet for the apps and Postgres)"
  exists az network vnet show -g "$RESOURCE_GROUP" -n "$VNET_NAME" ||
    az network vnet create -g "$RESOURCE_GROUP" -n "$VNET_NAME" -l "$LOCATION" \
      --address-prefixes "${VNET_PREFIX:-10.40.0.0/16}" -o none
  exists az network vnet subnet show -g "$RESOURCE_GROUP" --vnet-name "$VNET_NAME" -n snet-aca ||
    az network vnet subnet create -g "$RESOURCE_GROUP" --vnet-name "$VNET_NAME" -n snet-aca \
      --address-prefixes "${ACA_SUBNET_PREFIX:-10.40.0.0/23}" --delegations Microsoft.App/environments -o none
  exists az network vnet subnet show -g "$RESOURCE_GROUP" --vnet-name "$VNET_NAME" -n snet-pg ||
    az network vnet subnet create -g "$RESOURCE_GROUP" --vnet-name "$VNET_NAME" -n snet-pg \
      --address-prefixes "${PG_SUBNET_PREFIX:-10.40.2.0/27}" \
      --delegations Microsoft.DBforPostgreSQL/flexibleServers -o none
else
  log "Network: none (PRIVATE_NETWORK=false; Postgres public with firewall + verified TLS)"
fi

# ---- registry, identity, Key Vault ---------------------------------------------
log "Registry $ACR_NAME, identity, Key Vault $KEY_VAULT_NAME"
exists az group show -n "$ACR_RESOURCE_GROUP" || az group create -n "$ACR_RESOURCE_GROUP" -l "$LOCATION" -o none
exists az acr show -n "$ACR_NAME" -g "$ACR_RESOURCE_GROUP" ||
  az acr create -n "$ACR_NAME" -g "$ACR_RESOURCE_GROUP" -l "$LOCATION" --sku Basic -o none
[[ $(az acr show -n "$ACR_NAME" -g "$ACR_RESOURCE_GROUP" --query adminUserEnabled -o tsv) == true ]] ||
  az acr update -n "$ACR_NAME" -g "$ACR_RESOURCE_GROUP" --admin-enabled true -o none
ACR_USER=$(az acr credential show -n "$ACR_NAME" -g "$ACR_RESOURCE_GROUP" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$ACR_NAME" -g "$ACR_RESOURCE_GROUP" --query 'passwords[0].value' -o tsv)
REGISTRY=(--registry-server "$ACR_SERVER" --registry-username "$ACR_USER" --registry-password "$ACR_PASS")

exists az identity show -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" ||
  az identity create -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" -l "$LOCATION" -o none
ID_RES=$(identity_id)
ID_PRINCIPAL=$(az identity show -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" --query principalId -o tsv)

if ! exists az keyvault show -n "$KEY_VAULT_NAME" -g "$RESOURCE_GROUP"; then
  kv_args=(-n "$KEY_VAULT_NAME" -g "$RESOURCE_GROUP" -l "$LOCATION"
    --enable-rbac-authorization false --retention-days 90 -o none)
  [[ ${KV_PURGE_PROTECTION:-true} == true ]] && kv_args+=(--enable-purge-protection true)
  az keyvault create "${kv_args[@]}"
fi
[[ $(az keyvault show -n "$KEY_VAULT_NAME" -g "$RESOURCE_GROUP" \
  --query properties.enableRbacAuthorization -o tsv) != true ]] ||
  die "Key Vault $KEY_VAULT_NAME uses RBAC, which needs role assignments (Owner). Use a new KEY_VAULT_NAME"

kv_allow "$ID_PRINCIPAL" get list
[[ -n ${SECRETS_OFFICER_GROUP_ID:-} ]] && kv_allow "$SECRETS_OFFICER_GROUP_ID" get list set delete
ME=$(az ad signed-in-user show --query id -o tsv 2>/dev/null || true)
if [[ -n $ME ]]; then kv_allow "$ME" get list set delete
else warn "could not resolve your Entra object id; make sure you have a Key Vault access policy"; fi

# "present" | "missing"; retries while a fresh access policy propagates.
secret_state() {
  local out
  for _ in $(seq 1 12); do
    if out=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" -n "$1" --query id -o tsv 2>&1); then
      echo present; return
    fi
    if grep -q 'SecretNotFound' <<<"$out"; then echo missing; return; fi
    sleep 10
  done
  die "cannot read Key Vault $KEY_VAULT_NAME: $out"
}
set_secret() { az keyvault secret set --vault-name "$KEY_VAULT_NAME" -n "$1" --value "$2" -o none; }

# ---- Postgres (VNet-injected, or public + firewall) ----------------------------
log "Postgres $POSTGRES_SERVER_NAME"
if [[ $PRIVATE == true ]]; then
  PG_DNS_ZONE=${PG_DNS_ZONE:-$POSTGRES_SERVER_NAME.private.postgres.database.azure.com}
  exists az network private-dns zone show -g "$RESOURCE_GROUP" -n "$PG_DNS_ZONE" ||
    az network private-dns zone create -g "$RESOURCE_GROUP" -n "$PG_DNS_ZONE" -o none
  exists az network private-dns link vnet show -g "$RESOURCE_GROUP" -z "$PG_DNS_ZONE" -n "link-$VNET_NAME" ||
    az network private-dns link vnet create -g "$RESOURCE_GROUP" -z "$PG_DNS_ZONE" -n "link-$VNET_NAME" \
      -v "$VNET_NAME" -e false -o none
  PG_NET=(--subnet "$(az network vnet subnet show -g "$RESOURCE_GROUP" --vnet-name "$VNET_NAME" -n snet-pg --query id -o tsv)"
    --private-dns-zone "$(az network private-dns zone show -g "$RESOURCE_GROUP" -n "$PG_DNS_ZONE" --query id -o tsv)")
else
  PG_NET=(--public-access None)
fi
if ! exists az postgres flexible-server show -g "$RESOURCE_GROUP" -n "$POSTGRES_SERVER_NAME"; then
  zone_args=$(pg_zone_args) || exit 1   # a die inside $( ) only ends the subshell
  read -ra PG_ZONE <<<"$zone_args"
  echo "  zone ${PG_ZONE[1]:-none}"
  # Letters and digits only, so the password needs no escaping inside the URL.
  PG_PASS=$(random_secret 32)
  PG_USER=${POSTGRES_ADMIN_USER:-pradmin}
  az postgres flexible-server create -g "$RESOURCE_GROUP" -n "$POSTGRES_SERVER_NAME" -l "$LOCATION" \
    --tier "${POSTGRES_TIER:-Burstable}" --sku-name "${POSTGRES_SKU:-Standard_B1ms}" \
    --storage-size "${POSTGRES_STORAGE_GB:-32}" --version "${POSTGRES_VERSION:-17}" \
    --admin-user "$PG_USER" --admin-password "$PG_PASS" \
    "${PG_NET[@]}" ${PG_ZONE[@]+"${PG_ZONE[@]}"} \
    --backup-retention "${POSTGRES_BACKUP_DAYS:-7}" --yes -o none
  secret_state database-url >/dev/null
  # ssl=verify-full: encrypted AND the server certificate is checked against
  # the image's CA bundle (PGSSLROOTCERT in backend/Dockerfile).
  set_secret database-url "postgresql+asyncpg://$PG_USER:$PG_PASS@$POSTGRES_SERVER_NAME.postgres.database.azure.com:5432/$POSTGRES_DB?ssl=verify-full"
  unset PG_PASS
fi
exists az postgres flexible-server db show -g "$RESOURCE_GROUP" --server-name "$POSTGRES_SERVER_NAME" -n "$POSTGRES_DB" ||
  az postgres flexible-server db create -g "$RESOURCE_GROUP" --server-name "$POSTGRES_SERVER_NAME" -n "$POSTGRES_DB" -o none
if [[ $PRIVATE == false ]]; then
  # 0.0.0.0 = "allow Azure services": Container Apps has no fixed outbound IP
  # without a VNet. Login still needs the generated password, over TLS.
  exists az postgres flexible-server firewall-rule show -g "$RESOURCE_GROUP" \
      --server-name "$POSTGRES_SERVER_NAME" -n AllowAzureServices ||
    az postgres flexible-server firewall-rule create -g "$RESOURCE_GROUP" \
      --server-name "$POSTGRES_SERVER_NAME" -n AllowAzureServices \
      --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
fi

# ---- secrets -------------------------------------------------------------------
log "Key Vault secrets"
[[ $(secret_state database-url) == present ]] ||
  die "Postgres exists but secret 'database-url' is missing; set it: az keyvault secret set --vault-name $KEY_VAULT_NAME -n database-url --value 'postgresql+asyncpg://USER:PASS@$POSTGRES_SERVER_NAME.postgres.database.azure.com:5432/$POSTGRES_DB?ssl=verify-full'"
echo "  database-url: present"
# The session key signs the app's own cookie; generated once and kept, since
# changing it signs everyone out.
if [[ $(secret_state session-secret) == present ]]; then echo "  session-secret: present"
else set_secret session-secret "$(random_secret 48)"; echo "  session-secret: generated"; fi
if sso_enabled; then
  if [[ $(secret_state entra-client-secret) == present ]]; then echo "  entra-client-secret: present"
  else
    value=$(read_secret_value entra-client-secret)
    [[ -n $value ]] || die "empty value for entra-client-secret"
    set_secret entra-client-secret "$value"; unset value
  fi
fi

# ---- images for first creation -------------------------------------------------
current_image() { # <app>
  az containerapp show -n "$1" -g "$RESOURCE_GROUP" --query 'properties.template.containers[0].image' -o tsv 2>/dev/null
}
API_IMAGE=$(current_image "$API_APP_NAME" || true)
WEB_IMAGE=$(current_image "$WEB_APP_NAME" || true)
if [[ -z $API_IMAGE || -z $WEB_IMAGE ]]; then
  log "Building bootstrap images"
  image_exists "$API_IMAGE_REPO" bootstrap || build_image "$API_IMAGE_REPO" bootstrap backend
  image_exists "$WEB_IMAGE_REPO" bootstrap || build_image "$WEB_IMAGE_REPO" bootstrap frontend
  API_IMAGE=${API_IMAGE:-$(image_ref "$API_IMAGE_REPO" bootstrap)}
  WEB_IMAGE=${WEB_IMAGE:-$(image_ref "$WEB_IMAGE_REPO" bootstrap)}
fi

# ---- Container Apps environment ------------------------------------------------
log "Container Apps environment $CONTAINERAPPS_ENV_NAME"
if ! exists az containerapp env show -g "$RESOURCE_GROUP" -n "$CONTAINERAPPS_ENV_NAME"; then
  ENV_NET=()
  [[ $PRIVATE == true ]] && ENV_NET=(--infrastructure-subnet-resource-id "$(az network vnet subnet show \
    -g "$RESOURCE_GROUP" --vnet-name "$VNET_NAME" -n snet-aca --query id -o tsv)")
  az containerapp env create -g "$RESOURCE_GROUP" -n "$CONTAINERAPPS_ENV_NAME" -l "$LOCATION" \
    --enable-workload-profiles ${ENV_NET[@]+"${ENV_NET[@]}"} \
    --logs-workspace-id "$(az monitor log-analytics workspace show -g "$RESOURCE_GROUP" \
      -n "$LOG_WORKSPACE_NAME" --query customerId -o tsv)" \
    --logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys -g "$RESOURCE_GROUP" \
      -n "$LOG_WORKSPACE_NAME" --query primarySharedKey -o tsv)" -o none
fi
ENV_SUBNET=$(az containerapp env show -g "$RESOURCE_GROUP" -n "$CONTAINERAPPS_ENV_NAME" \
  --query properties.vnetConfiguration.infrastructureSubnetId -o tsv)
if [[ $PRIVATE == true && -z $ENV_SUBNET ]] || [[ $PRIVATE == false && -n $ENV_SUBNET ]]; then
  warn "$CONTAINERAPPS_ENV_NAME was created with a different network mode than PRIVATE_NETWORK=$PRIVATE; this cannot change in place (delete the environment and re-run to switch)"
fi
PUBLIC_HOST=${CUSTOM_HOSTNAME:-$WEB_APP_NAME.$(az containerapp env show -g "$RESOURCE_GROUP" \
  -n "$CONTAINERAPPS_ENV_NAME" --query properties.defaultDomain -o tsv)}

# ---- settings ------------------------------------------------------------------
# The migration job and the api share the database settings; the job needs
# nothing else (alembic/env.py reads only PR_DATABASE_URL via Settings).
JOB_ENV=("PR_DATABASE_URL=secretref:database-url" "PR_ENVIRONMENT=$APP_ENVIRONMENT")

API_SECRET_REFS=(); API_ENV=("PR_ENVIRONMENT=$APP_ENVIRONMENT"
  "PR_STUB_ADMIN_EMAILS=${ADMIN_EMAILS:-[]}"
  # Same origin behind the web proxy: no browser calls the api directly.
  "PR_CORS_ORIGINS=[]"
  "PR_APP_URL=https://$PUBLIC_HOST"
  "WEB_CONCURRENCY=${API_WORKERS:-2}")
for s in $(api_secret_names); do
  API_SECRET_REFS+=("$(kv_ref "$s")")
  API_ENV+=("$(secret_setting "$s")=secretref:$s")
done
CLEARED=()
if sso_enabled; then
  API_ENV+=("PR_ENTRA_TENANT_ID=$ENTRA_TENANT_ID" "PR_ENTRA_CLIENT_ID=$ENTRA_CLIENT_ID"
    "PR_SSO_REDIRECT_URI=https://$PUBLIC_HOST/api/auth/sso/callback")
else
  CLEARED=(PR_ENTRA_TENANT_ID PR_ENTRA_CLIENT_ID PR_ENTRA_CLIENT_SECRET PR_SSO_REDIRECT_URI)
fi
API_SCALE=(--cpu "${API_CPU:-0.5}" --memory "${API_MEMORY:-1.0Gi}"
  --min-replicas "${API_MIN_REPLICAS:-1}" --max-replicas "${API_MAX_REPLICAS:-2}"
  --scale-rule-name http --scale-rule-type http
  --scale-rule-http-concurrency "${HTTP_CONCURRENCY:-50}")
WEB_SCALE=(--cpu "${WEB_CPU:-0.25}" --memory "${WEB_MEMORY:-0.5Gi}"
  --min-replicas "${WEB_MIN_REPLICAS:-1}" --max-replicas "${WEB_MAX_REPLICAS:-2}"
  --scale-rule-name http --scale-rule-type http
  --scale-rule-http-concurrency "${HTTP_CONCURRENCY:-50}")
# nginx reaches the api over the environment's private network by app name.
WEB_ENV=("API_UPSTREAM=http://$API_APP_NAME")

remove_stale_env() { # <app> <names...>
  local app=$1; shift
  local current stale=() k
  current=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app" \
    --query 'properties.template.containers[0].env[].name' -o tsv)
  for k in "$@"; do grep -qx "$k" <<<"$current" && stale+=("$k"); done
  if (( ${#stale[@]} )); then
    echo "  removing cleared settings: ${stale[*]}"
    az containerapp update -g "$RESOURCE_GROUP" -n "$app" --remove-env-vars "${stale[@]}" -o none
  fi
}

# ---- api app (internal ingress) ------------------------------------------------
log "Container app $API_APP_NAME (internal)"
if ! exists az containerapp show -n "$API_APP_NAME" -g "$RESOURCE_GROUP"; then
  # Plain HTTP between web and api, inside the environment only: internal
  # ingress has no public endpoint, and ACA's edge already terminated TLS.
  az containerapp create -g "$RESOURCE_GROUP" -n "$API_APP_NAME" \
    --environment "$CONTAINERAPPS_ENV_NAME" --image "$API_IMAGE" \
    "${REGISTRY[@]}" --user-assigned "$ID_RES" \
    --ingress internal --target-port 8000 --allow-insecure "${API_SCALE[@]}" \
    --secrets "${API_SECRET_REFS[@]}" --env-vars "${API_ENV[@]}" -o none
else
  az containerapp identity assign -g "$RESOURCE_GROUP" -n "$API_APP_NAME" --user-assigned "$ID_RES" -o none
  az containerapp registry set -g "$RESOURCE_GROUP" -n "$API_APP_NAME" --server "$ACR_SERVER" \
    --username "$ACR_USER" --password "$ACR_PASS" -o none
  az containerapp secret set -g "$RESOURCE_GROUP" -n "$API_APP_NAME" --secrets "${API_SECRET_REFS[@]}" -o none
  az containerapp update -g "$RESOURCE_GROUP" -n "$API_APP_NAME" "${API_SCALE[@]}" \
    --set-env-vars "${API_ENV[@]}" -o none
  remove_stale_env "$API_APP_NAME" ${CLEARED[@]+"${CLEARED[@]}"}
fi
ensure_probes "$API_APP_NAME" 8000 /api/health /api/ready

# ---- web app (external ingress) ------------------------------------------------
log "Container app $WEB_APP_NAME (public)"
if ! exists az containerapp show -n "$WEB_APP_NAME" -g "$RESOURCE_GROUP"; then
  az containerapp create -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME" \
    --environment "$CONTAINERAPPS_ENV_NAME" --image "$WEB_IMAGE" \
    "${REGISTRY[@]}" --ingress external --target-port 8080 "${WEB_SCALE[@]}" \
    --env-vars "${WEB_ENV[@]}" -o none
else
  az containerapp registry set -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME" --server "$ACR_SERVER" \
    --username "$ACR_USER" --password "$ACR_PASS" -o none
  az containerapp update -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME" "${WEB_SCALE[@]}" \
    --set-env-vars "${WEB_ENV[@]}" -o none
fi
ensure_probes "$WEB_APP_NAME" 8080 /healthz /healthz

# ---- migration job -------------------------------------------------------------
log "Migration job $MIGRATE_JOB_NAME"
if exists az containerapp job show -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME"; then
  az containerapp job identity assign -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" --user-assigned "$ID_RES" -o none
  az containerapp job registry set -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" --server "$ACR_SERVER" \
    --username "$ACR_USER" --password "$ACR_PASS" -o none
  az containerapp job secret set -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" \
    --secrets "$(kv_ref database-url)" -o none
  az containerapp job update -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" \
    --set-env-vars "${JOB_ENV[@]}" -o none
else
  # Same image as the api: the code that migrates is the code that serves.
  # A failed run has already rolled back its transaction; retrying would only
  # repeat the failure, so retry-limit is 0.
  az containerapp job create -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" \
    --environment "$CONTAINERAPPS_ENV_NAME" --trigger-type Manual \
    --replica-timeout 1800 --replica-retry-limit 0 \
    --replica-completion-count 1 --parallelism 1 \
    --image "$API_IMAGE" --cpu 0.5 --memory 1.0Gi \
    --command alembic --args upgrade head \
    "${REGISTRY[@]}" --mi-user-assigned "$ID_RES" \
    --secrets "$(kv_ref database-url)" --env-vars "${JOB_ENV[@]}" -o none
fi

log "Environment '$ENV_NAME' is set up"
echo "URL:             https://$PUBLIC_HOST"
if sso_enabled; then
  echo "Entra redirect:  https://$PUBLIC_HOST/api/auth/sso/callback  (must be on the app registration)"
fi
echo "Release:         ./scripts/azure/deploy.sh $ENV_NAME   (migrates, then rolls both apps)"
