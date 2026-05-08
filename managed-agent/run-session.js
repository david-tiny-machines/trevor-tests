/**
 * Trevor - Start a test session
 * Usage: node run-session.js [task]
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_ID = process.env.TREVOR_AGENT_ID;
const ENVIRONMENT_ID = process.env.TREVOR_ENVIRONMENT_ID;
const REPO_URL = process.env.TREVOR_REPO_URL;
const BETA_HEADER = 'managed-agents-2026-04-01';
const BASE_URL = 'https://api.anthropic.com/v1';

if (!API_KEY || !AGENT_ID || !ENVIRONMENT_ID) {
  console.error('Missing required env vars: ANTHROPIC_API_KEY, TREVOR_AGENT_ID, TREVOR_ENVIRONMENT_ID');
  process.exit(1);
}

const task = process.argv[2] || 'run the smoke test and report results';

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
  if (!res.ok) throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function streamSession(sessionId) {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/stream`, {
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA_HEADER,
      'accept': 'text/event-stream',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stream error ${res.status}: ${err}`);
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;

      try {
        const event = JSON.parse(raw);
        if (event.type === 'text') {
          process.stdout.write(event.text);
        } else if (event.type === 'session_complete') {
          console.log(`\n${'─'.repeat(60)}`);
          console.log(`✅ Session complete (${event.stop_reason || 'done'})`);
        } else if (event.type === 'session_error') {
          console.log(`\n${'─'.repeat(60)}`);
          console.error(`❌ Session error: ${JSON.stringify(event)}`);
        }
      } catch {}
    }
  }
}

async function main() {
  console.log(`🧪 Starting Trevor: "${task}"\n${'─'.repeat(60)}`);

  const initCommand = REPO_URL
    ? `git clone ${REPO_URL} /workspace && cd /workspace && npm install --silent && mkdir -p /workspace/screenshots`
    : 'mkdir -p /workspace/screenshots';

  const session = await apiCall('POST', '/sessions', {
    agent_id: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
    input: task,
    environment_variables: {
      LEDGERLAB_TEST_EMAIL: process.env.LEDGERLAB_TEST_EMAIL || '',
      LEDGERLAB_TEST_PASSWORD: process.env.LEDGERLAB_TEST_PASSWORD || '',
    },
    setup_commands: [initCommand],
  });

  console.log(`Session: ${session.id}\n`);
  await streamSession(session.id);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
