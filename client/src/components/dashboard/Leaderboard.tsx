import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Flame, TrendingUp, Medal, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type Period = "daily" | "annual";

export function Leaderboard() {
  const [period, setPeriod] = useState<Period>("daily");

  const { data: entries = [] } = useQuery<any[]>({
    queryKey: ["/api/leaderboard", period],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  return (
    <Card className="border-white/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8">
        <div>
          <CardTitle className="text-2xl font-display flex items-center gap-2" data-testid="text-leaderboard-title">
            <Medal className="text-primary" />
            Top Predictors
          </CardTitle>
          <CardDescription>Global rankings based on Win Rate and Accuracy</CardDescription>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="w-full md:w-[200px]">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50">
            <TabsTrigger value="daily" data-testid="tab-leaderboard-daily">Daily</TabsTrigger>
            <TabsTrigger value="annual" data-testid="tab-leaderboard-annual">Annual</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:space-y-4">
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-4">Predictor</div>
            <div className="col-span-2 text-right">Win %</div>
            <div className="col-span-2 text-right">Record</div>
            <div className="col-span-2 text-right">Profit</div>
            <div className="col-span-1 text-center">Streak</div>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No leaderboard data yet</div>
          ) : (
            entries.map((entry: any, index: number) => {
              const username = entry.user
                ? `${entry.user.firstName || ""}${entry.user.lastName || ""}`.trim() || "Anonymous"
                : "Unknown";
              const avatar = entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${index}`;
              const winRate = entry.wins + entry.losses > 0
                ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1)
                : "0.0";

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "block md:grid md:grid-cols-12 md:gap-4 px-3 md:px-4 py-3 md:py-4 rounded-xl md:items-center border border-transparent transition-all hover:bg-white/5",
                    index < 3 ? "bg-gradient-to-r from-primary/5 to-transparent border-primary/10" : ""
                  )}
                  data-testid={`row-leaderboard-${entry.id}`}
                >
                  <div className="hidden md:flex col-span-1 justify-center">
                    {index === 0 ? (
                      <div className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center font-bold">1</div>
                    ) : index === 1 ? (
                      <div className="w-8 h-8 rounded-full bg-gray-400/20 text-gray-400 flex items-center justify-center font-bold">2</div>
                    ) : index === 2 ? (
                      <div className="w-8 h-8 rounded-full bg-orange-700/20 text-orange-700 flex items-center justify-center font-bold">3</div>
                    ) : (
                      <span className="font-mono text-muted-foreground">#{index + 1}</span>
                    )}
                  </div>

                  <div className="md:col-span-4 flex items-center gap-3">
                    <div className="md:hidden shrink-0">
                      {index === 0 ? (
                        <div className="w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center font-bold text-sm">1</div>
                      ) : index === 1 ? (
                        <div className="w-7 h-7 rounded-full bg-gray-400/20 text-gray-400 flex items-center justify-center font-bold text-sm">2</div>
                      ) : index === 2 ? (
                        <div className="w-7 h-7 rounded-full bg-orange-700/20 text-orange-700 flex items-center justify-center font-bold text-sm">3</div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground w-7 text-center inline-block">#{index + 1}</span>
                      )}
                    </div>
                    <Avatar className="h-9 w-9 md:h-10 md:w-10 border-2 border-background shrink-0">
                      <AvatarImage src={avatar} />
                      <AvatarFallback>{username[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        <span className="truncate text-sm md:text-base">{username}</span>
                        {index < 3 && <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">PRO</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {winRate}% win rate
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block col-span-2 text-right font-mono font-bold text-primary">
                    {winRate}%
                  </div>

                  <div className="hidden md:block col-span-2 text-right font-mono">
                    <span className="text-green-400">{entry.wins}W</span>
                    <span className="text-muted-foreground mx-1">-</span>
                    <span className="text-red-400">{entry.losses}L</span>
                  </div>

                  <div className="hidden md:block col-span-2 text-right font-mono text-green-400">
                    ${Math.round(entry.profit || 0).toLocaleString()}
                  </div>

                  <div className="hidden md:flex col-span-1 justify-center">
                    {(entry.streak || 0) > 2 ? (
                      <div className="flex items-center gap-1 text-orange-500 font-bold text-sm">
                        <Flame size={16} fill="currentColor" />
                        {entry.streak}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>

                  <div className="md:hidden grid grid-cols-4 gap-1 mt-2 py-2 px-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Win %</div>
                      <span className="font-mono font-bold text-[11px] text-primary">
                        {winRate}%
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Record</div>
                      <span className="font-mono font-bold text-[11px] text-foreground">{entry.wins}-{entry.losses}</span>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Profit</div>
                      <span className={cn(
                        "font-mono text-[11px] font-bold",
                        (entry.profit || 0) >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        ${Math.round(entry.profit || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Streak</div>
                      {(entry.streak || 0) >= 3 ? (
                        <div className="flex items-center justify-center gap-0.5 text-orange-500 text-[11px] font-bold">
                          <Flame size={9} fill="currentColor" /> {entry.streak}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px] font-mono">{entry.streak || 0}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
