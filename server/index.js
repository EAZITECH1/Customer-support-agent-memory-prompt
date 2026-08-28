// server/index.js
// Localhost customer-support chat backend.
//
// Flow per user message:
//   UI --POST /api/chat--> backend
//   backend: system prompt (support-agent-prompt.md) + history + user msg
//            -> OpenAI-compatible model WITH MemWal tools
//            -> execute any tool calls against the MemWal MCP server (Walrus)
//            -> feed results back, loop until the model returns a final answer
//   backend --SSE events--> UI  (tool activity + final reply, live)

import 'dotenv/config';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MemWal, summarizeToolResult } from './memwal.js';
import { LLM } from './llm.js';
import { SessionStore } from './store.js';
import { materializeCredentials } from './credentials.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROMPT_PATH = join(ROOT, 'support-agent-prompt.md');
const PUBLIC_DIR = join(ROOT, 'public');

const PORT = Number(process.env.PORT || 8787);
const MAX_ROUNDS = Number(process.env.LLM_MAX_TOOL_ROUNDS || 6);
// Fallback namespace only — the system prompt drives per-area namespaces.
const NAMESPACE = process.env.MEMWAL_NAMESPACE || 'support';
const MEMWAL_HOME = join(ROOT, '.memwal-home');

// ── Boot dependencies ────────────────────────────────────────────────────────
const store = new SessionStore(join(ROOT, 'data', 'sessions.json'));

const llm = new LLM({
  baseUrl: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
  temperature: process.env.LLM_TEMPERATURE,
});

// The support wallet's credentials come from .env (MEMWAL_CREDENTIALS_JSON) and
// are written into an isolated HOME so the machine's main ~/.memwal is untouched.
// If unset, the child falls back to the machine's default ~/.memwal login.
let walletInfo = null;
try {
  walletInfo = materializeCredentials(process.env.MEMWAL_CREDENTIALS_JSON, MEMWAL_HOME);
} catch (err) {
  console.error('[memwal] credential error:', err.message);
}

const memwal = new MemWal({
  spec: process.env.MEMWAL_MCP_SPEC,
  namespace: NAMESPACE,
  debug: process.env.MEMWAL_MCP_DEBUG === '1',
  home: walletInfo ? MEMWAL_HOME : undefined,
});

let memwalReady = false;
let memwalToolNames = [];
let memwalError = null;
let lastConnectAt = 0;
let connecting = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connectOnce() {
  memwalToolNames = await memwal.connect();
  memwalReady = true;
  memwalError = null;
  lastConnectAt = Date.now();
  const via = walletInfo
    ? `wallet=${walletInfo.accountId.slice(0, 10)}… (from .env, isolated HOME)`
    : 'wallet=machine default (~/.memwal)';
  console.log(`[memwal] ready · ${via} · default-ns="${NAMESPACE}" · tools: ${memwalToolNames.join(', ')}`);
}

// Boot with a few retries — the relayer occasionally 503s on the SSE handshake.
async function initMemWal(attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      await connectOnce();
      return;
    } catch (err) {
      memwalReady = false;
      memwalError = err.message;
      lastConnectAt = Date.now();
      if (i < attempts - 1) {
        console.warn(`[memwal] connect attempt ${i + 1} failed (${err.message}); retrying…`);
        await sleep(2500 * (i + 1));
      } else {
        console.error('[memwal] FAILED to connect:', err.message);
      }
    }
  }
}

