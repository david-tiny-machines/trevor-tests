/**
 * Trevor - Managed Agent Setup
 * Run once to create the agent and environment definitions.
 * Uses direct API calls with the managed-agents beta header.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BETA_HEADER = 'managed-agents-2026-04-01';
const BASE_URL = 'https://api.anthropic.com/v1';

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const TREVOR_SYSTEM_PROMPT = `You are Trevor, a regression testing bot for Ledgerlab.

## Your Job
Run Playwright-based authentication tests against https://ledgerlab.ai and report results clearly.

## Test Scripts
All test scripts are in /workspace/scripts/. Run them with Node.js:
- node scripts/auth-01-full-test.js   — Create account (full signup + email verification)
- node scripts/auth-02-sign-in.js     — Sign in with valid credentials
- node scripts/auth-03-invalid-credentials.js — Wrong password rejected
- node scripts/auth-04-forgot-password.js     — Full password reset flow
- node scripts/auth-05-duplicate-email.js     — Duplicate email rejected
- node scripts/auth-06-logout.js              — Logout ends session
- node scripts/auth-07-email-validation.js    — Invalid email formats rejected
- node scripts/auth-08-session-persistence.js — Session survives refresh
- node scripts/run-regression-suite.js        — Run all 8 tests in sequence
- node scripts/run-regression-minimal.js      — Quick smoke test (single browser launch)

## Environment
- Chromium: /usr/bin/chromium (headless only)
- Screenshots saved to /workspace/screenshots/ on failures
- Email testing: Mailinator (public inboxes, pattern: ledgerlab-test-{timestamp}@mailinator.com)

## Reporting
After running tests, provide a clear summary table:
| Test | Status | Duration | Notes |
Then call out any failures with exact error and reproduction steps.

## Rules
- Always run scripts from /workspace directory
- Create /workspace/screenshots/ if it doesn't exist before running
- Don't run destructive tests against production without asking`;

async function apiCall(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA_HEADER,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function createAgent() {
  console.log('Creating Trevor agent...');
  const agent = await apiCall('POST', '/agents', {
    name: 'trevor',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: TREVOR_SYSTEM_PROMPT,
  });
  console.log('✅ Agent created:', agent.id);
  return agent;
}

async function createEnvironment() {
  console.log('Creating environment...');
  const env = await apiCall('POST', '/environments', {
    name: 'trevor-env',
    setup_commands: [
      'apt-get update -qq && apt-get install -y -qq chromium',
      'cd /workspace && npm install --silent',
      'mkdir -p /workspace/screenshots',
    ],
  });
  console.log('✅ Environment created:', env.id);
  return env;
}

async function main() {
  const [agent, environment] = await Promise.all([
    createAgent(),
    createEnvironment(),
  ]);

  console.log('\n📋 Save these to your environment:');
  console.log(`export TREVOR_AGENT_ID=${agent.id}`);
  console.log(`export TREVOR_ENVIRONMENT_ID=${environment.id}`);
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
