const BASE = 'https://api.guerrillamail.com/ajax.php';

async function createInbox(prefix) {
  const sessionRes = await fetch(`${BASE}?f=get_email_address`);
  const { sid_token } = await sessionRes.json();

  const setRes = await fetch(`${BASE}?f=set_email_user&email_user=${prefix}&sid_token=${sid_token}`);
  const { email_addr } = await setRes.json();

  return { email: email_addr, sid_token };
}

async function waitForCode(sid_token, subjectKeyword, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  let seq = 0;

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}?f=check_email&seq=${seq}&sid_token=${sid_token}`);
    const data = await res.json();
    const msgs = data.list || [];

    if (msgs.length > 0) {
      console.log(`[mail-helper] Found ${msgs.length} email(s): ${msgs.map(m => `"${m.mail_subject}"`).join(', ')}`);
    }
    for (const msg of msgs) {
      if (msg.mail_subject && msg.mail_subject.toLowerCase().includes(subjectKeyword.toLowerCase())) {
        const fetchRes = await fetch(`${BASE}?f=fetch_email&email_id=${msg.mail_id}&sid_token=${sid_token}`);
        const full = await fetchRes.json();
        const body = full.mail_body || '';
        const match = body.match(/\b(\d{6})\b/) || body.match(/(\d\s+\d\s+\d\s+\d\s+\d\s+\d)/);
        if (match) return match[1].replace(/\s/g, '');
        console.log(`[mail-helper] Email matched subject but no 6-digit code found in body`);
      }
    }

    seq = data.count || seq;
    await new Promise(r => setTimeout(r, 15000));
  }

  return null;
}

module.exports = { createInbox, waitForCode };
