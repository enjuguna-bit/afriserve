$ErrorActionPreference = "Stop"

$LOCATION = "southafricanorth"
$SUFFIX = "afsrv26"
$INFRA_RG = "rg-$SUFFIX"
$APP_RG = "afriserve-prod-rg"
$DB_SERVER = "db-$SUFFIX"
$REDIS_NAME = "redis-$SUFFIX"
$ACR_NAME = "afriserveacr88665"
$ACR_RG = "AfriserveMicrofinance"
$CAE_NAME = "afriserve-prod-env"
$CAE_RG = $APP_RG
$APP_NAME = "ca-$SUFFIX"
$DB_USER = "afdbadmin"
$DB_PASS = "Afriserve#2026Secure!"
$DB_NAME = "afriserve"

Write-Host "Getting Redis Key..."
$REDIS_KEY = az redis list-keys --name $REDIS_NAME --resource-group $INFRA_RG --query primaryKey -o tsv
$REDIS_URL = "rediss://`:$($REDIS_KEY)@$REDIS_NAME.redis.cache.windows.net:6380"

$DATABASE_URL = "postgresql://$DB_USER`:$DB_PASS@$DB_SERVER.postgres.database.azure.com:5432/$DB_NAME?sslmode=require"

$JWT_SECRET = -join ((48..57) + (97..122) | Get-Random -Count 32 | % {[char]$_})

Write-Host "Getting ACR Credentials..."
$ACR_USER = az acr credential show --name $ACR_NAME --resource-group $ACR_RG --query username -o tsv
$ACR_PASS = az acr credential show --name $ACR_NAME --resource-group $ACR_RG --query "passwords[0].value" -o tsv

Write-Host "Resolving Container App Environment ID..."
$CAE_ID = az containerapp env show --name $CAE_NAME --resource-group $CAE_RG --query id -o tsv

$IMAGE = "$ACR_NAME.azurecr.io/afriserve-api:latest"

Write-Host "Building Docker Image in ACR..."
az acr build --registry $ACR_NAME --image afriserve-api:latest .

Write-Host "Creating Base Container App..."
az containerapp create `
  --name $APP_NAME `
  --resource-group $APP_RG `
  --environment $CAE_ID `
  --image $IMAGE `
  --target-port 3000 `
  --ingress external `
  --registry-server "$ACR_NAME.azurecr.io" `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --secrets database-url="$DATABASE_URL" redis-url="$REDIS_URL" jwt-secret="$JWT_SECRET" `
  --env-vars NODE_ENV=production PORT=3000 DB_CLIENT=postgres "DATABASE_URL=secretref:database-url" "JWT_SECRET=secretref:jwt-secret" TRUST_PROXY=true HTTPS_ENFORCE_IN_PRODUCTION=true HTTPS_TRUST_FORWARDED_PROTO=true ALLOW_CONSOLE_RESET_TOKENS=false "AUTH_TOKEN_STORE_REDIS_URL=secretref:redis-url" "AUTH_SESSION_CACHE_REDIS_URL=secretref:redis-url" "RATE_LIMIT_REDIS_URL=secretref:redis-url" JOB_QUEUE_ENABLED=true "JOB_QUEUE_REDIS_URL=secretref:redis-url" REPORT_CACHE_ENABLED=true "REPORT_CACHE_REDIS_URL=secretref:redis-url" UPLOAD_STORAGE_DRIVER=local UPLOAD_LOCAL_DIR=/app/data/uploads

Write-Host "Updating Container App with Azure Files volume using JSON..."
$jsonPath = "app.json"
az containerapp show --name $APP_NAME --resource-group $APP_RG --output json > $jsonPath

$appJson = Get-Content $jsonPath -Raw | ConvertFrom-Json
$vol = @{ name = "uploads-volume"; storageName = "afriserve-uploads"; storageType = "AzureFile" }

if (-not $appJson.properties.template.volumes) {
    $appJson.properties.template.volumes = @($vol)
} else {
    $appJson.properties.template.volumes += $vol
}

$mount = @{ volumeName = "uploads-volume"; mountPath = "/app/data/uploads" }
if (-not $appJson.properties.template.containers[0].volumeMounts) {
    $appJson.properties.template.containers[0].volumeMounts = @($mount)
} else {
    $appJson.properties.template.containers[0].volumeMounts += $mount
}

$appJson | ConvertTo-Json -Depth 10 | Out-File $jsonPath -Encoding ASCII
az containerapp update --name $APP_NAME --resource-group $APP_RG --yaml $jsonPath

Write-Host "Deployment completed!"






