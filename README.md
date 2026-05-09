# Trevor

Regression testing agent for [ledgerlab.ai](https://ledgerlab.ai).

Trevor runs Playwright auth tests inside a fresh Anthropic Managed Agents container on each run, eliminating the zombie-Chromium problem from persistent containers.

## Quick start

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY etc.
cd managed-agent
npm run run -- "run the smoke test"
npm run run -- "run the full regression suite"
```

Or trigger from Slack: `/trevor <task>` or `@Trevor <task>` (deployed at Railway via `npm run slack`).

## Tests

| ID | Test | What it checks |
|----|------|----------------|
| AUTH-01 | Create Account | Signup + email verification (Guerrilla Mail). Persists the verified account to `/tmp/trevor-test-account.json` for downstream tests. |
| AUTH-02 | Sign In | Login with valid credentials (uses AUTH-01's account if env vars unset) |
| AUTH-03 | Invalid Credentials | Wrong password rejected |
| AUTH-04 | Forgot Password | Full reset flow end-to-end |
| AUTH-05 | Duplicate Email | Re-registration rejected |
| AUTH-06 | Logout | Session termination verified |
| AUTH-07 | Email Validation | Invalid email formats rejected |
| AUTH-08 | Session Persistence | Session survives refresh and navigation |

AUTH-01 must run before AUTH-02/03/05 — those exit with code 2 if neither `LEDGERLAB_TEST_EMAIL` nor a prior AUTH-01 account file is available.

## Managing the deployed agent

The agent (`TREVOR_AGENT_ID`) is created once and updated in place:

```bash
cd managed-agent
npm run setup    # one-time: creates agent + environment, prints IDs
npm run update   # push system-prompt.js + model changes to the live agent
```

`npm run update` keeps the same agent ID, bumps its version, and is the right way to roll out prompt/model changes — no env-var swap needed locally or on Railway.

## Test scripts

**Don't run the test scripts directly on your host.** They require Playwright + Chromium and are designed to run inside the managed-agent container. Always invoke via `npm run run` (or Slack).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEBUGGING.md](docs/DEBUGGING.md).
