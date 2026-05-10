const { launchBrowser } = require('./launch-browser');
const { resolveAccount, ACCOUNT_FILE } = require('./test-account');
const { waitForPageReady } = require('./auth-helpers');

const { email: TEST_EMAIL, source } = resolveAccount({ requirePassword: false });
const WRONG_PASSWORD = 'WrongPassword123!';
if (!TEST_EMAIL) {
  console.error(`AUTH-03 requires LEDGERLAB_TEST_EMAIL or a successful AUTH-01 run (${ACCOUNT_FILE})`);
  process.exit(2);
}
console.log(`[auth-03] Using email from ${source}`);

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-03: Sign In - Invalid Credentials');
  console.log('==========================================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let testPassed = false;

  try {
    await log('STEP 1: Navigate to login page');
    await page.goto('https://ledgerlab.ai/login');
    await waitForPageReady(page);

    await log('STEP 2: Enter invalid credentials');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', WRONG_PASSWORD);

    await log('STEP 3: Submit login');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    await log(`  Current URL: ${currentUrl}`);
    await page.screenshot({ path: 'screenshots/auth-03-after-submit.png', fullPage: true });

    await log('STEP 4: Verify error handling');
    if (currentUrl.includes('login')) {
      await log('  ✓ Still on login page (not authenticated)');
      const bodyText = await page.textContent('body').catch(() => '');
      const hasError = bodyText.toLowerCase().includes('invalid') || bodyText.toLowerCase().includes('incorrect') ||
                       bodyText.toLowerCase().includes('wrong') || bodyText.toLowerCase().includes('error') ||
                       bodyText.toLowerCase().includes('failed');
      if (hasError) {
        await log('  ✓ Error message displayed');
        testPassed = true;
      } else {
        const errorEl = page.locator('[class*="error"], [class*="Error"], [role="alert"], .text-red');
        if (await errorEl.count() > 0) {
          const errorText = await errorEl.first().textContent();
          await log(`  ✓ Error element found: "${errorText}"`);
          testPassed = true;
        } else {
          await log('  ❌ Login stayed blocked but no visible error message was found');
        }
      }
    } else {
      await log('  ❌ User was authenticated with wrong password!');
    }
    await page.screenshot({ path: 'screenshots/auth-03-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-03-error.png', fullPage: true }); } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n==========================================');
  console.log(testPassed ? '✅ AUTH-03: PASSED\n   Invalid credentials correctly rejected' : '❌ AUTH-03: FAILED\n   Login should have been rejected but was not');
  console.log('==========================================\n');
  process.exit(testPassed ? 0 : 1);
})();
