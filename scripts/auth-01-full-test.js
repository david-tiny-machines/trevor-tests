const fs = require('fs');
const { launchBrowser } = require('./launch-browser');
const { createInbox, waitForCode } = require('./mail-helper');
const { dismissCookieBanner, enterOTP, hasPasswordStep, login, setAllPasswordFields, waitForPageReady } = require('./auth-helpers');

const TEST_NAME = 'Trevor Test';
const timestamp = Date.now();
const EMAIL_PREFIX = `ledgerlab-test-${timestamp}`;
const ACCOUNT_FILE = '/tmp/trevor-test-account.json';

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-01: Create Account (Full Test)');
  console.log('========================================\n');
  let browser = null;
  let context = null;
  let page = null;
  let testPassed = false;
  let verificationCode = null;
  const testPassword = process.env.LEDGERLAB_TEST_PASSWORD || 'TestPass123!';
  let createdEmail = null;
  let createdSidToken = null;

  try {
    await log('STEP 0: Create test inbox');
    const { email: TEST_EMAIL, sid_token } = await createInbox(EMAIL_PREFIX);
    createdEmail = TEST_EMAIL;
    createdSidToken = sid_token;
    await log(`  Test email: ${TEST_EMAIL}`);

    browser = await launchBrowser();
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();

    await log('STEP 1: Navigate to signup page');
    await page.goto('https://ledgerlab.ai/signup');
    await waitForPageReady(page);
    await dismissCookieBanner(page);
    await log('  ✓ Loaded signup page');

    await log('STEP 2: Fill signup form');
    await page.fill('#fullName', TEST_NAME);
    await page.fill('#email', TEST_EMAIL);
    await page.check('#terms');
    await log(`  ✓ Form filled (${TEST_EMAIL})`);
    await page.screenshot({ path: 'screenshots/auth-01-step2.png' });

    await log('STEP 3: Submit signup form');
    await page.click('button[type="submit"]:has-text("Continue")');
    await page.waitForTimeout(3000);

    const afterSubmitUrl = page.url();
    await log(`  Current URL: ${afterSubmitUrl}`);
    await page.screenshot({ path: 'screenshots/auth-01-step3.png', fullPage: true });

    await log('STEP 4: Wait for verification email');
    verificationCode = await waitForCode(sid_token, 'Activate');
    if (verificationCode) {
      await log(`  ✓ Found verification code: ${verificationCode}`);
    } else {
      await log('  ❌ No verification code received');
    }

    if (verificationCode) {
      await log('STEP 5: Enter verification code');
      await page.bringToFront();

      if (await enterOTP(page, verificationCode)) {
        await log('  ✓ Typed verification code');
        await page.screenshot({ path: 'screenshots/auth-01-otp-typed.png' });
        await page.waitForTimeout(4000);
      } else {
        await log(`  ⚠️ No code input found on page: ${page.url()}`);
        await page.screenshot({ path: 'screenshots/auth-01-step5-looking.png', fullPage: true });
      }

      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshots/auth-01-step5.png', fullPage: true });

      if (!(await hasPasswordStep(page))) {
        const submitBtn = page.locator('button[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
        }
      }

      if (await hasPasswordStep(page)) {
        await log('STEP 6: Set password');
        await setAllPasswordFields(page, testPassword);
        await log('  ✓ Password set');
      }

      const finalUrl = page.url();
      await log(`  Final URL: ${finalUrl}`);
      await page.screenshot({ path: 'screenshots/auth-01-final.png', fullPage: true });

      if (finalUrl.includes('dashboard') || finalUrl.includes('app') || finalUrl.includes('home') ||
          finalUrl.includes('chat') || finalUrl.includes('login')) {
        const finalBodyText = await page.textContent('body').catch(() => '');
        // /login with success banner = signup completed; /login without it = something went wrong
        if (finalUrl.includes('login')) {
          testPassed = finalBodyText.toLowerCase().includes('account created') ||
                       finalBodyText.toLowerCase().includes('success');
        } else {
          testPassed = true;
        }
      }

      if (!testPassed) {
        await log('STEP 7: Verify created account by signing in');
        testPassed = await login(page, createdEmail, testPassword);
        await log(testPassed ? '  ✓ Created account can sign in' : '  ❌ Created account could not sign in');
        await page.screenshot({ path: 'screenshots/auth-01-login-verify.png', fullPage: true });
      }
    }

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    if (page) {
      try { await page.screenshot({ path: 'screenshots/auth-01-error.png', fullPage: true }); } catch {}
    }
  } finally {
    if (context) { try { await context.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
  }

  if (testPassed && createdEmail) {
    try {
      fs.writeFileSync(ACCOUNT_FILE, JSON.stringify({
        email: createdEmail,
        password: testPassword,
        sid_token: createdSidToken,
        createdAt: new Date().toISOString(),
      }));
      console.log(`[auth-01] Wrote credentials to ${ACCOUNT_FILE} for downstream tests`);
    } catch (err) {
      console.log(`[auth-01] Could not persist credentials: ${err.message}`);
    }
  }

  console.log('\n========================================');
  if (testPassed) {
    console.log('✅ AUTH-01: PASSED');
    console.log('   Account created and verified successfully');
  } else if (verificationCode) {
    console.log('⚠️ AUTH-01: PARTIAL');
    console.log('   Signup and code received, but verification flow incomplete');
    console.log(`   Verification code was: ${verificationCode}`);
  } else {
    console.log('❌ AUTH-01: FAILED');
    console.log('   Could not complete account creation flow');
  }
  console.log('========================================\n');
  process.exit(testPassed ? 0 : 1);
})();
