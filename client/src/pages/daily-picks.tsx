import { useState, useMemo, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Zap, Clock, Loader2, CheckCircle2, XCircle, Plus, Lock,
  Trophy, Target, Flame, CircleDot, Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const LEAGUES = ["All", "MLB", "NBA", "NHL", "NFL", "MLS", "NWSL", "NCAAB", "NCAABB"];

const LEAGUE_COLORS: Record<string, string> = {
  MLB: "bg-red-500/20 text-red-400 border-red-500/30",
  NBA: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  NHL: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  NFL: "bg-green-700/20 text-green-400 border-green-700/30",
  MLS: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  NWSL: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  NCAAB: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  NCAABB: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const BET_TYPES: Record<string, string[]> = {
  MLB: ["Moneyline", "Run Line", "Over/Under", "First 5 Innings"],
  NBA: ["Moneyline", "Spread", "Over/Under"],
  NHL: ["Moneyline", "Puck Line", "Over/Under"],
  NFL: ["Moneyline", "Spread", "Over/Under"],
  MLS: ["Moneyline", "Draw", "Over/Under"],
  NWSL: ["Moneyline", "Draw", "Over/Under"],
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

function PickDialog({ game, onClose, onSubmit, isSubmitting }: {
  game: any; onClose: () => void; onSubmit: (data: any) => void; isSubmitting: boolean;
}) {
  const betTypes = BET_TYPES[game.league] || ["Moneyline", "Spread", "Over/Under"];
  const [predType, setPredType] = useState(betTypes[0]);
  const [pick, setPick] = useState(game.homeTeam);
  const [odds, setOdds] = useState("");

  const isOverUnder = predType.toLowerCase().includes("over") || predType === "Over/Under";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            <Badge className={cn("mr-2 text-[10px]", LEAGUE_COLORS[game.league] || "bg-white/10 text-white/60")}>{game.league}</Badge>
            {game.awayTeam} @ {game.homeTeam}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Bet Type</Label>
            <Select value={predType} onValueChange={(v) => { setPredType(v); setPick(game.homeTeam); }}>
              <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-sm" data-testid="select-pred-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {betTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Your Pick</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-sm" data-testid="select-pick">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isOverUnder ? (
                  <>
                    <SelectItem value="Over">Over {game.total || ""}</SelectItem>
                    <SelectItem value="Under">Under {game.total || ""}</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value={game.awayTeam}>{game.awayTeam} (Away)</SelectItem>
                    <SelectItem value={game.homeTeam}>{game.homeTeam} (Home)</SelectItem>
                    {predType === "Draw" && <SelectItem value="Draw">Draw</SelectItem>}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Odds (optional, e.g. -110, +150)</Label>
            <Input
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              placeholder="-110"
              className="mt-1 bg-white/5 border-white/10 text-sm"
              data-testid="input-odds"
            />
          </div>
          <Button
            className="w-full bg-primary text-primary-foreground"
            onClick={() => onSubmit({ gameId: game.id, predictionType: predType, pick, odds: odds || null, units: 1 })}
            disabled={isSubmitting}
            data-testid="button-submit-pick"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
            Lock In Pick
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FOUNDER_CODE = "NIKCOX";

export default function DailyPicks() {
  const { user } = useAuth() as { user: any };
  const qc = useQueryClient();
  const { toast } = useToast();
  const [league, setLeague] = useState("All");
  const [pickGame, setPickGame] = useState<any | null>(null);

  const isFounder = user?.referralCode === FOUNDER_CODE;

  const { data: allGames = [], isLoading: gamesLoading } = useQuery<any[]>({ queryKey: ["/api/games"] });
  const { data: myPredictions = [] } = useQuery<any[]>({
    queryKey: ["/api/predictions"],
    enabled: !!user,
  });

  const submitPick = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/predictions", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      setPickGame(null);
      toast({ title: "Pick locked in!", description: "Good luck — results update automatically." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncGames = useMutation({
    mutationFn: () => apiRequest("POST", "/api/games/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/games"] });
    },
  });

  useEffect(() => {
    if (isFounder) {
      syncGames.mutate();
    }
  }, [isFounder]);

  const todayGames = useMemo(() =>
    allGames.filter((g) => isToday(g.gameTime)),
    [allGames]
  );

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
      return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    });
  }, [myPredictions, todayGames]);

  const myPickGameIds = new Set(myPicksToday.map((p) => p.gameId));

  const wins = myPicksToday.filter((p) => p.result === "win").length;
  const losses = myPicksToday.filter((p) => p.result === "loss").length;
  const pending = myPicksToday.filter((p) => p.result === "pending").length;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const activeLeagues = ["All", ...Array.from(new Set(todayGames.map((g) => g.league)))];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">

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
              Pick any game across every sport. Results grade automatically the moment games end.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <p className="text-xs text-muted-foreground/50">{today}</p>
              {isFounder && syncGames.isPending && (
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
                        <p className="text-xs text-muted-foreground truncate">{game ? `${game.awayTeam} @ ${game.homeTeam}` : "—"}</p>
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
              <p className="text-xs text-muted-foreground">Try a different league or check back later.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredGames.map((game) => {
              const alreadyPicked = myPickGameIds.has(game.id);
              const myPick = myPicksToday.find((p) => p.gameId === game.id);
              return (
                <Card
                  key={game.id}
                  className={cn(
                    "bg-card/30 border-white/5 hover:border-white/10 transition-all",
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

                    <div className="flex items-center justify-between mb-3">
                      <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground mb-0.5">AWAY</p>
                        <p className="font-display font-bold text-sm leading-tight">{game.awayTeam}</p>
                        {game.moneylineAway && <p className="text-[10px] text-muted-foreground/60">{parseInt(game.moneylineAway) > 0 ? "+" : ""}{game.moneylineAway}</p>}
                      </div>
                      <div className="text-center px-3">
                        {game.homeScore !== null && game.awayScore !== null ? (
                          <p className="font-display font-bold text-2xl">{game.awayScore} - {game.homeScore}</p>
                        ) : (
                          <div>
                            <p className="text-muted-foreground/40 text-xs font-medium">VS</p>
                            {game.total && <p className="text-[10px] text-muted-foreground/50 mt-0.5">O/U {game.total}</p>}
                          </div>
                        )}
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground mb-0.5">HOME</p>
                        <p className="font-display font-bold text-sm leading-tight">{game.homeTeam}</p>
                        {game.moneylineHome && <p className="text-[10px] text-muted-foreground/60">{parseInt(game.moneylineHome) > 0 ? "+" : ""}{game.moneylineHome}</p>}
                      </div>
                    </div>

                    {game.spiderPick && (
                      <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
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
                    ) : user ? (
                      game.status === "finished" ? (
                        <p className="text-center text-[10px] text-muted-foreground/40 py-1">Game finished — picks closed</p>
                      ) : (
                        <Button
                          className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-xs h-8"
                          onClick={() => setPickGame(game)}
                          data-testid={`button-pick-game-${game.id}`}
                        >
                          <Plus size={12} className="mr-1.5" />Make Your Pick
                        </Button>
                      )
                    ) : (
                      <a href="/auth">
                        <Button className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-xs h-8" data-testid={`button-login-pick-${game.id}`}>
                          <Lock size={12} className="mr-1.5" />Login to Pick
                        </Button>
                      </a>
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

      {pickGame && (
        <PickDialog
          game={pickGame}
          onClose={() => setPickGame(null)}
          onSubmit={(data) => submitPick.mutate(data)}
          isSubmitting={submitPick.isPending}
        />
      )}
    </div>
  );
}
