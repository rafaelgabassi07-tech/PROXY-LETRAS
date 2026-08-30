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
        .replace(/\s*[-|]\s*(letras(?:\.mus\.br|\.com)?|genius|vagalume).*$/i, '')
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
function buildAnchorResult(rawHref, rawLabel, base, terms, seen, contextText = '', imageUrl) {
    const label = normalizeLyricsText(rawLabel.replace(/\s+/g, ' '));
    if (label.length < 3 || label.length > 220)
        return null;
    let url;
    try {
        url = new URL(decodeHtml(rawHref), base);
    }
    catch {
        return null;
    }
    if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, ''))
        return null;
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2 || parts.length > 5 || NAV_PATHS.has(parts[0]))
        return null;
    if (/^(traducao|cifra|album|discografia|fotos|biografia|playlists?|videos?)$/i.test(parts[1] || ''))
        return null;
    url.search = '';
    url.hash = '';
    const canonical = url.toString();
    if (seen.has(canonical))
        return null;
    const metadataSearchable = normalizeSearchText(`${label} ${parts.join(' ')}`);
    const contextualSearchable = normalizeSearchText(contextText);
    const metadataMatches = terms.filter(term => metadataSearchable.includes(term)).length;
    const contextMatches = terms.filter(term => contextualSearchable.includes(term)).length;
    const matchedTerms = Math.max(metadataMatches, contextMatches);
    // Para busca por trecho, o título/URL naturalmente não contém as palavras pesquisadas.
    // Aceitamos o resultado quando o próprio card/contexto retornado pela fonte contém parte do trecho.
    const minimumContextMatches = terms.length >= 5 ? Math.min(3, Math.ceil(terms.length * 0.35)) : 1;
    const discoveryOnly = terms.length >= 4 && metadataMatches === 0 && contextMatches < minimumContextMatches;
    // Em buscas por trecho, páginas de resultado podem omitir o trecho e renderizar apenas título/artista.
    // Mantemos esses links de música como candidatos de descoberta, mas lyricsService só os expõe
    // depois de validar a letra completa. Para buscas curtas/título, o filtro continua estrito.
    if (terms.length && !discoveryOnly && metadataMatches === 0 && contextMatches < minimumContextMatches)
        return null;
    seen.add(canonical);
    const split = label.split(/\s[-–—|]\s|\s+por\s+/i).map(part => part.trim()).filter(Boolean);
    const title = split[0] || label;
    const artist = split[1] || parts[0].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    const exactBonus = terms.length && metadataMatches === terms.length ? 18 : 0;
    const preview = contextMatches >= minimumContextMatches
        ? compactPreview(contextText, terms.join(' '))
        : '';
    return {
        id: stableId('letras', canonical),
        title,
        artist,
        preview: preview || 'Resultado encontrado na fonte de letras.',
        source: 'letras_mus_br',
        sourceUrl: canonical,
        imageUrl,
        discoveryOnly,
        score: (discoveryOnly ? 34 : 58) + metadataMatches * 8 + contextMatches * 5 + exactBonus,
    };
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
function parseAnchorResultsWithParser(html, base, terms, seen, parser, maxCandidates) {
    const results = [];
    const $ = parser === 'parse5'
        ? load(html, { scriptingEnabled: false })
        : load(html, { xml: { xmlMode: false, decodeEntities: true } });
    $('a[href]').each((_index, element) => {
        if (results.length >= maxCandidates)
            return false;
        const label = [$(element).text(), $(element).attr('aria-label'), $(element).attr('title')]
            .filter(Boolean)
            .join(' ');
        const context = searchCardContext($, element, base);
        const result = buildAnchorResult($(element).attr('href') || '', label, base, terms, seen, context.contextText, context.imageUrl);
        if (result)
            results.push(result);
        return undefined;
    });
    return results;
}
function collectStructuredSearchResults(html, base, terms, seen, limit) {
    const results = [];
    let $;
    try {
        $ = load(html, { scriptingEnabled: false });
    }
    catch {
        return results;
    }
    const visit = (node, depth = 0) => {
        if (depth > 16 || node == null || results.length >= limit)
            return;
        if (Array.isArray(node)) {
            for (const item of node.slice(0, 700))
                visit(item, depth + 1);
            return;
        }
        if (typeof node !== 'object')
            return;
        const record = node;
        const rawUrl = record.url ?? record.href ?? record.path ?? record.share_url ?? record.songUrl;
        const rawTitle = record.title ?? record.name ?? record.songTitle ?? record.song_name;
        const rawImage = record.image ?? record.imageUrl ?? record.image_url ?? record.thumbnail ?? record.cover ?? record.coverArt ?? record.cover_art_url ?? record.song_art_image_thumbnail_url ?? record.song_art_image_url;
        const rawAlbum = record.album?.name ?? record.album ?? record.albumName ?? record.album_name;
        const rawExcerpt = record.excerpt ?? record.snippet ?? record.preview ?? record.highlight ?? record.text;
        const artistObject = record.artist ?? record.primary_artist ?? record.author ?? record.artistName;
        const rawArtist = typeof artistObject === 'string'
            ? artistObject
            : artistObject && typeof artistObject === 'object'
                ? (artistObject.name ?? artistObject.title)
                : undefined;
        if (typeof rawUrl === 'string' && typeof rawTitle === 'string') {
            const label = rawArtist ? `${rawTitle} - ${String(rawArtist)}` : rawTitle;
            const built = buildAnchorResult(rawUrl, label, base, terms, seen, typeof rawExcerpt === 'string' ? rawExcerpt : '', safeMediaUrl(typeof rawImage === 'string' ? rawImage : '', base));
            if (built)
                results.push({
                    ...built,
                    album: typeof rawAlbum === 'string' ? rawAlbum : built.album,
                    preview: typeof rawExcerpt === 'string' && rawExcerpt.trim() ? compactPreview(rawExcerpt, terms.join(' ')) : built.preview,
                    score: built.score + 6,
                });
        }
        for (const value of Object.values(record).slice(0, 900))
            visit(value, depth + 1);
    };
    $('script').slice(0, 100).each((_index, element) => {
        if (results.length >= limit)
            return false;
        const type = ($(element).attr('type') || '').toLowerCase();
        const id = ($(element).attr('id') || '').toLowerCase();
        if (!type.includes('json') && !/__next_data__|__nuxt|apollo|initial_state|hydration/.test(id))
            return undefined;
        const raw = $(element).text().trim();
        if (!raw || raw.length > 1_500_000)
            return undefined;
        try {
            visit(JSON.parse(raw));
        }
        catch { /* script não é JSON puro */ }
        return undefined;
    });
    return results;
}
function parseAnchorResults(html, baseUrl, query, limit) {
    const base = new URL(baseUrl);
    const terms = meaningfulTerms(query);
    const results = [];
    const seen = new Set();
    for (const parser of ['parse5', 'htmlparser2']) {
        try {
            results.push(...parseAnchorResultsWithParser(html, base, terms, seen, parser, limit * 8));
        }
        catch {
            // O segundo parser e os fallbacks estruturados continuam disponíveis.
        }
    }
    if (results.length < limit) {
        results.push(...collectStructuredSearchResults(html, base, terms, seen, limit * 6));
    }
    if (results.length < limit) {
        const pattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = pattern.exec(html)) !== null && results.length < limit * 10) {
            const result = buildAnchorResult(match[2], htmlToText(match[4]), base, terms, seen);
            if (result)
                results.push(result);
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
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
    const allowedHosts = source === 'genius' ? ['genius.com'] : ['vagalume.com.br'];
    if (!isAllowedLyricsUrl(url.toString(), allowedHosts))
        return null;
    if (source === 'vagalume' && !/\.html$/i.test(url.pathname))
        return null;
    if (source === 'genius' && !/-lyrics\/?$/i.test(url.pathname))
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
    if (source === 'genius' && /lyrics/i.test(title))
        title = title.replace(/\s+lyrics\s*$/i, '').trim();
    const preview = contextMatches >= minimumContextMatches ? compactPreview(contextText, query) : '';
    return {
        id: stableId(source, canonical),
        title,
        artist: artist || 'Artista',
        preview: preview || (source === 'vagalume'
            ? 'Resultado encontrado no Vagalume.'
            : 'Resultado encontrado no Genius.'),
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
export async function searchGeniusWeb(webBaseUrl, query, limit, timeoutMs) {
    const normalizedBase = webBaseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    // A busca web JSON é preferida ao HTML porque /search pode ser renderizado no cliente.
    // Mantemos dois formatos observados do próprio Genius para sobreviver a alterações incrementais.
    const jsonEndpoints = [
        `${normalizedBase}/api/search/multi?per_page=${Math.max(1, Math.min(limit, 10))}&q=${encodeURIComponent(query.trim())}`,
        `${normalizedBase}/api/search/song?page=1&q=${encodeURIComponent(query.trim())}`,
    ];
    let endpointError;
    for (const endpoint of jsonEndpoints) {
        try {
            const raw = await fetchText(endpoint, timeoutMs, { Accept: 'application/json' }, [baseHost]);
            const data = JSON.parse(raw);
            const response = data?.response || data;
            const sections = Array.isArray(response?.sections) ? response.sections : [];
            const sectionHits = sections.flatMap((section) => Array.isArray(section?.hits) ? section.hits : []);
            const directHits = Array.isArray(response?.hits) ? response.hits : [];
            const hits = sectionHits.length ? sectionHits : directHits;
            const results = hits.map((hit, index) => {
                const result = hit?.result || hit;
                const hitType = String(hit?.type || result?.type || '').toLowerCase();
                if (hitType && !['song', 'lyric', 'lyrics'].includes(hitType))
                    return null;
                const rawSourceUrl = result?.url || result?.path;
                const sourceUrl = rawSourceUrl ? new URL(String(rawSourceUrl), normalizedBase).toString() : '';
                if (!result?.title || !sourceUrl || !isAllowedLyricsUrl(sourceUrl, ['genius.com']))
                    return null;
                const highlights = Array.isArray(hit?.highlights) ? hit.highlights : [];
                const highlight = highlights
                    .map(value => compactPreview(value?.value || value?.text || '', query))
                    .find(Boolean) || '';
                const imageUrl = safeMediaUrl(String(result.song_art_image_thumbnail_url || result.song_art_image_url || result.header_image_thumbnail_url || result.header_image_url || result.primary_artist?.image_url || ''), normalizedBase);
                const album = typeof result.album?.name === 'string' ? result.album.name : undefined;
                return {
                    id: `genius-web-${String(result.id || index)}`,
                    title: String(result.title),
                    artist: String(result.artist_names || result.primary_artist?.name || result.artist?.name || 'Artista'),
                    album,
                    imageUrl,
                    preview: highlight || 'Resultado encontrado no Genius.',
                    source: 'genius',
                    sourceUrl,
                    providerRef: result.id != null ? String(result.id) : undefined,
                    score: 78 - index + (highlight ? 8 : 0),
                };
            }).filter(Boolean).slice(0, limit);
            if (results.length)
                return results;
        }
        catch (error) {
            endpointError = error;
        }
    }
    try {
        const html = await fetchText(`${normalizedBase}/search?q=${encodeURIComponent(query.trim())}`, timeoutMs, {}, [baseHost]);
        const results = parseProviderSearchHtml(html, normalizedBase, query, 'genius', limit);
        if (results.length)
            return results;
    }
    catch (error) {
        if (!endpointError)
            endpointError = error;
    }
    if (endpointError)
        throw endpointError;
    return [];
}
export async function searchVagalumeExcerpt(apiBaseUrl, webBaseUrl, query, limit, timeoutMs) {
    const apiBase = apiBaseUrl.replace(/\/+$/, '');
    const apiHost = new URL(apiBase).hostname;
    const webBase = webBaseUrl.replace(/\/+$/, '');
    const url = `${apiBase}/search.excerpt?q=${encodeURIComponent(query.trim())}&limit=${Math.max(1, Math.min(limit, 25))}`;
    const raw = await fetchText(url, timeoutMs, { Accept: 'application/json' }, [apiHost]);
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
export async function searchVagalumeWeb(webBaseUrl, query, artist, limit, timeoutMs) {
    const normalizedBase = webBaseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    const searchUrls = [];
    const artistSlug = slugifySourcePart(artist);
    if (artistSlug)
        searchUrls.push(`${normalizedBase}/${artistSlug}/`);
    searchUrls.push(`${normalizedBase}/search/?q=${encodeURIComponent(query.trim())}`);
    let lastError;
    for (const url of searchUrls) {
        try {
            const html = await fetchText(url, timeoutMs, {}, [baseHost]);
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
export async function searchLetrasMusBr(baseUrl, query, limit, timeoutMs) {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const baseHost = new URL(normalizedBase).hostname;
    const q = encodeURIComponent(query.trim());
    const searchUrls = [
        `${normalizedBase}/?q=${q}`,
        `${normalizedBase}/buscar/?q=${q}`,
        `${normalizedBase}/busca/?q=${q}`,
    ];
    let lastError;
    for (const url of searchUrls) {
        try {
            const html = await fetchText(url, timeoutMs, {}, [baseHost]);
            const parsed = parseAnchorResults(html, normalizedBase, query, limit);
            if (parsed.length)
                return parsed;
        }
        catch (error) {
            lastError = error;
        }
    }
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
    const allowedHosts = source === 'genius' ? ['genius.com'] : source === 'vagalume' ? ['vagalume.com.br'] : ['letras.mus.br', 'letras.com'];
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
        id: stableId(source === 'genius' ? 'genius' : source === 'vagalume' ? 'vagalume' : 'letras', sourceUrl),
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
export async function searchGenius(baseUrl, accessToken, query, limit, timeoutMs) {
    if (!accessToken.trim())
        return [];
    const url = `${baseUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'User-Agent': PROXY_API_USER_AGENT },
        redirect: 'error',
        signal: abortSignal(timeoutMs),
    });
    if (!response.ok)
        throw new Error(`Genius HTTP ${response.status}`);
    const data = await response.json();
    const hits = Array.isArray(data?.response?.hits) ? data.response.hits : [];
    return hits
        .map((hit, index) => {
        const result = hit?.result;
        if (!result?.url || !result?.title || !isAllowedLyricsUrl(String(result.url), ['genius.com']))
            return null;
        const highlight = Array.isArray(hit?.highlights)
            ? hit.highlights.map(value => compactPreview(value?.value || value?.text || '', query)).find(Boolean) || ''
            : '';
        return {
            id: `genius-${String(result.id || index)}`,
            title: String(result.title),
            artist: String(result.primary_artist?.name || result.artist_names || 'Artista'),
            album: typeof result.album?.name === 'string' ? result.album.name : undefined,
            imageUrl: safeMediaUrl(String(result.song_art_image_thumbnail_url || result.song_art_image_url || result.header_image_thumbnail_url || result.primary_artist?.image_url || ''), baseUrl),
            preview: highlight || 'Resultado encontrado no Genius.',
            source: 'genius',
            sourceUrl: String(result.url),
            providerRef: result.id ? String(result.id) : undefined,
            score: Math.max(45, 80 - index * 2) + (highlight ? 8 : 0),
        };
    })
        .filter(Boolean)
        .slice(0, limit);
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
