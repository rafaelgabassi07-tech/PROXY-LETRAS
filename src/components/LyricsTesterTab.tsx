import React, { useState } from 'react';
import { 
  Search, 
  Music, 
  BookOpen, 
  Tag, 
  Clock, 
  Sparkles, 
  Code, 
  Copy, 
  Check, 
  Play, 
  FileText, 
  ListMusic, 
  ArrowRight,
  Database,
  Eye,
  Sliders
} from 'lucide-react';
import type { GospelSong, SearchResult } from '../../server/types.ts';
import { QuickSongPicker } from './QuickSongPicker.tsx';

export const LyricsTesterTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('A Casa É Sua');
  const [artistQuery, setArtistQuery] = useState('');
  const [themeFilter, setThemeFilter] = useState('');
  const [showChords, setShowChords] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<GospelSong | null>(null);
  const [activeView, setActiveView] = useState<'formatted' | 'sections' | 'json' | 'curl'>('formatted');
  
  const [lastSearchMeta, setLastSearchMeta] = useState<{
    latencyMs: number;
    cached: boolean;
    provider: string;
    total: number;
  } | null>(null);

  const [lastLyricsMeta, setLastLyricsMeta] = useState<{
    latencyMs: number;
    cached: boolean;
    provider: string;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);

  const handleSearch = async (overrideQuery?: string, overrideArtist?: string) => {
    const q = overrideQuery !== undefined ? overrideQuery : searchQuery;
    const a = overrideArtist !== undefined ? overrideArtist : artistQuery;

    setLoadingSearch(true);
    try {
      const res = await fetch('/api/proxy/lyrics/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          artist: a,
          theme: themeFilter,
          limit: 10,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data || []);
        setLastSearchMeta({
          latencyMs: data.latencyMs,
          cached: data.cached,
          provider: data.provider,
          total: data.count,
        });

        // Se houver resultados e nenhuma música estiver selecionada, busca a primeira
        if (data.data && data.data.length > 0) {
          fetchLyricsDetails(data.data[0]);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar músicas:', err);
    } finally {
      setLoadingSearch(false);
    }
  };

  const fetchLyricsDetails = async (result: Pick<SearchResult, 'id' | 'artist' | 'title' | 'source' | 'sourceUrl' | 'providerRef'>) => {
    setLoadingLyrics(true);
    try {
      const res = await fetch('/api/proxy/lyrics/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, artist: result.artist, title: result.title, provider: result.source, sourceUrl: result.sourceUrl, providerRef: result.providerRef }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedSong(data.data);
        setLastLyricsMeta({
          latencyMs: data.latencyMs,
          cached: data.cached,
          provider: data.provider,
        });
      }
    } catch (err) {
      console.error('Erro ao carregar letra:', err);
    } finally {
      setLoadingLyrics(false);
    }
  };

  const handleQuickSongSelect = (artist: string, title: string) => {
    setSearchQuery(title);
    setArtistQuery(artist);
    handleSearch(title, artist);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const generateCurlCommand = () => {
    const origin = window.location.origin;
    if (selectedSong) {
      return `curl -X POST "${origin}/api/proxy/lyrics/get" \\
  -H "Content-Type: application/json" \\
  -d '{"id": "${selectedSong.id}", "artist": "${selectedSong.artist}", "title": "${selectedSong.title}"}'`;
    }
    return `curl -X POST "${origin}/api/proxy/lyrics/search" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "${searchQuery || 'Casa Worship'}"}'`;
  };

  return (
    <div className="space-y-6">
      {/* Amostras Rápidas */}
      <QuickSongPicker onSelectSong={handleQuickSongSelect} />

      {/* Barra de Pesquisa e Filtros */}
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Testar Endpoint de Busca de Letras (/api/proxy/lyrics/search)
            </h2>
          </div>
          {lastSearchMeta && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                ⏱ {lastSearchMeta.latencyMs}ms
              </span>
              <span className={`px-2 py-0.5 rounded border ${
                lastSearchMeta.cached 
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' 
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}>
                {lastSearchMeta.cached ? '⚡ Cache Hit' : '🌐 Fresh Fetch'}
              </span>
            </div>
          )}
        </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Nome da Música ou Trecho da Letra
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="input-song-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: A Casa É Sua, Lugar Secreto, Me esvazio de mim..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-slate-100 placeholder-slate-500 transition-all font-sans"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Artista / Ministério (Opcional)
              </label>
              <input
                type="text"
                id="input-artist-filter"
                value={artistQuery}
                onChange={(e) => setArtistQuery(e.target.value)}
                placeholder="Ex: Gabriela Rocha, Morada..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-slate-100 placeholder-slate-500 transition-all"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Tema / Categoria
              </label>
              <select
                id="select-theme-filter"
                value={themeFilter}
                onChange={(e) => setThemeFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-slate-100 transition-all"
              >
                <option value="">Todos os temas</option>
                <option value="Adoração">Adoração</option>
                <option value="Avivamento">Avivamento</option>
                <option value="Gratidão">Gratidão</option>
                <option value="Intimidade">Intimidade & Oração</option>
                <option value="Cruz">Cruz & Salvação</option>
                <option value="Esperança">Esperança & Fé</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowChords(!showChords)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  showChords
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>{showChords ? 'Exibindo Cifras' : 'Ocultar Cifras'}</span>
              </button>
            </div>

            <button
              type="submit"
              id="btn-trigger-search"
              disabled={loadingSearch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wide transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
            >
              {loadingSearch ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Buscando no Proxy...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Enviar Requisição de Busca</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Grid Principal: Lista de Resultados à Esquerda, Visualizador de Letra à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Resultados da Busca */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Resultados Encontrados ({searchResults.length})
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                /api/proxy/lyrics/search
              </span>
            </div>

            {searchResults.length === 0 ? (
              <div className="text-center py-8 px-4 text-slate-500 text-xs">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <p>Nenhuma música pesquisada ainda.</p>
                <p className="mt-1 text-slate-600">
                  Digite um termo acima ou selecione uma amostra rápida.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {searchResults.map((song) => {
                  const isSelected = selectedSong?.id === song.id;
                  return (
                    <button
                      key={song.id}
                      id={`song-result-${song.id}`}
                      onClick={() => fetchLyricsDetails(song)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-sm shadow-amber-500/10'
                          : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-xs text-slate-100 truncate">
                          {song.title}
                        </div>
                        {song.key && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-amber-400 border border-slate-700">
                            Tom: {song.key}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {song.artist} {song.album ? `• ${song.album}` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 italic line-clamp-1 mt-1 font-mono">
                        "{song.preview}"
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {(song.theme || []).map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 font-sans"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Painel Direito: Letra Formatada & Detalhes da Música */}
        <div className="lg:col-span-7">
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            {/* Header do Visualizador */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {selectedSong ? selectedSong.title : 'Selecione uma música gospel'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedSong ? selectedSong.artist : 'Aguardando requisição...'}
                  </p>
                </div>
              </div>

              {/* Botões de Visualização */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  id="view-formatted-btn"
                  onClick={() => setActiveView('formatted')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all ${
                    activeView === 'formatted'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Letra Completa
                </button>
                <button
                  id="view-sections-btn"
                  onClick={() => setActiveView('sections')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all ${
                    activeView === 'sections'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Estrofes
                </button>
                <button
                  id="view-json-btn"
                  onClick={() => setActiveView('json')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all ${
                    activeView === 'json'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  JSON Bruto
                </button>
                <button
                  id="view-curl-btn"
                  onClick={() => setActiveView('curl')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all ${
                    activeView === 'curl'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  cURL
                </button>
              </div>
            </div>

            {/* Conteúdo do Visualizador */}
            {loadingLyrics ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs text-slate-400">Processando resposta do Proxy Gospel...</p>
              </div>
            ) : !selectedSong ? (
              <div className="py-20 text-center text-slate-500 text-xs px-4">
                <Music className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
                <p>Nenhuma música selecionada no momento.</p>
                <p className="mt-1 text-slate-600">
                  Faça uma busca à esquerda para inspecionar a letra e os metadados.
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Metadados Gospel (Tom, BPM, Referências Bíblicas, Temas) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tom</span>
                    <span className="font-mono text-amber-400 font-bold">{selectedSong.key || 'N/A'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">BPM</span>
                    <span className="font-mono text-slate-200">{selectedSong.bpm ? `${selectedSong.bpm} bpm` : 'N/A'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Fonte</span>
                    <span className="font-mono text-emerald-400">{selectedSong.source}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Lançamento</span>
                    <span className="font-mono text-slate-200">{selectedSong.releaseYear || 'N/A'}</span>
                  </div>
                </div>

                {/* Referências Bíblicas */}
                {selectedSong.bibleReferences && selectedSong.bibleReferences.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Passagens Bíblicas Relacionadas:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedSong.bibleReferences.map((ref, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-mono text-[11px] border border-amber-400/20"
                        >
                          📖 {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visualizador da Letra de acordo com a aba ativa */}
                {activeView === 'formatted' && (
                  <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 max-h-[450px] overflow-y-auto font-sans leading-relaxed">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800 text-xs text-slate-500">
                      <span>{showChords ? 'Letra com Cifras Musicais' : 'Letra Limpa para Projeção / Leitura'}</span>
                      <button
                        onClick={() => copyToClipboard(showChords && selectedSong.chordsLyrics ? selectedSong.chordsLyrics : selectedSong.fullLyrics)}
                        className="flex items-center gap-1 text-slate-400 hover:text-amber-300 transition-all font-mono"
                      >
                        {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCode ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>

                    <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed selection:bg-amber-500/30">
                      {showChords && selectedSong.chordsLyrics
                        ? selectedSong.chordsLyrics
                        : selectedSong.fullLyrics}
                    </pre>
                  </div>
                )}

                {activeView === 'sections' && (
                  <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                    {(selectedSong.sections || []).map((sec, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-lg border text-xs ${
                          sec.type === 'chorus'
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : sec.type === 'bridge'
                            ? 'bg-indigo-500/10 border-indigo-500/30'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded ${
                              sec.type === 'chorus'
                                ? 'bg-amber-500/20 text-amber-300'
                                : sec.type === 'bridge'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {sec.label}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-slate-200 text-xs leading-relaxed">
                          {sec.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {activeView === 'json' && (
                  <div className="relative bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs max-h-[450px] overflow-y-auto">
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedSong, null, 2))}
                      className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? 'Copiado!' : 'Copiar JSON'}</span>
                    </button>
                    <pre className="text-emerald-400 overflow-x-auto">
                      {JSON.stringify(selectedSong, null, 2)}
                    </pre>
                  </div>
                )}

                {activeView === 'curl' && (
                  <div className="relative bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs">
                    <button
                      onClick={() => copyToClipboard(generateCurlCommand())}
                      className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? 'Copiado!' : 'Copiar cURL'}</span>
                    </button>
                    <div className="text-slate-400 mb-2 font-sans text-xs">
                      Comando cURL pronto para executar no terminal ou importar no Postman/Insomnia:
                    </div>
                    <pre className="text-amber-300 whitespace-pre-wrap overflow-x-auto p-2 bg-slate-900 rounded border border-slate-800">
                      {generateCurlCommand()}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
