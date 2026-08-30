/**
 * Motor de busca e obtenção de letras.
 * Estratégia: banco local + duas fontes remotas adaptativas (Letras/Vagalume),
 * cache limitado, fallback sob demanda e recuperação exata via sourceUrl.
 */
import { LRUCache } from 'lru-cache';
import { GOSPEL_DATABASE } from './gospelDatabase.js';
import { getProxyConfig } from './proxyConfig.js';
import { fetchScrapedSong, fetchVagalumeSong, searchLetrasMusBr, searchVagalumeExcerpt, searchVagalumeWeb, } from './scrapers.js';
const memoryCache = new LRUCache({
    max: 5000,
    ttlAutopurge: true,
    updateAgeOnGet: true,
});
const providerHealth = new Map();
const DEFAULT_SEARCH_BUDGET_MS = 5800;
const DEFAULT_GET_BUDGET_MS = 8500;
function searchBudgetMs() {
    const configured = Number(process.env.LYRICS_SEARCH_BUDGET_MS || DEFAULT_SEARCH_BUDGET_MS);
    return Math.max(3200, Math.min(Number.isFinite(configured) ? configured : DEFAULT_SEARCH_BUDGET_MS, 9_000));
}
function remainingBudget(deadline, maxMs) {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining < 900)
        return 0;
    return Math.max(900, Math.min(maxMs, remaining));
}
function getBudgetMs() {
    const configured = Number(process.env.LYRICS_GET_BUDGET_MS || DEFAULT_GET_BUDGET_MS);
    return Math.max(5000, Math.min(Number.isFinite(configured) ? configured : DEFAULT_GET_BUDGET_MS, 12_000));
}
function cacheKey(prefix, value) {
    return `${prefix}:${JSON.stringify(value)}`;
}
function reusableSearchCacheEntry(value) {
    return Boolean(value && Array.isArray(value.results) && Number(value.total) > 0 && value.partial !== true);
}
function providerErrorCode(error) {
    const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
    const name = String(error instanceof Error ? error.name : '').toLowerCase();
    if (name.includes('timeout') || name.includes('abort') || message.includes('tempo limite') || message.includes('timeout')) return 'TIMEOUT';
    const http = message.match(/http\s+(\d{3})/i);
    if (http) return `HTTP_${http[1]}`;
    if (message.includes('getaddrinfo') || message.includes('dns') || message.includes('name resolution')) return 'DNS';
    if (message.includes('json')) return 'INVALID_JSON';
    if (message.includes('host não autorizado') || message.includes('host nao autorizado')) return 'HOST_REJECTED';
    return 'UPSTREAM_ERROR';
}
export function getFromCache(key) {
    const config = getProxyConfig();
    if (!config.cache.enabled)
        return null;
    return memoryCache.get(key) ?? null;
}
export function setInCache(key, data, kind = 'default') {
    const config = getProxyConfig();
    if (!config.cache.enabled)
        return;
    const maxEntries = Math.max(20, Math.min(config.cache.maxEntries || 500, 5000));
    while (!memoryCache.has(key) && memoryCache.size >= maxEntries)
        memoryCache.pop();
    const ttlSeconds = kind === 'search'
        ? config.cache.searchTtlSeconds
        : kind === 'lyrics'
            ? config.cache.lyricsTtlSeconds
            : config.cache.ttlSeconds;
    memoryCache.set(key, data, { ttl: Math.max(30, ttlSeconds) * 1000 });
}
export function clearCache() {
    memoryCache.clear();
}
export function resetProviderHealth() {
    providerHealth.clear();
}
export function getCacheStats() {
    return {
        size: memoryCache.size,
        maxEntries: getProxyConfig().cache.maxEntries,
        searchTtlSeconds: getProxyConfig().cache.searchTtlSeconds,
        lyricsTtlSeconds: getProxyConfig().cache.lyricsTtlSeconds,
        keys: Array.from(memoryCache.keys()).slice(0, 50),
    };
}
export function normalizeText(str) {
    if (!str)
        return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
export function cleanLyricsHTML(lyrics) {
    if (!lyrics)
        return '';
    return lyrics
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/<[^>]*>/g, '')
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
export function detectGospelThemes(lyrics) {
    const normalized = normalizeText(lyrics);
    const themes = [];
    const themeKeywords = {
        'Adoração': ['santo', 'gloria', 'adorar', 'trono', 'majestade', 'louvor', 'digno'],
        'Avivamento': ['fogo', 'vento', 'avivamento', 'espirito santo', 'derrama'],
        'Gratidão': ['obrigado', 'grato', 'gratidao', 'bondade', 'fidelidade', 'graca'],
        'Oração & Intimidade': ['lugar secreto', 'presenca', 'ouvir tua voz', 'falar contigo'],
        'Cruz & Redenção': ['cruz', 'sangue', 'calvario', 'ressuscitou', 'salvacao', 'perdao'],
        'Esperança & Fé': ['amanha', 'nao temerei', 'confio', 'milagre', 'impossivel', 'vitoria'],
        'Soberania': ['criacao', 'universo', 'todo poderoso', 'rei dos reis', 'soberano'],
    };
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
        if (keywords.some(keyword => normalized.includes(keyword)))
            themes.push(theme);
    }
    return themes.length ? themes : ['Louvor & Adoração'];
}
export function suggestBibleVerses(lyrics, title) {
    const norm = normalizeText(`${lyrics} ${title}`);
    const verses = [];
    if (norm.includes('presenca') || norm.includes('lugar secreto'))
        verses.push('Salmos 91:1', 'Mateus 6:6');
    if (norm.includes('bondade') || norm.includes('fiel'))
        verses.push('Salmos 23:6', 'Lamentações 3:22-23');
    if (norm.includes('ressusc') || norm.includes('vive'))
        verses.push('João 14:19', '1 Coríntios 15:57');
    if (norm.includes('universo') || norm.includes('criacao'))
        verses.push('Salmos 19:1', 'Romanos 11:33-36');
    if (norm.includes('amor') || norm.includes('graca'))
        verses.push('Romanos 5:8', '1 João 4:19');
    return verses.length ? [...new Set(verses)].slice(0, 4) : ['Salmos 150:6', 'Colossenses 3:16'];
}
export function structureLyricsSections(rawLyrics) {
    const paragraphs = rawLyrics.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
    let verseNumber = 0;
    return paragraphs.map((paragraph, index) => {
        const marker = paragraph.match(/^\s*\[?\s*(refr[aã]o|coro|chorus|ponte|bridge|intro|final|outro|verso\s*\d*)\s*\]?\s*[:\-]?\s*/i)?.[1] || '';
        const normalizedMarker = normalizeText(marker);
        let type = 'verse';
        let label;
        if (/refrao|coro|chorus/.test(normalizedMarker)) {
            type = 'chorus';
            label = 'Refrão';
        }
        else if (/ponte|bridge/.test(normalizedMarker)) {
            type = 'bridge';
            label = 'Ponte';
        }
        else if (/intro/.test(normalizedMarker)) {
            type = 'intro';
            label = 'Introdução';
        }
        else if (/final|outro/.test(normalizedMarker)) {
            type = 'outro';
            label = 'Final';
        }
        else {
            verseNumber += 1;
            label = `Verso ${verseNumber}`;
            // Heurística conservadora para blocos repetidos sem rótulo explícito.
            if (!marker && index > 0 && paragraphs[index - 1] === paragraph) {
                type = 'chorus';
                label = 'Refrão';
            }
        }
        return {
            type,
            label,
            text: paragraph.replace(/^\s*\[.*?\]\s*\n?/, '').trim(),
        };
    });
}
function enrichSong(song) {
    const config = getProxyConfig();
    const fullLyrics = config.filters.cleanHTML ? cleanLyricsHTML(song.fullLyrics) : song.fullLyrics.trim();
    return {
        ...song,
        fullLyrics,
        extractionMethod: song.extractionMethod || (song.source === 'database' ? 'database' : (song.source === 'vagalume' ? 'api' : undefined)),
        theme: song.theme?.length ? song.theme : (config.filters.autoTagThemes ? detectGospelThemes(fullLyrics) : undefined),
        bibleReferences: song.bibleReferences?.length ? song.bibleReferences : suggestBibleVerses(fullLyrics, song.title),
        sections: song.sections?.length ? song.sections : (config.filters.formatVerses ? structureLyricsSections(fullLyrics) : undefined),
    };
}
function providerAvailable(name) {
    const state = providerHealth.get(name);
    return !state || Date.now() >= state.blockedUntil;
}
function providerSucceeded(name) {
    providerHealth.delete(name);
}
function providerFailed(name) {
    const previous = providerHealth.get(name) || { failures: 0, blockedUntil: 0 };
    const failures = previous.failures + 1;
    providerHealth.set(name, {
        failures,
        // Após falhas consecutivas, evita bloquear a UI esperando um provedor indisponível.
        blockedUntil: Date.now() + Math.min(60_000, failures * failures * 2500),
    });
}
function scoreLocalSong(song, params) {
    const query = normalizeText(params.query || '');
    const artist = normalizeText(params.artist || '');
    const title = normalizeText(params.title || '');
    const theme = normalizeText(params.theme || '');
    const songTitle = normalizeText(song.title);
    const songArtist = normalizeText(song.artist);
    const songLyrics = normalizeText(song.fullLyrics);
    const songThemes = (song.theme || []).map(normalizeText);
    let score = 0;
    if (query) {
        if (songTitle === query)
            score += 85;
        else if (songTitle.includes(query))
            score += 60;
        if (songArtist === query)
            score += 70;
        else if (songArtist.includes(query))
            score += 45;
        if (songLyrics.includes(query)) {
            score += 36;
        } else {
            const queryTerms = searchTerms(query);
            const coverage = tokenCoverage(songLyrics, queryTerms);
            if (queryTerms.length >= 4 && coverage >= 0.55)
                score += 30 * coverage;
        }
        if (songThemes.some(value => value.includes(query)))
            score += 30;
    }
    if (artist && songArtist.includes(artist))
        score += 55;
    if (title && songTitle.includes(title))
        score += 55;
    if (theme && songThemes.some(value => value.includes(theme)))
        score += 35;
    if (!query && !artist && !title && !theme)
        score = 10;
    return score;
}
function localSearch(params, limit) {
    return GOSPEL_DATABASE
        .map(song => ({ song, score: scoreLocalSong(song, params) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ song, score }) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        imageUrl: song.imageUrl,
        preview: song.theme?.slice(0, 2).join(' • ') || 'Disponível na biblioteca local',
        theme: song.theme,
        key: song.key,
        source: song.source,
        sourceUrl: song.sourceUrl,
        providerRef: song.providerRef,
        score,
    }));
}
function resultIdentity(result) {
    const title = normalizeText(result.title).replace(/\b(ao vivo|live|lyrics|letra|official|video oficial|clipe oficial)\b/g, '').trim();
    const artist = normalizeText(result.artist).replace(/\b(feat|ft)\b.*$/g, '').trim();
    return `${title}|${artist}`;
}
const SEARCH_STOPWORDS = new Set([
    'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'que', 'pra', 'para', 'por', 'com', 'me', 'te', 'se', 'eu', 'tu',
    'ele', 'ela', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas', 'ao', 'aos',
    'the', 'and', 'of', 'to', 'in', 'my', 'you', 'your', 'is', 'it',
]);
function searchTerms(value) {
    return [...new Set(normalizeText(value).split(/\s+/).filter(term => term.length > 1 && !SEARCH_STOPWORDS.has(term)))];
}
function likelyLyricsExcerpt(params) {
    const normalized = normalizeText(params.query || '');
    const words = normalized.split(/\s+/).filter(Boolean);
    const terms = searchTerms(params.query || '');
    // Com uma caixa única, 2–4 palavras ainda são frequentemente título ou artista. Só priorizamos
    // o índice full-text quando há sinal claro de frase; casos ambíguos continuam cobertos pelo fallback.
    return words.length >= 5 || terms.length >= 5 || (words.length >= 4 && normalized.length >= 26);
}
function buildRemoteQueries(params) {
    const rawQuery = String(params.query || params.title || '').replace(/\s+/g, ' ').trim();
    const artist = String(params.artist || '').replace(/\s+/g, ' ').trim();
    const variants = [];
    const add = (value) => {
        const clean = String(value || '').replace(/\s+/g, ' ').trim();
        if (clean && !variants.some(item => normalizeText(item) === normalizeText(clean)))
            variants.push(clean.slice(0, 180));
    };
    const excerptMode = likelyLyricsExcerpt(params);
    // Em trecho, a frase original vem primeiro porque os índices full-text (notadamente Vagalume)
    // conseguem localizá-la. Para título/artista, o par artista+título continua sendo o sinal mais forte.
    if (excerptMode) {
        add(rawQuery || artist);
        if (artist && rawQuery) add(`${artist} ${rawQuery}`);
    }
    else {
        if (artist && rawQuery) add(`${artist} ${rawQuery}`);
        add(rawQuery || artist);
    }
    if (excerptMode) {
        const rawWords = rawQuery.split(/\s+/).filter(Boolean);
        const terms = searchTerms(rawQuery);
        // Mantém janelas contíguas (ordem da frase) e uma variante de palavras significativas.
        // Isso aumenta recall sem transformar a busca em uma lista de palavras desconectadas.
        if (rawWords.length > 5) add(rawWords.slice(0, 8).join(' '));
        if (rawWords.length > 8) add(rawWords.slice(-8).join(' '));
        add(terms.slice(0, 8).join(' '));
        if (artist) add(`${artist} ${terms.slice(0, 6).join(' ')}`);
    }
    return variants.slice(0, 5);
}
function tokenCoverage(text, terms) {
    if (!terms.length)
        return 0;
    const normalized = normalizeText(text);
    const matched = terms.filter(term => normalized.includes(term)).length;
    return matched / terms.length;
}
function diceSimilarity(left, right) {
    const a = normalizeText(left || '').replace(/\s+/g, ' ').trim();
    const b = normalizeText(right || '').replace(/\s+/g, ' ').trim();
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    if (a.length < 3 || b.length < 3)
        return a.includes(b) || b.includes(a) ? 0.85 : 0;
    const grams = value => {
        const map = new Map();
        for (let i = 0; i <= value.length - 2; i++) {
            const gram = value.slice(i, i + 2);
            map.set(gram, (map.get(gram) || 0) + 1);
        }
        return map;
    };
    const aGrams = grams(a);
    const bGrams = grams(b);
    let overlap = 0;
    for (const [gram, count] of aGrams)
        overlap += Math.min(count, bGrams.get(gram) || 0);
    const total = [...aGrams.values()].reduce((sum, count) => sum + count, 0) +
        [...bGrams.values()].reduce((sum, count) => sum + count, 0);
    return total ? (2 * overlap) / total : 0;
}
function isGenericPreview(value) {
    const preview = normalizeText(value || '');
    return !preview || /resultado encontrado|toque para carregar|disponivel na biblioteca|indice de busca|api personalizada/.test(preview);
}
function resultIntentScore(result, params) {
    const query = normalizeText(params.query || params.title || '');
    const artist = normalizeText(params.artist || '');
    const title = normalizeText(result.title || '');
    const resultArtist = normalizeText(result.artist || '');
    const terms = searchTerms(query);
    // O score original de cada site é só um sinal secundário. Isso impede que o Vagalume
    // domine a lista apenas porque seu índice atribui scores base mais altos.
    let score = Math.min(100, Math.max(0, Number(result.score) || 0)) * 0.35;
    if (query) {
        const excerptMode = likelyLyricsExcerpt(params);
        if (title === query)
            score += 95;
        else if (title.includes(query) || query.includes(title))
            score += 52;
        if (!excerptMode) {
            score += diceSimilarity(title, query) * 54;
            score += diceSimilarity(resultArtist, query) * 30;
            // Suporta consultas naturais como "Aline Barros Ressuscita-me" mesmo quando o
            // artista não foi preenchido no campo opcional.
            score += diceSimilarity(`${resultArtist} ${title}`, query) * 34;
            score += diceSimilarity(`${title} ${resultArtist}`, query) * 28;
        }
        score += tokenCoverage(`${title} ${resultArtist}`, terms) * (excerptMode ? 26 : 48);
        if (!isGenericPreview(result.preview))
            score += tokenCoverage(result.preview, terms) * (excerptMode ? 82 : 22);
    }
    if (artist) {
        if (resultArtist === artist)
            score += 72;
        else if (resultArtist.includes(artist) || artist.includes(resultArtist))
            score += 48;
        else {
            const similarity = diceSimilarity(resultArtist, artist);
            score += similarity * 34;
            if (similarity < 0.42)
                score -= 18;
        }
    }
    if (result.imageUrl)
        score += 3;
    if (result.album)
        score += 2;
    if (result.lyricsVerified)
        score += 110;
    return score;
}
function mergeResultMetadata(primary, candidate, params) {
    const primaryRank = resultIntentScore(primary, params);
    const candidateRank = resultIntentScore(candidate, params);
    const winner = candidateRank > primaryRank ? candidate : primary;
    const other = winner === candidate ? primary : candidate;
    const betterPreview = !isGenericPreview(winner.preview)
        ? winner.preview
        : (!isGenericPreview(other.preview) ? other.preview : winner.preview || other.preview);
    const sources = [...new Set([...(primary.sources || [primary.source]), ...(candidate.sources || [candidate.source])].filter(Boolean))];
    return {
        ...winner,
        album: winner.album || other.album,
        imageUrl: winner.imageUrl || other.imageUrl,
        preview: betterPreview,
        sourceUrl: winner.sourceUrl || other.sourceUrl,
        providerRef: winner.providerRef || other.providerRef,
        theme: winner.theme?.length ? winner.theme : other.theme,
        lyricsVerified: Boolean(winner.lyricsVerified || other.lyricsVerified),
        sources,
        score: Math.max(Number(primary.score) || 0, Number(candidate.score) || 0),
    };
}
function dedupeResults(results, params, limit) {
    const exact = new Map();
    for (const result of results) {
        if (!result.title?.trim())
            continue;
        const key = resultIdentity(result);
        const current = exact.get(key);
        exact.set(key, current ? mergeResultMetadata(current, result, params) : { ...result, sources: [result.source] });
    }
    // Segunda passagem tolera pequenas diferenças entre provedores ("Ao Vivo", pontuação,
    // participação no título) sem misturar músicas homônimas de artistas diferentes.
    const merged = [];
    for (const result of exact.values()) {
        const index = merged.findIndex(current => sameSongConfidence(current, result) >= 0.90);
        if (index >= 0) merged[index] = mergeResultMetadata(merged[index], result, params);
        else merged.push(result);
    }
    return merged
        .map(result => ({ ...result, relevanceScore: resultIntentScore(result, params) }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit)
        .map(({ relevanceScore: _relevanceScore, lyricsVerified: _lyricsVerified, discoveryOnly: _discoveryOnly, ...result }) => result);
}
function sourceLyricsCacheKey(sourceUrl) {
    return cacheKey('lyrics-source-v1', String(sourceUrl || '').trim());
}
function orderedTermCoverage(text, terms) {
    if (!terms.length) return 0;
    const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
    let cursor = 0;
    let matched = 0;
    for (const term of terms) {
        const next = tokens.findIndex((token, index) => index >= cursor && (token === term || token.includes(term) || term.includes(token)));
        if (next < 0) continue;
        matched += 1;
        cursor = next + 1;
    }
    return matched / terms.length;
}
function lyricsMatchQuality(lyrics, query) {
    const normalizedQuery = normalizeText(query);
    const terms = searchTerms(query);
    const lines = String(lyrics || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
    if (!normalizedQuery || !terms.length || !lines.length)
        return { matched: false, exactPhrase: false, score: 0, coverage: 0, orderedCoverage: 0, preview: '' };
    let best = { score: 0, coverage: 0, orderedCoverage: 0, exactPhrase: false, preview: '' };
    for (let start = 0; start < lines.length; start += 1) {
        for (let size = 1; size <= 4 && start + size <= lines.length; size += 1) {
            const windowLines = lines.slice(start, start + size);
            const windowText = windowLines.join(' ');
            const normalizedWindow = normalizeText(windowText);
            const exactPhrase = normalizedQuery.length >= 8 && normalizedWindow.includes(normalizedQuery);
            const coverage = tokenCoverage(normalizedWindow, terms);
            const orderedCoverage = orderedTermCoverage(normalizedWindow, terms);
            const similarity = diceSimilarity(normalizedWindow, normalizedQuery);
            const compactness = Math.min(1, normalizedQuery.length / Math.max(normalizedWindow.length, normalizedQuery.length));
            const score = (exactPhrase ? 1.25 : 0) + coverage * 0.62 + orderedCoverage * 0.28 + similarity * 0.10 + compactness * 0.04;
            if (score > best.score) {
                best = {
                    score,
                    coverage,
                    orderedCoverage,
                    exactPhrase,
                    preview: lines.slice(Math.max(0, start - 1), Math.min(lines.length, start + size + 1)).join(' • ').slice(0, 240),
                };
            }
        }
    }
    const termThreshold = terms.length <= 2 ? 1 : terms.length === 3 ? 0.78 : 0.66;
    const matched = best.exactPhrase || (best.coverage >= termThreshold && best.orderedCoverage >= Math.max(0.55, termThreshold - 0.08));
    return { ...best, matched };
}
function sameSongConfidence(reference, candidate) {
    const titleSimilarity = diceSimilarity(reference.title || '', candidate.title || '');
    const artistSimilarity = diceSimilarity(reference.artist || '', candidate.artist || '');
    const normalizedTitle = normalizeText(reference.title || '');
    const candidateTitle = normalizeText(candidate.title || '');
    const exactTitle = normalizedTitle && candidateTitle && normalizedTitle === candidateTitle;
    return (exactTitle ? 0.72 : titleSimilarity * 0.72) + artistSimilarity * 0.28;
}
function songMatchesRequest(song, request) {
    if (!song) return false;
    const expectedTitle = normalizeText(request.title || '');
    const expectedArtist = normalizeText(request.artist || '');
    if (expectedTitle && expectedArtist) {
        return sameSongConfidence({ title: request.title, artist: request.artist }, song) >= 0.68;
    }
    if (expectedTitle) return diceSimilarity(song.title || '', request.title || '') >= 0.72;
    if (expectedArtist) return diceSimilarity(song.artist || '', request.artist || '') >= 0.58;
    return true;
}
async function searchVariants(variants, limit, runner, maxVariants = 3) {
    const requested = variants.slice(0, Math.max(1, Math.min(maxVariants, 4)));
    if (!requested.length) return [];
    // As variantes são independentes. Executá-las em paralelo mantém o tempo máximo do provider
    // próximo de um único timeout, em vez de somar 3–4 timeouts quando uma fonte está lenta.
    const settled = await Promise.allSettled(
        requested.map(variant => runner(variant, Math.max(3, Math.min(limit, 12))))
    );
    const collected = [];
    let successCount = 0;
    let lastError;
    for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
            successCount += 1;
            if (Array.isArray(outcome.value)) collected.push(...outcome.value);
        }
        else lastError = outcome.reason;
    }
    if (!successCount && lastError) throw lastError;
    const unique = new Map();
    for (const item of collected) {
        const key = `${item.source || ''}|${item.sourceUrl || item.providerRef || item.id || ''}|${normalizeText(item.title || '')}|${normalizeText(item.artist || '')}`;
        const current = unique.get(key);
        if (!current || Number(item.score || 0) > Number(current.score || 0)) unique.set(key, item);
    }
    return [...unique.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, Math.max(limit * 2, limit));
}
function remoteQuery(params) {
    return [params.artist, params.title, params.query].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
export async function searchGospelSongs(params) {
    const startedAt = Date.now();
    const limit = Math.max(1, Math.min(Number(params.limit) || 12, 25));
    const normalizedParams = {
        query: String(params.query || '').trim().slice(0, 160),
        artist: String(params.artist || '').trim().slice(0, 120),
        title: String(params.title || '').trim().slice(0, 160),
        theme: String(params.theme || '').trim().slice(0, 80),
        provider: String(params.provider || '').trim(),
        limit,
    };
    const key = cacheKey('search-v7-resilient', normalizedParams);
    const cached = getFromCache(key);
    if (cached && reusableSearchCacheEntry(cached))
        return { ...cached, cached: true, cacheStatus: 'hit' };
    // Proteção contra entradas antigas/envenenadas: resposta parcial ou vazia nunca é reutilizada.
    if (cached)
        memoryCache.delete(key);

    const config = getProxyConfig();
    const requestedProvider = normalizedParams.provider || config.defaultProvider;
    const desiredProvider = ['built-in', 'database', 'letras_mus_br', 'vagalume'].includes(requestedProvider)
        ? requestedProvider
        : 'multi-provider';
    const localAllowed = desiredProvider === 'multi-provider' || desiredProvider === 'built-in' || desiredProvider === 'database';
    const results = localAllowed ? localSearch(normalizedParams, limit) : [];
    const query = remoteQuery(normalizedParams);
    const queryVariants = buildRemoteQueries(normalizedParams);
    const excerptMode = likelyLyricsExcerpt(normalizedParams);
    const deadline = startedAt + searchBudgetMs();
    let partial = false;
    const providersUsed = [];
    const providersSkipped = [];
    const providerErrors = [];

    const excerptCandidateMatches = (result) => {
        if (!excerptMode || !normalizedParams.query)
            return true;
        if (!isGenericPreview(result.preview)) {
            const quality = lyricsMatchQuality(result.preview, normalizedParams.query);
            if (quality.matched || quality.exactPhrase || quality.coverage >= 0.72)
                return true;
        }
        // Se a consulta longa for, na prática, o título completo, preserva um resultado forte do Letras.
        return diceSimilarity(result.title || '', normalizedParams.query) >= 0.76 ||
            tokenCoverage(result.title || '', searchTerms(normalizedParams.query)) >= 0.86;
    };

    const strongEnough = (batch) => batch.some(result => {
        if (excerptMode)
            return excerptCandidateMatches(result);
        return resultIntentScore(result, normalizedParams) >= 78;
    });

    const runLetras = async (budgetMs) => {
        if (!budgetMs || !config.providers.letrasMusBr.enabled)
            return [];
        return searchVariants(
            queryVariants,
            limit,
            (variant, variantLimit) => searchLetrasMusBr(
                config.providers.letrasMusBr.baseUrl,
                variant,
                variantLimit,
                Math.min(config.providers.letrasMusBr.timeoutMs, budgetMs)
            ),
            excerptMode ? 1 : 2
        );
    };

    const runVagalume = async (budgetMs) => {
        if (!budgetMs || !config.providers.vagalume.enabled)
            return [];
        const providerDeadline = Date.now() + budgetMs;
        const primaryQuery = queryVariants[0] || query;
        if (!primaryQuery)
            return [];
        try {
            const indexBudget = remainingBudget(providerDeadline, Math.min(2300, budgetMs));
            if (indexBudget) {
                const indexed = await searchVagalumeExcerpt(
                    config.providers.vagalume.baseUrl,
                    config.providers.vagalume.webBaseUrl,
                    primaryQuery,
                    limit,
                    Math.min(config.providers.vagalume.timeoutMs, indexBudget)
                );
                if (indexed.length)
                    return indexed;
            }
        }
        catch {
            // O índice é a rota mais barata. Se indisponível, usa uma única descoberta web.
        }
        const webBudget = remainingBudget(providerDeadline, 1900);
        if (!webBudget)
            return [];
        return searchVagalumeWeb(
            config.providers.vagalume.webBaseUrl,
            normalizedParams.title || normalizedParams.query || query,
            normalizedParams.artist,
            limit,
            Math.min(config.providers.vagalume.timeoutMs, webBudget)
        );
    };

    if (query && desiredProvider !== 'built-in' && desiredProvider !== 'database') {
        // Fluxo adaptativo de duas fontes:
        // - título/artista e trecho: índice JSON do Vagalume primeiro;
        // - Letras: fallback quando o índice não entregar candidato forte;
        // O segundo provedor só é consultado se o primeiro não produzir um candidato forte.
        const providerPlan = desiredProvider === 'multi-provider'
            // O índice JSON do Vagalume é mais barato/estável que scraping HTML e também
            // retorna título + artista. Letras fica como fallback de cobertura.
            ? ['vagalume', 'letras_mus_br']
            : [desiredProvider];

        for (const provider of providerPlan) {
            const enabled = provider === 'vagalume'
                ? config.providers.vagalume.enabled
                : config.providers.letrasMusBr.enabled;
            if (!enabled) {
                providersSkipped.push({ provider, reason: 'DISABLED' });
                partial = true;
                continue;
            }
            if (!providerAvailable(provider)) {
                providersSkipped.push({ provider, reason: 'CIRCUIT_OPEN' });
                partial = true;
                continue;
            }
            const budgetMs = remainingBudget(deadline, provider === providerPlan[0] ? 2700 : 2500);
            if (!budgetMs) {
                providersSkipped.push({ provider, reason: 'BUDGET_EXHAUSTED' });
                partial = true;
                break;
            }
            try {
                let batch = provider === 'vagalume'
                    ? await runVagalume(budgetMs)
                    : await runLetras(budgetMs);
                if (excerptMode)
                    batch = batch.filter(excerptCandidateMatches).map(result => ({ ...result, lyricsVerified: true }));
                providerSucceeded(provider);
                providersUsed.push(provider);
                results.push(...batch);
                if (desiredProvider === 'multi-provider' && strongEnough(batch))
                    break;
            }
            catch (error) {
                providerFailed(provider);
                providersUsed.push(provider);
                providerErrors.push({ provider, code: providerErrorCode(error) });
                partial = true;
            }
        }
    }

    const merged = dedupeResults(results, normalizedParams, limit);
    const response = {
        results: merged,
        total: merged.length,
        provider: desiredProvider === 'multi-provider' ? 'dual-source' : desiredProvider,
        providersUsed,
        providersSkipped,
        providerErrors,
        partial,
        durationMs: Date.now() - startedAt,
    };
    // Nunca cacheia falha parcial nem resultado vazio. Isso evita o padrão
    // cached:true + partial:true + resultCount:0 observado na Vercel.
    const cacheable = reusableSearchCacheEntry(response);
    if (cacheable)
        setInCache(key, response, 'search');
    else
        memoryCache.delete(key);
    const cacheStatus = cacheable ? 'stored' : (partial ? 'bypass-partial' : 'bypass-empty');
    return { ...response, cached: false, cacheStatus };
}
function localSong(params) {
    if (params.id) {
        const found = GOSPEL_DATABASE.find(song => song.id === params.id);
        if (found)
            return found;
    }
    const artist = normalizeText(params.artist || '');
    const title = normalizeText(params.title || '');
    if (!artist && !title)
        return null;
    return GOSPEL_DATABASE.find(song => {
        const songArtist = normalizeText(song.artist);
        const songTitle = normalizeText(song.title);
        if (artist && title)
            return songArtist.includes(artist) && songTitle.includes(title);
        if (title)
            return songTitle.includes(title);
        return songArtist.includes(artist);
    }) || null;
}
export async function getGospelSongLyrics(params) {
    const normalized = {
        id: params.id?.trim().slice(0, 200),
        artist: params.artist?.trim().slice(0, 120),
        title: params.title?.trim().slice(0, 160),
        provider: params.provider?.trim().slice(0, 40),
        sourceUrl: params.sourceUrl?.trim().slice(0, 1200),
        providerRef: params.providerRef?.trim().slice(0, 200),
    };
    const key = cacheKey('lyrics-v3-dual', normalized);
    const cached = getFromCache(key);
    if (cached)
        return { song: cached, provider: cached.source, cached: true };
    if (normalized.sourceUrl) {
        const sourceCached = getFromCache(sourceLyricsCacheKey(normalized.sourceUrl));
        if (sourceCached) {
            setInCache(key, sourceCached, 'lyrics');
            return { song: sourceCached, provider: sourceCached.source, cached: true };
        }
    }

    const config = getProxyConfig();
    const requestedProvider = normalized.provider || config.defaultProvider;
    const desiredProvider = ['built-in', 'database', 'letras_mus_br', 'vagalume'].includes(requestedProvider)
        ? requestedProvider
        : 'multi-provider';
    const exactLocal = localSong(normalized);
    if (exactLocal && (desiredProvider === 'multi-provider' || desiredProvider === 'built-in' || desiredProvider === 'database' || !normalized.sourceUrl)) {
        const song = enrichSong(exactLocal);
        setInCache(key, song, 'lyrics');
        return { song, provider: 'database', cached: false };
    }
    if (desiredProvider === 'built-in' || desiredProvider === 'database')
        return { song: null, provider: desiredProvider, cached: false };

    const deadline = Date.now() + getBudgetMs();
    const saveSong = (rawSong, provider, overrideIdentity = true) => {
        const song = enrichSong(overrideIdentity ? {
            ...rawSong,
            title: normalized.title || rawSong.title,
            artist: normalized.artist || rawSong.artist,
        } : rawSong);
        setInCache(key, song, 'lyrics');
        if (song.sourceUrl)
            setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
        providerSucceeded(provider);
        return { song, provider, cached: false };
    };

    // Primeiro tenta exatamente a URL entregue pela pesquisa. Links antigos de Genius/custom
    // não são mais acessados; título+artista são recuperados pelas duas fontes ativas.
    if (normalized.sourceUrl) {
        const directSource = normalized.sourceUrl.includes('vagalume.com.br')
            ? 'vagalume'
            : (normalized.sourceUrl.includes('letras.mus.br') || normalized.sourceUrl.includes('letras.com'))
                ? 'letras_mus_br'
                : null;
        if (directSource) {
            try {
                const directBudget = remainingBudget(deadline, 3300);
                if (directBudget) {
                    const timeout = directSource === 'vagalume'
                        ? config.providers.vagalume.timeoutMs
                        : config.providers.letrasMusBr.timeoutMs;
                    const scraped = await fetchScrapedSong(normalized.sourceUrl, directSource, Math.min(timeout, directBudget));
                    if (scraped && songMatchesRequest(scraped, normalized))
                        return saveSong(scraped, directSource);
                }
            }
            catch {
                providerFailed(directSource);
            }
        }
    }

    const query = [normalized.artist, normalized.title].filter(Boolean).join(' ').trim();
    if (!query)
        return { song: null, provider: desiredProvider, cached: false };

    const lookupLetras = async (budgetMs) => {
        if (!budgetMs || !config.providers.letrasMusBr.enabled || !providerAvailable('letras_mus_br'))
            return null;
        const providerDeadline = Date.now() + budgetMs;
        const searchBudget = remainingBudget(providerDeadline, 2100);
        if (!searchBudget)
            return null;
        const matches = await searchLetrasMusBr(
            config.providers.letrasMusBr.baseUrl,
            query,
            5,
            Math.min(config.providers.letrasMusBr.timeoutMs, searchBudget)
        );
        const candidates = matches
            .filter(match => match.sourceUrl)
            .map(match => ({ match, confidence: sameSongConfidence(normalized, match) }))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 2);
        for (const { match, confidence } of candidates) {
            if (confidence < 0.54)
                continue;
            const fetchBudget = remainingBudget(providerDeadline, 2300);
            if (!fetchBudget)
                break;
            try {
                const scraped = await fetchScrapedSong(
                    match.sourceUrl,
                    'letras_mus_br',
                    Math.min(config.providers.letrasMusBr.timeoutMs, fetchBudget)
                );
                if (scraped && songMatchesRequest(scraped, normalized))
                    return scraped;
            }
            catch { /* tenta o próximo candidato */ }
        }
        return null;
    };

    const lookupVagalume = async (budgetMs) => {
        if (!budgetMs || !config.providers.vagalume.enabled || !providerAvailable('vagalume') || !normalized.artist || !normalized.title)
            return null;
        const providerDeadline = Date.now() + budgetMs;
        if (config.providers.vagalume.apiKey) {
            try {
                const apiBudget = remainingBudget(providerDeadline, 2200);
                if (apiBudget) {
                    const fetched = await fetchVagalumeSong(
                        config.providers.vagalume.baseUrl,
                        config.providers.vagalume.apiKey,
                        normalized.artist,
                        normalized.title,
                        Math.min(config.providers.vagalume.timeoutMs, apiBudget)
                    );
                    if (fetched && songMatchesRequest(fetched, normalized))
                        return fetched;
                }
            }
            catch { /* descoberta web abaixo */ }
        }
        const webBudget = remainingBudget(providerDeadline, 2100);
        if (!webBudget)
            return null;
        const matches = await searchVagalumeWeb(
            config.providers.vagalume.webBaseUrl,
            normalized.title,
            normalized.artist,
            6,
            Math.min(config.providers.vagalume.timeoutMs, webBudget)
        );
        const candidates = matches
            .filter(match => match.sourceUrl)
            .map(match => ({ match, confidence: sameSongConfidence(normalized, match) }))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 2);
        for (const { match, confidence } of candidates) {
            if (confidence < 0.54)
                continue;
            const fetchBudget = remainingBudget(providerDeadline, 2300);
            if (!fetchBudget)
                break;
            try {
                const scraped = await fetchScrapedSong(
                    match.sourceUrl,
                    'vagalume',
                    Math.min(config.providers.vagalume.timeoutMs, fetchBudget)
                );
                if (scraped && songMatchesRequest(scraped, normalized))
                    return scraped;
            }
            catch { /* tenta o próximo candidato */ }
        }
        return null;
    };

    const providerPlan = desiredProvider === 'vagalume'
        ? ['vagalume', 'letras_mus_br']
        : ['letras_mus_br', 'vagalume'];
    for (const provider of providerPlan) {
        const budgetMs = remainingBudget(deadline, provider === providerPlan[0] ? 4500 : 3000);
        if (!budgetMs)
            break;
        try {
            const song = provider === 'vagalume'
                ? await lookupVagalume(budgetMs)
                : await lookupLetras(budgetMs);
            if (song)
                return saveSong(song, provider);
            providerFailed(provider);
        }
        catch {
            providerFailed(provider);
        }
    }
    return { song: null, provider: desiredProvider === 'multi-provider' ? 'dual-source' : desiredProvider, cached: false };
}

// Exportações de teste do motor de busca. Não fazem parte do contrato HTTP.
export const __lyricsSearchInternals = {
    buildRemoteQueries,
    likelyLyricsExcerpt,
    diceSimilarity,
    resultIntentScore,
    dedupeResults,
    lyricsMatchQuality,
    orderedTermCoverage,
    sameSongConfidence,
    tokenCoverage,
};
