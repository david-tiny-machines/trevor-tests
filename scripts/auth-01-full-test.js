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

async function isSignupPasswordStep(page) {
  if (!page.url().includes('/signup')) return false;
  const passwordCount = await page.locator('input[type="password"]').count();
  if (passwordCount > 0) return true;
  return hasPasswordStep(page);
}

async function waitForSignupPasswordStep(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isSignupPasswordStep(page)) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function getVisibleErrorText(page) {
  const bodyText = await page.textContent('body').catch(() => '');
  const lower = bodyText.toLowerCase();
  if (!lower.includes('error') && !lower.includes('failed') && !lower.includes('invalid')) return '';

  const errorEl = page.locator('[role="alert"], [class*="error" i], .text-red, .text-destructive');
  if (await errorEl.count() > 0) {
    return (await errorEl.first().textContent().catch(() => '') || '').trim();
  }
  return bodyText.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 5).join(' | ');
}

async function completeSignupPasswordStep(page, password) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!await waitForSignupPasswordStep(page, attempt === 1 ? 15000 : 5000)) {
      return !page.url().includes('/signup');
    }

    await log(`  Password submit attempt ${attempt}`);
    await setAllPasswordFields(page, password);
    await page.waitForTimeout(5000);

    if (!await isSignupPasswordStep(page)) return true;

    const errorText = await getVisibleErrorText(page);
    if (errorText) await log(`  Password step still visible with error: ${errorText}`);
  }
  return false;
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

  try {
    await log('STEP 0: Create test inbox');
    const { email: TEST_EMAIL, sid_token } = await createInbox(EMAIL_PREFIX);
    createdEmail = TEST_EMAIL;
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
        await waitForSignupPasswordStep(page, 15000);
      } else {
        await log(`  ⚠️ No code input found on page: ${page.url()}`);
        await page.screenshot({ path: 'screenshots/auth-01-step5-looking.png', fullPage: true });
      }

      await page.screenshot({ path: 'screenshots/auth-01-step5.png', fullPage: true });

      if (!(await isSignupPasswordStep(page))) {
        const submitBtn = page.locator('button[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
          await waitForSignupPasswordStep(page, 10000);
        }
      }

      if (await isSignupPasswordStep(page)) {
        await log('STEP 6: Set password');
        const passwordCompleted = await completeSignupPasswordStep(page, testPassword);
        await log(passwordCompleted ? '  ✓ Password step completed' : '  ❌ Password step did not complete');
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
        testPassed = await login(page, createdEmail, testPassword, { attempts: 6, delayMs: 5000 });
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
