const { chromium } = require('playwright');

const timestamp = Date.now();
const EMAIL_PREFIX = `ledgerlab-reset-${timestamp}`;
const TEST_EMAIL = `${EMAIL_PREFIX}@mailinator.com`;
const TEST_NAME = 'Reset Test';
const ORIGINAL_PASSWORD = 'OriginalPass123!';
const NEW_PASSWORD = 'NewPassword456!';

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

async function getCodeFromEmail(mailPage, emailPrefix, emailSubject) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    await mailPage.goto(`https://www.mailinator.com/v4/public/inboxes.jsp?to=${emailPrefix}`);
    await mailPage.waitForLoadState('domcontentloaded');
    const emailRow = mailPage.locator(`tr:has-text("${emailSubject}")`).first();
    try {
      await emailRow.waitFor({ timeout: 30000 });
      await emailRow.click();
      await mailPage.waitForTimeout(3000);
      const frame = mailPage.frameLocator('#html_msg_body');
      const emailText = await frame.locator('body').textContent().catch(() => '');
      const codeMatch = emailText.match(/\b(\d{6})\b/);
      if (codeMatch) return codeMatch[1];
      const spacedMatch = emailText.match(/(\d\s+\d\s+\d\s+\d\s+\d\s+\d)/);
      if (spacedMatch) return spacedMatch[1].replace(/\s/g, '');
    } catch {
      // email not yet received, reload and retry
    }
  }
  return null;
}

async function enterOTP(page, code) {
  const otpInputs = page.locator('input[maxlength="1"]');
  if (await otpInputs.count() >= 6) {
    await otpInputs.first().click();
    await page.waitForTimeout(500);
    for (const digit of code) {
      await page.keyboard.type(digit);
      await page.waitForTimeout(500);
    }
    return true;
  }
  return false;
}

(async () => {
  console.log('🧪 AUTH-04: Forgot Password (Full Flow)');
  console.log('=========================================\n');
  console.log(`Test Email: ${TEST_EMAIL}\n`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const mailPage = await context.newPage();
  let testPassed = false;

  try {
    await log('SETUP: Create test account');
    await page.goto('https://ledgerlab.ai/signup');
    await page.waitForLoadState('networkidle');
    await page.fill('#fullName', TEST_NAME);
    await page.fill('#email', TEST_EMAIL);
    await page.check('#terms');
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(3000);

    const verifyCode = await getCodeFromEmail(mailPage, EMAIL_PREFIX, 'Activate');
    if (!verifyCode) throw new Error('Could not get verification code');
    await log(`  Got verification code: ${verifyCode}`);

    await page.bringToFront();
    await enterOTP(page, verifyCode);
    await page.waitForTimeout(3000);

    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText.toLowerCase().includes('set your password')) {
      await page.fill('input[type="password"]', ORIGINAL_PASSWORD);
      const confirmField = page.locator('input[placeholder*="Confirm" i]');
      if (await confirmField.count() > 0) await confirmField.fill(ORIGINAL_PASSWORD);
      await page.click('button:has-text("Complete")');
      await page.waitForTimeout(3000);
    }
    await log('  ✓ Test account created');

    await log('STEP 1: Request password reset');
    await page.goto('https://ledgerlab.ai/forgot-password');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"], input#email', TEST_EMAIL);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await log('  ✓ Reset request submitted');

    await log('STEP 2: Get reset code from email');
    await page.waitForTimeout(5000);
    const resetCode = await getCodeFromEmail(mailPage, EMAIL_PREFIX, 'Reset Your Password');
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
    const currentBodyText = await page.textContent('body').catch(() => '');
    if (currentBodyText.toLowerCase().includes('new password') ||
        currentBodyText.toLowerCase().includes('set your password') ||
        currentBodyText.toLowerCase().includes('reset your password')) {
      const passwordFields = page.locator('input[type="password"]');
      const pwCount = await passwordFields.count();
      if (pwCount >= 2) {
        await passwordFields.nth(0).fill(NEW_PASSWORD);
        await passwordFields.nth(1).fill(NEW_PASSWORD);
      } else if (pwCount === 1) {
        await passwordFields.first().fill(NEW_PASSWORD);
      }
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      await log('  ✓ New password submitted');
    }
    await page.screenshot({ path: 'screenshots/auth-04-after-password.png', fullPage: true });

    await log('STEP 5: Verify login with new password');
    await page.goto('https://ledgerlab.ai/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', NEW_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    const finalUrl = page.url();
    await log(`  Final URL: ${finalUrl}`);
    if (finalUrl.includes('dashboard') || finalUrl.includes('app') || finalUrl.includes('chat')) {
      await log('  ✓ Login successful with new password');
      testPassed = true;
    } else {
      await log('  ❌ Could not login with new password');
    }
    await page.screenshot({ path: 'screenshots/auth-04-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-04-error.png', fullPage: true }); } catch {}
  } finally {
    await mailPage.close();
    await context.close();
    await browser.close();
  }

  console.log('\n=========================================');
  console.log(testPassed ? '✅ AUTH-04: PASSED\n   Password reset flow works end-to-end' : '❌ AUTH-04: FAILED\n   Password reset flow did not complete');
  console.log(`   Test email: ${TEST_EMAIL}`);
  console.log('=========================================\n');
  process.exit(testPassed ? 0 : 1);
})();
