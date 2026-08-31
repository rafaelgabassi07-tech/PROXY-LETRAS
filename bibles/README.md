# Distribuição das Bíblias pelo mesmo GitHub do Proxy

Este diretório contém apenas o catálogo/metadados usados pelo APK. Os bancos SQLite **não devem ser commitados no branch `main`** e não precisam passar pela Vercel.

## Arquitetura

```text
APK
 ├─ GET https://raw.githubusercontent.com/rafaelgabassi07-tech/PROXY-LETRAS/main/bibles/catalog.json
 └─ download direto dos assets da Release bibles-v1
      ├─ NVI.sqlite.gz
      ├─ NAA.sqlite.gz
      ├─ NVT.sqlite.gz
      └─ ...
```

O Proxy de Letras e a Vercel continuam independentes. O APK consulta o catálogo pelo GitHub e baixa cada Bíblia diretamente do GitHub Releases.

## Primeira Release

Tag: `bibles-v1`

Título sugerido: `Bíblias SQLite v1`

Os arquivos da primeira Release devem ser enviados como assets individuais, por exemplo:

- `ALM1911.sqlite.gz`
- `ARA.sqlite.gz`
- `ARC.sqlite.gz`
- `AS21.sqlite.gz`
- `BLIVRE.sqlite.gz`
- `JFAA.sqlite.gz`
- `KJA.sqlite.gz`
- `KJF.sqlite.gz`
- `NAA.sqlite.gz`
- `NBV.sqlite.gz`
- `NVI.sqlite.gz`
- `NVT.sqlite.gz`
- `OL.sqlite.gz`
- `TB.sqlite.gz`
- `VFL.sqlite.gz`

A ACF permanece nativa no APK e não precisa ser baixada.

`MENS.sqlite` e `NTLH.sqlite` devem ficar fora da primeira Release até revisão dos dados. A validação atual encontrou 13.055 versículos em MENS e 1.203 pares livro/capítulo em NTLH, enquanto o conjunto canônico esperado pelo APK usa 1.189 capítulos.

## Passo a passo no GitHub

1. Abra o repositório `rafaelgabassi07-tech/PROXY-LETRAS`.
2. Clique em **Releases**.
3. Clique em **Draft a new release**.
4. Em **Choose a tag**, crie `bibles-v1` a partir de `main`.
5. Use o título `Bíblias SQLite v1`.
6. Arraste os arquivos `*.sqlite.gz` preparados para a área de assets.
7. Publique a Release.
8. Teste pelo navegador pelo menos uma URL, por exemplo:
   `https://github.com/rafaelgabassi07-tech/PROXY-LETRAS/releases/download/bibles-v1/NVI.sqlite.gz`
9. Depois que os links estiverem funcionando, altere `published` de `false` para `true` em `bibles/catalog.json`.

## URL que o APK deve consultar

```text
https://raw.githubusercontent.com/rafaelgabassi07-tech/PROXY-LETRAS/main/bibles/catalog.json
```

O APK não precisa conhecer as URLs de cada tradução em código. Ele lê o catálogo e usa o campo `downloadUrl` da tradução escolhida.

## Preparar uma nova versão

O script `scripts/prepare-bible-release.mjs` recebe uma pasta contendo os `.sqlite`, valida a estrutura principal, compacta em GZIP, calcula SHA-256 e gera o catálogo/checksums.

Exemplo:

```bash
node scripts/prepare-bible-release.mjs ./biblias-sqlite ./dist/bibles-v1 bibles-v1
```

Para uma atualização futura, use outra tag, por exemplo `bibles-v2`, gere os assets novamente e então atualize `bibles/catalog.json`.

## Validação no APK

Antes de instalar um banco baixado, o APK deverá verificar:

1. download concluído para arquivo temporário;
2. SHA-256 do `.gz` igual ao campo `sha256` do catálogo;
3. descompactação para `.sqlite.tmp`;
4. SHA-256 do SQLite igual a `databaseSha256`;
5. `PRAGMA quick_check` igual a `ok`;
6. tabelas `metadata`, `book` e `verse` presentes;
7. somente depois, instalação/renomeação atômica do banco.

## Licenças

Validação técnica do SQLite não significa autorização de redistribuição. Antes de tornar `published: true` e disponibilizar cada tradução publicamente, confirme a licença/direito de distribuição do texto correspondente.
