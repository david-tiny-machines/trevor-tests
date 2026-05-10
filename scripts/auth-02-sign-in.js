const { launchBrowser } = require('./launch-browser');
const { resolveAccount, ACCOUNT_FILE } = require('./test-account');
const { login, verifyAuthenticated } = require('./auth-helpers');

const { email: TEST_EMAIL, password: TEST_PASSWORD, source } = resolveAccount();
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error(`AUTH-02 requires LEDGERLAB_TEST_EMAIL/LEDGERLAB_TEST_PASSWORD or a successful AUTH-01 run (${ACCOUNT_FILE})`);
  process.exit(2);
}
console.log(`[auth-02] Using credentials from ${source}`);

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-02: Sign In');
  console.log('====================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  let testPassed = false;

  try {
    await log('STEP 1: Navigate to login page');
    testPassed = await login(page, TEST_EMAIL, TEST_PASSWORD);

    const currentUrl = page.url();
    await log(`  Current URL: ${currentUrl}`);
    await page.screenshot({ path: 'screenshots/auth-02-after-login.png', fullPage: true });

    await log('STEP 2: Verify logged in');
    testPassed = testPassed || await verifyAuthenticated(page);
    await log(testPassed ? '  ✓ Authenticated area verified' : '  ⚠️ Could not verify login success');
    await page.screenshot({ path: 'screenshots/auth-02-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-02-error.png', fullPage: true }); } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n====================');
  if (testPassed) {
    console.log('✅ AUTH-02: PASSED');
    console.log('   Successfully signed in with valid credentials');
  } else {
    console.log('❌ AUTH-02: FAILED');
    console.log('   Could not verify successful login');
  }
  console.log(`   Test email: ${TEST_EMAIL}`);
  console.log('====================\n');

  process.exit(testPassed ? 0 : 1);
})();
