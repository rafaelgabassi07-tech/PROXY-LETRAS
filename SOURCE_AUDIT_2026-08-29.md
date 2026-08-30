# Auditoria de fontes — estado atual 2.11.1

## LRCLIB

- Base: `https://lrclib.net`.
- Papel: catálogo primário para busca por título, artista e álbum.
- Descoberta: `GET /api/search` com `q` ou parâmetros estruturados.
- Letra: `GET /api/get/{id}`.
- Credencial: não exige API key; o Proxy envia identificação de cliente.
- Benefício: evita depender de HTML/slug para resolver um título isolado.

## Vagalume

- API: `https://api.vagalume.com.br`.
- Web: `https://www.vagalume.com.br`.
- Papel: busca por trecho e cobertura complementar brasileira/gospel.
- Descoberta: `search.excerpt`; páginas de artista/web são redundância da mesma fonte.
- Letra: `search.php` por ID ou artista+título quando `VAGALUME_API_KEY` está configurada; web/GLX como fallback.

## Letras.mus.br

Removido do caminho de execução da 2.11.1. O deployment 2.10.2 registrou `HTTP_404` nas tentativas de descoberta, enquanto o Vagalume concluía vazio. Manter esse scraper como fonte de busca aumentava latência e gerava `partial:true` sem resolver título.

## Integração APK

- Pesquisa única: título, artista ou trecho.
- `multi-provider` é um nome de compatibilidade; runtime remoto tem duas fontes.
- respostas `partial + vazias` recebem uma repetição automática no APK e não são tratadas como “nenhum resultado” definitivo.
