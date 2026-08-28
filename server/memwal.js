// server/memwal.js
// Thin wrapper around the MemWal (Walrus Memory) MCP server.
//
// The backend acts as an MCP *client*: it spawns `npx -y @mysten-incubation/memwal-mcp`
// over stdio and reuses the login already stored at ~/.memwal/credentials.json.
// We expose the memory tools to the model, forward the model's tool calls here,
// and hand the results back. Writes go to the managed relayer -> Walrus.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// Prefer the locally-installed binary, launched directly with node: that's a
// single child process the transport can kill cleanly. The `npx` wrapper spawns
// a grandchild that can orphan and trip the relayer's per-IP connection cap.
function resolveLauncher(spec) {
  try {
    const pkgPath = require.resolve('@mysten-incubation/memwal-mcp/package.json');
    const pkg = require('@mysten-incubation/memwal-mcp/package.json');
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['memwal-mcp'];
    if (binRel) {
      return { command: process.execPath, base: [join(dirname(pkgPath), binRel)], via: 'local' };
    }
  } catch {
    /* not installed locally — fall back to npx */
  }
  return { command: 'npx', base: ['-y', spec], via: 'npx' };
}

// The memory tools we surface to the model. `memwal_login` / `memwal_logout`
// are intentionally excluded — the machine is already logged in and login needs
// a browser, which has no place inside a support turn.
const ALLOWED_TOOLS = new Set([
  'memwal_recall',
  'memwal_remember',
  'memwal_remember_bulk',
  'memwal_analyze',
  'memwal_restore',
]);

export class MemWal {
  constructor({ spec, namespace, debug = false, home, connectTimeoutMs } = {}) {
    this.spec = spec || '@mysten-incubation/memwal-mcp@0.0.7';
    this.namespace = namespace || 'support';
    this.debug = debug;
    // Isolated HOME so the child reads OUR wallet's creds, not the machine's ~/.memwal.
    this.home = home || null;
    // Fail fast if the relayer hangs during the handshake, so it can't wedge the app.
    this.connectTimeoutMs = Number(connectTimeoutMs || 20000);
    this.client = null;
    this.transport = null;
    this.tools = []; // raw MCP tool defs we chose to expose
  }

  async connect() {
    // If a previous (possibly half-open) connection exists, tear it down first
    // so a reconnect doesn't leak a child process.
    if (this.transport || this.client) await this.close();
    const launcher = resolveLauncher(this.spec);
    this.launchVia = launcher.via;
    const args = [...launcher.base, '--namespace', this.namespace];
    this.transport = new StdioClientTransport({
      command: launcher.command,
      args,
      // Inherit env; override HOME so the child loads OUR isolated wallet creds.
      env: {
        ...process.env,
        ...(this.home ? { HOME: this.home, USERPROFILE: this.home } : {}),
        ...(this.debug ? { MEMWAL_MCP_DEBUG: '1' } : {}),
      },
      stderr: 'inherit', // MemWal logs to stderr; surface it in our server logs
    });

    this.client = new Client(
      { name: 'eazitech-support-chat', version: '1.0.0' },
      { capabilities: {} }
    );

    // Guard the handshake + first listTools with a timeout so a 503-ing relayer
    // can't hang the connect() call (and, at boot, the whole server) indefinitely.
    const withTimeout = (p, label) =>
      Promise.race([
        p,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`MemWal ${label} timed out after ${this.connectTimeoutMs}ms`)), this.connectTimeoutMs)
        ),
      ]);

    try {
      await withTimeout(this.client.connect(this.transport), 'connect');
      var { tools } = await withTimeout(this.client.listTools(), 'listTools');
    } catch (err) {
      await this.close(); // don't leak the child process on a failed/timed-out connect
      throw err;
    }
    this.tools = tools.filter((t) => ALLOWED_TOOLS.has(t.name));

    if (this.tools.length === 0) {
      throw new Error(
        'MemWal MCP connected but exposed no memory tools. ' +
          'It may not be logged in — run: npx -y @mysten-incubation/memwal-mcp login'
      );
    }
    return this.tools.map((t) => t.name);
  }

  /** Tool defs in OpenAI /chat/completions "tools" format. */
  asOpenAITools() {
    return this.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  /**
   * Liveness probe against the relayer. The MemWal MCP server has no health
   * tool, so we synthesize one: a tiny recall confirms the relayer answers.
   * Returns { ok, detail }.
   */
  async health() {
    if (!this.client) return { ok: false, detail: 'not connected to the Walrus Memory relayer' };
    try {
      const res = await this.client.callTool({
        name: 'memwal_recall',
        arguments: { query: 'health-probe', namespace: '_health_probe', limit: 1 },
      });
      if (res?.isError) return { ok: false, detail: flattenContent(res.content) || 'relayer returned an error' };
      return { ok: true, detail: 'relayer reachable; authenticated; recall responded' };
    } catch (err) {
      return { ok: false, detail: err?.message || String(err) };
    }
  }

  isMemoryTool(name) {
    return ALLOWED_TOOLS.has(name);
  }

  /**
   * Execute one tool call against the MemWal MCP server.
   * Returns { ok, text, raw } — `text` is a string safe to feed back to the model.
   */
  async call(name, args) {
    if (!this.isMemoryTool(name)) {
      return { ok: false, text: `Unknown tool: ${name}`, raw: null };
    }
    // Default the namespace so the model never has to think about it.
    const finalArgs = { namespace: this.namespace, ...(args || {}) };
    try {
      const res = await this.client.callTool({ name, arguments: finalArgs });
      const text = flattenContent(res?.content);
      return { ok: !res?.isError, text, raw: res };
    } catch (err) {
      return { ok: false, text: `Tool error: ${err?.message || String(err)}`, raw: null };
    }
  }

  async close() {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.transport?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
  }
}

