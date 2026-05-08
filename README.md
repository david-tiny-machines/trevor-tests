# Trevor

Regression testing agent for [ledgerlab.ai](https://ledgerlab.ai).

Trevor runs Playwright auth tests inside a fresh Anthropic Managed Agents container on each run, eliminating the zombie-Chromium problem from persistent containers.

## Quick start

```bash
cd managed-agent
node run-session.js "run the smoke test"
node run-session.js "run the full regression suite"
```

## Tests

| ID | Test | What it checks |
|----|------|----------------|
| AUTH-01 | Create Account | Signup + email verification (Mailinator) |
| AUTH-02 | Sign In | Login with valid credentials |
| AUTH-03 | Invalid Credentials | Wrong password rejected |
| AUTH-04 | Forgot Password | Full reset flow end-to-end |
| AUTH-05 | Duplicate Email | Re-registration rejected |
| AUTH-06 | Logout | Session termination verified |
| AUTH-07 | Email Validation | Invalid email formats rejected |
| AUTH-08 | Session Persistence | Session survives refresh and navigation |

## Running tests directly (without the agent)

```bash
npm install
npm test              # Full suite
npm run test:smoke    # Quick smoke test
npm run test:health   # HTTP-only health check (no browser)
```

Requires Node 18+, Chromium at `/usr/bin/chromium`.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
