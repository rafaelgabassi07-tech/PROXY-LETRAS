import { load } from 'cheerio';
import type { LyricsExtractionMethod } from './types.ts';
import { EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION, GLX_CAPABILITIES } from './meta.ts';

export { EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION } from './meta.ts';

const MAX_HTML_CHARS = 2_500_000;
const MAX_LYRICS_CHARS = 120_000;
const MAX_DOM_BLOCKS = 5000;
const MAX_CANDIDATES = 1800;

const SEMANTIC_SELECTORS = [
  '[data-lyrics-container="true"]',
  '[data-testid*="lyrics" i]',
  '[data-testid*="lyric" i]',
  '[itemprop="lyrics"]',
  '[itemprop="text"]',
  '[class*="lyrics" i]',
  '[class*="lyric" i]',
  '[id*="lyrics" i]',
  '[id*="lyric" i]',
  '.lyric-original',
  '.cnt-letra',
  '.lyrics-content',
  '.song-lyrics',
  '.lyric__content',
  '.songtext',
  '.song-text',
  '.letra',
  '.letra-original',
];

const GENERIC_BLOCK_SELECTORS = [
  'article',
  'main',
  'section',
  '[role="main"]',
  'pre',
  'blockquote',
  'div',
];

const NOISE_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe',
  'nav', 'footer', 'header', 'aside', 'form', 'button', 'input', 'select',
  '[hidden]', '[aria-hidden="true"]',
  '[style*="display:none" i]', '[style*="display: none" i]',
  '[style*="visibility:hidden" i]', '[style*="visibility: hidden" i]',
  '[class*="cookie" i]', '[id*="cookie" i]',
  '[class*="banner" i]', '[class*="advert" i]', '[id*="advert" i]',
  '[class*="social" i]', '[class*="share" i]', '[class*="comment" i]',
].join(',');

const BLOCK_BREAK_SELECTOR = 'br,p,li,div,section,article,blockquote,pre,h1,h2,h3,h4,h5,h6';

const LYRIC_KEY_RE = /(?:^|_)(?:lyrics?|lyric_text|song_text|songtext|letra|letras|verses?|content)(?:$|_)/i;
const STRONG_LYRIC_KEY_RE = /^(?:lyrics?|lyric_text|song_text|songtext|letra|letras|verses?)$/i;
const STRUCTURED_SCRIPT_RE = /application\/(?:ld\+json|json)|application\/json/i;

const NOISE_PATTERNS = [
  /pol[ií]tica de privacidade/i,
  /termos de uso/i,
  /aceitar cookies?/i,
  /gerenciar cookies?/i,
  /publicidade/i,
  /fa[cç]a login/i,
  /cadastre-se/i,
  /todos os direitos reservados/i,
  /compartilhe nas redes/i,
  /download (?:our|the) app/i,
];

const ANTI_BOT_PATTERNS = [
  /cf-chl-/i,
  /cloudflare.*(?:challenge|ray id)/i,
  /just a moment\.\.\./i,
  /verify you are human/i,
  /captcha/i,
  /access denied/i,
  /enable javascript and cookies/i,
];

export interface ExtractionQuality {
  score: number;
  confidence: number;
  charCount: number;
  wordCount: number;
  lineCount: number;
  distinctLineRatio: number;
  duplicateLineRatio: number;
  averageLineLength: number;
  linkDensity: number;
}

export interface ExtractionDiagnostics {
  engine: string;
  version: string;
  method: LyricsExtractionMethod;
  parser: string;
  candidateCount: number;
  quality: ExtractionQuality;
  signals: string[];
  warnings: string[];
}

export interface AdvancedLyricsExtractionResult {
  text: string;
  method: LyricsExtractionMethod;
  diagnostics: ExtractionDiagnostics;
}

interface CandidateInput {
  rawText: string;
  method: LyricsExtractionMethod;
  parser: string;
  source: string;
  linkTextLength?: number;
  structuralBonus?: number;
}

interface Candidate extends CandidateInput {
  text: string;
  score: number;
  quality: ExtractionQuality;
  signals: string[];
  warnings: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decodeNumericEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_all, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_all, code) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : '';
    });
}

