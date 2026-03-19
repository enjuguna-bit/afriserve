import { chromium } from 'playwright';

(async () => {
  console.log('Starting browser for UX audit...');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@afriserve.local');
    await page.fill('input[type="password"]', 'Admin@123');
    await page.click('button[type="submit"]');

    console.log('Waiting for dashboard...');
    await page.waitForURL('**/dashboard');
    
    // 1. Client Creation Flow
    console.log('Navigating to Create Client...');
    await page.goto('http://localhost:5173/clients/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'audit_01_create_client_empty.png', fullPage: true });

    console.log('Filling Client form...');
    // We'll fill mandatory fields just to see validation or layout
    // Actually, just taking a screenshot of the form is enough to analyze the UX layout.
    // Let's trigger validation errors to see what it looks like.
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'audit_02_create_client_errors.png', fullPage: true });

    // 2. Loan Creation Flow
    console.log('Navigating to Create Loan...');
    await page.goto('http://localhost:5173/loans/new');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'audit_03_create_loan_empty.png', fullPage: true });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'audit_04_create_loan_errors.png', fullPage: true });

    // 3. Approvals Flow
    console.log('Navigating to Approvals...');
    await page.goto('http://localhost:5173/approvals');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'audit_05_approvals.png', fullPage: true });

    // 4. Disbursements Flow (via specific loan, skip for now, just audit loans view)
    console.log('Navigating to Loans List...');
    await page.goto('http://localhost:5173/loans');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'audit_06_loans_list.png', fullPage: true });

    console.log('Audit screenshots saved.');
  } catch (error) {
    console.error('Audit script failed:', error);
  } finally {
    await browser.close();
  }
})();
