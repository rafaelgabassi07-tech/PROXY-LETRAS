import assert from 'node:assert/strict';
import { handleApiRequest } from './proxyRouter.js';
import { resetProxyConfig } from './proxyConfig.js';
import { clearCache, resetProviderHealth } from './lyricsService.js';
import { extractLyricsAdvanced, EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION } from './extractionEngine.js';

const LETRAS_RESULT_HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { search: { results: [
        { title: 'Canção da Graça', artist: { name: 'Ministério Teste' }, url: '/ministerio-teste/cancao-da-graca/' }
    ] } } }
})}</script></body></html>`;

const LETRAS_SONG_HTML = '<html><head><meta property="og:title" content="Canção da Graça - Ministério Teste"></head><body><div class="lyric-original">Verso um com palavras suficientes para representar uma letra gospel completa de teste.<br>Outra linha de louvor ao Senhor com conteúdo significativo para extração.<br>Mais uma linha extensa para validar a leitura e a normalização.<br>Refrão de graça, esperança e adoração em nossa canção de teste.<br>Última linha suficientemente longa para passar pelo filtro do extrator.</div></body></html>';

const VAGALUME_SONG_HTML = '<html><head><meta property="og:title" content="Canção Vagalume - Ministério Teste"></head><body><main><div class="lyrics">Verso um de louvor com texto suficientemente amplo para o extrator.<br>Graça e esperança em Jesus aparecem nesta canção de teste.<br>Refrão de adoração ao Senhor com conteúdo musical significativo.<br>Última linha da letra para confirmar a recuperação completa.</div></main></body></html>';

async function main() {
    resetProxyConfig();
    clearCache();
    resetProviderHealth();

    const health = await handleApiRequest('/api/health', 'GET', { 'x-forwarded-for': 'selftest-health' }, null);
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'online');
    assert.deepEqual(health.body.activeProviders, ['database', 'letras_mus_br', 'vagalume']);
    assert.equal(health.body.providerModes.letrasMusBr, 'web-glx');
    assert.equal(health.body.providerModes.vagalume, 'web-glx');
    assert.equal(health.body.providerModes.genius, undefined);
    assert.ok(health.body.capabilities.includes('adaptive-dual-source-search'));
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
    const localHit = localSearch.body.data[0];
    const localGet = await handleApiRequest('/api/proxy/lyrics/get', 'POST', { 'x-forwarded-for': 'selftest-local-get' }, { id: localHit.id, provider: localHit.source });
    assert.equal(localGet.status, 200);
    assert.ok(localGet.body.data.fullLyrics.length > 80);

    const originalFetch = globalThis.fetch;
    const calls = [];
    let forceVagalumeEmpty = false;
    let forceUpstreamFailure = false;
    try {
        globalThis.fetch = async (input) => {
            const url = String(input);
            calls.push(url);
            if (url.includes('letras.mus.br') && (url.includes('?q=') || url.includes('/buscar/') || url.includes('/busca/'))) {
                const decoded = decodeURIComponent(url).toLowerCase();
                if (forceUpstreamFailure && decoded.includes('falha temporaria'))
                    throw new Error('HTTP 503');
                return new Response(LETRAS_RESULT_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url === 'https://www.letras.mus.br/ministerio-teste/cancao-da-graca/') {
                return new Response(LETRAS_SONG_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url.includes('api.vagalume.com.br/search.excerpt')) {
                const query = decodeURIComponent(new URL(url).searchParams.get('q') || '');
                const normalizedQuery = query.toLowerCase();
                if (forceUpstreamFailure && normalizedQuery.includes('falha temporaria'))
                    throw new Error('HTTP 503');
                if (forceVagalumeEmpty)
                    return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
                if (normalizedQuery.includes('falha temporaria')) {
                    return new Response(JSON.stringify({ response: { docs: [{
                        id: 'vg-recovered', title: 'Falha Temporaria', band: 'Ministério Teste', snippet: 'Falha Temporaria'
                    }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
                }
                if (normalizedQuery.includes('canção da graça') || normalizedQuery.includes('cancao da graca')) {
                    return new Response(JSON.stringify({ response: { docs: [{
                        id: 'vg-graca', title: 'Canção da Graça', band: 'Ministério Teste', snippet: 'Canção da Graça'
                    }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
                }
                return new Response(JSON.stringify({ response: { docs: [{
                    id: 'vg-77', title: 'Canção Vagalume', band: 'Ministério Teste',
                    snippet: 'Graça e esperança em Jesus aparecem nesta canção de teste'
                }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (url === 'https://www.vagalume.com.br/ministerio-teste/') {
                return new Response('<html><body><a href="/ministerio-teste/cancao-vagalume.html">Canção Vagalume</a><a href="/ministerio-teste/sem-resultado-letras.html">Sem Resultado Letras</a></body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url === 'https://www.vagalume.com.br/ministerio-teste/cancao-vagalume.html') {
                return new Response(VAGALUME_SONG_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url === 'https://www.vagalume.com.br/ministerio-teste/sem-resultado-letras.html') {
                return new Response(VAGALUME_SONG_HTML.replaceAll('Canção Vagalume', 'Sem Resultado Letras'), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            if (url.includes('vagalume.com.br/search/')) {
                if (forceUpstreamFailure && decodeURIComponent(url).toLowerCase().includes('falha temporaria'))
                    throw new Error('HTTP 503');
                return new Response('<html><body>Carregando...</body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
            }
            throw new Error(`URL remota inesperada no self-test: ${url}`);
        };

        // Título/artista: o índice JSON do Vagalume é a primeira fonte e Letras não é
        // consultado quando há candidato forte.
        const titleSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-title' }, { query: 'Canção da Graça', provider: 'multi-provider', limit: 5 });
        assert.equal(titleSearch.status, 200);
        assert.equal(titleSearch.body.provider, 'dual-source');
        assert.equal(titleSearch.body.data[0]?.source, 'vagalume');
        assert.deepEqual(titleSearch.body.providersUsed, ['vagalume']);
        assert.equal(titleSearch.body.cached, false);
        assert.equal(titleSearch.body.cacheStatus, 'stored');
        assert.equal(calls.some(url => url.includes('letras.mus.br')), false);

        // Resultado válido é cacheável e pode ser reutilizado.
        const callsAfterFirstTitle = calls.length;
        const titleCached = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-title-cache' }, { query: 'Canção da Graça', provider: 'multi-provider', limit: 5 });
        assert.equal(titleCached.status, 200);
        assert.equal(titleCached.body.cached, true);
        assert.equal(titleCached.body.cacheStatus, 'hit');
        assert.equal(calls.length, callsAfterFirstTitle);

        // Trecho: Vagalume usa o índice full-text e não abre página de letra durante a listagem.
        calls.length = 0;
        const excerpt = 'Graça e esperança em Jesus aparecem nesta canção de teste';
        const excerptSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-excerpt' }, { query: excerpt, provider: 'multi-provider', limit: 5 });
        assert.equal(excerptSearch.status, 200);
        assert.equal(excerptSearch.body.data[0]?.source, 'vagalume');
        assert.deepEqual(excerptSearch.body.providersUsed, ['vagalume']);
        assert.equal(calls.filter(url => url.includes('vagalume.com.br/ministerio-teste/')).length, 0);
        assert.equal(calls.some(url => url.includes('letras.mus.br')), false);

        const excerptGet = await handleApiRequest('/api/proxy/lyrics/get', 'POST', { 'x-forwarded-for': 'selftest-excerpt-get' }, { ...excerptSearch.body.data[0], provider: 'vagalume' });
        assert.equal(excerptGet.status, 200);
        assert.match(excerptGet.body.data.fullLyrics, /adoração/i);

        // Fallback: Letras só é consultado quando o Vagalume não traz candidato.
        clearCache();
        resetProviderHealth();
        calls.length = 0;
        forceVagalumeEmpty = true;
        const fallbackSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-fallback' }, { query: 'Canção da Graça', provider: 'multi-provider', limit: 4 });
        forceVagalumeEmpty = false;
        assert.equal(fallbackSearch.status, 200);
        assert.ok(fallbackSearch.body.data.length > 0);
        assert.equal(fallbackSearch.body.data[0]?.source, 'letras_mus_br');
        assert.deepEqual(fallbackSearch.body.providersUsed, ['vagalume', 'letras_mus_br']);
        assert.ok(calls.some(url => url.includes('api.vagalume.com.br/search.excerpt')));
        assert.ok(calls.some(url => url.includes('letras.mus.br')));

        // Regressão do log real: falha parcial + zero resultado nunca pode ser cacheada nem
        // mascarada como 200. A repetição deve consultar os upstreams novamente.
        clearCache();
        resetProviderHealth();
        calls.length = 0;
        forceUpstreamFailure = true;
        const failedSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-poison-cache' }, { query: 'Falha Temporaria', provider: 'multi-provider', limit: 4 });
        assert.equal(failedSearch.status, 503);
        assert.equal(failedSearch.body.code, 'UPSTREAM_UNAVAILABLE');
        assert.equal(failedSearch.body.cached, false);
        assert.equal(failedSearch.body.cacheStatus, 'bypass-partial');
        assert.equal(failedSearch.body.count, 0);
        const failureCalls = calls.length;
        assert.ok(failureCalls > 0);

        forceUpstreamFailure = false;
        resetProviderHealth();
        const recoveredSearch = await handleApiRequest('/api/proxy/lyrics/search', 'POST', { 'x-forwarded-for': 'selftest-poison-recovery' }, { query: 'Falha Temporaria', provider: 'multi-provider', limit: 4 });
        assert.equal(recoveredSearch.status, 200);
        assert.equal(recoveredSearch.body.cached, false);
        assert.equal(recoveredSearch.body.cacheStatus, 'stored');
        assert.ok(recoveredSearch.body.count > 0);
        assert.ok(calls.length > failureCalls);
    }
    finally {
        globalThis.fetch = originalFetch;
        resetProxyConfig();
        clearCache();
        resetProviderHealth();
    }

    console.log('PROXY_SELF_TEST_OK: GLX + Vagalume index-first + Letras fallback + cache resiliente + 503 upstream + recuperação exata');
}

main().catch(error => {
    console.error('PROXY_SELF_TEST_FAILED', error);
    process.exitCode = 1;
});
