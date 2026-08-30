import assert from 'node:assert/strict';
import { handleApiRequest } from './proxyRouter.js';
import { resetProxyConfig } from './proxyConfig.js';
import { clearCache, resetProviderHealth } from './lyricsService.js';
import { extractLyricsAdvanced, EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION } from './extractionEngine.js';

const FULL_LYRICS = [
    'Mestre eu preciso de um milagre e de uma transformação completa em minha vida.',
    'Graça e esperança em Jesus aparecem nesta canção de teste com conteúdo suficiente.',
    'Remove a minha pedra, me chama pelo nome, muda a minha história e os meus sonhos.',
    'Refrão de adoração ao Senhor com palavras suficientes para validar a extração.',
    'Última linha extensa para confirmar a recuperação completa da letra no teste.',
].join('\n');

const VAGALUME_SONG_HTML = `<html><head><meta property="og:title" content="Canção Vagalume - Ministério Teste"></head><body><main><div class="lyrics">${FULL_LYRICS.replaceAll('\n', '<br>')}</div></main></body></html>`;

function lrclibRecord(id, title = 'Canção da Graça', artist = 'Ministério Teste') {
    return {
        id,
        name: title,
        trackName: title,
        artistName: artist,
        albumName: 'Álbum Teste',
        duration: 240,
        instrumental: false,
        plainLyrics: FULL_LYRICS,
        syncedLyrics: null,
    };
}

