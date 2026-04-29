param location string
param environmentName string
param namePrefix string
param uniqueSuffix string
param acrSku string
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param storageAccountName string
@secure()
param storageAccountKey string
param fileShareName string

var baseSlug = toLower('${namePrefix}-${environmentName}-${uniqueSuffix}')
var acrName = take(replace(toLower('acr${namePrefix}${environmentName}${uniqueSuffix}'), '-', ''), 50)
var containerEnvironmentName = take('cae-${baseSlug}', 32)
var uploadsStorageName = 'uploads'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: acrSku
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: containerEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    zoneRedundant: false
  }
}

resource uploadsStorage 'Microsoft.App/managedEnvironments/storages@2025-01-01' = {
  name: uploadsStorageName
  parent: containerEnvironment
  properties: {
    azureFile: {
      accessMode: 'ReadWrite'
      accountKey: storageAccountKey
      accountName: storageAccountName
      shareName: fileShareName
    }
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output containerEnvironmentId string = containerEnvironment.id
output containerEnvironmentName string = containerEnvironment.name
output uploadsStorageName string = uploadsStorage.name
