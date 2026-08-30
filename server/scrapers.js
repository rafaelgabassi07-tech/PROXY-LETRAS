import { load } from 'cheerio';
import { extractLyricsAdvanced, normalizeLyricsText, EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION, } from './extractionEngine.js';
import { PROXY_VERSION } from './meta.js';
const PROXY_API_USER_AGENT = `GospelLyricsProxy/${PROXY_VERSION} GLX/${EXTRACTION_ENGINE_VERSION}`;
const BROWSER_HEADERS = {
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': `Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Mobile Safari/537.36 GospelLyricsProxy/${PROXY_VERSION}`,
};
const NAV_PATHS = new Set([
    '', 'mais-acessadas', 'top', 'estilos', 'playlists', 'enviar', 'ajuda', 'login',
    'buscar', 'busca', 'search', 'blog', 'noticias', 'academy', 'podcasts', 'home',
]);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RESPONSE_BYTES = 2_500_000;
function abortSignal(timeoutMs) {
    return AbortSignal.timeout(Math.max(1000, Math.min(timeoutMs, 15_000)));
}
function totalBudget(timeoutMs) {
    const deadline = Date.now() + Math.max(1000, Math.min(timeoutMs, 15_000));
    return {
        next(maxMs = 2200) {
            const remaining = Math.max(0, deadline - Date.now());
            if (remaining < 900)
                return 0;
            return Math.max(900, Math.min(maxMs, remaining));
        },
    };
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function retryDelay(attempt, retryAfterHeader) {
    const retryAfter = Number(retryAfterHeader || '');
    if (Number.isFinite(retryAfter) && retryAfter > 0)
        return Math.min(2500, retryAfter * 1000);
    const exponential = Math.min(2200, 220 * (2 ** attempt));
    const jitter = Math.floor(Math.random() * 140);
    return exponential + jitter;
}
export function decodeHtml(value) {
    try {
        return load(`<body>${value}</body>`, { scriptingEnabled: false })('body').text();
    }
    catch {
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
export function htmlToText(html) {
    try {
        const $ = load(html, { scriptingEnabled: false }, false);
        $('script,style,noscript,template').remove();
        $('br').replaceWith('\n');
        $('p,li,div,section,article,pre,blockquote').each((_index, node) => { $(node).append('\n'); });
        return normalizeLyricsText($.root().text());
    }
    catch {
        return normalizeLyricsText(decodeHtml(html)
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(?:p|div|li|section|article|pre|blockquote)>/gi, '\n')
            .replace(/<[^>]+>/g, ''));
    }
}
export function extractLyricsFromHtmlDetailed(html) {
    return extractLyricsAdvanced(html);
}
export function extractLyricsFromHtml(html) {
    return extractLyricsAdvanced(html)?.text || null;
}
function metaContent(html, key) {
    try {
        const $ = load(html, { scriptingEnabled: false });
        const direct = $(`meta[property="${key}"], meta[name="${key}"]`).first().attr('content');
        return direct?.trim() || null;
    }
    catch {
        return null;
    }
}
function normalizeDisplayTitle(raw) {
    return decodeHtml(raw)
        .replace(/\s*[-|]\s*(letras(?:\.mus\.br|\.com)?|vagalume).*$/i, '')
        .replace(/\s+lyrics\s*$/i, '')
        .trim();
}
function inferTitleArtist(html, fallbackUrl) {
    const ogTitle = metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || '';
    let pageTitle = '';
    try {
        pageTitle = load(html, { scriptingEnabled: false })('title').first().text();
    }
    catch { /* noop */ }
    const raw = normalizeDisplayTitle(ogTitle || pageTitle);
    const byPattern = raw.match(/^(.+?)\s+(?:by|por)\s+(.+)$/i);
    if (byPattern)
        return { title: byPattern[1].trim(), artist: byPattern[2].trim() };
    const dash = raw.split(/\s[-–—|]\s/).map(part => part.trim()).filter(Boolean);
    if (dash.length >= 2)
        return { title: dash[0], artist: dash[1] };
    try {
        const parts = new URL(fallbackUrl).pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
        const artistSlug = parts[0] || 'Artista';
        const titleSlug = parts[1] || raw || 'Música';
        const prettify = (value) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        return { title: raw || prettify(titleSlug), artist: prettify(artistSlug) };
    }
    catch {
        return { title: raw || 'Música', artist: 'Artista' };
    }
}
function stableId(prefix, sourceUrl) {
    let hash = 2166136261;
    for (let index = 0; index < sourceUrl.length; index += 1) {
        hash ^= sourceUrl.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(36)}`;
}
export function isAllowedLyricsUrl(rawUrl, allowedHosts) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return false;
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        return allowedHosts.some(allowed => {
            const normalized = allowed.toLowerCase().replace(/^www\./, '');
            return host === normalized || host.endsWith(`.${normalized}`);
        });
    }
    catch {
        return false;
    }
}
function normalizeCharset(raw) {
    const value = (raw || '').trim().toLowerCase().replace(/["']/g, '');
    if (!value)
        return 'utf-8';
    if (value === 'utf8')
        return 'utf-8';
    if (value === 'latin1' || value === 'iso-8859-1' || value === 'iso8859-1')
        return 'windows-1252';
    return value;
}
function sniffCharset(bytes, contentType) {
    const headerMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
    if (headerMatch?.[1])
        return normalizeCharset(headerMatch[1]);
    // Metadados de encoding ficam no início do documento; ASCII é suficiente para localizá-los.
    const head = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 8192)));
    const metaCharset = head.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1];
    if (metaCharset)
        return normalizeCharset(metaCharset);
    const httpEquiv = head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([^\s;"']+)/i)?.[1];
    return normalizeCharset(httpEquiv || 'utf-8');
}
async function readTextLimited(response, maxBytes = MAX_RESPONSE_BYTES) {
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes)
        throw new Error('Página excede o limite de processamento');
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        received += value.byteLength;
        if (received > maxBytes) {
            await reader.cancel('response-too-large').catch(() => undefined);
            throw new Error('Página excede o limite de processamento');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const charset = sniffCharset(bytes, response.headers.get('content-type') || '');
    try {
        return new TextDecoder(charset, { fatal: false }).decode(bytes);
    }
    catch {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
}
async function fetchText(rawUrl, timeoutMs, headers = {}, allowedHosts) {
    let current = new URL(rawUrl);
    let attempts = 0;
    // timeoutMs agora é orçamento TOTAL do fetch (tentativas + redirects), não por tentativa.
    // Isso impede um provedor lento de segurar toda a busca multi-fonte por 3x o timeout.
    const deadline = Date.now() + Math.max(1000, Math.min(timeoutMs, 15_000));
    const remainingMs = () => Math.max(0, deadline - Date.now());
    for (let redirects = 0; redirects <= 4; redirects += 1) {
        if (allowedHosts && !isAllowedLyricsUrl(current.toString(), allowedHosts)) {
            throw new Error('Redirecionamento para host não autorizado');
        }
        let response = null;
        let lastError;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            attempts += 1;
            const remaining = remainingMs();
            if (remaining < 250) throw new Error(`Tempo limite excedido após ${attempts - 1} tentativa(s)`);
            try {
                response = await fetch(current, {
                    method: 'GET',
                    headers: { ...BROWSER_HEADERS, Referer: current.origin, ...headers },
                    redirect: 'manual',
                    signal: abortSignal(remaining),
                });
                if (!RETRYABLE_STATUS.has(response.status) || attempt === 2)
                    break;
                const delay = Math.min(retryDelay(attempt, response.headers.get('retry-after')), Math.max(0, remainingMs() - 200));
                if (delay > 0) await sleep(delay);
            }
            catch (error) {
                lastError = error;
                if (attempt === 2 || remainingMs() < 250)
                    throw error;
                const delay = Math.min(retryDelay(attempt, null), Math.max(0, remainingMs() - 200));
                if (delay > 0) await sleep(delay);
            }
        }
        if (!response)
            throw lastError instanceof Error ? lastError : new Error(`Falha HTTP após ${attempts} tentativas`);
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location)
                throw new Error(`Redirecionamento HTTP ${response.status} sem destino`);
            current = new URL(location, current);
            if (remainingMs() < 250) throw new Error('Tempo limite excedido durante redirecionamento');
            continue;
        }
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('html') && !contentType.includes('text/') && !contentType.includes('json')) {
            throw new Error(`Tipo de conteúdo não suportado: ${contentType.split(';')[0]}`);
        }
        return readTextLimited(response);
    }
    throw new Error('Número máximo de redirecionamentos excedido');
}
function normalizeSearchText(value) {
    return normalizeLyricsText(String(value || ''))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
const SEARCH_STOPWORDS = new Set([
    'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'que', 'pra', 'para', 'por', 'com', 'me', 'te', 'se', 'eu', 'tu',
    'ele', 'ela', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas', 'ao', 'aos', 'the',
    'and', 'of', 'to', 'in', 'my', 'you', 'your', 'is', 'it',
]);
function meaningfulTerms(query) {
    const normalized = normalizeSearchText(query);
    const terms = normalized.split(/\s+/).filter(term => term.length > 1 && !SEARCH_STOPWORDS.has(term));
    return [...new Set(terms)].slice(0, 18);
}
function safeMediaUrl(raw, base) {
    if (typeof raw !== 'string' || !raw.trim() || /^data:/i.test(raw))
        return undefined;
    const first = raw.split(',')[0]?.trim().split(/\s+/)[0] || '';
    try {
        const url = new URL(decodeHtml(first), base);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return undefined;
        if (url.protocol === 'http:')
            url.protocol = 'https:';
        return url.toString();
    }
    catch {
        return undefined;
    }
}
function compactPreview(raw, query, maxLength = 180) {
    const text = normalizeLyricsText(htmlToText(String(raw || ''))).replace(/\s+/g, ' ').trim();
    if (!text)
        return '';
    if (text.length <= maxLength)
        return text;
    const terms = meaningfulTerms(query);
    const normalized = normalizeSearchText(text);
    let pivot = -1;
    for (const term of terms) {
        const found = normalized.indexOf(term);
        if (found >= 0) {
            pivot = found;
            break;
        }
    }
    // O índice normalizado é suficientemente próximo para selecionar uma janela legível.
    const start = Math.max(0, pivot >= 0 ? pivot - Math.floor(maxLength * 0.32) : 0);
    const slice = text.slice(start, start + maxLength).trim();
    return `${start > 0 ? '…' : ''}${slice}${start + maxLength < text.length ? '…' : ''}`;
}
function searchCardContext($, element, base) {
    const container = $(element).closest('li,article,[class*="result"],[class*="card"],[data-testid*="result"],section,div').first();
    const contextText = container.length ? container.text() : $(element).parent().text();
    const image = container.find('img').first();
    const rawImage = image.attr('src') || image.attr('data-src') || image.attr('data-lazy-src') || image.attr('srcset');
    const style = container.attr('style') || '';
    const background = style.match(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i)?.[1];
    return {
        contextText: String(contextText || '').slice(0, 1600),
        imageUrl: safeMediaUrl(rawImage || background || '', base),
    };
}
function slugifySourcePart(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/&/g, ' e ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function providerAnchorResult(rawHref, rawLabel, base, query, source, seen, contextText = '', imageUrl) {
    const label = normalizeLyricsText(rawLabel.replace(/\s+/g, ' '));
    if (label.length < 2 || label.length > 260)
        return null;
    let url;
    try {
        url = new URL(decodeHtml(rawHref), base);
    }
    catch {
        return null;
    }
    const allowedHosts = ['vagalume.com.br'];
    if (!isAllowedLyricsUrl(url.toString(), allowedHosts))
        return null;
    if (!/\.html$/i.test(url.pathname))
        return null;
    url.search = '';
    url.hash = '';
    const canonical = url.toString();
    if (seen.has(canonical))
        return null;
    const terms = meaningfulTerms(query);
    const metadata = normalizeSearchText(`${label} ${decodeURIComponent(url.pathname)}`);
    const context = normalizeSearchText(contextText);
    const metadataMatches = terms.filter(term => metadata.includes(term)).length;
    const contextMatches = terms.filter(term => context.includes(term)).length;
    const minimumContextMatches = terms.length >= 5 ? Math.min(3, Math.ceil(terms.length * 0.35)) : 1;
    if (terms.length && metadataMatches === 0 && contextMatches < minimumContextMatches)
        return null;
    seen.add(canonical);
    const parts = url.pathname.split('/').filter(Boolean).map(part => part.replace(/\.html$/i, ''));
    const split = label.split(/\s[-–—|]\s|\s+por\s+/i).map(part => part.trim()).filter(Boolean);
    let artist = split[1] || '';
    let title = split[0] || label;
    if (source === 'vagalume' && parts.length >= 2) {
        if (!artist)
            artist = parts[0].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        if (!title || title.length < 2)
            title = parts[1].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    }
    const preview = contextMatches >= minimumContextMatches ? compactPreview(contextText, query) : '';
    return {
        id: stableId(source, canonical),
        title,
        artist: artist || 'Artista',
        preview: preview || 'Resultado encontrado no Vagalume.',
        source,
        sourceUrl: canonical,
        imageUrl,
        score: 54 + metadataMatches * 9 + contextMatches * 6 + (metadataMatches === terms.length && terms.length ? 14 : 0),
    };
}
function parseProviderSearchHtml(html, baseUrl, query, source, limit) {
    const base = new URL(baseUrl);
    const seen = new Set();
    const results = [];
    for (const parser of ['parse5', 'htmlparser2']) {
        try {
            const $ = parser === 'parse5'
                ? load(html, { scriptingEnabled: false })
                : load(html, { xml: { xmlMode: false, decodeEntities: true } });
            $('a[href]').each((_index, element) => {
                if (results.length >= limit * 8)
                    return false;
                const label = [$(element).text(), $(element).attr('aria-label'), $(element).attr('title')].filter(Boolean).join(' ');
                const context = searchCardContext($, element, base);
                const result = providerAnchorResult($(element).attr('href') || '', label, base, query, source, seen, context.contextText, context.imageUrl);
                if (result)
                    results.push(result);
                return undefined;
            });
        }
        catch { /* outro parser/fallback continua */ }
    }
    if (results.length < limit) {
        const pattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = pattern.exec(html)) !== null && results.length < limit * 10) {
            const result = providerAnchorResult(match[2], htmlToText(match[4]), base, query, source, seen);
            if (result)
                results.push(result);
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function plainFromSyncedLyrics(raw) {
    return normalizeLyricsText(String(raw || '')
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*(?:\[[0-9]{1,3}:[0-9]{2}(?:[.:][0-9]{1,3})?\])+\s*/, ''))
        .join('\n'));
}
function mapLrclibRecord(doc, query, index = 0, baseUrl = 'https://lrclib.net') {
    const providerRef = String(doc?.id ?? '').trim();
    const title = String(doc?.trackName || doc?.name || '').trim();
    const artist = String(doc?.artistName || '').trim();
    if (!providerRef || !title || !artist || doc?.instrumental === true)
        return null;
    const plainLyrics = String(doc?.plainLyrics || '').trim();
    const syncedLyrics = String(doc?.syncedLyrics || '').trim();
    const lyrics = plainLyrics || plainFromSyncedLyrics(syncedLyrics);
    const normalizedQuery = normalizeSearchText(query);
    const normalizedTitle = normalizeSearchText(title);
    const normalizedArtist = normalizeSearchText(artist);
    const exactTitle = normalizedQuery && normalizedTitle === normalizedQuery;
    const exactArtist = normalizedQuery && normalizedArtist === normalizedQuery;
    const titleContains = normalizedQuery && (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle));
    const artistContains = normalizedQuery && (normalizedArtist.includes(normalizedQuery) || normalizedQuery.includes(normalizedArtist));
    const relevanceBonus = exactTitle ? 32 : exactArtist ? 26 : titleContains ? 18 : artistContains ? 14 : 0;
    return {
        id: `lrclib-${providerRef}`,
        title,
        artist,
        album: String(doc?.albumName || '').trim() || undefined,
        preview: lyrics ? compactPreview(lyrics, query) : `Resultado encontrado no LRCLIB para ${artist}.`,
        source: 'lrclib',
        sourceUrl: `${baseUrl.replace(/\/+$/, '')}/api/get/${encodeURIComponent(providerRef)}`,
        providerRef,
        score: 82 - Math.min(index, 20) + relevanceBonus + (lyrics ? 4 : 0),
    };
}
export async function searchLrclib(baseUrl, query, artist, title, limit, timeoutMs) {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    const url = new URL('/api/search', normalizedBase);
    const cleanQuery = String(query || '').trim();
    const cleanArtist = String(artist || '').trim();
    const cleanTitle = String(title || '').trim();
    if (cleanTitle) {
        url.searchParams.set('track_name', cleanTitle);
        if (cleanArtist) url.searchParams.set('artist_name', cleanArtist);
    }
    else if (cleanQuery) {
        url.searchParams.set('q', cleanQuery);
    }
    else if (cleanArtist) {
        url.searchParams.set('q', cleanArtist);
    }
    else {
        return [];
    }
    const raw = await fetchText(url.toString(), timeoutMs, {
        Accept: 'application/json',
        'User-Agent': PROXY_API_USER_AGENT,
        'Lrclib-Client': PROXY_API_USER_AGENT,
    }, [baseHost]);
    const data = JSON.parse(raw);
    if (!Array.isArray(data))
        throw new Error('LRCLIB INVALID_JSON');
    return data
        .slice(0, Math.max(1, Math.min(limit * 2, 20)))
        .map((doc, index) => mapLrclibRecord(doc, cleanTitle || cleanQuery || cleanArtist, index, normalizedBase))
        .filter(Boolean)
        .slice(0, limit);
}

export async function searchVagalumeExcerpt(apiBaseUrl, webBaseUrl, query, limit, timeoutMs) {
    const apiBase = apiBaseUrl.replace(/\/+$/, '');
    const apiHost = new URL(apiBase).hostname;
    const webBase = webBaseUrl.replace(/\/+$/, '');
    const url = new URL(`${apiBase}/search.excerpt`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 25))));
    const raw = await fetchText(url.toString(), timeoutMs, { Accept: 'application/json' }, [apiHost]);
    const data = JSON.parse(raw);
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    return docs.map((doc, index) => {
        const title = String(doc?.title || doc?.mus || doc?.name || '').trim();
        const artist = String(doc?.band || doc?.artist || doc?.art || '').trim();
        if (!title || !artist)
            return null;
        const rawSourceUrl = doc?.url || doc?.link || doc?.sourceUrl || doc?.source_url;
        let sourceUrl;
        if (typeof rawSourceUrl === 'string' && rawSourceUrl.trim()) {
            try {
                const candidateUrl = new URL(rawSourceUrl, webBase).toString();
                if (isAllowedLyricsUrl(candidateUrl, ['vagalume.com.br'])) sourceUrl = candidateUrl;
            }
            catch { /* o índice normalmente fornece apenas id/título/artista */ }
        }
        const rawPreview = doc?.excerpt || doc?.snippet || doc?.text || doc?.content || '';
        const rawImage = doc?.image || doc?.imageUrl || doc?.image_url || doc?.thumbnail || doc?.cover || doc?.pic;
        return {
            id: String(doc?.id || stableId('vagalume', `${artist}|${title}`)),
            title,
            artist,
            album: typeof doc?.album === 'string' ? doc.album : (typeof doc?.album?.name === 'string' ? doc.album.name : undefined),
            imageUrl: safeMediaUrl(typeof rawImage === 'string' ? rawImage : '', webBase),
            preview: rawPreview ? compactPreview(String(rawPreview), query) : 'Resultado encontrado no Vagalume.',
            source: 'vagalume',
            // Nunca inventa /artista/titulo.html: slugs podem apontar para outra música.
            // lyricsService resolve a URL canônica pela página real do artista antes de abrir/validar.
            sourceUrl,
            providerRef: doc?.id != null ? String(doc.id) : undefined,
            score: 80 - index + (rawPreview ? 8 : 0),
        };
    }).filter(Boolean).slice(0, limit);
}

function mediaCandidate(value, baseUrl) {
    if (typeof value === 'string')
        return safeMediaUrl(value, baseUrl);
    if (value && typeof value === 'object') {
        const record = value;
        for (const key of ['url', 'src', 'pic_medium', 'picMedium', 'pic', 'image', 'imageUrl', 'cover', 'thumbnail', 'thumb']) {
            const resolved = safeMediaUrl(record[key], baseUrl);
            if (resolved) return resolved;
        }
    }
    return undefined;
}
function normalizedComparable(value) {
    return normalizeSearchText(String(value || ''))
        .replace(/\b(ao vivo|live|acustico|acústico|remaster(?:ed)?|versao|versão|radio edit|single|official|video|clipe)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function titleSimilarity(a, b) {
    const left = normalizedComparable(a);
    const right = normalizedComparable(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    const leftTerms = new Set(left.split(/\s+/).filter(Boolean));
    const rightTerms = new Set(right.split(/\s+/).filter(Boolean));
    const intersection = [...leftTerms].filter(term => rightTerms.has(term)).length;
    return intersection / Math.max(leftTerms.size, rightTerms.size, 1);
}
function objectLabel(record) {
    if (!record || typeof record !== 'object') return '';
    for (const key of ['albumName', 'album', 'name', 'title', 'desc', 'description']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'object' && typeof value.name === 'string' && value.name.trim()) return value.name.trim();
    }
    return '';
}
function recordImage(record, baseUrl) {
    if (!record || typeof record !== 'object') return undefined;
    for (const key of ['cover', 'coverUrl', 'pic_medium', 'picMedium', 'pic', 'pic_small', 'image', 'imageUrl', 'thumbnail', 'thumb', 'artwork']) {
        const resolved = mediaCandidate(record[key], baseUrl);
        if (resolved) return resolved;
    }
    return undefined;
}
function recordContainsTrack(record, title, depth = 0) {
    if (!record || depth > 7) return false;
    const target = normalizedComparable(title);
    if (!target) return false;
    if (typeof record === 'string') return titleSimilarity(record, target) >= 0.90;
    if (Array.isArray(record)) return record.some(value => recordContainsTrack(value, title, depth + 1));
    if (typeof record !== 'object') return false;
    for (const [key, value] of Object.entries(record)) {
        if (['name', 'title', 'mus', 'trackName', 'song', 'songName'].includes(key) && typeof value === 'string' && titleSimilarity(value, title) >= 0.90)
            return true;
    }
    return Object.values(record).some(value => recordContainsTrack(value, title, depth + 1));
}
function extractDiscographyMatches(data, titles, baseUrl) {
    const targets = [...new Set(titles.map(value => String(value || '').trim()).filter(Boolean))];
    const matches = new Map();
    const visit = (node, inheritedAlbum = '', inheritedImage, depth = 0) => {
        if (!node || depth > 9 || matches.size >= targets.length) return;
        if (Array.isArray(node)) {
            node.slice(0, 160).forEach(value => visit(value, inheritedAlbum, inheritedImage, depth + 1));
            return;
        }
        if (typeof node !== 'object') return;
        const label = objectLabel(node);
        const image = recordImage(node, baseUrl) || inheritedImage;
        const albumLike = label && !targets.some(title => titleSimilarity(label, title) >= 0.94) ? label : inheritedAlbum;
        for (const title of targets) {
            if (matches.has(title)) continue;
            if ((albumLike || image) && recordContainsTrack(node, title)) {
                const album = albumLike || inheritedAlbum || undefined;
                matches.set(title, { album, imageUrl: image });
            }
        }
        for (const value of Object.values(node)) visit(value, albumLike || inheritedAlbum, image, depth + 1);
    };
    visit(data);
    return matches;
}
function extractDiscographyHtmlMatches(html, artistSlug, titles, baseUrl) {
    const targets = [...new Set(titles.map(value => String(value || '').trim()).filter(Boolean))];
    const matches = new Map();
    if (!html || !targets.length) return matches;
    let $;
    try { $ = load(html, { scriptingEnabled: false }); }
    catch { return matches; }
    let currentAlbum = '';
    let currentImage;
    const normalizedArtistSlug = String(artistSlug || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    $('a[href]').each((_index, element) => {
        if (matches.size >= targets.length) return false;
        const rawHref = String($(element).attr('href') || '').trim();
        if (!rawHref) return undefined;
        let url;
        try { url = new URL(rawHref, baseUrl); } catch { return undefined; }
        const path = url.pathname.replace(/\/{2,}/g, '/');
        const lowerPath = path.toLowerCase();
        const text = normalizeLyricsText($(element).text().replace(/\s+/g, ' ')).trim();
        const img = $(element).find('img').first();
        const imageAlt = normalizeLyricsText(String(img.attr('alt') || img.attr('title') || '')).trim();
        const rawImage = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original');

        // A página pública atual lista a capa imediatamente antes do título/faixas do álbum.
        // Ex.: /artista/discografia/nome-do-album.webp
        if (lowerPath.includes(`/${normalizedArtistSlug}/discografia/`) && /\.(?:webp|jpe?g|png|avif)$/i.test(path)) {
            currentImage = safeMediaUrl(url.toString(), baseUrl) || mediaCandidate(rawImage, baseUrl);
            if (imageAlt && !/^image$/i.test(imageAlt)) currentAlbum = imageAlt.replace(/^image:\s*/i, '').trim() || currentAlbum;
            return undefined;
        }
        // Link canônico do álbum: /artista/discografia/album.html
        if (lowerPath.includes(`/${normalizedArtistSlug}/discografia/`) && /\.html$/i.test(path)) {
            const albumLabel = text || imageAlt;
            if (albumLabel) {
                // Se não houve uma capa imediatamente antes deste álbum, não herda a capa
                // do bloco anterior. Quando a imagem anterior pertence ao mesmo álbum, preserva.
                if (currentAlbum && normalizedComparable(currentAlbum) !== normalizedComparable(albumLabel)) currentImage = undefined;
                currentAlbum = albumLabel;
            }
            if (!currentImage) currentImage = mediaCandidate(rawImage, baseUrl);
            return undefined;
        }
        // Faixas ficam em /artista/musica.html. Usa o href real e não inventa slug.
        const parts = path.split('/').filter(Boolean);
        if (parts.length !== 2 || parts[0].toLowerCase() !== normalizedArtistSlug || !/\.html$/i.test(parts[1]))
            return undefined;
        const trackTitle = text.replace(/^\s*\d{1,3}[.)-]?\s*/, '').trim();
        if (!trackTitle) return undefined;
        for (const title of targets) {
            if (matches.has(title) || titleSimilarity(trackTitle, title) < 0.90) continue;
            matches.set(title, {
                album: currentAlbum || undefined,
                imageUrl: currentImage,
                sourceUrl: url.toString(),
            });
        }
        return undefined;
    });
    return matches;
}

function artistProfileMetadata(data, baseUrl) {
    const artist = data?.artist || data?.art || data?.band || data;
    if (!artist || typeof artist !== 'object') return {};
    const id = String(artist.id || artist.bandID || artist.bandId || '').trim() || undefined;
    const imageUrl = recordImage(artist, baseUrl) || recordImage(data, baseUrl);
    return { id, imageUrl };
}
function imageApiMetadata(data, baseUrl) {
    const images = Array.isArray(data?.images) ? data.images : Array.isArray(data?.image) ? data.image : [];
    for (const entry of images) {
        const imageUrl = mediaCandidate(entry, baseUrl);
        if (imageUrl) return { imageUrl };
    }
    return {};
}
/**
 * Enriquece músicas usando somente o Vagalume já ativo no Proxy.
 * Ordem: discografia (capa+álbum exatos) -> perfil/imagens do artista (fallback visual).
 */
export async function fetchVagalumeTrackMetadata(webBaseUrl, apiBaseUrl, apiKey, artist, titles, timeoutMs) {
    const cleanArtist = String(artist || '').trim();
    const cleanTitles = [...new Set((Array.isArray(titles) ? titles : [titles]).map(value => String(value || '').trim()).filter(Boolean))];
    if (!cleanArtist || !cleanTitles.length) return new Map();
    const webBase = webBaseUrl.replace(/\/+$/, '');
    const apiBase = apiBaseUrl.replace(/\/+$/, '');
    const webHost = new URL(webBase).hostname;
    const apiHost = new URL(apiBase).hostname;
    const slug = slugifySourcePart(cleanArtist);
    if (!slug) return new Map();
    const budget = totalBudget(timeoutMs);
    const output = new Map();
    let artistImage;
    let artistId;

    // 1) JSON compacto da discografia quando disponível.
    try {
        const discBudget = budget.next(1600);
        if (discBudget) {
            const raw = await fetchText(`${webBase}/${slug}/discografia/index.js`, discBudget, { Accept: 'application/json,text/plain,*/*' }, [webHost]);
            const parsed = JSON.parse(raw);
            for (const [title, metadata] of extractDiscographyMatches(parsed, cleanTitles, webBase)) output.set(title, metadata);
        }
    }
    catch { /* a página pública abaixo é o fallback estável */ }

    // 2) Página pública de álbuns: é o contrato humano atual do Vagalume e contém
    // capas, nomes de álbuns e links reais das faixas. Não depende do index.js legado.
    if (output.size < cleanTitles.length) {
        try {
            const htmlBudget = budget.next(1900);
            if (htmlBudget) {
                const html = await fetchText(`${webBase}/${slug}/discografia/`, htmlBudget, {}, [webHost]);
                const htmlMatches = extractDiscographyHtmlMatches(html, slug, cleanTitles.filter(title => !output.has(title)), webBase);
                for (const [title, metadata] of htmlMatches) output.set(title, metadata);
            }
        }
        catch { /* perfil do artista abaixo ainda fornece fallback visual */ }
    }

    try {
        const profileBudget = budget.next(1500);
        if (profileBudget) {
            const raw = await fetchText(`${webBase}/${slug}/index.js`, profileBudget, { Accept: 'application/json,text/plain,*/*' }, [webHost]);
            const parsed = JSON.parse(raw);
            const profile = artistProfileMetadata(parsed, webBase);
            artistImage = profile.imageUrl;
            artistId = profile.id;
        }
    }
    catch { /* image.php abaixo é opcional */ }

    if (!artistImage && artistId && String(apiKey || '').trim()) {
        try {
            const imageBudget = budget.next(1300);
            if (imageBudget) {
                const url = new URL('/image.php', apiBase);
                url.searchParams.set('bandID', artistId);
                url.searchParams.set('limit', '3');
                url.searchParams.set('apikey', String(apiKey).trim());
                const raw = await fetchText(url.toString(), imageBudget, { Accept: 'application/json' }, [apiHost]);
                artistImage = imageApiMetadata(JSON.parse(raw), apiBase).imageUrl;
            }
        }
        catch { /* mantém placeholder local se a galeria estiver indisponível */ }
    }

    for (const title of cleanTitles) {
        const current = output.get(title) || {};
        output.set(title, {
            album: current.album,
            imageUrl: current.imageUrl || artistImage,
            imageKind: current.imageUrl ? 'album' : (artistImage ? 'artist' : undefined),
        });
    }
    return output;
}

export async function searchVagalumeArtistPage(webBaseUrl, artistOrQuery, limit, timeoutMs) {
    const normalizedBase = webBaseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    const slug = slugifySourcePart(String(artistOrQuery || '').trim());
    if (!slug)
        return [];
    const pageUrl = `${normalizedBase}/${slug}/`;
    const html = await fetchText(pageUrl, timeoutMs, {}, [baseHost]);
    const $ = load(html, { scriptingEnabled: false });
    const h1 = normalizeLyricsText($('h1').first().text().replace(/\s+/g, ' ')).trim();
    const queryNorm = normalizeSearchText(artistOrQuery);
    const artistNorm = normalizeSearchText(h1);
    // Evita transformar um título de música em uma página homônima não relacionada.
    if (!h1 || (!artistNorm.includes(queryNorm) && !queryNorm.includes(artistNorm)))
        return [];
    const seen = new Set();
    const results = [];
    $('a[href]').each((_index, element) => {
        if (results.length >= Math.max(limit * 3, limit))
            return false;
        const rawHref = $(element).attr('href') || '';
        let url;
        try { url = new URL(rawHref, normalizedBase); } catch { return undefined; }
        if (!isAllowedLyricsUrl(url.toString(), ['vagalume.com.br']))
            return undefined;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 2 || !/\.html$/i.test(parts[1]))
            return undefined;
        const canonical = `${url.origin}${url.pathname}`;
        if (seen.has(canonical))
            return undefined;
        const title = normalizeLyricsText($(element).text().replace(/^\s*\d{1,3}[.)-]?\s*/, '').replace(/\s+/g, ' ')).trim();
        if (!title || title.length < 2 || title.length > 180)
            return undefined;
        if (/^(play|letra|tradu[cç][aã]o|cifra|editar|enviar|ver tudo|top)$/i.test(title))
            return undefined;
        seen.add(canonical);
        results.push({
            id: stableId('vagalume', canonical),
            title,
            artist: h1,
            preview: `Música de ${h1}.`,
            source: 'vagalume',
            sourceUrl: canonical,
            score: 88 - Math.min(results.length, 30),
        });
        return undefined;
    });
    return results.slice(0, limit);
}

export async function searchVagalumeWeb(webBaseUrl, query, artist, limit, timeoutMs) {
    const normalizedBase = webBaseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    const budget = totalBudget(timeoutMs);
    const searchUrls = [];
    const artistSlug = slugifySourcePart(artist);
    if (artistSlug)
        searchUrls.push(`${normalizedBase}/${artistSlug}/`);
    searchUrls.push(`${normalizedBase}/search/?q=${encodeURIComponent(query.trim())}`);
    let lastError;
    for (const url of searchUrls) {
        const attemptBudget = budget.next(1900);
        if (!attemptBudget)
            break;
        try {
            const html = await fetchText(url, attemptBudget, {}, [baseHost]);
            const results = parseProviderSearchHtml(html, normalizedBase, query, 'vagalume', limit);
            if (results.length)
                return results;
        }
        catch (error) {
            lastError = error;
        }
    }
    // Não inventa URL /artista/titulo.html: slugs aparentemente válidos podem resolver para
    // outra canção. A recuperação canônica é feita pelos links reais da página do artista.
    if (lastError)
        throw lastError;
    return [];
}
function pageStructuredMedia(html, sourceUrl) {
    let $;
    try {
        $ = load(html, { scriptingEnabled: false });
    }
    catch {
        return {};
    }
    let imageUrl;
    let album;
    $('script[type="application/ld+json"]').slice(0, 30).each((_index, element) => {
        if (imageUrl && album)
            return false;
        const raw = $(element).text().trim();
        if (!raw || raw.length > 600000)
            return undefined;
        const visit = (node, depth = 0) => {
            if (!node || depth > 10 || (imageUrl && album))
                return;
            if (Array.isArray(node)) {
                node.slice(0, 80).forEach(value => visit(value, depth + 1));
                return;
            }
            if (typeof node !== 'object')
                return;
            const record = node;
            const image = record.image?.url || record.image || record.thumbnailUrl || record.thumbnail || record.contentUrl;
            const albumValue = record.inAlbum?.name || record.album?.name || record.album;
            if (!imageUrl && typeof image === 'string')
                imageUrl = safeMediaUrl(image, new URL(sourceUrl));
            if (!album && typeof albumValue === 'string')
                album = albumValue.trim();
            Object.values(record).slice(0, 120).forEach(value => visit(value, depth + 1));
        };
        try {
            visit(JSON.parse(raw));
        }
        catch { /* JSON-LD malformado */ }
        return undefined;
    });
    return { imageUrl, album };
}
export async function fetchScrapedSong(sourceUrl, source, timeoutMs) {
    if (source !== 'vagalume') throw new Error('Fonte web não autorizada');
    const allowedHosts = ['vagalume.com.br'];
    if (!isAllowedLyricsUrl(sourceUrl, allowedHosts))
        throw new Error('URL de letra não autorizada');
    const html = await fetchText(sourceUrl, timeoutMs, {}, allowedHosts);
    const extraction = extractLyricsAdvanced(html);
    if (!extraction)
        return null;
    const { title, artist } = inferTitleArtist(html, sourceUrl);
    const structured = pageStructuredMedia(html, sourceUrl);
    const album = metaContent(html, 'music:album') || structured.album || undefined;
    const imageUrl = safeMediaUrl(metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || structured.imageUrl || '', new URL(sourceUrl));
    return {
        id: stableId('vagalume', sourceUrl),
        title,
        artist,
        album,
        imageUrl,
        fullLyrics: extraction.text,
        source,
        sourceUrl,
        extractionMethod: extraction.method,
        extraction: extraction.diagnostics,
        fetchedAt: new Date().toISOString(),
    };
}

export async function fetchLrclibSong(baseUrl, providerRef, artist, title, timeoutMs) {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    const id = String(providerRef || '').replace(/^lrclib-/, '').trim();
    let doc = null;
    if (/^\d+$/.test(id)) {
        const url = new URL(`/api/get/${encodeURIComponent(id)}`, normalizedBase);
        const raw = await fetchText(url.toString(), timeoutMs, {
            Accept: 'application/json',
            'User-Agent': PROXY_API_USER_AGENT,
            'Lrclib-Client': PROXY_API_USER_AGENT,
        }, [baseHost]);
        doc = JSON.parse(raw);
    }
    else if (String(title || '').trim()) {
        const matches = await searchLrclib(normalizedBase, '', artist, title, 5, timeoutMs);
        if (!matches.length) return null;
        const match = matches[0];
        const resolvedId = String(match.providerRef || '').trim();
        if (!/^\d+$/.test(resolvedId)) return null;
        const url = new URL(`/api/get/${encodeURIComponent(resolvedId)}`, normalizedBase);
        const raw = await fetchText(url.toString(), timeoutMs, {
            Accept: 'application/json',
            'User-Agent': PROXY_API_USER_AGENT,
            'Lrclib-Client': PROXY_API_USER_AGENT,
        }, [baseHost]);
        doc = JSON.parse(raw);
    }
    if (!doc || doc?.instrumental === true)
        return null;
    const fullLyrics = normalizeLyricsText(String(doc?.plainLyrics || '').trim()) || plainFromSyncedLyrics(doc?.syncedLyrics || '');
    if (!fullLyrics)
        return null;
    const resolvedId = String(doc?.id ?? id).trim();
    const resolvedTitle = String(doc?.trackName || doc?.name || title || '').trim();
    const resolvedArtist = String(doc?.artistName || artist || '').trim();
    if (!resolvedTitle || !resolvedArtist)
        return null;
    const lineCount = fullLyrics.split('\n').filter(Boolean).length;
    const wordCount = fullLyrics.split(/\s+/).filter(Boolean).length;
    return {
        id: `lrclib-${resolvedId || stableId('lrclib', `${resolvedArtist}:${resolvedTitle}`)}`,
        title: resolvedTitle,
        artist: resolvedArtist,
        album: String(doc?.albumName || '').trim() || undefined,
        fullLyrics,
        source: 'lrclib',
        sourceUrl: resolvedId ? `${normalizedBase}/api/get/${encodeURIComponent(resolvedId)}` : undefined,
        extractionMethod: 'api',
        extraction: {
            engine: EXTRACTION_ENGINE_NAME,
            version: EXTRACTION_ENGINE_VERSION,
            method: 'api',
            parser: 'lrclib-json',
            candidateCount: 1,
            quality: {
                score: 100,
                confidence: 0.995,
                charCount: fullLyrics.length,
                wordCount,
                lineCount,
                distinctLineRatio: 1,
                duplicateLineRatio: 0,
                averageLineLength: lineCount ? Number((fullLyrics.length / lineCount).toFixed(2)) : 0,
                linkDensity: 0,
            },
            signals: ['provider-api', 'lrclib'],
            warnings: [],
        },
        fetchedAt: new Date().toISOString(),
    };
}

export async function fetchVagalumeSong(baseUrl, apiKey, artist, title, timeoutMs) {
    if (!apiKey.trim() || !artist.trim() || !title.trim())
        return null;
    const url = new URL('/search.php', baseUrl);
    url.searchParams.set('art', artist);
    url.searchParams.set('mus', title);
    url.searchParams.set('apikey', apiKey);
    const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': PROXY_API_USER_AGENT },
        redirect: 'error',
        signal: abortSignal(timeoutMs),
    });
    if (!response.ok)
        throw new Error(`Vagalume HTTP ${response.status}`);
    const data = await response.json();
    const mus = data?.mus?.[0];
    const lyrics = typeof mus?.text === 'string' ? normalizeLyricsText(mus.text) : '';
    if (!lyrics)
        return null;
    const resolvedArtist = String(data?.art?.name || artist);
    const resolvedTitle = String(mus?.name || title);
    const sourceUrl = typeof mus?.url === 'string' ? mus.url : undefined;
    const album = typeof mus?.album?.name === 'string' ? mus.album.name : (typeof mus?.album === 'string' ? mus.album : undefined);
    const imageUrl = safeMediaUrl(String(mus?.album?.pic || mus?.image || data?.art?.pic_medium || data?.art?.pic_small || data?.art?.pic || ''), baseUrl);
    const lineCount = lyrics.split('\n').filter(Boolean).length;
    const wordCount = lyrics.split(/\s+/).filter(Boolean).length;
    return {
        id: stableId('vagalume', sourceUrl || `${resolvedArtist}:${resolvedTitle}`),
        title: resolvedTitle,
        artist: resolvedArtist,
        album,
        imageUrl,
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
