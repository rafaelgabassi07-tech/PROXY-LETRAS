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
const load=()=>{ throw new Error('cheerio should not be required by JSON artwork harness'); };
`;

const calls=[];
globalThis.fetch=async (input) => {
  const url=String(input);
  calls.push(url);
  if (url.includes('/discografia/index.js')) {
    return new Response(JSON.stringify({
      discography: { item: [
        { desc: 'Extraordinário Amor de Deus', pic: 'http://img.vagalume.test/extraordinario.jpg', discs: [{ item: [
          { name: 'Geração Bem Aventurada' },
          { name: 'Ressuscita-me' },
          { name: 'Vitória no Deserto' }
        ]}]},
        { desc: 'Outro Álbum', pic: 'https://img.vagalume.test/outro.jpg', discs: [{ item: [{ name: 'Outra Música' }]}]}
      ]}
    }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  if (url.includes('/aline-barros/index.js')) {
    return new Response(JSON.stringify({ artist: { id: '3ade68b3gdb86eda3', name: 'Aline Barros', pic_medium: 'https://img.vagalume.test/aline.jpg' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/image.php')) {
    return new Response(JSON.stringify({ images: [{ url: 'https://img.vagalume.test/gallery.jpg' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('not found', { status: 404 });
};

const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'lyrics-artwork-harness-'));
const modulePath=path.join(tempDir,'scrapersHarness.mjs');
fs.writeFileSync(modulePath, `${prelude}\n${withoutImports}`);
try {
  const mod=await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
  const metadata=await mod.fetchVagalumeTrackMetadata(
    'https://www.vagalume.com.br',
    'https://api.vagalume.com.br',
    'secret-test-key',
    'Aline Barros',
    ['Ressuscita-me','Música Sem Álbum'],
    4200
  );
  const exact=metadata.get('Ressuscita-me');
  assert.equal(exact.album, 'Extraordinário Amor de Deus');
  assert.equal(exact.imageUrl, 'https://img.vagalume.test/extraordinario.jpg');
  assert.equal(exact.imageKind, 'album');
  const fallback=metadata.get('Música Sem Álbum');
  assert.equal(fallback.imageUrl, 'https://img.vagalume.test/aline.jpg');
  assert.equal(fallback.imageKind, 'artist');
  assert.ok(calls.some(url => url.includes('/discografia/index.js')));
  assert.ok(calls.some(url => url.includes('/aline-barros/index.js')));
  assert.equal(calls.some(url => url.includes('/image.php')), false, 'gallery fallback must not run when profile image exists');
  console.log('VAGALUME_ALBUM_ARTWORK_OK');
  console.log('VAGALUME_ARTIST_FALLBACK_OK');
  console.log('ARTWORK_ENRICHMENT_OK');
} finally {
  delete globalThis.fetch;
  fs.rmSync(tempDir,{recursive:true,force:true});
}
