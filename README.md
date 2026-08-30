# Gospel Lyrics Proxy 2.10.1

Produção Vercel consolidada em uma única Function (`api/index.js`) com limpeza automática de rotas legadas no build.

## GLX Extraction Engine 3.1

O scraping HTML é executado pelo motor próprio **GLX Extraction Engine 3.1**. Cheerio é usado como infraestrutura de DOM, não como algoritmo único: o motor interpreta a mesma página com **parse5** (árvore compatível com HTML5/browser) e **htmlparser2** (parser tolerante), agrega candidatos e decide a letra por consenso e scoring próprio.

Pipeline adaptativo de extração:

1. **estrutura explícita** — seletores semânticos, microdados, JSON-LD e propriedades de letra;
2. **dupla árvore DOM** — a mesma página é interpretada com parse5 e htmlparser2;
3. **densidade textual** — conteúdo, quantidade/formato de linhas e link-density;
4. **análise estrutural tipo Readability** — pontuação de blocos propagada para pai/avô e montagem de irmãos relevantes;
5. **classificação contextual de blocos tipo boilerplate remover** — blocos fortes/fracos e recuperação de linhas curtas quando cercadas por conteúdo válido;
6. **estados de frameworks** — `__NEXT_DATA__`, Nuxt, Apollo, estado inicial, React Flight/`__next_f`, scripts JSON e propriedades serializadas, sempre sem executar JavaScript;
7. **conteúdo alternativo** — `noscript`/`template`;
8. **recuperação heurística** — regex tolerante a HTML parcialmente quebrado;
9. **ensemble** — deduplicação exata e por similaridade, consenso entre parser e entre estratégias;
10. **resgate adaptativo de recall** — extração ampla da árvore original somente quando a cascata de maior precisão não alcança confiança suficiente;
11. **scoring específico para letras** — refrões repetidos não são tratados como boilerplate; ruído, navegação, densidade de links, formato das linhas e marcadores de verso/refrão entram na nota;
12. **diagnóstico** — método vencedor, parser, candidatos, score, confiança, sinais e warnings retornam ao APK.

Os princípios de pontuação de ancestrais/irmãos, classificação de boilerplate e cascata precisão→fallback→recall foram adaptados para letras. O GLX não incorpora nem chama Readability, Trafilatura ou jusText em runtime: o algoritmo decisório continua sendo próprio.

O fetch remoto também limita o corpo durante o streaming, valida host em redirecionamentos, restringe quantidade de redirects e usa retry com backoff/jitter apenas para erros HTTP transitórios.


Backend privado para a aba **Letras** do Harpa & Bíblia. Ele centraliza busca, scraping, cache, normalização e obtenção da letra completa sem expor a lógica de coleta no APK.

## Recursos

- fluxo remoto enxuto com apenas **Letras.mus.br + Vagalume**, além da biblioteca local;
- roteamento adaptativo: **Vagalume `search.excerpt` primeiro para título, artista e trecho**; Letras é fallback quando o índice estruturado não entrega um candidato forte;
- busca refinada por **título, artista ou trecho da letra**, sem abrir páginas completas de letras durante a listagem;
- Vagalume usa `search.excerpt` sem credencial para descoberta por trecho e API oficial quando `VAGALUME_API_KEY` estiver configurada;
- a letra completa é hidratada somente após a seleção do resultado, reduzindo latência e carga externa;
- GLX Extraction Engine 3.1 com ensemble multi-parser/multi-estratégia, dados estruturados, hydration state, análise estrutural, blocos contextuais e resgate adaptativo;
- cache TTL limitado em memória e deduplicação de resultados;
- timeouts, circuit breaker por provedor e rate limit;
- preservação da URL exata do resultado para evitar uma segunda busca ambígua;
- endpoint de saúde consumido diretamente pelo APK;
- proxy bruto desativado por padrão, allowlist explícita e bloqueios SSRF para DNS/IPv4/IPv6/redirecionamentos privados.

## Execução local

Requer Node.js 24 LTS. O `package.json` restringe o runtime a `>=24 <26` para manter o servidor em uma linha LTS previsível.

