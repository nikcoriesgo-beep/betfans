import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Bot, Lock, Check, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type Sport = "ALL" | "NFL" | "NBA" | "WNBA" | "NHL" | "NCAAB" | "MLB" | "NCAABB" | "MLS" | "NWSL";

function QuickPickButtons({ game, userPicks }: { game: any; userPicks: Record<number, string> }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const currentPick = userPicks[game.id];

  const pickMutation = useMutation({
    mutationFn: async (pick: string) => {
      const res = await apiRequest("POST", "/api/predictions", {
        gameId: game.id,
        predictionType: "moneyline",
        pick,
        units: 1,
      });
      return res.json();
    },
    onSuccess: (_, pick) => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Pick Locked In!",
        description: `You picked ${pick} to win`,
      });
    },
    onError: () => {
      toast({
        title: "Pick Failed",
        description: "Sign in to make predictions",
        variant: "destructive",
      });
    },
  });

  if (game.status === "finished") {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="font-mono">{game.homeScore} - {game.awayScore}</span>
        <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/10">Final</Badge>
      </div>
    );
  }

  if (game.status === "live") {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="font-mono text-yellow-400">{game.homeScore} - {game.awayScore}</span>
        <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1 py-0 animate-pulse border-0">LIVE</Badge>
      </div>
    );
  }

  const homeShort = game.homeTeam.split(" ").pop();
  const awayShort = game.awayTeam.split(" ").pop();

  if (currentPick) {
    return (
      <div className="flex items-center gap-1.5">
        <Check size={12} className="text-primary" />
        <span className="text-xs text-primary font-medium truncate max-w-[80px]">{currentPick}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5" onClick={(e) => e.preventDefault()}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isAuthenticated) {
            window.location.href = "/auth";
            return;
          }
          pickMutation.mutate(`${game.awayTeam} ML`);
        }}
        disabled={pickMutation.isPending}
        className="px-2 py-1 text-[11px] font-bold rounded-md border border-white/10 hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all"
        data-testid={`button-pick-away-${game.id}`}
      >
        {awayShort}
      </button>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isAuthenticated) {
            window.location.href = "/auth";
            return;
          }
          pickMutation.mutate(`${game.homeTeam} ML`);
        }}
        disabled={pickMutation.isPending}
        className="px-2 py-1 text-[11px] font-bold rounded-md border border-white/10 hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all"
        data-testid={`button-pick-home-${game.id}`}
      >
        {homeShort}
      </button>
    </div>
  );
}

