# Deploy no Vercel — Proxy 2.10.1

## Estrutura atual

As rotas públicas possuem Functions `.js` físicas e leves em `api/` (por exemplo `api/proxy/lyrics/search.js`). Elas delegam para `api/index.js`, que preserva o pathname original e encaminha a chamada ao router compartilhado.

O health continua com caminho leve. Busca e obtenção de letra carregam o runtime sob demanda.

## Fontes ativas

O runtime remoto usa somente **Letras.mus.br + Vagalume**. O valor `multi-provider` permanece no contrato HTTP para compatibilidade, mas significa roteamento adaptativo entre essas duas fontes:

- título/artista/trecho: Vagalume `search.excerpt` primeiro; Letras somente como fallback;
- trecho: Vagalume `search.excerpt` primeiro; Letras somente se necessário;
- a listagem não abre páginas completas de letras;
- a hidratação da letra completa ocorre em `/api/proxy/lyrics/get` após o usuário selecionar um resultado.

## Configuração

- Framework Preset: Other
- Root Directory: `./`
- Install Command: automático (`npm install`)
- Build Command: o `vercel.json` usa `echo GLX_NO_BUILD_REQUIRED`
- Output Directory: `public`
- Node.js: 24.x (definido em `package.json`)
- `LYRICS_SEARCH_BUDGET_MS`: opcional; padrão 5200 ms, faixa 3200–9000 ms
- `LYRICS_GET_BUDGET_MS`: opcional; padrão 8500 ms, faixa 5000–12000 ms
- `VAGALUME_API_KEY`: opcional; a busca por trecho funciona sem chave pelo índice público

## Git / upload

Faça o deploy da pasta raiz deste Proxy, mantendo `api/`, `server/`, `public/`, `package.json` e `vercel.json`.

## Smoke tests

1. `GET /api/health` → HTTP 200, `status: "online"` e `activeProviders` igual a `database`, `letras_mus_br`, `vagalume`.
2. `POST /api/proxy/lyrics/search` com `{ "query": "nome do artista", "provider": "multi-provider" }` → HTTP 200 e, quando Letras responder com candidato forte, `providersUsed: ["letras_mus_br"]`.
3. Repita com nome de música.
4. Repita com um trecho claro de 5+ palavras → o Vagalume deve ser a fonte primária; a busca não deve abrir uma página de letra completa.
5. Abra um resultado em `POST /api/proxy/lyrics/get` e confirme `fullLyrics` não vazio.
6. Simule falha/resultado vazio da fonte primária e confirme que apenas então a segunda fonte aparece em `providersUsed`.


### Após publicar 2.10.1

Não é necessário limpar manualmente o cache antigo: a chave de busca mudou para `search-v7-resilient`. Para confirmar a correção, um log de busca válida deve mostrar `cacheStatus:"stored"` na primeira consulta e `cacheStatus:"hit"` nas seguintes. Se as fontes falharem, o log deve mostrar HTTP 503, `cached:false` e `cacheStatus:"bypass-partial"`; esse resultado jamais deve virar cache hit.
