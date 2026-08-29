import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
if (config.framework !== 'express') {
  throw new Error(`Expected framework=express, got ${String(config.framework)}`);
}
if ('functions' in config) {
  throw new Error('Do not declare root server.ts under functions; zero-config Express detection must own server.ts.');
}
const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
if (!/export\s+default\s+app\s*;/.test(server)) {
  throw new Error('server.ts must export default app for Vercel Express detection.');
}
console.log('VERCEL_EXPRESS_CONFIG_OK');
