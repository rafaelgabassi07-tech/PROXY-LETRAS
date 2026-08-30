# Deploy no Vercel — Proxy 2.11.1

## Estrutura

Publique a raiz contendo `api/`, `server/`, `public/`, `scripts/`, `package.json` e `vercel.json`. As 12 rotas públicas possuem Functions `.js` físicas e delegam ao router compartilhado.

Configuração esperada:

- Framework Preset: Other
- Root Directory: `./`
- Build Command: `echo GLX_NO_BUILD_REQUIRED`
- Output Directory: `public`
- Node.js: 24.x
- `VAGALUME_API_KEY`: recomendada

## Fontes remotas

- `lrclib`: descoberta primária de título/artista/álbum e letra por ID.
- `vagalume`: trecho, cobertura brasileira/gospel e fallback de letra.

Letras.mus.br foi removido do runtime de busca porque as rotas de pesquisa usadas anteriormente estavam retornando HTTP 404 na Vercel.

## Cache

A versão 2.11.1 usa o namespace `search-v9-catalog-resolver`. Isso invalida automaticamente respostas produzidas pelas estratégias v6/v7/v8. Resultados vazios ou parciais nunca são armazenados.

## Smoke tests pós-deploy

1. `GET /api/health` → HTTP 200, versão `2.11.1`, `activeProviders` contendo `database`, `lrclib`, `vagalume`.
2. Pesquise **nome de música** em `POST /api/proxy/lyrics/search`. O caminho normal deve mostrar `providersUsed:["lrclib"]` quando houver candidato forte.
3. Pesquise **nome de artista**. Deve retornar músicas sem exigir página/slug adivinhado.
4. Pesquise um **trecho claro de 5+ palavras**. O Vagalume deve aparecer primeiro em `providersUsed`.
5. Abra um resultado em `/api/proxy/lyrics/get` e confirme `fullLyrics` não vazio.
6. Repita uma busca não vazia e confirme `cacheStatus:"hit"`.
7. Em falha parcial, confirme `cached:false` e `cacheStatus:"bypass-partial"`.

## Interpretação do diagnóstico

- `status:200, partial:false, resultCount>0`: fluxo saudável.
- `status:200, partial:true, resultCount>0`: resultado útil com uma fonte degradada; não cacheado.
- `status:200, partial:true, resultCount:0`: pelo menos uma fonte concluiu, mas o conjunto ficou incompleto; o APK 2.11 repete uma vez automaticamente.
- `status:503, providersCompleted:[]`: nenhuma fonte remota concluiu; `Retry-After: 2` e sem cache.
