# Trevor — Ledgerlab Auth Regression Tests

Playwright-based auth flow regression tests for [ledgerlab.ai](https://ledgerlab.ai).

## Tests

| ID | Name | Description |
|----|------|-------------|
| AUTH-01 | Create Account | Full signup with email verification via Mailinator |
| AUTH-02 | Sign In | Login with valid credentials |
| AUTH-03 | Invalid Credentials | Wrong password rejected |
| AUTH-04 | Forgot Password | Full reset flow end-to-end |
| AUTH-05 | Duplicate Email | Re-registration rejected |
| AUTH-06 | Logout | Session termination verified |
| AUTH-07 | Email Validation | Invalid email formats rejected |
| AUTH-08 | Session Persistence | Session survives refresh and navigation |

## Running

```bash
npm install
npm test                    # Full suite
npm run test:smoke          # Quick smoke test
npm run test:health         # HTTP-only health check (no browser)
```

## Environment Variables

```bash
LEDGERLAB_TEST_EMAIL=ledgerlab-test-1769824520783@mailinator.com
LEDGERLAB_TEST_PASSWORD=TestPass123!
```

## Requirements

- Node.js 18+
- Chromium at `/usr/bin/chromium`
- Playwright (`npm install`)
