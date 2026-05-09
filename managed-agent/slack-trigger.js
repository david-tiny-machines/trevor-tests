import express from 'express';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_ID = process.env.TREVOR_AGENT_ID;
const ENVIRONMENT_ID = process.env.TREVOR_ENVIRONMENT_ID;
const REPO_URL = process.env.TREVOR_REPO_URL;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// Verify the request actually came from Slack
function verifySlackSignature(req) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // replay protection
  const base = `v0:${timestamp}:${req.rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(base).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Capture raw body via verify callback so urlencoded parsing still works
app.use(express.urlencoded({
  extended: true,
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));

async function postToSlack(channel, text, thread_ts = null) {
  const body = { channel, text };
  if (thread_ts) body.thread_ts = thread_ts;
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) console.error('Slack post failed:', JSON.stringify(json));
  else console.log('Slack post ok to', channel);
  return json;
}

async function runTrevorSession(task, channel) {
  let thread_ts = null;
  try {
    const start = await postToSlack(channel, `🧪 Trevor starting: _${task}_`);
    thread_ts = start.ts;

    const cloneStep = `git clone --depth 1 ${REPO_URL} /workspace && cd /workspace && npm install && (npx playwright install chromium 2>/dev/null || apt-get install -y chromium-browser 2>/dev/null || true) && mkdir -p /workspace/screenshots`;

    const session = await client.beta.sessions.create({
      agent: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      title: `Trevor: ${task.slice(0, 50)}`,
    });

    const stream = await client.beta.sessions.events.stream(session.id);

    await client.beta.sessions.events.send(session.id, {
      events: [{
        type: 'user.message',
        content: [{ type: 'text', text: `Run this setup command first: ${cloneStep}\n\nThen: ${task}` }],
      }],
    });

    console.log('Session created:', session.id, '— streaming events...');
    for await (const event of stream) {
      console.log('Event:', event.type);
      if (event.type === 'agent.message') {
        const text = (event.content ?? []).filter(b => b.text).map(b => b.text).join('');
        if (text.trim()) await postToSlack(channel, text, thread_ts);
      }
      if (event.type === 'session.status_idle' || event.type === 'session.status_terminated') break;
    }
    console.log('Stream ended.');

  } catch (err) {
    console.error('Trevor session error:', err);
    await postToSlack(channel, `❌ Trevor error: ${err.message}`, thread_ts);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, agent: AGENT_ID }));

// Slash command: /trevor <task>
app.post('/slack/trevor', (req, res) => {
  if (SLACK_SIGNING_SECRET && !verifySlackSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { text, channel_id } = req.body;
  if (!channel_id) return res.status(400).json({ error: 'Invalid request' });

  const task = text?.trim() || 'Run the full auth test suite and report results';

  res.sendStatus(200);
  runTrevorSession(task, channel_id).catch(console.error);
});

// Events API: @Trevor <task>
app.post('/slack/events', (req, res) => {
  if (SLACK_SIGNING_SECRET && !verifySlackSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, challenge, event } = req.body;

  // URL verification handshake when first configuring the Events API endpoint
  if (type === 'url_verification') return res.json({ challenge });

  // Ignore retries — Slack resends if we don't respond fast enough, but the
  // session is already running so we'd double-trigger without this guard.
  if (req.headers['x-slack-retry-num']) return res.sendStatus(200);

  if (type === 'event_callback' && event?.type === 'app_mention') {
    const channel = event.channel;
    // Strip the @Trevor mention from the message text
    const task = event.text.replace(/^<@[^>]+>\s*/, '').trim()
      || 'Run the full auth test suite and report results';

    res.sendStatus(200);
    runTrevorSession(task, channel).catch(console.error);
    return;
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Trevor Slack trigger on :${PORT} — agent ${AGENT_ID}`);
});
