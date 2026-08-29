import { load } from 'cheerio';
import {
  extractLyricsAdvanced,
  normalizeLyricsText,
  EXTRACTION_ENGINE_NAME,
  EXTRACTION_ENGINE_VERSION,
} from './extractionEngine.js';
import { PROXY_VERSION } from './meta.js';
import type { GospelSong, SearchResult } from './types.js';

const PROXY_API_USER_AGENT = `GospelLyricsProxy/${PROXY_VERSION} GLX/${EXTRACTION_ENGINE_VERSION}`;

const BROWSER_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Mobile Safari/537.36 GospelLyricsProxy/2.6',
};

const NAV_PATHS = new Set([
  '', 'mais-acessadas', 'top', 'estilos', 'playlists', 'enviar', 'ajuda', 'login',
  'buscar', 'busca', 'search', 'blog', 'noticias', 'academy', 'podcasts', 'home',
]);

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RESPONSE_BYTES = 2_500_000;

function abortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1000, Math.min(timeoutMs, 15_000)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader || '');
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(2500, retryAfter * 1000);
  const exponential = Math.min(2200, 220 * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 140);
  return exponential + jitter;
}

export function decodeHtml(value: string): string {
  try {
    return load(`<body>${value}</body>`, { scriptingEnabled: false })('body').text();
  } catch {
    return value
      .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_all, code) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }
}

export function htmlToText(html: string): string {
  try {
    const $ = load(html, { scriptingEnabled: false }, false);
    $('script,style,noscript,template').remove();
    $('br').replaceWith('\n');
    $('p,li,div,section,article,pre,blockquote').each((_index: number, node: any) => { $(node).append('\n'); });
    return normalizeLyricsText($.root().text());
  } catch {
    return normalizeLyricsText(
      decodeHtml(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|li|section|article|pre|blockquote)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    );
  }
}

export function extractLyricsFromHtmlDetailed(html: string) {
  return extractLyricsAdvanced(html);
}

export function extractLyricsFromHtml(html: string): string | null {
  return extractLyricsAdvanced(html)?.text || null;
}

function metaContent(html: string, key: string): string | null {
  try {
    const $ = load(html, { scriptingEnabled: false });
    const direct = $(`meta[property="${key}"], meta[name="${key}"]`).first().attr('content');
    return direct?.trim() || null;
  } catch {
    return null;
  }
}

function normalizeDisplayTitle(raw: string): string {
  return decodeHtml(raw)
    .replace(/\s*[-|]\s*(letras(?:\.mus\.br|\.com)?|genius|vagalume).*$/i, '')
    .replace(/\s+lyrics\s*$/i, '')
    .trim();
}

function inferTitleArtist(html: string, fallbackUrl: string): { title: string; artist: string } {
  const ogTitle = metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || '';
  let pageTitle = '';
  try { pageTitle = load(html, { scriptingEnabled: false })('title').first().text(); } catch { /* noop */ }
  const raw = normalizeDisplayTitle(ogTitle || pageTitle);

  const byPattern = raw.match(/^(.+?)\s+(?:by|por)\s+(.+)$/i);
  if (byPattern) return { title: byPattern[1].trim(), artist: byPattern[2].trim() };

  const dash = raw.split(/\s[-–—|]\s/).map(part => part.trim()).filter(Boolean);
  if (dash.length >= 2) return { title: dash[0], artist: dash[1] };

  try {
    const parts = new URL(fallbackUrl).pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
    const artistSlug = parts[0] || 'Artista';
    const titleSlug = parts[1] || raw || 'Música';
    const prettify = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    return { title: raw || prettify(titleSlug), artist: prettify(artistSlug) };
  } catch {
    return { title: raw || 'Música', artist: 'Artista' };
  }
}

