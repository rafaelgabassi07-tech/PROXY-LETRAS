import React from 'react';
import { Music, Sparkles } from 'lucide-react';

interface QuickSongPickerProps {
  onSelectSong: (artist: string, title: string) => void;
}

const SAMPLE_GOSPEL_LIST = [
  { title: 'A Casa É Sua', artist: 'Casa Worship', tag: 'Worship' },
  { title: 'Lugar Secreto', artist: 'Gabriela Rocha', tag: 'Intimidade' },
  { title: 'Bondade de Deus', artist: 'Isaías Saad', tag: 'Gratidão' },
  { title: 'Porque Ele Vive', artist: 'Harpa Cristã', tag: 'Hino Clássico' },
  { title: 'Ninguém Explica Deus', artist: 'Preto no Branco', tag: 'Soberania' },
  { title: 'Ousado Amor', artist: 'Isaías Saad', tag: 'Graça' },
  { title: 'Grandioso És Tu', artist: 'Harpa Cristã', tag: 'Adoração' },
  { title: 'É Tudo Sobre Você', artist: 'Morada', tag: 'Worship' },
];

export const QuickSongPicker: React.FC<QuickSongPickerProps> = ({ onSelectSong }) => {
  return (
    <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800/80">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Amostras Rápidas para Testar o Proxy
          </span>
        </div>
        <span className="text-[11px] text-slate-500 hidden sm:inline">
          Clique para carregar parâmetros de busca
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SAMPLE_GOSPEL_LIST.map((item, idx) => (
          <button
            key={idx}
            id={`quick-song-${idx}`}
            onClick={() => onSelectSong(item.artist, item.title)}
            className="text-left p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-amber-500/40 transition-all group"
          >
            <div className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 truncate">
              {item.title}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-slate-400 truncate max-w-[100px]">
                {item.artist}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900/80 text-amber-400/90 font-mono">
                {item.tag}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
