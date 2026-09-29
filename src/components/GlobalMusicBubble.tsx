import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, SkipForward, SkipBack, X, Music, Disc } from 'lucide-react';

interface TrackInfo {
  title: string;
  artist: string;
  artwork: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export function GlobalMusicBubble() {
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const checkTrack = () => {
      const raw = localStorage.getItem('aura_current_track');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setTrack(parsed);
        } catch (e) {}
      }
    };

    checkTrack();
    const interval = setInterval(checkTrack, 1000);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'aura_current_track' && e.newValue) {
        try {
          setTrack(JSON.parse(e.newValue));
        } catch (err) {}
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (!track || !isVisible) return null;

  const sendCommand = (action: string, extra = {}) => {
    localStorage.setItem('aura_player_command', JSON.stringify({ action, timestamp: Date.now(), ...extra }));
  };

  const formatTime = (s: number) => {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sc = Math.floor(s % 60);
    return `${m}:${sc < 10 ? '0' : ''}${sc}`;
  };

  return (
    <div className="fixed top-4 right-4 z-[9999]">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* Glassmorphic Floating Bubble */
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-3 bg-zinc-900/80 dark:bg-black/80 backdrop-blur-xl border border-cyan-500/30 p-2 pr-4 rounded-full shadow-2xl shadow-cyan-500/20 cursor-pointer group"
          >
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-cyan-500/40">
              {track.artwork ? (
                <img src={track.artwork} alt="" className="w-full h-full object-cover animate-spin-slow" style={{ animationDuration: track.isPlaying ? '10s' : '0s' }} />
              ) : (
                <div className="w-full h-full bg-cyan-950 flex items-center justify-center text-cyan-400">
                  <Disc size={20} />
                </div>
              )}
              {track.isPlaying && (
                <div className="absolute inset-0 bg-cyan-500/20 flex items-center justify-center backdrop-blur-[1px]">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                </div>
              )}
            </div>
            <div className="max-w-[120px] sm:max-w-[160px] text-left">
              <p className="text-xs font-bold text-white truncate">{track.title || 'Central Music'}</p>
              <p className="text-[10px] text-cyan-400 truncate">{track.artist || 'Aura OS'}</p>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsVisible(false);
              }}
              className="text-zinc-400 hover:text-white p-1 rounded-full transition-colors ml-1"
              title="Close player"
            >
              <X size={14} />
            </button>
          </motion.div>
        ) : (
          /* Expanded Modal Square with Rounded Sides */
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            className="w-80 bg-zinc-950/90 dark:bg-black/90 backdrop-blur-2xl border border-cyan-500/30 rounded-[2.5rem] p-6 shadow-2xl shadow-cyan-500/30 text-white relative overflow-hidden"
          >
            {/* Background blur artwork */}
            {track.artwork && (
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-20 filter blur-3xl pointer-events-none"
                style={{ backgroundImage: `url(${track.artwork})` }}
              />
            )}

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2">
                  <Music size={16} className="text-cyan-400 animate-pulse" />
                  <span className="text-xs font-extrabold uppercase tracking-widest text-cyan-400">Central Music</span>
                </div>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Artwork */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl mb-5 border border-cyan-500/20 relative group">
                {track.artwork ? (
                  <img src={track.artwork} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-cyan-950 flex items-center justify-center text-cyan-400">
                    <Disc size={64} />
                  </div>
                )}
              </div>

              {/* Track Meta */}
              <div className="text-center mb-5">
                <h3 className="text-base font-extrabold truncate text-white mb-1">{track.title || 'Unknown Track'}</h3>
                <p className="text-xs text-cyan-400 font-semibold truncate">{track.artist || 'Aura Artist'}</p>
              </div>

              {/* Progress */}
              <div className="space-y-1 mb-6">
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const width = rect.width;
                  const pct = clickX / width;
                  if (track.duration) {
                    sendCommand('seek', { time: pct * track.duration });
                  }
                }}>
                  <div 
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${track.duration ? (track.currentTime / track.duration) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
                  <span>{formatTime(track.currentTime)}</span>
                  <span>{formatTime(track.duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6">
                <button 
                  onClick={() => sendCommand('prev')}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                >
                  <SkipBack size={18} />
                </button>
                <button 
                  onClick={() => sendCommand('togglePlay')}
                  className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/30 transition-transform hover:scale-105 active:scale-95 text-white"
                >
                  {track.isPlaying ? <Pause size={24} /> : <Play size={24} className="translate-x-0.5" />}
                </button>
                <button 
                  onClick={() => sendCommand('next')}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                >
                  <SkipForward size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
