const { chromium } = require('playwright');

const PROD_URL = 'https://ledgerlab.ai';

async function log(msg) {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`[${timestamp}] ${msg}`);
}

async function testAuthPage() {
  let browser = null;
  try {
    await log('🧪 Minimal Smoke Test: Auth Page Accessibility');
    browser = await chromium.launch({
      headless: true,
      executablePath: '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await log('→ Loading signup page...');
    await page.goto(`${PROD_URL}/signup`, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await log(`  ✓ Page loaded: ${page.url()}`);

    await log('→ Checking form elements...');
    const hasNameField = await page.locator('#fullName').count() > 0;
    const hasEmailField = await page.locator('#email').count() > 0;
    const hasTerms = await page.locator('#terms').count() > 0;
    const hasSubmit = await page.locator('button[type="submit"]').count() > 0;
    if (!hasNameField || !hasEmailField || !hasTerms || !hasSubmit) throw new Error('Missing form elements');
    await log('  ✓ All form elements present');

    await log('→ Loading login page...');
    await page.goto(`${PROD_URL}/login`, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    const hasLoginEmail = await page.locator('input[type="email"]').count() > 0;
    const hasLoginSubmit = await page.locator('button[type="submit"]').count() > 0;
    if (!hasLoginEmail || !hasLoginSubmit) throw new Error('Login page broken');
    await log('  ✓ Login page accessible');

    await context.close();
    await browser.close();
    browser = null;

    console.log('\n✅ SMOKE TEST PASSED');
    return true;
  } catch (error) {
    console.error(`\n❌ SMOKE TEST FAILED: ${error.message}`);
    return false;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

(async () => {
  const success = await testAuthPage();
  process.exit(success ? 0 : 1);
})();