/** MCP tool results come back as an array of content parts; join the text ones. */
function flattenContent(content) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : '';
  return content
    .map((c) => {
      if (c?.type === 'text') return c.text;
      if (typeof c === 'string') return c;
      return JSON.stringify(c);
    })
    .join('\n')
    .trim();
}

/**
 * Best-effort UI summary of a tool result for the "memory ticker".
 * Pulls a Walrus blob id out of the result when present so the demo can show it.
 */
export function summarizeToolResult(name, resultText) {
  const out = { label: name, blobId: null, detail: '' };
  const text = resultText || '';

  // Walrus blob ids are base64url-ish, ~40+ chars. Grab the first plausible one.
  const blobMatch =
    text.match(/blob(?:[_ ]?id)?["':\s]+([A-Za-z0-9_-]{32,})/i) ||
    text.match(/\b([A-Za-z0-9_-]{40,})\b/);
  if (blobMatch) out.blobId = blobMatch[1];

  if (name === 'memwal_recall') {
    out.blobId = null; // recall has no blob; don't let the generic matcher misfire
    // MemWal returns a NUMBERED list: "1. [score=0.57] …". Count the score markers
    // (most robust), then numbered lines, then an explicit count, then bullets.
    const empty = /no matching memories|no memories found/i.test(text);
    const scores = (text.match(/\[score=/g) || []).length;
    const numbered = (text.match(/^\s*\d+\.\s/gm) || []).length;
    const countMatch = text.match(/"?count"?\s*[:=]\s*(\d+)/i);
    let n = scores || numbered || (countMatch ? Number(countMatch[1]) : null);
    if (empty) n = 0;
    out.detail = n != null ? `${n} past resolution${n === 1 ? '' : 's'}` : 'searched memory';
  } else if (name === 'memwal_remember') {
    out.detail = 'saved to Walrus';
  } else if (name === 'memwal_remember_bulk') {
    out.detail = 'saved batch to Walrus';
  } else if (name === 'memwal_analyze') {
    out.detail = 'analyzed memory';
  } else if (name === 'memwal_restore') {
    out.detail = 'restored index';
  } else if (name === 'memwal_health') {
    out.blobId = null;
    out.detail = /^HEALTHY/i.test(text) ? 'memory healthy' : 'memory unhealthy';
  }
  return out;
}