```bash
npm install
npm run dev
```

O modo `npm run dev` abre o adaptador HTTP local em `http://localhost:3000` usando `node:http`. O painel Vite foi isolado em `web/` e usa `npm run web:dev`. O APK de produção usa por padrão `https://proxy-letras.vercel.app`; `10.0.2.2:3000` permanece apenas como override local de desenvolvimento.

Para executar o servidor de produção:

```bash
npm start
```

Para gerar o painel estático opcional, instale também `web/` e execute `npm run web:build`.

Copie `.env.example` para `.env` ou `.env.local` e preencha somente as credenciais dos provedores que quiser habilitar. O scraping do Letras.mus.br não exige token.

## Contrato usado pelo APK

- `GET /api/health` — disponibilidade, versão, provedores ativos e capacidades/versão do GLX;
- `POST /api/proxy/lyrics/search` — recebe `query`, `artist`, `limit` e `provider`;
- `POST /api/proxy/lyrics/get` — recebe o resultado selecionado, inclusive `sourceUrl`/`providerRef`, e retorna a letra normalizada;
- `POST /api/proxy/cache/clear` — limpa o cache (**administrativo**);
- `GET/POST /api/proxy/config` — configuração sanitizada/persistência em memória (**administrativo**; segredos nunca são devolvidos em claro);
- `POST /api/proxy/lyrics/raw` — desativado por padrão; quando habilitado exige administração + allowlist e validação SSRF.

A URL do Proxy pode ser alterada no próprio cabeçalho da aba **Letras** no APK, sem recompilar o aplicativo.
## Produção no Vercel

Endpoint oficial usado pelo APK: `https://proxy-letras.vercel.app`. Produção usa Vercel Functions nativas em `api/`; não existe `server.ts` na raiz e, portanto, não há auto-detecção Express no deployment. O `vercel.json` define apenas `framework: null` (preset Other). O runtime declarado é Node 24.x. O painel continua isolado em `web/`.

Validação pós-deploy recomendada: `GET /api/health` deve responder `status: online` e informar a versão/recursos do GLX.


## Fontes ativas do motor 2.10

O modo `multi-provider` permanece como nome de contrato por compatibilidade com o APK, mas o runtime remoto é deliberadamente **dual-source e adaptativo**, não um fan-out para várias fontes:

- **Biblioteca local**: dados embarcados no Proxy, sem rede.
- **Letras.mus.br**: fonte primária para pesquisas por título/artista; a URL exata é preservada e a letra é extraída pelo GLX somente quando o usuário abre o resultado.
- **Vagalume**: fonte primária para pesquisas por trecho via `search.excerpt`; para obtenção da letra, usa API `search.php` quando há `VAGALUME_API_KEY` e web/GLX como fallback.

Genius e API customizável foram removidos do caminho de execução e da configuração para reduzir latência, variabilidade, manutenção e risco de timeout. O segundo provedor ativo só é consultado quando necessário. O `/api/health` expõe `activeProviders`, `providerModes` e as capacidades do roteamento adaptativo sem revelar chaves.

## Vercel

O backend de produção é roteado por arquivos TypeScript dentro de `api/`. Não adicione `functions.server.ts` nem restaure `server.ts` na raiz. O dashboard está isolado em `web/`. Execute `npm run test:deploy` antes de publicar.


## Vercel Output Directory

Use `public`. The build creates `public/index.html` explicitly, while API routes continue through `api/index.js`.


## Correção 2.10.1 — cache resiliente

- buscas com `partial:true` nunca são gravadas no cache;
- buscas vazias (`count:0`) nunca são gravadas no cache;
- a chave de busca foi migrada para `search-v7-resilient`, invalidando entradas antigas;
- `partial:true + count:0` retorna `503 UPSTREAM_UNAVAILABLE` com `Retry-After: 2`;
- logs incluem `cacheStatus`, `providersUsed`, `providersSkipped`, `providerErrors` e `upstreamLatencyMs`;
- Vagalume é a rota primária estruturada; Letras fica como fallback de cobertura.
