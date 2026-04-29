param(
  [string]$SubscriptionId = '5dd22bbf-548f-4b9e-bcfc-5be366d6dbbe',
  [string]$Location = 'southafricanorth',
  [string]$EnvironmentName = 'dev',
  [string]$NamePrefix = 'afriserve',
  [string]$ResourceGroupName = 'rg-afriserve-dev-san',
  [string]$ImageRepository = 'afriservebackend',
  [string]$ImageTag = '',
  [string]$PostgresAdminUsername = 'afriadmin',
  [string]$PostgresAdminPassword = '',
  [string]$JwtSecret = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function New-HexSecret {
  param([int]$Bytes = 32)
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($buffer) -replace '-', '').ToLowerInvariant()
}

function New-StrongPassword {
  $base = New-HexSecret -Bytes 24
  return "$base`Aa!1"
}

function Assert-LastExitCode {
  param([Parameter(Mandatory = $true)][string]$Step)

  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI step failed: $Step (exit code $LASTEXITCODE)"
  }
}

function Wait-ForHttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 900,
    [int]$DelaySeconds = 10
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds $DelaySeconds
      continue
    }

    Start-Sleep -Seconds $DelaySeconds
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for successful HTTP response from $Url"
}

function Wait-ForAcrImage {
  param(
    [Parameter(Mandatory = $true)][string]$RegistryName,
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$Tag,
    [int]$TimeoutSeconds = 3600,
    [int]$DelaySeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $imageName = "$Repository`:$Tag"
  do {
    $tags = az acr repository show-tags `
      --name $RegistryName `
      --repository $Repository `
      --top 200 `
      --orderby time_desc `
      --output json | ConvertFrom-Json
    Assert-LastExitCode "query ACR tags for $imageName"

    if ($tags -contains $Tag) {
      return
    }

    $runs = az acr task list-runs `
      --registry $RegistryName `
      --image $imageName `
      --top 1 `
      --output json | ConvertFrom-Json
    Assert-LastExitCode "query ACR runs for $imageName"

    if ($runs.Count -gt 0) {
      $latestRun = $runs[0]
      $status = [string]$latestRun.status
      if ($status -in @('Canceled', 'Error', 'Failed', 'Timeout')) {
        $runSummary = $latestRun | ConvertTo-Json -Compress -Depth 6
        throw "ACR build failed for $imageName with status '$status'. Latest run: $runSummary"
      }
    }

    Start-Sleep -Seconds $DelaySeconds
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $imageName to appear in ACR $RegistryName"
}

function Test-AcrImageExists {
  param(
    [Parameter(Mandatory = $true)][string]$RegistryName,
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$Tag
  )

  $tags = az acr repository show-tags `
    --name $RegistryName `
    --repository $Repository `
    --top 200 `
    --orderby time_desc `
    --output json | ConvertFrom-Json
  Assert-LastExitCode "query ACR tags for ${Repository}:$Tag"

  return $tags -contains $Tag
}

if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  $ImageTag = Get-Date -Format 'yyyyMMddHHmmss'
}

if ([string]::IsNullOrWhiteSpace($PostgresAdminPassword)) {
  $PostgresAdminPassword = New-StrongPassword
}

if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
  $JwtSecret = New-HexSecret -Bytes 64
}

Write-Host "[azure] selecting subscription $SubscriptionId"
az account set --subscription $SubscriptionId | Out-Null
Assert-LastExitCode "select subscription $SubscriptionId"

Write-Host "[azure] ensuring resource group $ResourceGroupName in $Location"
az group create --name $ResourceGroupName --location $Location --output none
Assert-LastExitCode "ensure resource group $ResourceGroupName"

Write-Host "[azure] validating foundation template"
az deployment group validate `
  --resource-group $ResourceGroupName `
  --template-file infra/main.bicep `
  --parameters @infra/main.parameters.json `
  location=$Location `
  environmentName=$EnvironmentName `
  namePrefix=$NamePrefix `
  postgresAdminUsername=$PostgresAdminUsername `
  postgresAdminPassword=$PostgresAdminPassword `
  jwtSecret=$JwtSecret `
  --output none
Assert-LastExitCode "validate foundation template"

Write-Host "[azure] deploying foundation resources"
$foundationOutputs = az deployment group create `
  --resource-group $ResourceGroupName `
  --name foundation-$EnvironmentName `
  --template-file infra/main.bicep `
  --parameters @infra/main.parameters.json `
  location=$Location `
  environmentName=$EnvironmentName `
  namePrefix=$NamePrefix `
  postgresAdminUsername=$PostgresAdminUsername `
  postgresAdminPassword=$PostgresAdminPassword `
  jwtSecret=$JwtSecret `
  --query properties.outputs `
  --output json | ConvertFrom-Json
Assert-LastExitCode "deploy foundation resources"

