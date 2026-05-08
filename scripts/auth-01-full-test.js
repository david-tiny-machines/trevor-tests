const { launchBrowser } = require('./launch-browser');
const { createInbox, waitForCode } = require('./mail-helper');

const TEST_NAME = 'Trevor Test';
const timestamp = Date.now();
const EMAIL_PREFIX = `ledgerlab-test-${timestamp}`;

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

  try {
    await log('STEP 0: Create test inbox');
    const { email: TEST_EMAIL, sid_token } = await createInbox(EMAIL_PREFIX);
    await log(`  Test email: ${TEST_EMAIL}`);

    browser = await launchBrowser();
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();

    await log('STEP 1: Navigate to signup page');
    await page.goto('https://ledgerlab.ai/signup');
    await page.waitForLoadState('networkidle');
    const acceptBtn = page.locator('button:has-text("Accept all")');
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
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
    await page.waitForLoadState('networkidle');

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

      if (!verificationCode) {
        const codeElements = await frame.locator('h1, h2, h3, strong, b, [style*="font-size"]').allTextContents();
        for (const text of codeElements) {
          const match = text.match(/\b(\d{6})\b/) || text.match(/(\d\s+\d\s+\d\s+\d\s+\d\s+\d)/);
          if (match) {
            verificationCode = match[1].replace(/\s/g, '');
    if (verificationCode) {
      await log('STEP 5: Enter verification code');
      await page.bringToFront();

      const otpInputs = page.locator('input[maxlength="1"]');
      const otpCount = await otpInputs.count();

      if (otpCount >= 6) {
        await log(`  Found ${otpCount} OTP input fields`);
        await otpInputs.first().click();
        await page.waitForTimeout(500);
        for (const digit of verificationCode) {
          await page.keyboard.type(digit);
          await page.waitForTimeout(500);
        }
        await log('  ✓ Typed verification code');
        await page.screenshot({ path: 'screenshots/auth-01-otp-typed.png' });
        await page.waitForTimeout(4000);
      } else {
        const codeInput = page.locator('input[name*="code"], input[id*="code"]');
        if (await codeInput.count() > 0) {
          await codeInput.first().fill(verificationCode);
          await log('  ✓ Entered verification code in single field');
        } else {
          await log(`  ⚠️ No code input found on page: ${page.url()}`);
          await page.screenshot({ path: 'screenshots/auth-01-step5-looking.png', fullPage: true });
        }
      }

      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshots/auth-01-step5.png', fullPage: true });

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle');
      }

      const bodyText = await page.textContent('body').catch(() => '');
      if (bodyText.toLowerCase().includes('set your password') || bodyText.toLowerCase().includes('create a secure password')) {
        await log('STEP 6: Set password');
        const testPassword = process.env.LEDGERLAB_TEST_PASSWORD || 'TestPass123!';
        await page.fill('input[type="password"]', testPassword);
        const confirmField = page.locator('input[placeholder*="Confirm" i]');
        if (await confirmField.count() > 0) await confirmField.fill(testPassword);
        await page.click('button:has-text("Complete")');
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle');
        await log('  ✓ Password set');
      }

      const finalUrl = page.url();
      await log(`  Final URL: ${finalUrl}`);
      await page.screenshot({ path: 'screenshots/auth-01-final.png', fullPage: true });

      if (finalUrl.includes('dashboard') || finalUrl.includes('app') || finalUrl.includes('home') || finalUrl.includes('chat')) {
        testPassed = true;
      } else {
        const finalBodyText = await page.textContent('body').catch(() => '');
        if (finalBodyText.toLowerCase().includes('success') || finalBodyText.toLowerCase().includes('dashboard') ||
            finalBodyText.toLowerCase().includes('welcome') || finalBodyText.toLowerCase().includes('boris')) {
          testPassed = true;
        }
      }
    }

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    if (page) {
      try { await page.screenshot({ path: 'screenshots/auth-01-error.png', fullPage: true }); } catch {}
    }
  } finally {
    if (mailPage) { try { await mailPage.close(); } catch {} }
    if (context) { try { await context.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
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
  console.log(`   Test email: ${TEST_EMAIL}`);
  console.log('========================================\n');
  process.exit(testPassed ? 0 : 1);
})();
