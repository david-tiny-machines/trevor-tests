const AUTH_URL_PATTERNS = ['dashboard', 'app', 'chat'];

async function waitForPageReady(page, { timeout = 10000 } = {}) {
  await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
}

async function dismissCookieBanner(page) {
  const acceptBtn = page.locator('button:has-text("Accept all")');
  if (await acceptBtn.isVisible().catch(() => false)) {
    await acceptBtn.click();
    await page.waitForTimeout(500);
  }
}

function isAuthenticatedUrl(url) {
  return AUTH_URL_PATTERNS.some(pattern => url.includes(pattern));
}

async function hasAuthenticatedContent(page) {
  const bodyText = await page.textContent('body').catch(() => '');
  const text = bodyText.toLowerCase();
  return text.includes('logout') ||
         text.includes('sign out') ||
         text.includes('dashboard') ||
         text.includes('welcome') ||
         text.includes('boris') ||
         text.includes('credits');
}

async function verifyAuthenticated(page) {
  const currentUrl = page.url();
  if (isAuthenticatedUrl(currentUrl)) return true;
  return hasAuthenticatedContent(page);
}

async function verifyLoggedOut(page) {
  await page.goto('https://ledgerlab.ai/dashboard');
  await waitForPageReady(page);
  await page.waitForTimeout(1000);

  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl === 'https://ledgerlab.ai/') return true;
  return !(await verifyAuthenticated(page));
}

async function login(page, email, password) {
  await page.goto('https://ledgerlab.ai/login');
  await waitForPageReady(page);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"], button:has-text("Sign In")');
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  return verifyAuthenticated(page);
}

async function clickFirstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      return true;
    }
  }
  return false;
}

async function logout(page) {
  const logoutControl = page.locator(
    'button:has-text("Sign out"), button:has-text("Logout"), a:has-text("Sign out"), a:has-text("Logout")'
  );
  if (await clickFirstVisible(logoutControl)) {
    await page.waitForTimeout(2000);
    return verifyLoggedOut(page);
  }

  const menuControl = page.locator(
    'button[aria-haspopup], button[aria-label*="account" i], button[aria-label*="profile" i], button[aria-label*="user" i]'
  );
  if (await clickFirstVisible(menuControl)) {
    await page.waitForTimeout(500);
    if (await clickFirstVisible(logoutControl)) {
      await page.waitForTimeout(2000);
      return verifyLoggedOut(page);
    }
  }

  await page.goto('https://ledgerlab.ai/api/auth/signout');
  await waitForPageReady(page);
  const signOutSubmit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Sign out")');
  if (await clickFirstVisible(signOutSubmit)) {
    await page.waitForTimeout(2000);
    return verifyLoggedOut(page);
  }

  await page.goto('https://ledgerlab.ai/logout');
  await waitForPageReady(page);
  await page.waitForTimeout(1000);
  return verifyLoggedOut(page);
}

async function enterOTP(page, code) {
  const otpInputs = page.locator('input[maxlength="1"]');
  const otpCount = await otpInputs.count();

  if (otpCount >= 6) {
    await otpInputs.first().click();
    await page.waitForTimeout(500);
    for (const digit of code) {
      await page.keyboard.type(digit);
      await page.waitForTimeout(500);
    }
    return true;
  }

  const codeInput = page.locator('input[name*="code"], input[id*="code"]');
  if (await codeInput.count() > 0) {
    await codeInput.first().fill(code);
    return true;
  }

  return false;
}

async function hasPasswordStep(page) {
  const bodyText = await page.textContent('body').catch(() => '');
  const text = bodyText.toLowerCase();
  return text.includes('set your password') ||
         text.includes('create a secure password') ||
         text.includes('create password') ||
         text.includes('new password') ||
         text.includes('reset your password');
}

async function setAllPasswordFields(page, password) {
  const passwordFields = page.locator('input[type="password"]');
  const pwCount = await passwordFields.count();

  if (pwCount === 0) {
    throw new Error('Password step detected, but no password inputs were found');
  }

  for (let i = 0; i < pwCount; i++) {
    await passwordFields.nth(i).fill(password);
  }

  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

module.exports = {
  dismissCookieBanner,
  enterOTP,
  hasPasswordStep,
  isAuthenticatedUrl,
  login,
  logout,
  setAllPasswordFields,
  verifyAuthenticated,
  verifyLoggedOut,
  waitForPageReady,
};
