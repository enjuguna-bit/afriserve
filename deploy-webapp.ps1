$ErrorActionPreference = "Stop"

$LOCATION = "southafricanorth"
$SUFFIX = "afsrv26"
$INFRA_RG = "rg-$SUFFIX"
$APP_RG = "AfriserveMicrofinance"
$PLAN_NAME = "afriserve-api-plan"
$APP_NAME = "afriserve-app-afsrv26"
$DB_SERVER = "db-$SUFFIX"
$REDIS_NAME = "redis-$SUFFIX"
$DB_USER = "afdbadmin"
$DB_PASS = "Afriserve#2026Secure!"
$DB_NAME = "afriserve"

Write-Host "Ensuring resource group and plan..."
az group create --name $APP_RG --location $LOCATION -o none
az appservice plan create --name $PLAN_NAME --resource-group $APP_RG --sku B1 --is-linux -o none

Write-Host "Creating Web App: $APP_NAME"
az webapp create --name $APP_NAME --resource-group $APP_RG --plan $PLAN_NAME --runtime "NODE:20-lts" -o none

Write-Host "Preparing connection strings..."
$REDIS_KEY = az redis list-keys --name $REDIS_NAME --resource-group $INFRA_RG --query primaryKey -o tsv
$REDIS_URL = "rediss://`:$($REDIS_KEY)@$REDIS_NAME.redis.cache.windows.net:6380"
$DATABASE_URL = "postgresql://$DB_USER`:$DB_PASS@$DB_SERVER.postgres.database.azure.com:5432/$DB_NAME?sslmode=require"
$JWT_SECRET = -join ((48..57) + (97..122) | Get-Random -Count 32 | % {[char]$_})

Write-Host "Configuring App Settings..."
az webapp config appsettings set --name $APP_NAME --resource-group $APP_RG `
    --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true `
    WEBSITES_ENABLE_APP_SERVICE_STORAGE=true `
    NODE_ENV=production `
    PORT=8080 `
    DB_CLIENT=postgres `
    DATABASE_URL="$DATABASE_URL" `
    JWT_SECRET="$JWT_SECRET" `
    TRUST_PROXY=true `
    HTTPS_ENFORCE_IN_PRODUCTION=true `
    HTTPS_TRUST_FORWARDED_PROTO=true `
    ALLOW_CONSOLE_RESET_TOKENS=false `
    AUTH_TOKEN_STORE_REDIS_URL="$REDIS_URL" `
    AUTH_SESSION_CACHE_REDIS_URL="$REDIS_URL" `
    RATE_LIMIT_REDIS_URL="$REDIS_URL" `
    JOB_QUEUE_ENABLED=true `
    JOB_QUEUE_REDIS_URL="$REDIS_URL" `
    REPORT_CACHE_ENABLED=true `
    REPORT_CACHE_REDIS_URL="$REDIS_URL" `
    UPLOAD_STORAGE_DRIVER=local `
    UPLOAD_LOCAL_DIR=/home/data/uploads `
    VITE_APP_ENV=production `
    VITE_API_BASE_URL=/api `
    VITE_API_TIMEOUT_MS=15000 `
    VITE_LOG_LEVEL=warn `
    -o none

Write-Host "Staging source for zip deploy..."
$staging = "webapp-staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item -Path "src","scripts","frontend-next","public","prisma","package.json","package-lock.json","tsconfig.json","tsconfig.strict.json","eslint.config.js" -Destination $staging -Recurse
if (Test-Path "$staging\\frontend-next\\node_modules") { Remove-Item -Recurse -Force "$staging\\frontend-next\\node_modules" }
if (Test-Path "$staging\\frontend-next\\dist") { Remove-Item -Recurse -Force "$staging\\frontend-next\\dist" }

Write-Host "Zipping source code..."
if (Test-Path deploy.zip) { Remove-Item deploy.zip }
Compress-Archive -Path "$staging\\*" -DestinationPath deploy.zip -Force

Write-Host "Deploying to Azure Web App using ZipDeploy..."
az webapp deployment source config-zip --resource-group $APP_RG --name $APP_NAME --src deploy.zip

Write-Host "Deployment completed! App URL: https://$APP_NAME.azurewebsites.net"
