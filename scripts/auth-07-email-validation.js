const { chromium } = require('playwright');

async function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

(async () => {
  console.log('🧪 AUTH-07: Email Validation');
  console.log('==============================\n');

  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  let testPassed = true;

  const invalidEmails = ['notanemail', 'missing@domain', '@nodomain.com', 'spaces in@email.com', 'double@@at.com'];

  try {
    await log('Testing invalid email formats on signup form...\n');
    for (const invalidEmail of invalidEmails) {
      await page.goto('https://ledgerlab.ai/signup');
      await page.waitForLoadState('networkidle');
      await page.fill('#fullName', 'Test User');
      await page.fill('#email', invalidEmail);
      await page.check('#terms');
      await page.click('button:has-text("Continue")');
      await page.waitForTimeout(1500);

      const currentUrl = page.url();
      const bodyText = await page.textContent('body').catch(() => '');
      const wasRejected = currentUrl.includes('signup') && !bodyText.toLowerCase().includes('verify your email');

      if (wasRejected) {
        await log(`  ✓ "${invalidEmail}" - Rejected`);
      } else {
        await log(`  ❌ "${invalidEmail}" - Accepted (should be rejected)`);
        testPassed = false;
      }
    }
    await page.screenshot({ path: 'screenshots/auth-07-final.png', fullPage: true });

  } catch (error) {
    await log(`❌ Error: ${error.message}`);
    testPassed = false;
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n==============================');
  console.log(testPassed ? '✅ AUTH-07: PASSED\n   Invalid emails correctly rejected' : '❌ AUTH-07: FAILED\n   Some invalid emails were accepted');
  console.log('==============================\n');
  process.exit(testPassed ? 0 : 1);
})();