export function normalizeLyricsText(value: string): string {
  return decodeNumericEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function candidateFingerprint(text: string): string {
  const sample = text
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 5000);
  let hash = 2166136261;
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${sample.length}:${(hash >>> 0).toString(36)}`;
}

function lineMetrics(text: string) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const normalizedLines = lines.map(line => line.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' '));
  const distinct = new Set(normalizedLines);
  const distinctLineRatio = lines.length ? distinct.size / lines.length : 0;
  const duplicateLineRatio = lines.length ? 1 - distinctLineRatio : 0;
  const averageLineLength = lines.length ? lines.reduce((sum, line) => sum + line.length, 0) / lines.length : 0;
  return { lines, words, distinctLineRatio, duplicateLineRatio, averageLineLength };
}

function lyricSignals(text: string): { score: number; signals: string[]; warnings: string[] } {
  const signals: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const lower = text.toLocaleLowerCase('pt-BR');

  const markerMatches = lower.match(/(?:^|\n)\s*\[?\s*(?:verso|verse|refr[aã]o|coro|chorus|ponte|bridge|intro|outro|final|pré-refr[aã]o|pre-chorus)\b/gim)?.length || 0;
  if (markerMatches) {
    score += Math.min(28, markerMatches * 7);
    signals.push('section-markers');
  }

  const shortLineRatio = (() => {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) return 0;
    return lines.filter(line => line.length >= 3 && line.length <= 90).length / lines.length;
  })();
  if (shortLineRatio >= 0.72) {
    score += 18;
    signals.push('lyric-line-shape');
  } else if (shortLineRatio >= 0.5) {
    score += 8;
  }

  if (/\b(?:senhor|jesus|deus|esp[ií]rito|louvor|adora|gra[cç]a|santo|aleluia|gl[oó]ria)\b/i.test(lower)) {
    score += 8;
    signals.push('gospel-vocabulary');
  }

  let noiseHits = 0;
  for (const pattern of NOISE_PATTERNS) if (pattern.test(text)) noiseHits += 1;
  if (noiseHits) {
    score -= noiseHits * 18;
    warnings.push('page-noise-detected');
  }

  const htmlish = (text.match(/https?:\/\//g)?.length || 0) + (text.match(/\b(?:menu|login|home|newsletter|copyright)\b/gi)?.length || 0);
  if (htmlish >= 4) {
    score -= Math.min(36, htmlish * 4);
    warnings.push('navigation-like-text');
  }

  return { score, signals, warnings };
}

function qualityFor(text: string, linkTextLength = 0): ExtractionQuality {
  const { lines, words, distinctLineRatio, duplicateLineRatio, averageLineLength } = lineMetrics(text);
  const linkDensity = clamp(linkTextLength / Math.max(1, text.length), 0, 1);
  let score = 0;

  score += Math.min(38, text.length / 180);
  score += Math.min(24, lines.length * 1.15);
  score += Math.min(16, words.length / 35);
  score += distinctLineRatio * 9;
  if (averageLineLength >= 8 && averageLineLength <= 90) score += 8;
  // Repetição é estrutural em letras (refrões/tags). Penalizamos somente
  // repetição extrema com pouca diversidade, em vez de aplicar heurística de artigo.
  const distinctLineCount = Math.round(distinctLineRatio * lines.length);
  if (duplicateLineRatio > 0.82 && distinctLineCount <= 4 && lines.length >= 12) score -= 18;
  else if (duplicateLineRatio > 0.7 && distinctLineCount <= 7 && lines.length >= 16) score -= 7;
  score -= linkDensity * 70;

  const signal = lyricSignals(text);
  score += signal.score;
  score = clamp(score, 0, 100);

  // Conversão deliberadamente conservadora: confiança alta só quando há massa textual
  // suficiente e a forma das linhas parece realmente uma letra.
  const confidence = clamp(
    0.08 + (score / 100) * 0.78 + Math.min(0.12, lines.length / 250),
    0,
    0.99,
  );

  return {
    score: Number(score.toFixed(2)),
    confidence: Number(confidence.toFixed(3)),
    charCount: text.length,
    wordCount: words.length,
    lineCount: lines.length,
    distinctLineRatio: Number(distinctLineRatio.toFixed(3)),
    duplicateLineRatio: Number(duplicateLineRatio.toFixed(3)),
    averageLineLength: Number(averageLineLength.toFixed(2)),
    linkDensity: Number(linkDensity.toFixed(3)),
  };
}

function methodBonus(method: LyricsExtractionMethod): number {
  switch (method) {
    case 'dom-semantic': return 22;
    case 'microdata': return 20;
    case 'hydration-state': return 18;
    case 'json-ld': return 16;
    case 'json-embedded': return 14;
    case 'dom-density': return 10;
    case 'dom-readability': return 16;
    case 'dom-cluster': return 15;
    case 'baseline-rescue': return 1;
    case 'cheerio-dom': return 9; // compatibilidade histórica
    case 'heuristic-regex': return 2;
    case 'api': return 24;
    case 'database': return 24;
    default: return 0;
  }
}

function createCandidate(input: CandidateInput): Candidate | null {
  const text = normalizeLyricsText(input.rawText).slice(0, MAX_LYRICS_CHARS);
  const metrics = lineMetrics(text);
  if (text.length < 45 || metrics.words.length < 10 || metrics.lines.length < 2) return null;

  const quality = qualityFor(text, input.linkTextLength || 0);
  const signals = lyricSignals(text);
  let score = quality.score + methodBonus(input.method) + (input.structuralBonus || 0);
  if (text.length >= 250 && text.length <= 20_000) score += 6;
  if (metrics.lines.length >= 8 && metrics.lines.length <= 180) score += 8;
  if (quality.linkDensity > 0.28) score -= 18;
  score = clamp(score, 0, 140);

  return {
    ...input,
    text,
    score,
    quality,
    signals: signals.signals,
    warnings: signals.warnings,
  };
}

function elementText($: any, element: any): { text: string; linkTextLength: number } {
  const clone = $(element).clone();
  clone.find(NOISE_SELECTOR).remove();
  clone.find('br').replaceWith('\n');
  clone.find(BLOCK_BREAK_SELECTOR).each((_index: number, node: any) => {
    if (node.type === 'tag' && node.name !== 'br') $(node).append('\n');
  });
  const linkTextLength = clone.find('a').toArray().reduce((sum: number, node: any) => sum + normalizeLyricsText($(node).text()).length, 0);
  return { text: normalizeLyricsText(clone.text()), linkTextLength };
}

function collectDomCandidates(html: string, parser: 'parse5' | 'htmlparser2', add: (input: CandidateInput) => void): void {
  const $ = parser === 'parse5'
    ? load(html, { scriptingEnabled: false })
    : load(html, { xml: { xmlMode: false, decodeEntities: true } });

  for (const selector of SEMANTIC_SELECTORS) {
    $(selector).slice(0, 20).each((_index: number, element: any) => {
      const extracted = elementText($, element);
      add({
        rawText: extracted.text,
        method: selector.includes('itemprop') ? 'microdata' : 'dom-semantic',
        parser,
        source: `selector:${selector}`,
        linkTextLength: extracted.linkTextLength,
        structuralBonus: 12,
      });
    });
  }

  let inspected = 0;
  let densityAdded = 0;
  $(GENERIC_BLOCK_SELECTORS.join(',')).each((_index: number, element: any) => {
    if (inspected >= MAX_DOM_BLOCKS || densityAdded >= 180) return false;
    inspected += 1;
    const extracted = elementText($, element);
    const text = extracted.text;
    if (text.length < 100 || text.length > MAX_LYRICS_CHARS) return undefined;
    const lineCount = text.split('\n').map(line => line.trim()).filter(Boolean).length;
    const linkDensity = extracted.linkTextLength / Math.max(1, text.length);
    if (lineCount < 3 || linkDensity > 0.42) return undefined;

    const childBlocks = $(element).children('div,section,article,p,pre,blockquote').length;
    const structuralBonus = childBlocks <= 12 ? 4 : -Math.min(16, childBlocks / 3);
    add({
      rawText: text,
      method: 'dom-density',
      parser,
      source: `density:${String((element as any).name || 'node')}`,
      linkTextLength: extracted.linkTextLength,
      structuralBonus,
    });
    densityAdded += 1;
    return undefined;
  });
}


function parserDom(html: string, parser: 'parse5' | 'htmlparser2') {
  return parser === 'parse5'
    ? load(html, { scriptingEnabled: false })
    : load(html, { xml: { xmlMode: false, decodeEntities: true } });
}

function punctuationWeight(text: string): number {
  const commas = text.match(/[,;:]/g)?.length || 0;
  const sentenceStops = text.match(/[.!?](?:\s|$)/g)?.length || 0;
  return Math.min(8, commas * 0.65 + sentenceStops * 0.35);
}

function blockLyricScore(text: string, linkDensity: number): number {
  const metrics = lineMetrics(text);
  if (metrics.words.length < 4 || text.length < 20) return -20;
  const shortLineRatio = metrics.lines.length
    ? metrics.lines.filter(line => line.length >= 2 && line.length <= 92).length / metrics.lines.length
    : 0;
  const markerCount = text.match(/(?:^|\n)\s*\[?\s*(?:verso|verse|refr[aã]o|coro|chorus|ponte|bridge|intro|outro|final|tag)\b/gim)?.length || 0;
  const noiseCount = NOISE_PATTERNS.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
  let score = 1;
  score += Math.min(4, text.length / 180);
  score += Math.min(6, metrics.lines.length * 0.55);
  score += punctuationWeight(text);
  score += shortLineRatio * 10;
  score += Math.min(12, markerCount * 4);
  score -= linkDensity * 32;
  score -= noiseCount * 12;
  if (metrics.averageLineLength > 150) score -= 7;
  return score;
}

/**
 * Passagem inspirada nos princípios de Readability: pontua blocos textuais,
 * propaga peso para pai/avô, reduz por densidade de links e agrega irmãos do
 * bloco vencedor. A função é especializada para letras: linhas curtas e
 * marcadores de refrão/verso valem mais que pontuação de prosa.
 */
function collectReadabilityCandidates(
  html: string,
  parser: 'parse5' | 'htmlparser2',
  add: (input: CandidateInput) => void,
): void {
  const $ = parserDom(html, parser);
  const nodeScores = new Map<any, number>();
  const addScore = (node: any, amount: number) => {
    if (!node || node.type !== 'tag' || !Number.isFinite(amount)) return;
    nodeScores.set(node, (nodeScores.get(node) || 0) + amount);
  };

  let inspected = 0;
  $('p,pre,blockquote,li,div').each((_index: number, element: any) => {
    if (inspected >= MAX_DOM_BLOCKS) return false;
    inspected += 1;
    const extracted = elementText($, element);
    const text = extracted.text;
    if (text.length < 20 || text.length > 6000) return undefined;
    const linkDensity = extracted.linkTextLength / Math.max(1, text.length);
    if (linkDensity > 0.58) return undefined;
    const ownScore = blockLyricScore(text, linkDensity);
    if (ownScore <= 0) return undefined;

    const parent = element.parent;
    const grandParent = parent?.parent;
    addScore(element, ownScore * 0.2);
    addScore(parent, ownScore);
    addScore(grandParent, ownScore * 0.48);
    return undefined;
  });

  const ranked = [...nodeScores.entries()]
    .filter(([node]) => node?.type === 'tag')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 28);

  for (const [topNode, topScore] of ranked) {
    const topExtracted = elementText($, topNode);
    if (topExtracted.text.length >= 60) {
      add({
        rawText: topExtracted.text,
        method: 'dom-readability',
        parser,
        source: `readability:winner:${String(topNode.name || 'node')}`,
        linkTextLength: topExtracted.linkTextLength,
        structuralBonus: Math.min(14, topScore / 5),
      });
    }

    const parent = topNode.parent;
    if (!parent || parent.type !== 'tag') continue;
    const siblings = $(parent).children().toArray();
    if (siblings.length < 2 || siblings.length > 120) continue;
    const threshold = Math.max(8, topScore * 0.2);
    const selected: string[] = [];
    let selectedLinkText = 0;
    let selectedChars = 0;

    for (const sibling of siblings) {
      const extracted = elementText($, sibling);
      const text = extracted.text;
      if (!text || text.length > 12_000) continue;
      const linkDensity = extracted.linkTextLength / Math.max(1, text.length);
      const siblingScore = nodeScores.get(sibling) || 0;
      const looksLikeShortLyricBlock = text.length >= 12
        && text.length <= 900
        && linkDensity <= 0.12
        && blockLyricScore(text, linkDensity) >= 5;
      if (sibling === topNode || siblingScore >= threshold || looksLikeShortLyricBlock) {
        selected.push(text);
        selectedLinkText += extracted.linkTextLength;
        selectedChars += text.length;
      }
    }

    if (selected.length >= 2 && selectedChars >= 70) {
      add({
        rawText: selected.join('\n'),
        method: 'dom-readability',
        parser,
        source: 'readability:sibling-assembly',
        linkTextLength: selectedLinkText,
        structuralBonus: 13,
      });
    }
  }
}

interface ClusterBlock {
  text: string;
  linkTextLength: number;
  score: number;
  strong: boolean;
  weak: boolean;
}

/**
 * Classificador de blocos inspirado em jusText/boilerplate removers. Em vez de
 * stopwords rígidas por idioma, usa densidade de links, forma de linha,
 * comprimento e ruído; assim funciona para letras PT/EN/ES sem dicionário.
 * Blocos curtos "quase conteúdo" são recuperados quando ficam entre blocos
 * fortes, equivalente à revisão contextual desses extratores.
 */
function collectBlockClusterCandidates(
  html: string,
  parser: 'parse5' | 'htmlparser2',
  add: (input: CandidateInput) => void,
): void {
  const $ = parserDom(html, parser);
  let containers = 0;
  let clusterAdded = 0;
  $('main,article,section,[role="main"],body,div').each((_index: number, container: any) => {
    if (containers >= 900 || clusterAdded >= 180) return false;
    containers += 1;
    const children = $(container).children('p,div,li,pre,blockquote,section').slice(0, 160).toArray();
    if (children.length < 2) return undefined;

    const blocks: ClusterBlock[] = children.map((element: any) => {
      const extracted = elementText($, element);
      const text = extracted.text;
      const linkDensity = extracted.linkTextLength / Math.max(1, text.length);
      const score = blockLyricScore(text, linkDensity);
      const explicitNoise = NOISE_PATTERNS.some(pattern => pattern.test(text));
      const strong = !explicitNoise && text.length >= 22 && text.length <= 2600 && linkDensity <= 0.2 && score >= 6;
      const weak = !explicitNoise && text.length >= 5 && text.length <= 800 && linkDensity <= 0.08 && score >= 1.5;
      return { text, linkTextLength: extracted.linkTextLength, score, strong, weak };
    });

    const runs: ClusterBlock[][] = [];
    let run: ClusterBlock[] = [];
    const flush = () => {
      if (run.filter(block => block.strong).length >= 2) runs.push(run);
      run = [];
    };

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const previousStrong = index > 0 && blocks[index - 1].strong;
      const nextStrong = index + 1 < blocks.length && blocks[index + 1].strong;
      if (block.strong || (block.weak && (previousStrong || nextStrong))) {
        run.push(block);
      } else {
        flush();
      }
    }
    flush();

    for (const group of runs.slice(0, 12)) {
      const text = group.map(block => block.text).filter(Boolean).join('\n');
      if (text.length < 70) continue;
      const linkTextLength = group.reduce((sum, block) => sum + block.linkTextLength, 0);
      const meanScore = group.reduce((sum, block) => sum + block.score, 0) / Math.max(1, group.length);
      add({
        rawText: text,
        method: 'dom-cluster',
        parser,
        source: 'block-cluster:context-revision',
        linkTextLength,
        structuralBonus: Math.min(13, meanScore / 2),
      });
      clusterAdded += 1;
      if (clusterAdded >= 180) break;
    }
    return undefined;
  });
}

/**
 * Último estágio de recall, equivalente ao "baseline rescue" de extratores
 * robustos. Só deve ser chamado quando os estágios de maior precisão não
 * produziram candidato suficientemente confiável.
 */
function collectBaselineRescue(html: string, add: (input: CandidateInput) => void): void {
  let $: ReturnType<typeof load>;
  try { $ = load(html, { scriptingEnabled: false }); } catch { return; }
  for (const selector of ['main', 'article', '[role="main"]', 'body']) {
    $(selector).slice(0, 4).each((_index: number, element: any) => {
      const clone = $(element).clone();
      clone.find(NOISE_SELECTOR).remove();
      const chunks: string[] = [];
      let linkTextLength = 0;
      clone.find('p,pre,blockquote,li,div').slice(0, 900).each((_i: number, node: any) => {
        const text = normalizeLyricsText($(node).text());
        if (text.length < 8 || text.length > 2500) return undefined;
        const links = $(node).find('a').toArray().reduce((sum: number, link: any) => sum + normalizeLyricsText($(link).text()).length, 0);
        const density = links / Math.max(1, text.length);
        if (density > 0.24 || NOISE_PATTERNS.some(pattern => pattern.test(text))) return undefined;
        chunks.push(text);
        linkTextLength += links;
        return chunks.length >= 500 ? false : undefined;
      });
      const deduped: string[] = [];
      let previous = '';
      for (const chunk of chunks) {
        const normalized = chunk.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized === previous) continue;
        deduped.push(chunk);
        previous = normalized;
      }
      const text = deduped.join('\n');
      if (text.length >= 70) {
        add({
          rawText: text,
          method: 'baseline-rescue',
          parser: 'parse5',
          source: `baseline:${selector}`,
          linkTextLength,
          structuralBonus: -10,
        });
      }
    });
  }
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function looksLikeLyricsValue(value: string): boolean {
  const normalized = normalizeLyricsText(value);
  if (normalized.length < 45 || normalized.length > MAX_LYRICS_CHARS) return false;
  const metrics = lineMetrics(normalized);
  return metrics.lines.length >= 2 && metrics.words.length >= 10;
}

function visitStructuredNode(
  node: unknown,
  add: (input: CandidateInput) => void,
  method: LyricsExtractionMethod,
  parser: string,
  path = '$',
  depth = 0,
  seen = new Set<object>(),
): void {
  if (depth > 18 || node == null) return;
  if (typeof node === 'string') {
    if (looksLikeLyricsValue(node) && /(?:lyrics?|lyric|song.?text|letra|verse|content|text|description)/i.test(path)) {
      add({ rawText: node, method, parser, source: `structured:${path}`, structuralBonus: /lyrics?|letra/i.test(path) ? 12 : 0 });
    }
    return;
  }
  if (Array.isArray(node)) {
    if (node.length <= 500 && node.every(item => typeof item === 'string')) {
      const joined = node.join('\n');
      if (looksLikeLyricsValue(joined) && /lyrics?|lyric|verse|letra|text/i.test(path)) {
        add({ rawText: joined, method, parser, source: `structured-array:${path}`, structuralBonus: 8 });
      }
    }
    node.slice(0, 600).forEach((value, index) => visitStructuredNode(value, add, method, parser, `${path}[${index}]`, depth + 1, seen));
    return;
  }
  if (typeof node !== 'object') return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record).slice(0, 1200)) {
    const nextPath = `${path}.${key}`;
    if (typeof value === 'string' && LYRIC_KEY_RE.test(key) && looksLikeLyricsValue(value)) {
      add({
        rawText: value,
        method,
        parser,
        source: `structured-key:${nextPath}`,
        structuralBonus: STRONG_LYRIC_KEY_RE.test(key) ? 18 : 8,
      });
    }
    visitStructuredNode(value, add, method, parser, nextPath, depth + 1, seen);
  }
}

function collectStructuredCandidates(html: string, add: (input: CandidateInput) => void): void {
  let $: ReturnType<typeof load>;
  try {
    $ = load(html, { scriptingEnabled: false });
  } catch {
    return;
  }

  $('script').slice(0, 120).each((_index: number, element: any) => {
    const type = ($(element).attr('type') || '').trim();
    const id = ($(element).attr('id') || '').trim();
    const raw = $(element).text().trim();
    if (!raw || raw.length > 1_500_000) return;

    const isLdJson = /ld\+json/i.test(type);
    const isHydration = /__NEXT_DATA__|__NUXT_DATA__|__APOLLO_STATE__|__INITIAL_STATE__|hydration/i.test(id) || STRUCTURED_SCRIPT_RE.test(type);
    if (!isLdJson && !isHydration && !/^\s*[\[{]/.test(raw)) return;

    const parsed = safeJsonParse(raw);
    if (parsed != null) {
      visitStructuredNode(parsed, add, isLdJson ? 'json-ld' : 'hydration-state', isLdJson ? 'json-ld' : `script:${id || type || 'json'}`);
    }
  });

  // Frameworks frequentemente serializam estado em JS em vez de JSON puro.
  // Capturamos campos textuais fortemente identificados, sem executar scripts.
  const scanQuotedProperties = (source: string, parser: string, maxMatches = 40) => {
    const quotedPatterns = [
      /["'](?:lyrics?|lyricText|songText|letra|letras)["']\s*:\s*"((?:\\.|[^"\\]){40,})"/gi,
      /["'](?:lyrics?|lyricText|songText|letra|letras)["']\s*:\s*'((?:\\.|[^'\\]){40,})'/gi,
    ];
    let total = 0;
    for (const pattern of quotedPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null && total < maxMatches) {
        const decoded = decodeEmbeddedString(match[1]);
        add({ rawText: decoded, method: 'json-embedded', parser, source: 'embedded-property', structuralBonus: 12 });
        total += 1;
      }
    }
  };
  scanQuotedProperties(html, 'script-scan');

  // Next.js App Router/React Server Components envia dados em Flight chunks
  // (`self.__next_f.push`). Decodificamos somente literais de string e voltamos
  // a procurar propriedades de letra; nada é avaliado/executado.
  $('script').slice(0, 160).each((_index: number, element: any) => {
    const raw = $(element).text();
    if (!raw || raw.length > 1_500_000 || !/__next_f|react\.server|flight/i.test(raw)) return undefined;
    const stringLiteral = /"((?:\\.|[^"\\]){40,})"/g;
    let match: RegExpExecArray | null;
    let chunks = 0;
    while ((match = stringLiteral.exec(raw)) !== null && chunks < 120) {
      const decoded = decodeEmbeddedString(match[1]);
      if (/lyrics?|lyricText|songText|letra|vers[eo]/i.test(decoded)) {
        scanQuotedProperties(decoded, 'react-flight', 20);
        if (looksLikeLyricsValue(decoded) && /lyrics?|letra|song.?text/i.test(decoded)) {
          add({ rawText: decoded, method: 'json-embedded', parser: 'react-flight', source: 'react-flight-chunk', structuralBonus: 5 });
        }
      }
      chunks += 1;
    }
    return undefined;
  });

  // Conteúdo alternativo de páginas JS-heavy pode estar em noscript/template.
  // É analisado como recuperação estruturada, mas recebe bônus menor para evitar
  // que placeholders vençam uma letra encontrada diretamente no DOM.
  $('noscript,template').slice(0, 60).each((_index: number, element: any) => {
    const fragment = $(element).html() || $(element).text() || '';
    if (!fragment || fragment.length > 500_000) return undefined;
    const text = htmlFragmentToText(fragment);
    if (looksLikeLyricsValue(text)) {
      add({ rawText: text, method: 'json-embedded', parser: String((element as any).name || 'template'), source: 'alternate-markup', structuralBonus: 3 });
    }
    return undefined;
  });
}

function decodeEmbeddedString(raw: string): string {
  const wrapped = `"${raw.replace(/"/g, '\\"')}"`;
  try {
    return JSON.parse(wrapped);
  } catch {
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, '\t')
      .replace(/\\u([0-9a-f]{4})/gi, (_all, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\\//g, '/');
  }
}

