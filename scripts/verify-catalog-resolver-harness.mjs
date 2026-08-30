import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'server/lyricsService.js'), 'utf8');

function withoutImports(text) {
  const lines = text.split(/(?<=\n)/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && line.trimStart().startsWith('import ')) {
      skipping = !line.includes(';');
      continue;
    }
    if (skipping) {
      if (line.includes(';')) skipping = false;
      continue;
    }
    out.push(line);
  }
  return out.join('');
}

const prelude = String.raw`
class LRUCache {
  constructor(){ this.map=new Map(); this.max=5000; }
  get size(){ return this.map.size; }
  get(k){ return this.map.get(k); }
  set(k,v){ this.map.set(k,v); return this; }
  has(k){ return this.map.has(k); }
  delete(k){ return this.map.delete(k); }
  pop(){ const k=this.map.keys().next().value; if(k!==undefined)this.map.delete(k); }
  clear(){ this.map.clear(); }
  keys(){ return this.map.keys(); }
}
const GOSPEL_DATABASE=[];
const scenario=globalThis.__catalogHarnessScenario;
const calls=globalThis.__catalogHarnessCalls;
const getProxyConfig=()=>({
 cache:{enabled:false,maxEntries:500,searchTtlSeconds:3600,lyricsTtlSeconds:86400,ttlSeconds:21600},
 defaultProvider:'multi-provider',
 providers:{
  lrclib:{enabled:true,baseUrl:'https://lrclib.net',timeoutMs:4200},
  vagalume:{enabled:true,baseUrl:'https://api.vagalume.com.br',webBaseUrl:'https://www.vagalume.com.br',apiKey:'test-key',timeoutMs:4500}
 },
 filters:{onlyGospel:false,cleanHTML:true,autoTagThemes:true,formatVerses:true}
});
const searchLrclib=async (_base,q,artist,title)=>{
  calls.push(['lrclib',q,artist,title]);
  if(scenario.name==='lrclib-fail') throw new Error('LRCLIB HTTP 503');
  if(scenario.name==='fallback-vagalume') return [];
  if(scenario.name==='artist') return [{id:'lrclib-2',title:'Ressuscita-me',artist:'Aline Barros',preview:'Mestre eu preciso de um milagre',source:'lrclib',sourceUrl:'https://lrclib.net/api/get/2',providerRef:'2',score:120}];
  return [{id:'lrclib-1',title:q,artist:'Artista Resolvido',preview:'Letra disponível',source:'lrclib',sourceUrl:'https://lrclib.net/api/get/1',providerRef:'1',score:130}];
};
const searchVagalumeExcerpt=async (_api,_web,_key,q)=>{
  calls.push(['vagalume-excerpt',q]);
  if(scenario.name==='fallback-vagalume') return [{id:'v1',title:'Canção ausente',artist:'Cantor Gospel',preview:'Resultado encontrado no Vagalume.',source:'vagalume',providerRef:'v1',score:110}];
  if(scenario.name==='excerpt') return [{id:'v2',title:'Canção por trecho',artist:'Cantor Gospel',preview:q,source:'vagalume',providerRef:'v2',score:120}];
  return [];
};
const searchVagalumeArtistPage=async()=>[];
const searchVagalumeWeb=async()=>[];
const fetchLrclibSong=async (_base,ref,artist,title)=>({id:'lrclib-'+(ref||'1'),title:title||'Título',artist:artist||'Artista',fullLyrics:'Linha 1\\nLinha 2',source:'lrclib',sourceUrl:'https://lrclib.net/api/get/'+(ref||'1'),extractionMethod:'api'});
const fetchScrapedSong=async()=>null;
const fetchVagalumeSong=async()=>null;
const fetchVagalumeTrackMetadata=async (_web,_api,_key,artist,titles)=>{ calls.push(['vagalume-media',artist,...titles]); return new Map(titles.map(title=>[title,{album:'Álbum '+title,imageUrl:'https://img.vagalume.test/'+encodeURIComponent(title)+'.jpg',imageKind:'album'}])); };
`;

const scenario = { name: 'title' };
const calls = [];
globalThis.__catalogHarnessScenario = scenario;
globalThis.__catalogHarnessCalls = calls;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-catalog-harness-'));
const modulePath = path.join(tempDir, 'lyricsServiceHarness.mjs');
fs.writeFileSync(modulePath, `${prelude}\n${withoutImports(source)}`);

try {
  const service = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
  const reset = name => { scenario.name = name; calls.length = 0; service.resetProviderHealth(); service.clearCache(); };

  reset('title');
  let result = await service.searchGospelSongs({ query: 'Ressuscita-me', limit: 12, provider: 'multi-provider' });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].title, 'Ressuscita-me');
  assert.equal(calls[0]?.[0], 'lrclib');
  assert.ok(calls.some(call => call[0] === 'vagalume-media'));
  assert.equal(result.results[0].album, 'Álbum Ressuscita-me');
  assert.ok(result.results[0].imageUrl?.startsWith('https://img.vagalume.test/'));
  console.log('TITLE_SEARCH_PRIMARY_OK');

  reset('title');
  result = await service.searchGospelSongs({ query: 'Ressuscita-me', limit: 12, provider: 'multi-provider' }, { interactive: true });
  assert.equal(result.total, 1);
  assert.equal(result.clientMode, 'interactive');
  assert.equal(result.mediaDeferred, true);
  assert.ok(!calls.some(call => call[0] === 'vagalume-media'));
  console.log('INTERACTIVE_SEARCH_SKIPS_MEDIA_OK');

  reset('artist');
  result = await service.searchGospelSongs({ query: 'Aline Barros', limit: 12, provider: 'multi-provider' });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].artist, 'Aline Barros');
  assert.equal(calls[0]?.[0], 'lrclib');
  console.log('ARTIST_SEARCH_PRIMARY_OK');

  reset('excerpt');
  const excerpt = 'mestre eu preciso de um milagre transforma minha vida meu estado';
  result = await service.searchGospelSongs({ query: excerpt, limit: 12, provider: 'multi-provider' });
  assert.equal(result.total, 1);
  assert.equal(calls[0]?.[0], 'vagalume-excerpt');
  console.log('EXCERPT_SEARCH_PRIMARY_OK');

  reset('fallback-vagalume');
  result = await service.searchGospelSongs({ query: 'Canção ausente', limit: 12, provider: 'multi-provider' });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].source, 'vagalume');
  assert.ok(calls.some(call => call[0] === 'lrclib'));
  assert.ok(calls.some(call => call[0] === 'vagalume-excerpt'));
  console.log('TITLE_FALLBACK_VAGALUME_OK');

  reset('lrclib-fail');
  result = await service.searchGospelSongs({ query: 'Consulta de teste', limit: 12, provider: 'multi-provider' });
  assert.equal(result.partial, true);
  assert.ok(result.providerErrors.some(error => error.provider === 'lrclib'));
  assert.ok(result.providersCompleted.includes('vagalume'));
  console.log('PARTIAL_DIAGNOSTICS_OK');

  console.log('CATALOG_RESOLVER_HARNESS_OK');
} finally {
  delete globalThis.__catalogHarnessScenario;
  delete globalThis.__catalogHarnessCalls;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
