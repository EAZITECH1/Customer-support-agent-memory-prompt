// server/smoke-memwal.js
// Standalone proof that the MemWal MCP tool loop reaches Walrus — no LLM needed.
// Runs: connect -> list tools -> remember (writes a blob) -> recall (reads it back).
//
//   npm run memwal:smoke
//
// Uses the MEMWAL_NAMESPACE from .env (default "support"). Writes ONE clearly
// labelled demo memory to your Walrus memory in that namespace.

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemWal, summarizeToolResult } from './memwal.js';
import { materializeCredentials } from './credentials.js';

const NAMESPACE = process.env.MEMWAL_NAMESPACE || 'support';
const MEMWAL_HOME = join(dirname(fileURLToPath(import.meta.url)), '..', '.memwal-home');

// Use the SAME isolated support wallet the server uses (from .env), not ~/.memwal.
let walletInfo = null;
try {
  walletInfo = materializeCredentials(process.env.MEMWAL_CREDENTIALS_JSON, MEMWAL_HOME);
} catch (err) {
  console.error('[smoke] credential error:', err.message);
}

const memwal = new MemWal({
  spec: process.env.MEMWAL_MCP_SPEC,
  namespace: NAMESPACE,
  debug: process.env.MEMWAL_MCP_DEBUG === '1',
  home: walletInfo ? MEMWAL_HOME : undefined,
});

const stamp = new Date().toISOString();
const marker = `SMOKE-${Date.now()}`;

function line(t) {
  console.log(t);
}

try {
  line(`\n[1/4] Connecting to MemWal MCP (namespace="${NAMESPACE}")…`);
  const tools = await memwal.connect();
  line(`      ✓ tools: ${tools.join(', ')}`);

  line(`\n[2/4] memwal_remember — writing a demo resolved-ticket memory (${marker})…`);
  const remember = await memwal.call('memwal_remember', {
    text:
      `[${marker}] Support smoke test. Resolved issue: customer could not reset ` +
      `their password because the reset email landed in spam. Resolution: told them ` +
      `to whitelist no-reply@eazitech.xyz and re-sent the link. Saved ${stamp}.`,
  });
  const rSummary = summarizeToolResult('memwal_remember', remember.text);
  line(`      ok=${remember.ok}  ${rSummary.detail}${rSummary.blobId ? `  blob=${rSummary.blobId}` : ''}`);
  line('      raw: ' + (remember.text || '').slice(0, 300));

  line(`\n[3/4] memwal_recall — searching for that resolution…`);
  const recall = await memwal.call('memwal_recall', { query: 'password reset email spam whitelist' });
  const found = (recall.text || '').includes(marker);
  line(`      ok=${recall.ok}  matched-our-write=${found}`);
  line('      raw: ' + (recall.text || '').slice(0, 400));

  line(`\n[4/4] Done.`);
  line(found
    ? '      ✅ Round-trip verified: wrote to Walrus and read it back.'
    : '      ⚠  Wrote, but recall did not surface our exact marker (index may lag; try again, or memwal_restore).');
} catch (err) {
  console.error('\n❌ Smoke test failed:', err.message);
  process.exitCode = 1;
} finally {
  await memwal.close();
  process.exit(process.exitCode || 0);
}
