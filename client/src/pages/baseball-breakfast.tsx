import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, TrendingUp, Flame, Target, CircleDot, Clock, Loader2, Coffee,
  Sun, Zap, CheckCircle2, XCircle, UserCircle2, Send, ChevronRight, Swords,
  Volume2, VolumeX
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { ExpertBadge } from "@/components/ExpertBadge";
import { useToast } from "@/hooks/use-toast";

interface MLBGame {
  gameId: number;
  mlbGamePk: number;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  gameTime: string;
  status: string;
  detailedState: string;
  homeScore: number | null;
  awayScore: number | null;
  inning: number | null;
  inningHalf: string | null;
  venue: string;
  homePitcher: string | null;
  awayPitcher: string | null;
  spread: string | null;
  total: string | null;
  spider: { pick: string; confidence: number; type: string };
  founderPick: any | null;
  myPick: any | null;
}

interface BBData {
  founder: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  callerIsFounder: boolean;
  games: MLBGame[];
  stats: { wins: number; losses: number; profit: number; roi: number; streak: number; totalPicks: number };
  date: string;
}

interface MyBFBData {
  games: { gameId: number; myPick: { pick: string; result: string } | null; locked: boolean }[];
  record: { wins: number; losses: number; pushes: number; total: number; winPct: number; streak: number };
  founderRecord: { wins: number; losses: number };
  date: string;
}

interface DraftPick {
  gameId: number;
  pick: string;
  predictionType: string;
  homeTeam: string;
  awayTeam: string;
}

function GameStatusBadge({ status, inning, inningHalf }: { status: string; inning: number | null; inningHalf: string | null }) {
  if (status === "Live" || status === "In Progress") {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 inline-block" />
        {inning ? `${inningHalf === "Top" ? "▲" : "▼"} ${inning}` : "LIVE"}
      </Badge>
    );
  }
  if (status === "Final") return <Badge className="bg-white/10 text-white/60 border-white/10 text-[10px]">FINAL</Badge>;
  return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">UPCOMING</Badge>;
}

function PickResultBadge({ result }: { result: string }) {
  if (result === "win") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] gap-1"><CheckCircle2 size={9} />WIN</Badge>;
  if (result === "loss") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] gap-1"><XCircle size={9} />LOSS</Badge>;
  if (result === "push") return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-[10px]">PUSH</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">PENDING</Badge>;
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-3">
      <span className={cn("text-xl font-display font-black", color)}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{label}</span>
    </div>
  );
}

