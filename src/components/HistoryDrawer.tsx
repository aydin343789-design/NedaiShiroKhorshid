import React from 'react';
import { X, Play, Download, Trash2, History, Clock } from 'lucide-react';
import { SavedAudioClip } from '../types';
import { CHARACTERS } from '../data/voices';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: SavedAudioClip[];
  onSelectClip: (clip: SavedAudioClip) => void;
  onDownloadClip: (clip: SavedAudioClip) => void;
  onDeleteClip: (id: string) => void;
  onClearHistory: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectClip,
  onDownloadClip,
  onDeleteClip,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity">
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col bg-[#0c1017] border-r border-amber-500/20 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-amber-400" />
            <h3 className="font-bold text-sm text-white">تاریخچه فایل‌های صوتی</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {history.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500 gap-2">
              <History className="h-10 w-10 stroke-[1.5] text-slate-600" />
              <p className="text-xs">هیچ فایل صوتی ذخیره نشده است.</p>
            </div>
          ) : (
            history.map((item) => {
              const charObj = CHARACTERS.find((c) => c.id === item.character);

              return (
                <div
                  key={item.id}
                  className="group relative rounded-xl border border-slate-800/80 bg-slate-900/70 p-2.5 hover:border-amber-500/40 transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Avatar thumbnail */}
                    {charObj?.avatar && (
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-amber-500/40 bg-slate-800 p-0.5 mt-0.5">
                        <img
                          src={charObj.avatar}
                          alt={charObj.name}
                          className="h-full w-full rounded-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-amber-300">
                          {charObj?.name || item.characterName}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {item.toneName}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono mr-auto">
                          <Clock className="h-2.5 w-2.5" />
                          {item.createdAt}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/60 pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClip(item);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>پخش فایل</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDownloadClip(item)}
                      className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                      title="دانلود"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteClip(item.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="border-t border-slate-800/80 p-3 bg-slate-950/80">
            <button
              type="button"
              onClick={onClearHistory}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>پاک‌سازی تمام تاریخچه</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
