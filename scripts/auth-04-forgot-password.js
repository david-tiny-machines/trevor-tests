const { launchBrowser } = require('./launch-browser');
const { createInbox, getLatestMailId, waitForCode } = require('./mail-helper');
const {
  dismissCookieBanner,
  enterOTP,
  hasPasswordStep,
  login,
  setAllPasswordFields,
  waitForPageReady,
} = require('./auth-helpers');

const timestamp = Date.now();
const EMAIL_PREFIX = `ledgerlab-reset-${timestamp}`;
const TEST_NAME = 'Reset Test';
const ORIGINAL_PASSWORD = 'OriginalPass123!';
const NEW_PASSWORD = 'NewPassword456!';

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-04: Forgot Password (Full Flow)');
  console.log('=========================================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let testPassed = false;

  try {
    await log('SETUP: Create test inbox');
    const { email: TEST_EMAIL, sid_token } = await createInbox(EMAIL_PREFIX);
    await log(`  Test email: ${TEST_EMAIL}`);

    await log('SETUP: Create test account');
    await page.goto('https://ledgerlab.ai/signup');
    await waitForPageReady(page);
    await dismissCookieBanner(page);
    await page.fill('#fullName', TEST_NAME);
    await page.fill('#email', TEST_EMAIL);
    await page.check('#terms');
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(3000);

    const verifyCode = await waitForCode(sid_token, 'Activate');
    if (!verifyCode) throw new Error('Could not get verification code');
    await log(`  Got verification code: ${verifyCode}`);

    await page.bringToFront();
    await enterOTP(page, verifyCode);
    await page.waitForTimeout(3000);

    if (await hasPasswordStep(page)) {
      await setAllPasswordFields(page, ORIGINAL_PASSWORD);
    }
    // Do not gate reset coverage on immediate post-signup login. The reset
    // request/email is the actual proof this setup account exists.
    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});
    await log('  ✓ Test account setup completed');

    await log('STEP 1: Request password reset');
    const resetBaselineMailId = await getLatestMailId(sid_token).catch(err => {
      console.log(`[auth-04] Could not capture reset inbox baseline: ${err.message}`);
      return null;
    });
    await page.goto('https://ledgerlab.ai/forgot-password');
    await waitForPageReady(page);
    await page.fill('input[type="email"], input#email', TEST_EMAIL);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await log('  ✓ Reset request submitted');

    await log('STEP 2: Get reset code from email');
    const resetCode = await waitForCode(sid_token, null, 240000, { sinceMailId: resetBaselineMailId });
    if (!resetCode) throw new Error('Could not get reset code from email');
    await log(`  ✓ Got reset code: ${resetCode}`);

    await log('STEP 3: Enter reset code');
    await page.bringToFront();
    const hasOTP = await page.locator('input[maxlength="1"]').count() >= 6;
    if (hasOTP) {
      await enterOTP(page, resetCode);
      await page.waitForTimeout(3000);
      await log('  ✓ Entered reset code');
    } else {
      await log('  ⚠️ No OTP input found');
      await page.screenshot({ path: 'screenshots/auth-04-no-otp.png', fullPage: true });
    }
    await page.screenshot({ path: 'screenshots/auth-04-after-code.png', fullPage: true });

    await log('STEP 4: Set new password');
    await page.waitForTimeout(2000);
    if (await hasPasswordStep(page)) {
      await setAllPasswordFields(page, NEW_PASSWORD);
      await log('  ✓ New password submitted');
    } else {
      throw new Error('Reset code accepted, but password reset form did not appear');
    }
    await page.screenshot({ path: 'screenshots/auth-04-after-password.png', fullPage: true });

    await log('STEP 5: Verify login with new password');
    testPassed = await login(page, TEST_EMAIL, NEW_PASSWORD);

    const finalUrl = page.url();
    await log(`  Final URL: ${finalUrl}`);
    await log(testPassed ? '  ✓ Login successful with new password' : '  ❌ Could not login with new password');
    await page.screenshot({ path: 'screenshots/auth-04-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-04-error.png', fullPage: true }); } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n=========================================');
  console.log(testPassed ? '✅ AUTH-04: PASSED\n   Password reset flow works end-to-end' : '❌ AUTH-04: FAILED\n   Password reset flow did not complete');
  console.log('=========================================\n');
  process.exit(testPassed ? 0 : 1);
})();
