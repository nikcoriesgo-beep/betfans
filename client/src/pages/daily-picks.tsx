import { useState, useMemo, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap, Clock, Loader2, CheckCircle2, XCircle, Lock,
  CircleDot, Calendar, Send
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const LEAGUES = ["All", "MLB", "NBA", "MLS", "NCAAB", "NCAABB"];

const LEAGUE_COLORS: Record<string, string> = {
  MLB: "bg-red-500/20 text-red-400 border-red-500/30",
  NBA: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MLS: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  NCAAB: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  NCAABB: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const BET_TYPES: Record<string, string[]> = {
  MLB: ["Moneyline", "Run Line", "Over/Under", "First 5 Innings"],
  NBA: ["Moneyline", "Spread", "Over/Under"],
  MLS: ["Moneyline", "Draw", "Over/Under"],
  NCAAB: ["Moneyline", "Spread", "Over/Under"],
  NCAABB: ["Moneyline", "Run Line", "Over/Under"],
};

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 inline-block" />LIVE
    </Badge>
  );
  if (status === "finished") return <Badge className="bg-white/10 text-white/50 border-white/10 text-[10px]">FINAL</Badge>;
  return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">UPCOMING</Badge>;
}

function ResultBadge({ result }: { result: string }) {
  if (result === "win") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] gap-1"><CheckCircle2 size={9} />WIN</Badge>;
  if (result === "loss") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] gap-1"><XCircle size={9} />LOSS</Badge>;
  if (result === "push") return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-[10px]">PUSH</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">PENDING</Badge>;
}

interface DraftPick {
  gameId: number;
  pick: string;
  predictionType: string;
}

const FOUNDER_CODE = "NIKCOX";

