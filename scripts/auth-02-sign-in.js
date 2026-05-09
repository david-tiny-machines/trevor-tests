const { launchBrowser } = require('./launch-browser');

const TEST_EMAIL = process.env.LEDGERLAB_TEST_EMAIL;
const TEST_PASSWORD = process.env.LEDGERLAB_TEST_PASSWORD;
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('AUTH-02 requires LEDGERLAB_TEST_EMAIL and LEDGERLAB_TEST_PASSWORD');
  process.exit(2);
}

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
    await page.goto('https://ledgerlab.ai/login');
    await page.waitForLoadState('networkidle');
    await log('  ✓ Loaded login page');

    await log('STEP 2: Enter credentials');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await log(`  ✓ Entered email and password`);
    await page.screenshot({ path: 'screenshots/auth-02-step2.png' });

    await log('STEP 3: Submit login');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();
    await log(`  Current URL: ${currentUrl}`);
    await page.screenshot({ path: 'screenshots/auth-02-step3.png', fullPage: true });

    await log('STEP 4: Verify logged in');
    if (currentUrl.includes('dashboard') || currentUrl.includes('app') || currentUrl.includes('chat')) {
      testPassed = true;
      await log('  ✓ Redirected to authenticated area');
    } else {
      const bodyText = await page.textContent('body').catch(() => '');
      if (bodyText.toLowerCase().includes('logout') || bodyText.toLowerCase().includes('dashboard') ||
          bodyText.toLowerCase().includes('welcome') || bodyText.toLowerCase().includes('boris') ||
          bodyText.toLowerCase().includes('credits')) {
        testPassed = true;
        await log('  ✓ Found authenticated content');
      } else {
        await log('  ⚠️ Could not verify login success');
      }
    }
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
