/**
 * Motor de busca e obtenção de letras.
 * Estratégia: banco local + provedores remotos concorrentes, deduplicação,
 * cache limitado e recuperação exata via sourceUrl.
 */

import { LRUCache } from 'lru-cache';
import { GOSPEL_DATABASE } from './gospelDatabase.js';
import { getProxyConfig } from './proxyConfig.js';
import {
  fetchScrapedSong,
  fetchVagalumeSong,
  searchGenius,
  searchGeniusWeb,
  searchLetrasMusBr,
  searchVagalumeExcerpt,
  searchVagalumeWeb,
} from './scrapers.js';
import type { GospelSong, SearchQuery, SearchResult } from './types.js';

interface ProviderHealth {
  failures: number;
  blockedUntil: number;
}

const memoryCache = new LRUCache<string, unknown>({
  max: 5000,
  ttlAutopurge: true,
  updateAgeOnGet: true,
});
const providerHealth = new Map<string, ProviderHealth>();

type CacheKind = 'search' | 'lyrics' | 'default';

function cacheKey(prefix: string, value: unknown): string {
  return `${prefix}:${JSON.stringify(value)}`;
}

export function getFromCache<T>(key: string): T | null {
  const config = getProxyConfig();
  if (!config.cache.enabled) return null;
  return (memoryCache.get(key) as T | undefined) ?? null;
}

export function setInCache(key: string, data: unknown, kind: CacheKind = 'default'): void {
  const config = getProxyConfig();
  if (!config.cache.enabled) return;

  const maxEntries = Math.max(20, Math.min(config.cache.maxEntries || 500, 5000));
  while (!memoryCache.has(key) && memoryCache.size >= maxEntries) memoryCache.pop();

  const ttlSeconds = kind === 'search'
    ? config.cache.searchTtlSeconds
    : kind === 'lyrics'
      ? config.cache.lyricsTtlSeconds
      : config.cache.ttlSeconds;

  memoryCache.set(key, data, { ttl: Math.max(30, ttlSeconds) * 1000 });
}

export function clearCache(): void {
  memoryCache.clear();
}

export function resetProviderHealth(): void {
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

export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanLyricsHTML(lyrics: string): string {
  if (!lyrics) return '';
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

export function detectGospelThemes(lyrics: string): string[] {
  const normalized = normalizeText(lyrics);
  const themes: string[] = [];
  const themeKeywords: Record<string, string[]> = {
    'Adoração': ['santo', 'gloria', 'adorar', 'trono', 'majestade', 'louvor', 'digno'],
    'Avivamento': ['fogo', 'vento', 'avivamento', 'espirito santo', 'derrama'],
    'Gratidão': ['obrigado', 'grato', 'gratidao', 'bondade', 'fidelidade', 'graca'],
    'Oração & Intimidade': ['lugar secreto', 'presenca', 'ouvir tua voz', 'falar contigo'],
    'Cruz & Redenção': ['cruz', 'sangue', 'calvario', 'ressuscitou', 'salvacao', 'perdao'],
    'Esperança & Fé': ['amanha', 'nao temerei', 'confio', 'milagre', 'impossivel', 'vitoria'],
    'Soberania': ['criacao', 'universo', 'todo poderoso', 'rei dos reis', 'soberano'],
  };
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(keyword => normalized.includes(keyword))) themes.push(theme);
  }
  return themes.length ? themes : ['Louvor & Adoração'];
}

export function suggestBibleVerses(lyrics: string, title: string): string[] {
  const norm = normalizeText(`${lyrics} ${title}`);
  const verses: string[] = [];
  if (norm.includes('presenca') || norm.includes('lugar secreto')) verses.push('Salmos 91:1', 'Mateus 6:6');
  if (norm.includes('bondade') || norm.includes('fiel')) verses.push('Salmos 23:6', 'Lamentações 3:22-23');
  if (norm.includes('ressusc') || norm.includes('vive')) verses.push('João 14:19', '1 Coríntios 15:57');
  if (norm.includes('universo') || norm.includes('criacao')) verses.push('Salmos 19:1', 'Romanos 11:33-36');
  if (norm.includes('amor') || norm.includes('graca')) verses.push('Romanos 5:8', '1 João 4:19');
  return verses.length ? [...new Set(verses)].slice(0, 4) : ['Salmos 150:6', 'Colossenses 3:16'];
}

