$ErrorActionPreference = "Stop"

$LOCATION = "southafricanorth"
$SUFFIX = "afsrv26"
$RG = "rg-$SUFFIX"
$DB_SERVER = "db-$SUFFIX"
$REDIS_NAME = "redis-$SUFFIX"
$STORAGE_ACC = "st$SUFFIX"
$ACR_NAME = "acr$SUFFIX"
$CAE_NAME = "cae-$SUFFIX"
$APP_NAME = "ca-$SUFFIX"
$DB_USER = "afdbadmin"
$DB_PASS = "Afriserve#2026Secure!"
$DB_NAME = "afriserve"

Write-Host "Creating Resource Group: $RG"
az group create --name $RG --location $LOCATION -o none

Write-Host "Creating PostgreSQL Flexible Server: $DB_SERVER"
az postgres flexible-server create --resource-group $RG --name $DB_SERVER --location $LOCATION --admin-user $DB_USER --admin-password $DB_PASS --sku-name Standard_B1ms --tier Burstable --version 16 --storage-size 32 --yes -o none

Write-Host "Creating PostgreSQL Database: $DB_NAME"
az postgres flexible-server db create --resource-group $RG --server-name $DB_SERVER --database-name $DB_NAME -o none

Write-Host "Creating Azure Cache for Redis: $REDIS_NAME"
az redis create --name $REDIS_NAME --resource-group $RG --location $LOCATION --sku Basic --vm-size c0 -o none

Write-Host "Creating Storage Account: $STORAGE_ACC"
az storage account create --name $STORAGE_ACC --resource-group $RG --location $LOCATION --sku Standard_LRS -o none

Write-Host "Getting Storage Account Key..."
$STORAGE_KEY = az storage account keys list --resource-group $RG --account-name $STORAGE_ACC --query "[0].value" --output tsv

Write-Host "Creating Storage Share 'uploads'"
az storage share create --name uploads --account-name $STORAGE_ACC --account-key $STORAGE_KEY -o none

Write-Host "Creating Azure Container Registry: $ACR_NAME"
az acr create --resource-group $RG --name $ACR_NAME --sku Basic --admin-enabled true -o none

Write-Host "Creating Azure Container Apps Environment: $CAE_NAME"
az containerapp env create --name $CAE_NAME --resource-group $RG --location $LOCATION -o none

Write-Host "Linking Storage Account to Container Apps Environment"
az containerapp env storage set --access-mode ReadWrite --azure-file-account-name $STORAGE_ACC --azure-file-account-key $STORAGE_KEY --azure-file-share-name uploads --storage-name afriserve-uploads --name $CAE_NAME --resource-group $RG -o none

Write-Host "Infrastructure provisioning script completed successfully."

