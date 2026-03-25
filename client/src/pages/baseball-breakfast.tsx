import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, TrendingUp, Flame, Target, CircleDot, Clock, Loader2, Coffee,
  Sun, Zap, CheckCircle2, XCircle, UserCircle2, Send, ChevronRight, Swords
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
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
}

interface BBData {
  founder: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  games: MLBGame[];
  stats: { wins: number; losses: number; profit: number; roi: number; streak: number; totalPicks: number };
  date: string;
}

interface DraftPick {
  gameId: number;
  pick: string;
  predictionType: string;
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card className="bg-card/30 border-white/5">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", color)}>
          <Icon size={16} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-base font-display font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
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

export default function BaseballBreakfast() {
  const { user } = useAuth() as { user: any };
  const isFounder = user?.referralCode === "NIKCOX";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<number, DraftPick>>({});

  const { data, isLoading } = useQuery<BBData>({ queryKey: ["/api/baseball-breakfast"] });
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const submitPicks = useMutation({
    mutationFn: async (picks: DraftPick[]) => {
      for (const p of picks) {
        await apiRequest("POST", "/api/baseball-breakfast/pick", p);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baseball-breakfast"] });
      setDrafts({});
      const count = Object.keys(drafts).length;
      toast({ title: `${count} pick${count !== 1 ? "s" : ""} posted!`, description: "Your picks are live on Baseball Breakfast." });
    },
    onError: (e: any) => toast({ title: "Error posting picks", description: e.message, variant: "destructive" }),
  });

  const gradePick = useMutation({
    mutationFn: ({ id, result }: { id: number; result: string }) =>
      apiRequest("PATCH", `/api/baseball-breakfast/pick/${id}`, { result }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/baseball-breakfast"] });
      qc.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      const label = vars.result === "win" ? "Win recorded!" : vars.result === "loss" ? "Loss recorded." : "Result updated.";
      toast({ title: label, description: "Leaderboard updated automatically." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const stats = data?.stats || { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0, totalPicks: 0 };
  const games = data?.games || [];
  const founder = data?.founder;
  const draftCount = Object.keys(drafts).length;

  function selectPick(game: MLBGame, pick: string, predictionType: string) {
    setDrafts((prev) => {
      const existing = prev[game.gameId];
      if (existing?.pick === pick && existing?.predictionType === predictionType) {
        const next = { ...prev };
        delete next[game.gameId];
        return next;
      }
      return {
        ...prev,
        [game.gameId]: { gameId: game.gameId, pick, predictionType },
      };
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className={cn("container mx-auto px-4 pt-24 max-w-5xl", draftCount > 0 ? "pb-32" : "pb-16")}>

        {/* Hero banner */}
        <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/40 via-card/60 to-red-900/20 border border-white/5 p-6 md:p-10">
          <div className="absolute top-4 right-4 opacity-10"><Coffee size={110} /></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sun size={14} className="text-yellow-400" />
              <span className="text-xs text-yellow-400/80 font-medium tracking-widest uppercase">Daily MLB Picks · Live Leaderboard</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2" data-testid="text-bb-title">
              Baseball For Breakfast
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              {isFounder
                ? "Tap a team to select your picks, then hit Submit at the bottom."
                : "The Founder picks every MLB game, live. Beat his record — join BetFans and get on the leaderboard."}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">{today}</p>
          </div>
        </div>

        {/* Founder record — bold public challenge card */}
        {founder && (
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-card/30 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">

              {/* Avatar + name */}
              <div className="flex items-center gap-4 shrink-0">
                {founder.profileImageUrl ? (
                  <img src={founder.profileImageUrl} alt="Founder" className="w-16 h-16 rounded-full border-2 border-primary/50 shadow-lg shadow-primary/20" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary font-display font-bold text-2xl shadow-lg shadow-primary/20">
                    {(founder.firstName?.[0] || "N").toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] font-bold tracking-widest">FOUNDER</Badge>
                  </div>
                  <p className="font-display font-bold text-lg leading-tight">{founder.firstName} {founder.lastName}</p>
                  <p className="text-xs text-muted-foreground">MLB Specialist · BetFans</p>
                </div>
              </div>

              {/* Big stats */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center bg-white/5 rounded-xl py-3 px-2 border border-white/5">
                  <p className="text-3xl font-display font-black text-white leading-none" data-testid="stat-record">
                    {stats.wins}<span className="text-muted-foreground/50 text-xl">-</span>{stats.losses}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Record</p>
                </div>
                <div className="text-center bg-white/5 rounded-xl py-3 px-2 border border-white/5">
                  <p className={cn("text-3xl font-display font-black leading-none", stats.roi >= 0 ? "text-green-400" : "text-red-400")} data-testid="stat-roi">
                    {stats.roi >= 0 ? "+" : ""}{stats.roi}%
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">ROI</p>
                </div>
                <div className="text-center bg-white/5 rounded-xl py-3 px-2 border border-white/5">
                  <p className="text-3xl font-display font-black text-white leading-none" data-testid="stat-winrate">
                    {stats.totalPicks > 0 ? `${Math.round((stats.wins / stats.totalPicks) * 100)}%` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Win Rate</p>
                </div>
                <div className="text-center bg-white/5 rounded-xl py-3 px-2 border border-white/5">
                  <p className="text-3xl font-display font-black text-orange-400 leading-none" data-testid="stat-streak">
                    {stats.streak > 0 ? `${stats.streak}W` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Streak</p>
                </div>
              </div>

              {/* CTA for non-members */}
              {!user && (
                <div className="shrink-0 flex flex-col gap-2 items-center md:items-end text-center md:text-right">
                  <p className="text-xs text-muted-foreground max-w-[140px]">Think you can beat this record?</p>
                  <a href="/membership">
                    <Button className="bg-primary text-primary-foreground gap-2 w-full" data-testid="button-challenge-founder">
                      <Swords size={14} />
                      Challenge Me
                    </Button>
                  </a>
                  <a href="/auth" className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors" data-testid="link-login-bb">
                    Already a member? Log in
                  </a>
                </div>
              )}
              {user && !isFounder && (
                <div className="shrink-0">
                  <a href="/leaderboard">
                    <Button variant="outline" className="border-primary/20 text-primary hover:bg-primary/10 gap-2" data-testid="button-view-leaderboard">
                      <Trophy size={14} />
                      Leaderboard
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Login prompt for non-users when no founder data */}
        {!user && !founder && (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-bold text-sm">Already a member?</p>
              <p className="text-xs text-muted-foreground">Log in to post your picks and appear on the leaderboard.</p>
            </div>
            <a href="/auth">
              <Button size="sm" className="bg-primary text-primary-foreground shrink-0" data-testid="button-login-bb">
                Log In
              </Button>
            </a>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-display font-bold flex items-center gap-2">
            <CircleDot size={16} className="text-primary" />
            Today's MLB Schedule
            <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 text-[10px]">{games.length} GAMES</Badge>
          </h2>
          {isFounder && (
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
              <Zap size={9} className="mr-1" />FOUNDER MODE
            </Badge>
          )}
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
              const draft = drafts[game.gameId];
              const isFinished = game.status === "Final";

              return (
                <Card
                  key={game.gameId}
                  className={cn(
                    "bg-card/30 border-white/5 hover:border-white/10 transition-all",
                    draft && "border-primary/40 bg-primary/5"
                  )}
                  data-testid={`card-game-${game.gameId}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <GameStatusBadge status={game.status} inning={game.inning} inningHalf={game.inningHalf} />
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock size={9} />
                        {new Date(game.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                      </div>
                    </div>

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

                    <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Zap size={10} className="text-primary" />
                        <span className="text-[10px] text-primary uppercase tracking-wider font-medium">Spider AI</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{game.spider.confidence}% confidence</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-muted-foreground">{game.spider.type}</p>
                          <p className="font-display font-bold text-sm text-primary">{game.spider.pick}</p>
                        </div>
                        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${game.spider.confidence}%` }} />
                        </div>
                      </div>
                    </div>

                    {game.founderPick ? (
                      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Coffee size={10} className="text-yellow-400" />
                              <span className="text-[10px] text-yellow-400 uppercase tracking-wider">Founder's Pick</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{game.founderPick.predictionType}</p>
                            <p className="font-display font-bold text-sm">{game.founderPick.pick}</p>
                          </div>
                          <PickResultBadge result={game.founderPick.result} />
                        </div>
                        {isFounder && (
                          <div className="flex gap-1.5 pt-1 border-t border-white/5">
                            <button
                              onClick={() => gradePick.mutate({ id: game.founderPick.id, result: "win" })}
                              disabled={gradePick.isPending}
                              className={cn("flex-1 rounded-md py-1.5 text-[10px] font-bold border transition-all",
                                game.founderPick.result === "win"
                                  ? "bg-green-500/30 text-green-300 border-green-500/40"
                                  : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20")}
                              data-testid={`button-grade-win-${game.gameId}`}
                            >✓ WIN</button>
                            <button
                              onClick={() => gradePick.mutate({ id: game.founderPick.id, result: "loss" })}
                              disabled={gradePick.isPending}
                              className={cn("flex-1 rounded-md py-1.5 text-[10px] font-bold border transition-all",
                                game.founderPick.result === "loss"
                                  ? "bg-red-500/30 text-red-300 border-red-500/40"
                                  : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20")}
                              data-testid={`button-grade-loss-${game.gameId}`}
                            >✗ LOSS</button>
                            <button
                              onClick={() => gradePick.mutate({ id: game.founderPick.id, result: "push" })}
                              disabled={gradePick.isPending}
                              className={cn("flex-1 rounded-md py-1.5 text-[10px] font-bold border transition-all",
                                game.founderPick.result === "push"
                                  ? "bg-gray-500/30 text-gray-300 border-gray-500/40"
                                  : "bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20")}
                              data-testid={`button-grade-push-${game.gameId}`}
                            >PUSH</button>
                          </div>
                        )}
                      </div>
                    ) : isFounder && !isFinished ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => selectPick(game, game.awayTeam, "Moneyline")}
                            className={cn(
                              "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                              draft?.pick === game.awayTeam
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                            )}
                            data-testid={`button-pick-away-${game.gameId}`}
                          >
                            <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Away</p>
                            <p className="font-display font-bold text-xs">{game.awayAbbr || game.awayTeam.split(" ").slice(-1)[0]}</p>
                          </button>
                          <button
                            onClick={() => selectPick(game, game.homeTeam, "Moneyline")}
                            className={cn(
                              "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                              draft?.pick === game.homeTeam
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                            )}
                            data-testid={`button-pick-home-${game.gameId}`}
                          >
                            <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Home</p>
                            <p className="font-display font-bold text-xs">{game.homeAbbr || game.homeTeam.split(" ").slice(-1)[0]}</p>
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => selectPick(game, "Over", "Over/Under")}
                            className={cn(
                              "rounded-lg px-3 py-2 text-center transition-all border text-xs font-medium",
                              draft?.pick === "Over"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                            )}
                            data-testid={`button-pick-over-${game.gameId}`}
                          >
                            Over (O/U)
                          </button>
                          <button
                            onClick={() => selectPick(game, "Under", "Over/Under")}
                            className={cn(
                              "rounded-lg px-3 py-2 text-center transition-all border text-xs font-medium",
                              draft?.pick === "Under"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                            )}
                            data-testid={`button-pick-under-${game.gameId}`}
                          >
                            Under (O/U)
                          </button>
                        </div>
                        {draft && (
                          <p className="text-center text-[10px] text-primary/70 font-medium">
                            ✓ {draft.pick} selected — tap again to deselect
                          </p>
                        )}
                      </div>
                    ) : !isFounder && !isFinished ? (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 w-full justify-center py-1">
                        <Clock size={10} />
                        Founder's pick coming soon
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {isFounder && !isLoading && games.length > 0 && draftCount === 0 && (
        <div className="mt-8 flex justify-center">
          <a href="/leaderboard" className="flex items-center gap-2 text-xs text-primary/70 hover:text-primary transition-colors" data-testid="link-to-leaderboard">
            <Trophy size={12} />
            View your scores on the Leaderboard
            <ChevronRight size={12} />
          </a>
        </div>
      )}

      {isFounder && draftCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-white/10 px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-bold text-base">{draftCount} pick{draftCount !== 1 ? "s" : ""} selected</p>
              <p className="text-xs text-muted-foreground">
                {Object.values(drafts).map((d) => d.pick.split(" ").slice(-1)[0]).join(", ")}
              </p>
            </div>
            <Button
              className="bg-primary text-primary-foreground px-6 gap-2 shrink-0"
              onClick={() => submitPicks.mutate(Object.values(drafts))}
              disabled={submitPicks.isPending}
              data-testid="button-submit-bb-picks"
            >
              {submitPicks.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Post {draftCount} Pick{draftCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
