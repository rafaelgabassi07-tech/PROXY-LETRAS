import React, { useState } from 'react';
import { 
  Globe, 
  Send, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Code, 
  Clock, 
  Layers,
  Sparkles
} from 'lucide-react';

interface HeaderPair {
  key: string;
  value: string;
}

const PRESET_ENDPOINTS = [
  {
    name: 'Vagalume API - Buscar Música',
    url: 'https://api.vagalume.com.br/search.php?art=Gabriela Rocha&mus=Lugar Secreto',
    method: 'GET',
    headers: [{ key: 'Accept', value: 'application/json' }],
    body: '',
  },
  {
    name: 'Genius API - Search Gospel',
    url: 'https://api.genius.com/search?q=Casa Worship A Casa E Sua',
    method: 'GET',
    headers: [{ key: 'Accept', value: 'application/json' }],
    body: '',
  },
  {
    name: 'Endpoint Customizado (POST JSON)',
    url: 'https://httpbin.org/post',
    method: 'POST',
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'User-Agent', value: 'GospelLyricsProxy/1.0' },
    ],
    body: JSON.stringify(
      {
        action: 'fetch_lyrics',
        artist: 'Morada',
        song: 'É Tudo Sobre Você',
        genre: 'Gospel',
      },
      null,
      2
    ),
  },
];

export const RawProxyTab: React.FC = () => {
  const [targetUrl, setTargetUrl] = useState(PRESET_ENDPOINTS[0].url);
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [headers, setHeaders] = useState<HeaderPair[]>(PRESET_ENDPOINTS[0].headers);
  const [requestBody, setRequestBody] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [responseMeta, setResponseMeta] = useState<{
    status: number;
    latencyMs: number;
    targetUrl: string;
    success: boolean;
  } | null>(null);
  const [responseData, setResponseData] = useState<any>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...headers];
    updated[index][field] = val;
    setHeaders(updated);
  };

  const handleApplyPreset = (preset: typeof PRESET_ENDPOINTS[0]) => {
    setTargetUrl(preset.url);
    setMethod(preset.method as any);
    setHeaders(preset.headers);
    setRequestBody(preset.body);
  };

  const executeRawProxy = async () => {
    if (!targetUrl.trim()) return;

    setLoading(true);
    setResponseData(null);
    setResponseMeta(null);

    const headersObj: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) {
        headersObj[h.key.trim()] = h.value;
      }
    }

    let parsedBody: any = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method) && requestBody.trim()) {
      try {
        parsedBody = JSON.parse(requestBody);
      } catch {
        parsedBody = requestBody;
      }
    }

    try {
      const res = await fetch('/api/proxy/lyrics/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          method,
          headers: headersObj,
          body: parsedBody,
        }),
      });

      const data = await res.json();
      setResponseMeta({
        status: data.status || res.status,
        latencyMs: data.latencyMs || 0,
        targetUrl: data.targetUrl || targetUrl,
        success: data.success,
      });
      setResponseData(data.data !== undefined ? data.data : data);
    } catch (err: any) {
      setResponseMeta({
        status: 500,
        latencyMs: 0,
        targetUrl,
        success: false,
      });
      setResponseData({ error: err?.message || 'Erro ao enviar requisição' });
    } finally {
      setLoading(false);
    }
  };

  const copyResponseJson = () => {
    if (!responseData) return;
    navigator.clipboard.writeText(
      typeof responseData === 'string'
        ? responseData
        : JSON.stringify(responseData, null, 2)
    );
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Presets Rápidos */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Presets de Requisição para Provedores Externos
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_ENDPOINTS.map((p, idx) => (
            <button
              key={idx}
              id={`preset-btn-${idx}`}
              onClick={() => handleApplyPreset(p)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-amber-500/40 text-xs font-medium text-slate-300 hover:text-amber-300 transition-all"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Editor da Requisição */}
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Cliente Proxy HTTP Pass-through (/api/proxy/lyrics/raw)
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">
            Encaminhe requisições para qualquer API com CORS liberado
          </span>
        </div>

        {/* Linha da URL e Método */}
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            id="raw-method-select"
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-xs text-amber-400 focus:border-amber-400 transition-all sm:w-28"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>

          <input
            type="text"
            id="raw-url-input"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://api.vagalume.com.br/search.php?..."
            className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-xs font-mono text-slate-100 placeholder-slate-500 transition-all"
          />

          <button
            id="raw-send-btn"
            onClick={executeRawProxy}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wide transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Disparar Proxy</span>
              </>
            )}
          </button>
        </div>

        {/* Cabeçalhos Customizados */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Cabeçalhos HTTP (Headers):</span>
            <button
              onClick={addHeader}
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-mono text-[11px]"
            >
              <Plus className="w-3 h-3" />
              <span>Adicionar Header</span>
            </button>
          </div>

          <div className="space-y-2">
            {headers.map((h, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nome do Header (ex: Authorization)"
                  value={h.key}
                  onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-amber-400"
                />
                <input
                  type="text"
                  placeholder="Valor do Header (ex: Bearer token123)"
                  value={h.value}
                  onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-amber-400"
                />
                <button
                  onClick={() => removeHeader(idx)}
                  className="p-2 text-slate-500 hover:text-red-400 transition-all"
                  title="Remover header"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Corpo da Requisição (para POST/PUT) */}
        {['POST', 'PUT', 'PATCH'].includes(method) && (
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-semibold text-slate-400">
              Corpo da Requisição (Request Body JSON):
            </label>
            <textarea
              id="raw-body-textarea"
              rows={5}
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              placeholder='{\n  "artist": "Gabriela Rocha",\n  "song": "Lugar Secreto"\n}'
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:border-amber-400 transition-all"
            ></textarea>
          </div>
        )}
      </div>

      {/* Painel de Resposta */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Code className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Resposta do Servidor Proxy
            </h3>
          </div>

          {responseMeta && (
            <div className="flex items-center gap-2 font-mono text-xs">
              <span
                className={`px-2 py-0.5 rounded font-bold border ${
                  responseMeta.status >= 200 && responseMeta.status < 300
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-300 border-red-500/30'
                }`}
              >
                Status: {responseMeta.status}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                ⏱ {responseMeta.latencyMs}ms
              </span>
              <button
                onClick={copyResponseJson}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
              >
                {copiedResponse ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedResponse ? 'Copiado!' : 'Copiar Resposta'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-xs text-slate-400 font-mono">Encaminhando requisição pelo proxy...</p>
            </div>
          ) : responseData ? (
            <pre className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto max-h-[500px]">
              {typeof responseData === 'string'
                ? responseData
                : JSON.stringify(responseData, null, 2)}
            </pre>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
              <p>Nenhuma requisição disparada ainda.</p>
              <p className="mt-1 text-slate-600">
                Escolha um preset ou insira uma URL acima e clique em "Disparar Proxy".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
