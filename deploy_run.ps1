$ErrorActionPreference = "Continue"
$logFile = "C:\AfriserveBackend\deploy_live.log"
"[START] $(Get-Date)" | Out-File $logFile

function Log($msg) { "$(Get-Date -Format 'HH:mm:ss') $msg" | Tee-Object -FilePath $logFile -Append | Write-Host }

Set-Location C:\AfriserveBackend

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

Log "STEP 1: Ensuring resource group..."
cmd /c "az group create --name $APP_RG --location $LOCATION -o none 2>&1" | Out-File $logFile -Append

Log "STEP 2: Creating App Service plan..."
cmd /c "az appservice plan create --name $PLAN_NAME --resource-group $APP_RG --sku B1 --is-linux -o none 2>&1" | Out-File $logFile -Append

Log "STEP 3: Creating Web App: $APP_NAME"
cmd /c "az webapp create --name $APP_NAME --resource-group $APP_RG --plan $PLAN_NAME --runtime ""NODE:20-lts"" -o none 2>&1" | Out-File $logFile -Append

Log "STEP 4: Getting Redis key..."
$REDIS_KEY = cmd /c "az redis list-keys --name $REDIS_NAME --resource-group $INFRA_RG --query primaryKey -o tsv 2>&1"
$REDIS_KEY = $REDIS_KEY.Trim()
if ($REDIS_KEY -like "ERROR*" -or $REDIS_KEY -eq "") {
    Log "WARNING: Could not get Redis key: $REDIS_KEY"
    $REDIS_URL = "rediss://:placeholder@$REDIS_NAME.redis.cache.windows.net:6380"
} else {
    Log "Redis key retrieved OK"
    $REDIS_URL = "rediss://:$($REDIS_KEY)@$REDIS_NAME.redis.cache.windows.net:6380"
}
$DATABASE_URL = "postgresql://$DB_USER`:$DB_PASS@$DB_SERVER.postgres.database.azure.com:5432/$DB_NAME?sslmode=require"
$JWT_SECRET = -join ((48..57) + (97..122) | Get-Random -Count 32 | % {[char]$_})

Log "STEP 5: Configuring App Settings..."
$settingsCmd = "az webapp config appsettings set --name $APP_NAME --resource-group $APP_RG --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true WEBSITES_ENABLE_APP_SERVICE_STORAGE=true NODE_ENV=production PORT=8080 DB_CLIENT=postgres DATABASE_URL=""$DATABASE_URL"" JWT_SECRET=""$JWT_SECRET"" TRUST_PROXY=true HTTPS_ENFORCE_IN_PRODUCTION=true HTTPS_TRUST_FORWARDED_PROTO=true ALLOW_CONSOLE_RESET_TOKENS=false AUTH_TOKEN_STORE_REDIS_URL=""$REDIS_URL"" AUTH_SESSION_CACHE_REDIS_URL=""$REDIS_URL"" RATE_LIMIT_REDIS_URL=""$REDIS_URL"" JOB_QUEUE_ENABLED=true JOB_QUEUE_REDIS_URL=""$REDIS_URL"" REPORT_CACHE_ENABLED=true REPORT_CACHE_REDIS_URL=""$REDIS_URL"" UPLOAD_STORAGE_DRIVER=local UPLOAD_LOCAL_DIR=/home/data/uploads VITE_APP_ENV=production VITE_API_BASE_URL=/api VITE_API_TIMEOUT_MS=15000 VITE_LOG_LEVEL=warn -o none 2>&1"
cmd /c $settingsCmd | Out-File $logFile -Append

Log "STEP 6: Staging source files..."
$staging = "webapp-staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item -Path "src","scripts","frontend-next","public","prisma","package.json","package-lock.json","tsconfig.json","tsconfig.strict.json","eslint.config.js" -Destination $staging -Recurse
if (Test-Path "$staging\frontend-next\node_modules") { Remove-Item -Recurse -Force "$staging\frontend-next\node_modules" }
if (Test-Path "$staging\frontend-next\dist") { Remove-Item -Recurse -Force "$staging\frontend-next\dist" }
Log "Staging done."

Log "STEP 7: Zipping source..."
if (Test-Path deploy.zip) { Remove-Item deploy.zip }
Compress-Archive -Path "$staging\*" -DestinationPath deploy.zip -Force
$size = [math]::Round((Get-Item deploy.zip).Length / 1MB, 2)
Log "deploy.zip created: $size MB"

Log "STEP 8: Deploying zip to Azure..."
cmd /c "az webapp deployment source config-zip --resource-group $APP_RG --name $APP_NAME --src deploy.zip 2>&1" | Out-File $logFile -Append

Log "DONE. App URL: https://$APP_NAME.azurewebsites.net"
"[END] $(Get-Date)" | Out-File $logFile -Append
