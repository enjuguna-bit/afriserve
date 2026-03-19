$locations = @("southcentralus", "eastus2", "centralus", "northeurope", "westeurope", "australiaeast", "japaneast", "brazilsouth", "canadacentral", "uksouth", "koreacentral", "francecentral")

$RG = "rg-afsrv26"
$DB_SERVER = "db-afsrv26"
$DB_USER = "afdbadmin"
$DB_PASS = "Afriserve#2026Secure!"
$DB_NAME = "afriserve"

az group create --name $RG --location eastus -o none

foreach ($loc in $locations) {
    Write-Host "Trying location: $loc"
    $output = az postgres flexible-server create --resource-group $RG --name $DB_SERVER --location $loc --admin-user $DB_USER --admin-password $DB_PASS --sku-name Standard_B1ms --tier Burstable --version 16 --storage-size 32 --yes 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS! Created in $loc"
        az postgres flexible-server db create --resource-group $RG --server-name $DB_SERVER --database-name $DB_NAME -o none
        break
    } else {
        Write-Host "Failed in $loc"
    }
}
