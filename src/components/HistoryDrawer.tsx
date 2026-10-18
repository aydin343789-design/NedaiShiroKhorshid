import React, { useState } from 'react';
import { X, Play, Download, Trash2, History, Clock, Settings, KeyRound, CheckCircle2, LoaderCircle } from 'lucide-react';
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
  apiKey: string;
  apiKeyDraft: string;
  onApiKeyDraftChange: (value: string) => void;
  onSaveApiKey: () => void;
  onTestApiKey: () => void;
  isTestingApiKey: boolean;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectClip,
  onDownloadClip,
  onDeleteClip,
  onClearHistory,
  apiKey,
  apiKeyDraft,
  onApiKeyDraftChange,
  onSaveApiKey,
  onTestApiKey,
  isTestingApiKey,
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'settings'>('history');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <button aria-label="بستن منو" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col border-r border-amber-500/20 bg-[#0c1017] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 py-3.5">
          <h3 className="font-bold text-sm text-white">منو</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-400 hover:text-white" aria-label="بستن">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 p-3">
          <button type="button" onClick={() => setActiveTab('history')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${activeTab === 'history' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'border border-slate-800 text-slate-400'}`}>
            <History className="h-4 w-4" /> تاریخچه
          </button>
          <button type="button" onClick={() => setActiveTab('settings')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${activeTab === 'settings' ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30' : 'border border-slate-800 text-slate-400'}`}>
            <Settings className="h-4 w-4" /> تنظیمات
          </button>
        </div>

        {activeTab === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <KeyRound className="h-4 w-4 text-cyan-300" /> کلید موتور آنلاین
            </div>
            <label htmlFor="gemini-api-key" className="mb-1.5 block text-xs text-slate-300">کلید API</label>
            <input
              id="gemini-api-key"
              type="password"
              dir="ltr"
              autoComplete="off"
              value={apiKeyDraft}
              onChange={(event) => onApiKeyDraftChange(event.target.value)}
              placeholder="کلید API را وارد کنید"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-xs text-slate-100 outline-none focus:border-cyan-400"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onSaveApiKey} className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2.5 text-xs font-bold text-cyan-100">
                <CheckCircle2 className="h-4 w-4" /> ذخیره کلید
              </button>
              <button type="button" disabled={!apiKey.trim() || isTestingApiKey} onClick={onTestApiKey} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-bold text-slate-200 disabled:opacity-50">
                {isTestingApiKey ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {isTestingApiKey ? 'در حال بررسی…' : 'آزمایش اتصال'}
              </button>
            </div>
            <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs text-cyan-300 underline">دریافت کلید API</a>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
              {history.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-500">
                  <History className="h-10 w-10 stroke-[1.5] text-slate-600" />
                  <p className="text-xs">هیچ فایل صوتی ذخیره نشده است.</p>
                </div>
              ) : history.map((item) => {
                const charObj = CHARACTERS.find((c) => c.id === item.character);
                return (
                  <div key={item.id} className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-2.5">
                    <div className="flex items-start gap-2.5">
                      {charObj?.avatar && <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full border border-amber-500/40 bg-slate-800 p-0.5">
                        <img src={charObj.avatar} alt={charObj.name} className="h-full w-full rounded-full object-cover" />
                      </div>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-amber-300">{charObj?.name || item.characterName}</span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{item.toneName}</span>
                          <span className="mr-auto flex items-center gap-1 font-mono text-[10px] text-slate-400"><Clock className="h-2.5 w-2.5" />{item.createdAt}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">{item.text}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/60 pt-2 text-xs">
                      <button type="button" onClick={() => { onSelectClip(item); onClose(); }} className="flex items-center gap-1 font-medium text-amber-400 hover:text-amber-300">
                        <Play className="h-3.5 w-3.5 fill-current" /> <span>پخش فایل</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onDownloadClip(item)} className="p-1 text-slate-400 hover:text-amber-400" title="دانلود"><Download className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => onDeleteClip(item.id)} className="p-1 text-slate-500 hover:text-rose-400" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {history.length > 0 && <div className="border-t border-slate-800/80 bg-slate-950/80 p-3">
              <button type="button" onClick={onClearHistory} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20">
                <Trash2 className="h-3.5 w-3.5" /> <span>پاک‌سازی تمام تاریخچه</span>
              </button>
            </div>}
          </>
        )}
      </div>
    </div>
  );
};
