import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Trash2, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Database,
  Filter,
  Eye,
  Radio
} from 'lucide-react';
import { ProxyTrafficLog } from '../../server/types.ts';

export const TrafficLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<ProxyTrafficLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<ProxyTrafficLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/logs');
      const data = await res.json();
      if (data.success && data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Erro ao buscar logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      await fetch('/api/proxy/logs/clear', { method: 'POST' });
      setLogs([]);
      setSelectedLog(null);
    } catch (err) {
      console.error('Erro ao limpar logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000); // Polling a cada 3 segundos
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(l => {
    if (filterMethod === 'ALL') return true;
    return l.method === filterMethod;
  });

  return (
    <div className="space-y-6">
      {/* Header com Ações */}
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">
              Inspetor de Tráfego em Tempo Real
            </h2>
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitoramento de requisições, latência em milissegundos e respostas de provedores
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro de Método */}
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
          >
            <option value="ALL">Todos os métodos</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            title="Atualizar logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-400 border border-slate-700 text-xs transition-all"
            title="Limpar logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Tabela de Logs e Detalhes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-300">
            <span>Histórico de Requisições ({filteredLogs.length})</span>
            <span className="font-mono text-[10px] text-slate-500">Últimas 50 operações</span>
          </div>

          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-xs">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <p>Nenhum log registrado ainda.</p>
                <p className="mt-1 text-slate-600">
                  Faça requisições na aba 'Testador de Letras' para visualizar o tráfego aqui.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Método</th>
                    <th className="py-2.5 px-3">Endpoint / Path</th>
                    <th className="py-2.5 px-3">Provedor</th>
                    <th className="py-2.5 px-3 text-right">Latência</th>
                    <th className="py-2.5 px-3 text-right">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLogs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;
                    const isSuccess = log.status >= 200 && log.status < 300;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-500/15 text-amber-200'
                            : 'hover:bg-slate-800/60 text-slate-300'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSuccess
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {isSuccess ? '200 OK' : `${log.status}`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-amber-400">{log.method}</td>
                        <td className="py-2.5 px-3 font-sans truncate max-w-[200px]" title={log.path}>
                          {log.path}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] border border-slate-800">
                            {log.targetProvider}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {log.latencyMs}ms
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500 text-[10px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Painel Lateral: Inspecionar Log Específico */}
        <div className="lg:col-span-4 bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-xl">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Eye className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Detalhes do Payload
            </h3>
          </div>

          {selectedLog ? (
            <div className="mt-4 space-y-4 font-mono text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="text-slate-500 text-[10px] uppercase">ID do Registro</div>
                <div className="text-slate-300 text-[11px] break-all">{selectedLog.id}</div>
                
                <div className="text-slate-500 text-[10px] uppercase mt-2">Timestamp</div>
                <div className="text-slate-300 text-[11px]">{selectedLog.timestamp}</div>

                <div className="text-slate-500 text-[10px] uppercase mt-2">Cache Status</div>
                <div className="text-slate-300 text-[11px]">
                  {selectedLog.cached ? '⚡ Hit (Memória)' : '🌐 Miss (Busca Direta)'}
                </div>
              </div>

              {selectedLog.queryParam && (
                <div>
                  <span className="text-[11px] font-bold text-slate-400 block mb-1">
                    Parâmetros Enviados:
                  </span>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.queryParam}
                  </pre>
                </div>
              )}

              {selectedLog.error && (
                <div>
                  <span className="text-[11px] font-bold text-red-400 block mb-1">
                    Erro Registrado:
                  </span>
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-[11px]">
                    {selectedLog.error}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 text-xs">
              <p>Clique em uma linha da tabela para ver o payload detalhado.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
