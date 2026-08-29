import fs from 'node:fs';

const root = new URL('../', import.meta.url);
if (fs.existsSync(new URL('../vercel.json', import.meta.url))) {
  throw new Error('Remove vercel.json: this project uses Vercel zero-config Express detection.');
}
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!pkg.dependencies?.express) throw new Error('express must be a production dependency.');
if (pkg.scripts?.build) throw new Error('Do not define a generic build script for the zero-config Express deployment.');
if (/vite/i.test(pkg.scripts?.dev || '')) throw new Error('The default dev command must start the Express backend, not Vite.');
for (const dep of ['vite', 'react', 'react-dom', '@vitejs/plugin-react']) {
  if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) throw new Error(`${dep} must stay in web/package.json, not the Vercel backend package.`);
}
if (!fs.existsSync(new URL('../web/package.json', import.meta.url))) throw new Error('Optional dashboard must be isolated in web/package.json.');
const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
if (!/import\s+express\s+from\s+['"]express['"]/.test(server)) {
  throw new Error('server.ts must import Express for Vercel framework detection.');
}
if (!/export\s+default\s+app\s*;/.test(server)) {
  throw new Error('server.ts must export default app for Vercel Express detection.');
}
console.log('VERCEL_EXPRESS_ZERO_CONFIG_OK');
