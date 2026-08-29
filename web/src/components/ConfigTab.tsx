import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  ShieldCheck, 
  Database, 
  Clock, 
  Layers,
  Key,
  Globe
} from 'lucide-react';
import type { ProxyConfig } from '../../server/types.ts';

export const ConfigTab: React.FC = () => {
  const [config, setConfig] = useState<ProxyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/config');
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/proxy/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: 'Configurações do proxy salvas com sucesso!' });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', text: 'Falha ao salvar configurações.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro de conexão' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Deseja realmente redefinir as configurações para os padrões?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/config/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setStatusMessage({ type: 'success', text: 'Configurações redefinidas com sucesso.' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao resetar:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs">
        <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Carregando configurações do proxy...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">
              Configurações do Servidor Proxy Gospel
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ajuste os provedores de busca, chaves de acesso, tempo de cache e regras CORS
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-reset-config"
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Redefinir Padrões</span>
          </button>

          <button
            id="btn-save-config"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-amber-500/20 active:scale-95"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Salvar Alterações</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Grid de Seções de Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provedores de Letras */}
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Provedores & Fontes de Busca
            </h3>
          </div>

          {/* Vagalume API */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-slate-200">1. Vagalume API</span>
                <p className="text-[11px] text-slate-500">Músicas gospel nacionais e hinos</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.providers.vagalume.enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      providers: {
                        ...config.providers,
                        vagalume: { ...config.providers.vagalume, enabled: e.target.checked },
                      },
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
            <input
              type="text"
              placeholder="Chave de API do Vagalume (Opcional)"
              value={config.providers.vagalume.apiKey || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  providers: {
                    ...config.providers,
                    vagalume: { ...config.providers.vagalume, apiKey: e.target.value },
                  },
                })
              }
              className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
            />
          </div>

          {/* Genius API */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-slate-200">2. Genius API</span>
                <p className="text-[11px] text-slate-500">Versões internacionais (Bethel, Hillsong) e nacionais</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.providers.genius.enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      providers: {
                        ...config.providers,
                        genius: { ...config.providers.genius, enabled: e.target.checked },
                      },
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
            <input
              type="text"
              placeholder="Genius Client Access Token"
              value={config.providers.genius.accessToken || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  providers: {
                    ...config.providers,
                    genius: { ...config.providers.genius, accessToken: e.target.value },
                  },
                })
              }
              className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
            />
          </div>

          {/* Letras.mus.br */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-xs text-slate-200">3. Letras.mus.br Scraper / Fallback</span>
              <p className="text-[11px] text-slate-500">Extração direta de páginas de letras</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.providers.letrasMusBr.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    providers: {
                      ...config.providers,
                      letrasMusBr: { ...config.providers.letrasMusBr, enabled: e.target.checked },
                    },
                  })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Custom API */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-slate-200">4. API Customizada / ChatGPT Backend</span>
                <p className="text-[11px] text-slate-500">Endpoint próprio ou banco de dados externo</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.providers.customApi.enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      providers: {
                        ...config.providers,
                        customApi: { ...config.providers.customApi, enabled: e.target.checked },
                      },
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
            {config.providers.customApi.enabled && (
              <input
                type="text"
                placeholder="https://minha-api-gospel.com/v1/lyrics"
                value={config.providers.customApi.endpointUrl || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    providers: {
                      ...config.providers,
                      customApi: { ...config.providers.customApi, endpointUrl: e.target.value },
                    },
                  })
                }
                className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
              />
            )}
          </div>
        </div>

        {/* Desempenho, Cache & Filtros */}
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Desempenho, Cache & Normalização
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            {/* Cache TTL */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Cache em Memória</span>
                <input
                  type="checkbox"
                  checked={config.cache.enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cache: { ...config.cache, enabled: e.target.checked },
                    })
                  }
                  className="rounded bg-slate-800 text-amber-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Tempo de Vida (TTL em segundos):</span>
                <input
                  type="number"
                  value={config.cache.ttlSeconds}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cache: { ...config.cache, ttlSeconds: Number(e.target.value) || 3600 },
                    })
                  }
                  className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right font-mono"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Máximo de entradas:</span>
                <input
                  type="number"
                  min={20}
                  max={5000}
                  value={config.cache.maxEntries}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cache: { ...config.cache, maxEntries: Math.max(20, Math.min(5000, Number(e.target.value) || 500)) },
                    })
                  }
                  className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right font-mono"
                />
              </div>
            </div>

            {/* Rate Limiting */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Limite de Requisições (Rate Limit)</span>
                <input
                  type="checkbox"
                  checked={config.rateLimit.enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      rateLimit: { ...config.rateLimit, enabled: e.target.checked },
                    })
                  }
                  className="rounded bg-slate-800 text-amber-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Máx. Requisições por Minuto:</span>
                <input
                  type="number"
                  value={config.rateLimit.maxRequestsPerMin}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      rateLimit: { ...config.rateLimit, maxRequestsPerMin: Number(e.target.value) || 60 },
                    })
                  }
                  className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right font-mono"
                />
              </div>
            </div>

            {/* Filtros e Enriquecimento */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <span className="font-bold text-slate-200 block mb-1">
                Filtros & Enriquecimento Automático:
              </span>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.filters.cleanHTML}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      filters: { ...config.filters, cleanHTML: e.target.checked },
                    })
                  }
                  className="rounded bg-slate-800 text-amber-500"
                />
                <span className="text-slate-300">Limpar tags HTML e caracteres indesejados (&lt;br&gt;, &amp;nbsp;)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.filters.autoTagThemes}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      filters: { ...config.filters, autoTagThemes: e.target.checked },
                    })
                  }
                  className="rounded bg-slate-800 text-amber-500"
                />
                <span className="text-slate-300">Auto-identificar temas gospel (Adoração, Gratidão, Cruz)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.filters.formatVerses}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      filters: { ...config.filters, formatVerses: e.target.checked },
                    })
                  }
                  className="rounded bg-slate-800 text-amber-500"
                />
                <span className="text-slate-300">Estruturar estrofes, refrões e pontes separadamente</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
