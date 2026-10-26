import React, { useState } from 'react';
import { NicheSelect } from './NicheSelect';
import { NicheCategory, NicheAutoPilotSettings, PlatformId, VideoType } from '../types';
import { 
  Sparkles, 
  Clock, 
  Calendar, 
  Video, 
  Check, 
  Zap, 
  Flame, 
  X, 
  Play, 
  CheckCircle2, 
  Sliders, 
  RefreshCw,
  Search,
  Layers,
  ArrowRight
} from 'lucide-react';

interface AutoPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNiche: NicheCategory;
  niches: NicheCategory[];
  onSelectNiche: (niche: NicheCategory) => void;
  currentSettings: NicheAutoPilotSettings;
  onSaveSettings: (settings: NicheAutoPilotSettings) => void;
  onTriggerImmediateAutonomousRun: (settings: NicheAutoPilotSettings) => Promise<void>;
  isExecutingAutonomousRun: boolean;
}

export const AutoPilotModal: React.FC<AutoPilotModalProps> = ({
  isOpen,
  onClose,
  activeNiche,
  niches,
  onSelectNiche,
  currentSettings,
  onSaveSettings,
  onTriggerImmediateAutonomousRun,
  isExecutingAutonomousRun,
}) => {
  const [enabled, setEnabled] = useState(currentSettings.enabled);
  const [frequency, setFrequency] = useState(currentSettings.frequency);
  const [videosPerBatch, setVideosPerBatch] = useState(currentSettings.videosPerBatch || 2);
  const [preferredStyle, setPreferredStyle] = useState<VideoType>(currentSettings.preferredStyle || 'cartoon_3d');
  const [customTimeSlot, setCustomTimeSlot] = useState(currentSettings.customTimeSlot || '18:30');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(
    currentSettings.targetPlatforms || ['tiktok', 'youtube', 'instagram']
  );
  const [autoResearchTrending, setAutoResearchTrending] = useState(currentSettings.autoResearchTrending ?? true);
  const [showRunSuccess, setShowRunSuccess] = useState(false);

  if (!isOpen) return null;

  const togglePlatform = (p: PlatformId) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(item => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleSave = () => {
    const updated: NicheAutoPilotSettings = {
      enabled,
      frequency,
      videosPerBatch,
      preferredStyle,
      customTimeSlot,
      targetPlatforms: selectedPlatforms,
      autoResearchTrending,
      lastAutonomousRun: currentSettings.lastAutonomousRun,
    };
    onSaveSettings(updated);
    onClose();
  };

  const handleExecuteNow = async () => {
    const runSettings: NicheAutoPilotSettings = {
      enabled: true,
      frequency,
      videosPerBatch,
      preferredStyle,
      customTimeSlot,
      targetPlatforms: selectedPlatforms,
      autoResearchTrending,
      lastAutonomousRun: new Date().toISOString(),
    };
    await onTriggerImmediateAutonomousRun(runSettings);
    setShowRunSuccess(true);
    setTimeout(() => {
      setShowRunSuccess(false);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl p-5 sm:p-6 space-y-5 my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Autonomous Niche Video Dispatch</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Auto-Pilot 2.0
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Researches breakout trending topics in your niche, directs AI videos, and auto-schedules to your social platforms.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Power Toggle */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white block">
              Autonomous Auto-Pilot Dispatch
            </span>
            <span className="text-[11px] text-slate-400 block">
              Automatically research topics and create video uploads on selected schedule even without manual topics.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors flex items-center gap-1.5 ${
              enabled 
                ? 'bg-emerald-600 text-white shadow-xs' 
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
            <span>{enabled ? 'ENABLED' : 'PAUSED'}</span>
          </button>
        </div>

        {/* Step 1: Target Niche Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <span>Target Creator Niche for Research</span>
            </label>
            <span className="text-[11px] text-indigo-400 font-mono font-medium">
              Current: {activeNiche.name}
            </span>
          </div>
          <NicheSelect niches={niches} activeNiche={activeNiche} onSelect={onSelectNiche} />
        </div>

        {/* Step 2: Video Style Preference (Cartoon, Real, 3D, 2D) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            Preferred Video Style to Generate
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'cartoon_3d' as VideoType, label: '3D Cartoon', desc: 'Pixar/3D animation', icon: '✨' },
              { id: 'cartoon_2d' as VideoType, label: '2D Vector Style', desc: 'Anime & motion graphic', icon: '🎨' },
              { id: 'ad_video' as VideoType, label: 'Real Video', desc: 'Live commercial video', icon: '🎬' },
              { id: 'doodle_video' as VideoType, label: 'Whiteboard Sketch', desc: 'Hand-drawn doodle', icon: '✏️' },
            ].map(style => (
              <button
                key={style.id}
                type="button"
                onClick={() => setPreferredStyle(style.id)}
                className={`p-2.5 rounded-lg border text-left text-xs transition-colors ${
                  preferredStyle === style.id
                    ? 'bg-indigo-950 border-indigo-500 text-white ring-1 ring-indigo-500/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-white mb-0.5">
                  <span>{style.icon}</span>
                  <span>{style.label}</span>
                </div>
                <div className="text-[10px] text-slate-500">{style.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 3: Frequency, Amount of Videos & Selected Time */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
          {/* Frequency */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>Upload Schedule</span>
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
            >
              <option value="daily">Daily (Every Day)</option>
              <option value="twice_daily">Twice Daily (Peak Windows)</option>
              <option value="weekly">Weekly (3 Days/Week)</option>
            </select>
          </div>

          {/* Amount of Videos */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-indigo-400" />
              <span>Videos Per Batch</span>
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setVideosPerBatch(count)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors ${
                    videosPerBatch === count
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {count} {count === 1 ? 'Video' : 'Videos'}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Time */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Selected Dispatch Time</span>
            </label>
            <input
              type="time"
              value={customTimeSlot}
              onChange={(e) => setCustomTimeSlot(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-mono focus:outline-hidden focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Step 4: Social Media Channels to Upload To */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 block">
            Target Social Media Channels
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'tiktok' as PlatformId, name: 'TikTok' },
              { id: 'youtube' as PlatformId, name: 'YouTube Shorts' },
              { id: 'instagram' as PlatformId, name: 'Instagram Reels' },
              { id: 'x' as PlatformId, name: 'X / Twitter' },
              { id: 'linkedin' as PlatformId, name: 'LinkedIn' },
            ].map(p => {
              const isSelected = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-950 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Autonomous Topic Discovery Checkbox */}
        <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/40 flex items-start gap-2.5">
          <input
            type="checkbox"
            id="autoTopicCheck"
            checked={autoResearchTrending}
            onChange={(e) => setAutoResearchTrending(e.target.checked)}
            className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
          />
          <label htmlFor="autoTopicCheck" className="text-xs text-slate-300 leading-relaxed cursor-pointer">
            <strong className="text-white">Deep Trend Intelligence:</strong> Even if no topic is provided, 
            the system automatically scours top breakout topics for <span className="text-indigo-300 font-semibold">{activeNiche.name}</span>, writes the viral hook, and produces the video for upload.
          </label>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            disabled={isExecutingAutonomousRun}
            onClick={handleExecuteNow}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50"
          >
            {isExecutingAutonomousRun ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Researching Niche & Directing Videos...</span>
              </>
            ) : showRunSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>Batch Generated & Queued! 🎉</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Research & Generate Batch Now</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm shadow-indigo-600/30"
            >
              Save Schedule Settings
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
