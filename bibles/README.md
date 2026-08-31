# Distribuição das Bíblias pelo mesmo GitHub do Proxy

Os bancos bíblicos ficam nos **GitHub Releases** do mesmo repositório. Eles não passam pela Vercel e não devem ser commitados no branch `main`.

## Fluxo simplificado

```text
APK
 ├─ GET https://raw.githubusercontent.com/rafaelgabassi07-tech/PROXY-LETRAS/main/bibles/catalog.json
 └─ baixa diretamente o .sqlite escolhido no GitHub Release
      ↓
   salva no armazenamento privado do app
      ↓
   tradução instalada
```

Não há SHA-256, checksum, GZIP ou validação pesada no fluxo de instalação. O APK apenas precisa tratar normalmente falha de rede, cancelamento ou erro ao abrir o arquivo.

## Primeira Release

Tag: `bibles-v1`

Título sugerido: `Bíblias SQLite v1`

Envie os arquivos `.sqlite` individualmente como assets da Release:

- `ALM1911.sqlite`
- `ARA.sqlite`
- `ARC.sqlite`
- `AS21.sqlite`
- `BLIVRE.sqlite`
- `JFAA.sqlite`
- `KJA.sqlite`
- `KJF.sqlite`
- `NAA.sqlite`
- `NBV.sqlite`
- `NVI.sqlite`
- `NVT.sqlite`
- `OL.sqlite`
- `TB.sqlite`
- `VFL.sqlite`

A ACF permanece nativa no APK. MENS e NTLH continuam fora do catálogo atual por inconsistências de conteúdo identificadas anteriormente.

## Catálogo usado pelo APK

```text
https://raw.githubusercontent.com/rafaelgabassi07-tech/PROXY-LETRAS/main/bibles/catalog.json
```

O catálogo v2 mantém o download simples e acrescenta apenas metadados úteis para a interface:

```json
{
  "id": "NVI",
  "name": "Nova Versão Internacional",
  "version": 1,
  "fileName": "NVI.sqlite",
  "downloadUrl": "https://github.com/rafaelgabassi07-tech/PROXY-LETRAS/releases/download/bibles-v1/NVI.sqlite",
  "sizeBytes": 4534272,
  "verseCount": 31105,
  "enabled": true
}
```

`sizeBytes` permite ao APK mostrar o tamanho antes do download. `verseCount` é apenas informativo/diagnóstico e não bloqueia instalação.

## Observações de numeração

BLIVRE, OL e VFL seguem particularidades da edição de origem. BLIVRE agrupa Salmo 46:2–3 no registro 2. OL agrupa diversos versículos em um único registro. VFL não contém alguns números de versículos presentes em outras tradições textuais.

O carregador de traduções baixadas no APK deve, portanto, aceitar numeração não contínua e usar os números existentes no banco, em vez de exigir obrigatoriamente `1, 2, 3...` sem lacunas.

## Revisão técnica dos bancos

Antes da primeira Release, os bancos foram auditados. A NAA teve nove referências corrigidas (incluindo 2 Samuel 22:51 e transições de Salmo 110, Isaías 4/12 e Oseias 3). A NVT teve Salmo 119:130 corrigido. Espaços externos redundantes foram removidos sem alterar o texto interno, com destaque para BLIVRE e ALM1911.

Após a revisão, os 15 bancos possuem 66 livros, 1.189 capítulos, texto não vazio, zero referências duplicadas e `PRAGMA integrity_check = ok`.

## Preparar uma nova Release

O script `scripts/prepare-bible-release.mjs` copia os `.sqlite` e gera o catálogo v2 com tamanho e quantidade de versículos. Não calcula hash e não comprime.

```bash
node scripts/prepare-bible-release.mjs ./biblias-sqlite ./dist/bibles-v1 bibles-v1
```

Para uma atualização futura, use outra tag, como `bibles-v2`, e atualize `bibles/catalog.json` depois de publicar os novos assets.

## Licenças

A hospedagem ser sua não altera os direitos de redistribuição do texto bíblico. Publique apenas traduções que você possa legalmente redistribuir.
