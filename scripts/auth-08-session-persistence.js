const { launchBrowser } = require('./launch-browser');

const TEST_EMAIL = process.env.LEDGERLAB_TEST_EMAIL || 'ledgerlab-test-1769824520783@mailinator.com';
const TEST_PASSWORD = process.env.LEDGERLAB_TEST_PASSWORD || 'TestPass123!';

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-08: Session Persistence');
  console.log('=================================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let testPassed = false;

  try {
    await log('STEP 1: Login');
    await page.goto('https://ledgerlab.ai/login');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    let currentUrl = page.url();
    if (!currentUrl.includes('dashboard') && !currentUrl.includes('chat')) {
      throw new Error('Login failed');
    }
    await log('  ✓ Logged in, on dashboard');

    await log('STEP 2: Refresh page');
    await page.reload();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    currentUrl = page.url();
    if (currentUrl.includes('login')) throw new Error('Session lost on refresh');
    await log('  ✓ Still authenticated after refresh');

    await log('STEP 3: Navigate away and back');
    await page.goto('https://ledgerlab.ai/');
    await page.waitForTimeout(1000);
    await page.goto('https://ledgerlab.ai/dashboard');
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    currentUrl = page.url();
    if (currentUrl.includes('dashboard') || currentUrl.includes('chat')) {
      await log('  ✓ Still authenticated after navigation');
      testPassed = true;
    } else {
      await log('  ❌ Lost session after navigation');
    }
    await page.screenshot({ path: 'screenshots/auth-08-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-08-error.png', fullPage: true }); } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n=================================');
  console.log(testPassed ? '✅ AUTH-08: PASSED\n   Session persists across navigation' : '❌ AUTH-08: FAILED\n   Session did not persist');
  console.log('=================================\n');
  process.exit(testPassed ? 0 : 1);
})();