$acrName = $foundationOutputs.acrName.value
$acrLoginServer = $foundationOutputs.acrLoginServer.value
$containerEnvironmentId = $foundationOutputs.containerEnvironmentId.value
$containerEnvironmentName = $foundationOutputs.containerEnvironmentName.value
$uploadsStorageName = $foundationOutputs.uploadsStorageName.value
$uniqueSuffix = $foundationOutputs.uniqueSuffix.value
$postgresFqdn = $foundationOutputs.postgresFqdn.value
$postgresDatabaseName = $foundationOutputs.postgresDatabaseName.value
$redisHostName = $foundationOutputs.redisHostName.value
$redisSslPort = $foundationOutputs.redisSslPort.value
$redisPrimaryKey = $foundationOutputs.redisPrimaryKey.value

$encodedPgPassword = [System.Uri]::EscapeDataString($PostgresAdminPassword)
$encodedRedisKey = [System.Uri]::EscapeDataString($redisPrimaryKey)
$databaseUrl = "postgresql://${PostgresAdminUsername}:$encodedPgPassword@${postgresFqdn}:5432/${postgresDatabaseName}?sslmode=require"
$redisUrl = "rediss://`:$encodedRedisKey@$redisHostName`:$redisSslPort"

if (Test-AcrImageExists -RegistryName $acrName -Repository $ImageRepository -Tag $ImageTag) {
  Write-Host "[azure] reusing existing image ${ImageRepository}:$ImageTag from ACR $acrName"
} else {
  Write-Host "[azure] building image ${ImageRepository}:$ImageTag in ACR $acrName"
  az acr build `
    --registry $acrName `
    --image "$ImageRepository`:$ImageTag" `
    --no-logs `
    --output none `
    .
  Assert-LastExitCode "queue ACR image build"

  Write-Host "[azure] waiting for image ${ImageRepository}:$ImageTag to be available in ACR"
  Wait-ForAcrImage -RegistryName $acrName -Repository $ImageRepository -Tag $ImageTag
}

Write-Host "[azure] validating container apps template"
az deployment group validate `
  --resource-group $ResourceGroupName `
  --template-file infra/apps.bicep `
  --parameters `
    location=$Location `
    environmentName=$EnvironmentName `
    namePrefix=$NamePrefix `
    uniqueSuffix=$uniqueSuffix `
    containerEnvironmentId=$containerEnvironmentId `
    acrName=$acrName `
    acrLoginServer=$acrLoginServer `
    uploadsStorageName=$uploadsStorageName `
    imageRepository=$ImageRepository `
    imageTag=$ImageTag `
    databaseUrl=$databaseUrl `
    redisUrl=$redisUrl `
    jwtSecret=$JwtSecret `
  --output none
Assert-LastExitCode "validate container apps template"

Write-Host "[azure] deploying container apps"
$appOutputs = az deployment group create `
  --resource-group $ResourceGroupName `
  --name apps-$EnvironmentName `
  --template-file infra/apps.bicep `
  --parameters `
    location=$Location `
    environmentName=$EnvironmentName `
    namePrefix=$NamePrefix `
    uniqueSuffix=$uniqueSuffix `
    containerEnvironmentId=$containerEnvironmentId `
    acrName=$acrName `
    acrLoginServer=$acrLoginServer `
    uploadsStorageName=$uploadsStorageName `
    imageRepository=$ImageRepository `
    imageTag=$ImageTag `
    databaseUrl=$databaseUrl `
    redisUrl=$redisUrl `
    jwtSecret=$JwtSecret `
  --query properties.outputs `
  --output json | ConvertFrom-Json
Assert-LastExitCode "deploy container apps"

$webAppName = $appOutputs.webAppName.value
$workerAppName = $appOutputs.workerAppName.value
$webAppFqdn = $appOutputs.webAppFqdn.value
$webUrl = "https://$webAppFqdn"

Write-Host "[azure] patching final public URLs into web app"
az containerapp update `
  --name $webAppName `
  --resource-group $ResourceGroupName `
  --set-env-vars `
    "CORS_ORIGINS=$webUrl" `
    "API_BASE_URL=$webUrl/api" `
    "UPLOAD_PUBLIC_BASE_URL=$webUrl/uploads" `
  --output none
Assert-LastExitCode "patch final public URLs into $webAppName"

Write-Host "[azure] waiting for health endpoint"
Wait-ForHttpOk -Url "$webUrl/health" -TimeoutSeconds 1200 -DelaySeconds 15 | Out-Null
Wait-ForHttpOk -Url "$webUrl/ready" -TimeoutSeconds 600 -DelaySeconds 15 | Out-Null

$result = [pscustomobject]@{
  resourceGroup = $ResourceGroupName
  location = $Location
  containerEnvironment = $containerEnvironmentName
  acrName = $acrName
  webAppName = $webAppName
  workerAppName = $workerAppName
  webUrl = $webUrl
  healthUrl = "$webUrl/health"
  readyUrl = "$webUrl/ready"
  postgresFqdn = $postgresFqdn
  postgresDatabaseName = $postgresDatabaseName
  redisHostName = $redisHostName
  image = "$acrLoginServer/${ImageRepository}:$ImageTag"
}

$result | ConvertTo-Json -Depth 4 | Set-Content .azure\deployment-output.json
$result | ConvertTo-Json -Depth 4

