import { expect, test, type Page } from '@playwright/test'

const sharedPassword = process.env.E2E_SHARED_PASSWORD ?? '100+Twenty!'
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:4000/api'

function pathPattern(pathname: string) {
  return new RegExp(`${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[/?#])`)
}

async function bootstrapSession(page: Page, email: string) {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      email,
      password: sharedPassword,
    },
  })

  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { token: string; refreshToken?: string }

  await page.addInitScript(({ token, refreshToken }) => {
    window.sessionStorage.setItem('__afriserve_token', token)
    if (refreshToken) {
      window.sessionStorage.setItem('__afriserve_refresh_token', refreshToken)
    }
  }, payload)
}

async function signInAsLoanOfficer(page: Page) {
  await bootstrapSession(page, 'aleky@gmail.com')
  await page.goto('/dashboard')
  await expect(page).toHaveURL(pathPattern('/dashboard'))
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true, level: 1 })).toBeVisible()
}

async function signInAsBranchManager(page: Page) {
  await bootstrapSession(page, 'jenny@gmail.com')
  await page.goto('/dashboard')
  await expect(page).toHaveURL(pathPattern('/dashboard'))
  await expect(page.getByRole('heading', { name: 'Branch Manager Dashboard', exact: true, level: 1 })).toBeVisible()
}

