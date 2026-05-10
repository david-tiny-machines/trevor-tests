const { launchBrowser } = require('./launch-browser');
const { login, logout } = require('./auth-helpers');
const { resolveAccount, ACCOUNT_FILE } = require('./test-account');

const { email: TEST_EMAIL, password: TEST_PASSWORD, source } = resolveAccount();
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error(`AUTH-06 requires LEDGERLAB_TEST_EMAIL/LEDGERLAB_TEST_PASSWORD or a successful AUTH-01 run (${ACCOUNT_FILE})`);
  process.exit(2);
}
console.log(`[auth-06] Using credentials from ${source}`);

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-06: Logout');
  console.log('===================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let testPassed = false;

  try {
    await log('STEP 1: Login');
    const loggedIn = await login(page, TEST_EMAIL, TEST_PASSWORD);
    if (!loggedIn) {
      throw new Error('Login failed');
    }
    await log('  ✓ Logged in successfully');
    await page.screenshot({ path: 'screenshots/auth-06-logged-in.png', fullPage: true });

    await log('STEP 2: Logout');
    testPassed = await logout(page);

    await log('STEP 3: Verify logged out');
    await page.screenshot({ path: 'screenshots/auth-06-after-logout.png', fullPage: true });
    await log(testPassed ? '  ✓ Protected route no longer shows authenticated state' : '  ❌ Still authenticated');
    await page.screenshot({ path: 'screenshots/auth-06-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-06-error.png', fullPage: true }); } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n===================');
  console.log(testPassed ? '✅ AUTH-06: PASSED\n   Logout successfully ends session' : '❌ AUTH-06: FAILED\n   Logout did not properly end session');
  console.log('===================\n');
  process.exit(testPassed ? 0 : 1);
})();
