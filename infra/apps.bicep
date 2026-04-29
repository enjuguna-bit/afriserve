param location string = resourceGroup().location
param environmentName string = 'dev'
param namePrefix string = 'afriserve'
param uniqueSuffix string
param containerEnvironmentId string
param acrName string
param acrLoginServer string
param uploadsStorageName string = 'uploads'
param imageRepository string = 'afriservebackend'
param imageTag string
@secure()
param databaseUrl string
@secure()
param redisUrl string
@secure()
param jwtSecret string
param corsOrigins string = 'https://placeholder.invalid'
// Set to 'false' only when the frontend is deployed on a separate origin.
// When frontend and API share the same Container App (co-hosted), direct
// browser navigation sends no Origin header and this must be 'true'.
param corsAllowNoOrigin string = 'true'
param apiBaseUrl string = 'https://placeholder.invalid/api'
param uploadPublicBaseUrl string = 'https://placeholder.invalid/uploads'
param webCpu string = '1'
param webMemory string = '2Gi'
param workerCpu string = '0.5'
param workerMemory string = '1Gi'
param webMinReplicas int = 1
param webMaxReplicas int = 2
param workerMinReplicas int = 1
param workerMaxReplicas int = 1

var webAppName = take('aca-${namePrefix}-${environmentName}-web-${uniqueSuffix}', 32)
var workerAppName = take('aca-${namePrefix}-${environmentName}-worker-${uniqueSuffix}', 32)
var imageReference = '${acrLoginServer}/${imageRepository}:${imageTag}'
var containerEnvironmentName = last(split(containerEnvironmentId, '/'))
var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: containerEnvironmentName
}

resource webApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'redis-url'
          value: redisUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: imageReference
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'DB_CLIENT'
              value: 'postgres'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'AUTH_TOKEN_STORE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'AUTH_SESSION_CACHE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'RATE_LIMIT_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'JOB_QUEUE_ENABLED'
              value: 'true'
            }
            {
              name: 'JOB_QUEUE_ROLE'
              value: 'scheduler'
            }
            {
              name: 'JOB_QUEUE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'TRUST_PROXY'
              value: 'true'
            }
            {
              name: 'HTTPS_ENFORCE_IN_PRODUCTION'
              value: 'true'
            }
            {
              name: 'HTTPS_TRUST_FORWARDED_PROTO'
              value: 'true'
            }
            {
              name: 'ALLOW_CONSOLE_RESET_TOKENS'
              value: 'false'
            }
            {
              name: 'REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL'
              value: 'true'
            }
            {
              name: 'DEFAULT_TENANT_ID'
              value: 'default'
            }
            {
              name: 'UPLOAD_STORAGE_DRIVER'
              value: 'local'
            }
            {
              name: 'UPLOAD_LOCAL_DIR'
              value: '/app/data/uploads'
            }
            {
              name: 'UPLOAD_PUBLIC_BASE_URL'
              value: uploadPublicBaseUrl
            }
            {
              name: 'API_BASE_URL'
              value: apiBaseUrl
            }
            {
              name: 'CORS_ORIGINS'
              value: corsOrigins
            }
            {
              name: 'CORS_ALLOW_NO_ORIGIN'
              value: corsAllowNoOrigin
            }
            {
              name: 'REPORT_CACHE_ENABLED'
              value: 'false'
            }
            {
              name: 'ACCOUNTING_GL_CONSUMER_ENABLED'
              value: 'false'
            }
            {
              name: 'EVENT_BROKER_PROVIDER'
              value: 'none'
            }
            {
              name: 'MOBILE_MONEY_PROVIDER'
              value: 'mock'
            }
            {
              name: 'MOBILE_MONEY_C2B_ENABLED'
              value: 'false'
            }
            {
              name: 'MOBILE_MONEY_B2C_ENABLED'
              value: 'false'
            }
            {
              name: 'MOBILE_MONEY_STK_ENABLED'
              value: 'false'
            }
            {
              name: 'OTEL_SERVICE_NAME'
              value: 'afriserve-api'
            }
            {
              name: 'LOG_LEVEL'
              value: 'info'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3000
              }
              initialDelaySeconds: 15
              periodSeconds: 20
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: {
            cpu: json(webCpu)
            memory: webMemory
          }
          volumeMounts: [
            {
              volumeName: 'uploads'
              mountPath: '/app/data/uploads'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'uploads'
          storageType: 'AzureFile'
          storageName: uploadsStorageName
        }
      ]
      scale: {
        minReplicas: webMinReplicas
        maxReplicas: webMaxReplicas
      }
    }
  }
}

resource workerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: workerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: acrLoginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'redis-url'
          value: redisUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: imageReference
          command: [
            'node'
            'dist/src/worker.js'
          ]
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'DB_CLIENT'
              value: 'postgres'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'AUTH_TOKEN_STORE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'AUTH_SESSION_CACHE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'RATE_LIMIT_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'JOB_QUEUE_ENABLED'
              value: 'true'
            }
            {
              name: 'JOB_QUEUE_ROLE'
              value: 'worker'
            }
            {
              name: 'JOB_QUEUE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'DEFAULT_TENANT_ID'
              value: 'default'
            }
            {
              name: 'UPLOAD_STORAGE_DRIVER'
              value: 'local'
            }
            {
              name: 'UPLOAD_LOCAL_DIR'
              value: '/app/data/uploads'
            }
            {
              name: 'REPORT_CACHE_ENABLED'
              value: 'false'
            }
            {
              name: 'ACCOUNTING_GL_CONSUMER_ENABLED'
              value: 'false'
            }
            {
              name: 'EVENT_BROKER_PROVIDER'
              value: 'none'
            }
            {
              name: 'MOBILE_MONEY_PROVIDER'
              value: 'mock'
            }
            {
              name: 'MOBILE_MONEY_C2B_ENABLED'
              value: 'false'
            }
            {
              name: 'MOBILE_MONEY_B2C_ENABLED'
              value: 'false'
            }
            {
              name: 'MOBILE_MONEY_STK_ENABLED'
              value: 'false'
            }
            {
              name: 'OTEL_SERVICE_NAME'
              value: 'afriserve-queue-worker'
            }
            {
              name: 'LOG_LEVEL'
              value: 'info'
            }
          ]
          resources: {
            cpu: json(workerCpu)
            memory: workerMemory
          }
          volumeMounts: [
            {
              volumeName: 'uploads'
              mountPath: '/app/data/uploads'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'uploads'
          storageType: 'AzureFile'
          storageName: uploadsStorageName
        }
      ]
      scale: {
        minReplicas: workerMinReplicas
        maxReplicas: workerMaxReplicas
      }
    }
  }
}

// Grant web and worker managed identities the AcrPull role so they can pull
// images without admin credentials. ARM creates the identity when the
// container app resource is created, then processes role assignments before
// the first revision activates.
resource webAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, webApp.id, acrPullRoleDefinitionId)
  scope: acr
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, workerApp.id, acrPullRoleDefinitionId)
  scope: acr
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: workerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output webAppName string = webApp.name
output webAppFqdn string = webApp.properties.configuration.ingress.fqdn
output workerAppName string = workerApp.name