export function DailyPredictions() {
  const [filter, setFilter] = useState<Sport>("ALL");
  const { isAuthenticated } = useAuth();

  const { data: games = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/games", filter !== "ALL" ? `?league=${filter}` : ""],
    queryFn: async () => {
      const url = filter !== "ALL" ? `/api/games?league=${filter}` : "/api/games";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch games");
      return res.json();
    },
  });

  const { data: predictions = [] } = useQuery<any[]>({
    queryKey: ["/api/predictions"],
    queryFn: async () => {
      const res = await fetch("/api/predictions", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const userPicks: Record<number, string> = {};
  for (const p of predictions) {
    if (!userPicks[p.gameId]) {
      userPicks[p.gameId] = p.pick;
    }
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  };

  return (
    <Card className="border-white/10 bg-card/30 backdrop-blur-md h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 font-display text-xl" data-testid="text-spider-ai-title">
            <Bot className="text-primary" />
            Spider AI Feed
          </CardTitle>
          <CardDescription>Pick your winners — tap a team to lock in your prediction</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => refetch()} data-testid="button-refresh-feed">
          <RefreshCw size={16} />
        </Button>
      </CardHeader>
      
      <div className="px-6 pb-4">
        <Tabs defaultValue="ALL" onValueChange={(v) => setFilter(v as Sport)} className="w-full">
          <TabsList className="bg-black/20 grid grid-cols-5 md:grid-cols-10 w-full gap-0.5">
            <TabsTrigger value="ALL" data-testid="tab-all" className="text-[10px] md:text-xs px-1">All</TabsTrigger>
            <TabsTrigger value="NBA" data-testid="tab-nba" className="text-[10px] md:text-xs px-1">NBA</TabsTrigger>
            <TabsTrigger value="WNBA" data-testid="tab-wnba" className="text-[10px] md:text-xs px-1">WNBA</TabsTrigger>
            <TabsTrigger value="NHL" data-testid="tab-nhl" className="text-[10px] md:text-xs px-1">NHL</TabsTrigger>
            <TabsTrigger value="NCAAB" data-testid="tab-ncaab" className="text-[10px] md:text-xs px-1">NCAAB</TabsTrigger>
            <TabsTrigger value="MLB" data-testid="tab-mlb" className="text-[10px] md:text-xs px-1">MLB</TabsTrigger>
            <TabsTrigger value="NCAABB" data-testid="tab-ncaabb" className="text-[10px] md:text-xs px-1">CBB</TabsTrigger>
            <TabsTrigger value="MLS" data-testid="tab-mls" className="text-[10px] md:text-xs px-1">MLS</TabsTrigger>
            <TabsTrigger value="NWSL" data-testid="tab-nwsl" className="text-[10px] md:text-xs px-1">NWSL</TabsTrigger>
            <TabsTrigger value="NFL" data-testid="tab-nfl" className="text-[10px] md:text-xs px-1">NFL</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <CardContent className="p-0">
        <ScrollArea className="h-[500px]">
          <div className="divide-y divide-white/5">
            <div className="hidden md:grid grid-cols-12 gap-2 px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-black/20">
              <div className="col-span-2">Time</div>
              <div className="col-span-1">Lge</div>
              <div className="col-span-3">Matchup</div>
              <div className="col-span-2 text-center">Pick Winner</div>
              <div className="col-span-2 text-right">Spider Pick</div>
              <div className="col-span-2 text-right">Conf</div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading games...</div>
            ) : games.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No games available</div>
            ) : (
              games.map((game: any) => (
                <Link key={game.id} href={`/game/${game.id}`}>
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-2 px-6 py-3 items-center hover:bg-white/5 transition-colors group cursor-pointer relative overflow-hidden" data-testid={`card-game-${game.id}`}>
                    
                    {game.isProLocked && (
                      <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" className="gap-2 bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.4)]" data-testid={`button-unlock-${game.id}`}>
                          <Lock size={14} /> Unlock with Pro
                        </Button>
                      </div>
                    )}

                    <div className="col-span-2 flex flex-col justify-center">
                      <span className="text-xs font-medium">{formatTime(game.gameTime)}</span>
                      {game.status === "live" && (
                        <span className="text-[10px] text-red-500 font-bold animate-pulse uppercase">Live</span>
                      )}
                      {game.status === "finished" && (
                        <span className="text-[10px] text-muted-foreground uppercase">Final</span>
                      )}
                    </div>
                    
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-5 border-white/10 text-muted-foreground">
                        {game.league}
                      </Badge>
                    </div>

                    <div className="col-span-3 flex flex-col justify-center text-sm">
                      <div className="font-medium text-xs truncate">{game.awayTeam}</div>
                      <div className="text-muted-foreground text-xs truncate">@ {game.homeTeam}</div>
                    </div>

                    <div className="col-span-2 flex items-center justify-center relative z-20">
                      <QuickPickButtons game={game} userPicks={userPicks} />
                    </div>

                    <div className="col-span-2 text-right flex items-center justify-end gap-1">
                      {game.isProLocked ? (
                        <div className="flex items-center gap-1 text-muted-foreground filter blur-sm select-none">
                          <Lock size={10} />
                          <span className="font-mono font-bold text-xs">LOCKED</span>
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-primary text-xs truncate">{game.spiderPick}</span>
                      )}
                    </div>

                    <div className="col-span-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="text-xs font-mono">{game.spiderConfidence}%</div>
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          game.spiderConfidence > 80 ? "bg-primary shadow-[0_0_8px_rgba(34,197,94,0.8)]" : 
                          game.spiderConfidence > 60 ? "bg-yellow-500" : "bg-red-500"
                        )} />
                      </div>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-3 hover:bg-white/5 transition-colors group cursor-pointer relative overflow-hidden" data-testid={`card-game-mobile-${game.id}`}>
                    {game.isProLocked && (
                      <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" className="gap-2 bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                          <Lock size={14} /> Unlock with Pro
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-white/10 text-muted-foreground">
                          {game.league}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{formatTime(game.gameTime)}</span>
                        {game.status === "live" && (
                          <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1 py-0 animate-pulse border-0">LIVE</Badge>
                        )}
                        {game.status === "finished" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/10">Final</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          game.spiderConfidence > 80 ? "bg-primary shadow-[0_0_8px_rgba(34,197,94,0.8)]" : 
                          game.spiderConfidence > 60 ? "bg-yellow-500" : "bg-red-500"
                        )} />
                        <span className="text-[11px] font-mono">{game.spiderConfidence}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="font-medium text-[13px] truncate">{game.awayTeam}</div>
                        <div className="text-muted-foreground text-[12px] truncate">@ {game.homeTeam}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="relative z-20">
                          <QuickPickButtons game={game} userPicks={userPicks} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spider Pick</span>
                      {game.isProLocked ? (
                        <div className="flex items-center gap-1 text-muted-foreground filter blur-sm select-none">
                          <Lock size={9} />
                          <span className="font-mono font-bold text-[11px]">LOCKED</span>
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-primary text-[12px]">{game.spiderPick}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
