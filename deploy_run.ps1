$ErrorActionPreference = "Continue"
$logFile = "C:\AfriserveBackend\deploy_live.log"
$AzCli = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
"[START] $(Get-Date)" | Out-File $logFile

function Log($msg) { "$(Get-Date -Format 'HH:mm:ss') $msg" | Tee-Object -FilePath $logFile -Append | Write-Host }

function Resolve-ResourceName {
    param(
        [string]$ResourceGroup,
        [string]$Type,
        [string]$NamePrefix
    )

    $resources = & $AzCli resource list --resource-group $ResourceGroup -o json | ConvertFrom-Json
    $match = $resources |
        Where-Object { $_.type -eq $Type -and $_.name -like "$NamePrefix*" } |
        Sort-Object -Property name |
        Select-Object -Last 1

    if (-not $match) {
        throw "Unable to find Azure resource of type '$Type' with prefix '$NamePrefix' in resource group '$ResourceGroup'."
    }

    return ([string]$match.name).Trim()
}

function New-PostgresConnectionString {
    param(
        [string]$Host,
        [string]$Database,
        [string]$User,
        [string]$Password
    )

    $encodedUser = [uri]::EscapeDataString($User)
    $encodedPassword = [uri]::EscapeDataString($Password)
    return "postgresql://${encodedUser}:${encodedPassword}@${Host}:5432/${Database}?sslmode=require"
}

function New-RedisConnectionString {
    param(
        [string]$Host,
        [string]$Password
    )

    $encodedPassword = [uri]::EscapeDataString($Password)
    return "rediss://:${encodedPassword}@${Host}:6380"
}

Set-Location C:\AfriserveBackend

$LOCATION = "southafricanorth"
$SUFFIX = "afsrv26"
$APP_RG = "AfriserveMicrofinance"
$PLAN_NAME = "afriserve-api-plan"
$APP_NAME = "afriserve-app-afsrv26"
$DB_SERVER_PREFIX = "afriserve-pg-$SUFFIX"
$REDIS_NAME_PREFIX = "afriserve-redis-$SUFFIX"
$DB_USER = "afdbadmin"
$DB_PASS = ([string]$env:AFRISERVE_DB_PASSWORD).Trim()
$DB_NAME = "afriserve"

if (-not $DB_PASS) {
    throw "AFRISERVE_DB_PASSWORD must be set before running deploy_run.ps1."
}

Log "STEP 1: Ensuring resource group..."
& $AzCli group create --name $APP_RG --location $LOCATION -o none 2>&1 | Out-File $logFile -Append

Log "STEP 2: Creating App Service plan..."
& $AzCli appservice plan create --name $PLAN_NAME --resource-group $APP_RG --sku B1 --is-linux -o none 2>&1 | Out-File $logFile -Append

Log "STEP 3: Creating Web App: $APP_NAME"
& $AzCli webapp create --name $APP_NAME --resource-group $APP_RG --plan $PLAN_NAME --runtime "NODE:20-lts" -o none 2>&1 | Out-File $logFile -Append

Log "STEP 4: Resolving Postgres and Redis resources..."
$DB_SERVER = Resolve-ResourceName -ResourceGroup $APP_RG -Type "Microsoft.DBforPostgreSQL/flexibleServers" -NamePrefix $DB_SERVER_PREFIX
$REDIS_NAME = Resolve-ResourceName -ResourceGroup $APP_RG -Type "Microsoft.Cache/Redis" -NamePrefix $REDIS_NAME_PREFIX
$DB_HOST = ([string](& $AzCli postgres flexible-server show --resource-group $APP_RG --name $DB_SERVER --query fullyQualifiedDomainName -o tsv)).Trim()
$REDIS_KEY = ([string](& $AzCli redis list-keys --name $REDIS_NAME --resource-group $APP_RG --query primaryKey -o tsv)).Trim()

if (-not $DB_HOST) {
    throw "Unable to resolve the fully qualified domain name for Postgres server '$DB_SERVER'."
}

if (-not $REDIS_KEY) {
    throw "Unable to resolve the primary key for Redis cache '$REDIS_NAME'."
}

Log "Resolved Postgres server: $DB_SERVER"
Log "Resolved Redis cache: $REDIS_NAME"
$REDIS_URL = New-RedisConnectionString -Host "$REDIS_NAME.redis.cache.windows.net" -Password $REDIS_KEY
$DATABASE_URL = New-PostgresConnectionString -Host $DB_HOST -Database $DB_NAME -User $DB_USER -Password $DB_PASS
$JWT_SECRET = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

Log "STEP 5: Configuring App Settings..."
$settings = @(
    "SCM_DO_BUILD_DURING_DEPLOYMENT=true"
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE=true"
    "NODE_ENV=production"
    "PORT=8080"
    "DB_CLIENT=postgres"
    "DATABASE_URL=$DATABASE_URL"
    "PG_CONNECTION_TIMEOUT_MS=15000"
    "JWT_SECRET=$JWT_SECRET"
    "TRUST_PROXY=true"
    "HTTPS_ENFORCE_IN_PRODUCTION=true"
    "HTTPS_TRUST_FORWARDED_PROTO=true"
    "ALLOW_CONSOLE_RESET_TOKENS=false"
    "AUTH_TOKEN_STORE_REDIS_URL=$REDIS_URL"
    "AUTH_SESSION_CACHE_REDIS_URL=$REDIS_URL"
    "RATE_LIMIT_REDIS_URL=$REDIS_URL"
    "JOB_QUEUE_ENABLED=true"
    "JOB_QUEUE_REDIS_URL=$REDIS_URL"
    "JOB_QUEUE_DLQ_NAME=afriserve-system-jobs-dead-letter"
    "REPORT_CACHE_ENABLED=true"
    "REPORT_CACHE_REDIS_URL=$REDIS_URL"
    "UPLOAD_STORAGE_DRIVER=local"
    "UPLOAD_LOCAL_DIR=/home/data/uploads"
    "VITE_APP_ENV=production"
    "VITE_API_BASE_URL=/api"
    "VITE_API_TIMEOUT_MS=15000"
    "VITE_LOG_LEVEL=warn"
    "CORS_ALLOW_NO_ORIGIN=true"
)
& $AzCli webapp config appsettings set --name $APP_NAME --resource-group $APP_RG --settings $settings -o none 2>&1 | Out-File $logFile -Append

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
& $AzCli webapp deployment source config-zip --resource-group $APP_RG --name $APP_NAME --src deploy.zip 2>&1 | Out-File $logFile -Append

Log "DONE. App URL: https://$APP_NAME.azurewebsites.net"
"[END] $(Get-Date)" | Out-File $logFile -Append