test('loan officer can complete onboarding and create a loan', async ({ page }) => {
  const uniqueToken = `${Date.now()}`
  const clientName = `Officer Onboarding ${uniqueToken}`
  const nationalId = `E2E-${uniqueToken}`
  const phone = `+2547${uniqueToken.slice(-8)}`

  await signInAsLoanOfficer(page)

  await page.getByRole('button', { name: 'Borrowers', exact: true }).click()
  await page.getByRole('link', { name: 'All borrowers', exact: true }).click()
  await expect(page).toHaveURL(pathPattern('/clients'))
  await page.getByRole('link', { name: 'New borrower', exact: true }).click()
  await expect(page).toHaveURL(pathPattern('/clients/new'))
  await expect(page.getByRole('heading', { name: 'Create Client', exact: true })).toBeVisible()

  const createClientForm = page.locator('form').first()
  await createClientForm.getByRole('textbox', { name: 'Full name', exact: true }).fill(clientName)
  await createClientForm.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone)
  await createClientForm.getByRole('textbox', { name: 'National ID', exact: true }).fill(nationalId)
  await createClientForm.getByRole('textbox', { name: 'Business type', exact: true }).fill('Retail shop')
  await createClientForm.getByRole('spinbutton', { name: 'Business years', exact: true }).fill('3')
  await createClientForm.getByRole('textbox', { name: 'Residential address', exact: true }).fill('Molo town')
  await page.getByRole('button', { name: 'Create client', exact: true }).click()

  await expect(page).toHaveURL(/\/clients\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Customer 360', exact: true, level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: clientName, exact: true, level: 2 })).toBeVisible()

  await page.getByRole('button', { name: 'Actions', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Continue Onboarding', exact: true })).toBeVisible()
  await expect(page.getByText('KYC').first()).toBeVisible()
  await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible()

  const kycPanel = page.locator('details').filter({ has: page.getByText('Update KYC', { exact: true }) })
  await kycPanel.getByRole('combobox', { name: 'Status', exact: true }).selectOption('verified')
  await kycPanel.getByRole('textbox', { name: 'Note', exact: true }).fill('Officer completed KYC verification during E2E flow.')
  await page.getByRole('button', { name: 'Update KYC', exact: true }).click()
  await expect(page.getByText('Client KYC updated.', { exact: true })).toBeVisible()
  await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible()

  const guarantorPanel = page.locator('details').filter({ has: page.getByText('Add guarantor', { exact: true }) })
  await guarantorPanel.getByRole('textbox', { name: 'Full name', exact: true }).fill('Guarantor One')
  await guarantorPanel.getByRole('textbox', { name: 'Phone', exact: true }).fill('+254711000111')
  await guarantorPanel.getByRole('textbox', { name: 'National ID', exact: true }).fill(`G-${uniqueToken}`)
  await guarantorPanel.getByRole('spinbutton', { name: 'Monthly income', exact: true }).fill('55000')
  await page.getByRole('button', { name: 'Add guarantor', exact: true }).click()
  await expect(page.getByText('Guarantor added to client.', { exact: true })).toBeVisible()
  await expect(page.getByText('Guarantors').first()).toBeVisible()

  const collateralPanel = page.locator('details').filter({ has: page.getByText('Add collateral', { exact: true }) })
  await collateralPanel.getByRole('textbox', { name: 'Description', exact: true }).fill('Business stock collateral')
  await collateralPanel.getByRole('spinbutton', { name: 'Estimated value', exact: true }).fill('150000')
  await collateralPanel.getByRole('textbox', { name: 'Registration number', exact: true }).fill(`REG-${uniqueToken}`)
  await page.getByRole('button', { name: 'Add collateral', exact: true }).click()
  await expect(page.getByText('Collateral added to client.', { exact: true })).toBeVisible()

  const feePanel = page.locator('details').filter({ has: page.getByText('Record fee payment', { exact: true }) })
  await feePanel.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('500')
  await feePanel.getByRole('textbox', { name: 'Payment reference', exact: true }).fill(`FEE-${uniqueToken}`)
  await feePanel.getByRole('textbox', { name: 'Note', exact: true }).fill('Onboarding fee paid in branch.')
  await page.getByRole('button', { name: 'Record fee payment', exact: true }).click()
  await expect(page.getByText('Client fee payment recorded.', { exact: true })).toBeVisible()
  await expect(page.getByText('Yes', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Complete', { exact: true }).first()).toBeVisible()

  await page.getByRole('link', { name: 'Create loan for client', exact: true }).click()
  await expect(page).toHaveURL(/\/loans\/new\?clientId=\d+$/)
  await expect(page.getByRole('heading', { name: 'Create Loan', exact: true })).toBeVisible()
  await page.getByLabel('Principal').fill('3200')
  await page.getByLabel('Term weeks').fill('8')
  await page.getByLabel('Purpose').fill('Loan officer onboarding end-to-end test')
  await page.getByRole('button', { name: 'Create loan', exact: true }).click()

  await expect(page).toHaveURL(/\/loans\/\d+$/)
  await expect(page.getByRole('heading', { name: /Loan #\d+/ })).toBeVisible()
  await expect(page.getByText('KYC: Verified', { exact: false })).toBeVisible()
})

test('branch manager can approve and disburse the officer-created loan', async ({ browser }) => {
  const uniqueToken = `${Date.now()}`
  const clientName = `Officer Handoff ${uniqueToken}`
  const nationalId = `E2E-HANDOFF-${uniqueToken}`
  const phone = `+2547${uniqueToken.slice(-8)}`
  const officerPage = await browser.newPage()

  await signInAsLoanOfficer(officerPage)

  await officerPage.getByRole('button', { name: 'Borrowers', exact: true }).click()
  await officerPage.getByRole('link', { name: 'All borrowers', exact: true }).click()
  await expect(officerPage).toHaveURL(pathPattern('/clients'))
  await officerPage.getByRole('link', { name: 'New borrower', exact: true }).click()
  await expect(officerPage).toHaveURL(pathPattern('/clients/new'))

  const createClientForm = officerPage.locator('form').first()
  await createClientForm.getByRole('textbox', { name: 'Full name', exact: true }).fill(clientName)
  await createClientForm.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone)
  await createClientForm.getByRole('textbox', { name: 'National ID', exact: true }).fill(nationalId)
  await createClientForm.getByRole('textbox', { name: 'Business type', exact: true }).fill('Agrovet')
  await createClientForm.getByRole('spinbutton', { name: 'Business years', exact: true }).fill('4')
  await createClientForm.getByRole('textbox', { name: 'Residential address', exact: true }).fill('Molo market')
  await officerPage.getByRole('button', { name: 'Create client', exact: true }).click()

  await expect(officerPage).toHaveURL(/\/clients\/\d+$/)
  await officerPage.getByRole('button', { name: 'Actions', exact: true }).click()

  const kycPanel = officerPage.locator('details').filter({ has: officerPage.getByText('Update KYC', { exact: true }) })
  await kycPanel.getByRole('combobox', { name: 'Status', exact: true }).selectOption('verified')
  await kycPanel.getByRole('textbox', { name: 'Note', exact: true }).fill('Verified for manager handoff flow.')
  await officerPage.getByRole('button', { name: 'Update KYC', exact: true }).click()
  await expect(officerPage.getByText('Client KYC updated.', { exact: true })).toBeVisible()

  const guarantorPanel = officerPage.locator('details').filter({ has: officerPage.getByText('Add guarantor', { exact: true }) })
  await guarantorPanel.getByRole('textbox', { name: 'Full name', exact: true }).fill('Handoff Guarantor')
  await guarantorPanel.getByRole('textbox', { name: 'Phone', exact: true }).fill('+254711100222')
  await guarantorPanel.getByRole('textbox', { name: 'National ID', exact: true }).fill(`HG-${uniqueToken}`)
  await guarantorPanel.getByRole('spinbutton', { name: 'Monthly income', exact: true }).fill('65000')
  await officerPage.getByRole('button', { name: 'Add guarantor', exact: true }).click()
  await expect(officerPage.getByText('Guarantor added to client.', { exact: true })).toBeVisible()

  const collateralPanel = officerPage.locator('details').filter({ has: officerPage.getByText('Add collateral', { exact: true }) })
  await collateralPanel.getByRole('textbox', { name: 'Description', exact: true }).fill('Shop inventory stock')
  await collateralPanel.getByRole('spinbutton', { name: 'Estimated value', exact: true }).fill('175000')
  await collateralPanel.getByRole('textbox', { name: 'Registration number', exact: true }).fill(`REG-H-${uniqueToken}`)
  await officerPage.getByRole('button', { name: 'Add collateral', exact: true }).click()
  await expect(officerPage.getByText('Collateral added to client.', { exact: true })).toBeVisible()

  const feePanel = officerPage.locator('details').filter({ has: officerPage.getByText('Record fee payment', { exact: true }) })
  await feePanel.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('500')
  await feePanel.getByRole('textbox', { name: 'Payment reference', exact: true }).fill(`FEE-H-${uniqueToken}`)
  await feePanel.getByRole('textbox', { name: 'Note', exact: true }).fill('Fee recorded for handoff flow.')
  await officerPage.getByRole('button', { name: 'Record fee payment', exact: true }).click()
  await expect(officerPage.getByText('Client fee payment recorded.', { exact: true })).toBeVisible()

  await officerPage.getByRole('link', { name: 'Create loan for client', exact: true }).click()
  await expect(officerPage).toHaveURL(/\/loans\/new\?clientId=\d+$/)
  await officerPage.getByLabel('Principal').fill('4200')
  await officerPage.getByLabel('Term weeks').fill('10')
  await officerPage.getByLabel('Purpose').fill('Approval and disbursement handoff test')
  await officerPage.getByRole('button', { name: 'Create loan', exact: true }).click()

  await expect(officerPage).toHaveURL(/\/loans\/\d+$/)
  const createdLoanUrl = officerPage.url()
  const createdLoanId = Number(createdLoanUrl.match(/\/loans\/(\d+)/)?.[1] || 0)
  expect(createdLoanId).toBeGreaterThan(0)
  await officerPage.close()

  const managerPage = await browser.newPage()
  await signInAsBranchManager(managerPage)
  await managerPage.goto('/approvals')
  await expect(managerPage.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible()
  await expect(managerPage.getByText(clientName, { exact: false })).toBeVisible()

  const loanRow = managerPage.locator('tr').filter({ has: managerPage.getByText(`Loan #${createdLoanId}`, { exact: true }) }).first()
  await expect(loanRow).toBeVisible()
  await loanRow.getByRole('textbox').fill('Approved by branch manager in E2E handoff flow.')
  await loanRow.getByRole('button', { name: 'Approve loan', exact: true }).click()
  await expect(managerPage.getByText('Loan approved and routed to the next stage.', { exact: true })).toBeVisible()

  await managerPage.goto(`/loans/${createdLoanId}`)
  await expect(managerPage.getByRole('heading', { name: `Loan #${createdLoanId}`, exact: true })).toBeVisible()
  await expect(managerPage.getByText('Can disburse: Yes', { exact: true })).toBeVisible()

  const disburseCard = managerPage.locator('div').filter({ has: managerPage.getByRole('heading', { name: 'Disburse', exact: true }) }).first()
  await disburseCard.getByPlaceholder('Disbursement note').fill('Manager disbursement note for E2E handoff.')
  await disburseCard.getByRole('checkbox', { name: 'Final disbursement', exact: true }).check()
  await disburseCard.getByRole('button', { name: 'Disburse loan', exact: true }).click()
  await expect(managerPage.getByText('Disbursement submitted.', { exact: true })).toBeVisible()
  await expect(managerPage.getByText('Total disbursed:', { exact: false })).toBeVisible()
  await managerPage.close()
})