// server/credentials.js
// The support chat uses its OWN Sui wallet, separate from the machine's main
// ~/.memwal login. The secret lives in .env as MEMWAL_CREDENTIALS_JSON (base64
// of a memwal credentials.json). On boot we materialize it into a project-local
// HOME (.memwal-home/.memwal/credentials.json) that the MemWal MCP child reads,
// so the real ~/.memwal is never touched.

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

/** Path memwal-mcp will read, given an isolated HOME dir. */
export function credsPathFor(homeDir) {
  return join(homeDir, '.memwal', 'credentials.json');
}

function parseCredsBlob(raw) {
  // Accept either base64-encoded JSON (preferred, one clean .env line) or raw JSON.
  let text = raw.trim();
  if (!text.startsWith('{')) {
    try {
      text = Buffer.from(text, 'base64').toString('utf8');
    } catch {
      /* leave as-is; JSON.parse will throw a clear error below */
    }
  }
  const creds = JSON.parse(text);
  if (
    !creds ||
    typeof creds.delegatePrivateKey !== 'string' ||
    !/^[0-9a-fA-F]{64}$/.test(creds.delegatePrivateKey) ||
    typeof creds.accountId !== 'string'
  ) {
    throw new Error('MEMWAL_CREDENTIALS_JSON is not a valid memwal credentials object');
  }
  return creds;
}

/**
 * Write the credential from MEMWAL_CREDENTIALS_JSON into the isolated HOME.
 * Returns non-secret info for logging, or null if nothing was provided.
 */
export function materializeCredentials(rawBlob, homeDir) {
  if (!rawBlob) return null;
  const creds = parseCredsBlob(rawBlob);
  const target = credsPathFor(homeDir);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, JSON.stringify(creds, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(target, 0o600);
  } catch {
    /* windows etc */
  }
  return {
    accountId: creds.accountId,
    walletAddress: creds.walletAddress,
    delegateAddress: creds.delegateAddress,
    path: target,
  };
}

/** Read a credentials.json file and return { creds, base64 } for capture. */
export function readCredsFile(path) {
  if (!existsSync(path)) throw new Error(`No credentials file at ${path}`);
  const raw = readFileSync(path, 'utf8');
  const creds = JSON.parse(raw);
  const base64 = Buffer.from(JSON.stringify(creds), 'utf8').toString('base64');
  return { creds, base64 };
}

/** Upsert a KEY=value line in a .env file, creating the file if needed. */
export function upsertEnvVar(envPath, key, value) {
  let lines = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf8').split('\n');
  }
  const idx = lines.findIndex((l) => l.startsWith(key + '='));
  const line = `${key}=${value}`;
  if (idx >= 0) lines[idx] = line;
  else {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(line);
  }
  writeFileSync(envPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(envPath, 0o600);
  } catch {
    /* best effort */
  }
}