function htmlFragmentToText(fragment: string): string {
  try {
    const $ = load(fragment, { scriptingEnabled: false }, false);
    $('script,style,noscript,template').remove();
    $('br').replaceWith('\n');
    $(BLOCK_BREAK_SELECTOR).each((_index: number, node: any) => {
      if ((node as any).name !== 'br') $(node).append('\n');
    });
    return normalizeLyricsText($.root().text());
  } catch {
    return normalizeLyricsText(
      fragment
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|li|section|article|pre|blockquote)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    );
  }
}

function collectHeuristicCandidates(html: string, add: (input: CandidateInput) => void): void {
  const patterns = [
    /<([a-z0-9]+)[^>]*data-lyrics-container=["']true["'][^>]*>([\s\S]*?)<\/\1>/gi,
    /<([a-z0-9]+)[^>]*data-testid=["'][^"']*(?:lyrics?|letra)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
    /<([a-z0-9]+)[^>]*(?:class|id)=["'][^"']*(?:lyrics?|lyric-original|cnt-letra|songtext|letra-original)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    let count = 0;
    while ((match = pattern.exec(html)) !== null && count < 30) {
      add({ rawText: htmlFragmentToText(match[2] || ''), method: 'heuristic-regex', parser: 'regex', source: 'legacy-container', structuralBonus: 4 });
      count += 1;
    }
  }
}

function detectAntiBot(html: string): boolean {
  const sample = html.slice(0, 180_000);
  return ANTI_BOT_PATTERNS.some(pattern => pattern.test(sample));
}

function canonicalLineSet(text: string): Set<string> {
  const lines = text
    .split('\n')
    .map(line => line.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .map(line => line.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 4 && !/^(?:verso|verse|refrao|coro|chorus|ponte|bridge|intro|outro|final|tag)\s*\d*$/.test(line));
  return new Set(lines.slice(0, 260));
}

function candidateSimilarity(a: Candidate, b: Candidate): number {
  const lengthRatio = Math.min(a.text.length, b.text.length) / Math.max(1, Math.max(a.text.length, b.text.length));
  if (lengthRatio < 0.55) return 0;
  const left = canonicalLineSet(a.text);
  const right = canonicalLineSet(b.text);
  if (left.size < 2 || right.size < 2) return 0;
  let intersection = 0;
  for (const line of left) if (right.has(line)) intersection += 1;
  const containment = intersection / Math.max(1, Math.min(left.size, right.size));
  return containment * 0.82 + lengthRatio * 0.18;
}

function addConsensus(winner: Candidate, challenger: Candidate): void {
  const parserConsensus = challenger.parser !== winner.parser;
  const extractorConsensus = challenger.method !== winner.method || challenger.source !== winner.source;
  if (parserConsensus && !winner.signals.includes('multi-parser-consensus')) {
    winner.signals.push('multi-parser-consensus');
    winner.score = clamp(winner.score + 7, 0, 140);
  }
  if (extractorConsensus && !winner.signals.includes('cross-extractor-consensus')) {
    winner.signals.push('cross-extractor-consensus');
    winner.score = clamp(winner.score + 6, 0, 140);
  }
}

function mergeNearDuplicateCandidates(candidates: Candidate[]): Candidate[] {
  // 1) Deduplicação rápida por fingerprint.
  const exact = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const fingerprint = candidateFingerprint(candidate.text);
    const current = exact.get(fingerprint);
    if (!current) {
      exact.set(fingerprint, candidate);
      continue;
    }
    const winner = candidate.score > current.score ? candidate : current;
    const challenger = winner === candidate ? current : candidate;
    addConsensus(winner, challenger);
    exact.set(fingerprint, winner);
  }

  // 2) Ensemble por quase-duplicata. Extratores diferentes frequentemente
  // devolvem a mesma letra com um cabeçalho/rodapé extra; a concordância entre
  // eles aumenta confiança e evita que o ruído vire um candidato separado.
  const ranked = [...exact.values()].sort((a, b) => b.score - a.score);
  const merged: Candidate[] = [];
  for (const candidate of ranked) {
    let match: Candidate | undefined;
    // Limite deliberado para manter custo quadrático controlado em páginas enormes.
    for (const current of merged.slice(0, 260)) {
      if (candidateSimilarity(candidate, current) >= 0.86) {
        match = current;
        break;
      }
    }
    if (!match) {
      merged.push(candidate);
      continue;
    }
    if (candidate.score > match.score) {
      addConsensus(candidate, match);
      const index = merged.indexOf(match);
      merged[index] = candidate;
    } else {
      addConsensus(match, candidate);
    }
  }
  return merged;
}

function finalConfidence(candidate: Candidate): number {
  let confidence = candidate.quality.confidence;
  if (candidate.signals.includes('multi-parser-consensus')) confidence += 0.05;
  if (candidate.signals.includes('cross-extractor-consensus')) confidence += 0.04;
  if (candidate.method === 'dom-semantic' || candidate.method === 'microdata') confidence += 0.05;
  if (candidate.method === 'hydration-state' || candidate.method === 'json-ld') confidence += 0.03;
  if (candidate.warnings.length) confidence -= Math.min(0.16, candidate.warnings.length * 0.05);
  return Number(clamp(confidence, 0, 0.995).toFixed(3));
}

export function extractLyricsAdvanced(rawHtml: string): AdvancedLyricsExtractionResult | null {
  const html = rawHtml.slice(0, MAX_HTML_CHARS);
  const candidates: Candidate[] = [];
  const add = (input: CandidateInput) => {
    if (candidates.length >= MAX_CANDIDATES) return;
    const candidate = createCandidate(input);
    if (candidate) candidates.push(candidate);
  };

  let parse5Failed = false;
  let htmlparser2Failed = false;
  let recallEscalated = false;

  // Estágio A: fontes explicitamente estruturadas têm máxima precisão.
  collectStructuredCandidates(html, add);

  // Estágio B: ensemble DOM. Cada parser enxerga a mesma página com uma árvore
  // independente, e cada árvore passa por seletores, densidade, Readability-like
  // scoring e classificação contextual de blocos.
  try {
    collectDomCandidates(html, 'parse5', add);
    collectReadabilityCandidates(html, 'parse5', add);
    collectBlockClusterCandidates(html, 'parse5', add);
  } catch { parse5Failed = true; }
  try {
    collectDomCandidates(html, 'htmlparser2', add);
    collectReadabilityCandidates(html, 'htmlparser2', add);
    collectBlockClusterCandidates(html, 'htmlparser2', add);
  } catch { htmlparser2Failed = true; }

  // Estágio C: recuperação sintática tolerante, sem executar scripts.
  collectHeuristicCandidates(html, add);

  // Estágio D: se a primeira cascata não alcançou qualidade suficiente, aumenta
  // recall sobre a árvore original. Isso preserva precisão no caminho normal.
  const preliminary = mergeNearDuplicateCandidates(candidates)
    .sort((a, b) => b.score - a.score || b.quality.lineCount - a.quality.lineCount);
  if (!preliminary[0] || preliminary[0].quality.score < 56 || preliminary[0].quality.confidence < 0.58) {
    recallEscalated = true;
    collectBaselineRescue(html, add);
  }

  const merged = mergeNearDuplicateCandidates(candidates)
    .sort((a, b) => b.score - a.score || b.quality.lineCount - a.quality.lineCount);
  const best = merged[0];
  if (!best) return null;

  const warnings = [...new Set([
    ...best.warnings,
    ...(parse5Failed ? ['parse5-failed'] : []),
    ...(htmlparser2Failed ? ['htmlparser2-failed'] : []),
    ...(detectAntiBot(html) ? ['anti-bot-page-detected'] : []),
    ...(best.quality.score < 42 ? ['low-content-quality'] : []),
  ])];

  // Evita devolver páginas de bloqueio/consentimento como se fossem letras.
  if (warnings.includes('anti-bot-page-detected') && best.quality.score < 72) return null;
  if (best.quality.score < 30 || best.quality.lineCount < 2) return null;

  const quality = { ...best.quality, confidence: finalConfidence(best) };
  return {
    text: best.text.slice(0, MAX_LYRICS_CHARS).trim(),
    method: best.method,
    diagnostics: {
      engine: EXTRACTION_ENGINE_NAME,
      version: EXTRACTION_ENGINE_VERSION,
      method: best.method,
      parser: best.parser,
      candidateCount: merged.length,
      quality,
      signals: [...new Set([
        ...best.signals,
        best.source,
        ...(recallEscalated ? ['adaptive-recall-escalation'] : []),
      ])].slice(0, 16),
      warnings: warnings.slice(0, 12),
    },
  };
}

export function extractionEngineCapabilities(): string[] {
  return [...GLX_CAPABILITIES];
}
