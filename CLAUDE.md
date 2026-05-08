# Trevor

Regression testing agent for [ledgerlab.ai](https://ledgerlab.ai) using Anthropic Managed Agents.

## Structure

```
scripts/           Playwright auth test scripts (run inside the agent container)
managed-agent/     Agent runner — creates sessions, streams output
  run-session.js     Entry point: start a Trevor session
  setup-agent.js     One-time setup: create agent + environment
  slack-trigger.js   Express server for Slack slash command integration
docs/              Architecture and operational detail
```

## Config

Copy `.env.example` to `.env` and fill in the values. The `npm run` scripts load it automatically via `--env-file`.

```bash
cp .env.example .env
```

## Running

```bash
cd managed-agent && npm run run -- "run the smoke test"
```

## Important

**Never run test scripts directly or locally.** The scripts in `scripts/` require Playwright and run inside the managed agent's container — they are not meant to be executed on the host machine. Do not run `npm install` at the project root or attempt to run `node scripts/*.js` directly.

Always invoke tests through the managed agent runner:

```bash
cd managed-agent && npm run run -- "your task here"
```

## Rules for the agent running inside the container

- **Never write your own Playwright scripts.** Always run the existing scripts in `scripts/` exactly as-is using `node scripts/<name>.js`.
- **Never modify test scripts** unless explicitly asked to fix a bug in them.
- If asked to check Mailinator, debug email, or investigate a failure — run the relevant auth script, read its output, and report. Do not improvise a separate script.

## Current Status

AUTH-01 (account creation) and AUTH-04 (forgot password) were failing. Root cause identified and fixed — see [docs/DEBUGGING.md](docs/DEBUGGING.md). AUTH-02 through AUTH-08 (minus 01 and 04) verified passing. Full suite with email tests not yet re-verified after fix.

**Next step:** run the full suite to confirm AUTH-01 and AUTH-04 now pass.

```bash
cd managed-agent && npm run run -- "Run the full auth test suite and report results"
```

## Detail

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEBUGGING.md](docs/DEBUGGING.md).
