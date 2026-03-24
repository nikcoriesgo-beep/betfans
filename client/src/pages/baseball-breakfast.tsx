import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trophy, TrendingUp, Flame, Target, CircleDot, Clock, Loader2, Coffee,
  Sun, Zap, CheckCircle2, XCircle, Plus, Edit2, RotateCcw, Lock, UserCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MLBGame {
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
  spider: { pick: string; confidence: number; type: string };
  founderPick: any | null;
}

interface BBData {
  founder: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  games: MLBGame[];
  picks: any[];
  stats: { wins: number; losses: number; profit: number; roi: number; streak: number; totalPicks: number };
  date: string;
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

function GameStatusBadge({ status, detailedState, inning, inningHalf }: { status: string; detailedState: string; inning: number | null; inningHalf: string | null }) {
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

function PickDialog({ game, onClose, onSubmit, isSubmitting }: {
  game: MLBGame; onClose: () => void;
  onSubmit: (data: any) => void; isSubmitting: boolean;
}) {
  const [predType, setPredType] = useState("Moneyline");
  const [pick, setPick] = useState(game.homeTeam);
  const [odds, setOdds] = useState("");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            Post Pick — {game.awayTeam} @ {game.homeTeam}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Pick Type</Label>
            <Select value={predType} onValueChange={setPredType}>
              <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-sm" data-testid="select-pred-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Moneyline">Moneyline</SelectItem>
                <SelectItem value="Run Line">Run Line (-1.5)</SelectItem>
                <SelectItem value="First 5 Innings">First 5 Innings</SelectItem>
                <SelectItem value="Over/Under">Over/Under</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Your Pick</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-sm" data-testid="select-pick-team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={game.awayTeam}>{game.awayTeam} (Away)</SelectItem>
                <SelectItem value={game.homeTeam}>{game.homeTeam} (Home)</SelectItem>
                {predType === "Over/Under" && <SelectItem value="Over">Over</SelectItem>}
                {predType === "Over/Under" && <SelectItem value="Under">Under</SelectItem>}
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
            onClick={() => onSubmit({ homeTeam: game.homeTeam, awayTeam: game.awayTeam, gameTime: game.gameTime, predictionType: predType, pick, odds })}
            disabled={isSubmitting}
            data-testid="button-submit-pick"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
            Post Pick
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultDialog({ pick, onClose, onSubmit, isSubmitting }: {
  pick: any; onClose: () => void; onSubmit: (result: string) => void; isSubmitting: boolean;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Update Result</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">Pick: <span className="text-white font-semibold">{pick.pick}</span></p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onSubmit("win")} disabled={isSubmitting} className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30" data-testid="button-result-win">✓ Win</Button>
          <Button onClick={() => onSubmit("loss")} disabled={isSubmitting} className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30" data-testid="button-result-loss">✗ Loss</Button>
          <Button onClick={() => onSubmit("push")} disabled={isSubmitting} className="bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30" data-testid="button-result-push">Push</Button>
          <Button onClick={() => onSubmit("pending")} disabled={isSubmitting} variant="outline" className="border-white/10" data-testid="button-result-pending"><RotateCcw size={12} className="mr-1" />Reset</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BaseballBreakfast() {
  const { user } = useAuth() as { user: any };
  const isFounder = user?.referralCode === "NIKCOX";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pickGame, setPickGame] = useState<MLBGame | null>(null);
  const [resultPick, setResultPick] = useState<any | null>(null);

  const { data, isLoading } = useQuery<BBData>({ queryKey: ["/api/baseball-breakfast"] });
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const postPick = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/baseball-breakfast/pick", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baseball-breakfast"] });
      setPickGame(null);
      toast({ title: "Pick posted!", description: "Your pick is live." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateResult = useMutation({
    mutationFn: ({ id, result }: { id: number; result: string }) =>
      apiRequest("PATCH", `/api/baseball-breakfast/pick/${id}`, { result }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baseball-breakfast"] });
      setResultPick(null);
      toast({ title: "Result updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const stats = data?.stats || { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0, totalPicks: 0 };
  const games = data?.games || [];
  const founder = data?.founder;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">

        <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/40 via-card/60 to-red-900/20 border border-white/5 p-6 md:p-10">
          <div className="absolute top-4 right-4 opacity-10"><Coffee size={110} /></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sun size={14} className="text-yellow-400" />
              <span className="text-xs text-yellow-400/80 font-medium tracking-widest uppercase">Good Morning</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2" data-testid="text-bb-title">
              Baseball For Breakfast
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              Live MLB game feed with Spider AI analysis and the Founder's daily picks. Open to everyone — join to make your own selections.
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">{today}</p>
          </div>
        </div>

        {founder && (
          <div className="flex items-center gap-3 mb-6 p-3 rounded-xl bg-card/20 border border-white/5 w-fit">
            {founder.profileImageUrl ? (
              <img src={founder.profileImageUrl} alt="Founder" className="w-10 h-10 rounded-full border-2 border-primary/30" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {(founder.firstName?.[0] || "N").toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-display font-bold text-sm">{founder.firstName} {founder.lastName}</p>
              <p className="text-xs text-muted-foreground">Founder · MLB Specialist</p>
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">FOUNDER</Badge>
          </div>
        )}

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-8">
          <StatCard icon={Trophy} label="Record" value={`${stats.wins}-${stats.losses}`} color="bg-primary/20 text-primary" />
          <StatCard icon={TrendingUp} label="ROI" value={`${stats.roi >= 0 ? "+" : ""}${stats.roi}%`} color={stats.roi >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"} />
          <StatCard icon={Target} label="Win Rate" value={stats.totalPicks > 0 ? `${Math.round((stats.wins / stats.totalPicks) * 100)}%` : "—"} color="bg-blue-500/20 text-blue-400" />
          <StatCard icon={CircleDot} label="Total Picks" value={stats.totalPicks} color="bg-violet-500/20 text-violet-400" />
          <StatCard icon={Flame} label="Streak" value={stats.streak > 0 ? `${stats.streak}W` : "—"} color="bg-orange-500/20 text-orange-400" />
          <StatCard icon={TrendingUp} label="Profit" value={`${stats.profit >= 0 ? "+" : ""}${stats.profit.toFixed(1)}u`} color={stats.profit >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"} />
        </div>

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
            {games.map((game) => (
              <Card
                key={game.mlbGamePk}
                className="bg-card/30 border-white/5 hover:border-white/10 transition-all"
                data-testid={`card-game-${game.mlbGamePk}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <GameStatusBadge
                      status={game.status}
                      detailedState={game.detailedState}
                      inning={game.inning}
                      inningHalf={game.inningHalf}
                    />
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                      <Clock size={9} />
                      {new Date(game.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div className="text-center flex-1">
                      <p className="text-[10px] text-muted-foreground mb-0.5">AWAY</p>
                      <p className="font-display font-bold text-sm leading-tight">{game.awayAbbr || game.awayTeam}</p>
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
                      <p className="font-display font-bold text-sm leading-tight">{game.homeAbbr || game.homeTeam}</p>
                      <p className="text-[10px] text-muted-foreground/60 truncate max-w-[80px] mx-auto">{game.homeTeam}</p>
                    </div>
                  </div>

                  {(game.awayPitcher || game.homePitcher) && (
                    <div className="flex items-center justify-between mb-3 px-1 py-2 rounded-lg bg-white/3 border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <UserCircle2 size={11} className="text-muted-foreground/50 shrink-0" />
                        <span className="text-[10px] text-muted-foreground/70 truncate">{game.awayPitcher || "TBD"}</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground/30 px-2 shrink-0">SP</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                        <span className="text-[10px] text-muted-foreground/70 truncate text-right">{game.homePitcher || "TBD"}</span>
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
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Coffee size={10} className="text-yellow-400" />
                            <span className="text-[10px] text-yellow-400 uppercase tracking-wider">Founder's Pick</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{game.founderPick.predictionType}</p>
                          <p className="font-display font-bold text-sm">{game.founderPick.pick}</p>
                          {game.founderPick.odds && <p className="text-[10px] text-muted-foreground mt-0.5">{game.founderPick.odds}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <PickResultBadge result={game.founderPick.result} />
                          {isFounder && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] text-muted-foreground hover:text-white px-2"
                              onClick={() => setResultPick(game.founderPick)}
                              data-testid={`button-update-result-${game.mlbGamePk}`}
                            >
                              <Edit2 size={9} className="mr-1" />Update
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      {isFounder ? (
                        <Button
                          size="sm"
                          className="w-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-xs h-8"
                          onClick={() => setPickGame(game)}
                          data-testid={`button-make-pick-${game.mlbGamePk}`}
                        >
                          <Plus size={12} className="mr-1.5" />Post Your Pick
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 w-full justify-center py-1">
                          <Clock size={10} />
                          No pick posted yet for this game
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!user && (
          <div className="mt-10 rounded-2xl bg-gradient-to-br from-primary/10 to-card/40 border border-primary/20 p-8 text-center">
            <Lock size={32} className="text-primary/40 mx-auto mb-3" />
            <h3 className="font-display font-bold text-lg mb-2">Make Your Own Picks</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              You're watching the live feed — join BetFans to post your own MLB picks, track your record, and compete on the leaderboard.
            </p>
            <a href="/membership">
              <Button className="bg-primary text-primary-foreground px-8" data-testid="button-join-betfans">
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
          onSubmit={(data) => postPick.mutate(data)}
          isSubmitting={postPick.isPending}
        />
      )}

      {resultPick && (
        <ResultDialog
          pick={resultPick}
          onClose={() => setResultPick(null)}
          onSubmit={(result) => updateResult.mutate({ id: resultPick.id, result })}
          isSubmitting={updateResult.isPending}
        />
      )}
    </div>
  );
}
