import { expect, test, type Page } from '@playwright/test'

const sharedPassword = process.env.E2E_SHARED_PASSWORD ?? '100+Twenty!'
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:4000/api'

type RuntimeContext = {
  clientName?: string
  clientSearchValue?: string
}

type MenuExpectation = {
  parent?: string
  label: string
  path: string
  heading: string | RegExp
  afterNavigate?: (page: Page, runtime: RuntimeContext) => Promise<void>
}

type UserScenario = {
  name: string
  email: string
  visibleMenu: MenuExpectation[]
  hiddenTopLevel: string[]
  hiddenBorrowerItems?: string[]
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pathPattern(pathname: string) {
  return new RegExp(`${escapeForRegExp(pathname)}(?:$|[/?#])`)
}

function normalizeSearchCandidate(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === '-') {
    return null
  }
  return normalized
}

async function ensureSidebar(page: Page) {
  const sidebar = page.locator('aside').filter({ has: page.locator('nav') }).first()
  
  // Wait a moment for rendering to settle
  await page.waitForTimeout(500)
  
  if (await sidebar.isVisible()) {
    return sidebar
  }

  const toggleBtn = page.getByRole('button', { name: 'Toggle sidebar', exact: true })
  if (await toggleBtn.isVisible()) {
    await toggleBtn.click()
  }
  
  await expect(sidebar).toBeVisible()
  return sidebar
}

async function ensureBorrowersExpanded(page: Page, childLabel: string) {
  const sidebar = await ensureSidebar(page)
  const childLocator = sidebar.getByRole('link', { name: childLabel, exact: true })

  if (await childLocator.count() > 0 && await childLocator.first().isVisible()) {
    return sidebar
  }

  await sidebar.getByRole('button', { name: 'Borrowers', exact: true }).click()
  await expect(childLocator).toBeVisible()
  return sidebar
}

async function signIn(page: Page, email: string) {
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

  await page.goto('/dashboard')
  await expect(page).toHaveURL(pathPattern('/dashboard'))
}

async function expectHeading(page: Page, heading: string | RegExp) {
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
}

async function openMenuItem(page: Page, item: MenuExpectation) {
  const sidebar = item.parent ? await ensureBorrowersExpanded(page, item.label) : await ensureSidebar(page)

  const link = sidebar.getByRole('link', { name: item.label, exact: true })
  await expect(link).toBeVisible()
  await link.click()

  await expect(page).toHaveURL(pathPattern(item.path))
  await expectHeading(page, item.heading)
}

async function captureFirstClientName(page: Page, runtime: RuntimeContext) {
  const firstRow = page.locator('tbody tr').first()
  const firstClientName = firstRow.locator('td strong').first()
  await expect(firstClientName).toBeVisible()
  runtime.clientName = (await firstClientName.textContent())?.trim() || undefined

  const searchCandidate = normalizeSearchCandidate(await firstRow.locator('td').nth(2).textContent())
    || normalizeSearchCandidate(await firstRow.locator('td').nth(3).textContent())
    || normalizeSearchCandidate(await firstRow.locator('td').nth(0).locator('span').first().textContent())
    || normalizeSearchCandidate(runtime.clientName)
  runtime.clientSearchValue = searchCandidate || undefined

  expect(runtime.clientName).toBeTruthy()
  expect(runtime.clientSearchValue).toBeTruthy()
}

async function verifySearchFlow(page: Page, runtime: RuntimeContext) {
  const searchValue = runtime.clientSearchValue || runtime.clientName
  expect(searchValue).toBeTruthy()
  const searchInput = page.getByLabel('Search value')
  await searchInput.fill(String(searchValue))
  await expect(searchInput).toHaveValue(String(searchValue))
  await page.locator('form').getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(pathPattern('/search'))
  await expect(page.getByRole('heading', { name: 'Global Search', exact: true })).toBeVisible()
}

