import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const rel = f => path.relative(root, f).split(path.sep).join('/');

const expectedApi = [
  'api/index.js','api/health.js','api/proxy/health.js','api/proxy/lyrics/search.js','api/proxy/lyrics/get.js',
  'api/proxy/lyrics/raw.js','api/proxy/config.js','api/proxy/config/reset.js','api/proxy/samples.js',
  'api/proxy/logs.js','api/proxy/logs/clear.js','api/proxy/cache/clear.js'
];
for (const f of expectedApi) if (!fs.existsSync(path.join(root, f))) failures.push(`Missing compatibility Function ${f}`);

// Valida somente o runtime realmente enviado pela Vercel. Arquivos TypeScript de edição
// permanecem no pacote-fonte, mas .vercelignore os exclui do deployment.
const runtimeFiles = [
  ...expectedApi,
  ...fs.readdirSync(path.join(root, 'server')).filter(name => name.endsWith('.js')).map(name => `server/${name}`),
  'local-server.js',
].map(file => path.join(root, file)).filter(fs.existsSync);

const staticImport = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
for (const file of runtimeFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/['"][^'"]+\.(?:ts|tsx|mts|cts)['"]/.test(text)) failures.push(`${rel(file)} contains TypeScript runtime specifier`);
  for (const match of text.matchAll(staticImport)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) failures.push(`${rel(file)} -> missing ${spec}`);
  }
}

const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
for (const required of ['**/*.ts', '**/*.tsx', 'source/']) {
  if (!ignore.includes(required)) failures.push(`.vercelignore must exclude ${required}`);
}

const config = JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
if (config.framework !== null) failures.push('framework must be null');
if (config.outputDirectory !== 'public') failures.push('outputDirectory must be public');
if (config.buildCommand !== 'echo GLX_NO_BUILD_REQUIRED') failures.push('buildCommand must be a non-destructive no-op');
if ('rewrites' in config) failures.push('No rewrites: physical compatibility Functions handle API routes');
if ('functions' in config) failures.push('No manual functions map');

const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if (pkg.version !== '2.11.3') failures.push(`Expected 2.11.3, got ${pkg.version}`);
if (pkg.scripts?.build) failures.push('package.json must not run a destructive build script');
if (!fs.existsSync(path.join(root,'public/index.html'))) failures.push('Missing public/index.html');

const prepareText = fs.readFileSync(path.join(root, 'scripts/prepare-vercel.mjs'), 'utf8');
if (/\brm\s*\(/.test(prepareText) || prepareText.includes("rm, stat") || prepareText.includes('await rm(')) {
  failures.push('prepare-vercel must not delete API Functions or runtime files');
}
for (const route of expectedApi) if (!prepareText.includes(route)) failures.push(`prepare-vercel does not protect ${route}`);

const serviceText = fs.readFileSync(path.join(root, 'server/lyricsService.js'), 'utf8');
const routerText = fs.readFileSync(path.join(root, 'server/proxyRouter.js'), 'utf8');
for (const required of [
  'buildRemoteQueries','lyricsMatchQuality','sameSongConfidence','songMatchesRequest','mergeResultMetadata','diceSimilarity',
  'search-v11-interactive', "['lrclib', 'vagalume']", 'providersUsed','providersCompleted','providersSkipped','providerErrors',
  'cacheStatus','bypass-partial','imageUrl','mediaDeferred','clientMode'
]) {
  if (!serviceText.includes(required)) failures.push(`Missing search refinement in lyricsService.js: ${required}`);
}
for (const required of ['x-lyrics-client-mode', 'interactive', 'mediaDeferred']) {
  if (!routerText.toLowerCase().includes(required.toLowerCase())) failures.push(`Missing APK interactive contract in proxyRouter.js: ${required}`);
}
for (const forbidden of ['searchGenius(', 'searchGeniusWeb(', 'customSearch(', 'customGet(', 'searchLetrasMusBr(', 'letras_mus_br', 'verifyExcerptCandidates(', 'fanOutResolvedSongs(']) {
  if (serviceText.includes(forbidden)) failures.push(`Legacy provider/hydration path still active in lyricsService.js: ${forbidden}`);
}

if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`VERCEL_COMPAT_FUNCTIONS_OK: ${expectedApi.length} API handlers; deploy runtime coerente; preparação não destrutiva; contrato interativo ativo`);
