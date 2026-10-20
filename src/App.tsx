import React, { useState, useEffect } from 'react';
import {
  Menu,
  Volume2,
  RefreshCw,
  Sparkles,
  Check,
  Smile,
  Heart,
  CloudRain,
  Newspaper,
  Briefcase,
  Flame,
  Radio,
} from 'lucide-react';
import { LionSunEmblem } from './components/LionSunEmblem';
import { HistoryDrawer } from './components/HistoryDrawer';
import { AudioPlayerScreen } from './components/AudioPlayerScreen';
import { CharacterId, ToneId, SavedAudioClip } from './types';
import { CHARACTERS, TONES, DEFAULT_SAMPLE_TEXT } from './data/voices';
import { type VoicePackProgress } from './utils/neuralPersianTts';
import { prepareMossOfflineVoicePack, synthesizeMossOfflineAudio } from './utils/mossOfflineTts';
import { synthesizePersianOnlineAudio } from './utils/onlinePersianTts';

const STORAGE_KEY = 'nedaye_shirokhorshid_history_v4';

const TONE_ICONS: Record<ToneId, React.ReactNode> = {
  cheerful: <Smile className="h-3.5 w-3.5" />,
  intimate: <Heart className="h-3.5 w-3.5" />,
  sad: <CloudRain className="h-3.5 w-3.5" />,
  formal: <Newspaper className="h-3.5 w-3.5" />,
  professional: <Briefcase className="h-3.5 w-3.5" />,
  newscast: <Radio className="h-3.5 w-3.5" />,
  epic: <Flame className="h-3.5 w-3.5" />,
};

