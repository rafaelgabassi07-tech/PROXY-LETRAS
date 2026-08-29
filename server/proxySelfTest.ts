import assert from 'node:assert/strict';
import { handleApiRequest } from './proxyRouter.ts';
import { resetProxyConfig, updateProxyConfig } from './proxyConfig.ts';
import { clearCache, resetProviderHealth } from './lyricsService.ts';
import { extractLyricsAdvanced, EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION } from './extractionEngine.ts';

async function main() {
  resetProxyConfig();
  clearCache();
  resetProviderHealth();

  const health = await handleApiRequest('/api/health', 'GET', { 'x-forwarded-for': 'selftest-health' }, null);
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'online');
  assert.ok(health.body.activeProviders.includes('database'));
  assert.equal(health.body.scraperEngine.name, EXTRACTION_ENGINE_NAME);
  assert.equal(health.body.scraperEngine.version, EXTRACTION_ENGINE_VERSION);
  assert.ok(health.body.capabilities.includes('dual-dom-parser'));

  const semanticFixture = `<html><body><main><div class="lyrics-shell"><div><p>Verso 1</p><p>Graça que alcança meu coração</p><p>Jesus é digno de todo louvor</p><p>Eu cantarei por toda a vida</p><p>Refrão</p><p>Santo, santo é o Senhor</p><p>Glória e honra ao nosso Deus</p></div></div></main></body></html>`;
  const semanticExtraction = extractLyricsAdvanced(semanticFixture);
  assert.ok(semanticExtraction);
  assert.match(semanticExtraction.text, /Santo, santo/);
  assert.ok(semanticExtraction.diagnostics.candidateCount >= 1);
  assert.ok(semanticExtraction.diagnostics.quality.confidence > 0.5);

  const hydrationFixture = `<html><body><nav>Menu Login Cookies Publicidade</nav><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { song: { lyrics: 'Verso\nTua graça me sustenta todos os dias\nTeu amor renova minha esperança\nRefrão\nJesus, eu cantarei teu santo nome\nPara sempre renderei meu louvor' } } } })}</script></body></html>`;
  const hydrationExtraction = extractLyricsAdvanced(hydrationFixture);
  assert.ok(hydrationExtraction);
  assert.match(hydrationExtraction.text, /Tua graça/);
  assert.ok(['hydration-state', 'json-embedded'].includes(hydrationExtraction.method));

  const localSearch = await handleApiRequest(
    '/api/proxy/lyrics/search',
    'POST',
    { 'x-forwarded-for': 'selftest-local' },
    { query: 'Casa', provider: 'built-in', limit: 4 },
  );
  assert.equal(localSearch.status, 200);
  assert.ok(localSearch.body.data.length > 0);

  const localHit = localSearch.body.data[0];
  const localGet = await handleApiRequest(
    '/api/proxy/lyrics/get',
    'POST',
    { 'x-forwarded-for': 'selftest-local-get' },
    { id: localHit.id, provider: localHit.source },
  );
  assert.equal(localGet.status, 200);
  assert.ok(localGet.body.data.fullLyrics.length > 80);

  const originalFetch = globalThis.fetch;
  try {
    let remoteCalls = 0;
    globalThis.fetch = async input => {
      remoteCalls += 1;
      const url = String(input);
      if (url.includes('letras.mus.br') && (url.includes('?q=') || url.includes('/buscar/') || url.includes('/busca/'))) {
        const hydrationSearch = {
          props: {
            pageProps: {
              search: {
                results: [
                  {
                    title: 'Canção da Graça',
                    artist: { name: 'Ministério Teste' },
                    url: '/ministerio-teste/cancao-da-graca/',
                  },
                ],
              },
            },
          },
        };
        return new Response(
          `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(hydrationSearch)}</script></body></html>`,
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }
      if (url === 'https://www.letras.mus.br/ministerio-teste/cancao-da-graca/') {
        return new Response(
          '<html><head><meta property="og:title" content="Canção da Graça - Ministério Teste"></head><body><div class="lyric-original">Verso um com palavras suficientes para representar uma letra gospel completa de teste.<br>Outra linha de louvor ao Senhor com conteúdo significativo para extração.<br>Mais uma linha extensa para validar a leitura e a normalização.<br>Refrão de graça, esperança e adoração em nossa canção de teste.<br>Última linha suficientemente longa para passar pelo filtro do extrator.</div></body></html>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }
      throw new Error(`URL remota inesperada no self-test: ${url}`);
    };

    const remoteSearch = await handleApiRequest(
      '/api/proxy/lyrics/search',
      'POST',
      { 'x-forwarded-for': 'selftest-remote' },
      { query: 'Canção da Graça', provider: 'letras_mus_br', limit: 5 },
    );
    assert.equal(remoteSearch.status, 200);
    assert.ok(remoteSearch.body.data.length > 0);
    const remoteHit = remoteSearch.body.data[0];
    assert.equal(remoteHit.source, 'letras_mus_br');

    const cachedSearch = await handleApiRequest(
      '/api/proxy/lyrics/search',
      'POST',
      { 'x-forwarded-for': 'selftest-remote-cache' },
      { query: 'Canção da Graça', provider: 'letras_mus_br', limit: 5 },
    );
    assert.equal(cachedSearch.status, 200);
    assert.equal(cachedSearch.body.cached, true);
    assert.equal(remoteCalls, 1);

    const remoteGet = await handleApiRequest(
      '/api/proxy/lyrics/get',
      'POST',
      { 'x-forwarded-for': 'selftest-remote-get' },
      { ...remoteHit, provider: remoteHit.source },
    );
    assert.equal(remoteGet.status, 200);
    assert.match(remoteGet.body.data.fullLyrics, /Refrão/);
    assert.equal(remoteGet.body.data.extraction.engine, EXTRACTION_ENGINE_NAME);
    assert.ok(remoteGet.body.data.extraction.quality.confidence > 0.5);
    assert.equal(remoteCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  updateProxyConfig({
    providers: {
      customApi: {
        enabled: true,
        endpointUrl: 'https://custom.selftest/lyrics',
        method: 'POST',
      },
    } as any,
  });

  try {
    globalThis.fetch = async (input, init = {}) => {
      assert.equal(String(input), 'https://custom.selftest/lyrics');
      const request = JSON.parse(String(init.body || '{}'));
      if (request.action === 'search') {
        return new Response(JSON.stringify({ results: [{ id: 'custom-1', title: 'Canção Custom', artist: 'Ministério X' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ data: { id: 'custom-1', title: 'Canção Custom', artist: 'Ministério X', lyrics: 'Linha um de louvor.\nLinha dois de adoração.\nLinha três de esperança e fé.' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const customSearch = await handleApiRequest(
      '/api/proxy/lyrics/search',
      'POST',
      { 'x-forwarded-for': 'selftest-custom' },
      { query: 'Canção Custom', provider: 'custom', limit: 3 },
    );
    assert.equal(customSearch.status, 200);
    const customHit = customSearch.body.data[0];
    assert.equal(customHit.source, 'custom_api');

    const customGet = await handleApiRequest(
      '/api/proxy/lyrics/get',
      'POST',
      { 'x-forwarded-for': 'selftest-custom-get' },
      { ...customHit, provider: customHit.source },
    );
    assert.equal(customGet.status, 200);
    assert.equal(customGet.body.data.source, 'custom_api');
  } finally {
    globalThis.fetch = originalFetch;
    resetProxyConfig();
    clearCache();
    resetProviderHealth();
  }

  console.log('PROXY_SELF_TEST_OK: GLX 3.1 dual-parser + ensemble + structured search/state + health + biblioteca local + scraping Letras + provider custom');
}

main().catch(error => {
  console.error('PROXY_SELF_TEST_FAILED', error);
  process.exitCode = 1;
});
