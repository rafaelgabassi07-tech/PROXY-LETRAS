import React, { useState } from 'react';
import { 
  Sparkles, 
  Copy, 
  Check, 
  FileCode, 
  FolderTree, 
  HelpCircle, 
  ArrowRight,
  Terminal,
  Cpu,
  Key
} from 'lucide-react';

interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  targetFiles: string[];
  promptText: string;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'vagalume-integration',
    title: '1. Integração Completa com a API do Vagalume',
    category: 'APIs Nacionais',
    description: 'Instrui o ChatGPT a conectar o proxy com a API pública do Vagalume para retornar letras oficiais e traduções.',
    targetFiles: ['/server/lyricsService.ts', '/server/proxyConfig.ts', '/.env.example'],
    promptText: `Olá ChatGPT! Estou usando um servidor proxy em TypeScript para buscar letras de músicas gospel.
O projeto tem o arquivo '/server/lyricsService.ts' e '/server/proxyConfig.ts'.

Por favor, gere a implementação da função que consulta a API do Vagalume:
Endpoint: 'https://api.vagalume.com.br/search.php?art={artista}&mus={musica}&apikey={chave}'

Requisitos:
1. Fazer o fetch com timeout de 5 segundos.
2. Tratar quando a música não for encontrada (status != 'exact' ou 'notfound').
3. Limpar quebras de linha e formatar as estrofes.
4. Detectar tags e referências bíblicas no retorno.
5. Retornar no formato da interface GospelSong do types.ts.

Aqui está a estrutura de tipos:
export interface GospelSong {
  id: string;
  title: string;
  artist: string;
  fullLyrics: string;
  theme?: string[];
  bibleReferences?: string[];
  source: string;
}`,
  },
  {
    id: 'letras-mus-br-scraper',
    title: '2. Scraper de Letras e Cifras (Letras.mus.br ou Cifra Club)',
    category: 'Scrapers & Web',
    description: 'Solicita ao ChatGPT uma função de busca e extração de letras e cifras musicais formatadas.',
    targetFiles: ['/server/lyricsService.ts', '/server/proxyConfig.ts'],
    promptText: `Olá ChatGPT! Preciso adicionar uma função de extração/scraping de letras de músicas gospel no meu proxy em Node/TypeScript (/server/lyricsService.ts).

Objetivo:
Criar uma função assíncrona 'fetchFromLetrasMusBr(artist: string, song: string)' que:
1. Normaliza o nome do artista e música em slug de URL (ex: 'gabriela-rocha/lugar-secreto').
2. Faz o fetch do HTML com headers adequados de User-Agent.
3. Extrai o título exato, artista, e o texto da letra (separando estrofes e refrão).
4. Remove propagandas ou lixo de formatação.
5. Devolve um objeto com { title, artist, fullLyrics, chordsLyrics, sections }.

Gere o código pronto para eu colar no /server/lyricsService.ts!`,
  },
  {
    id: 'genius-api-integration',
    title: '3. Integração com a API do Genius (Nacional & Internacional)',
    category: 'APIs Globais',
    description: 'Conecta o proxy com a API do Genius para versões gospel em português e inglês.',
    targetFiles: ['/server/lyricsService.ts', '/.env.example'],
    promptText: `Olá ChatGPT! Gostaria de configurar a busca de letras gospel usando a API do Genius no meu proxy.
Eu possuo um Access Token do Genius (GENIUS_ACCESS_TOKEN).

Por favor, escreva a função em TypeScript para:
1. Buscar o song_id no endpoint: 'https://api.genius.com/search?q={termo_gospel}' passando o header 'Authorization: Bearer {token}'.
2. Obter os metadados da música (álbum, ano de lançamento, artistas participantes).
3. Obter a letra da música e retornar formatada.
4. Integrar com o cache em memória existente em /server/lyricsService.ts.`,
  },
  {
    id: 'ai-biblical-tagger',
    title: '4. Tagger Inteligente de Versículos e Temas de Culto',
    category: 'Inteligência Artificial',
    description: 'Gera uma rotina inteligente que analisa a letra da música e sugere momentos do culto (Ceia, Ofertório, Louvor) e versículos bíblicos.',
    targetFiles: ['/server/lyricsService.ts'],
    promptText: `Olá ChatGPT! No meu proxy de letras gospel (/server/lyricsService.ts), quero enriquecer as músicas com metadados para igrejas e ministérios de louvor.

Crie uma função em TypeScript 'analyzeGospelLyrics(lyrics: string)' que analisa o texto da letra e retorna:
1. Momento recomendado no culto (ex: 'Abertura/Celebração', 'Ministração da Palavra', 'Santa Ceia', 'Apelo/Oração', 'Ofertório').
2. Temas teológicos principais (ex: 'Graça', 'Justificação', 'Eternidade', 'Consolo', 'Santidade').
3. Lista de 2 a 4 versículos bíblicos clássicos diretamente conectados com a letra.
4. Sugestão de tom musical confortável para congregação (voz masculina/feminina).`,
  },
  {
    id: 'custom-api-endpoint',
    title: '5. Conectar com o meu Próprio Backend ou Banco de Dados',
    category: 'Custom Endpoint',
    description: 'Configura o proxy para repassar chamadas autenticadas para o seu banco ou API existente.',
    targetFiles: ['/server/proxyConfig.ts', '/server/proxyRouter.ts'],
    promptText: `Olá ChatGPT! Quero configurar o meu proxy (/server/proxyConfig.ts) para encaminhar as buscas de letras gospel para uma API própria minha.

Minha API aceita requisições POST em 'https://minha-api-gospel.com/v1/lyrics' com o header 'x-api-key: MINHA_CHAVE_SECRETA' e o body:
{
  "query": "A Casa É Sua",
  "genre": "gospel"
}

Como devo ajustar o 'defaultProxyConfig' em /server/proxyConfig.ts e a chamada em /server/lyricsService.ts para usar este endpoint?`,
  },
];

