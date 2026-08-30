# Auditoria de busca — resolução 2.11.1

## Falha observada

O log real mostrava Vagalume concluído sem candidatos e Letras.mus.br com `HTTP_404`. A pesquisa por artista funcionava porque o código conseguia abrir uma página determinística de artista no Vagalume; título isolado não possuía um resolvedor de catálogo confiável.

## Correção

- removido Letras.mus.br do path de descoberta;
- adicionado LRCLIB `/api/search` como catálogo JSON para título/artista/álbum;
- título/artista usam LRCLIB primeiro;
- trecho claro usa Vagalume primeiro;
- Vagalume permanece fallback de cobertura e letra;
- ranking LRCLIB ganha bônus para título/artista exatos;
- URL/ID LRCLIB são preservados para `/api/get/{id}`;
- cache migrado para `search-v9-catalog-resolver`;
- `partial + vazio` não é cacheado e o APK repete a pesquisa uma vez.

## Evidência automatizada

O gate `scripts/verify-catalog-resolver-harness.mjs` executa o `lyricsService.js` real com upstreams controlados e exige:

- `TITLE_SEARCH_PRIMARY_OK`;
- `ARTIST_SEARCH_PRIMARY_OK`;
- `EXCERPT_SEARCH_PRIMARY_OK`;
- `TITLE_FALLBACK_VAGALUME_OK`;
- `PARTIAL_DIAGNOSTICS_OK`.
