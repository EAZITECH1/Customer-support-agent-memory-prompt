// server/memwal-capture.js  ·  npm run memwal:capture
//
// Captures an already-created isolated credential (.memwal-home/.memwal/
// credentials.json) into .env as MEMWAL_CREDENTIALS_JSON. Use this if you ran
// the login separately, or copied a credentials.json into .memwal-home.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCredsFile, upsertEnvVar, credsPathFor } from './credentials.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMWAL_HOME = join(ROOT, '.memwal-home');
const ENV_PATH = join(ROOT, '.env');

try {
  const { creds, base64 } = readCredsFile(credsPathFor(MEMWAL_HOME));
  upsertEnvVar(ENV_PATH, 'MEMWAL_CREDENTIALS_JSON', base64);
  console.log('✓ Wrote MEMWAL_CREDENTIALS_JSON to .env');
  console.log(`  account: ${creds.accountId}`);
} catch (err) {
  console.error('Capture failed:', err.message);
  console.error(`Expected a credentials file at: ${credsPathFor(MEMWAL_HOME)}`);
  console.error('Run:  npm run memwal:login   (logs in the support wallet and captures automatically)');
  process.exit(1);
}
