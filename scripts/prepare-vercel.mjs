import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const api = join(root, 'api');

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

// Em repositórios onde versões antigas foram extraídas por cima, remova todas
// as Functions legadas e preserve somente a Function única da revisão 2.7.3.
for (const file of await walk(api)) {
  const rel = relative(api, file).replaceAll('\\', '/');
  if (rel !== 'index.js') await rm(file, { force: true });
}

// TypeScript runtime legado também não deve chegar ao bundle.
for (const base of ['server']) {
  const dir = join(root, base);
  for (const file of await walk(dir)) {
    if (/\.(?:ts|tsx|mts|cts)$/i.test(file)) await rm(file, { force: true });
  }
}

await mkdir(join(root, 'public'), { recursive: true });
await copyFile(join(root, 'index.html'), join(root, 'public', 'index.html'));

console.log('GLX_VERCEL_PREPARE_OK: api/index.js único; runtime legado removido; public/index.html gerado');