export default function App() {
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>('female');
  const [selectedTone, setSelectedTone] = useState<ToneId>('cheerful');
  const [engineMode, setEngineMode] = useState<'offline' | 'online'>('online');
  const [text, setText] = useState<string>(DEFAULT_SAMPLE_TEXT);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeClip, setActiveClip] = useState<SavedAudioClip | null>(null);
  const [history, setHistory] = useState<SavedAudioClip[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [currentScreen, setCurrentScreen] = useState<'create' | 'player'>('create');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [voicePack, setVoicePack] = useState<VoicePackProgress>({
    stage: 'idle',
    completed: 0,
    total: 1,
    message: 'MOSS آفلاین به دانلود اولیهٔ حدود ۷۶۳ مگابایت نیاز دارد.',
  });
  const [generationMessage, setGenerationMessage] = useState('');

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, []);

  const prepareVoicePack = () => {
    setVoicePack({
      stage: 'checking',
      completed: 0,
      total: 1,
      message: 'بررسی بستهٔ صدای آفلاین انتخاب‌شده…',
    });
    void prepareMossOfflineVoicePack(setVoicePack).catch((error) => {
      console.error('MOSS offline preparation failed:', error);
    });
  };

  // Voice models are acquired once on the first launch and persist in local cache.
  useEffect(() => {
    if (engineMode === 'offline') prepareVoicePack();
  }, [engineMode, selectedCharacter]);

  const saveHistory = (items: SavedAudioClip[]) => {
    setHistory(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // MOSS paths are intentionally tested independently; no silent engine fallback.
  const handleGenerateAudio = async (speed: number = 1.0, pitch: number = 1.0) => {
    if (!text.trim()) {
      showToast('لطفاً متنی را وارد کنید.');
      return;
    }
    if (engineMode === 'offline' && voicePack.stage !== 'ready') {
      showToast(voicePack.error || 'ابتدا مدل MOSS آفلاین را دانلود کنید.');
      return;
    }
    try {
      setIsGenerating(true);
      setGenerationMessage(engineMode === 'online' ? 'در حال اتصال به MOSS Space…' : 'در حال اجرای MOSS روی گوشی…');
      const cleanText = text.trim();
      const charObj = CHARACTERS.find((c) => c.id === selectedCharacter);
      const toneObj = TONES.find((t) => t.id === selectedTone);
      const synth = engineMode === 'online'
        ? await synthesizePersianOnlineAudio(
            cleanText,
            selectedCharacter,
            selectedTone,
            speed,
            (progress) => setGenerationMessage(progress.message),
          )
        : await synthesizeMossOfflineAudio(cleanText, selectedCharacter, (progress) => setGenerationMessage(progress.message));
      const usedEngine: 'online' | 'offline' = engineMode;
      const characterName = engineMode === 'online'
        ? 'MOSS آنلاین · صدای مرجع فارسی'
        : `MOSS آفلاین · ${charObj?.name || 'گوینده'} (صدای چندزبانهٔ آزمایشی)`;
      const toneName = engineMode === 'online'
        ? 'لحن ثابت نمونهٔ فارسی'
        : `لحن ثابت مدل · انتخاب «${toneObj?.name || 'طبیعی'}» در MOSS اعمال نمی‌شود`;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const newClip: SavedAudioClip = {
        id: `clip-${Date.now()}`,
        text: text.trim(),
        character: selectedCharacter,
        characterName,
        tone: selectedTone,
        toneName,
        audioUrl: synth.audioUrl,
        createdAt: timeStr,
        duration: Math.max(2, Math.round(synth.duration * 10) / 10),
        speed,
        pitch,
      };
      const updated = [newClip, ...history.slice(0, 19)];
      saveHistory(updated);
      setActiveClip(newClip);
      setCurrentScreen('player');
    } catch (err) {
      console.error('MOSS synthesis failed:', err);
      const reason = err instanceof Error ? err.message : 'خطای ناشناخته';
      showToast(reason.length > 130 ? `${reason.slice(0, 127)}…` : reason);
    } finally {
      setIsGenerating(false);
      setGenerationMessage('');
    }
  };

  const handleDownload = (clip: SavedAudioClip) => {
    if (!clip.audioUrl) return;
    const a = document.createElement('a');
    a.href = clip.audioUrl;
    a.download = `Nedaye-Shirokhorshid-${clip.character}-${clip.tone}-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('فایل صوتی MP3 با موفقیت دانلود شد.');
  };

  const handleDeleteClip = (id: string) => {
    const updated = history.filter((c) => c.id !== id);
    saveHistory(updated);
    if (activeClip?.id === id) {
      setActiveClip(updated[0] || null);
    }
    showToast('فایل از تاریخچه حذف شد.');
  };

  const handleClearHistory = () => {
    saveHistory([]);
    setActiveClip(null);
    showToast('تمام تاریخچه پاک شد.');
  };

  const handleSelectClipFromHistory = (clip: SavedAudioClip) => {
    setActiveClip(clip);
    setCurrentScreen('player');
  };

  const handleRecreateWithSettings = async (speed: number, pitch: number) => {
    await handleGenerateAudio(speed, pitch);
  };

  // Screen 2: Audio Player & Download View
  if (currentScreen === 'player' && activeClip) {
    const activeChar = CHARACTERS.find((c) => c.id === activeClip.character);

    return (
      <>
        {toastMessage && <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-slate-900/95 px-4 py-2 text-xs font-medium text-amber-100 shadow-xl">{toastMessage}</div>}
        <AudioPlayerScreen
          clip={activeClip}
          onBack={() => {
            setCurrentScreen('create');
          }}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onDownload={handleDownload}
          onRecreateWithSettings={handleRecreateWithSettings}
          isRegenerating={isGenerating}
        />
        <HistoryDrawer
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          history={history}
          onSelectClip={handleSelectClipFromHistory}
          onDownloadClip={handleDownload}
          onDeleteClip={handleDeleteClip}
          onClearHistory={handleClearHistory}
        />
      </>
    );
  }

  // Screen 1: Create Audio Screen (Strict single-page, no scroll)
  return (
    <div className="flex min-h-screen w-full flex-col justify-start overflow-y-auto bg-[#06090e] text-slate-100 p-3 sm:p-4 select-none font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-amber-500/40 bg-slate-900/95 px-4 py-2 text-xs font-medium text-amber-200 shadow-xl backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2.5">
          <LionSunEmblem size="sm" />
          <div>
            <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-1">
              <span>ندای</span>
              <span className="text-amber-400">شیروخورشید</span>
            </h1>
            <p className="text-[10px] text-slate-400 -mt-0.5">استودیو هوشمند تبدیل متن به گفتار</p>
          </div>
        </div>

        {/* Hamburger Menu (منوی سه خط) */}
        <button
          type="button"
          onClick={() => setIsHistoryOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors shadow-sm"
          title="منوی تاریخچه"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Offline model download status and progress must remain visible. */}
      <section
        className={`mx-auto mt-2 flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[11px] sm:text-xs ${
          voicePack.stage === 'ready'
            ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200'
            : voicePack.stage === 'error'
              ? 'border-rose-500/35 bg-rose-500/10 text-rose-100'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        }`}
        role="status"
      >
        <div className="min-w-0 flex-1">
          <div className="leading-relaxed">
            {engineMode === 'online' ? 'MOSS آنلاین: متن برای تولید صدا به Space عمومی Hugging Face فرستاده می‌شود.' : voicePack.message}
            {engineMode === 'offline' && voicePack.stage === 'downloading' && voicePack.total > 0
              ? ` (${Math.min(100, Math.round((voicePack.completed / voicePack.total) * 100))}%)`
              : ''}
          </div>
          {engineMode === 'offline' && voicePack.stage === 'downloading' && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: (Math.min(100, Math.round((voicePack.completed / Math.max(voicePack.total, 1)) * 100)) + '%') }}
              />
            </div>
          )}
        </div>
        {engineMode === 'offline' && voicePack.stage === 'error' ? (
          <button type="button" onClick={prepareVoicePack} className="shrink-0 rounded-lg border border-rose-300/50 px-2 py-1 font-bold text-rose-100">
            تلاش دوباره
          </button>
        ) : engineMode === 'offline' && voicePack.stage === 'ready' ? (
          <span className="shrink-0 font-bold text-emerald-300">آماده</span>
        ) : null}
      </section>

      {/* Main Workspace */}
      <main className="flex flex-1 flex-col justify-between py-2 max-w-xl mx-auto w-full gap-2.5">
        {/* 1. Character Selection with Real Avatars */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="font-semibold text-slate-200">انتخاب گوینده:</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {CHARACTERS.map((char) => {
              const isSelected = selectedCharacter === char.id;

              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => setSelectedCharacter(char.id)}
                  className={`group relative flex flex-col items-center justify-center rounded-2xl p-2 transition-all duration-200 ${
                    isSelected
                      ? 'border-2 border-amber-500 bg-gradient-to-b from-amber-500/20 to-slate-900/90 shadow-md shadow-amber-500/15 ring-1 ring-amber-500/30'
                      : 'border border-slate-800/90 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
                  }`}
                >
                  {/* Selected check badge */}
                  {isSelected && (
                    <div className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-slate-950">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  )}

                  {/* Avatar Photo */}
                  <div
                    className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-full overflow-hidden p-0.5 transition-transform group-hover:scale-105 ${
                      isSelected
                        ? 'bg-gradient-to-tr from-amber-500 to-amber-300 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/40'
                        : 'bg-slate-800 border border-slate-700'
                    }`}
                  >
                    <img
                      src={char.avatar}
                      alt={char.name}
                      className="h-full w-full rounded-full object-cover"
                    />
                  </div>

                  <span className="mt-1.5 text-xs font-bold text-white leading-tight">
                    {char.name}
                  </span>
                  <span className="text-[10px] text-amber-400/90 font-medium">
                    {char.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Tone Selection with Mood Icons */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="font-semibold text-slate-200">لحن خوانش:</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {TONES.map((tone) => {
              const isSelected = selectedTone === tone.id;

              return (
                <button
                  key={tone.id}
                  type="button"
                  onClick={() => setSelectedTone(tone.id)}
                  title={tone.description}
                  className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2 text-center text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-2 border-amber-500 bg-amber-500/20 text-amber-300 font-bold shadow-sm'
                      : 'border border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className={isSelected ? 'text-amber-400' : 'text-slate-500'}>
                    {TONE_ICONS[tone.id]}
                  </span>
                  <span>{tone.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Text Box with 1 default sample */}
        <div className="flex flex-1 flex-col space-y-1.5 min-h-[130px]">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="font-semibold text-slate-200">متن فارسی:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setText(DEFAULT_SAMPLE_TEXT)}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                title="بارگذاری مجدد متن نمونه"
              >
                <RefreshCw className="h-3 w-3" />
                <span>متن نمونه</span>
              </button>
              <span className="text-slate-700">•</span>
              <button
                type="button"
                onClick={() => setText('')}
                className="text-[11px] text-slate-500 hover:text-rose-400"
              >
                پاک کردن
              </button>
            </div>
          </div>

          <div className="relative flex-1 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 shadow-inner focus-within:border-amber-500/60 transition-colors">
            <textarea
              dir="rtl"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="متن خود را اینجا بنویسید..."
              className="h-full w-full resize-none bg-transparent text-xs sm:text-sm leading-relaxed text-slate-100 placeholder-slate-600 outline-none"
            />
            <span className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-600">
              {text.length.toLocaleString('fa-IR')} نویسه
            </span>
          </div>
        </div>

        {/* 4. Engine Selection */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="font-semibold text-slate-200">آزمون موتور MOSS:</span>
            
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEngineMode('online')}
              className={`rounded-xl border px-3 py-2 text-right transition-all ${engineMode === 'online' ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-800 bg-slate-900/60 text-slate-400'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs">MOSS آنلاین</span>
                {engineMode === 'online' && <Check className="h-3.5 w-3.5" />}
              </div>
              <p className="mt-0.5 text-[9px] opacity-70">Space عمومی · ارسال متن</p>
            </button>
            <button
              type="button"
              onClick={() => setEngineMode('offline')}
              className={`rounded-xl border px-3 py-2 text-right transition-all ${engineMode === 'offline' ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200' : 'border-slate-800 bg-slate-900/60 text-slate-400'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs">MOSS آفلاین</span>
                {engineMode === 'offline' && <Check className="h-3.5 w-3.5" />}
              </div>
              <p className="mt-0.5 text-[9px] opacity-70">ONNX روی گوشی · دانلود اولیه ۷۶۳ مگابایت</p>
            </button>
          </div>

        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 px-3 py-2 text-[10px] text-slate-400">
          {engineMode === 'online' ? 'آنلاین: نمونهٔ صدای فارسی ثابت از Space' : `آفلاین: ${CHARACTERS.find((item) => item.id === selectedCharacter)?.name} · صدای مرجع MOSS چندزبانه است؛ لحن قابل تنظیم نیست`}
        </div>
        <button
          type="button"
          disabled={isGenerating || !text.trim() || (engineMode === 'offline' && voicePack.stage !== 'ready')}
          onClick={() => handleGenerateAudio(1.0, 1.0)}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 py-3.5 px-6 font-bold text-slate-950 shadow-xl shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-950 animate-ping"></span>
              <span className="text-sm font-bold">{generationMessage || 'در حال پردازش و تولید فایل صوتی…'}</span>
            </div>
          ) : (
            <>
              <Volume2 className="h-5 w-5 stroke-[2.5]" />
              <span className="text-sm sm:text-base font-black">ساختن فایل صوتی</span>
            </>
          )}
        </button>
      </main>

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectClip={handleSelectClipFromHistory}
        onDownloadClip={handleDownload}
        onDeleteClip={handleDeleteClip}
        onClearHistory={handleClearHistory}
      />
    </div>
  );
}