export function structureLyricsSections(rawLyrics: string): NonNullable<GospelSong['sections']> {
  const paragraphs = rawLyrics.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  let verseNumber = 0;
  return paragraphs.map((paragraph, index) => {
    const marker = paragraph.match(/^\s*\[?\s*(refr[aã]o|coro|chorus|ponte|bridge|intro|final|outro|verso\s*\d*)\s*\]?\s*[:\-]?\s*/i)?.[1] || '';
    const normalizedMarker = normalizeText(marker);
    let type: NonNullable<GospelSong['sections']>[number]['type'] = 'verse';
    let label: string;

    if (/refrao|coro|chorus/.test(normalizedMarker)) {
      type = 'chorus';
      label = 'Refrão';
    } else if (/ponte|bridge/.test(normalizedMarker)) {
      type = 'bridge';
      label = 'Ponte';
    } else if (/intro/.test(normalizedMarker)) {
      type = 'intro';
      label = 'Introdução';
    } else if (/final|outro/.test(normalizedMarker)) {
      type = 'outro';
      label = 'Final';
    } else {
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

function enrichSong(song: GospelSong): GospelSong {
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

function providerAvailable(name: string): boolean {
  const state = providerHealth.get(name);
  return !state || Date.now() >= state.blockedUntil;
}

function providerSucceeded(name: string) {
  providerHealth.delete(name);
}

function providerFailed(name: string) {
  const previous = providerHealth.get(name) || { failures: 0, blockedUntil: 0 };
  const failures = previous.failures + 1;
  providerHealth.set(name, {
    failures,
    // Após falhas consecutivas, evita bloquear a UI esperando um provedor indisponível.
    blockedUntil: Date.now() + Math.min(60_000, failures * failures * 2500),
  });
}

function scoreLocalSong(song: GospelSong, params: SearchQuery): number {
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
    if (songTitle === query) score += 85;
    else if (songTitle.includes(query)) score += 60;
    if (songArtist === query) score += 70;
    else if (songArtist.includes(query)) score += 45;
    if (songLyrics.includes(query)) score += 22;
    if (songThemes.some(value => value.includes(query))) score += 30;
  }
  if (artist && songArtist.includes(artist)) score += 55;
  if (title && songTitle.includes(title)) score += 55;
  if (theme && songThemes.some(value => value.includes(theme))) score += 35;
  if (!query && !artist && !title && !theme) score = 10;
  return score;
}

function localSearch(params: SearchQuery, limit: number): SearchResult[] {
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
      preview: song.theme?.slice(0, 2).join(' • ') || 'Disponível na biblioteca local',
      theme: song.theme,
      key: song.key,
      source: song.source,
      sourceUrl: song.sourceUrl,
      providerRef: song.providerRef,
      score,
    }));
}

function resultIdentity(result: SearchResult): string {
  const title = normalizeText(result.title).replace(/\b(ao vivo|live|lyrics|letra|official)\b/g, '').trim();
  const artist = normalizeText(result.artist).replace(/\b(feat|ft)\b.*$/g, '').trim();
  return `${title}|${artist}`;
}

function dedupeResults(results: SearchResult[], limit: number): SearchResult[] {
  const best = new Map<string, SearchResult>();
  for (const result of results) {
    if (!result.title.trim()) continue;
    const key = resultIdentity(result);
    const current = best.get(key);
    if (!current || result.score > current.score || (result.sourceUrl && !current.sourceUrl)) {
      best.set(key, result);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function remoteQuery(params: SearchQuery): string {
  return [params.artist, params.title, params.query].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function customSearch(params: SearchQuery, limit: number): Promise<SearchResult[]> {
  const config = getProxyConfig().providers.customApi;
  if (!config.enabled || !config.endpointUrl) return [];
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(config.customHeaders || {}) };
  if (config.authHeader) headers.Authorization = config.authHeader;

  let url = config.endpointUrl;
  const init: RequestInit = { method: config.method, headers, signal: AbortSignal.timeout(6500) };
  if (config.method === 'GET') {
    const parsed = new URL(url);
    parsed.searchParams.set('query', params.query || '');
    if (params.artist) parsed.searchParams.set('artist', params.artist);
    if (params.title) parsed.searchParams.set('title', params.title);
    parsed.searchParams.set('limit', String(limit));
    url = parsed.toString();
  } else {
    init.body = JSON.stringify({ action: 'search', ...params, limit });
  }

  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Custom API HTTP ${response.status}`);
  const payload: any = await response.json();
  const array = payload?.data?.results || payload?.results || payload?.data || [];
  if (!Array.isArray(array)) return [];
  return array.slice(0, limit).map((item: any, index: number) => ({
    id: String(item.id || `custom-${index}-${Date.now()}`),
    title: String(item.title || item.name || ''),
    artist: String(item.artist || item.author || 'Artista'),
    album: typeof item.album === 'string' ? item.album : undefined,
    preview: String(item.preview || 'Resultado da API personalizada'),
    theme: Array.isArray(item.theme) ? item.theme.map(String) : undefined,
    source: 'custom_api',
    sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : undefined,
    providerRef: item.providerRef != null ? String(item.providerRef) : undefined,
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : 55 - index,
  }));
}

async function customGet(params: LyricsRequest): Promise<GospelSong | null> {
  const config = getProxyConfig().providers.customApi;
  if (!config.enabled || !config.endpointUrl) return null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(config.customHeaders || {}) };
  if (config.authHeader) headers.Authorization = config.authHeader;
  let url = config.endpointUrl;
  const init: RequestInit = { method: config.method, headers, signal: AbortSignal.timeout(6500) };
  if (config.method === 'GET') {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(params)) if (value) parsed.searchParams.set(key, String(value));
    url = parsed.toString();
  } else {
    init.body = JSON.stringify({ action: 'get', ...params });
  }
  const response = await fetch(url, init);
  if (!response.ok) return null;
  const payload: any = await response.json();
  const data = payload?.data?.song || payload?.song || payload?.data || payload;
  const lyrics = data?.fullLyrics || data?.lyrics || readPath(payload, config.responsePath || '');
  if (typeof lyrics !== 'string' || !lyrics.trim()) return null;
  return enrichSong({
    id: String(data?.id || params.id || `custom-${Date.now()}`),
    title: String(data?.title || params.title || 'Música'),
    artist: String(data?.artist || params.artist || 'Artista'),
    album: typeof data?.album === 'string' ? data.album : undefined,
    fullLyrics: lyrics,
    source: 'custom_api',
    sourceUrl: typeof data?.sourceUrl === 'string' ? data.sourceUrl : params.sourceUrl,
    extractionMethod: 'api',
    fetchedAt: new Date().toISOString(),
  });
}

function readPath(source: any, path: string): any {
  if (!path) return undefined;
  return path.split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

export async function searchGospelSongs(params: SearchQuery): Promise<{
  results: SearchResult[];
  total: number;
  provider: string;
  cached: boolean;
}> {
  const limit = Math.max(1, Math.min(Number(params.limit) || 12, 25));
  const normalizedParams = {
    query: String(params.query || '').trim().slice(0, 160),
    artist: String(params.artist || '').trim().slice(0, 120),
    title: String(params.title || '').trim().slice(0, 160),
    theme: String(params.theme || '').trim().slice(0, 80),
    provider: String(params.provider || '').trim(),
    limit,
  };
  const key = cacheKey('search-v2', normalizedParams);
  const cached = getFromCache<Omit<Awaited<ReturnType<typeof searchGospelSongs>>, 'cached'>>(key);
  if (cached) return { ...cached, cached: true };

  const config = getProxyConfig();
  const desiredProvider = normalizedParams.provider || config.defaultProvider;
  const localAllowed = desiredProvider === 'multi-provider' || desiredProvider === 'built-in' || desiredProvider === 'database';
  const results: SearchResult[] = localAllowed ? localSearch(normalizedParams, limit) : [];
  const query = remoteQuery(normalizedParams);

  if (query && desiredProvider !== 'built-in' && desiredProvider !== 'database') {
    const jobs: { name: string; run: () => Promise<SearchResult[]> }[] = [];
    const allow = (provider: string) => desiredProvider === 'multi-provider' || desiredProvider === provider;

    if (allow('letras_mus_br') && config.providers.letrasMusBr.enabled && providerAvailable('letras_mus_br')) {
      jobs.push({
        name: 'letras_mus_br',
        run: () => searchLetrasMusBr(config.providers.letrasMusBr.baseUrl, query, limit, config.providers.letrasMusBr.timeoutMs),
      });
    }
    if (allow('genius') && config.providers.genius.enabled && providerAvailable('genius')) {
      jobs.push({
        name: 'genius',
        run: async () => {
          if (config.providers.genius.accessToken) {
            try {
              const apiResults = await searchGenius(config.providers.genius.baseUrl, config.providers.genius.accessToken, query, limit, config.providers.genius.timeoutMs);
              if (apiResults.length) return apiResults;
            } catch { /* fallback web abaixo */ }
          }
          return searchGeniusWeb(config.providers.genius.webBaseUrl, query, limit, config.providers.genius.timeoutMs);
        },
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
              const song = await fetchVagalumeSong(
                config.providers.vagalume.baseUrl,
                config.providers.vagalume.apiKey,
                normalizedParams.artist,
                titleQuery,
                config.providers.vagalume.timeoutMs
              );
              if (song) {
                const enriched = enrichSong(song);
                setInCache(cacheKey('lyrics-v2', { artist: song.artist, title: song.title, source: 'vagalume' }), enriched, 'lyrics');
                return [{
                  id: song.id,
                  title: song.title,
                  artist: song.artist,
                  preview: 'Resultado confirmado pela API Vagalume',
                  source: song.source,
                  sourceUrl: song.sourceUrl,
                  score: 94,
                } satisfies SearchResult];
              }
            } catch { /* fallback web abaixo */ }
          }
          try {
            const indexed = await searchVagalumeExcerpt(
              config.providers.vagalume.baseUrl,
              config.providers.vagalume.webBaseUrl,
              query,
              limit,
              config.providers.vagalume.timeoutMs,
            );
            if (indexed.length) return indexed;
          } catch { /* fallback HTML abaixo */ }
          return searchVagalumeWeb(
            config.providers.vagalume.webBaseUrl,
            titleQuery || query,
            normalizedParams.artist,
            limit,
            config.providers.vagalume.timeoutMs,
          );
        },
      });
    }

    const settled = await Promise.allSettled(jobs.map(job => job.run()));
    settled.forEach((outcome, index) => {
      const name = jobs[index]?.name || 'unknown';
      if (outcome.status === 'fulfilled') {
        providerSucceeded(name);
        results.push(...outcome.value);
      } else {
        providerFailed(name);
      }
    });

  }

  const merged = dedupeResults(results, limit);
  const response = {
    results: merged,
    total: merged.length,
    provider: desiredProvider === 'multi-provider' ? 'multi-provider' : desiredProvider,
  };
  setInCache(key, response, 'search');
  return { ...response, cached: false };
}

export interface LyricsRequest {
  id?: string;
  artist?: string;
  title?: string;
  provider?: string;
  sourceUrl?: string;
  providerRef?: string;
}

function localSong(params: LyricsRequest): GospelSong | null {
  if (params.id) {
    const found = GOSPEL_DATABASE.find(song => song.id === params.id);
    if (found) return found;
  }
  const artist = normalizeText(params.artist || '');
  const title = normalizeText(params.title || '');
  if (!artist && !title) return null;
  return GOSPEL_DATABASE.find(song => {
    const songArtist = normalizeText(song.artist);
    const songTitle = normalizeText(song.title);
    if (artist && title) return songArtist.includes(artist) && songTitle.includes(title);
    if (title) return songTitle.includes(title);
    return songArtist.includes(artist);
  }) || null;
}

export async function getGospelSongLyrics(params: LyricsRequest): Promise<{
  song: GospelSong | null;
  provider: string;
  cached: boolean;
}> {
  const normalized: LyricsRequest = {
    id: params.id?.trim().slice(0, 200),
    artist: params.artist?.trim().slice(0, 120),
    title: params.title?.trim().slice(0, 160),
    provider: params.provider?.trim().slice(0, 40),
    sourceUrl: params.sourceUrl?.trim().slice(0, 1200),
    providerRef: params.providerRef?.trim().slice(0, 200),
  };
  const key = cacheKey('lyrics-v2', normalized);
  const cached = getFromCache<GospelSong>(key);
  if (cached) return { song: cached, provider: cached.source, cached: true };

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
      if (scraped) {
        const song = enrichSong({
          ...scraped,
          title: normalized.title || scraped.title,
          artist: normalized.artist || scraped.artist,
        });
        setInCache(key, song, 'lyrics');
        providerSucceeded(source);
        return { song, provider: source, cached: false };
      }
    } catch {
      providerFailed(source);
    }
  }

  if ((desiredProvider === 'multi-provider' || desiredProvider === 'vagalume') &&
      config.providers.vagalume.enabled && normalized.artist && normalized.title) {
    if (config.providers.vagalume.apiKey) {
      try {
        const fetched = await fetchVagalumeSong(
          config.providers.vagalume.baseUrl,
          config.providers.vagalume.apiKey,
          normalized.artist,
          normalized.title,
          config.providers.vagalume.timeoutMs
        );
        if (fetched) {
          const song = enrichSong(fetched);
          setInCache(key, song, 'lyrics');
          providerSucceeded('vagalume');
          return { song, provider: 'vagalume', cached: false };
        }
      } catch { /* fallback web abaixo */ }
    }
    try {
      let indexedMatches: SearchResult[] = [];
      try {
        indexedMatches = await searchVagalumeExcerpt(
          config.providers.vagalume.baseUrl,
          config.providers.vagalume.webBaseUrl,
          `${normalized.artist} ${normalized.title}`.trim(),
          4,
          config.providers.vagalume.timeoutMs,
        );
      } catch { /* o índice sem chave é opcional; a página web continua disponível */ }

      // O índice fornece metadados muito bons, mas o slug derivado nem sempre é a URL canônica.
      // Cada candidato é validado individualmente; uma URL inválida não cancela o provider inteiro.
      for (const match of indexedMatches) {
        if (!match.sourceUrl) continue;
        try {
          const scraped = await fetchScrapedSong(match.sourceUrl, 'vagalume', config.providers.vagalume.timeoutMs);
          if (scraped) {
            const song = enrichSong({ ...scraped, title: normalized.title || scraped.title, artist: normalized.artist || scraped.artist });
            setInCache(key, song, 'lyrics');
            providerSucceeded('vagalume');
            return { song, provider: 'vagalume', cached: false };
          }
        } catch { /* tenta o próximo índice e depois a descoberta web canônica */ }
      }

      const webMatches = await searchVagalumeWeb(
        config.providers.vagalume.webBaseUrl,
        normalized.title,
        normalized.artist,
        6,
        config.providers.vagalume.timeoutMs,
      );
      for (const match of webMatches) {
        if (!match.sourceUrl) continue;
        try {
          const scraped = await fetchScrapedSong(match.sourceUrl, 'vagalume', config.providers.vagalume.timeoutMs);
          if (scraped) {
            const song = enrichSong({ ...scraped, title: normalized.title || scraped.title, artist: normalized.artist || scraped.artist });
            setInCache(key, song, 'lyrics');
            providerSucceeded('vagalume');
            return { song, provider: 'vagalume', cached: false };
          }
        } catch { /* candidato web individual inválido; continua */ }
      }
      providerFailed('vagalume');
    } catch {
      providerFailed('vagalume');
    }
  }

  const query = [normalized.artist, normalized.title].filter(Boolean).join(' ').trim();
  if (query && (desiredProvider === 'multi-provider' || desiredProvider === 'genius') && config.providers.genius.enabled) {
    try {
      let matches: SearchResult[] = [];
      if (config.providers.genius.accessToken) {
        try {
          matches = await searchGenius(
            config.providers.genius.baseUrl,
            config.providers.genius.accessToken,
            query,
            3,
            config.providers.genius.timeoutMs,
          );
        } catch { /* fallback web abaixo */ }
      }
      if (!matches.length) {
        matches = await searchGeniusWeb(config.providers.genius.webBaseUrl, query, 3, config.providers.genius.timeoutMs);
      }
      for (const match of matches) {
        if (!match.sourceUrl) continue;
        const scraped = await fetchScrapedSong(match.sourceUrl, 'genius', config.providers.genius.timeoutMs);
        if (scraped) {
          const song = enrichSong(scraped);
          setInCache(key, song, 'lyrics');
          providerSucceeded('genius');
          return { song, provider: 'genius', cached: false };
        }
      }
    } catch {
      providerFailed('genius');
    }
  }

  if (query && (desiredProvider === 'multi-provider' || desiredProvider === 'letras_mus_br') && config.providers.letrasMusBr.enabled) {
    try {
      const matches = await searchLetrasMusBr(
        config.providers.letrasMusBr.baseUrl,
        query,
        4,
        config.providers.letrasMusBr.timeoutMs
      );
      for (const match of matches) {
        if (!match.sourceUrl) continue;
        const scraped = await fetchScrapedSong(match.sourceUrl, 'letras_mus_br', config.providers.letrasMusBr.timeoutMs);
        if (scraped) {
          const song = enrichSong({ ...scraped, title: normalized.title || scraped.title, artist: normalized.artist || scraped.artist });
          setInCache(key, song, 'lyrics');
          providerSucceeded('letras_mus_br');
          return { song, provider: 'letras_mus_br', cached: false };
        }
      }
    } catch {
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
    } catch {
      providerFailed('custom');
    }
  }

  return { song: null, provider: desiredProvider, cached: false };
}
