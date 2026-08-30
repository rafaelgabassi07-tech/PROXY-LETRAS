/**
 * Motor de busca e obtenção de letras.
 * Estratégia: banco local + provedores remotos concorrentes, deduplicação,
 * cache limitado e recuperação exata via sourceUrl.
 */
import { LRUCache } from 'lru-cache';
import { GOSPEL_DATABASE } from './gospelDatabase.js';
import { getProxyConfig } from './proxyConfig.js';
import { fetchScrapedSong, fetchVagalumeSong, searchGenius, searchGeniusWeb, searchLetrasMusBr, searchVagalumeExcerpt, searchVagalumeWeb, } from './scrapers.js';
const memoryCache = new LRUCache({
    max: 5000,
    ttlAutopurge: true,
    updateAgeOnGet: true,
});
const providerHealth = new Map();
function cacheKey(prefix, value) {
    return `${prefix}:${JSON.stringify(value)}`;
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
        extractionMethod: song.extractionMethod || (song.source === 'database' ? 'database' : (song.source === 'vagalume' || song.source === 'custom_api' ? 'api' : undefined)),
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
    // Trechos lembrados pelo usuário costumam ser curtos. O modo híbrido entra cedo o suficiente
    // para validar frases como "muda minha história" sem impedir títulos de 3–4 palavras.
    return words.length >= 4 || terms.length >= 4 || (words.length >= 3 && normalized.length >= 17);
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
function matchingLyricsPreview(lyrics, query) {
    return lyricsMatchQuality(lyrics, query).preview;
}
function providerTimeoutMs(config, source) {
    if (source === 'genius') return config.providers.genius.timeoutMs;
    if (source === 'vagalume') return config.providers.vagalume.timeoutMs;
    return config.providers.letrasMusBr.timeoutMs;
}

async function enrichTopResultMetadata(results, config) {
    const eligible = results
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => !result.imageUrl && result.sourceUrl && ['genius', 'letras_mus_br', 'vagalume'].includes(result.source))
        .slice(0, 2);
    if (!eligible.length) return results;
    const enriched = [...results];
    const settled = await Promise.allSettled(eligible.map(async ({ result, index }) => {
        let song = getFromCache(sourceLyricsCacheKey(result.sourceUrl));
        if (!song) {
            const timeout = Math.min(providerTimeoutMs(config, result.source), 3200);
            song = await fetchScrapedSong(result.sourceUrl, result.source, timeout);
            if (song) setInCache(sourceLyricsCacheKey(result.sourceUrl), enrichSong(song), 'lyrics');
        }
        if (!song) return null;
        return {
            index,
            patch: {
                imageUrl: result.imageUrl || song.imageUrl,
                album: result.album || song.album,
                preview: isGenericPreview(result.preview)
                    ? (matchingLyricsPreview(song.fullLyrics, result.title) || result.preview)
                    : result.preview,
            },
        };
    }));
    for (const outcome of settled) {
        if (outcome.status !== 'fulfilled' || !outcome.value) continue;
        const { index, patch } = outcome.value;
        enriched[index] = { ...enriched[index], ...patch };
    }
    return enriched;
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
async function resolveVagalumeCandidateUrls(results, config, maxCandidates = 5) {
    const unresolved = results
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.source === 'vagalume' && !result.sourceUrl && result.title && result.artist)
        .slice(0, maxCandidates);
    if (!unresolved.length) return results;
    const resolved = [...results];
    const settled = await Promise.allSettled(unresolved.map(async ({ result, index }) => {
        const matches = await searchVagalumeWeb(
            config.providers.vagalume.webBaseUrl,
            result.title,
            result.artist,
            8,
            Math.min(config.providers.vagalume.timeoutMs, 3200)
        );
        const best = matches
            .map(candidate => ({ candidate, confidence: sameSongConfidence(result, candidate) }))
            .filter(item => item.candidate.sourceUrl && item.confidence >= 0.72)
            .sort((a, b) => b.confidence - a.confidence)[0]?.candidate;
        return best ? { index, best } : null;
    }));
    for (const outcome of settled) {
        if (outcome.status !== 'fulfilled' || !outcome.value) continue;
        const { index, best } = outcome.value;
        resolved[index] = {
            ...resolved[index],
            sourceUrl: best.sourceUrl,
            imageUrl: resolved[index].imageUrl || best.imageUrl,
            album: resolved[index].album || best.album,
            preview: isGenericPreview(resolved[index].preview) ? best.preview : resolved[index].preview,
        };
    }
    return resolved;
}
async function fanOutResolvedSongs(results, params, config) {
    const excerptMode = likelyLyricsExcerpt(params);
    const seeds = results
        .filter(result => result.title && result.artist && (result.lyricsVerified || resultIntentScore(result, params) >= (excerptMode ? 72 : 108)))
        .sort((a, b) => resultIntentScore(b, params) - resultIntentScore(a, params))
        .slice(0, excerptMode ? 2 : 1);
    if (!seeds.length) return results;
    const providerBudget = 2600;
    const seedRuns = await Promise.allSettled(seeds.map(async seed => {
        const exactQuery = `${seed.artist} ${seed.title}`.trim();
        const jobs = [];
        if (seed.source !== 'letras_mus_br' && config.providers.letrasMusBr.enabled && providerAvailable('letras_mus_br')) {
            jobs.push(searchLetrasMusBr(config.providers.letrasMusBr.baseUrl, exactQuery, 5, Math.min(config.providers.letrasMusBr.timeoutMs, providerBudget)));
        }
        if (seed.source !== 'genius' && config.providers.genius.enabled && providerAvailable('genius')) {
            jobs.push((async () => {
                if (config.providers.genius.accessToken) {
                    try {
                        const api = await searchGenius(config.providers.genius.baseUrl, config.providers.genius.accessToken, exactQuery, 5, Math.min(config.providers.genius.timeoutMs, providerBudget));
                        if (api.length) return api;
                    } catch { /* web fallback */ }
                }
                return searchGeniusWeb(config.providers.genius.webBaseUrl, exactQuery, 5, Math.min(config.providers.genius.timeoutMs, providerBudget));
            })());
        }
        if (seed.source !== 'vagalume' && config.providers.vagalume.enabled && providerAvailable('vagalume')) {
            jobs.push((async () => {
                let indexed = [];
                try {
                    indexed = await searchVagalumeExcerpt(config.providers.vagalume.baseUrl, config.providers.vagalume.webBaseUrl, exactQuery, 5, Math.min(config.providers.vagalume.timeoutMs, providerBudget));
                } catch { /* web fallback */ }
                const resolvedIndexed = await resolveVagalumeCandidateUrls(indexed, config, 2);
                if (resolvedIndexed.some(item => item.sourceUrl)) return resolvedIndexed;
                return searchVagalumeWeb(config.providers.vagalume.webBaseUrl, seed.title, seed.artist, 5, Math.min(config.providers.vagalume.timeoutMs, providerBudget));
            })());
        }
        const settled = await Promise.allSettled(jobs);
        const additions = [];
        for (const outcome of settled) {
            if (outcome.status !== 'fulfilled') continue;
            const matches = outcome.value
                .map(candidate => ({ candidate, confidence: sameSongConfidence(seed, candidate) }))
                .filter(item => item.confidence >= 0.72)
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 2)
                .map(item => item.candidate);
            additions.push(...matches);
        }
        return additions;
    }));
    const additions = seedRuns.flatMap(outcome => outcome.status === 'fulfilled' ? outcome.value : []);
    return [...results, ...additions];
}
async function verifyExcerptCandidates(results, params, config) {
    if (!likelyLyricsExcerpt(params) || !params.query)
        return results;
    const terms = searchTerms(params.query);
    if (terms.length < 2)
        return results;
    // O índice Vagalume retorna id/título/artista, mas não garante uma URL web canônica sem chave.
    // Resolve a URL pela página real do artista antes de tentar validar a letra.
    const resolvableResults = await resolveVagalumeCandidateUrls(results, config, 5);
    const perProvider = new Map();
    const candidates = [...resolvableResults]
        .filter(result => result.sourceUrl && ['genius', 'letras_mus_br', 'vagalume'].includes(result.source))
        .sort((a, b) => resultIntentScore(b, params) - resultIntentScore(a, params))
        .filter(result => {
            const count = perProvider.get(result.source) || 0;
            if (count >= 3)
                return false;
            perProvider.set(result.source, count + 1);
            return true;
        })
        .slice(0, 8);
    const validations = await Promise.allSettled(candidates.map(async result => {
        let song = getFromCache(sourceLyricsCacheKey(result.sourceUrl));
        if (!song) {
            const timeout = result.source === 'genius'
                ? config.providers.genius.timeoutMs
                : result.source === 'vagalume'
                    ? config.providers.vagalume.timeoutMs
                    : config.providers.letrasMusBr.timeoutMs;
            song = await fetchScrapedSong(result.sourceUrl, result.source, Math.min(timeout, 3800));
            if (song)
                setInCache(sourceLyricsCacheKey(result.sourceUrl), enrichSong(song), 'lyrics');
        }
        if (!song?.fullLyrics)
            return null;
        const matchQuality = lyricsMatchQuality(song.fullLyrics, params.query);
        if (!matchQuality.matched)
            return null;
        return {
            id: result.id,
            sourceUrl: result.sourceUrl,
            preview: matchQuality.preview,
            album: song.album,
            imageUrl: song.imageUrl,
            lyricsVerified: true,
            scoreBonus: matchQuality.exactPhrase ? 150 : Math.round(95 * Math.min(1, matchQuality.coverage * 0.65 + matchQuality.orderedCoverage * 0.35)),
        };
    }));
    const verified = new Map();
    validations.forEach(outcome => {
        if (outcome.status === 'fulfilled' && outcome.value)
            verified.set(`${outcome.value.id}|${outcome.value.sourceUrl}`, outcome.value);
    });
    return resolvableResults.map(result => {
        const match = verified.get(`${result.id}|${result.sourceUrl}`);
        if (!match)
            return result;
        return {
            ...result,
            preview: match.preview || result.preview,
            album: result.album || match.album,
            imageUrl: result.imageUrl || match.imageUrl,
            lyricsVerified: true,
            score: (Number(result.score) || 0) + match.scoreBonus,
        };
    }).filter(result => !result.discoveryOnly || result.lyricsVerified);
}
async function searchVariants(variants, limit, runner) {
    const requested = variants.slice(0, 4);
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
async function customSearch(params, limit) {
    const config = getProxyConfig().providers.customApi;
    if (!config.enabled || !config.endpointUrl)
        return [];
    const headers = { 'Content-Type': 'application/json', ...(config.customHeaders || {}) };
    if (config.authHeader)
        headers.Authorization = config.authHeader;
    let url = config.endpointUrl;
    const init = { method: config.method, headers, signal: AbortSignal.timeout(6500) };
    if (config.method === 'GET') {
        const parsed = new URL(url);
        parsed.searchParams.set('query', params.query || '');
        if (params.artist)
            parsed.searchParams.set('artist', params.artist);
        if (params.title)
            parsed.searchParams.set('title', params.title);
        parsed.searchParams.set('limit', String(limit));
        url = parsed.toString();
    }
    else {
        init.body = JSON.stringify({ action: 'search', ...params, limit });
    }
    const response = await fetch(url, init);
    if (!response.ok)
        throw new Error(`Custom API HTTP ${response.status}`);
    const payload = await response.json();
    const array = payload?.data?.results || payload?.results || payload?.data || [];
    if (!Array.isArray(array))
        return [];
    return array.slice(0, limit).map((item, index) => ({
        id: String(item.id || `custom-${index}-${Date.now()}`),
        title: String(item.title || item.name || ''),
        artist: String(item.artist || item.author || 'Artista'),
        album: typeof item.album === 'string' ? item.album : undefined,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : (typeof item.image === 'string' ? item.image : undefined),
        preview: String(item.preview || 'Resultado da API personalizada'),
        theme: Array.isArray(item.theme) ? item.theme.map(String) : undefined,
        source: 'custom_api',
        sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : undefined,
        providerRef: item.providerRef != null ? String(item.providerRef) : undefined,
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : 55 - index,
    }));
}
async function customGet(params) {
    const config = getProxyConfig().providers.customApi;
    if (!config.enabled || !config.endpointUrl)
        return null;
    const headers = { 'Content-Type': 'application/json', ...(config.customHeaders || {}) };
    if (config.authHeader)
        headers.Authorization = config.authHeader;
    let url = config.endpointUrl;
    const init = { method: config.method, headers, signal: AbortSignal.timeout(6500) };
    if (config.method === 'GET') {
        const parsed = new URL(url);
        for (const [key, value] of Object.entries(params))
            if (value)
                parsed.searchParams.set(key, String(value));
        url = parsed.toString();
    }
    else {
        init.body = JSON.stringify({ action: 'get', ...params });
    }
    const response = await fetch(url, init);
    if (!response.ok)
        return null;
    const payload = await response.json();
    const data = payload?.data?.song || payload?.song || payload?.data || payload;
    const lyrics = data?.fullLyrics || data?.lyrics || readPath(payload, config.responsePath || '');
    if (typeof lyrics !== 'string' || !lyrics.trim())
        return null;
    return enrichSong({
        id: String(data?.id || params.id || `custom-${Date.now()}`),
        title: String(data?.title || params.title || 'Música'),
        artist: String(data?.artist || params.artist || 'Artista'),
        album: typeof data?.album === 'string' ? data.album : undefined,
        imageUrl: typeof data?.imageUrl === 'string' ? data.imageUrl : (typeof data?.image === 'string' ? data.image : undefined),
        fullLyrics: lyrics,
        source: 'custom_api',
        sourceUrl: typeof data?.sourceUrl === 'string' ? data.sourceUrl : params.sourceUrl,
        extractionMethod: 'api',
        fetchedAt: new Date().toISOString(),
    });
}
function readPath(source, path) {
    if (!path)
        return undefined;
    return path.split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}
export async function searchGospelSongs(params) {
    const limit = Math.max(1, Math.min(Number(params.limit) || 12, 25));
    const normalizedParams = {
        query: String(params.query || '').trim().slice(0, 160),
        artist: String(params.artist || '').trim().slice(0, 120),
        title: String(params.title || '').trim().slice(0, 160),
        theme: String(params.theme || '').trim().slice(0, 80),
        provider: String(params.provider || '').trim(),
        limit,
    };
    const key = cacheKey('search-v4', normalizedParams);
    const cached = getFromCache(key);
    if (cached)
        return { ...cached, cached: true };
    const config = getProxyConfig();
    const desiredProvider = normalizedParams.provider || config.defaultProvider;
    const localAllowed = desiredProvider === 'multi-provider' || desiredProvider === 'built-in' || desiredProvider === 'database';
    const results = localAllowed ? localSearch(normalizedParams, limit) : [];
    const query = remoteQuery(normalizedParams);
    const queryVariants = buildRemoteQueries(normalizedParams);
    if (query && desiredProvider !== 'built-in' && desiredProvider !== 'database') {
        const jobs = [];
        const allow = (provider) => desiredProvider === 'multi-provider' || desiredProvider === provider;
        if (allow('letras_mus_br') && config.providers.letrasMusBr.enabled && providerAvailable('letras_mus_br')) {
            jobs.push({
                name: 'letras_mus_br',
                run: () => searchVariants(queryVariants, limit, (variant, variantLimit) => searchLetrasMusBr(config.providers.letrasMusBr.baseUrl, variant, variantLimit, config.providers.letrasMusBr.timeoutMs)),
            });
        }
        if (allow('genius') && config.providers.genius.enabled && providerAvailable('genius')) {
            jobs.push({
                name: 'genius',
                run: async () => searchVariants(queryVariants, limit, async (variant, variantLimit) => {
                    if (config.providers.genius.accessToken) {
                        try {
                            const apiResults = await searchGenius(config.providers.genius.baseUrl, config.providers.genius.accessToken, variant, variantLimit, config.providers.genius.timeoutMs);
                            if (apiResults.length)
                                return apiResults;
                        }
                        catch { /* fallback web abaixo */ }
                    }
                    return searchGeniusWeb(config.providers.genius.webBaseUrl, variant, variantLimit, config.providers.genius.timeoutMs);
                }),
            });
        }
        if (allow('custom') && config.providers.customApi.enabled && providerAvailable('custom')) {
            jobs.push({ name: 'custom', run: () => customSearch(normalizedParams, limit) });
        }
        if (allow('vagalume') && config.providers.vagalume.enabled && providerAvailable('vagalume')) {
            jobs.push({
                name: 'vagalume',
                run: async () => {
                    const titleQuery = normalizedParams.title || normalizedParams.query;
                    if (config.providers.vagalume.apiKey && normalizedParams.artist && titleQuery) {
                        try {
                            const song = await fetchVagalumeSong(config.providers.vagalume.baseUrl, config.providers.vagalume.apiKey, normalizedParams.artist, titleQuery, config.providers.vagalume.timeoutMs);
                            if (song) {
                                const enriched = enrichSong(song);
                                setInCache(cacheKey('lyrics-v2', { artist: song.artist, title: song.title, source: 'vagalume' }), enriched, 'lyrics');
                                return [{
                                        id: song.id,
                                        title: song.title,
                                        artist: song.artist,
                                        album: song.album,
                                        imageUrl: song.imageUrl,
                                        preview: 'Resultado confirmado pela API Vagalume',
                                        source: song.source,
                                        sourceUrl: song.sourceUrl,
                                        score: 94,
                                    }];
                            }
                        }
                        catch { /* fallback web abaixo */ }
                    }
                    const indexed = await searchVariants(queryVariants, limit, (variant, variantLimit) => searchVagalumeExcerpt(config.providers.vagalume.baseUrl, config.providers.vagalume.webBaseUrl, variant, variantLimit, config.providers.vagalume.timeoutMs));
                    if (indexed.length)
                        return indexed;
                    return searchVariants(queryVariants.length ? queryVariants : [titleQuery || query], limit, (variant, variantLimit) => searchVagalumeWeb(config.providers.vagalume.webBaseUrl, variant, normalizedParams.artist, variantLimit, config.providers.vagalume.timeoutMs));
                },
            });
        }
        const settled = await Promise.allSettled(jobs.map(job => job.run()));
        settled.forEach((outcome, index) => {
            const name = jobs[index]?.name || 'unknown';
            if (outcome.status === 'fulfilled') {
                providerSucceeded(name);
                results.push(...outcome.value);
            }
            else {
                providerFailed(name);
            }
        });
    }
    // Em título/artista, resolve de imediato URLs Vagalume para que a lista abra a música certa.
    // Em trecho, verifyExcerptCandidates já faz essa resolução antes de validar o texto, evitando
    // repetir a mesma rodada de rede.
    const canonicalResults = likelyLyricsExcerpt(normalizedParams)
        ? results
        : await resolveVagalumeCandidateUrls(results, config, 4);
    const verifiedResults = await verifyExcerptCandidates(canonicalResults, normalizedParams, config);
    // Quando qualquer fonte identifica a música (especialmente por trecho), usa título+artista
    // resolvidos para consultar as demais fontes e fundir capas/álbum/URLs canônicas.
    const federatedResults = await fanOutResolvedSongs(verifiedResults, normalizedParams, config);
    const merged = dedupeResults(federatedResults, normalizedParams, limit);
    const enrichedResults = await enrichTopResultMetadata(merged, config);
    const response = {
        results: enrichedResults,
        total: enrichedResults.length,
        provider: desiredProvider === 'multi-provider' ? 'multi-provider' : desiredProvider,
    };
    setInCache(key, response, 'search');
    return { ...response, cached: false };
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
    const key = cacheKey('lyrics-v2', normalized);
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
    const desiredProvider = requestedProvider === 'custom_api' ? 'custom' : requestedProvider;
    const exactLocal = localSong(normalized);
    if (exactLocal && (desiredProvider === 'multi-provider' || desiredProvider === 'built-in' || desiredProvider === 'database' || !normalized.sourceUrl)) {
        const song = enrichSong(exactLocal);
        setInCache(key, song, 'lyrics');
        return { song, provider: 'database', cached: false };
    }
    if (normalized.sourceUrl && ['genius', 'letras_mus_br', 'vagalume'].includes(desiredProvider)) {
        const source = desiredProvider === 'genius' || normalized.sourceUrl.includes('genius.com')
            ? 'genius'
            : desiredProvider === 'vagalume' || normalized.sourceUrl.includes('vagalume.com.br')
                ? 'vagalume'
                : 'letras_mus_br';
        try {
            const timeout = source === 'genius'
                ? config.providers.genius.timeoutMs
                : source === 'vagalume'
                    ? config.providers.vagalume.timeoutMs
                    : config.providers.letrasMusBr.timeoutMs;
            const scraped = await fetchScrapedSong(normalized.sourceUrl, source, timeout);
            if (scraped && songMatchesRequest(scraped, normalized)) {
                const song = enrichSong({
                    ...scraped,
                    title: normalized.title || scraped.title,
                    artist: normalized.artist || scraped.artist,
                });
                setInCache(key, song, 'lyrics');
                if (song.sourceUrl) setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
                providerSucceeded(source);
                return { song, provider: source, cached: false };
            }
        }
        catch {
            providerFailed(source);
        }
    }
    // Um resultado representa a música, não a disponibilidade eterna de uma única fonte.
    // Se a fonte clicada falhar, usa título+artista para recuperar a mesma música nas demais.
    const allowCrossProviderFallback = Boolean(
        normalized.artist && normalized.title && ['multi-provider', 'vagalume', 'genius', 'letras_mus_br'].includes(desiredProvider)
    );
    if ((desiredProvider === 'multi-provider' || desiredProvider === 'vagalume' || allowCrossProviderFallback) &&
        config.providers.vagalume.enabled && normalized.artist && normalized.title) {
        if (config.providers.vagalume.apiKey) {
            try {
                const fetched = await fetchVagalumeSong(config.providers.vagalume.baseUrl, config.providers.vagalume.apiKey, normalized.artist, normalized.title, config.providers.vagalume.timeoutMs);
                if (fetched && songMatchesRequest(fetched, normalized)) {
                    const song = enrichSong(fetched);
                    setInCache(key, song, 'lyrics');
                    if (song.sourceUrl) setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
                    providerSucceeded('vagalume');
                    return { song, provider: 'vagalume', cached: false };
                }
            }
            catch { /* fallback web abaixo */ }
        }
        try {
            let indexedMatches = [];
            try {
                indexedMatches = await searchVagalumeExcerpt(config.providers.vagalume.baseUrl, config.providers.vagalume.webBaseUrl, `${normalized.artist} ${normalized.title}`.trim(), 4, config.providers.vagalume.timeoutMs);
            }
            catch { /* o índice sem chave é opcional; a página web continua disponível */ }
            // O índice fornece metadados muito bons, mas o slug derivado nem sempre é a URL canônica.
            // Cada candidato é validado individualmente; uma URL inválida não cancela o provider inteiro.
            for (const match of indexedMatches) {
                if (!match.sourceUrl)
                    continue;
                try {
                    const scraped = await fetchScrapedSong(match.sourceUrl, 'vagalume', config.providers.vagalume.timeoutMs);
                    if (scraped && songMatchesRequest(scraped, normalized)) {
                        const song = enrichSong({ ...scraped, title: normalized.title || scraped.title, artist: normalized.artist || scraped.artist });
                        setInCache(key, song, 'lyrics');
                        if (song.sourceUrl) setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
                        providerSucceeded('vagalume');
                        return { song, provider: 'vagalume', cached: false };
                    }
                }
                catch { /* tenta o próximo índice e depois a descoberta web canônica */ }
            }
            const webMatches = await searchVagalumeWeb(config.providers.vagalume.webBaseUrl, normalized.title, normalized.artist, 6, config.providers.vagalume.timeoutMs);
            for (const match of webMatches) {
                if (!match.sourceUrl)
                    continue;
                try {
                    const scraped = await fetchScrapedSong(match.sourceUrl, 'vagalume', config.providers.vagalume.timeoutMs);
                    if (scraped && songMatchesRequest(scraped, normalized)) {
                        const song = enrichSong({ ...scraped, title: normalized.title || scraped.title, artist: normalized.artist || scraped.artist });
                        setInCache(key, song, 'lyrics');
                        if (song.sourceUrl) setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
                        providerSucceeded('vagalume');
                        return { song, provider: 'vagalume', cached: false };
                    }
                }
                catch { /* candidato web individual inválido; continua */ }
            }
            providerFailed('vagalume');
        }
        catch {
            providerFailed('vagalume');
        }
    }
    const query = [normalized.artist, normalized.title].filter(Boolean).join(' ').trim();
    if (query && (desiredProvider === 'multi-provider' || desiredProvider === 'genius' || allowCrossProviderFallback) && config.providers.genius.enabled) {
        try {
            let matches = [];
            if (config.providers.genius.accessToken) {
                try {
                    matches = await searchGenius(config.providers.genius.baseUrl, config.providers.genius.accessToken, query, 3, config.providers.genius.timeoutMs);
                }
                catch { /* fallback web abaixo */ }
            }
            if (!matches.length) {
                matches = await searchGeniusWeb(config.providers.genius.webBaseUrl, query, 3, config.providers.genius.timeoutMs);
            }
            for (const match of matches) {
                if (!match.sourceUrl)
                    continue;
                const scraped = await fetchScrapedSong(match.sourceUrl, 'genius', config.providers.genius.timeoutMs);
                if (scraped && songMatchesRequest(scraped, normalized)) {
                    const song = enrichSong(scraped);
                    setInCache(key, song, 'lyrics');
                    if (song.sourceUrl) setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
                    providerSucceeded('genius');
                    return { song, provider: 'genius', cached: false };
                }
            }
        }
        catch {
            providerFailed('genius');
        }
    }
    if (query && (desiredProvider === 'multi-provider' || desiredProvider === 'letras_mus_br' || allowCrossProviderFallback) && config.providers.letrasMusBr.enabled) {
        try {
            const matches = await searchLetrasMusBr(config.providers.letrasMusBr.baseUrl, query, 4, config.providers.letrasMusBr.timeoutMs);
            for (const match of matches) {
                if (!match.sourceUrl)
                    continue;
                const scraped = await fetchScrapedSong(match.sourceUrl, 'letras_mus_br', config.providers.letrasMusBr.timeoutMs);
                if (scraped && songMatchesRequest(scraped, normalized)) {
                    const song = enrichSong({ ...scraped, title: normalized.title || scraped.title, artist: normalized.artist || scraped.artist });
                    setInCache(key, song, 'lyrics');
                    if (song.sourceUrl) setInCache(sourceLyricsCacheKey(song.sourceUrl), song, 'lyrics');
                    providerSucceeded('letras_mus_br');
                    return { song, provider: 'letras_mus_br', cached: false };
                }
            }
        }
        catch {
            providerFailed('letras_mus_br');
        }
    }
    if (desiredProvider === 'multi-provider' || desiredProvider === 'custom') {
        try {
            const song = await customGet(normalized);
            if (song) {
                setInCache(key, song, 'lyrics');
                providerSucceeded('custom');
                return { song, provider: 'custom_api', cached: false };
            }
        }
        catch {
            providerFailed('custom');
        }
    }
    return { song: null, provider: desiredProvider, cached: false };
}

// Exportações de teste do motor de busca. Não fazem parte do contrato HTTP.
export const __lyricsSearchInternals = {
    buildRemoteQueries,
    likelyLyricsExcerpt,
    diceSimilarity,
    resultIntentScore,
    dedupeResults,
    matchingLyricsPreview,
    lyricsMatchQuality,
    orderedTermCoverage,
    sameSongConfidence,
    tokenCoverage,
    enrichTopResultMetadata,
};