async function verifyReportGeneration(page: Page) {
  const reportSelect = page.getByRole('combobox', { name: 'Report', exact: true })
  const reportOptions = await reportSelect.locator('option').evaluateAll((options) => (
    options
      .map((option) => ({
        value: (option as HTMLOptionElement).value,
        label: option.textContent?.trim() || '',
      }))
      .filter((option) => option.value.trim() !== '')
  ))

  if (reportOptions.length === 0) {
    await expect(reportSelect).toHaveValue('')
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click()
    await expect(page.getByText('Select a report before generating.', { exact: true })).toBeVisible()
    return
  }

  if ((await reportSelect.inputValue()).trim() === '') {
    await reportSelect.selectOption(reportOptions[0].value)
  }

  await expect(reportSelect).not.toHaveValue('')
  await page.getByRole('button', { name: 'GENERATE', exact: true }).click()
  await expect(page.getByText('Generated Report', { exact: true })).toBeVisible()
  await expect(page.locator('section').getByRole('heading', { level: 2 }).last()).toBeVisible()
}

async function verifyOperationsManagerDashboardFilter(page: Page) {
  const filterButton = page.getByRole('button', { name: 'Open dashboard filter', exact: true })
  await expect(filterButton).toBeVisible()
  await filterButton.click()
  await expect(page.getByRole('heading', { name: 'Filter Dashboard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
}

async function assertTopLevelMenuVisibility(page: Page, scenario: UserScenario) {
  const sidebar = await ensureSidebar(page)

  for (const item of scenario.visibleMenu.filter((entry) => !entry.parent)) {
    await expect(sidebar.getByRole('link', { name: item.label, exact: true })).toBeVisible()
  }

  for (const label of scenario.hiddenTopLevel) {
    await expect(sidebar.getByRole('link', { name: label, exact: true })).toHaveCount(0)
  }
}

async function assertBorrowerChildVisibility(page: Page, scenario: UserScenario) {
  const sidebar = await ensureSidebar(page)
  await sidebar.getByRole('button', { name: 'Borrowers', exact: true }).click()

  for (const item of scenario.visibleMenu.filter((entry) => entry.parent === 'Borrowers')) {
    await expect(sidebar.getByRole('link', { name: item.label, exact: true })).toBeVisible()
  }

  for (const label of scenario.hiddenBorrowerItems || []) {
    await expect(sidebar.getByRole('link', { name: label, exact: true })).toHaveCount(0)
  }
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Logout', exact: true }).click()
  await expect(page).toHaveURL(pathPattern('/login'))
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
}

const scenarios: UserScenario[] = [
  {
    name: 'area manager',
    email: 'rkip@gmail.com',
    visibleMenu: [
      { label: 'Dashboard', path: '/dashboard', heading: 'Dashboard' },
      { parent: 'Borrowers', label: 'All borrowers', path: '/clients', heading: /Clients|Borrowers/, afterNavigate: captureFirstClientName },
      { label: 'Search', path: '/search', heading: 'Global Search', afterNavigate: verifySearchFlow },
      { parent: 'Borrowers', label: 'Reallocation', path: '/clients/reallocation', heading: 'Portfolio Reallocation' },
      { parent: 'Borrowers', label: 'Approval', path: '/approvals', heading: 'Approvals' },
      { label: 'Loans', path: '/loans', heading: 'Loans' },
      { label: 'Collections', path: '/collections', heading: 'Collections' },
      { label: 'Guarantors', path: '/guarantors', heading: 'Guarantors' },
      { label: 'Collateral', path: '/collateral-assets', heading: 'Collateral Assets' },
      { label: 'Reports', path: '/reports', heading: 'Generate reports', afterNavigate: async (page) => verifyReportGeneration(page) },
      { label: 'Profile', path: '/profile', heading: 'User Profile & Settings' },
    ],
    hiddenTopLevel: ['Mobile Money', 'Accounting', 'Loan Products', 'Admin', 'Users', 'Branches', 'Hierarchy', 'Audit Logs'],
  },
  {
    name: 'molo officer',
    email: 'aleky@gmail.com',
    visibleMenu: [
      { label: 'Dashboard', path: '/dashboard', heading: 'Dashboard' },
      { parent: 'Borrowers', label: 'All borrowers', path: '/clients', heading: /Clients|Borrowers/, afterNavigate: captureFirstClientName },
      { label: 'Search', path: '/search', heading: 'Global Search', afterNavigate: verifySearchFlow },
      { label: 'Loans', path: '/loans', heading: 'Loans' },
      { label: 'Collections', path: '/collections', heading: 'Collections' },
      { label: 'Guarantors', path: '/guarantors', heading: 'Guarantors' },
      { label: 'Collateral', path: '/collateral-assets', heading: 'Collateral Assets' },
      { label: 'Reports', path: '/reports', heading: 'Generate reports', afterNavigate: async (page) => verifyReportGeneration(page) },
      { label: 'Profile', path: '/profile', heading: 'User Profile & Settings' },
    ],
    hiddenTopLevel: ['Mobile Money', 'Accounting', 'Loan Products', 'Admin', 'Users', 'Branches', 'Hierarchy', 'Audit Logs'],
    hiddenBorrowerItems: ['Reallocation', 'Approval'],
  },
  {
    name: 'molo branch manager',
    email: 'jenny@gmail.com',
    visibleMenu: [
      { label: 'Dashboard', path: '/dashboard', heading: 'Branch Manager Dashboard', afterNavigate: verifyOperationsManagerDashboardFilter },
      { parent: 'Borrowers', label: 'All borrowers', path: '/clients', heading: /Clients|Borrowers/, afterNavigate: captureFirstClientName },
      { label: 'Search', path: '/search', heading: 'Global Search', afterNavigate: verifySearchFlow },
      { parent: 'Borrowers', label: 'Reallocation', path: '/clients/reallocation', heading: 'Portfolio Reallocation' },
      { parent: 'Borrowers', label: 'Approval', path: '/approvals', heading: 'Approvals' },
      { label: 'Loans', path: '/loans', heading: 'Loans' },
      { label: 'Collections', path: '/collections', heading: 'Collections' },
      { label: 'Guarantors', path: '/guarantors', heading: 'Guarantors' },
      { label: 'Collateral', path: '/collateral-assets', heading: 'Collateral Assets' },
      { label: 'Reports', path: '/reports', heading: 'Generate reports', afterNavigate: async (page) => verifyReportGeneration(page) },
      { label: 'Mobile Money', path: '/mobile-money', heading: 'Mobile Money Dashboard' },
      { label: 'Accounting', path: '/accounting', heading: 'GL / Accounting Dashboard' },
      { label: 'Profile', path: '/profile', heading: 'User Profile & Settings' },
    ],
    hiddenTopLevel: ['Loan Products', 'Admin', 'Users', 'Branches', 'Hierarchy', 'Audit Logs'],
  },
]

test.describe('role-based menu coverage', () => {
  for (const scenario of scenarios) {
    test(`${scenario.name} can complete every visible sidebar flow`, async ({ page }) => {
      const runtime: RuntimeContext = {}

      await signIn(page, scenario.email)
      await assertTopLevelMenuVisibility(page, scenario)
      await assertBorrowerChildVisibility(page, scenario)

      for (const item of scenario.visibleMenu) {
        await openMenuItem(page, item)
        if (item.afterNavigate) {
          await item.afterNavigate(page, runtime)
        }
      }

      await logout(page)
    })
  }

  test('area manager can use the Customer 360 quick menu', async ({ page }) => {
    await signIn(page, 'rkip@gmail.com')
    await openMenuItem(page, scenarios[0].visibleMenu[1])

    const firstClientRow = page.locator('tbody tr').first()
    await expect(firstClientRow).toBeVisible()
    await firstClientRow.getByRole('link', { name: 'View 360', exact: true }).click()
    await expect(page).toHaveURL(/\/clients\/\d+$/)
    await expectHeading(page, 'Customer 360')

    const quickMenuChecks: Array<{ button: string; heading: string | RegExp }> = [
      { button: 'Basic Info', heading: 'Profile' },
      { button: 'Statement', heading: 'Borrower Statement' },
      { button: 'Attachments', heading: 'Attachments' },
      { button: 'Notes', heading: 'Notes' },
      { button: 'More Info', heading: 'More Info' },
      { button: 'Business Details', heading: 'Business Details' },
      { button: 'Guarantor Details', heading: 'Guarantors' },
      { button: 'Collateral Details', heading: 'Collateral' },
      { button: 'Actions', heading: /Continue Onboarding|Onboarding/ },
    ]

    for (const check of quickMenuChecks) {
      await page.getByRole('button', { name: check.button, exact: true }).click()
      await expectHeading(page, check.heading)
    }

    await logout(page)
  })
})