export default function BaseballBreakfast() {
  const { user } = useAuth() as { user: any };
  const qc = useQueryClient();
  const { toast } = useToast();

  // Founder pick drafts (official picks)
  const [founderDrafts, setFounderDrafts] = useState<Record<number, DraftPick>>({});
  // Member pick drafts (personal BFB picks)
  const [memberDrafts, setMemberDrafts] = useState<Record<number, string>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const audio = new Audio("/audio/baseball-for-breakfast.mp3");
    audio.loop = true;
    audio.volume = 0.4;
    audioRef.current = audio;
    audio.addEventListener("play", () => { setIsPlaying(true); setAudioBlocked(false); });
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.load();
    audio.play().catch(() => setAudioBlocked(true));
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => setAudioBlocked(true));
  }

  const { data, isLoading, refetch } = useQuery<BBData>({ queryKey: ["/api/baseball-breakfast"], refetchInterval: 60000 });

  const { data: myBfbData } = useQuery<MyBFBData>({
    queryKey: ["/api/my-bfb"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const isFounder = data?.callerIsFounder || (user?.referralCode === "NIKCOX");
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const stats = data?.stats || { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0, totalPicks: 0 };
  const games = data?.games || [];
  const founder = data?.founder;

  const record = myBfbData?.record || { wins: 0, losses: 0, pushes: 0, total: 0, winPct: 0, streak: 0 };
  const founderRecord = myBfbData?.founderRecord || { wins: 0, losses: 0 };
  const founderWinPct = founderRecord.wins + founderRecord.losses > 0
    ? Math.round((founderRecord.wins / (founderRecord.wins + founderRecord.losses)) * 1000) / 10
    : 0;

  // Per-game personal picks from my-bfb data
  const myBfbGameMap = new Map<number, { myPick: { pick: string; result: string } | null; locked: boolean }>();
  for (const g of myBfbData?.games || []) {
    myBfbGameMap.set(g.gameId, { myPick: g.myPick, locked: g.locked });
  }

  const founderDraftCount = Object.keys(founderDrafts).length;
  const memberDraftCount = Object.keys(memberDrafts).length;

  // Submit founder official picks
  const submitFounderPicks = useMutation({
    mutationFn: async (picks: DraftPick[]) => {
      for (const p of picks) {
        await apiRequest("POST", "/api/baseball-breakfast/pick", p);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baseball-breakfast"] });
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      const count = founderDraftCount;
      setFounderDrafts({});
      toast({ title: `${count} pick${count !== 1 ? "s" : ""} posted!`, description: "Your picks are live on Baseball Breakfast." });
    },
    onError: (e: any) => toast({ title: "Error posting picks", description: e.message, variant: "destructive" }),
  });

  // Submit member personal picks
  const submitMemberPicks = useMutation({
    mutationFn: async (picks: { gameId: number; pick: string; homeTeam: string; awayTeam: string }[]) => {
      for (const p of picks) {
        const res = await fetch("/api/my-bfb/pick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.message || "Failed to save pick");
        }
      }
    },
    onSuccess: () => {
      const count = memberDraftCount;
      setMemberDrafts({});
      toast({ title: `${count} pick${count !== 1 ? "s" : ""} locked in!`, description: "Your BFB picks are set. Good luck!" });
      qc.invalidateQueries({ queryKey: ["/api/my-bfb"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function selectFounderPick(game: MLBGame, pick: string) {
    setFounderDrafts((prev) => {
      const existing = prev[game.gameId];
      if (existing?.pick === pick) {
        const next = { ...prev };
        delete next[game.gameId];
        return next;
      }
      return { ...prev, [game.gameId]: { gameId: game.gameId, pick, predictionType: "Moneyline", homeTeam: game.homeTeam, awayTeam: game.awayTeam } };
    });
  }

  function toggleMemberDraft(game: MLBGame, pick: string) {
    setMemberDrafts(prev => {
      if (prev[game.gameId] === pick) {
        const next = { ...prev };
        delete next[game.gameId];
        return next;
      }
      return { ...prev, [game.gameId]: pick };
    });
  }

  function handleMemberSubmit() {
    const picks = Object.entries(memberDrafts).map(([gameId, pick]) => {
      const game = games.find(g => g.gameId === Number(gameId))!;
      return { gameId: Number(gameId), pick, homeTeam: game.homeTeam, awayTeam: game.awayTeam };
    });
    submitMemberPicks.mutate(picks);
  }

  const draftCount = isFounder ? founderDraftCount : memberDraftCount;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />

      <div className={cn("container mx-auto px-4 pt-24 max-w-5xl", draftCount > 0 ? "pb-32" : "pb-16")}>

        {/* Hero banner */}
        <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/40 via-card/60 to-red-900/20 border border-white/5 p-6 md:p-10">
          <div className="absolute top-4 right-4 opacity-10"><Coffee size={110} /></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Sun size={14} className="text-yellow-400" />
                <span className="text-xs text-yellow-400/80 font-medium tracking-widest uppercase">Daily MLB Picks · Live Leaderboard</span>
              </div>
              <button
                onClick={toggleMusic}
                data-testid="button-music-toggle"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-display transition-all duration-200 shrink-0",
                  isPlaying
                    ? "bg-primary/20 text-primary border-primary/40 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                    : audioBlocked
                      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20 animate-pulse"
                      : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/30 hover:text-primary"
                )}
              >
                {isPlaying ? <Volume2 size={12} /> : <VolumeX size={12} />}
                {isPlaying ? "♪ On" : audioBlocked ? "▶ Tap for Music" : "Music Off"}
              </button>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2" data-testid="text-bb-title">
              ⚾ Baseball For Breakfast
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              {isFounder
                ? "Post your official picks below. Members see your picks live."
                : user
                  ? "Pick a winner for every MLB game. Track your record and see how you stack up against the Founder."
                  : "The Founder picks every MLB game, live. Beat his record — join BetFans."}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">{today}</p>
          </div>
        </div>

        {/* Founder record card */}
        {founder && (
          <div className="relative mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-card/30 p-5">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-5">
              <div className="flex items-center gap-4 shrink-0">
                {founder.profileImageUrl ? (
                  <img src={founder.profileImageUrl} alt="Founder" className="w-14 h-14 rounded-full border-2 border-primary/50 shadow-lg shadow-primary/20" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary font-display font-bold text-xl shadow-lg shadow-primary/20">
                    {(founder.firstName?.[0] || "N").toUpperCase()}
                  </div>
                )}
                <div>
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] font-bold tracking-widest mb-0.5">FOUNDER</Badge>
                  <p className="font-display font-bold text-base leading-tight flex items-center gap-2">{founder.firstName} {founder.lastName}<ExpertBadge /></p>
                  <p className="text-xs text-muted-foreground">MLB Specialist · BetFans</p>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div className="text-center bg-white/5 rounded-xl py-2.5 px-2 border border-white/5">
                  <p className="text-2xl font-display font-black text-white leading-none" data-testid="stat-record">
                    {stats.wins}<span className="text-muted-foreground/50 text-lg">-</span>{stats.losses}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Record</p>
                </div>
                <div className="text-center bg-white/5 rounded-xl py-2.5 px-2 border border-white/5">
                  <p className="text-2xl font-display font-black leading-none text-primary" data-testid="stat-winpct">
                    {stats.totalPicks > 0 ? ((stats.wins / stats.totalPicks) * 100).toFixed(1) : "0.0"}%
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Win %</p>
                </div>
                <div className="text-center bg-white/5 rounded-xl py-2.5 px-2 border border-white/5">
                  <p className="text-2xl font-display font-black text-orange-400 leading-none" data-testid="stat-streak">
                    {stats.streak > 0 ? `${stats.streak}W` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Streak</p>
                </div>
              </div>
              {!user && (
                <div className="shrink-0 flex flex-col gap-2 items-start md:items-end">
                  <a href="/membership">
                    <Button size="sm" className="bg-primary text-primary-foreground gap-2" data-testid="button-challenge-founder">
                      <Swords size={13} />Challenge Me
                    </Button>
                  </a>
                  <a href="/auth" className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors" data-testid="link-login-bb">
                    Already a member? Log in
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MY RECORD — shown for all logged-in members */}
        {user && !isFounder && (
          <>
            <Card className="bg-card/40 border-primary/20 mb-3">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                  <Target size={14} className="text-primary" />
                  <span className="text-sm font-display font-bold text-primary uppercase tracking-wide">My Record</span>
                  {record.total > 0 && record.streak !== 0 && (
                    <Badge className={cn("text-[10px] gap-1", record.streak > 0 ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30")}>
                      {record.streak > 0 ? <><Flame size={9} />{record.streak}W Streak</> : <>{Math.abs(record.streak)}L Streak</>}
                    </Badge>
                  )}
                </div>
                <div className="flex divide-x divide-white/5">
                  <StatPill label="Wins" value={record.wins} color="text-green-400" />
                  <StatPill label="Losses" value={record.losses} color="text-red-400" />
                  <StatPill label="Win %" value={record.total > 0 ? `${record.winPct}%` : "—"} color="text-primary" />
                  <StatPill label="Total" value={record.total} color="text-white/70" />
                </div>
              </CardContent>
            </Card>

            {/* Beat the Founder bar */}
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 mb-5 flex items-center gap-3" data-testid="founder-challenge-bar">
              <Swords size={15} className="text-yellow-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-yellow-300">Beat the Founder</p>
                <p className="text-[11px] text-yellow-400/70">
                  Founder: <span className="text-yellow-300 font-mono">{founderRecord.wins}W – {founderRecord.losses}L ({founderWinPct}%)</span>
                  {record.total > 0 && (
                    <span className="ml-2">
                      · You: <span className={cn("font-mono font-bold", record.winPct >= founderWinPct ? "text-green-400" : "text-red-400")}>
                        {record.winPct}%
                      </span>
                      {record.winPct >= founderWinPct && <span className="text-green-400 ml-1">🔥 You're ahead!</span>}
                    </span>
                  )}
                </p>
              </div>
              <Trophy size={13} className="text-yellow-400/40 shrink-0" />
            </div>
          </>
        )}

        {/* Login prompt for visitors */}
        {!user && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-bold text-sm">Log in to submit picks</p>
              <p className="text-xs text-muted-foreground">Members post picks and appear on the leaderboard.</p>
            </div>
            <a href="/auth">
              <Button size="sm" className="bg-primary text-primary-foreground shrink-0" data-testid="button-login-bb">Log In</Button>
            </a>
          </div>
        )}

        {/* Games header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-display font-bold flex items-center gap-2">
            <CircleDot size={16} className="text-primary" />
            Today's MLB Games
            <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 text-[10px]">{games.length} GAMES</Badge>
          </h2>
          <div className="flex items-center gap-2">
            {isFounder && (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                <Zap size={9} className="mr-1" />FOUNDER MODE
              </Badge>
            )}
            {isFounder && games.filter(g => g.status !== "Final" && !g.founderPick).length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10 text-[11px] h-7 px-2 gap-1"
                data-testid="button-pick-all-spider"
                onClick={() => {
                  const newDrafts: Record<number, DraftPick> = {};
                  for (const g of games) {
                    if (g.status !== "Final" && !g.founderPick && g.spider?.pick) {
                      newDrafts[g.gameId] = { gameId: g.gameId, pick: g.spider.pick, predictionType: g.spider.type || "Moneyline", homeTeam: g.homeTeam, awayTeam: g.awayTeam };
                    }
                  }
                  setFounderDrafts(newDrafts);
                }}
              >
                <Zap size={10} />Pick All (Spider AI)
              </Button>
            )}
            <button onClick={() => refetch()} className="text-[11px] text-muted-foreground hover:text-white transition-colors">↻ Refresh</button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={30} className="animate-spin text-primary" />
          </div>
        ) : games.length === 0 ? (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-10 text-center">
              <Coffee size={36} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-display font-bold text-sm mb-1">No MLB games today</p>
              <p className="text-xs text-muted-foreground">Check back on the next game day for live picks and Spider AI analysis.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {games.map((game) => {
              const founderDraft = founderDrafts[game.gameId];
              const memberDraft = memberDrafts[game.gameId];
              const isFinished = game.status === "Final";
              const isLive = game.status === "Live" || game.status === "live" || game.status === "In Progress";
              const isStarted = game.gameTime && new Date(game.gameTime) <= new Date();
              const isLocked = isFinished || isLive || isStarted;

              // Member's personal pick from /api/my-bfb
              const myBfbGame = myBfbGameMap.get(game.gameId);
              const myPersonalPick = myBfbGame?.myPick || null;
              const memberGameLocked = myBfbGame?.locked || isLocked;

              return (
                <Card
                  key={game.gameId}
                  className={cn(
                    "bg-card/30 border-white/5 hover:border-white/10 transition-all",
                    (founderDraft || memberDraft) && "border-primary/40 bg-primary/5"
                  )}
                  data-testid={`card-game-${game.gameId}`}
                >
                  <CardContent className="p-5">
                    {/* Status + time */}
                    <div className="flex items-center justify-between mb-3">
                      <GameStatusBadge status={game.status} inning={game.inning} inningHalf={game.inningHalf} />
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock size={9} />
                        {new Date(game.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                      </div>
                    </div>

                    {/* Teams + score */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground mb-0.5">AWAY</p>
                        <p className="font-display font-bold text-base leading-tight">{game.awayAbbr || game.awayTeam}</p>
                        <p className="text-[10px] text-muted-foreground/60 truncate max-w-[80px] mx-auto">{game.awayTeam}</p>
                      </div>
                      <div className="text-center px-3">
                        {game.homeScore !== null && game.awayScore !== null ? (
                          <p className="font-display font-bold text-2xl text-white">{game.awayScore} - {game.homeScore}</p>
                        ) : (
                          <p className="text-muted-foreground/40 text-xs font-medium">VS</p>
                        )}
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground mb-0.5">HOME</p>
                        <p className="font-display font-bold text-base leading-tight">{game.homeAbbr || game.homeTeam}</p>
                        <p className="text-[10px] text-muted-foreground/60 truncate max-w-[80px] mx-auto">{game.homeTeam}</p>
                      </div>
                    </div>

                    {/* Pitchers */}
                    {(game.awayPitcher || game.homePitcher) && (
                      <div className="flex items-center justify-between mb-3 px-2 py-2 rounded-lg bg-white/3 border border-white/5">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <UserCircle2 size={11} className="text-muted-foreground/50 shrink-0" />
                          <span className="text-[10px] text-muted-foreground/80 truncate">{game.awayPitcher || "TBD"}</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/30 px-2 shrink-0">SP</span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <span className="text-[10px] text-muted-foreground/80 truncate text-right">{game.homePitcher || "TBD"}</span>
                          <UserCircle2 size={11} className="text-muted-foreground/50 shrink-0" />
                        </div>
                      </div>
                    )}

                    {/* ── FOUNDER PICK AREA ── */}
                    {isFounder ? (
                      game.founderPick ? (
                        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Coffee size={10} className="text-yellow-400" />
                                <span className="text-[10px] text-yellow-400 uppercase tracking-wider">My Official Pick</span>
                              </div>
                              <p className="font-display font-bold text-sm">{game.founderPick.pick}</p>
                            </div>
                            <PickResultBadge result={game.founderPick.result} />
                          </div>
                        </div>
                      ) : !isLocked ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => selectFounderPick(game, game.awayTeam)}
                              className={cn(
                                "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                                founderDraft?.pick === game.awayTeam
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                              )}
                              data-testid={`button-pick-away-${game.gameId}`}
                            >
                              <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Away</p>
                              <p className="font-display font-bold text-xs">{game.awayAbbr || game.awayTeam.split(" ").slice(-1)[0]}</p>
                            </button>
                            <button
                              onClick={() => selectFounderPick(game, game.homeTeam)}
                              className={cn(
                                "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                                founderDraft?.pick === game.homeTeam
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                              )}
                              data-testid={`button-pick-home-${game.gameId}`}
                            >
                              <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Home</p>
                              <p className="font-display font-bold text-xs">{game.homeAbbr || game.homeTeam.split(" ").slice(-1)[0]}</p>
                            </button>
                          </div>
                          {founderDraft && (
                            <p className="text-center text-[10px] text-primary/70 font-medium">
                              ✓ {founderDraft.pick} selected — tap again to deselect
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40 w-full justify-center py-1">
                          <Clock size={10} />
                          {isFinished ? "Final" : "Game started — picks locked"}
                        </div>
                      )
                    ) : (
                      /* ── MEMBER PICK AREA ── */
                      <div className="space-y-2">
                        {/* Founder's official pick shown to members */}
                        {game.founderPick && (
                          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Coffee size={9} className="text-yellow-400" />
                              <span className="text-[10px] text-yellow-400 uppercase tracking-wider">Founder's Pick</span>
                              <span className="text-[11px] font-display font-bold text-white ml-1">{game.founderPick.pick}</span>
                            </div>
                            <PickResultBadge result={game.founderPick.result} />
                          </div>
                        )}

                        {/* Member's own pick or pick buttons */}
                        {myPersonalPick ? (
                          <div className={cn(
                            "rounded-lg px-3 py-2.5 border flex items-center justify-between",
                            myPersonalPick.result === "win" ? "bg-green-500/8 border-green-500/30" :
                            myPersonalPick.result === "loss" ? "bg-red-500/8 border-red-500/30" :
                            "bg-blue-500/5 border-blue-500/20"
                          )}>
                            <div>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Target size={9} className="text-blue-400" />
                                <span className="text-[10px] text-blue-400 uppercase tracking-wider">My Pick</span>
                              </div>
                              <p className="font-display font-bold text-sm">{myPersonalPick.pick}</p>
                            </div>
                            <PickResultBadge result={myPersonalPick.result} />
                          </div>
                        ) : !memberGameLocked && user ? (
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-muted-foreground/60 text-center uppercase tracking-wider">Your Pick</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => toggleMemberDraft(game, game.awayTeam)}
                                className={cn(
                                  "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                                  memberDraft === game.awayTeam
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-white"
                                )}
                                data-testid={`pick-away-${game.gameId}`}
                              >
                                <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Away</p>
                                <p className="font-display font-bold text-xs">{game.awayAbbr || game.awayTeam.split(" ").slice(-1)[0]}</p>
                              </button>
                              <button
                                onClick={() => toggleMemberDraft(game, game.homeTeam)}
                                className={cn(
                                  "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                                  memberDraft === game.homeTeam
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-white"
                                )}
                                data-testid={`pick-home-${game.gameId}`}
                              >
                                <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Home</p>
                                <p className="font-display font-bold text-xs">{game.homeAbbr || game.homeTeam.split(" ").slice(-1)[0]}</p>
                              </button>
                            </div>
                            {memberDraft && (
                              <p className="text-center text-[10px] text-primary/70 font-medium">
                                ✓ {memberDraft} selected
                              </p>
                            )}
                          </div>
                        ) : memberGameLocked && !myPersonalPick ? (
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40 w-full justify-center py-1">
                            <Clock size={10} />
                            {isFinished ? "Final — no pick submitted" : "Game started — picks locked"}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {isFounder && !isLoading && games.length > 0 && founderDraftCount === 0 && (
          <div className="mt-8 flex justify-center">
            <a href="/leaderboard" className="flex items-center gap-2 text-xs text-primary/70 hover:text-primary transition-colors" data-testid="link-to-leaderboard">
              <Trophy size={12} />
              View scores on the Leaderboard
              <ChevronRight size={12} />
            </a>
          </div>
        )}
      </div>

      {/* Floating submit bar — founder */}
      {isFounder && founderDraftCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-white/10 px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-bold text-base">{founderDraftCount} pick{founderDraftCount !== 1 ? "s" : ""} selected</p>
              <p className="text-xs text-muted-foreground">
                {Object.values(founderDrafts).map((d) => d.pick.split(" ").slice(-1)[0]).join(", ")}
              </p>
            </div>
            <Button
              className="bg-primary text-primary-foreground px-6 gap-2 shrink-0"
              onClick={() => submitFounderPicks.mutate(Object.values(founderDrafts))}
              disabled={submitFounderPicks.isPending}
              data-testid="button-submit-bb-picks"
            >
              {submitFounderPicks.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Post {founderDraftCount} Pick{founderDraftCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Floating submit bar — member */}
      {!isFounder && memberDraftCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/90 backdrop-blur-md border-t border-primary/20" data-testid="mybfb-submit-bar">
          <div className="container mx-auto max-w-5xl flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-display font-bold text-primary">{memberDraftCount} pick{memberDraftCount !== 1 ? "s" : ""} ready</p>
              <p className="text-[11px] text-muted-foreground">Locks at each game's start time</p>
            </div>
            <Button
              onClick={handleMemberSubmit}
              disabled={submitMemberPicks.isPending}
              className="gap-2 font-display font-bold px-6"
              data-testid="button-mybfb-submit"
            >
              {submitMemberPicks.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {submitMemberPicks.isPending ? "Locking…" : "Lock In Picks"}
            </Button>
          </div>
        </div>
      )}

      <AdBannerInline />
    </div>
  );
}
