param location string
param environmentName string
param namePrefix string
param uniqueSuffix string
param postgresAdminUsername string
@secure()
param postgresAdminPassword string
param postgresDatabaseName string
param postgresSkuName string
param postgresTier string
param storageAccountSku string
param fileShareQuotaGiB int
param redisSkuName string
param redisSkuFamily string
param redisSkuCapacity int
@secure()
param jwtSecret string

var baseSlug = toLower('${namePrefix}-${environmentName}-${uniqueSuffix}')
var logAnalyticsWorkspaceName = 'log-${baseSlug}'
var appInsightsName = 'appi-${baseSlug}'
var keyVaultName = take('kv-${baseSlug}', 24)
var storageAccountName = take(replace(toLower('${namePrefix}${environmentName}${uniqueSuffix}sa'), '-', ''), 24)
var fileShareName = 'uploads'
var postgresServerName = take('psql-${baseSlug}', 63)
var redisName = take('redis-${baseSlug}', 63)

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    enableRbacAuthorization: true
    enabledForDeployment: true
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    publicNetworkAccess: 'Enabled'
    softDeleteRetentionInDays: 7
  }
}

resource jwtSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'jwt-secret'
  parent: keyVault
  properties: {
    value: jwtSecret
  }
}

resource postgresPasswordSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'postgres-admin-password'
  parent: keyVault
  properties: {
    value: postgresAdminPassword
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: storageAccountSku
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
    encryption: {
      keySource: 'Microsoft.Storage'
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
    }
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2024-01-01' = {
  name: 'default'
  parent: storageAccount
}

resource uploadsShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2024-01-01' = {
  name: fileShareName
  parent: fileService
  properties: {
    accessTier: 'TransactionOptimized'
    shareQuota: fileShareQuotaGiB
  }
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSkuName
    tier: postgresTier
  }
  properties: {
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  name: postgresDatabaseName
  parent: postgresServer
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource postgresFirewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  name: 'AllowAzureServices'
  parent: postgresServer
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource redis 'Microsoft.Cache/Redis@2024-11-01' = {
  name: redisName
  location: location
  properties: {
    sku: {
      name: redisSkuName
      family: redisSkuFamily
      capacity: redisSkuCapacity
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    redisVersion: '6'
  }
}

output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name
output logAnalyticsCustomerId string = logAnalyticsWorkspace.properties.customerId
@secure()
output logAnalyticsSharedKey string = listKeys(logAnalyticsWorkspace.id, logAnalyticsWorkspace.apiVersion).primarySharedKey
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output storageAccountName string = storageAccount.name
@secure()
output storageAccountKey string = listKeys(storageAccount.id, storageAccount.apiVersion).keys[0].value
output fileShareName string = uploadsShare.name
output postgresServerName string = postgresServer.name
output postgresFqdn string = postgresServer.properties.fullyQualifiedDomainName
output postgresDatabaseName string = postgresDatabase.name
output postgresAdministratorLogin string = postgresAdminUsername
output redisName string = redis.name
output redisHostName string = redis.properties.hostName
@secure()
output redisPrimaryKey string = listKeys(redis.id, redis.apiVersion).primaryKey
output redisSslPort int = redis.properties.sslPort