async function main() {
    resetProxyConfig();
    clearCache();
    resetProviderHealth();

    const health = await handleApiRequest('/api/health', 'GET', { 'x-forwarded-for': 'selftest-health' }, null);
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'online');
    assert.deepEqual(health.body.activeProviders, ['database', 'lrclib', 'vagalume']);
    assert.equal(health.body.providerModes.lrclib, 'json-search+id-get');
    assert.equal(health.body.providerModes.vagalume, 'legacy-index+web-glx-fallback');
    assert.ok(health.body.capabilities.includes('adaptive-dual-source-search'));
    assert.ok(health.body.capabilities.includes('lrclib-title-artist-album-search'));
    assert.equal(health.body.scraperEngine.name, EXTRACTION_ENGINE_NAME);
    assert.equal(health.body.scraperEngine.version, EXTRACTION_ENGINE_VERSION);

    const semanticFixture = `<html><body><main><div class="lyrics-shell"><div><p>Verso 1</p><p>Graça que alcança meu coração</p><p>Jesus é digno de todo louvor</p><p>Eu cantarei por toda a vida</p><p>Refrão</p><p>Santo, santo é o Senhor</p><p>Glória e honra ao nosso Deus</p></div></div></main></body></html>`;
    const semanticExtraction = extractLyricsAdvanced(semanticFixture);
    assert.ok(semanticExtraction);
    assert.match(semanticExtraction.text, /Santo, santo/);
    assert.ok(semanticExtraction.diagnostics.quality.confidence > 0.5);

    const localSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-local' }, { query: 'Casa', provider: 'built-in', limit: 4 });
    assert.equal(localSearch.status, 200);
    assert.ok(localSearch.body.data.length > 0);

    const originalFetch = globalThis.fetch;
    const calls = [];
    let forceLrclibEmpty = false;
    let forceUpstreamFailure = false;
    let forceVagalumeFailureOnly = false;
    try {
        globalThis.fetch = async (input) => {
            const url = String(input);
            calls.push(url);
            const parsed = new URL(url);

            if (parsed.hostname === 'lrclib.net' && parsed.pathname === '/api/search') {
                const q = (parsed.searchParams.get('q') || parsed.searchParams.get('track_name') || '').toLowerCase();
                if (forceUpstreamFailure && q.includes('falha temporaria'))
                    throw new Error('HTTP 503');
                if (forceLrclibEmpty)
                    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
                if (q.includes('falha temporaria'))
                    return new Response(JSON.stringify([lrclibRecord(903, 'Falha Temporaria')]), { status: 200, headers: { 'content-type': 'application/json' } });
                return new Response(JSON.stringify([lrclibRecord(901)]), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (parsed.hostname === 'lrclib.net' && parsed.pathname.startsWith('/api/get/')) {
                const id = Number(parsed.pathname.split('/').filter(Boolean).at(-1) || 901);
                return new Response(JSON.stringify(lrclibRecord(id)), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (url.includes('api.vagalume.com.br/search.excerpt')) {
                const query = decodeURIComponent(parsed.searchParams.get('q') || '').toLowerCase();
                if ((forceUpstreamFailure && query.includes('falha temporaria')) || forceVagalumeFailureOnly)
                    throw new Error('HTTP 503');
                if (query.includes('sem resultado parcial'))
                    return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
                return new Response(JSON.stringify({ response: { docs: [{
                    id: 'vg-77', title: 'Canção Vagalume', band: 'Ministério Teste',
                    snippet: 'Graça e esperança em Jesus aparecem nesta canção de teste'
                }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (url === 'https://www.vagalume.com.br/ministerio-teste/') {
                return new Response('<html><body><h1>Ministério Teste</h1><a href="/ministerio-teste/cancao-vagalume.html">Canção Vagalume</a></body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url === 'https://www.vagalume.com.br/ministerio-teste/cancao-vagalume.html') {
                return new Response(VAGALUME_SONG_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url.includes('vagalume.com.br/search/')) {
                if (forceVagalumeFailureOnly || (forceUpstreamFailure && decodeURIComponent(url).toLowerCase().includes('falha temporaria')))
                    throw new Error('HTTP 503');
                return new Response('<html><body>Carregando...</body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            throw new Error(`URL remota inesperada no self-test: ${url}`);
        };

        // Título isolado: LRCLIB resolve título+artista em JSON; Vagalume não é gasto quando o resultado é forte.
        const titleSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-title' }, { query: 'Canção da Graça', provider: 'multi-provider', limit: 5 });
        assert.equal(titleSearch.status, 200);
        assert.equal(titleSearch.body.data[0]?.source, 'lrclib');
        assert.deepEqual(titleSearch.body.providersUsed, ['lrclib']);
        assert.equal(calls.some(url => url.includes('vagalume')), false);

        const titleGet = await handleApiRequest('/api/proxy/lyrics/get', 'POST', { 'x-forwarded-for': 'selftest-title-get' }, { ...titleSearch.body.data[0], provider: 'lrclib' });
        assert.equal(titleGet.status, 200);
        assert.match(titleGet.body.data.fullLyrics, /Remove a minha pedra/i);

        // Resultado válido é cacheável.
        const callsAfterTitle = calls.length;
        const cached = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-title-cache' }, { query: 'Canção da Graça', provider: 'multi-provider', limit: 5 });
        assert.equal(cached.body.cached, true);
        assert.equal(calls.length, callsAfterTitle);

        // Trecho longo: Vagalume continua primeiro porque seu índice trabalha com excerpt da letra.
        clearCache();
        calls.length = 0;
        const excerpt = 'Graça e esperança em Jesus aparecem nesta canção de teste';
        const excerptSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-excerpt' }, { query: excerpt, provider: 'multi-provider', limit: 5 });
        assert.equal(excerptSearch.status, 200);
        assert.equal(excerptSearch.body.data[0]?.source, 'vagalume');
        assert.deepEqual(excerptSearch.body.providersUsed, ['vagalume']);
        assert.equal(calls.some(url => url.includes('lrclib.net')), false);

        // Se o resolvedor de catálogo não encontrar título, Vagalume assume o fallback.
        clearCache();
        resetProviderHealth();
        calls.length = 0;
        forceLrclibEmpty = true;
        const fallback = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-fallback' }, { query: 'Canção Vagalume', provider: 'multi-provider', limit: 4 });
        forceLrclibEmpty = false;
        assert.equal(fallback.status, 200);
        assert.ok(fallback.body.data.length > 0);
        assert.equal(fallback.body.data[0]?.source, 'vagalume');
        assert.deepEqual(fallback.body.providersUsed, ['lrclib', 'vagalume']);

        // Um provedor concluiu vazio e o outro falhou: 200 degradado, jamais cacheado.
        clearCache();
        resetProviderHealth();
        calls.length = 0;
        forceLrclibEmpty = true;
        forceVagalumeFailureOnly = true;
        const degraded = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-degraded' }, { query: 'Sem Resultado Parcial', provider: 'multi-provider', limit: 4 });
        forceLrclibEmpty = false;
        forceVagalumeFailureOnly = false;
        assert.equal(degraded.status, 200);
        assert.equal(degraded.body.count, 0);
        assert.equal(degraded.body.partial, true);
        assert.ok(degraded.body.providersCompleted.includes('lrclib'));
        assert.equal(degraded.body.cached, false);

        // Ambas indisponíveis: 503 retryable, sem cache; recuperação seguinte consulta upstream novamente.
        clearCache();
        resetProviderHealth();
        calls.length = 0;
        forceUpstreamFailure = true;
        const failed = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-fail' }, { query: 'Falha Temporaria', provider: 'multi-provider', limit: 4 });
        assert.equal(failed.status, 503);
        assert.equal(failed.body.code, 'UPSTREAM_UNAVAILABLE');
        assert.equal(failed.body.cached, false);
        const failureCalls = calls.length;
        forceUpstreamFailure = false;
        resetProviderHealth();
        const recovered = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-recover' }, { query: 'Falha Temporaria', provider: 'multi-provider', limit: 4 });
        assert.equal(recovered.status, 200);
        assert.ok(recovered.body.count > 0);
        assert.ok(calls.length > failureCalls);
    }
    finally {
        globalThis.fetch = originalFetch;
        resetProxyConfig();
        clearCache();
        resetProviderHealth();
    }

    console.log('PROXY_SELF_TEST_OK: LRCLIB title/artist catalog + Vagalume excerpt/gospel fallback + safe cache + completion-aware 503');
}

main().catch(error => {
    console.error('PROXY_SELF_TEST_FAILED', error);
    process.exitCode = 1;
});
