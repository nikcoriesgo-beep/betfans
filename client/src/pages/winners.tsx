import { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, Crown, Star, DollarSign, TrendingUp, Flame,
  Calendar, Clock, Target, Award, Sparkles, ChevronRight,
  Timer, Zap, Users, ArrowUpRight, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

type Period = "daily" | "weekly" | "monthly" | "annual";

type PrizePoolData = {
  amount: number;
  daily: number;
  weekly: number;
  monthly: number;
  annual: number;
};

const periodConfig: Record<Period, {
  title: string;
  poolShare: number;
  topWinners: number;
  splits: number[];
  icon: any;
  gradient: string;
  border: string;
  accent: string;
  label: string;
}> = {
  daily: {
    title: "Daily Winners",
    poolShare: 0.05,
    topWinners: 3,
    splits: [0.50, 0.30, 0.20],
    icon: Clock,
    gradient: "from-blue-500 to-cyan-500",
    border: "border-blue-500/30",
    accent: "text-blue-400",
    label: "Today's Champions",
  },
  weekly: {
    title: "Weekly Winners",
    poolShare: 0.10,
    topWinners: 5,
    splits: [0.35, 0.25, 0.20, 0.12, 0.08],
    icon: Calendar,
    gradient: "from-emerald-500 to-green-500",
    border: "border-emerald-500/30",
    accent: "text-emerald-400",
    label: "This Week's Elite",
  },
  monthly: {
    title: "Monthly Winners",
    poolShare: 0.35,
    topWinners: 5,
    splits: [0.40, 0.25, 0.15, 0.12, 0.08],
    icon: Target,
    gradient: "from-purple-500 to-violet-500",
    border: "border-purple-500/30",
    accent: "text-purple-400",
    label: "Monthly Legends",
  },
  annual: {
    title: "Annual Winners",
    poolShare: 0.50,
    topWinners: 10,
    splits: [0.30, 0.20, 0.15, 0.10, 0.08, 0.05, 0.04, 0.03, 0.03, 0.02],
    icon: Trophy,
    gradient: "from-yellow-500 to-orange-500",
    border: "border-yellow-500/30",
    accent: "text-yellow-400",
    label: "Year-End Champions",
  },
};

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "legend") return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1.5 py-0"><Crown size={10} /> Legend</Badge>;
  if (tier === "pro") return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-0.5 px-1.5 py-0"><Star size={10} /> Pro</Badge>;
  return null;
}

