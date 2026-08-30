import { access, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const expectedApi = [
  'api/index.js',
  'api/health.js',
  'api/proxy/health.js',
  'api/proxy/lyrics/search.js',
  'api/proxy/lyrics/get.js',
  'api/proxy/lyrics/raw.js',
  'api/proxy/config.js',
  'api/proxy/config/reset.js',
  'api/proxy/samples.js',
  'api/proxy/logs.js',
  'api/proxy/logs/clear.js',
  'api/proxy/cache/clear.js',
];

// Preparação propositalmente NÃO destrutiva. As Functions de compatibilidade continuam
// presentes para clientes legados; o vercel.json centraliza apenas /lyrics/search em /api/index
// para reduzir risco de cold start/roteamento isolado sem quebrar o contrato público.
for (const relative of expectedApi) {
  await access(join(root, relative));
}

await mkdir(join(root, 'public'), { recursive: true });
await copyFile(join(root, 'index.html'), join(root, 'public', 'index.html'));

console.log(`GLX_VERCEL_PREPARE_OK: ${expectedApi.length} Functions preservadas; preparação não destrutiva`);
