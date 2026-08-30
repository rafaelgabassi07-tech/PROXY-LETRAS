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

assert.equal(classifier({ total: 0, partial: true, providersCompleted: ['vagalume'], providerErrors: [{ provider: 'letras' }] }), false,
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
assert.ok(service.includes("cacheKey('search-v8-upstream-resilient'"), 'v8 cache namespace missing');
assert.ok(service.includes('searchVagalumeArtistPage('), 'Vagalume direct artist-page fallback missing');
assert.ok(scrapers.includes("url.searchParams.set('apikey'"), 'Vagalume search does not forward configured API key');
assert.ok(scrapers.includes('export async function searchVagalumeArtistPage'), 'Vagalume artist page search missing');
assert.ok(router.includes("error: 'As fontes de letras estão temporariamente indisponíveis. Tente novamente.'"), '503 message still masquerades as timeout');

console.log('UPSTREAM_RESILIENCE_OK: 503 requires zero completed providers; Vagalume key forwarding + artist-page fallback + v8 cache verified');
