import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  ArrowRight,
  Menu,
  Volume2,
  VolumeX,
  FastForward,
  Rewind,
  Sliders,
} from 'lucide-react';
import { SavedAudioClip } from '../types';
import { LionSunEmblem } from './LionSunEmblem';
import { CHARACTERS } from '../data/voices';

interface AudioPlayerScreenProps {
  clip: SavedAudioClip;
  onBack: () => void;
  onOpenHistory: () => void;
  onDownload: (clip: SavedAudioClip) => void;
  onRecreateWithSettings?: (speed: number, pitch: number) => void;
  isRegenerating?: boolean;
}

export const AudioPlayerScreen: React.FC<AudioPlayerScreenProps> = ({
  clip,
  onBack,
  onOpenHistory,
  onDownload,
  onRecreateWithSettings,
  isRegenerating = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(clip.duration || 5);
  const [speed, setSpeed] = useState<number>(clip.speed || 1.0);
  const [pitch, setPitch] = useState<number>(clip.pitch || 1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Play audio on initial load
  useEffect(() => {
    setSpeed(clip.speed || 1.0);
    setPitch(clip.pitch || 1.0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      // Speed and pitch are already rendered into the neural MP3. Playback
      // starts at 1x so the selected profile is not applied a second time.
      setCurrentTime(0);
      playAudioAtRate(1);
    }
  }, [clip.id]);

  const playAudioAtRate = (rate: number) => {
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      audioRef.current.play().catch(() => {});
    }
  };

  const playBoth = () => {
    playAudioAtRate(speed / (clip.speed || 1));
  };

  const pauseBoth = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      pauseBoth();
    } else {
      playBoth();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleSkip = (seconds: number) => {
    if (!audioRef.current) return;
    const target = Math.min(Math.max(0, audioRef.current.currentTime + seconds), duration);
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    playBoth();
  };

  const handleSpeedChange = (val: number) => {
    setSpeed(val);
    if (audioRef.current) {
      // Preview a relative change; pressing Apply creates a new pre-rendered MP3.
      audioRef.current.playbackRate = val / (clip.speed || 1);
    }
  };

  const handlePitchChange = (val: number) => {
    setPitch(val);
  };

  const handleApplySliders = () => {
    if (onRecreateWithSettings) {
      onRecreateWithSettings(speed, pitch);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !Number.isFinite(secs)) return '۰۰:۰۰';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const mm = m < 10 ? `۰${m}` : `${m}`;
    const ss = s < 10 ? `۰${s}` : `${s}`;
    return `${mm}:${ss}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const barsCount = 32;

  return (
    <div className="flex h-screen max-h-screen w-full flex-col justify-between overflow-hidden bg-[#070a12] text-slate-100 p-3 sm:p-5 select-none">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={clip.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <button
          type="button"
          onClick={() => {
            pauseBoth();
            onBack();
          }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-amber-500/40 hover:text-white transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>بازگشت به متن</span>
        </button>

        <div className="flex items-center gap-2">
          <LionSunEmblem size="sm" />
          <span className="font-bold text-sm text-white">ندای شیروخورشید</span>
        </div>

        <button
          type="button"
          onClick={onOpenHistory}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
          title="منوی تاریخچه"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Main Content (Center) */}
      <div className="flex flex-1 flex-col justify-center max-w-xl mx-auto w-full py-2 gap-3.5">
        {/* Character Avatar & File Info Card */}
        {(() => {
          const charObj = CHARACTERS.find((c) => c.id === clip.character);
          return (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-slate-900/80 p-3 shadow-lg shadow-amber-500/5">
              {charObj?.avatar ? (
                <div className="relative h-12 w-12 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-amber-500 to-amber-300 ring-2 ring-amber-400/40 shrink-0">
                  <img
                    src={charObj.avatar}
                    alt={charObj.name}
                    className="h-full w-full rounded-full object-cover"
                  />
                </div>
              ) : (
                <LionSunEmblem size="md" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-amber-300">
                    صدای {charObj?.name || clip.characterName}
                  </span>
                  <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                    لحن: {clip.toneName}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300 truncate font-mono">
                  {clip.text}
                </p>
              </div>
              <LionSunEmblem size="sm" className="hidden sm:inline-flex" />
            </div>
          );
        })()}

        {/* Waveform Visualizer */}
        <div className="flex h-20 items-center justify-center gap-1 rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4">
          {Array.from({ length: barsCount }).map((_, i) => {
            const barProgress = (i / barsCount) * 100;
            const isPassed = barProgress <= progressPercent;
            const baseH = 15 + Math.sin(i * 0.5) * 12 + Math.cos(i * 0.9) * 10;
            const dynamicH = isPlaying ? Math.sin(Date.now() * 0.006 + i * 0.4) * 22 : 0;
            const height = Math.max(10, Math.min(85, baseH + dynamicH));

            return (
              <div key={i} className="flex flex-1 items-center justify-center">
                <div
                  style={{ height: `${height}%` }}
                  className={`w-full max-w-[5px] rounded-full transition-all duration-100 ${
                    isPassed
                      ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-sm shadow-amber-400/30'
                      : 'bg-slate-800'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Seekbar and Time Display */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={duration || 10}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-amber-400 hover:accent-amber-300"
          />
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Buttons */}
        <div className="flex items-center justify-center gap-4 py-1">
          <button
            type="button"
            onClick={() => handleSkip(-5)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="۵ ثانیه عقب"
          >
            <Rewind className="h-4 w-4" />
          </button>

          {/* Big Play / Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 text-slate-950 shadow-xl shadow-amber-500/25 transition-transform hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-current stroke-[2.5]" />
            ) : (
              <Play className="h-6 w-6 fill-current stroke-[2.5] translate-x-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSkip(5)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="۵ ثانیه جلو"
          >
            <FastForward className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title="پخش از اول"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Sliders: Speed and Pitch (زیر و بم و سرعت) */}
        <div className="space-y-2 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Speed slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">سرعت خوانش:</span>
                <span className="font-mono text-amber-400 font-bold">{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.1}
                value={speed}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-amber-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>آرام</span>
                <span>سریع</span>
              </div>
            </div>

            {/* Pitch slider (زیر و بم) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">زیر و بم (گام):</span>
                <span className="font-mono text-amber-400 font-bold">{pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.6}
                step={0.1}
                value={pitch}
                onChange={(e) => handlePitchChange(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-amber-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>بم (عمیق)</span>
                <span>زیر (نازک)</span>
              </div>
            </div>
          </div>

          {/* Button to apply new pitch/speed to the audio file if changed */}
          {(speed !== clip.speed || pitch !== clip.pitch) && onRecreateWithSettings && (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={handleApplySliders}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              {isRegenerating ? (
                <span>در حال به‌روزرسانی صوت...</span>
              ) : (
                <span>اعمال تغییرات سرعت و زیروبم روی صوت</span>
              )}
            </button>
          )}
        </div>

        {/* Big Golden Download Button */}
        <button
          type="button"
          onClick={() => onDownload(clip)}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 py-3.5 px-6 font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          <Download className="h-5 w-5 stroke-[2.5]" />
          <span className="text-sm sm:text-base font-black">دانلود فایل صوتی (MP3)</span>
        </button>
      </div>

      {/* Bottom Bar: Status */}
      <div className="text-center text-[11px] text-slate-500 pt-1">
        کیفیت استودیویی با فرمت استاندارد MP3 • شیروخورشید
      </div>
    </div>
  );
};
