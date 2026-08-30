import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'server/scrapers.js'), 'utf8');
const withoutImports = source.split(/(?<=\n)/).filter(line => !line.trimStart().startsWith('import ')).join('');
const prelude = String.raw`
const PROXY_VERSION='test';
const EXTRACTION_ENGINE_VERSION='test';
const EXTRACTION_ENGINE_NAME='test';
const normalizeLyricsText=value=>String(value||'').replace(/\\r/g,'').trim();
const extractLyricsAdvanced=()=>null;
const load=()=>{ throw new Error('HTML parser should not be needed in fast artwork lane'); };
`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/discografia/index.js')) {
    await sleep(1050);
    return new Response(JSON.stringify({ discography: { item: [] } }), { status: 200, headers: {'content-type':'application/json'} });
  }
  if (url.includes('/aline-barros/index.js')) {
    await sleep(45);
    return new Response(JSON.stringify({ artist: { id: 'a1', name: 'Aline Barros', pic_medium: 'https://img.vagalume.test/aline-fast.jpg' } }), { status: 200, headers: {'content-type':'application/json'} });
  }
  return new Response('not found', { status: 404 });
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-art-budget-'));
const modulePath = path.join(tempDir, 'scrapersHarness.mjs');
fs.writeFileSync(modulePath, `${prelude}\n${withoutImports}`);
try {
  const mod = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
  const started = Date.now();
  const metadata = await mod.fetchVagalumeTrackMetadata(
    'https://www.vagalume.com.br',
    'https://api.vagalume.com.br',
    '',
    'Aline Barros',
    ['Ressuscita-me'],
    1300
  );
  const elapsed = Date.now() - started;
  assert.equal(metadata.get('Ressuscita-me')?.imageUrl, 'https://img.vagalume.test/aline-fast.jpg');
  assert.ok(elapsed < 1500, `interactive artwork exceeded budget: ${elapsed}ms`);
  console.log(`INTERACTIVE_ARTWORK_BUDGET_OK:${elapsed}ms`);
} finally {
  delete globalThis.fetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
