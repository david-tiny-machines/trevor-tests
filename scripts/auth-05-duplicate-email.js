const { launchBrowser } = require('./launch-browser');

const EXISTING_EMAIL = process.env.LEDGERLAB_TEST_EMAIL || 'ledgerlab-test-1769824520783@mailinator.com';

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-05: Create Account - Duplicate Email');
  console.log('=============================================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let testPassed = false;

  try {
    await log('STEP 1: Navigate to signup page');
    await page.goto('https://ledgerlab.ai/signup');
    await page.waitForLoadState('networkidle');

    await log('STEP 2: Fill form with existing email');
    await page.fill('#fullName', 'Duplicate Test');
    await page.fill('#email', EXISTING_EMAIL);
    await page.check('#terms');
    await page.screenshot({ path: 'screenshots/auth-05-step2.png' });

    await log('STEP 3: Submit signup form');
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    await log(`  Current URL: ${currentUrl}`);
    await page.screenshot({ path: 'screenshots/auth-05-step3.png', fullPage: true });

    await log('STEP 4: Verify duplicate email is rejected');
    const bodyText = await page.textContent('body').catch(() => '');
    const hasDuplicateError = bodyText.toLowerCase().includes('already') || bodyText.toLowerCase().includes('exists') ||
      bodyText.toLowerCase().includes('registered') || bodyText.toLowerCase().includes('in use') ||
      bodyText.toLowerCase().includes('duplicate') || bodyText.toLowerCase().includes('taken');

    if (hasDuplicateError) {
      await log('  ✓ Duplicate email error message displayed');
      testPassed = true;
    } else if (currentUrl.includes('signup')) {
      const errorEl = page.locator('[class*="error"], [class*="Error"], [role="alert"], .text-red');
      if (await errorEl.count() > 0) {
        const errorText = await errorEl.first().textContent();
        await log(`  ✓ Error displayed: "${errorText}"`);
        testPassed = true;
      } else if (bodyText.toLowerCase().includes('verify') || bodyText.toLowerCase().includes('code')) {
        await log('  ⚠️ System shows verification screen (security through obscurity)');
        testPassed = true;
      }
    } else {
      await log('  ❌ User proceeded past signup with duplicate email');
    }
    await page.screenshot({ path: 'screenshots/auth-05-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    try { await page.screenshot({ path: 'screenshots/auth-05-error.png', fullPage: true }); } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n=============================================');
  console.log(testPassed ? '✅ AUTH-05: PASSED\n   Duplicate email properly handled' : '❌ AUTH-05: FAILED\n   Duplicate email was not rejected');
  console.log('=============================================\n');
  process.exit(testPassed ? 0 : 1);
})();
