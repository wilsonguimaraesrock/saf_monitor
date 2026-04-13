// Loads .env.local and runs the specified tsx script
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Parse .env.local
const envLines = readFileSync(join(root, '.env.local'), 'utf8').split('\n');
const env = { ...process.env };

for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  // Remove inline comments (but only after whitespace)
  val = val.split(/\s+#/)[0].trim();
  if (key && val) env[key] = val;
}

const script = process.argv[2];
if (!script) {
  console.error('Usage: node run-with-env.mjs <script>');
  process.exit(1);
}

const proc = spawn('npx', ['tsx', script], {
  env,
  stdio: 'inherit',
  cwd: root,
});

proc.on('close', (code) => process.exit(code ?? 0));