function stableId(prefix: string, sourceUrl: string): string {
  let hash = 2166136261;
  for (let index = 0; index < sourceUrl.length; index += 1) {
    hash ^= sourceUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function isAllowedLyricsUrl(rawUrl: string, allowedHosts: string[]): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return allowedHosts.some(allowed => {
      const normalized = allowed.toLowerCase().replace(/^www\./, '');
      return host === normalized || host.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function normalizeCharset(raw: string | null): string {
  const value = (raw || '').trim().toLowerCase().replace(/["']/g, '');
  if (!value) return 'utf-8';
  if (value === 'utf8') return 'utf-8';
  if (value === 'latin1' || value === 'iso-8859-1' || value === 'iso8859-1') return 'windows-1252';
  return value;
}

function sniffCharset(bytes: Uint8Array, contentType: string): string {
  const headerMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
  if (headerMatch?.[1]) return normalizeCharset(headerMatch[1]);

  // Metadados de encoding ficam no início do documento; ASCII é suficiente para localizá-los.
  const head = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 8192)));
  const metaCharset = head.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1];
  if (metaCharset) return normalizeCharset(metaCharset);
  const httpEquiv = head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([^\s;"']+)/i)?.[1];
  return normalizeCharset(httpEquiv || 'utf-8');
}

async function readTextLimited(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('Página excede o limite de processamento');
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel('response-too-large').catch(() => undefined);
      throw new Error('Página excede o limite de processamento');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const charset = sniffCharset(bytes, response.headers.get('content-type') || '');
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

async function fetchText(
  rawUrl: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
  allowedHosts?: string[],
): Promise<string> {
  let current = new URL(rawUrl);
  let attempts = 0;

  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (allowedHosts && !isAllowedLyricsUrl(current.toString(), allowedHosts)) {
      throw new Error('Redirecionamento para host não autorizado');
    }

    let response: Response | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      attempts += 1;
      try {
        response = await fetch(current, {
          method: 'GET',
          headers: { ...BROWSER_HEADERS, Referer: current.origin, ...headers },
          redirect: 'manual',
          signal: abortSignal(timeoutMs),
        });
        if (!RETRYABLE_STATUS.has(response.status) || attempt === 2) break;
        await sleep(retryDelay(attempt, response.headers.get('retry-after')));
      } catch (error) {
        lastError = error;
        if (attempt === 2) throw error;
        await sleep(retryDelay(attempt, null));
      }
    }

    if (!response) throw lastError instanceof Error ? lastError : new Error(`Falha HTTP após ${attempts} tentativas`);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirecionamento HTTP ${response.status} sem destino`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.includes('text/') && !contentType.includes('json')) {
      throw new Error(`Tipo de conteúdo não suportado: ${contentType.split(';')[0]}`);
    }
    return readTextLimited(response);
  }
  throw new Error('Número máximo de redirecionamentos excedido');
}

function buildAnchorResult(
  rawHref: string,
  rawLabel: string,
  base: URL,
  terms: string[],
  seen: Set<string>,
): SearchResult | null {
  const label = normalizeLyricsText(rawLabel.replace(/\s+/g, ' '));
  if (label.length < 3 || label.length > 220) return null;

  let url: URL;
  try { url = new URL(decodeHtml(rawHref), base); } catch { return null; }
  if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return null;

  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2 || parts.length > 5 || NAV_PATHS.has(parts[0])) return null;
  if (/^(traducao|cifra|album|discografia|fotos|biografia|playlists?|videos?)$/i.test(parts[1] || '')) return null;

  url.search = '';
  url.hash = '';
  const canonical = url.toString();
  if (seen.has(canonical)) return null;

  const searchable = `${label} ${parts.join(' ')}`.toLocaleLowerCase('pt-BR').replace(/[-_]+/g, ' ');
  const matchedTerms = terms.filter(term => searchable.includes(term)).length;
  if (terms.length && matchedTerms === 0) return null;
  seen.add(canonical);

  const split = label.split(/\s[-–—|]\s|\s+por\s+/i).map(part => part.trim()).filter(Boolean);
  const title = split[0] || label;
  const artist = split[1] || parts[0].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  const exactBonus = terms.length && matchedTerms === terms.length ? 18 : 0;
  return {
    id: stableId('letras', canonical),
    title,
    artist,
    preview: 'Resultado encontrado na fonte de letras. Toque para carregar a letra completa.',
    source: 'letras_mus_br',
    sourceUrl: canonical,
    score: 58 + matchedTerms * 8 + exactBonus,
  };
}

function parseAnchorResultsWithParser(
  html: string,
  base: URL,
  terms: string[],
  seen: Set<string>,
  parser: 'parse5' | 'htmlparser2',
  maxCandidates: number,
): SearchResult[] {
  const results: SearchResult[] = [];
  const $ = parser === 'parse5'
    ? load(html, { scriptingEnabled: false })
    : load(html, { xml: { xmlMode: false, decodeEntities: true } });

  $('a[href]').each((_index: number, element: any) => {
    if (results.length >= maxCandidates) return false;
    const label = [$(element).text(), $(element).attr('aria-label'), $(element).attr('title')]
      .filter(Boolean)
      .join(' ');
    const result = buildAnchorResult($(element).attr('href') || '', label, base, terms, seen);
    if (result) results.push(result);
    return undefined;
  });
  return results;
}

function collectStructuredSearchResults(
  html: string,
  base: URL,
  terms: string[],
  seen: Set<string>,
  limit: number,
): SearchResult[] {
  const results: SearchResult[] = [];
  let $: ReturnType<typeof load>;
  try { $ = load(html, { scriptingEnabled: false }); } catch { return results; }

  const visit = (node: unknown, depth = 0): void => {
    if (depth > 16 || node == null || results.length >= limit) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 700)) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const record = node as Record<string, any>;
    const rawUrl = record.url ?? record.href ?? record.path ?? record.share_url ?? record.songUrl;
    const rawTitle = record.title ?? record.name ?? record.songTitle ?? record.song_name;
    const artistObject = record.artist ?? record.primary_artist ?? record.author ?? record.artistName;
    const rawArtist = typeof artistObject === 'string'
      ? artistObject
      : artistObject && typeof artistObject === 'object'
        ? (artistObject.name ?? artistObject.title)
        : undefined;

    if (typeof rawUrl === 'string' && typeof rawTitle === 'string') {
      const label = rawArtist ? `${rawTitle} - ${String(rawArtist)}` : rawTitle;
      const built = buildAnchorResult(rawUrl, label, base, terms, seen);
      if (built) results.push({ ...built, score: built.score + 6 });
    }
    for (const value of Object.values(record).slice(0, 900)) visit(value, depth + 1);
  };

  $('script').slice(0, 100).each((_index: number, element: any) => {
    if (results.length >= limit) return false;
    const type = ($(element).attr('type') || '').toLowerCase();
    const id = ($(element).attr('id') || '').toLowerCase();
    if (!type.includes('json') && !/__next_data__|__nuxt|apollo|initial_state|hydration/.test(id)) return undefined;
    const raw = $(element).text().trim();
    if (!raw || raw.length > 1_500_000) return undefined;
    try { visit(JSON.parse(raw)); } catch { /* script não é JSON puro */ }
    return undefined;
  });
  return results;
}

function parseAnchorResults(html: string, baseUrl: string, query: string, limit: number): SearchResult[] {
  const base = new URL(baseUrl);
  const terms = query.toLocaleLowerCase('pt-BR').split(/\s+/).filter(term => term.length > 1);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const parser of ['parse5', 'htmlparser2'] as const) {
    try {
      results.push(...parseAnchorResultsWithParser(html, base, terms, seen, parser, limit * 8));
    } catch {
      // O segundo parser e os fallbacks estruturados continuam disponíveis.
    }
  }

  if (results.length < limit) {
    results.push(...collectStructuredSearchResults(html, base, terms, seen, limit * 6));
  }

  if (results.length < limit) {
    const pattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null && results.length < limit * 10) {
      const result = buildAnchorResult(match[2], htmlToText(match[4]), base, terms, seen);
      if (result) results.push(result);
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}


function slugifySourcePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function providerAnchorResult(
  rawHref: string,
  rawLabel: string,
  base: URL,
  query: string,
  source: 'vagalume' | 'genius',
  seen: Set<string>,
): SearchResult | null {
  const label = normalizeLyricsText(rawLabel.replace(/\s+/g, ' '));
  if (label.length < 2 || label.length > 260) return null;

  let url: URL;
  try { url = new URL(decodeHtml(rawHref), base); } catch { return null; }
  const allowedHosts = source === 'genius' ? ['genius.com'] : ['vagalume.com.br'];
  if (!isAllowedLyricsUrl(url.toString(), allowedHosts)) return null;
  if (source === 'vagalume' && !/\.html$/i.test(url.pathname)) return null;
  if (source === 'genius' && !/-lyrics\/?$/i.test(url.pathname)) return null;

  url.search = '';
  url.hash = '';
  const canonical = url.toString();
  if (seen.has(canonical)) return null;

  const terms = query.toLocaleLowerCase('pt-BR').split(/\s+/).filter(term => term.length > 1);
  const searchable = `${label} ${decodeURIComponent(url.pathname)}`.toLocaleLowerCase('pt-BR').replace(/[-_]+/g, ' ');
  const matchedTerms = terms.filter(term => searchable.includes(term)).length;
  if (terms.length && matchedTerms === 0) return null;
  seen.add(canonical);

  const parts = url.pathname.split('/').filter(Boolean).map(part => part.replace(/\.html$/i, ''));
  const split = label.split(/\s[-–—|]\s|\s+por\s+/i).map(part => part.trim()).filter(Boolean);
  let artist = split[1] || '';
  let title = split[0] || label;
  if (source === 'vagalume' && parts.length >= 2) {
    if (!artist) artist = parts[0].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    if (!title || title.length < 2) title = parts[1].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }
  if (source === 'genius' && /lyrics/i.test(title)) title = title.replace(/\s+lyrics\s*$/i, '').trim();

  return {
    id: stableId(source, canonical),
    title,
    artist: artist || 'Artista',
    preview: source === 'vagalume'
      ? 'Resultado encontrado no Vagalume. Toque para carregar a letra completa.'
      : 'Resultado encontrado no Genius. Toque para carregar a letra completa.',
    source,
    sourceUrl: canonical,
    score: 54 + matchedTerms * 9 + (matchedTerms === terms.length && terms.length ? 14 : 0),
  };
}

function parseProviderSearchHtml(
  html: string,
  baseUrl: string,
  query: string,
  source: 'vagalume' | 'genius',
  limit: number,
): SearchResult[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const parser of ['parse5', 'htmlparser2'] as const) {
    try {
      const $ = parser === 'parse5'
        ? load(html, { scriptingEnabled: false })
        : load(html, { xml: { xmlMode: false, decodeEntities: true } });
      $('a[href]').each((_index: number, element: any) => {
        if (results.length >= limit * 8) return false;
        const label = [$(element).text(), $(element).attr('aria-label'), $(element).attr('title')].filter(Boolean).join(' ');
        const result = providerAnchorResult($(element).attr('href') || '', label, base, query, source, seen);
        if (result) results.push(result);
        return undefined;
      });
    } catch { /* outro parser/fallback continua */ }
  }
  if (results.length < limit) {
    const pattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null && results.length < limit * 10) {
      const result = providerAnchorResult(match[2], htmlToText(match[4]), base, query, source, seen);
      if (result) results.push(result);
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function searchGeniusWeb(
  webBaseUrl: string,
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const normalizedBase = webBaseUrl.replace(/\/+$/, '');
  const baseHost = new URL(normalizedBase).hostname;
  // A busca web JSON é preferida ao HTML porque /search pode ser renderizado no cliente.
  // Mantemos dois formatos observados do próprio Genius para sobreviver a alterações incrementais.
  const jsonEndpoints = [
    `${normalizedBase}/api/search/multi?per_page=${Math.max(1, Math.min(limit, 10))}&q=${encodeURIComponent(query.trim())}`,
    `${normalizedBase}/api/search/song?page=1&q=${encodeURIComponent(query.trim())}`,
  ];
  let endpointError: unknown;
  for (const endpoint of jsonEndpoints) {
    try {
      const raw = await fetchText(endpoint, timeoutMs, { Accept: 'application/json' }, [baseHost]);
      const data = JSON.parse(raw);
      const response = data?.response || data;
      const sections = Array.isArray(response?.sections) ? response.sections : [];
      const sectionHits = sections.flatMap((section: any) => Array.isArray(section?.hits) ? section.hits : []);
      const directHits = Array.isArray(response?.hits) ? response.hits : [];
      const hits = sectionHits.length ? sectionHits : directHits;
      const results = hits.map((hit: any, index: number): SearchResult | null => {
        const result = hit?.result || hit;
        const rawSourceUrl = result?.url || result?.path;
        const sourceUrl = rawSourceUrl ? new URL(String(rawSourceUrl), normalizedBase).toString() : '';
        if (!result?.title || !sourceUrl || !isAllowedLyricsUrl(sourceUrl, ['genius.com'])) return null;
        return {
          id: `genius-web-${String(result.id || index)}`,
          title: String(result.title),
          artist: String(result.artist_names || result.primary_artist?.name || result.artist?.name || 'Artista'),
          preview: 'Resultado encontrado no Genius Web. Toque para carregar a letra completa.',
          source: 'genius',
          sourceUrl,
          score: 78 - index,
        };
      }).filter(Boolean).slice(0, limit) as SearchResult[];
      if (results.length) return results;
    } catch (error) {
      endpointError = error;
    }
  }

  try {
    const html = await fetchText(`${normalizedBase}/search?q=${encodeURIComponent(query.trim())}`, timeoutMs, {}, [baseHost]);
    const results = parseProviderSearchHtml(html, normalizedBase, query, 'genius', limit);
    if (results.length) return results;
  } catch (error) {
    if (!endpointError) endpointError = error;
  }
  if (endpointError) throw endpointError;
  return [];
}


export async function searchVagalumeExcerpt(
  apiBaseUrl: string,
  webBaseUrl: string,
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const apiBase = apiBaseUrl.replace(/\/+$/, '');
  const apiHost = new URL(apiBase).hostname;
  const webBase = webBaseUrl.replace(/\/+$/, '');
  const url = `${apiBase}/search.excerpt?q=${encodeURIComponent(query.trim())}&limit=${Math.max(1, Math.min(limit, 25))}`;
  const raw = await fetchText(url, timeoutMs, { Accept: 'application/json' }, [apiHost]);
  const data = JSON.parse(raw);
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  return docs.map((doc: any, index: number): SearchResult | null => {
    const title = String(doc?.title || doc?.mus || doc?.name || '').trim();
    const artist = String(doc?.band || doc?.artist || doc?.art || '').trim();
    if (!title || !artist) return null;
    const sourceUrl = `${webBase}/${slugifySourcePart(artist)}/${slugifySourcePart(title)}.html`;
    return {
      id: String(doc?.id || stableId('vagalume', sourceUrl)),
      title,
      artist,
      preview: 'Resultado do índice de busca do Vagalume. A letra será validada pelo GLX.',
      source: 'vagalume',
      sourceUrl,
      providerRef: typeof doc?.id === 'string' ? doc.id : undefined,
      score: 80 - index,
    };
  }).filter(Boolean).slice(0, limit) as SearchResult[];
}

export async function searchVagalumeWeb(
  webBaseUrl: string,
  query: string,
  artist: string,
  limit: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const normalizedBase = webBaseUrl.replace(/\/+$/, '');
  const baseHost = new URL(normalizedBase).hostname;
  const searchUrls: string[] = [];
  const artistSlug = slugifySourcePart(artist);
  if (artistSlug) searchUrls.push(`${normalizedBase}/${artistSlug}/`);
  searchUrls.push(`${normalizedBase}/search/?q=${encodeURIComponent(query.trim())}`);

  let lastError: unknown;
  for (const url of searchUrls) {
    try {
      const html = await fetchText(url, timeoutMs, {}, [baseHost]);
      const results = parseProviderSearchHtml(html, normalizedBase, query, 'vagalume', limit);
      if (results.length) return results;
    } catch (error) {
      lastError = error;
    }
  }

  // Vagalume usa historicamente /artista/titulo.html. Quando artista e título são conhecidos,
  // o último fallback valida diretamente essa URL em vez de devolver um palpite não verificado.
  const titleSlug = slugifySourcePart(query);
  if (artistSlug && titleSlug) {
    const directUrl = `${normalizedBase}/${artistSlug}/${titleSlug}.html`;
    try {
      const song = await fetchScrapedSong(directUrl, 'vagalume', timeoutMs);
      if (song) return [{
        id: song.id,
        title: song.title,
        artist: song.artist,
        preview: 'Resultado confirmado diretamente no Vagalume.',
        source: 'vagalume',
        sourceUrl: song.sourceUrl,
        score: 86,
      }];
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return [];
}

export async function searchLetrasMusBr(
  baseUrl: string,
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const baseHost = new URL(normalizedBase).hostname;
  const q = encodeURIComponent(query.trim());
  const searchUrls = [
    `${normalizedBase}/?q=${q}`,
    `${normalizedBase}/buscar/?q=${q}`,
    `${normalizedBase}/busca/?q=${q}`,
  ];

  let lastError: unknown;
  for (const url of searchUrls) {
    try {
      const html = await fetchText(url, timeoutMs, {}, [baseHost]);
      const parsed = parseAnchorResults(html, normalizedBase, query, limit);
      if (parsed.length) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return [];
}

export async function fetchScrapedSong(
  sourceUrl: string,
  source: 'letras_mus_br' | 'genius' | 'vagalume',
  timeoutMs: number,
): Promise<GospelSong | null> {
  const allowedHosts = source === 'genius' ? ['genius.com'] : source === 'vagalume' ? ['vagalume.com.br'] : ['letras.mus.br', 'letras.com'];
  if (!isAllowedLyricsUrl(sourceUrl, allowedHosts)) throw new Error('URL de letra não autorizada');

  const html = await fetchText(sourceUrl, timeoutMs, {}, allowedHosts);
  const extraction = extractLyricsAdvanced(html);
  if (!extraction) return null;

  const { title, artist } = inferTitleArtist(html, sourceUrl);
  const album = metaContent(html, 'music:album') || undefined;
  return {
    id: stableId(source === 'genius' ? 'genius' : source === 'vagalume' ? 'vagalume' : 'letras', sourceUrl),
    title,
    artist,
    album,
    fullLyrics: extraction.text,
    source,
    sourceUrl,
    extractionMethod: extraction.method,
    extraction: extraction.diagnostics,
    fetchedAt: new Date().toISOString(),
  };
}

export async function searchGenius(
  baseUrl: string,
  accessToken: string,
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<SearchResult[]> {
  if (!accessToken.trim()) return [];
  const url = `${baseUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'User-Agent': PROXY_API_USER_AGENT },
    redirect: 'error',
    signal: abortSignal(timeoutMs),
  });
  if (!response.ok) throw new Error(`Genius HTTP ${response.status}`);
  const data: any = await response.json();
  const hits = Array.isArray(data?.response?.hits) ? data.response.hits : [];
  return hits
    .map((hit: any, index: number): SearchResult | null => {
      const result = hit?.result;
      if (!result?.url || !result?.title || !isAllowedLyricsUrl(String(result.url), ['genius.com'])) return null;
      return {
        id: `genius-${String(result.id || index)}`,
        title: String(result.title),
        artist: String(result.primary_artist?.name || result.artist_names || 'Artista'),
        preview: 'Resultado do Genius. Toque para carregar a letra completa.',
        source: 'genius',
        sourceUrl: String(result.url),
        providerRef: result.id ? String(result.id) : undefined,
        score: Math.max(45, 80 - index * 2),
      };
    })
    .filter(Boolean)
    .slice(0, limit) as SearchResult[];
}

export async function fetchVagalumeSong(
  baseUrl: string,
  apiKey: string,
  artist: string,
  title: string,
  timeoutMs: number,
): Promise<GospelSong | null> {
  if (!apiKey.trim() || !artist.trim() || !title.trim()) return null;
  const url = new URL('/search.php', baseUrl);
  url.searchParams.set('art', artist);
  url.searchParams.set('mus', title);
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': PROXY_API_USER_AGENT },
    redirect: 'error',
    signal: abortSignal(timeoutMs),
  });
  if (!response.ok) throw new Error(`Vagalume HTTP ${response.status}`);
  const data: any = await response.json();
  const mus = data?.mus?.[0];
  const lyrics = typeof mus?.text === 'string' ? normalizeLyricsText(mus.text) : '';
  if (!lyrics) return null;

  const resolvedArtist = String(data?.art?.name || artist);
  const resolvedTitle = String(mus?.name || title);
  const sourceUrl = typeof mus?.url === 'string' ? mus.url : undefined;
  const lineCount = lyrics.split('\n').filter(Boolean).length;
  const wordCount = lyrics.split(/\s+/).filter(Boolean).length;
  return {
    id: stableId('vagalume', sourceUrl || `${resolvedArtist}:${resolvedTitle}`),
    title: resolvedTitle,
    artist: resolvedArtist,
    fullLyrics: lyrics,
    source: 'vagalume',
    sourceUrl,
    extractionMethod: 'api',
    extraction: {
      engine: EXTRACTION_ENGINE_NAME,
      version: EXTRACTION_ENGINE_VERSION,
      method: 'api',
      parser: 'provider-api',
      candidateCount: 1,
      quality: {
        score: 100,
        confidence: 0.995,
        charCount: lyrics.length,
        wordCount,
        lineCount,
        distinctLineRatio: 1,
        duplicateLineRatio: 0,
        averageLineLength: lineCount ? Number((lyrics.length / lineCount).toFixed(2)) : 0,
        linkDensity: 0,
      },
      signals: ['provider-api'],
      warnings: [],
    },
    fetchedAt: new Date().toISOString(),
  };
}
