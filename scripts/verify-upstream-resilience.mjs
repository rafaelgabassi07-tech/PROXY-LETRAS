import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const router = fs.readFileSync(path.join(root, 'server/proxyRouter.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'server/lyricsService.js'), 'utf8');
const scrapers = fs.readFileSync(path.join(root, 'server/scrapers.js'), 'utf8');

const match = router.match(/export function isSearchUpstreamUnavailable\(result, provider = 'multi-provider'\) \{[\s\S]*?\n\}/);
assert.ok(match, 'isSearchUpstreamUnavailable missing');
const fnSource = match[0].replace(/^export\s+/, '');
const classifier = vm.runInNewContext(`(${fnSource.replace(/^function\s+isSearchUpstreamUnavailable/, 'function')})`);

assert.equal(classifier({ total: 0, partial: true, providersCompleted: ['vagalume'], providerErrors: [{ provider: 'lrclib' }] }), false,
  'completed provider + empty result must be HTTP 200 degraded, never 503');
assert.equal(classifier({ total: 0, partial: true, providersCompleted: [], providerErrors: [{ provider: 'vagalume' }] }), true,
  'zero completed providers with upstream error must be 503');
assert.equal(classifier({ total: 0, partial: true, providersCompleted: [], providersSkipped: [{ provider: 'vagalume', reason: 'CIRCUIT_OPEN' }] }), true,
  'zero completed providers with all providers skipped must be 503');
assert.equal(classifier({ total: 2, partial: true, providersCompleted: [], providerErrors: [{ provider: 'vagalume' }] }), false,
  'non-empty result must never be converted to 503');
assert.equal(classifier({ total: 0, partial: false, providersCompleted: [] }, 'built-in'), false,
  'built-in empty search must remain HTTP 200');

assert.ok(service.includes('providersCompleted.push(provider)'), 'completed-provider accounting missing');
assert.ok(service.includes('failures < 2 ? 0'), 'provider circuit must not open after a single failure');
assert.ok(service.includes("cacheKey('search-v9-catalog-resolver'"), 'v9 cache namespace missing');
assert.ok(service.includes('searchLrclib('), 'LRCLIB catalog search missing');
assert.ok(scrapers.includes('export async function searchLrclib'), 'LRCLIB scraper contract missing');
assert.ok(scrapers.includes("url.searchParams.set('q', cleanQuery)"), 'LRCLIB generic title/artist query missing');
const excerptBlock = scrapers.match(/export async function searchVagalumeExcerpt[\s\S]*?\n\}/)?.[0] || '';
assert.ok(excerptBlock, 'Vagalume excerpt search missing');
assert.ok(!excerptBlock.includes("searchParams.set('apikey'"), 'Vagalume search.excerpt must not receive apikey');
assert.ok(scrapers.includes("searchParams.set('apikey'"), 'Vagalume song retrieval must still support apikey');
assert.ok(scrapers.includes('export async function searchVagalumeArtistPage'), 'Vagalume artist page search missing');
assert.ok(router.includes("error: 'As fontes de letras estão temporariamente indisponíveis. Tente novamente.'"), '503 message still masquerades as timeout');

console.log('UPSTREAM_RESILIENCE_OK: 503 requires zero completed providers; LRCLIB catalog resolver + Vagalume excerpt-without-apikey fallback + v9 cache verified');
