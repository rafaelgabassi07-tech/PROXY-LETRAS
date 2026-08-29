import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
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

const allFiles = walk(root);
const rel = file => path.relative(root, file).split(path.sep).join('/');
const runtimeFiles = allFiles.filter(file => rel(file).startsWith('api/') || rel(file).startsWith('server/'));
const tsAnywhere = allFiles.filter(file => /\.(?:ts|tsx|mts|cts)$/.test(file));
if (tsAnywhere.length) failures.push(`TypeScript files found in production artifact: ${tsAnywhere.map(rel).join(', ')}`);

// Vercel Functions are extensionless routes. Detect .js/.ts-style collisions inside /api.
const functionStems = new Map();
for (const file of allFiles) {
  const r = rel(file);
  if (!r.startsWith('api/')) continue;
  const stem = r.replace(/\.[^/.]+$/, '');
  if (!functionStems.has(stem)) functionStems.set(stem, []);
  functionStems.get(stem).push(r);
}
for (const [stem, files] of functionStems) {
  if (files.length > 1) failures.push(`Conflicting Vercel Function path ${stem}: ${files.join(' vs ')}`);
}

const jsFiles = runtimeFiles.filter(file => /\.(?:js|mjs|cjs)$/.test(file));
const staticImport = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/['"][^'"]+\.(?:ts|tsx|mts|cts)['"]/.test(text)) failures.push(`${rel(file)} contains a TypeScript runtime specifier`);
  for (const match of text.matchAll(staticImport)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) failures.push(`${rel(file)} -> missing ${spec}`);
  }
}

const required = [
  'api/health.js',
  'api/proxy/health.js',
  'api/proxy/lyrics/search.js',
  'api/proxy/lyrics/get.js',
  'server/healthHandler.js',
  'server/vercelAdapter.js',
  'server/proxyRouter.js',
  'server/lyricsService.js',
];
for (const r of required) if (!fs.existsSync(path.join(root, r))) failures.push(`Missing ${r}`);
if (fs.existsSync(path.join(root, 'server.ts')) || fs.existsSync(path.join(root, 'server.js'))) failures.push('Root server.ts/server.js must not exist.');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (config.framework !== null) failures.push('vercel.json must use framework:null (Other).');
if ('functions' in config) failures.push('vercel.json must not manually map functions.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`VERCEL_PRODUCTION_ARTIFACT_OK: ${jsFiles.length} runtime JS files; zero TypeScript files; zero Vercel route conflicts; all relative imports resolved`);
