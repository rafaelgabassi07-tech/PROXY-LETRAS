import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const [inputArg, outputArg, tagArg = 'bibles-v1'] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Uso: node scripts/prepare-bible-release.mjs <pasta-sqlite> <pasta-saida> [tag]');
  process.exit(2);
}

const REPOSITORY = process.env.BIBLE_RELEASE_REPOSITORY || 'rafaelgabassi07-tech/PROXY-LETRAS';
const INPUT = path.resolve(inputArg);
const OUTPUT = path.resolve(outputArg);
const RELEASE_TAG = tagArg.trim();
const EXPECTED_BOOKS = 66;
const EXPECTED_CHAPTERS = 1189;
const MIN_VERSES = 30000;
const NATIVE_TRANSLATION = 'ACF';

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const scalar = (db, sql) => db.prepare(sql).get();

fs.mkdirSync(OUTPUT, { recursive: true });
for (const entry of fs.readdirSync(OUTPUT)) {
  if (entry.endsWith('.sqlite.gz') || ['catalog.json', 'SHA256SUMS.txt', 'QUARANTINE.json'].includes(entry)) {
    fs.rmSync(path.join(OUTPUT, entry), { force: true });
  }
}

const translations = [];
const quarantine = [];
const sqliteFiles = fs.readdirSync(INPUT)
  .filter((name) => name.toLowerCase().endsWith('.sqlite'))
  .sort((a, b) => a.localeCompare(b));

if (!sqliteFiles.length) {
  throw new Error(`Nenhum .sqlite encontrado em ${INPUT}`);
}

for (const fileName of sqliteFiles) {
  const id = path.basename(fileName, '.sqlite').toUpperCase();
  const fullPath = path.join(INPUT, fileName);
  const raw = fs.readFileSync(fullPath);
  const databaseSha256 = sha256(raw);

  const db = new DatabaseSync(fullPath, { readOnly: true });
  let name = id;
  let dbVersion = null;
  let quickCheck = 'unknown';
  let books = 0;
  let chapters = 0;
  let verses = 0;
  try {
    quickCheck = scalar(db, 'PRAGMA quick_check')['quick_check'];
    const metadata = db.prepare('SELECT key, value FROM metadata').all();
    const meta = Object.fromEntries(metadata.map((row) => [String(row.key), String(row.value)]));
    name = meta.name || id;
    dbVersion = meta.dbversion || null;
    books = Number(scalar(db, 'SELECT COUNT(*) AS count FROM book').count);
    chapters = Number(scalar(db, 'SELECT COUNT(*) AS count FROM (SELECT DISTINCT book_id, chapter FROM verse)').count);
    verses = Number(scalar(db, 'SELECT COUNT(*) AS count FROM verse').count);
  } finally {
    db.close();
  }

  const common = {
    id,
    name,
    databaseFile: `${id}.sqlite`,
    databaseSha256,
    dbVersion,
    books,
    chapters,
    verses,
    quickCheck,
  };

  if (id === NATIVE_TRANSLATION) {
    quarantine.push({ ...common, reason: 'native_in_apk' });
    continue;
  }

  const reasons = [];
  if (quickCheck !== 'ok') reasons.push('sqlite_quick_check_failed');
  if (books !== EXPECTED_BOOKS) reasons.push(`unexpected_book_count:${books}`);
  if (chapters !== EXPECTED_CHAPTERS) reasons.push(`unexpected_chapter_count:${chapters}`);
  if (verses < MIN_VERSES) reasons.push(`verse_count_below_${MIN_VERSES}:${verses}`);

  if (reasons.length) {
    quarantine.push({ ...common, reason: reasons.join(',') });
    continue;
  }

  const archiveFile = `${id}.sqlite.gz`;
  const gz = zlib.gzipSync(raw, { level: 9, mtime: 0 });
  fs.writeFileSync(path.join(OUTPUT, archiveFile), gz);

  translations.push({
    id,
    name,
    version: 1,
    databaseFile: `${id}.sqlite`,
    archiveFile,
    compression: 'gzip',
    downloadUrl: `https://github.com/${REPOSITORY}/releases/download/${RELEASE_TAG}/${archiveFile}`,
    compressedBytes: gz.length,
    uncompressedBytes: raw.length,
    sha256: sha256(gz),
    databaseSha256,
    books,
    chapters,
    verses,
    enabled: true,
  });
}

const catalog = {
  schemaVersion: 1,
  catalogVersion: 1,
  published: false,
  repository: REPOSITORY,
  releaseTag: RELEASE_TAG,
  catalogUrl: `https://raw.githubusercontent.com/${REPOSITORY}/main/bibles/catalog.json`,
  nativeTranslation: NATIVE_TRANSLATION,
  translations,
  quarantine,
};

fs.writeFileSync(path.join(OUTPUT, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(
  path.join(OUTPUT, 'QUARANTINE.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), items: quarantine }, null, 2)}\n`,
);
const checksums = translations
  .map((item) => `${item.sha256}  ${item.archiveFile}`)
  .join('\n');
fs.writeFileSync(path.join(OUTPUT, 'SHA256SUMS.txt'), `${checksums}\n`);

console.log(`Bíblias prontas: ${translations.length}`);
console.log(`Separadas para revisão/nativas: ${quarantine.length}`);
console.log(`Saída: ${OUTPUT}`);
for (const item of quarantine) console.log(`- ${item.id}: ${item.reason}`);