function PlaceMedal({ place }: { place: number }) {
  if (place === 1) {
    return (
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700 flex items-center justify-center shadow-lg shadow-yellow-500/40 ring-4 ring-yellow-400/20">
          <Crown size={28} className="text-white drop-shadow-lg" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-black shadow-lg">1</div>
      </div>
    );
  }
  if (place === 2) {
    return (
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-200 via-gray-400 to-gray-600 flex items-center justify-center shadow-lg shadow-gray-400/30 ring-4 ring-gray-400/20">
          <Award size={24} className="text-white drop-shadow-lg" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-black shadow-lg">2</div>
      </div>
    );
  }
  if (place === 3) {
    return (
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 via-orange-600 to-orange-800 flex items-center justify-center shadow-lg shadow-orange-500/30 ring-4 ring-orange-500/20">
          <Award size={24} className="text-white drop-shadow-lg" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-white text-xs font-black shadow-lg">3</div>
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
      <span className="text-muted-foreground font-mono font-bold text-lg">{place}</span>
    </div>
  );
}

function WinnerCard({ entry, place, payout, config }: { entry: any; place: number; payout: number; config: typeof periodConfig.daily }) {
  const name = entry.user ? `${entry.user.firstName || ""} ${entry.user.lastName || ""}`.trim() || "Member" : "Member";
  const winRate = entry.wins + entry.losses > 0 ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1) : "0";
  const isTop3 = place <= 3;

  return (
    <Link href={`/winners/${entry.userId}`}>
      <Card className={cn(
        "transition-all cursor-pointer group hover:scale-[1.02]",
        isTop3 ? `bg-gradient-to-r ${config.gradient.replace("from-", "from-").replace("to-", "to-")}/5 ${config.border} border` : "bg-card/30 border-white/5 hover:border-white/10"
      )} data-testid={`card-winner-${place}`}>
        <CardContent className={cn("p-4 md:p-5", isTop3 && "md:p-6")}>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="shrink-0">
              <PlaceMedal place={place} />
            </div>
            <Avatar className={cn("border-2 border-white/10 shrink-0", isTop3 ? "h-10 w-10 md:h-14 md:w-14" : "h-9 w-9 md:h-11 md:w-11")}>
              <AvatarImage src={entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`} />
              <AvatarFallback>{name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={cn("font-display font-bold truncate", isTop3 ? "text-sm md:text-lg" : "text-xs md:text-sm")}>{name}</span>
                <TierBadge tier={entry.user?.membershipTier} />
              </div>
              <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><TrendingUp size={11} /> {winRate}% Win Rate</span>
                <span className="flex items-center gap-1"><Flame size={11} /> {entry.streak || 0} streak</span>
                <span>{entry.wins}W - {entry.losses}L · {(entry.totalPicks || (entry.wins + entry.losses))} picks</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={cn("font-bold font-mono", isTop3 ? "text-lg md:text-2xl" : "text-sm md:text-lg", config.accent)}>
                ${payout.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {(config.splits[place - 1] * 100).toFixed(0)}% share
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0 hidden md:block" />
          </div>
          <div className="md:hidden grid grid-cols-4 gap-1 mt-2 py-2 px-2 rounded-lg bg-white/[0.03] border border-white/5">
            <div className="text-center">
              <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Win%</div>
              <span className="font-mono font-bold text-[11px] text-primary">{winRate}%</span>
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
              <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Picks</div>
              <span className="font-mono font-bold text-[11px] text-foreground/80">
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
        </CardContent>
      </Card>
    </Link>
  );
}

function useCountdown(period: "daily" | "weekly" | "monthly") {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      let target: Date;
      if (period === "daily") {
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      } else if (period === "weekly") {
        const day = now.getDay();
        const daysUntilMonday = day === 0 ? 1 : 8 - day;
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday);
      } else {
        target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      }
      target.setHours(0, 0, 0, 0);
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) return "Resetting...";
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      return `${h}h ${m}m ${s}s`;
    };
    setTimeLeft(calc());
    const interval = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(interval);
  }, [period]);
  return timeLeft;
}

function PrizePoolTracker({ period, amount, config }: {
  period: "daily" | "weekly" | "monthly";
  amount: number;
  config: typeof periodConfig.daily;
}) {
  const Icon = config.icon;
  const countdown = useCountdown(period);
  const [prevAmount, setPrevAmount] = useState(amount);
  const [isGrowing, setIsGrowing] = useState(false);

  useEffect(() => {
    if (amount > prevAmount && prevAmount > 0) {
      setIsGrowing(true);
      setTimeout(() => setIsGrowing(false), 2000);
    }
    setPrevAmount(amount);
  }, [amount]);

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all",
      `${config.border} border`,
      isGrowing && "ring-2 ring-primary/50"
    )} data-testid={`tracker-${period}`}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-10", config.gradient)} />
      {isGrowing && <div className="absolute inset-0 bg-primary/10 animate-pulse" />}
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br shadow-lg", config.gradient)}>
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm">{config.title}</h3>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Zap size={9} className="text-primary" /> LIVE
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
            <Timer size={12} className="text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">{countdown}</span>
          </div>
        </div>

        <div className={cn(
          "text-3xl font-mono font-black mb-3 transition-all duration-500",
          config.accent,
          isGrowing && "scale-105 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)]"
        )}>
          ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="space-y-1.5">
          {config.splits.slice(0, Math.min(3, config.topWinners)).map((split, i) => {
            const payout = amount * split;
            const labels = ["1st Place", "2nd Place", "3rd Place"];
            const colors = ["text-yellow-400", "text-gray-300", "text-orange-400"];
            return (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={cn("font-bold", colors[i])}>{labels[i]}</span>
                  <span className="text-muted-foreground/60">({(split * 100).toFixed(0)}%)</span>
                </div>
                <span className={cn("font-mono font-bold", config.accent)}>
                  ${payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}
          {config.topWinners > 3 && (
            <div className="text-[10px] text-muted-foreground/50 text-right">
              +{config.topWinners - 3} more paid out
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformSportStats({ period }: { period: Period }) {
  const config = periodConfig[period];
  const Icon = config.icon;

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/sport-stats", period],
    queryFn: async () => {
      const res = await fetch(`/api/sport-stats?period=${period}`);
      if (!res.ok) return { overall: null, bySport: [] };
      return res.json();
    },
  });

  const overall = stats?.overall;
  const bySport: any[] = stats?.bySport ?? [];
  const hasData = overall && overall.total > 0;

  return (
    <div className="max-w-3xl mx-auto mb-10">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Platform Pick Totals — {config.title}</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData ? (
        <Card className="bg-card/20 border-white/5">
          <CardContent className="p-6 text-center">
            <BarChart3 size={32} className="text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No graded picks recorded for this period yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Combined row */}
          <div className={cn(
            "p-4 rounded-xl border flex flex-wrap items-center gap-4 bg-gradient-to-r border-primary/20",
            "from-primary/10 to-primary/5"
          )} data-testid={`platform-combined-${period}`}>
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br shrink-0", config.gradient)}>
              <Icon size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1">All Sports Combined</div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono font-bold text-lg">
                  <span className="text-green-400">{overall.wins}W</span>
                  <span className="text-muted-foreground/40 mx-1.5">—</span>
                  <span className="text-red-400">{overall.losses}L</span>
                </span>
                <span className={cn("font-mono font-black text-xl", config.accent)}>{overall.winRate}%</span>
                <span className="text-xs text-muted-foreground">{overall.total} graded picks</span>
              </div>
            </div>
            {/* Mini win/loss bar */}
            <div className="w-full sm:w-32 h-2 rounded-full overflow-hidden flex gap-0.5">
              <div className="bg-green-500 rounded-l-full" style={{ width: `${(overall.wins / overall.total) * 100}%` }} />
              <div className="bg-red-500 rounded-r-full" style={{ width: `${(overall.losses / overall.total) * 100}%` }} />
            </div>
          </div>

          {/* Per-sport grid */}
          {bySport.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {bySport.map((s: any) => {
                const isHot = s.winRate >= 60;
                const isCold = s.winRate < 40;
                return (
                  <div
                    key={s.league}
                    className={cn(
                      "p-3 rounded-xl border text-center",
                      isHot ? "bg-green-500/10 border-green-500/20" : isCold ? "bg-red-500/10 border-red-500/20" : "bg-card/30 border-white/10"
                    )}
                    data-testid={`platform-sport-${period}-${s.league}`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{s.league}</div>
                    <div className="font-mono text-sm mb-1">
                      <span className="text-green-400 font-bold">{s.wins}</span>
                      <span className="text-muted-foreground/40">-</span>
                      <span className="text-red-400 font-bold">{s.losses}</span>
                    </div>
                    <div className={cn("font-mono font-bold text-base", isHot ? "text-green-400" : isCold ? "text-red-400" : "text-primary")}>
                      {s.winRate}%
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{s.total} picks</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeriodWinners({ period, poolAmount }: { period: Period; poolAmount: number }) {
  const config = periodConfig[period];
  const Icon = config.icon;

  const { data: entries = [] } = useQuery<any[]>({
    queryKey: ["/api/leaderboard", period],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?period=${period}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const winners = entries.slice(0, config.topWinners);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br", config.gradient)}>
            <Icon size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">{config.title}</h2>
            <p className="text-xs text-muted-foreground">{config.label}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-bold font-mono", config.accent)}>
            ${poolAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pool this period</p>
        </div>
      </div>

      {winners.length === 0 ? (
        <Card className="bg-card/20 border-white/5">
          <CardContent className="p-8 text-center">
            <Trophy size={36} className="text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No winners yet for this period</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Start predicting to claim your share!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {winners.map((entry: any, i: number) => {
            const place = i + 1;
            const payout = poolAmount * (config.splits[i] || 0);
            return <WinnerCard key={entry.id} entry={entry} place={place} payout={payout} config={config} />;
          })}
        </div>
      )}
    </div>
  );
}

function PayoutHistory() {
  const { data: payoutHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/payouts/history"],
    queryFn: async () => {
      const res = await fetch("/api/payouts/history");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (payoutHistory.length === 0) return null;

  const statusColor: Record<string, string> = {
    paid: "text-green-400 bg-green-500/10 border-green-500/20",
    credited: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    failed: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  return (
    <Card className="bg-card/20 border-white/5 max-w-3xl mx-auto mt-8" data-testid="card-payout-history">
      <CardContent className="p-6">
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          <ArrowUpRight size={18} className="text-primary" /> Recent Payouts
        </h3>
        <div className="space-y-2">
          {payoutHistory.slice(0, 20).map((p: any) => {
            const name = p.user ? `${p.user.firstName || ""} ${p.user.lastName || ""}`.trim() || "Member" : "Member";
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5" data-testid={`row-payout-${p.id}`}>
                <Avatar className="h-8 w-8 border border-white/10">
                  <AvatarImage src={p.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.userId}`} />
                  <AvatarFallback>{name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">#{p.rank}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">{p.period} · {p.periodLabel}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono font-bold text-primary">
                    ${p.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <Badge className={cn("text-[9px] px-1.5 py-0 border", statusColor[p.status] || statusColor.pending)}>
                    {p.status === "credited" ? "Paid to Card" : p.status === "paid" ? "Paid to Card" : p.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RecordCell({ wins, losses, bold }: { wins: number; losses: number; bold?: boolean }) {
  return (
    <div className={cn("font-mono text-center tabular-nums", bold ? "text-base font-black" : "text-sm font-bold")}>
      <span className="text-green-400">{wins}</span>
      <span className="text-muted-foreground/30">-</span>
      <span className="text-red-400">{losses}</span>
    </div>
  );
}

function SportScorecardTable() {
  const fetchStats = async (p?: string) => {
    const url = p ? `/api/sport-stats?period=${p}` : `/api/sport-stats`;
    const res = await fetch(url);
    if (!res.ok) return { overall: { wins: 0, losses: 0 }, bySport: [] };
    return res.json();
  };

  const { data: daily }   = useQuery<any>({ queryKey: ["/api/sport-stats", "last24h"],  queryFn: () => fetchStats("last24h"), refetchInterval: 30000 });
  const { data: weekly }  = useQuery<any>({ queryKey: ["/api/sport-stats", "weekly"],   queryFn: () => fetchStats("weekly"),  refetchInterval: 60000 });
  const { data: monthly } = useQuery<any>({ queryKey: ["/api/sport-stats", "monthly"],  queryFn: () => fetchStats("monthly"), refetchInterval: 60000 });
  const { data: annual }  = useQuery<any>({ queryKey: ["/api/sport-stats", "annual"],   queryFn: () => fetchStats("annual"),  refetchInterval: 60000 });

  const periodData = [daily, weekly, monthly, annual];

  // Collect all unique sports across all periods
  const SPORT_ORDER = ["NFL", "NBA", "MLB", "NHL", "NCAAB", "NCAABB", "MLS", "NWSL", "WNBA"];
  const allLeagues = Array.from(
    new Set(periodData.flatMap(d => (d?.bySport ?? []).map((s: any) => s.league)))
  ).sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a), bi = SPORT_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const getSport = (d: any, league: string) =>
    d?.bySport?.find((s: any) => s.league === league) ?? { wins: 0, losses: 0 };

  const cols = [
    { label: "Daily",   icon: Clock,    d: daily,   accent: "text-blue-400" },
    { label: "Weekly",  icon: Calendar, d: weekly,  accent: "text-emerald-400" },
    { label: "Monthly", icon: Target,   d: monthly, accent: "text-purple-400" },
    { label: "Annual",  icon: Trophy,   d: annual,  accent: "text-yellow-400" },
  ];

  return (
    <div className="max-w-4xl mx-auto mb-10" data-testid="sport-scorecard-table">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Platform Pick Scorecard</h2>
      </div>

      <Card className="bg-card/20 border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-28">Sport</th>
                {cols.map(({ label, icon: Icon, accent }) => (
                  <th key={label} className={cn("py-3 px-3 text-[11px] font-bold uppercase tracking-widest text-center", accent)}>
                    <div className="flex flex-col items-center gap-0.5">
                      <Icon size={12} />
                      {label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Per-sport rows */}
              {allLeagues.map((league, i) => (
                <tr
                  key={league}
                  className={cn("border-b border-white/5 hover:bg-white/[0.02] transition-colors", i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]")}
                  data-testid={`row-scorecard-${league}`}
                >
                  <td className="py-3 px-4 font-bold text-xs uppercase tracking-widest text-muted-foreground">{league}</td>
                  {cols.map(({ label, d }) => {
                    const s = getSport(d, league);
                    return (
                      <td key={label} className="py-3 px-3">
                        <RecordCell wins={s.wins} losses={s.losses} />
                      </td>
                    );
                  })}
                </tr>
              ))}

              {allLeagues.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No graded picks recorded yet</td>
                </tr>
              )}

              {/* Grand Total row — combined all sports per period */}
              {allLeagues.length > 0 && (
                <tr className="border-t-2 border-primary/30 bg-primary/5" data-testid="row-scorecard-grand-total">
                  <td className="py-3 px-4 font-black text-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Award size={12} className="text-primary" /> Grand Total
                  </td>
                  {cols.map(({ label, d }) => (
                    <td key={label} className="py-3 px-3">
                      <RecordCell wins={d?.overall?.wins ?? 0} losses={d?.overall?.losses ?? 0} bold />
                    </td>
                  ))}
                </tr>
              )}

              {/* BETFANS TOTAL row — MLB prize pool qualifying picks only */}
              {allLeagues.length > 0 && (() => {
                const mlb = getSport(annual, "MLB");
                return (
                  <tr className="border-t-2 border-yellow-400/40 bg-yellow-400/5" data-testid="row-scorecard-betfans-total">
                    <td colSpan={5} className="py-5 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap size={12} className="text-yellow-400" />
                          <div>
                            <span className="font-black text-[10px] uppercase tracking-widest text-yellow-400">BetFans Total</span>
                            <span className="block text-[9px] text-yellow-400/60 uppercase tracking-widest">MLB Prize Pool Picks</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-black text-primary tabular-nums">
                            {mlb.wins ?? 0}W
                          </span>
                          <span className="text-muted-foreground text-sm font-bold">—</span>
                          <span className="text-xl font-black text-red-400 tabular-nums">
                            {mlb.losses ?? 0}L
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest ml-1">All Time</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function Winners() {
  const [activeTab, setActiveTab] = useState<Period>("daily");

  const { data: prizePool } = useQuery<PrizePoolData>({
    queryKey: ["/api/prize-pool"],
    queryFn: async () => {
      const res = await fetch("/api/prize-pool");
      if (!res.ok) return { amount: 0, daily: 0, weekly: 0, monthly: 0, annual: 0 };
      return res.json();
    },
    refetchInterval: 15000,
  });

  const totalPool = prizePool?.amount || 0;
  const periodAmounts: Record<Period, number> = {
    daily: prizePool?.daily || 0,
    weekly: prizePool?.weekly || 0,
    monthly: prizePool?.monthly || 0,
    annual: prizePool?.annual || 0,
  };

  const tabs: { period: Period; label: string; icon: any }[] = [
    { period: "daily", label: "Daily", icon: Clock },
    { period: "weekly", label: "Weekly", icon: Calendar },
    { period: "monthly", label: "Monthly", icon: Target },
    { period: "annual", label: "Annual", icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-4">
            <Sparkles size={14} /> Winners Circle
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-3" data-testid="text-page-title">
            Hall of Winners
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The best predictors earn real money. Prize pool grows in real time as members join — currently at{" "}
            <span className="text-primary font-mono font-bold">
              ${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </p>
        </div>

        <SportScorecardTable />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          <PrizePoolTracker period="daily" amount={periodAmounts.daily} config={periodConfig.daily} />
          <PrizePoolTracker period="weekly" amount={periodAmounts.weekly} config={periodConfig.weekly} />
          <PrizePoolTracker period="monthly" amount={periodAmounts.monthly} config={periodConfig.monthly} />
        </div>

        <Card className="bg-card/20 border-white/5 mb-10 max-w-3xl mx-auto" data-testid="card-pool-annual">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg">
                <Trophy size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm">Annual Grand Prize</h3>
                <p className="text-[10px] text-muted-foreground">Top {periodConfig.annual.topWinners} paid at year end</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-black text-yellow-400">
                ${periodAmounts.annual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-muted-foreground">Accumulated this year</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-2 mb-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.period}
                onClick={() => setActiveTab(tab.period)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  activeTab === tab.period
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                )}
                data-testid={`button-tab-${tab.period}`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <PlatformSportStats period={activeTab} />

        <div className="max-w-3xl mx-auto">
          <PeriodWinners period={activeTab} poolAmount={periodAmounts[activeTab]} />
        </div>

        <Card className="bg-card/20 border-white/5 max-w-3xl mx-auto mt-10">
          <CardContent className="p-6">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-primary" /> How the Prize Pool Works
            </h3>
            <div className="space-y-3">
              {Object.entries(periodConfig).map(([key, cfg]) => {
                const amount = periodAmounts[key as Period];
                const Icon = cfg.icon;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <Icon size={16} className={cfg.accent} />
                    <span className="text-sm flex-1">{cfg.title}</span>
                    <span className="text-xs text-muted-foreground">{(cfg.poolShare * 100).toFixed(0)}% split</span>
                    <span className={cn("font-mono font-bold text-sm", cfg.accent)}>
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-white/10 pt-3 mt-3 flex items-center gap-3">
                <Trophy size={16} className="text-primary" />
                <span className="text-sm font-bold flex-1">Total Prize Pool (All Time)</span>
                <span className="font-mono font-bold text-lg text-primary">
                  ${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/25">
              <p className="text-xs text-yellow-300 leading-relaxed">
                <strong className="text-yellow-200">Qualification Rule:</strong> Only <strong>MLB picks</strong> count toward prize pool eligibility.
                You must predict <strong>every MLB game daily</strong> to qualify for any payout. Missing even one game that day disqualifies you from that day's pool.
              </p>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/5">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">How it works:</strong> The prize pool starts at $0.00 and grows in real time as members pay.
                50% of every membership payment goes directly into the pool. Winners are paid based on their share percentage —
                the higher you rank, the bigger your cut. Daily winners split 5%, weekly 10%, monthly 35%, and annual champions take 50%.
              </p>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">
                <strong className="text-primary">Payouts:</strong> Winnings are paid directly to the PayPal account you subscribed with.
                Your payout is automatically credited to your account — no extra steps needed.
              </p>
            </div>
            <div className="mt-4">
              <Link href="/winners-probability">
                <Button variant="outline" className="gap-2 w-full hover:bg-primary/10 hover:text-primary hover:border-primary/30" data-testid="button-probability">
                  <Users size={14} /> View Winners Probability Estimator
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <PayoutHistory />
      </div>
    </div>
  );
}
