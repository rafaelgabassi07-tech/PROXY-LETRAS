# Gospel Lyrics Proxy 2.11.1

Backend privado da página **Letras** do Harpa & Bíblia, otimizado para Vercel Functions e para uma única caixa de busca capaz de receber título, artista ou trecho da letra.

## Arquitetura atual

O runtime remoto trabalha deliberadamente com **duas fontes**:

1. **LRCLIB** — catálogo/índice JSON primário para título, artista e álbum. A busca usa `/api/search` e a letra pode ser recuperada por ID em `/api/get/{id}`. Não exige chave, mas o Proxy identifica o cliente por `User-Agent`/`Lrclib-Client`.
2. **Vagalume** — cobertura complementar, especialmente conteúdo brasileiro/gospel e busca por trecho. Usa `search.excerpt` para descoberta; quando `VAGALUME_API_KEY` está configurada, `search.php` é usado para obter a letra por música/artista ou ID. A página pública do artista/web continua disponível como redundância da própria fonte.

A biblioteca local do Proxy permanece como fallback determinístico e não conta como chamada remota.

**Letras.mus.br não participa mais do caminho de busca.** As URLs de busca tentadas nas versões anteriores retornavam HTTP 404 no deployment real e mascaravam o problema de título isolado como resposta `200 partial:true` vazia.

## Roteamento

- **Título / artista / álbum**: LRCLIB primeiro; Vagalume apenas se o primeiro catálogo não produzir candidato forte.
- **Trecho claro da letra**: Vagalume primeiro; LRCLIB como fallback.
- A listagem não abre páginas completas de letras.
- A letra completa é carregada somente após o toque em um resultado.
- Resposta `partial:true` ou `count:0` não entra no cache.
- Cache de busca atual: `search-v9-catalog-resolver`.
- `503 UPSTREAM_UNAVAILABLE` só é emitido se nenhum provedor remoto concluir.

## Diagnóstico de logs

Uma pesquisa de título bem-sucedida deve normalmente produzir algo semelhante a:

```json
{
  "status": 200,
  "partial": false,
  "providersUsed": ["lrclib"],
  "providersCompleted": ["lrclib"],
  "resultCount": 1,
  "cacheStatus": "stored"
}
```

Se LRCLIB não encontrar candidato e Vagalume recuperar a consulta, `providersUsed` conterá as duas fontes. Se uma fonte falhar e a outra concluir, o resultado pode ser `200 partial:true`; ele não é cacheado.

## Endpoints consumidos pelo APK

- `GET /api/health`
- `GET /api/proxy/health`
- `POST /api/proxy/lyrics/search`
- `POST /api/proxy/lyrics/get`
- `POST /api/proxy/cache/clear` (administrativo)
- `GET/POST /api/proxy/config` (administrativo)

O valor HTTP `provider: "multi-provider"` permanece apenas por compatibilidade com o APK; no runtime significa roteamento adaptativo entre LRCLIB e Vagalume, não fan-out indiscriminado.

## Configuração

- Node.js: 24.x na Vercel.
- `VAGALUME_API_KEY`: recomendada para recuperação de letra pelo endpoint oficial do Vagalume.
- `LYRICS_SEARCH_BUDGET_MS`: opcional; padrão 7600 ms, limite 3200–9000 ms.
- `LYRICS_GET_BUDGET_MS`: opcional; padrão 8500 ms, limite 5000–12000 ms.
- `RAW_PROXY_ENABLED`: `false` por padrão.

## Validação

Sem depender das bibliotecas npm instaladas, os seguintes gates podem ser executados:

```bash
npm run test:deploy
npm run test:cache-policy
npm run test:upstream-resilience
npm run test:catalog-routing
```

`npm test` executa o self-test completo e requer `npm install`.

## GLX Extraction Engine 3.1

O GLX continua disponível para fallbacks web do Vagalume e recuperação de páginas, com parse5/htmlparser2, dados estruturados, análise de densidade textual, validação de redirects/hosts, limite de corpo em streaming e diagnóstico de qualidade. Ele não é usado para descobrir título no caminho primário da 2.11.1; essa função agora pertence ao catálogo JSON.
