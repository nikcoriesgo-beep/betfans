import { useState } from "react";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { useRoute } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trophy, Flame, TrendingUp, Medal, Crown, Star,
  ArrowUp, ArrowDown, Target, Calendar, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

type Period = "daily" | "weekly" | "monthly" | "annual";
type LeagueFilter = "ALL" | "NFL" | "NBA" | "WNBA" | "NHL" | "MLB" | "MLS" | "NWSL" | "NCAAB" | "NCAABB";

const leagueFilters: { value: LeagueFilter; label: string }[] = [
  { value: "ALL", label: "All Sports" },
  { value: "NFL", label: "NFL" },
  { value: "NBA", label: "NBA" },
  { value: "WNBA", label: "WNBA" },
  { value: "NHL", label: "NHL" },
  { value: "MLB", label: "MLB" },
  { value: "MLS", label: "MLS" },
  { value: "NWSL", label: "NWSL" },
  { value: "NCAAB", label: "NCAAB" },
  { value: "NCAABB", label: "College BB" },
];

const periodConfig: Record<Period, { title: string; subtitle: string; icon: any; accent: string }> = {
  daily: {
    title: "Daily Leaderboard",
    subtitle: "Today's picks — every win adds to your weekly & annual total",
    icon: Clock,
    accent: "from-blue-500/20 to-cyan-500/20",
  },
  weekly: {
    title: "Weekly Leaderboard",
    subtitle: "Running total from this week — accumulates into monthly & annual",
    icon: Calendar,
    accent: "from-emerald-500/20 to-green-500/20",
  },
  monthly: {
    title: "Monthly Leaderboard",
    subtitle: "Running total for the month — every graded pick counted",
    icon: Target,
    accent: "from-purple-500/20 to-violet-500/20",
  },
  annual: {
    title: "Annual Leaderboard",
    subtitle: "Full-year running total — every pick since Jan 1st, building to the championship",
    icon: Trophy,
    accent: "from-yellow-500/20 to-orange-500/20",
  },
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/30">
        <Crown size={20} className="text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-lg shadow-gray-400/20">
        <span className="text-white font-bold text-lg">2</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 to-orange-800 flex items-center justify-center shadow-lg shadow-orange-600/20">
        <span className="text-white font-bold text-lg">3</span>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
      <span className="text-muted-foreground font-mono font-bold">{rank}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "legend") {
    return (
      <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1.5 py-0">
        <Crown size={10} /> Legend
      </Badge>
    );
  }
  if (tier === "pro") {
    return (
      <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-0.5 px-1.5 py-0">
        <Star size={10} /> Pro
      </Badge>
    );
  }
  return null;
}

