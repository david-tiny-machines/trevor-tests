const BASE = 'https://api.guerrillamail.com/ajax.php';

async function fetchJson(url, { retries = 3, backoffMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 120)}`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries - 1) await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw new Error(`Guerrilla Mail request failed after ${retries} attempts: ${lastErr.message}`);
}

async function createInbox(prefix) {
  const { sid_token } = await fetchJson(`${BASE}?f=get_email_address`);
  const { email_addr } = await fetchJson(
    `${BASE}?f=set_email_user&email_user=${encodeURIComponent(prefix)}&sid_token=${encodeURIComponent(sid_token)}`
  );
  return { email: email_addr, sid_token };
}

// Track the highest mail_id we've already seen so we never re-match emails
// from earlier in the same inbox (e.g. an "Activate" email from signup
// shouldn't satisfy a later wait for "Activate" from password reset).
async function waitForCode(sid_token, subjectKeyword, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  let lastSeenId = 0;

  // Establish the baseline: anything already in the inbox at the moment we
  // start waiting should be ignored. waitForCode is always called immediately
  // before the action that triggers the email.
  try {
    const initial = await fetchJson(`${BASE}?f=check_email&seq=0&sid_token=${encodeURIComponent(sid_token)}`);
    for (const m of initial.list || []) {
      const id = Number(m.mail_id) || 0;
      if (id > lastSeenId) lastSeenId = id;
    }
  } catch (err) {
    console.log(`[mail-helper] Baseline poll failed (continuing): ${err.message}`);
  }

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));

    let data;
    try {
      data = await fetchJson(`${BASE}?f=check_email&seq=${lastSeenId}&sid_token=${encodeURIComponent(sid_token)}`);
    } catch (err) {
      console.log(`[mail-helper] Poll failed (will retry): ${err.message}`);
      continue;
    }

    const msgs = (data.list || []).filter(m => (Number(m.mail_id) || 0) > lastSeenId);
    if (msgs.length > 0) {
      console.log(`[mail-helper] New email(s): ${msgs.map(m => `"${m.mail_subject}"`).join(', ')}`);
    }

    for (const msg of msgs) {
      const id = Number(msg.mail_id) || 0;
      if (id > lastSeenId) lastSeenId = id;

      if (msg.mail_subject && msg.mail_subject.toLowerCase().includes(subjectKeyword.toLowerCase())) {
        let full;
        try {
          full = await fetchJson(`${BASE}?f=fetch_email&email_id=${encodeURIComponent(msg.mail_id)}&sid_token=${encodeURIComponent(sid_token)}`);
        } catch (err) {
          console.log(`[mail-helper] Fetch failed for ${msg.mail_id}: ${err.message}`);
          continue;
        }
        const body = full.mail_body || '';
        const match = body.match(/\b(\d{6})\b/) || body.match(/(\d\s+\d\s+\d\s+\d\s+\d\s+\d)/);
        if (match) return match[1].replace(/\s/g, '');
        console.log(`[mail-helper] Email matched subject but no 6-digit code found in body`);
      }
    }
  }

  return null;
}

module.exports = { createInbox, waitForCode };