export const ChatGptGuideTab: React.FC = () => {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate>(PROMPT_TEMPLATES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Banner Explicativo */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-slate-900 rounded-xl p-5 border border-amber-500/30">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Como Modificar e Configurar o Proxy com o ChatGPT
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Este servidor já foi construído com arquitetura modular, tipagem estrita e rotas prontas.
              Escolha um dos prompts abaixo, copie com 1 clique e envie no <strong>ChatGPT</strong>. Em seguida, cole o código nos arquivos indicados!
            </p>
          </div>
        </div>
      </div>

      {/* Mapa de Arquivos do Projeto */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <FolderTree className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Arquivos Principais para Edição no ChatGPT
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-amber-400 font-mono font-bold mb-1">
              <FileCode className="w-4 h-4" />
              <span>/server/proxyConfig.ts</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Endpoints das APIs externas, chaves de acesso, tempo de cache e regras CORS.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-amber-400 font-mono font-bold mb-1">
              <Cpu className="w-4 h-4" />
              <span>/server/lyricsService.ts</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Funções de busca, parser de letras, extração de cifras e formatação de estrofes.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-amber-400 font-mono font-bold mb-1">
              <Key className="w-4 h-4" />
              <span>/.env.example</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Declaração de variáveis de ambiente e chaves secretas (VAGALUME_API_KEY, GENIUS_TOKEN).
            </p>
          </div>
        </div>
      </div>

      {/* Seletor de Prompts e Área de Cópia */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lista de Modelos de Prompt */}
        <div className="lg:col-span-5 space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Escolha o Cenário Desejado:
          </div>

          {PROMPT_TEMPLATES.map((p) => {
            const isSelected = selectedPrompt.id === p.id;
            return (
              <button
                key={p.id}
                id={`prompt-select-${p.id}`}
                onClick={() => setSelectedPrompt(p)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5'
                    : 'bg-slate-900/80 hover:bg-slate-850 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-amber-400">
                    {p.category}
                  </span>
                  {isSelected && <span className="text-amber-400 text-xs font-bold">● Ativo</span>}
                </div>
                <div className="text-xs font-bold text-slate-100 mt-2">
                  {p.title}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Prompt Selecionado com Botão de Copiar */}
        <div className="lg:col-span-7">
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  {selectedPrompt.title}
                </h3>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                  <span>Arquivos para colar o retorno:</span>
                  {selectedPrompt.targetFiles.map((file, idx) => (
                    <span key={idx} className="font-mono text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {file}
                    </span>
                  ))}
                </div>
              </div>

              <button
                id="btn-copy-chatgpt-prompt"
                onClick={() => handleCopyPrompt(selectedPrompt.promptText)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Prompt</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-5">
              <div className="relative bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs text-slate-200 leading-relaxed max-h-[450px] overflow-y-auto whitespace-pre-wrap selection:bg-amber-500/30">
                {selectedPrompt.promptText}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Após o ChatGPT responder, você pode testar na aba <strong>Testador de Letras</strong>!</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
