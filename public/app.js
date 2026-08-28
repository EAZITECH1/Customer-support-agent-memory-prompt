// public/app.js
// Talks to the backend over SSE. No localStorage/sessionStorage — the session id
// lives only in memory (per requirements), so a refresh starts a fresh session.

const thread = document.getElementById('thread');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const nsLabel = document.getElementById('nsLabel');
const resetBtn = document.getElementById('reset');

let sessionId = newId();
let busy = false;

function newId() {
  return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Health / status light ──────────────────────────────────
async function refreshHealth() {
  try {
    const h = await fetch('/api/health').then((r) => r.json());
    const memOk = h.memwal?.ready;
    statusDot.className = 'dot ' + (memOk ? 'on' : 'off');
    statusText.textContent = memOk ? 'MEMORY ONLINE' : 'MEMORY OFFLINE';
    if (h.memwal?.namespace) nsLabel.textContent = 'NS · ' + h.memwal.namespace;
    if (!memOk && h.memwal?.error) {
      systemNote('Memory offline — ' + h.memwal.error, true);
    }
    if (h.systemPrompt && !h.systemPrompt.found) {
      systemNote('Using placeholder prompt — add support-bot-prompt.md to override.', true);
    }
  } catch {
    statusDot.className = 'dot off';
    statusText.textContent = 'OFFLINE';
  }
}

// ── Rendering ──────────────────────────────────────────────
function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = role === 'user' ? 'You' : 'EAZITECH Support';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  el.append(who, bubble);
  thread.appendChild(el);
  scroll();
  return bubble;
}

function systemNote(text, isErr) {
  const el = document.createElement('div');
  el.className = 'mem' + (isErr ? ' err' : '');
  el.innerHTML = `<span class="mdot"></span><span></span>`;
  el.lastChild.textContent = text;
  thread.appendChild(el);
  scroll();
  return el;
}

// A memory-activity chip that we mutate from "pending" → resolved.
function memChip(text) {
  const el = document.createElement('div');
  el.className = 'mem pending';
  el.innerHTML = `<span class="mdot"></span><span class="mtext"></span>`;
  el.querySelector('.mtext').textContent = text;
  thread.appendChild(el);
  scroll();
  return el;
}
function resolveChip(el, text, blobId, ok = true) {
  el.className = 'mem' + (ok ? '' : ' err');
  el.querySelector('.mtext').textContent = text;
  if (blobId) {
    const b = document.createElement('span');
    b.className = 'blob';
    b.textContent = 'blob ' + blobId.slice(0, 10) + '…';
    b.title = blobId;
    el.appendChild(b);
  }
  scroll();
}

function thinking() {
  const el = document.createElement('div');
  el.className = 'mem thinking';
  el.innerHTML = `<span class="mdot"></span><span class="typing"><i></i><i></i><i></i></span>`;
  thread.appendChild(el);
  scroll();
  return el;
}

function scroll() {
  thread.scrollTop = thread.scrollHeight;
}

// Map a tool name to friendly ticker copy.
function toolCopy(tool, phase, detail) {
  const R = {
    memwal_health: ['checking memory…', detail || 'memory checked'],
    memwal_recall: ['recalling past resolutions…', detail ? `recalled ${detail}` : 'recall complete'],
    memwal_remember: ['saving to Walrus…', 'saved to Walrus ✓'],
    memwal_remember_bulk: ['saving batch to Walrus…', 'saved batch to Walrus ✓'],
    memwal_analyze: ['analyzing memory…', 'memory analyzed'],
    memwal_restore: ['restoring memory index…', 'index restored'],
  };
  const pair = R[tool] || [`${tool}…`, `${tool} done`];
  return phase === 'start' ? pair[0] : pair[1];
}

// Append the namespace as a subtle "· ns" suffix.
function withNs(text, ns) {
  return ns ? `${text}  ·  ${ns}` : text;
}

// ── Chat over SSE ──────────────────────────────────────────
async function send(message) {
  busy = true;
  sendBtn.disabled = true;
  input.value = '';
  addMsg('user', message);

  let thinkEl = thinking();
  let activeChips = new Map(); // tool -> chip element (most recent)

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Parse complete SSE frames (separated by a blank line).
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const { event, data } = parseFrame(frame);
        if (!event) continue;
        handleEvent(event, data);
      }
    }
  } catch (err) {
    if (thinkEl) { thinkEl.remove(); thinkEl = null; }
    systemNote('Error: ' + err.message, true);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  function handleEvent(event, data) {
    if (event === 'agent_status') {
      if (data.phase === 'memory_offline') {
        systemNote('memory offline (relayer) — answering without recall', true);
        statusDot.className = 'dot off';
        statusText.textContent = 'MEMORY OFFLINE';
      }
      // keep the single thinking indicator alive
      if (!thinkEl) thinkEl = thinking();
    } else if (event === 'tool_start') {
      if (thinkEl) { thinkEl.remove(); thinkEl = null; }
      const chip = memChip(withNs(toolCopy(data.tool, 'start'), data.namespace));
      activeChips.set(data.tool, chip);
    } else if (event === 'tool_end') {
      const chip = activeChips.get(data.tool);
      const copy = withNs(toolCopy(data.tool, 'end', data.detail), data.namespace);
      if (chip) resolveChip(chip, copy, data.blobId, data.ok);
      else resolveChip(memChip(copy), copy, data.blobId, data.ok);
      activeChips.delete(data.tool);
      thinkEl = thinking(); // model will think again after the tool
    } else if (event === 'reply') {
      if (thinkEl) { thinkEl.remove(); thinkEl = null; }
      addMsg('bot', data.text || '(no response)');
    } else if (event === 'error') {
      if (thinkEl) { thinkEl.remove(); thinkEl = null; }
      systemNote('Error: ' + (data.message || 'unknown'), true);
    }
  }
}

function parseFrame(frame) {
  let event = null;
  const dataLines = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  let data = {};
  if (dataLines.length) {
    try { data = JSON.parse(dataLines.join('\n')); } catch { data = { raw: dataLines.join('\n') }; }
  }
  return { event, data };
}

// ── Wiring ─────────────────────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg || busy) return;
  send(msg);
});

resetBtn.addEventListener('click', async () => {
  if (busy) return;
  await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
  sessionId = newId();
  thread.innerHTML = '';
  systemNote('New session started.');
  input.focus();
});

refreshHealth();
input.focus();
