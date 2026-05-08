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

// Capture raw body for signature verification before JSON/urlencoded parsing
app.use((req, _res, next) => {
  let raw = '';
  req.on('data', chunk => raw += chunk);
  req.on('end', () => { req.rawBody = raw; next(); });
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function postToSlack(channel, text) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  });
}

async function runTrevorSession(task, channel) {
  try {
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

    let output = '';
    for await (const event of stream) {
      if (event.type === 'agent.message') {
        for (const block of event.content ?? []) {
          if (block.text) output += block.text;
        }
      }
    }

    const MAX = 2800;
    const body = output.length > MAX
      ? output.slice(-MAX) + '\n_(truncated)_'
      : output || '_(no output)_';

    await postToSlack(channel, `🧪 *Trevor results for* _${task}_:\n\`\`\`\n${body}\n\`\`\``);

  } catch (err) {
    console.error('Trevor session error:', err);
    await postToSlack(channel, `❌ Trevor error: ${err.message}`);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, agent: AGENT_ID }));

app.post('/slack/trevor', (req, res) => {
  if (SLACK_SIGNING_SECRET && !verifySlackSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { text, channel_id } = req.body;
  if (!channel_id) return res.status(400).json({ error: 'Invalid request' });

  const task = text?.trim() || 'Run the full auth test suite and report results';

  // Respond to Slack within 3s, run the session async
  res.json({ response_type: 'in_channel', text: `🧪 Trevor starting: _${task}_` });
  runTrevorSession(task, channel_id).catch(console.error);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Trevor Slack trigger on :${PORT} — agent ${AGENT_ID}`);
});
