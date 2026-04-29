# Azure Bicep Deployment Runbook

## Foundation

1. Install Bicep CLI if needed:
   `az bicep install`
2. Validate the foundation template:
   `az deployment group validate --resource-group <rg> --template-file infra/main.bicep --parameters @infra/main.parameters.json location=southafricanorth environmentName=dev namePrefix=afriserve postgresAdminUsername=afriadmin postgresAdminPassword=<secret> jwtSecret=<secret>`
3. Deploy the foundation template:
   `az deployment group create --resource-group <rg> --template-file infra/main.bicep --parameters @infra/main.parameters.json location=southafricanorth environmentName=dev namePrefix=afriserve postgresAdminUsername=afriadmin postgresAdminPassword=<secret> jwtSecret=<secret>`

## Container Apps

1. Build the runtime image in ACR:
   `az acr build --registry <acr-name> --image afriservebackend:<tag> .`
2. Validate the application template:
   `az deployment group validate --resource-group <rg> --template-file infra/apps.bicep --parameters location=southafricanorth environmentName=dev namePrefix=afriserve uniqueSuffix=<suffix> containerEnvironmentId=<env-id> acrName=<acr-name> acrLoginServer=<acr-login-server> uploadsStorageName=uploads imageRepository=afriservebackend imageTag=<tag> databaseUrl=<postgres-url> redisUrl=<redis-url> jwtSecret=<secret>`
3. Deploy the application template.
4. Patch the deployed web app with its final public URL for CORS and upload URL generation.
5. Smoke test `https://<fqdn>/health` and `https://<fqdn>/ready`.

## One-command rollout

Run:
`powershell -ExecutionPolicy Bypass -File scripts/azure-deploy.ps1`

The script provisions the foundation, builds and pushes the image, deploys the web and worker container apps, updates the final public URLs, and writes `.azure/deployment-output.json`.

## Rollback

- If the foundation deployment fails, rerun `az deployment group validate` after fixing the Bicep issue.
- If the application deployment fails after foundation succeeds, fix `infra/apps.bicep` and rerun only the app deployment section or rerun `scripts/azure-deploy.ps1`.
- To remove the deployment entirely, delete the resource group:
  `az group delete --name <rg> --yes --no-wait`
