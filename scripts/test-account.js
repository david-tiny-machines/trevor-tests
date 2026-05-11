const fs = require('fs');

const ACCOUNT_FILE = '/tmp/trevor-test-account.json';

// Resolve test credentials, preferring explicit env vars and falling back to
// the account that AUTH-01 persists after a successful signup. AUTH-02, AUTH-03
// and AUTH-05 all depend on a real, verified account existing — using the one
// AUTH-01 just created keeps the suite self-contained instead of requiring a
// long-lived shared account.
function resolveAccount({ requirePassword = true } = {}) {
  let email = process.env.LEDGERLAB_TEST_EMAIL;
  let password = process.env.LEDGERLAB_TEST_PASSWORD;
  let sidToken = process.env.GUERRILLA_MAIL_SID_TOKEN;
  let source = 'env';

  if (!email || (requirePassword && !password) || !sidToken) {
    try {
      const raw = fs.readFileSync(ACCOUNT_FILE, 'utf8');
      const data = JSON.parse(raw);
      email = email || data.email;
      password = password || data.password;
      sidToken = sidToken || data.sid_token;
      source = 'auth-01';
    } catch {
      // No fallback available; caller will handle the missing-credentials case.
    }
  }

  return { email, password, sidToken, source };
}

function updateAccountPassword(email, password) {
  try {
    const raw = fs.readFileSync(ACCOUNT_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data.email !== email) return false;
    fs.writeFileSync(ACCOUNT_FILE, JSON.stringify({
      ...data,
      password,
      updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

module.exports = { resolveAccount, updateAccountPassword, ACCOUNT_FILE };
