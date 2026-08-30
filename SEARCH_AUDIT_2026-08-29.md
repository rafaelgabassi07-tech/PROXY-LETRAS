# Auditoria de busca — Proxy 2.9.0

## Causas encontradas

A busca por artista era naturalmente forte, enquanto título e sobretudo trecho sofriam por diferenças entre os provedores:

- o Vagalume possui índice textual (`search.excerpt`) e por isso descobria trechos com mais facilidade;
- o Letras.mus.br podia devolver links de músicas para uma frase, mas o card nem sempre contém o trecho; o filtro anterior descartava esses links antes de validar a letra;
- Genius fornece metadados ricos, highlights e imagens, mas pode sofrer bloqueio/anti-bot em datacenter e não deve ser ponto único de falha;
- resultados equivalentes de fontes distintas precisavam ser fundidos para preservar URL canônica, capa, álbum e trecho;
- o fallback Vagalume não pode inventar `/artista/titulo.html`: um slug plausível pode apontar para outra canção;
- variantes de busca executadas sequencialmente podiam somar vários timeouts.

## Motor 2.9.0

- classifica consulta curta/título versus provável trecho em modo híbrido;
- gera frase original, janelas contíguas e termos significativos;
- executa variantes do mesmo provedor concorrentemente;
- Letras mantém links de música sem match no card como `discoveryOnly` em buscas longas e só os libera após validar a letra completa;
- valida trecho por janelas de 1–4 linhas, cobertura de tokens, ordem, Dice e frase exata;
- candidatos de descoberta que não confirmam o trecho são removidos;
- resolve Vagalume pela página real do artista; não cria URL de música por slug;
- uma música identificada por um provedor é consultada nas outras fontes por título+artista para obter capa/álbum/URL e redundância;
- deduplicação em duas passagens funde metadados de músicas equivalentes;
- abertura da música valida título+artista antes de aceitar conteúdo vindo de outra URL;
- cache de pesquisa avançou para `search-v4`, evitando reutilização de ranking antigo após o deploy.

## Resultado esperado

Busca por artista permanece forte, busca por título passa a privilegiar correspondência exata/similaridade e busca por trecho só recebe bônus máximo quando a frase é confirmada na letra completa. O Vagalume deixa de dominar por score bruto e passa a atuar como uma das fontes de descoberta/fallback do ensemble.
