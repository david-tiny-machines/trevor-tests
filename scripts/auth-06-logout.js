const { launchBrowser } = require('./launch-browser');
const { login, waitForPageReady } = require('./auth-helpers');
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
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find(
        el => el.textContent?.toLowerCase().includes('sign out') || el.textContent?.toLowerCase().includes('logout')
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);
    await waitForPageReady(page);

    let currentUrl = page.url();
    if (currentUrl.includes('dashboard') || currentUrl.includes('chat')) {
      await log('  Trying direct logout URL...');
      await page.goto('https://ledgerlab.ai/logout');
      await waitForPageReady(page);
      currentUrl = page.url();
    }

    await log('STEP 3: Verify logged out');
    await page.screenshot({ path: 'screenshots/auth-06-after-logout.png', fullPage: true });

    if (currentUrl.includes('login') || currentUrl === 'https://ledgerlab.ai/') {
      await log('  ✓ Redirected to login/home page');
      testPassed = true;
    } else {
      await page.goto('https://ledgerlab.ai/dashboard');
      await page.waitForTimeout(2000);
      await waitForPageReady(page);
      const afterUrl = page.url();
      if (afterUrl.includes('login')) {
        await log('  ✓ Dashboard redirects to login (session ended)');
        testPassed = true;
      } else {
        await log('  ❌ Still authenticated');
      }
    }
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
