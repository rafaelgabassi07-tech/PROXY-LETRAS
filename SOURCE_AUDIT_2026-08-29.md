# Auditoria de fontes — 2026-08-29

## Biblioteca local

- Modo: pesquisa/retorno em memória (`gospelDatabase.ts`).
- Rede: não usa.
- Papel: fallback determinístico e fonte de baixa latência.

## Letras.mus.br

- Base: `https://www.letras.mus.br`.
- Descoberta: `/?q=...` como caminho canônico; `/buscar/?q=` e `/busca/?q=` permanecem fallbacks tolerantes.
- Parser de resultados: parse5 + htmlparser2 + JSON/hydration + fallback regex.
- Letra: URL exata escolhida -> fetch limitado -> GLX 3.1.

## Vagalume

- Web: `https://www.vagalume.com.br`.
- API: `https://api.vagalume.com.br`.
- Descoberta sem credencial: `search.excerpt?q=...` quando disponível; fallback para página do artista e busca web.
- API com chave: `search.php?art=...&mus=...&apikey=...` é preferida para letra quando `VAGALUME_API_KEY` existe.
- Letra sem chave: página `/artista/musica.html` -> GLX 3.1.

## Genius

- Web: `https://genius.com`.
- API: `https://api.genius.com`.
- Com token: `/search?q=...` com Bearer é o caminho preferido de descoberta.
- Sem token / falha da API: endpoint público de busca web e página HTML de busca.
- Letra: a API fornece metadados/URL; a página da música é extraída pelo GLX.
- Observação operacional: Genius pode aplicar captcha/403 a IPs de datacenter; o circuit breaker e os demais provedores evitam transformar isso em falha global.

## Custom API

- Não há uma fonte concreta até `CUSTOM_GOSPEL_API_URL` ser definida.
- O contrato é validado por Zod e a resposta é normalizada antes de chegar ao APK.

## Integração APK

- Produção: `https://proxy-letras.vercel.app`.
- Health primário: `/api/health`.
- Health compatível: `/api/proxy/health`.
- Pesquisa: `/api/proxy/lyrics/search`.
- Letra: `/api/proxy/lyrics/get`.

O health retorna `activeProviders` e `providerModes`; chaves/tokens não são retornados.

## Robustez adicional da auditoria

- Genius Web: a descoberta tenta primeiro JSON interno (`/api/search/multi` e `/api/search/song`) e só depois HTML, pois a página de busca pode ser client-side.
- Vagalume: `search.excerpt` é tratado como índice de descoberta, não como verdade da URL. A URL derivada é validada pelo GLX e, se falhar, o motor continua para a página do artista/pesquisa web em vez de derrubar o provider.
- Nenhum resultado remoto é considerado letra válida até `fetchScrapedSong` + GLX obter texto com qualidade suficiente.
