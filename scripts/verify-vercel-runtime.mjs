import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const runtimeRoots = ['api', 'server'];
const failures = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = runtimeRoots.flatMap(name => walk(path.join(root, name)));
const tsRuntime = files.filter(file => /\.(?:ts|tsx|mts|cts)$/.test(file));
if (tsRuntime.length) failures.push(`TypeScript runtime files found: ${tsRuntime.map(f => path.relative(root,f)).join(', ')}`);

const jsFiles = files.filter(file => /\.(?:js|mjs|cjs)$/.test(file));
const staticImport = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/['"][^'"]+\.(?:ts|tsx|mts|cts)['"]/.test(text)) {
    failures.push(`${path.relative(root,file)} contains a TypeScript runtime specifier`);
  }
  for (const match of text.matchAll(staticImport)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) failures.push(`${path.relative(root,file)} -> missing ${spec}`);
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
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) failures.push(`Missing ${rel}`);
if (fs.existsSync(path.join(root, 'server.ts')) || fs.existsSync(path.join(root, 'server.js'))) {
  failures.push('Root server.ts/server.js must not exist in the Vercel Functions artifact.');
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (config.framework !== null) failures.push('vercel.json must use framework:null (Other).');
if ('functions' in config) failures.push('vercel.json must not manually map functions.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`VERCEL_JS_RUNTIME_OK: ${jsFiles.length} JS runtime files, all relative imports resolved`);