function TopThreePodium({ entries }: { entries: any[] }) {
  if (entries.length < 3) return null;

  const podiumOrder = [entries[1], entries[0], entries[2]];
  const heights = ["h-28", "h-36", "h-24"];
  const sizes = ["h-14 w-14", "h-20 w-20", "h-14 w-14"];
  const borders = [
    "border-gray-400/50",
    "border-yellow-500/50 ring-2 ring-yellow-500/20",
    "border-orange-600/50",
  ];

  return (
    <div className="flex items-end justify-center gap-4 mb-8 pt-8">
      {podiumOrder.map((entry, i) => {
        const username = entry.user
          ? `${entry.user.firstName || ""}${entry.user.lastName ? " " + entry.user.lastName : ""}`.trim() || "Anonymous"
          : "Unknown";
        const avatar = entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`;
        const rank = i === 0 ? 2 : i === 1 ? 1 : 3;

        return (
          <div key={entry.id} className="flex flex-col items-center" data-testid={`podium-${rank}`}>
            <div className="relative mb-2">
              <Avatar className={cn(sizes[i], "border-3", borders[i])}>
                <AvatarImage src={avatar} />
                <AvatarFallback>{username[0]}</AvatarFallback>
              </Avatar>
              {rank === 1 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Crown size={20} className="text-yellow-500 fill-yellow-500" />
                </div>
              )}
            </div>
            <p className="font-bold text-sm mb-0.5 text-center max-w-[100px] truncate">{username}</p>
            <TierBadge tier={entry.user?.membershipTier} />
            <p className="text-primary font-mono font-bold text-lg mt-1">{entry.wins + entry.losses > 0 ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1) : "0.0"}%</p>
            <p className="text-xs text-muted-foreground">{entry.wins}W - {entry.losses}L</p>
            <div className={cn(
              "w-24 rounded-t-xl mt-2 bg-gradient-to-t from-primary/10 to-primary/5 border border-b-0 border-primary/10 flex items-end justify-center pb-2",
              heights[i]
            )}>
              <span className="text-2xl font-bold text-primary/40">#{rank}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LeaderboardPage() {
  const [, navigate] = useLocation();
  const [, dailyMatch] = useRoute("/leaderboard/daily");
  const [, weeklyMatch] = useRoute("/leaderboard/weekly");
  const [, monthlyMatch] = useRoute("/leaderboard/monthly");
  const [, annualMatch] = useRoute("/leaderboard/annual");
  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>("ALL");

  const [currentLocation] = useLocation();
  let period: Period = "annual";
  if (dailyMatch) period = "daily";
  else if (weeklyMatch) period = "weekly";
  else if (monthlyMatch) period = "monthly";
  else if (annualMatch) period = "annual";
  else if (currentLocation === "/leaderboard") {
    navigate("/leaderboard/annual", { replace: true });
  }

  const config = periodConfig[period];
  const PeriodIcon = config.icon;

  const { data: entries = [] } = useQuery<any[]>({
    queryKey: ["/api/leaderboard", period, leagueFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (leagueFilter !== "ALL") params.set("league", leagueFilter);
      const res = await fetch(`/api/leaderboard?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <PeriodIcon size={32} className="text-primary" />
            <h1 className="text-4xl md:text-5xl font-display font-bold" data-testid="text-leaderboard-heading">
              {config.title.split(" ")[0]}{" "}
              <span className="text-primary">
                {leagueFilter !== "ALL" ? `${leagueFilter} Leaderboard` : config.title.split(" ").slice(1).join(" ")}
              </span>
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">{config.subtitle}</p>
        </div>

        <PrizePoolQualRule compact className="max-w-4xl mx-auto mb-6" />

        <div className="max-w-4xl mx-auto mb-6">
          <Tabs value={period} onValueChange={(v) => navigate(`/leaderboard/${v}`)} className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-white/10 h-12">
              <TabsTrigger value="daily" className="gap-1.5 data-[state=active]:bg-primary/20" data-testid="tab-daily">
                <Clock size={14} /> Daily
              </TabsTrigger>
              <TabsTrigger value="weekly" className="gap-1.5 data-[state=active]:bg-primary/20" data-testid="tab-weekly">
                <Calendar size={14} /> Weekly
              </TabsTrigger>
              <TabsTrigger value="monthly" className="gap-1.5 data-[state=active]:bg-primary/20" data-testid="tab-monthly">
                <Target size={14} /> Monthly
              </TabsTrigger>
              <TabsTrigger value="annual" className="gap-1.5 data-[state=active]:bg-primary/20" data-testid="tab-annual">
                <Trophy size={14} /> Annual
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="max-w-4xl mx-auto mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Sport:</span>
            {leagueFilters.map((lf) => (
              <button
                key={lf.value}
                onClick={() => setLeagueFilter(lf.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  leagueFilter === lf.value
                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,197,94,0.25)]"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/10"
                )}
                data-testid={`button-league-${lf.value}`}
              >
                {lf.label}
              </button>
            ))}
          </div>
          {leagueFilter !== "ALL" && (
            <p className="text-xs text-primary/70 mt-2">
              Showing {leagueFilter} predictions only
            </p>
          )}
        </div>

        {entries.length >= 3 && (
          <div className="max-w-3xl mx-auto">
            <TopThreePodium entries={entries.slice(0, 3)} />
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          <Card className="bg-card/30 border-white/10 overflow-hidden">
            <div className={cn("h-1 w-full bg-gradient-to-r", config.accent)} />
            <CardContent className="p-0">
              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-white/5">
                <div className="col-span-1 text-center">Rank</div>
                <div className="col-span-4">Predictor</div>
                <div className="col-span-2 text-right">Win %</div>
                <div className="col-span-2 text-right">Record</div>
                <div className="col-span-2 text-right">Total Picks</div>
                <div className="col-span-1 text-center">Streak</div>
              </div>

              <ScrollArea className="max-h-[600px]">
                {entries.length === 0 ? (
                  <div className="text-center py-16">
                    <Medal size={48} className="text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">No leaderboard data yet</p>
                    <p className="text-muted-foreground/60 text-sm mt-1">Start making predictions to climb the ranks!</p>
                  </div>
                ) : (
                  entries.map((entry: any, index: number) => {
                    const username = entry.user
                      ? `${entry.user.firstName || ""}${entry.user.lastName ? " " + entry.user.lastName : ""}`.trim() || "Anonymous"
                      : "Unknown";
                    const avatar = entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`;
                    const winRate = entry.wins + entry.losses > 0
                      ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1)
                      : "0.0";

                    return (
                      <a
                        key={entry.id}
                        href={`/profile?user=${entry.userId}`}
                        className={cn(
                          "block md:grid md:grid-cols-12 md:gap-4 px-4 md:px-6 py-4 md:items-center border-b border-white/5 transition-all hover:bg-white/5 cursor-pointer",
                          index < 3 && "bg-gradient-to-r from-primary/5 to-transparent"
                        )}
                        data-testid={`row-leaderboard-${entry.id}`}
                      >
                        <div className="hidden md:flex col-span-1 justify-center">
                          <RankBadge rank={index + 1} />
                        </div>

                        <div className="md:col-span-4 flex items-center gap-3">
                          <div className="md:hidden shrink-0">
                            <RankBadge rank={index + 1} />
                          </div>
                          <Avatar className={cn(
                            "h-10 w-10 md:h-11 md:w-11 border-2 shrink-0",
                            index === 0 ? "border-yellow-500/40" : index < 3 ? "border-primary/30" : "border-white/10"
                          )}>
                            <AvatarImage src={avatar} />
                            <AvatarFallback>{username[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-foreground flex items-center gap-1.5 md:gap-2">
                              <span className="truncate text-sm md:text-base">{username}</span>
                              <TierBadge tier={entry.user?.membershipTier} />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {winRate}% win rate
                            </div>
                          </div>
                        </div>

                        <div className="hidden md:block col-span-2 text-right">
                          <span className="font-mono font-bold text-lg text-primary">
                            {winRate}%
                          </span>
                        </div>

                        <div className="hidden md:block col-span-2 text-right">
                          <span className="font-mono">
                            <span className="text-green-400">{entry.wins}W</span>
                            <span className="text-muted-foreground mx-1">-</span>
                            <span className="text-red-400">{entry.losses}L</span>
                          </span>
                        </div>

                        <div className="hidden md:block col-span-2 text-right">
                          <span className="font-mono font-bold text-foreground/80">
                            {(entry.totalPicks || (entry.wins + entry.losses)).toLocaleString()}
                          </span>
                          <div className="text-[10px] text-muted-foreground">graded</div>
                        </div>

                        <div className="hidden md:flex col-span-1 justify-center">
                          {(entry.streak || 0) >= 3 ? (
                            <div className="flex items-center gap-1 text-orange-500 font-bold">
                              <Flame size={16} fill="currentColor" />
                              {entry.streak}
                            </div>
                          ) : (entry.streak || 0) > 0 ? (
                            <span className="text-muted-foreground font-mono">{entry.streak}</span>
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
                            <div className="font-mono text-[11px]">
                              <span className="text-green-400">{entry.wins}</span>
                              <span className="text-muted-foreground/40">-</span>
                              <span className="text-red-400">{entry.losses}</span>
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Total</div>
                            <span className="font-mono text-[11px] font-bold text-foreground/80">
                              {(entry.totalPicks || (entry.wins + entry.losses))}
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
                      </a>
                    );
                  })
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {entries.length > 0 && (
              <>
                <Card className="bg-card/30 border-white/10">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Predictors</p>
                    <p className="text-2xl font-display font-bold text-primary" data-testid="text-total-predictors">{entries.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/30 border-white/10">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Top Win %</p>
                    <p className="text-2xl font-display font-bold text-green-400">{entries[0] && entries[0].wins + entries[0].losses > 0 ? ((entries[0].wins / (entries[0].wins + entries[0].losses)) * 100).toFixed(1) : "0.0"}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/30 border-white/10">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Picks</p>
                    <p className="text-2xl font-display font-bold">
                      {entries.reduce((a: number, e: any) => a + (e.wins || 0) + (e.losses || 0), 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/30 border-white/10">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Best Streak</p>
                    <div className="flex items-center justify-center gap-1">
                      <Flame size={20} className="text-orange-500" fill="currentColor" />
                      <p className="text-2xl font-display font-bold text-orange-500">
                        {Math.max(...entries.map((e: any) => e.streak || 0))}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
