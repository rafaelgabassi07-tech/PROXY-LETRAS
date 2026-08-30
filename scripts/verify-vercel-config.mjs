import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
if (config.framework !== null) throw new Error('Vercel Framework Preset must be Other (framework: null).');
if ('functions' in config) throw new Error('Do not map functions manually; files under /api are detected natively.');
const searchRewrite = Array.isArray(config.rewrites) && config.rewrites.find(item => item?.source === '/api/proxy/lyrics/search');
if (!searchRewrite || !String(searchRewrite.destination || '').startsWith('/api/index?__glx_path=')) {
  throw new Error('/api/proxy/lyrics/search must be internally rewritten to centralized /api/index.');
}
const vercelIgnore = fs.readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
if (fs.existsSync(new URL('../server.ts', import.meta.url)) && !vercelIgnore.includes('**/*.ts')) {
  throw new Error('Root server.ts is development-only and must be excluded from Vercel via **/*.ts.');
}
for (const dep of ['express', 'express-rate-limit', 'helmet']) {
  if (pkg.dependencies?.[dep]) throw new Error(`${dep} must not be required by the Vercel-native backend.`);
}
if (pkg.scripts?.build) throw new Error('Do not define a generic build script for the Vercel Functions deployment.');
const required = [
  'api/health.ts',
  'api/proxy/health.ts',
  'api/proxy/lyrics/search.ts',
  'api/proxy/lyrics/get.ts',
];
for (const file of required) {
  if (!fs.existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`Missing Vercel Function: ${file}`);
}
const health = fs.readFileSync(new URL('../api/health.ts', import.meta.url), 'utf8');
if (!/vercelHealthHandler/.test(health)) throw new Error('/api/health must use the lightweight handler.');
console.log('VERCEL_NATIVE_FUNCTIONS_OK');
