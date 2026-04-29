param location string = resourceGroup().location
param environmentName string = 'dev'
param namePrefix string = 'afriserve'
@secure()
param postgresAdminPassword string
@secure()
param jwtSecret string
param postgresAdminUsername string = 'afriadmin'
param postgresDatabaseName string = 'afriserve'
param postgresSkuName string = 'Standard_B1ms'
param postgresTier string = 'Burstable'
param storageAccountSku string = 'Standard_LRS'
param acrSku string = 'Basic'
param fileShareQuotaGiB int = 50
param redisSkuName string = 'Basic'
param redisSkuFamily string = 'C'
param redisSkuCapacity int = 0

var uniqueSuffix = take(uniqueString(subscription().subscriptionId, resourceGroup().id, location, environmentName, namePrefix), 6)

module dataServices './modules/data-services.bicep' = {
  name: 'data-services'
  params: {
    location: location
    environmentName: environmentName
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    postgresAdminUsername: postgresAdminUsername
    postgresAdminPassword: postgresAdminPassword
    postgresDatabaseName: postgresDatabaseName
    postgresSkuName: postgresSkuName
    postgresTier: postgresTier
    storageAccountSku: storageAccountSku
    fileShareQuotaGiB: fileShareQuotaGiB
    redisSkuName: redisSkuName
    redisSkuFamily: redisSkuFamily
    redisSkuCapacity: redisSkuCapacity
    jwtSecret: jwtSecret
  }
}

module containerPlatform './modules/container-platform.bicep' = {
  name: 'container-platform'
  params: {
    location: location
    environmentName: environmentName
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    acrSku: acrSku
    logAnalyticsCustomerId: dataServices.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: dataServices.outputs.logAnalyticsSharedKey
    storageAccountName: dataServices.outputs.storageAccountName
    storageAccountKey: dataServices.outputs.storageAccountKey
    fileShareName: dataServices.outputs.fileShareName
  }
}

output location string = location
output environmentName string = environmentName
output namePrefix string = namePrefix
output uniqueSuffix string = uniqueSuffix
output appInsightsConnectionString string = dataServices.outputs.appInsightsConnectionString
output appInsightsName string = dataServices.outputs.appInsightsName
output keyVaultName string = dataServices.outputs.keyVaultName
output keyVaultUri string = dataServices.outputs.keyVaultUri
output logAnalyticsWorkspaceName string = dataServices.outputs.logAnalyticsWorkspaceName
output postgresAdministratorLogin string = dataServices.outputs.postgresAdministratorLogin
output postgresDatabaseName string = dataServices.outputs.postgresDatabaseName
output postgresFqdn string = dataServices.outputs.postgresFqdn
output postgresServerName string = dataServices.outputs.postgresServerName
output redisHostName string = dataServices.outputs.redisHostName
output redisName string = dataServices.outputs.redisName
@secure()
output redisPrimaryKey string = dataServices.outputs.redisPrimaryKey
output redisSslPort int = dataServices.outputs.redisSslPort
output storageAccountName string = dataServices.outputs.storageAccountName
@secure()
output storageAccountKey string = dataServices.outputs.storageAccountKey
output fileShareName string = dataServices.outputs.fileShareName
output acrLoginServer string = containerPlatform.outputs.acrLoginServer
output acrName string = containerPlatform.outputs.acrName
output containerEnvironmentId string = containerPlatform.outputs.containerEnvironmentId
output containerEnvironmentName string = containerPlatform.outputs.containerEnvironmentName
output uploadsStorageName string = containerPlatform.outputs.uploadsStorageName
