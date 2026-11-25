// Performance Review portal on Azure Container Apps.
//
// One resource group holds the whole environment:
//
//   internet ──HTTPS──▶ web (nginx: SPA + /api reverse proxy, external ingress)
//                         │ private, inside the Container Apps environment
//                         ▼
//                       api (FastAPI, internal ingress only) ──▶ PostgreSQL
//                                                                (VNet-injected,
//   migrate job (same image as api, `alembic upgrade head`) ───▶  no public access)
//
// Deployed in three passes by .github/workflows/deploy.yml (docs/deployment.md):
//   1. releaseTag = ''                       → foundation only (network, registry,
//                                               vault, database, environment)
//   2. releaseTag = <sha>, deployApps=false  → migration job on the new image;
//                                               the pipeline runs it and waits
//   3. releaseTag = <sha>, deployApps=true   → api + web roll to the new image
// so a release never serves code against a schema it has not migrated.

targetScope = 'resourceGroup'

@description('Azure region for every resource.')
param location string = resourceGroup().location

@description('Short lowercase prefix for resource names (3-12 chars).')
@minLength(3)
@maxLength(12)
param namePrefix string = 'perfreview'

@description('Environment label used in names and tags, e.g. prod, uat.')
param environmentName string = 'prod'

@description('Image tag to run (the git SHA). Empty deploys the foundation only.')
param releaseTag string = ''

@description('Deploy/roll the api and web apps. False only updates the migration job.')
param deployApps bool = false

@description('Value of PR_ENVIRONMENT. "prod" requires the Entra ID SSO parameters below (the API refuses to boot without them) and ignores the dev stub sign-in.')
@allowed([
  'dev'
  'prod'
])
param appEnvironment string = 'dev'

@description('Emails holding the HR admin console role while roles live in configuration.')
param adminEmails array = []

@description('Entra ID directory (tenant) id for SSO. Empty leaves SSO off (dev only).')
param entraTenantId string = ''

@description('Entra ID application (client) id for SSO.')
param entraClientId string = ''

@description('Entra ID client secret VALUE for SSO (from the pipeline secret store).')
@secure()
param entraClientSecret string = ''

@description('Signs the app session cookie. Keep it stable across releases: changing it signs everyone out.')
@secure()
param sessionSecret string = ''

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'pradmin'

@description('PostgreSQL administrator password (from the pipeline secret store).')
@secure()
param postgresAdminPassword string

@description('PostgreSQL major version.')
param postgresVersion string = '17'

@description('PostgreSQL compute SKU. Burstable B2s comfortably serves ~2,000 reviewers.')
param postgresSkuName string = 'Standard_B2s'

@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param postgresSkuTier string = 'Burstable'

@description('Zone-redundant standby. Requires the GeneralPurpose or MemoryOptimized tier.')
param postgresHighAvailability bool = false

@description('Point-in-time-restore window in days (7-35).')
@minValue(7)
@maxValue(35)
param postgresBackupRetentionDays int = 35

@description('Keep backups geo-redundant (paired region restore). Fixed at server creation.')
param postgresGeoRedundantBackup bool = true

param apiMinReplicas int = 1
param apiMaxReplicas int = 4
param webMinReplicas int = 1
param webMaxReplicas int = 3

@description('Uvicorn worker processes per api replica.')
param apiWorkers int = 2

var suffix = uniqueString(resourceGroup().id, namePrefix, environmentName)
var baseName = '${namePrefix}-${environmentName}'
var tags = {
  application: 'performance-review'
  environment: environmentName
}

var apiAppName = '${namePrefix}-api'
var webAppName = '${namePrefix}-web'
var migrateJobName = '${namePrefix}-migrate'
var databaseName = 'performance_review'
var hasRelease = !empty(releaseTag)
var ssoConfigured = !empty(entraClientSecret) && !empty(sessionSecret)

// Built-in role definition ids.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// ── Observability ─────────────────────────────────────────────────────────

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${baseName}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 90
  }
}

// ── Identity: one user-assigned identity pulls images and reads secrets ───

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${baseName}-id'
  location: location
  tags: tags
}

// ── Container registry (no admin user; pulls go through the identity) ─────

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: take('${namePrefix}${environmentName}${suffix}', 50)
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

// ── Network: Container Apps and PostgreSQL share a private VNet ───────────

resource network 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: '${baseName}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.40.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: '10.40.0.0/23'
          delegations: [
            {
              name: 'container-apps'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.40.2.0/24'
          delegations: [
            {
              name: 'postgres'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${baseName}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresDns
  name: '${baseName}-vnet-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: network.id
    }
  }
}

// ── PostgreSQL Flexible Server: private, TLS-only, PITR backups ───────────

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${baseName}-pg-${suffix}'
  location: location
  tags: tags
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: postgresBackupRetentionDays
      geoRedundantBackup: postgresGeoRedundantBackup ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: postgresHighAvailability ? 'ZoneRedundant' : 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: '${network.id}/subnets/postgres'
      privateDnsZoneArmResourceId: postgresDns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [
    postgresDnsLink
  ]
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// The app's timestamps are UTC by contract (review_cycles.submission_deadline).
resource postgresTimezone 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'timezone'
  properties: {
    value: 'UTC'
    source: 'user-override'
  }
}

resource postgresDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'to-log-analytics'
  scope: postgres
  properties: {
    workspaceId: logs.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

// ── Key Vault: the database URL never appears in app configuration ────────

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('${namePrefix}-${environmentName}-${suffix}', 24)
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: {
    value: 'postgresql+asyncpg://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?ssl=require'
  }
}

