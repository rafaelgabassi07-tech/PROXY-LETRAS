import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { LyricsTesterTab } from './components/LyricsTesterTab.tsx';
import { RawProxyTab } from './components/RawProxyTab.tsx';
import { ChatGptGuideTab } from './components/ChatGptGuideTab.tsx';
import { ConfigTab } from './components/ConfigTab.tsx';
import { TrafficLogsTab } from './components/TrafficLogsTab.tsx';
import { ActiveTab, HealthData } from './types/client.ts';
import { Terminal, Shield, Sparkles, BookOpen, Layers } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('lyrics-tester');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Erro ao verificar saúde do servidor:', err);
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Cabeçalho do Hub */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        loadingHealth={loadingHealth}
        refreshHealth={fetchHealth}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'lyrics-tester' && <LyricsTesterTab />}
        {activeTab === 'raw-proxy' && <RawProxyTab />}
        {activeTab === 'chatgpt-guide' && <ChatGptGuideTab />}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'logs' && <TrafficLogsTab />}
      </main>

      {/* Rodapé Informativo */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 mt-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
              ✝
            </div>
            <span>Gospel Lyrics Proxy Hub • Pronto para ChatGPT, Vagalume, Genius e Scrapers</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span className="hover:text-amber-300 transition-colors">POST /api/proxy/lyrics/search</span>
            <span>•</span>
            <span className="hover:text-amber-300 transition-colors">POST /api/proxy/lyrics/get</span>
            <span>•</span>
            <span className="hover:text-amber-300 transition-colors">POST /api/proxy/lyrics/raw</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
