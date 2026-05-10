const { launchBrowser } = require('./launch-browser');
const { login, verifyAuthenticated, waitForPageReady } = require('./auth-helpers');
const { resolveAccount, ACCOUNT_FILE } = require('./test-account');

const { email: TEST_EMAIL, password: TEST_PASSWORD, source } = resolveAccount();
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error(`AUTH-08 requires LEDGERLAB_TEST_EMAIL/LEDGERLAB_TEST_PASSWORD or a successful AUTH-01 run (${ACCOUNT_FILE})`);
  process.exit(2);
}
console.log(`[auth-08] Using credentials from ${source}`);

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
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD);

    let currentUrl = page.url();
    if (!loggedIn) {
      throw new Error('Login failed');
    }
    await log('  ✓ Logged in, on dashboard');

    await log('STEP 2: Refresh page');
    await page.reload();
    await waitForPageReady(page);

    currentUrl = page.url();
    if (!await verifyAuthenticated(page)) throw new Error('Session lost on refresh');
    await log('  ✓ Still authenticated after refresh');

    await log('STEP 3: Navigate away and back');
    await page.goto('https://ledgerlab.ai/');
    await waitForPageReady(page);
    await page.goto('https://ledgerlab.ai/dashboard');
    await waitForPageReady(page);

    currentUrl = page.url();
    if (await verifyAuthenticated(page)) {
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
