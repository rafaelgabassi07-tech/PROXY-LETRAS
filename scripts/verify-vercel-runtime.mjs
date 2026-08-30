import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const skipDirs = new Set(['node_modules', '.git', '.vercel']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
const files = walk(root);
const rel = file => path.relative(root, file).split(path.sep).join('/');
const ts = files.filter(file => /\.(?:ts|tsx|mts|cts)$/i.test(file));
if (ts.length) failures.push(`TypeScript runtime/source files found: ${ts.map(rel).join(', ')}`);

const apiFiles = files.filter(file => rel(file).startsWith('api/'));
if (apiFiles.length !== 1 || rel(apiFiles[0]) !== 'api/index.js') {
  failures.push(`api/ must contain only api/index.js; found: ${apiFiles.map(rel).join(', ')}`);
}

const jsFiles = files.filter(file => /\.(?:js|mjs|cjs)$/.test(file));
const staticImport = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/['"][^'"]+\.(?:ts|tsx|mts|cts)['"]/.test(text)) failures.push(`${rel(file)} contains TypeScript runtime specifier`);
  for (const match of text.matchAll(staticImport)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) failures.push(`${rel(file)} -> missing ${spec}`);
  }
}

const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (config.framework !== null) failures.push('framework must be null (Other).');
if (config.buildCommand !== 'node scripts/prepare-vercel.mjs') failures.push('buildCommand must clean legacy Functions.');
if ('functions' in config) failures.push('Do not use manual functions mapping.');
const destinations = (config.rewrites || []).map(item => item.destination || '');
if (!destinations.length || destinations.some(dest => !dest.startsWith('/api/index?__glx_path='))) {
  failures.push('Every API rewrite must target the single api/index Function.');
}

for (const required of ['api/index.js','server/healthHandler.js','server/vercelAdapter.js','server/proxyRouter.js','server/lyricsService.js','scripts/prepare-vercel.mjs']) {
  if (!fs.existsSync(path.join(root, required))) failures.push(`Missing ${required}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.version !== '2.7.2') failures.push(`Expected version 2.7.2, got ${packageJson.version}`);
if (packageJson.scripts?.build !== 'node scripts/prepare-vercel.mjs') failures.push('package build script does not run cleanup.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`VERCEL_SINGLE_FUNCTION_OK: api/index.js only; ${jsFiles.length} JS modules; zero TypeScript; all relative imports resolved; legacy cleanup enabled`);