// Lazily recover the connection if a transient outage dropped it. Throttled so a
// sustained outage doesn't stall every request. Deduped via `connecting`.
async function ensureMemWal() {
  if (memwalReady) return true;
  if (connecting) return connecting;
  if (Date.now() - lastConnectAt < 12000) return false;
  connecting = (async () => {
    try {
      await connectOnce();
      return true;
    } catch (err) {
      memwalReady = false;
      memwalError = err.message;
      lastConnectAt = Date.now();
      return false;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

// ── System prompt ─────────────────────────────────────────────────────────────
function loadSystemPrompt() {
  let base;
  let found = existsSync(PROMPT_PATH);
  if (found) {
    base = readFileSync(PROMPT_PATH, 'utf8').trim();
  } else {
    base =
      'You are a helpful, concise customer-support agent for EAZITECH. ' +
      'Be warm, direct, and solution-focused. (Placeholder prompt — create support-agent-prompt.md to override.)';
  }
  // Minimal runtime addendum: the human-authored prompt above owns the memory
  // behaviour and namespace scheme. We only pin the date and the tool surface so
  // the loop works, without contradicting the prompt.
  const runtime = [
    '',
    '---',
    '[Runtime context — not part of the human-authored prompt above]',
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    'Tools available in THIS deployment: memwal_health, memwal_recall, memwal_remember, ' +
      'memwal_remember_bulk, memwal_analyze, memwal_restore. Use memwal_health for the ' +
      'first-run connectivity check.',
    'memwal_login / memwal_logout are NOT available to you here — authentication is handled ' +
      'out-of-band by the operator (the support wallet is already logged in). If memwal_health ' +
      'reports UNHEALTHY, do not attempt to log in yourself and do not name any tool, command, ' +
      'or restore step: give the customer only a brief, non-technical line that support is ' +
      'temporarily unavailable and to try again shortly, then stop. Restoring memory is the ' +
      'operator\'s job, handled outside this chat.',
    'memwal_remember / memwal_analyze take a single `text` field — pack the structured resolution ' +
      '(symptom, context, attempted, ruled_out, worked, root_cause, verification, confidence, etc.) ' +
      'into that text. Pass a `namespace` argument on each call as the instructions above direct; ' +
      `if you omit it, it defaults to "${NAMESPACE}".`,
    'Do not ask permission to recall or remember — do it, then reply.',
  ].join('\n');
  return { text: base + '\n' + runtime, found };
}

// Synthetic health tool the model can call (the MCP server has none). Exposed
// even when memory is down, so the model can detect it and refuse per the prompt.
const HEALTH_TOOL = {
  type: 'function',
  function: {
    name: 'memwal_health',
    description:
      'Check Walrus Memory connectivity and authentication for the support memory system. ' +
      'Call this once at the start of a session before relying on memory. Returns HEALTHY or ' +
      'UNHEALTHY with detail. Takes no arguments.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
};

// ── SSE helpers ───────────────────────────────────────────────────────────────
function sse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function argsPreview(name, args) {
  if (!args || typeof args !== 'object') return '';
  const s =
    args.query || args.content || args.text || args.fact ||
    (Array.isArray(args.items) ? `${args.items.length} items` : '') || '';
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str.length > 80 ? str.slice(0, 80) + '…' : str;
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (_req, res) => {
  const prompt = loadSystemPrompt();
  res.json({
    ok: true,
    memwal: {
      ready: memwalReady,
      tools: memwalToolNames,
      namespace: NAMESPACE,
      wallet: walletInfo
        ? { accountId: walletInfo.accountId, source: 'env', isolated: true }
        : { source: 'machine-default' },
      error: memwalError,
    },
    llm: { baseUrl: llm.baseUrl, model: llm.model, configured: llm.configured },
    systemPrompt: { file: 'support-agent-prompt.md', found: prompt.found },
  });
});

app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) store.reset(sessionId);
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body || {};
  if (!sessionId || !message) {
    res.status(400).json({ error: 'sessionId and message are required' });
    return;
  }

  // Set up SSE.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const finish = (extra = {}) => {
    sse(res, 'done', { ok: true, ...extra });
    res.end();
  };

  try {
    const system = loadSystemPrompt().text;
    const session = store.get(sessionId);
    const transcript = session.messages.slice(); // OpenAI-format msgs, no system
    transcript.push({ role: 'user', content: message });

    // Recover memory if a transient relayer outage dropped it since boot.
    await ensureMemWal();
    if (!memwalReady) sse(res, 'agent_status', { phase: 'memory_offline' });
    // Always expose memwal_health so the model can verify (and, per the prompt,
    // refuse to answer if memory is down). Memory tools only when connected.
    const tools = [HEALTH_TOOL, ...(memwalReady ? memwal.asOpenAITools() : [])];

    let finalText = null;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      sse(res, 'agent_status', { phase: 'thinking' });

      const assistant = await llm.complete({
        messages: [{ role: 'system', content: system }, ...transcript],
        tools,
      });

      // Normalize + record the assistant turn.
      const toolCalls = assistant.tool_calls || [];
      transcript.push({
        role: 'assistant',
        content: assistant.content ?? '',
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });

      if (!toolCalls.length) {
        finalText = assistant.content || '';
        break;
      }

      // Execute each tool call against MemWal and feed results back.
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }

        const isHealth = name === 'memwal_health';
        const ns = isHealth ? null : args?.namespace || NAMESPACE;
        sse(res, 'tool_start', { tool: name, namespace: ns, preview: isHealth ? '' : argsPreview(name, args) });

        let result;
        if (isHealth) {
          const h = await memwal.health();
          result = {
            ok: h.ok,
            text: h.ok
              ? `HEALTHY. Walrus Memory is reachable and authenticated (${h.detail}). Wallet ${
                  walletInfo?.accountId?.slice(0, 12) || 'machine-default'
                }…. Memory is live — proceed.`
              : `UNHEALTHY: support memory is temporarily unavailable (${h.detail}). ` +
                'Do not answer support questions from general knowledge. To the customer, say ONLY a ' +
                'brief, plain line that support is temporarily unavailable and to try again shortly — ' +
                'do NOT mention memory, Walrus, a relayer, tools, login, restore, a namespace, or any ' +
                'command. Operator remediation happens outside this chat; never surface it to the customer.',
          };
        } else if (memwal.isMemoryTool(name)) {
          result = await memwal.call(name, args);
        } else {
          result = { ok: false, text: `Unknown tool: ${name}` };
        }

        const summary = summarizeToolResult(name, result.text);
        sse(res, 'tool_end', {
          tool: name,
          namespace: ns,
          ok: result.ok,
          detail: summary.detail,
          blobId: summary.blobId,
        });

        transcript.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.text || (result.ok ? 'ok' : 'error'),
        });
      }
    }

    // If we ran out of rounds still calling tools, force a text-only answer.
    if (finalText === null) {
      sse(res, 'agent_status', { phase: 'thinking' });
      const forced = await llm.complete({
        messages: [{ role: 'system', content: system }, ...transcript],
        // no tools -> model must produce prose
      });
      finalText = forced.content || '(no response)';
      transcript.push({ role: 'assistant', content: finalText });
    }

    store.setMessages(sessionId, transcript);
    sse(res, 'reply', { text: finalText });
    finish();
  } catch (err) {
    console.error('[chat] error:', err);
    sse(res, 'error', { message: err.message || String(err) });
    finish({ ok: false });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
// Listen FIRST so the web app is always reachable, even if MemWal is slow/down.
// Connect memory in the background; per-request ensureMemWal() recovers it later.
app.listen(PORT, () => {
  console.log(`\n  eazitech-support-chat  →  http://localhost:${PORT}\n`);
  console.log('  connecting to Walrus Memory…');
});
initMemWal().then(() => {
  if (!memwalReady) {
    console.log('  ⚠  MemWal not connected yet (relayer/auth). Memory recovers automatically on the next chat.');
    console.log('     If it persists: check the relayer, or re-run  npm run memwal:login\n');
  }
});

// Clean shutdown so the child MCP process doesn't linger (per your MemWal notes).
async function shutdown() {
  console.log('\n[server] shutting down…');
  await memwal.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
