import { useState, useRef, useEffect, useCallback } from "react";
import {
  Music, X, Volume2, VolumeX, ChevronUp, ChevronDown,
  Repeat, Play, Pause, SkipForward, SkipBack, Settings, Plus, Trash2, Calendar, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface Track {
  id: number;
  sunoId: string;
  title: string;
  scheduleDate: string | null;
  active: boolean;
  sortOrder: number;
}

function getSunoAudioUrl(sunoId: string) {
  if (sunoId.startsWith("local:")) return "/" + sunoId.slice(6);
  return `/api/music/stream/${sunoId}`;
}

type TestStatus = "idle" | "testing" | "ok" | "fail";

function AdminPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newSunoUrl, setNewSunoUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [trackStatuses, setTrackStatuses] = useState<Record<number, TestStatus>>({});

  const { data: allTracks = [] } = useQuery<Track[]>({
    queryKey: ["/api/music/tracks/all"],
    queryFn: async () => {
      const res = await fetch("/api/music/tracks/all", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addTrack = useMutation({
    mutationFn: async (data: { sunoId: string; title: string; scheduleDate?: string }) => {
      const res = await apiRequest("POST", "/api/music/tracks", {
        ...data,
        scheduleDate: data.scheduleDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setNewSunoUrl("");
      setNewTitle("");
      setNewDate("");
      setTestStatus("idle");
      setTestMsg("");
      queryClient.invalidateQueries({ queryKey: ["/api/music/tracks/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/tracks"] });
    },
  });

  const deleteTrack = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/music/tracks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music/tracks/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/tracks"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/music/tracks/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music/tracks/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/tracks"] });
    },
  });

  const parseSunoId = (url: string): string | null => {
    const patterns = [
      /suno\.com\/song\/([a-f0-9-]+)/i,
      /suno\.com\/embed\/([a-f0-9-]+)/i,
      /suno\.com\/s\/([A-Za-z0-9]+)\?.*song[/=]([a-f0-9-]+)/i,
      /suno\.com\/s\/[A-Za-z0-9]+.*[?&].*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
      /^([a-f0-9-]{36})$/i,
    ];
    for (const p of patterns) {
      const m = url.trim().match(p);
      if (m) return m[m.length - 1];
    }
    return null;
  };

  const testStream = async (sunoId: string, trackId?: number): Promise<boolean> => {
    if (trackId !== undefined) {
      setTrackStatuses(s => ({ ...s, [trackId]: "testing" }));
    } else {
      setTestStatus("testing");
      setTestMsg("Checking stream...");
    }
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`/api/music/stream/${sunoId}`, { signal: ctrl.signal });
      clearTimeout(timeout);
      res.body?.cancel();
      const ct = res.headers.get("content-type") || "";
      const ok = res.ok && (ct.includes("audio") || ct.includes("octet"));
      if (trackId !== undefined) {
        setTrackStatuses(s => ({ ...s, [trackId]: ok ? "ok" : "fail" }));
      } else {
        setTestStatus(ok ? "ok" : "fail");
        setTestMsg(ok ? "Stream works! Click Save Track." : "Stream failed — try a different song.");
      }
      return ok;
    } catch {
      if (trackId !== undefined) {
        setTrackStatuses(s => ({ ...s, [trackId]: "fail" }));
      } else {
        setTestStatus("fail");
        setTestMsg("Could not reach audio server — check your connection");
      }
      return false;
    }
  };

  const handleTestAndAdd = async () => {
    const sunoId = parseSunoId(newSunoUrl);
    if (!sunoId) {
      setTestStatus("fail");
      setTestMsg("Can't find a valid Suno ID in that URL");
      return;
    }
    if (!newTitle.trim()) {
      setTestStatus("fail");
      setTestMsg("Add a title first");
      return;
    }
    const ok = await testStream(sunoId);
    if (!ok) return;
    addTrack.mutate({ sunoId, title: newTitle.trim(), scheduleDate: newDate || undefined });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-display font-bold flex items-center gap-1.5">
          <Settings size={14} className="text-primary" /> Manage Playlist
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2 max-h-44 overflow-y-auto">
        {allTracks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No tracks yet</p>
        ) : (
          allTracks.map((track) => (
            <div
              key={track.id}
              className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                track.active ? "border-primary/20 bg-primary/5" : "border-white/5 bg-white/5 opacity-50"
              }`}
              data-testid={`admin-track-${track.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{track.title}</p>
                <p className="text-[10px] text-muted-foreground">{track.scheduleDate || "Always active"}</p>
              </div>
              <button
                onClick={() => testStream(track.sunoId, track.id)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  trackStatuses[track.id] === "ok" ? "border-green-500/40 text-green-400" :
                  trackStatuses[track.id] === "fail" ? "border-red-500/40 text-red-400" :
                  trackStatuses[track.id] === "testing" ? "border-yellow-500/40 text-yellow-400" :
                  "border-white/10 text-muted-foreground"
                }`}
                title="Test stream"
                data-testid={`button-test-track-${track.id}`}
              >
                {trackStatuses[track.id] === "testing" ? "..." :
                 trackStatuses[track.id] === "ok" ? "✓ OK" :
                 trackStatuses[track.id] === "fail" ? "✗ FAIL" : "Test"}
              </button>
              <button
                onClick={() => toggleActive.mutate({ id: track.id, active: !track.active })}
                className={`text-[10px] px-2 py-0.5 rounded ${
                  track.active ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"
                }`}
                data-testid={`button-toggle-active-${track.id}`}
              >
                {track.active ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => deleteTrack.mutate(track.id)}
                className="text-muted-foreground hover:text-red-400"
                data-testid={`button-delete-track-${track.id}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-white/5 pt-2 space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Add New Track</p>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Track title..."
          className="w-full bg-background/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary/50"
          data-testid="input-admin-title"
        />
        <input
          type="text"
          value={newSunoUrl}
          onChange={(e) => { setNewSunoUrl(e.target.value); setTestStatus("idle"); setTestMsg(""); }}
          placeholder="Paste full Suno URL or UUID..."
          className={`w-full bg-background/50 border rounded-lg px-3 py-1.5 text-sm focus:outline-none ${
            testStatus === "ok" ? "border-green-500/50" :
            testStatus === "fail" ? "border-red-500/50" :
            "border-white/10 focus:border-primary/50"
          }`}
          data-testid="input-admin-suno-url"
        />
        {testMsg && (
          <p className={`text-[11px] font-medium ${testStatus === "ok" ? "text-green-400" : "text-red-400"}`}>
            {testStatus === "ok" ? "✓" : "✗"} {testMsg}
          </p>
        )}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Calendar size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full bg-background/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm pl-8 focus:outline-none focus:border-primary/50"
              data-testid="input-admin-date"
            />
          </div>
          <Button
            size="sm"
            onClick={handleTestAndAdd}
            disabled={!newSunoUrl.trim() || !newTitle.trim() || addTrack.isPending || testStatus === "testing"}
            className={`gap-1 ${testStatus === "ok" ? "bg-green-600 hover:bg-green-700" : ""}`}
            data-testid="button-admin-add"
          >
            {testStatus === "testing" ? <RefreshCw size={14} className="animate-spin" /> :
             testStatus === "ok" ? <Plus size={14} /> : <RefreshCw size={14} />}
            {testStatus === "testing" ? "Testing..." : testStatus === "ok" ? "Save Track" : "Test & Add"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Stream is verified before saving. Leave date empty to play every day.
        </p>
      </div>
    </div>
  );
}

export function MusicPlayer() {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(true);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLooping] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdminUser = isAuthenticated && !!user?.id;

  const { data: tracks = [] } = useQuery<Track[]>({
    queryKey: ["/api/music/tracks"],
    queryFn: async () => {
      const res = await fetch("/api/music/tracks");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Muted autoplay — allowed by all browsers without a user gesture.
  // Auto-unmutes on the first user interaction (click, scroll, or touch).
  useEffect(() => {
    if (tracks.length === 0 || hasAutoPlayed) return;

    const audio = new Audio(getSunoAudioUrl(tracks[0].sunoId));
    audio.loop = true;
    audio.volume = 0.8;
    audio.muted = true;
    audioRef.current = audio;

    const onFirstInteraction = () => {
      if (audioRef.current) {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
      document.removeEventListener("scroll", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
    };

    audio.play()
      .then(() => {
        setCurrentTrack(0);
        setIsPlaying(true);
        setIsMuted(true);
        setHasAutoPlayed(true);
        startProgressTracking();
        // Auto-unmute on any user interaction
        document.addEventListener("click", onFirstInteraction);
        document.addEventListener("touchstart", onFirstInteraction);
        document.addEventListener("scroll", onFirstInteraction);
        document.addEventListener("keydown", onFirstInteraction);
      })
      .catch(() => {
        // Fallback: wait for first interaction if muted autoplay fails
        audioRef.current = null;
        const onFirstInteractionFallback = () => {
          if (audioRef.current) return;
          const a = new Audio(getSunoAudioUrl(tracks[0].sunoId));
          a.loop = true;
          a.volume = 0.8;
          a.muted = false;
          audioRef.current = a;
          a.play().then(() => {
            setCurrentTrack(0);
            setIsPlaying(true);
            setIsMuted(false);
            setHasAutoPlayed(true);
            startProgressTracking();
          }).catch(() => {});
          document.removeEventListener("click", onFirstInteractionFallback);
          document.removeEventListener("touchstart", onFirstInteractionFallback);
        };
        document.addEventListener("click", onFirstInteractionFallback);
        document.addEventListener("touchstart", onFirstInteractionFallback);
      });
  }, [tracks, hasAutoPlayed]);

  const startProgressTracking = useCallback(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      if (audioRef.current) {
        setProgress(audioRef.current.currentTime);
        setDuration(audioRef.current.duration || 0);
      }
    }, 500);
  }, []);

  const stopProgressTracking = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopProgressTracking();
  }, [stopProgressTracking]);

  const playTrack = useCallback((index: number) => {
    if (tracks.length === 0) return;
    const trackIndex = index % tracks.length;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(getSunoAudioUrl(tracks[trackIndex].sunoId));
    audio.loop = true;
    audio.muted = isMuted;
    audioRef.current = audio;

    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    });
    audio.addEventListener("error", () => {
      setIsPlaying(false);
      stopProgressTracking();
    });

    setCurrentTrack(trackIndex);

    audio.play().then(() => {
      setIsPlaying(true);
      setHasAutoPlayed(true);
      startProgressTracking();
    }).catch(() => {});
  }, [tracks, isMuted, startProgressTracking, stopProgressTracking]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleUnmute = () => {
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const togglePlayPause = () => {
    if (!audioRef.current || tracks.length === 0) {
      if (tracks.length > 0) playTrack(currentTrack);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      stopProgressTracking();
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
      startProgressTracking();
    }
  };

  const skipNext = () => {
    if (tracks.length <= 1) return;
    playTrack((currentTrack + 1) % tracks.length);
  };

  const skipPrev = () => {
    if (tracks.length <= 1) return;
    playTrack((currentTrack - 1 + tracks.length) % tracks.length);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
    setProgress(pct * duration);
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    stopProgressTracking();
    setIsOpen(false);
    setProgress(0);
    setShowAdmin(false);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center justify-center hover:scale-110 transition-transform animate-pulse"
        data-testid="button-open-music"
      >
        <Music size={24} className="text-primary-foreground" />
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300 ${
        isMinimized ? "w-72" : "w-80"
      }`}
      data-testid="card-music-player"
    >
      <div className="flex items-center justify-between p-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPlaying ? "bg-primary/20 animate-pulse" : "bg-primary/20"}`}>
            <Music size={16} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-display font-bold truncate">
              {isPlaying && tracks.length > 0 ? tracks[currentTrack]?.title : "BetFans Radio"}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {isPlaying ? (isMuted ? "Playing (muted)" : "Now Playing") : "Powered by Suno AI"}
              {isLooping && isPlaying && !isMuted && " · Looping"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isAdminUser && (
            <button
              onClick={() => { setShowAdmin(!showAdmin); setIsMinimized(false); }}
              className={`p-1.5 rounded-lg transition-colors ${showAdmin ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              data-testid="button-admin-panel"
            >
              <Settings size={16} />
            </button>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-toggle-player"
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-close-music"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tap-to-unmute banner — shown when autoplaying muted */}
      {isPlaying && isMuted && (
        <button
          onClick={handleUnmute}
          className="w-full px-3 py-2 flex items-center justify-center gap-2 bg-primary/10 border-b border-primary/20 hover:bg-primary/20 transition-colors group"
          data-testid="button-tap-unmute"
        >
          <VolumeX size={13} className="text-primary animate-pulse" />
          <span className="text-[11px] font-semibold text-primary tracking-wide uppercase">Tap to Unmute</span>
          <Volume2 size={13} className="text-primary/50 group-hover:text-primary transition-colors" />
        </button>
      )}

      {isMinimized && tracks.length > 0 && (
        <div className="px-3 py-2 flex items-center gap-2">
          <button
            onClick={isPlaying ? togglePlayPause : () => playTrack(currentTrack)}
            className="text-primary"
            data-testid="button-play-mini"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer" onClick={handleSeek}>
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
            />
          </div>
          <button
            onClick={toggleMute}
            className={`${isMuted ? "text-primary animate-pulse" : "text-muted-foreground hover:text-foreground"} transition-colors`}
            data-testid="button-mute-mini"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      )}

      {!isMinimized && (
        <div className="p-3 space-y-3">
          {showAdmin ? (
            <AdminPanel onClose={() => setShowAdmin(false)} />
          ) : (
            <>
              <div className="bg-background/30 rounded-xl p-4 text-center">
                <div
                  className={`w-16 h-16 mx-auto rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mb-3 ${isPlaying && !isMuted ? "animate-spin" : ""}`}
                  style={isPlaying && !isMuted ? { animationDuration: "3s" } : {}}
                >
                  <Music size={28} className="text-primary" />
                </div>
                <p className="text-sm font-bold truncate">
                  {tracks.length > 0 ? tracks[currentTrack]?.title : "No Tracks Available"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(progress)} / {formatTime(duration)}
                </p>
              </div>

              <div
                className="h-1.5 bg-white/10 rounded-full cursor-pointer"
                onClick={handleSeek}
                data-testid="progress-bar"
              >
                <div
                  className="h-full bg-gradient-to-r from-primary to-green-400 rounded-full transition-all relative"
                  style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg" />
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <div className="p-2 rounded-lg text-primary bg-primary/10" title="Looping continuously">
                  <Repeat size={18} />
                </div>
                <button
                  onClick={skipPrev}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-prev"
                >
                  <SkipBack size={20} />
                </button>
                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                  disabled={tracks.length === 0}
                  data-testid="button-play-pause"
                >
                  {isPlaying ? <Pause size={22} className="text-primary-foreground" /> : <Play size={22} className="text-primary-foreground ml-0.5" />}
                </button>
                <button
                  onClick={skipNext}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-next"
                >
                  <SkipForward size={20} />
                </button>
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-lg transition-colors ${isMuted ? "text-primary bg-primary/10 animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                  data-testid="button-mute"
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