resource entraClientSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (ssoConfigured) {
  parent: vault
  name: 'entra-client-secret'
  properties: {
    value: entraClientSecret
  }
}

resource sessionSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (ssoConfigured) {
  parent: vault
  name: 'session-secret'
  properties: {
    value: sessionSecret
  }
}

resource vaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, keyVaultSecretsUserRoleId)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}

// ── Container Apps environment (VNet-integrated, workload profiles) ───────

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${baseName}-env'
  location: location
  tags: tags
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: '${network.id}/subnets/container-apps'
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// Shared pieces of the api app and the migration job: same image, same
// secret, same configuration — the code that migrates is the code that serves.
var apiImage = '${registry.properties.loginServer}/performance-review-api:${releaseTag}'
var webImage = '${registry.properties.loginServer}/performance-review-web:${releaseTag}'

var registryAccess = [
  {
    server: registry.properties.loginServer
    identity: identity.id
  }
]

// The public origin is known before the web app exists: Container Apps names
// it <app>.<environment default domain>. The SSO callback is served by the api
// through the web proxy, so it lives on the same origin.
var webOrigin = 'https://${webAppName}.${containerEnvironment.properties.defaultDomain}'

var appSecrets = concat(
  [
    {
      name: 'database-url'
      keyVaultUrl: databaseUrlSecret.properties.secretUri
      identity: identity.id
    }
  ],
  ssoConfigured
    ? [
        {
          name: 'entra-client-secret'
          keyVaultUrl: entraClientSecretValue!.properties.secretUri
          identity: identity.id
        }
        {
          name: 'session-secret'
          keyVaultUrl: sessionSecretValue!.properties.secretUri
          identity: identity.id
        }
      ]
    : []
)

var ssoEnvironment = ssoConfigured
  ? [
      {
        name: 'PR_ENTRA_TENANT_ID'
        value: entraTenantId
      }
      {
        name: 'PR_ENTRA_CLIENT_ID'
        value: entraClientId
      }
      {
        name: 'PR_ENTRA_CLIENT_SECRET'
        secretRef: 'entra-client-secret'
      }
      {
        name: 'PR_SESSION_SECRET'
        secretRef: 'session-secret'
      }
      {
        // Register exactly this URI in the Entra app registration.
        name: 'PR_SSO_REDIRECT_URI'
        value: '${webOrigin}/api/auth/sso/callback'
      }
      {
        name: 'PR_APP_URL'
        value: webOrigin
      }
    ]
  : []

var apiEnvironment = concat(ssoEnvironment, [
  {
    name: 'PR_DATABASE_URL'
    secretRef: 'database-url'
  }
  {
    name: 'PR_ENVIRONMENT'
    value: appEnvironment
  }
  {
    name: 'PR_STUB_ADMIN_EMAILS'
    value: string(adminEmails)
  }
  {
    // Same-origin behind the web proxy: no browser calls the API directly.
    name: 'PR_CORS_ORIGINS'
    value: '[]'
  }
  {
    name: 'WEB_CONCURRENCY'
    value: string(apiWorkers)
  }
])

// ── Migration job: run once per release, before the apps roll ─────────────

resource migrateJob 'Microsoft.App/jobs@2024-03-01' = if (hasRelease) {
  name: migrateJobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: containerEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      // A failed migration has already rolled back its transaction; retrying
      // blindly hides the failure. The pipeline stops and a human looks.
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: registryAccess
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: apiImage
          command: [
            'alembic'
          ]
          args: [
            'upgrade'
            'head'
          ]
          env: apiEnvironment
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
  dependsOn: [
    registryPull
    vaultSecretsUser
    postgresDatabase
  ]
}

// ── API: internal ingress only — reachable from the web proxy, not the internet

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = if (hasRelease && deployApps) {
  name: apiAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8000
        transport: 'http'
        // Plain HTTP stays inside the environment's private network.
        allowInsecure: true
      }
      registries: registryAccess
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: apiEnvironment
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 8000
              }
              periodSeconds: 3
              failureThreshold: 20
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8000
              }
              periodSeconds: 15
              failureThreshold: 3
            }
            {
              // Database reachable and schema not behind this release.
              type: 'Readiness'
              httpGet: {
                path: '/api/ready'
                port: 8000
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: apiMinReplicas
        maxReplicas: apiMaxReplicas
        rules: [
          {
            name: 'http-load'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    registryPull
    vaultSecretsUser
    postgresDatabase
  ]
}

// ── Web: the only public endpoint ─────────────────────────────────────────

resource webApp 'Microsoft.App/containerApps@2024-03-01' = if (hasRelease && deployApps) {
  name: webAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: registryAccess
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          env: [
            {
              // The api app's in-environment address (internal ingress, port 80).
              name: 'API_UPSTREAM'
              value: 'http://${apiAppName}'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              periodSeconds: 15
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: webMinReplicas
        maxReplicas: webMaxReplicas
        rules: [
          {
            name: 'http-load'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    registryPull
    apiApp
  ]
}

output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output containerEnvironmentName string = containerEnvironment.name
output apiAppName string = apiAppName
output webAppName string = webAppName
output migrateJobName string = migrateJobName
output postgresServerName string = postgres.name
output keyVaultName string = vault.name
output ssoRedirectUri string = '${webOrigin}/api/auth/sso/callback'
output webUrl string = hasRelease && deployApps ? 'https://${webApp!.properties.configuration.ingress.fqdn}' : ''
