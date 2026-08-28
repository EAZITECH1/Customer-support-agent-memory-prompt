// server/memwal-login.js  ·  npm run memwal:login
//
// Logs in the support chat's OWN Sui wallet into a project-local HOME
// (.memwal-home/) — never touching the machine's main ~/.memwal — then captures
// the resulting credential into .env as MEMWAL_CREDENTIALS_JSON (base64).
//
// Opens a browser: connect the NEW wallet and approve the delegate key.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { readCredsFile, upsertEnvVar, credsPathFor } from './credentials.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMWAL_HOME = join(ROOT, '.memwal-home');
const ENV_PATH = join(ROOT, '.env');
const SPEC = process.env.MEMWAL_MCP_SPEC || '@mysten-incubation/memwal-mcp@0.0.7';

function launcher() {
  try {
    const pkgPath = require.resolve('@mysten-incubation/memwal-mcp/package.json');
    const pkg = require('@mysten-incubation/memwal-mcp/package.json');
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['memwal-mcp'];
    if (binRel) return { cmd: process.execPath, args: [join(dirname(pkgPath), binRel)] };
  } catch {
    /* fall through to npx */
  }
  return { cmd: 'npx', args: ['-y', SPEC] };
}

mkdirSync(MEMWAL_HOME, { recursive: true, mode: 0o700 });

console.log('\nOpening the wallet login flow for the SUPPORT chat wallet…');
console.log(`Credentials will be isolated in: ${MEMWAL_HOME}`);
console.log('Your main ~/.memwal login will NOT be changed.\n');

const { cmd, args } = launcher();
const child = spawn(cmd, [...args, 'login'], {
  stdio: 'inherit',
  env: { ...process.env, HOME: MEMWAL_HOME },
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`\nLogin exited with code ${code}. Nothing captured.`);
    process.exit(code || 1);
  }
  try {
    const { creds, base64 } = readCredsFile(credsPathFor(MEMWAL_HOME));
    upsertEnvVar(ENV_PATH, 'MEMWAL_CREDENTIALS_JSON', base64);
    console.log('\n✓ Captured support wallet credential into .env (MEMWAL_CREDENTIALS_JSON).');
    console.log(`  account:  ${creds.accountId}`);
    console.log(`  wallet:   ${creds.walletAddress}`);
    console.log('  The secret now lives in .env (gitignored). Start the app with:  npm start\n');
  } catch (err) {
    console.error('\nLogin succeeded but capture failed:', err.message);
    process.exit(1);
  }
});
