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

Envie os arquivos `.sqlite` individualmente como assets da Release, por exemplo:

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

A ACF permanece nativa no APK.

MENS e NTLH continuam fora do catálogo atual por inconsistências de conteúdo identificadas anteriormente; isso é uma questão de qualidade dos bancos, não de segurança de download.

## Passo a passo no GitHub

1. Abra `rafaelgabassi07-tech/PROXY-LETRAS`.
2. Entre em **Releases**.
3. Clique em **Draft a new release**.
4. Crie a tag `bibles-v1` a partir de `main`.
5. Use o título `Bíblias SQLite v1`.
6. Arraste os arquivos `.sqlite` individualmente para os assets.
7. Clique em **Publish release**.
8. Teste no navegador, por exemplo:
   `https://github.com/rafaelgabassi07-tech/PROXY-LETRAS/releases/download/bibles-v1/NVI.sqlite`

## Catálogo usado pelo APK

```text
https://raw.githubusercontent.com/rafaelgabassi07-tech/PROXY-LETRAS/main/bibles/catalog.json
```

Cada item contém apenas o necessário:

```json
{
  "id": "NVI",
  "name": "Nova Versão Internacional",
  "version": 1,
  "fileName": "NVI.sqlite",
  "downloadUrl": "https://github.com/rafaelgabassi07-tech/PROXY-LETRAS/releases/download/bibles-v1/NVI.sqlite",
  "enabled": true
}
```

O APK não precisa conhecer cada URL em código. Ele lê `catalog.json`, mostra as traduções com `enabled: true` e usa `downloadUrl` quando o usuário toca em Baixar.

## Preparar uma nova Release

O script `scripts/prepare-bible-release.mjs` agora apenas copia os `.sqlite` e gera o catálogo. Não calcula hash e não comprime.

```bash
node scripts/prepare-bible-release.mjs ./biblias-sqlite ./dist/bibles-v1 bibles-v1
```

Para uma atualização futura, use uma nova tag, por exemplo `bibles-v2`, e atualize o `bibles/catalog.json` depois de publicar os novos assets.

## Implementação mínima no APK

Ao tocar em **Baixar**:

```text
downloadUrl
   ↓
baixa NVI.sqlite
   ↓
salva na pasta privada de Bíblias
   ↓
registra NVI como instalada
   ↓
abre normalmente pelo BibleRepository
```

Se a conexão falhar, o app mostra erro e permite tentar novamente. Não é necessário usar Vercel ou o Proxy de Letras nesse caminho.

## Licenças

A hospedagem ser sua não altera os direitos de redistribuição do texto bíblico. Publique apenas traduções que você possa legalmente redistribuir.
