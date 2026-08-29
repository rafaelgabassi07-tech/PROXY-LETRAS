import React from 'react';
import { 
  Activity, 
  Sparkles, 
  Terminal, 
  Settings, 
  FileText, 
  Globe, 
  Zap, 
  Copy, 
  Check, 
  RefreshCw,
  Radio
} from 'lucide-react';
import { ActiveTab, HealthData } from '../types/client.ts';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  health: HealthData | null;
  loadingHealth: boolean;
  refreshHealth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  health,
  loadingHealth,
  refreshHealth,
}) => {
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  const copyAppUrl = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'lyrics-tester',
      label: 'Testador de Letras',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'raw-proxy',
      label: 'Proxy HTTP Direto',
      icon: <Globe className="w-4 h-4" />,
    },
    {
      id: 'chatgpt-guide',
      label: 'Assistente ChatGPT',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      badge: 'Prompts',
    },
    {
      id: 'config',
      label: 'Configurações & APIs',
      icon: <Settings className="w-4 h-4" />,
    },
    {
      id: 'logs',
      label: 'Logs de Tráfego',
      icon: <Activity className="w-4 h-4" />,
      badge: health?.cache ? `${health.cache.size} cache` : undefined,
    },
  ];

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      {/* Barra superior de status do servidor */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 border-b border-slate-800/50 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-lg tracking-wider">
              ✝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 tracking-tight">
                  Gospel Lyrics Proxy Hub
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Proxy Online
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Servidor de busca, extração e normalização de letras gospel pronto para ChatGPT
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs">
            <button
              onClick={copyAppUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-all font-mono"
              title="Copiar URL base do servidor Proxy"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">URL Copiada!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Base: /api/proxy</span>
                </>
              )}
            </button>

            <button
              onClick={refreshHealth}
              disabled={loadingHealth}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-all"
              title="Atualizar status do servidor"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingHealth ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Status</span>
            </button>

            {health && (
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800 text-slate-400 font-mono">
                <span className="flex items-center gap-1 text-slate-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {health.activeProviders.length} Provedores
                </span>
                <span className="text-slate-600">•</span>
                <span>Cache: {health.cache?.size || 0} itens</span>
              </div>
            )}
          </div>
        </div>

        {/* Abas de Navegação */}
        <nav className="flex items-center space-x-1 overflow-x-auto py-2 scrollbar-none">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`tab-btn-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      isActive
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
