import fs from 'node:fs';
import path from 'node:path';

const [inputArg, outputArg, tagArg = 'bibles-v1'] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Uso: node scripts/prepare-bible-release.mjs <pasta-sqlite> <pasta-saida> [tag]');
  process.exit(2);
}

const REPOSITORY = process.env.BIBLE_RELEASE_REPOSITORY || 'rafaelgabassi07-tech/PROXY-LETRAS';
const INPUT = path.resolve(inputArg);
const OUTPUT = path.resolve(outputArg);
const RELEASE_TAG = tagArg.trim();
const EXCLUDED_TRANSLATIONS = new Set(['ACF', 'MENS', 'NTLH']);

const DISPLAY_NAMES = {
  ALM1911: 'Almeida 1911',
  ARA: 'Almeida Revista e Atualizada',
  ARC: 'Almeida Revista e Corrigida',
  AS21: 'Almeida Século 21',
  BLIVRE: 'Bíblia Livre',
  JFAA: 'Almeida Atualizada',
  KJA: 'King James Atualizada',
  KJF: 'King James Fiel',
  NAA: 'Nova Almeida Atualizada',
  NBV: 'Nova Bíblia Viva',
  NVI: 'Nova Versão Internacional',
  NVT: 'Nova Versão Transformadora',
  OL: 'O Livro',
  TB: 'Tradução Brasileira',
  VFL: 'Versão Fácil de Ler'
};

fs.mkdirSync(OUTPUT, { recursive: true });

const translations = [];
const sqliteFiles = fs.readdirSync(INPUT)
  .filter((name) => name.toLowerCase().endsWith('.sqlite'))
  .sort((a, b) => a.localeCompare(b));

if (!sqliteFiles.length) {
  throw new Error(`Nenhum .sqlite encontrado em ${INPUT}`);
}

for (const fileName of sqliteFiles) {
  const id = path.basename(fileName, path.extname(fileName)).toUpperCase();
  if (EXCLUDED_TRANSLATIONS.has(id)) continue;

  const source = path.join(INPUT, fileName);
  const targetName = `${id}.sqlite`;
  const target = path.join(OUTPUT, targetName);
  fs.copyFileSync(source, target);

  translations.push({
    id,
    name: DISPLAY_NAMES[id] || id,
    version: 1,
    fileName: targetName,
    downloadUrl: `https://github.com/${REPOSITORY}/releases/download/${RELEASE_TAG}/${targetName}`,
    enabled: true
  });
}

const catalog = {
  schemaVersion: 1,
  catalogVersion: 1,
  releaseTag: RELEASE_TAG,
  nativeTranslation: 'ACF',
  translations
};

fs.writeFileSync(
  path.join(OUTPUT, 'catalog.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
  'utf8'
);

console.log(`Preparadas ${translations.length} traduções para ${RELEASE_TAG}.`);
console.log(`Arquivos em: ${OUTPUT}`);
