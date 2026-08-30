import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = fs.readFileSync(path.join(root, 'server/lyricsService.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'server/proxyRouter.js'), 'utf8');

const match = service.match(/function reusableSearchCacheEntry\(value\) \{[\s\S]*?\n\}/);
assert.ok(match, 'reusableSearchCacheEntry missing');
const reusable = vm.runInNewContext(`(${match[0].replace(/^function\s+reusableSearchCacheEntry/, 'function')})`);

assert.equal(reusable({ results: [], total: 0, partial: true }), false, 'partial empty response must never be cached');
assert.equal(reusable({ results: [], total: 0, partial: false }), false, 'empty response must never be cached');
assert.equal(reusable({ results: [{ id: 'ok' }], total: 1, partial: true }), false, 'partial response must never be cached');
assert.equal(reusable({ results: [{ id: 'ok' }], total: 1, partial: false }), true, 'complete non-empty response should be cacheable');

assert.ok(service.includes("cacheKey('search-v8-upstream-resilient'"), 'search cache namespace was not invalidated');
assert.ok(!service.includes("cacheKey('search-v7-resilient'") && !service.includes("cacheKey('search-v6-dual'"), 'legacy search cache namespace still active');
assert.ok(service.includes("? ['vagalume', 'letras_mus_br']"), 'Vagalume must be the primary dual-source provider');
assert.ok(service.includes("cacheStatus = cacheable ? 'stored' : (partial ? 'bypass-partial' : 'bypass-empty')"), 'cache bypass diagnostics missing');
assert.ok(router.includes('completedProviders.length === 0'), '503 must require zero completed providers');
assert.ok(router.includes('providersCompleted: result.providersCompleted'), 'providersCompleted diagnostics missing');
assert.ok(router.includes("code: 'UPSTREAM_UNAVAILABLE'"), '503 upstream error contract missing');
assert.ok(router.includes("responseHeaders['Retry-After'] = '2'"), 'Retry-After missing');
assert.ok(router.includes('cacheStatus: newLog.cacheStatus'), 'cacheStatus not emitted in runtime logs');
assert.ok(router.includes('providersUsed: newLog.providersUsed'), 'providersUsed not emitted in runtime logs');
assert.ok(router.includes('providerErrors: newLog.providerErrors'), 'providerErrors not emitted in runtime logs');

console.log('CACHE_POISON_REGRESSION_OK: partial/empty responses bypass cache; valid results cache; v8 namespace active; 503 requires zero completed upstreams');
