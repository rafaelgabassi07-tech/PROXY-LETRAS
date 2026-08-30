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
    if (entry.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}
const files = walk(root);
const rel = f => path.relative(root, f).split(path.sep).join('/');
const ts = files.filter(f => /\.(?:ts|tsx|mts|cts)$/i.test(f));
if (ts.length) failures.push(`TypeScript files found: ${ts.map(rel).join(', ')}`);
const jsFiles = files.filter(f => /\.(?:js|mjs|cjs)$/.test(f));
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
const expectedApi = [
  'api/index.js','api/health.js','api/proxy/health.js','api/proxy/lyrics/search.js','api/proxy/lyrics/get.js',
  'api/proxy/lyrics/raw.js','api/proxy/config.js','api/proxy/config/reset.js','api/proxy/samples.js',
  'api/proxy/logs.js','api/proxy/logs/clear.js','api/proxy/cache/clear.js'
];
for (const f of expectedApi) if (!fs.existsSync(path.join(root,f))) failures.push(`Missing compatibility Function ${f}`);
const config = JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
if (config.framework !== null) failures.push('framework must be null');
if (config.outputDirectory !== 'public') failures.push('outputDirectory must be public');
if (config.buildCommand !== 'echo GLX_NO_BUILD_REQUIRED') failures.push('buildCommand must be a non-destructive no-op');
if ('rewrites' in config) failures.push('No rewrites: physical compatibility Functions handle API routes');
if ('functions' in config) failures.push('No manual functions map');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if (pkg.version !== '2.11.1') failures.push(`Expected 2.11.1, got ${pkg.version}`);
if (pkg.scripts?.build) failures.push('package.json must not run a destructive build script');
if (!fs.existsSync(path.join(root,'public/index.html'))) failures.push('Missing public/index.html');
const serviceText = fs.readFileSync(path.join(root, 'server/lyricsService.js'), 'utf8');
const scraperText = fs.readFileSync(path.join(root, 'server/scrapers.js'), 'utf8');
for (const required of ['buildRemoteQueries', 'lyricsMatchQuality', 'sameSongConfidence', 'songMatchesRequest', 'mergeResultMetadata', 'diceSimilarity', 'search-v9-catalog-resolver', "['lrclib', 'vagalume']", 'providersUsed', 'providersCompleted', 'providersSkipped', 'providerErrors', 'cacheStatus', 'bypass-partial', 'imageUrl']) {
  if (!serviceText.includes(required)) failures.push(`Missing search refinement in lyricsService.js: ${required}`);
}
for (const required of ['pageStructuredMedia', 'searchCardContext', 'Nunca inventa /artista/titulo.html', 'searchVagalumeExcerpt', 'searchVagalumeArtistPage', 'searchLrclib', 'fetchLrclibSong']) {
  if (!scraperText.includes(required)) failures.push(`Missing provider metadata extraction in scrapers.js: ${required}`);
}
for (const forbidden of ['searchGenius(', 'searchGeniusWeb(', 'customSearch(', 'customGet(', 'searchLetrasMusBr(', 'letras_mus_br', 'verifyExcerptCandidates(', 'fanOutResolvedSongs(']) {
  if (serviceText.includes(forbidden)) failures.push(`Legacy provider/hydration path still active in lyricsService.js: ${forbidden}`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`VERCEL_COMPAT_FUNCTIONS_OK: ${expectedApi.length} API handlers; zero TypeScript; no destructive build; all relative imports resolved`);