export default function DailyPicks() {
  const { user } = useAuth() as { user: any };
  const qc = useQueryClient();
  const { toast } = useToast();
  const [league, setLeague] = useState("All");
  const [drafts, setDrafts] = useState<Record<number, DraftPick>>({});

  const isFounder = user?.referralCode === FOUNDER_CODE;

  const { data: allGames = [], isLoading: gamesLoading } = useQuery<any[]>({ queryKey: ["/api/games"] });
  const { data: myPredictions = [] } = useQuery<any[]>({
    queryKey: ["/api/predictions"],
    enabled: !!user,
  });

  const syncGames = useMutation({
    mutationFn: () => apiRequest("POST", "/api/games/sync"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/games"] }); },
  });

  useEffect(() => {
    if (user) syncGames.mutate();
  }, [!!user]);

  const submitPicks = useMutation({
    mutationFn: async (picks: DraftPick[]) => {
      for (const p of picks) {
        await apiRequest("POST", "/api/predictions", { ...p, odds: null, units: 1 });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      setDrafts({});
      toast({ title: `${Object.keys(drafts).length} picks locked in!`, description: "Results update automatically when games finish." });
    },
    onError: (e: any) => toast({ title: "Error submitting picks", description: e.message, variant: "destructive" }),
  });

  const todayGames = useMemo(() => allGames.filter((g) => isToday(g.gameTime)), [allGames]);
  const filteredGames = useMemo(() =>
    league === "All" ? todayGames : todayGames.filter((g) => g.league === league),
    [todayGames, league]
  );

  const myPicksToday = useMemo(() => {
    const todayGameIds = new Set(todayGames.map((g) => g.id));
    return myPredictions.filter((p) => {
      if (!todayGameIds.has(p.gameId)) return false;
      const d = new Date(p.createdAt);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
  }, [myPredictions, todayGames]);

  const myPickGameIds = new Set(myPicksToday.map((p) => p.gameId));
  const wins = myPicksToday.filter((p) => p.result === "win").length;
  const losses = myPicksToday.filter((p) => p.result === "loss").length;
  const pending = myPicksToday.filter((p) => p.result === "pending").length;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const activeLeagues = ["All", ...Array.from(new Set(todayGames.map((g) => g.league)))];
  const draftCount = Object.keys(drafts).length;

  function selectPick(game: any, pick: string, predictionType: string) {
    setDrafts((prev) => {
      const existing = prev[game.id];
      if (existing?.pick === pick && existing?.predictionType === predictionType) {
        const next = { ...prev };
        delete next[game.id];
        return next;
      }
      return { ...prev, [game.id]: { gameId: game.id, pick, predictionType } };
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className={cn("container mx-auto px-4 pt-24 max-w-5xl", draftCount > 0 ? "pb-32" : "pb-16")}>

        <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card/60 to-blue-900/20 border border-white/5 p-6 md:p-10">
          <div className="absolute top-4 right-4 opacity-10"><Zap size={110} /></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-primary" />
              <span className="text-xs text-primary/80 font-medium tracking-widest uppercase">Daily Picks</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2" data-testid="text-daily-picks-title">
              Today's Games
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              Tap a team to select your pick. When you're done, hit <strong>Submit Picks</strong> at the bottom.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <p className="text-xs text-muted-foreground/50">{today}</p>
              {syncGames.isPending && (
                <span className="flex items-center gap-1 text-[10px] text-primary/60">
                  <Loader2 size={10} className="animate-spin" />syncing games…
                </span>
              )}
            </div>
          </div>
        </div>

        {user && myPicksToday.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-6">
            <Card className="bg-card/30 border-white/5"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Today's Picks</p>
              <p className="font-display font-bold text-xl">{myPicksToday.length}</p>
            </CardContent></Card>
            <Card className="bg-green-500/5 border-green-500/10"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-green-400/70 uppercase tracking-wider mb-1">Wins</p>
              <p className="font-display font-bold text-xl text-green-400">{wins}</p>
            </CardContent></Card>
            <Card className="bg-red-500/5 border-red-500/10"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1">Losses</p>
              <p className="font-display font-bold text-xl text-red-400">{losses}</p>
            </CardContent></Card>
            <Card className="bg-yellow-500/5 border-yellow-500/10"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-yellow-400/70 uppercase tracking-wider mb-1">Pending</p>
              <p className="font-display font-bold text-xl text-yellow-400">{pending}</p>
            </CardContent></Card>
          </div>
        )}

        {user && myPicksToday.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-display font-bold flex items-center gap-2 mb-3">
              <CheckCircle2 size={14} className="text-primary" />My Picks Today
            </h2>
            <div className="space-y-2">
              {myPicksToday.map((pred) => {
                const game = todayGames.find((g) => g.id === pred.gameId);
                return (
                  <div key={pred.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-card/30 border border-white/5" data-testid={`pick-row-${pred.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge className={cn("text-[10px] shrink-0", LEAGUE_COLORS[game?.league || ""] || "bg-white/10 text-white/60")}>
                        {game?.league || "—"}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground leading-tight">{game ? `${game.awayTeam} @ ${game.homeTeam}` : "—"}</p>
                        <p className="font-display font-bold text-sm">{pred.pick}</p>
                        <p className="text-[10px] text-muted-foreground/60">{pred.predictionType}{pred.odds ? ` · ${pred.odds}` : ""}</p>
                      </div>
                    </div>
                    <ResultBadge result={pred.result || "pending"} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {activeLeagues.filter((l) => LEAGUES.includes(l) || l === "All").map((l) => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                league === l
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/30 text-muted-foreground border-white/5 hover:border-white/15"
              )}
              data-testid={`filter-${l}`}
            >
              {l}
              {l !== "All" && <span className="ml-1.5 text-[10px] opacity-60">{todayGames.filter((g) => g.league === l).length}</span>}
            </button>
          ))}
          {league === "All" && (
            <span className="ml-auto text-[10px] text-muted-foreground/50">{filteredGames.length} games today</span>
          )}
        </div>

        {gamesLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={30} className="animate-spin text-primary" />
          </div>
        ) : filteredGames.length === 0 ? (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-10 text-center">
              <CircleDot size={36} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-display font-bold text-sm mb-1">No games today for {league}</p>
              <p className="text-xs text-muted-foreground">Check back later or switch to another league.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredGames.map((game) => {
              const alreadyPicked = myPickGameIds.has(game.id);
              const myPick = myPicksToday.find((p) => p.gameId === game.id);
              const draft = drafts[game.id];
              const betTypes = BET_TYPES[game.league] || ["Moneyline", "Spread", "Over/Under"];
              const isFinished = game.status === "finished";

              return (
                <Card
                  key={game.id}
                  className={cn(
                    "bg-card/30 border-white/5 hover:border-white/10 transition-all",
                    draft && "border-primary/40 bg-primary/5",
                    alreadyPicked && "border-primary/20"
                  )}
                  data-testid={`card-game-${game.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[10px]", LEAGUE_COLORS[game.league] || "bg-white/10 text-white/60")}>{game.league}</Badge>
                        <StatusBadge status={game.status || "upcoming"} />
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock size={9} />
                        {new Date(game.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="font-display font-bold text-sm leading-tight">{game.awayTeam}</p>
                      <p className="text-xs text-muted-foreground leading-tight">@ {game.homeTeam}</p>
                    </div>

                    {game.spiderPick && (
                      <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-1.5 mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap size={10} className="text-primary" />
                          <span className="text-[10px] text-primary uppercase tracking-wider font-medium">Spider AI</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-primary">{game.spiderPick}</span>
                          <span className="text-[10px] text-muted-foreground/50">{game.spiderConfidence}%</span>
                        </div>
                      </div>
                    )}

                    {alreadyPicked && myPick ? (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
                        <div>
                          <p className="text-[10px] text-primary/70">Your Pick</p>
                          <p className="font-display font-bold text-sm">{myPick.pick}</p>
                          <p className="text-[10px] text-muted-foreground/50">{myPick.predictionType}</p>
                        </div>
                        <ResultBadge result={myPick.result || "pending"} />
                      </div>
                    ) : isFinished ? (
                      <p className="text-center text-[10px] text-muted-foreground/40 py-2">Game finished — picks closed</p>
                    ) : !user ? (
                      <a href="/auth">
                        <Button className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-xs h-8" data-testid={`button-login-pick-${game.id}`}>
                          <Lock size={12} className="mr-1.5" />Login to Pick
                        </Button>
                      </a>
                    ) : (
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
                            data-testid={`button-pick-away-${game.id}`}
                          >
                            <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Away</p>
                            <p className="font-display font-bold text-xs leading-tight">{game.awayTeam.split(" ").slice(-1)[0]}</p>
                            {game.moneylineAway && <p className="text-[10px] mt-0.5 opacity-70">{parseInt(game.moneylineAway) > 0 ? "+" : ""}{game.moneylineAway}</p>}
                          </button>
                          <button
                            onClick={() => selectPick(game, game.homeTeam, "Moneyline")}
                            className={cn(
                              "rounded-lg p-2.5 text-center transition-all border text-xs font-medium",
                              draft?.pick === game.homeTeam
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                            )}
                            data-testid={`button-pick-home-${game.id}`}
                          >
                            <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Home</p>
                            <p className="font-display font-bold text-xs leading-tight">{game.homeTeam.split(" ").slice(-1)[0]}</p>
                            {game.moneylineHome && <p className="text-[10px] mt-0.5 opacity-70">{parseInt(game.moneylineHome) > 0 ? "+" : ""}{game.moneylineHome}</p>}
                          </button>
                        </div>
                        {game.total && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => selectPick(game, "Over", "Over/Under")}
                              className={cn(
                                "rounded-lg px-3 py-2 text-center transition-all border text-xs font-medium",
                                draft?.pick === "Over"
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                              )}
                              data-testid={`button-pick-over-${game.id}`}
                            >
                              Over {game.total}
                            </button>
                            <button
                              onClick={() => selectPick(game, "Under", "Over/Under")}
                              className={cn(
                                "rounded-lg px-3 py-2 text-center transition-all border text-xs font-medium",
                                draft?.pick === "Under"
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                              )}
                              data-testid={`button-pick-under-${game.id}`}
                            >
                              Under {game.total}
                            </button>
                          </div>
                        )}
                        {draft && (
                          <p className="text-center text-[10px] text-primary/70 font-medium">
                            ✓ {draft.pick} selected — tap again to deselect
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!user && (
          <div className="mt-10 rounded-2xl bg-gradient-to-br from-primary/10 to-card/40 border border-primary/20 p-8 text-center">
            <Lock size={32} className="text-primary/40 mx-auto mb-3" />
            <h3 className="font-display font-bold text-lg mb-2">Start Picking Today</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              Join BetFans to submit your picks across every sport, track your record, and compete for the monthly prize pool.
            </p>
            <a href="/membership">
              <Button className="bg-primary text-primary-foreground px-8" data-testid="button-join">
                Join BetFans
              </Button>
            </a>
          </div>
        )}
      </div>

      {draftCount > 0 && (
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
              data-testid="button-submit-all-picks"
            >
              {submitPicks.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit {draftCount} Pick{draftCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
