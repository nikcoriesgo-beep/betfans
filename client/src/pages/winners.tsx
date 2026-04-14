import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, Crown, Star, DollarSign, TrendingUp,
  Clock, Award, Sparkles, ChevronRight,
  Timer, Zap, Users, ArrowUpRight, BarChart3,
} from "lucide-react";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

type Period = "daily" | "annual";

type PrizePoolData = {
  amount: number;
  daily: number;
  annual: number;
};

const DAILY_POOL_SHARE = 0.10;

const periodConfig: Record<Period, {
  title: string;
  icon: any;
  gradient: string;
  border: string;
  accent: string;
  label: string;
}> = {
  daily: {
    title: "Daily Winners",
    icon: Clock,
    gradient: "from-blue-500 to-cyan-500",
    border: "border-blue-500/30",
    accent: "text-blue-400",
    label: "Today's Champions",
  },
  annual: {
    title: "Annual Winners",
    icon: Trophy,
    gradient: "from-yellow-500 to-orange-500",
    border: "border-yellow-500/30",
    accent: "text-yellow-400",
    label: "Year-End Champions",
  },
};

const tierConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  legend: { label: "Legend", color: "text-purple-400", bg: "bg-purple-600/20", border: "border-purple-500/30", icon: Crown },
  pro: { label: "Pro", color: "text-primary", bg: "bg-primary/20", border: "border-primary/30", icon: Star },
  rookie: { label: "Rookie", color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30", icon: Award },
};

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "legend") return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1.5 py-0"><Crown size={10} /> Legend</Badge>;
  if (tier === "pro") return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-0.5 px-1.5 py-0"><Star size={10} /> Pro</Badge>;
  if (tier === "rookie") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] gap-0.5 px-1.5 py-0"><Award size={10} /> Rookie</Badge>;
  return null;
}

function WinnerCard({ entry, payout, accentClass }: { entry: any; payout: number; accentClass: string }) {
  const name = entry.user ? `${entry.user.firstName || ""} ${entry.user.lastName || ""}`.trim() || "Member" : "Member";
  const winRate = entry.wins + entry.losses > 0 ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1) : "0";

  return (
    <Link href={`/winners/${entry.userId}`}>
      <Card className="bg-card/30 border-white/5 hover:border-white/10 transition-all cursor-pointer group hover:scale-[1.02]" data-testid={`card-winner-${entry.userId}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white/10 shrink-0">
              <AvatarImage src={entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`} />
              <AvatarFallback>{name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-display font-bold truncate text-sm">{name}</span>
                <TierBadge tier={entry.user?.membershipTier} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><TrendingUp size={11} /> {winRate}% Win Rate</span>
                <span>{entry.wins}W - {entry.losses}L</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={cn("font-bold font-mono text-xl", accentClass)}>
                {fmtMoney(payout)}
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0 hidden md:block" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function useCountdown(period: "daily" | "annual") {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      let target: Date;
      if (period === "daily") {
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        target.setHours(0, 0, 0, 0);
        const diff = target.getTime() - now.getTime();
        if (diff <= 0) return "Resetting...";
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return `${h}h ${m}m ${s}s`;
      } else {
        target = new Date(now.getFullYear() + 1, 0, 1);
        const diff = target.getTime() - now.getTime();
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        return `${d}d ${h}h`;
      }
    };
    setTimeLeft(calc());
    const interval = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(interval);
  }, [period]);
  return timeLeft;
}

function fmtMoney(n: number) {
  if (!n || n <= 0) return "—";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DailyPrizePoolTracker({ poolAmount }: { poolAmount: number }) {
  const countdown = useCountdown("daily");
  const [prevAmount, setPrevAmount] = useState(poolAmount);
  const [isGrowing, setIsGrowing] = useState(false);

  useEffect(() => {
    if (poolAmount > prevAmount && prevAmount > 0) {
      setIsGrowing(true);
      setTimeout(() => setIsGrowing(false), 2000);
    }
    setPrevAmount(poolAmount);
  }, [poolAmount]);

  const dailyPrize = poolAmount * DAILY_POOL_SHARE;

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all border-blue-500/30 border",
      isGrowing && "ring-2 ring-primary/50"
    )} data-testid="tracker-daily">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-10" />
      {isGrowing && <div className="absolute inset-0 bg-primary/10 animate-pulse" />}
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
              <Clock size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm">Daily Prize Opportunity</h3>
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
          "text-3xl font-mono font-black mb-1 transition-all duration-500 text-blue-400",
          isGrowing && "scale-105 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)]"
        )}>
          {poolAmount > 0 ? "$" + poolAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Building..."}
        </div>
        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-4">Remaining Prize Pool</div>

        <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-1.5">
            <Trophy size={12} className="text-primary" />
            <span className="font-bold text-primary">Today's Winner</span>
            <span className="text-muted-foreground/60">(10% of pool · all tiers compete)</span>
          </div>
          <span className="font-mono font-bold text-primary">
            {fmtMoney(dailyPrize)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AnnualPrizePoolTracker({ annualAmount }: { annualAmount: number }) {
  const countdown = useCountdown("annual");

  return (
    <Card className="relative overflow-hidden border-yellow-500/30 border" data-testid="tracker-annual">
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-500 to-orange-500 opacity-10" />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg">
              <Trophy size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm">Annual Grand Prize</h3>
              <div className="text-[10px] text-muted-foreground">Winner takes all remaining</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
            <Timer size={12} className="text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">{countdown}</span>
          </div>
        </div>

        <div className="text-3xl font-mono font-black mb-3 text-yellow-400">
          {annualAmount > 0 ? "$" + annualAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Building..."}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          All remaining prize pool accumulates here after daily payouts. Awarded to the best MLB predictor(s) of the year on Jan 1st.
          Tied annual winners split the pool equally.
        </p>
        <p className="mt-1.5 text-[10px] text-muted-foreground/50">* All members must predict over 2,000 MLB games to qualify for the annual prize pool payout.</p>
      </CardContent>
    </Card>
  );
}

function DailyWinners({ poolAmount }: { poolAmount: number }) {
  const { data: entries = [] } = useQuery<any[]>({
    queryKey: ["/api/leaderboard", "daily"],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?period=daily`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const eligible = entries.filter((e) => {
    const tier = e.user?.membershipTier;
    return tier === "legend" || tier === "pro" || tier === "rookie";
  });
  const sorted = [...eligible].sort((a, b) => b.roi - a.roi || b.wins - a.wins);
  const topRoi = sorted[0]?.roi;
  const topWins = sorted[0]?.wins;
  const winners = sorted.length > 0 ? sorted.filter((e) => e.roi === topRoi && e.wins === topWins) : [];
  const dailyPool = poolAmount * DAILY_POOL_SHARE;
  const perWinner = winners.length > 0 ? dailyPool / winners.length : dailyPool;

  return (
    <div className="space-y-4" data-testid="section-daily-unified">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 border border-primary/30">
            <Trophy size={16} className="text-primary" />
          </div>
          <div>
            <span className="font-display font-bold text-sm text-primary">Today's Best Predictor</span>
            <span className="text-xs text-muted-foreground ml-2">· 10% of prize pool · all tiers compete</span>
          </div>
        </div>
        <div className="font-mono font-bold text-primary">
          {fmtMoney(dailyPool)}
          {winners.length > 1 && (
            <span className="text-muted-foreground text-xs font-normal ml-1">÷ {winners.length}</span>
          )}
        </div>
      </div>

      {winners.length === 0 ? (
        <Card className="bg-card/20 border-white/5">
          <CardContent className="p-5 text-center">
            <Trophy size={28} className="text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No qualifying picks today</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Pick every MLB game to qualify</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {winners.map((entry) => (
            <WinnerCard key={entry.userId} entry={entry} payout={perWinner} accentClass="text-primary" />
          ))}
          {winners.length > 1 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {winners.length} tied — each receives {fmtMoney(perWinner)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AnnualWinners({ remainingPool }: { remainingPool: number }) {
  const { data: entries = [] } = useQuery<any[]>({
    queryKey: ["/api/leaderboard", "annual"],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?period=annual`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const topEntries = entries.slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-yellow-500 to-orange-500">
            <Trophy size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Annual Standings</h2>
            <p className="text-xs text-muted-foreground">Year-End Champions — winner takes all remaining pool</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold font-mono text-yellow-400">
            {fmtMoney(remainingPool)}
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Remaining Pool</p>
        </div>
      </div>

      {topEntries.length === 0 ? (
        <Card className="bg-card/20 border-white/5">
          <CardContent className="p-8 text-center">
            <Trophy size={36} className="text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No annual picks yet</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Start predicting MLB games to claim your share!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {topEntries.map((entry: any, i: number) => {
            const isLeader = i === 0;
            const winRate = entry.wins + entry.losses > 0
              ? ((entry.wins / (entry.wins + entry.losses)) * 100).toFixed(1)
              : "0";
            const name = entry.user ? `${entry.user.firstName || ""} ${entry.user.lastName || ""}`.trim() || "Member" : "Member";

            return (
              <Link key={entry.userId} href={`/winners/${entry.userId}`}>
                <Card className={cn(
                  "transition-all cursor-pointer group hover:scale-[1.02]",
                  isLeader ? "bg-gradient-to-r from-yellow-500/5 to-orange-500/5 border-yellow-500/30 border" : "bg-card/30 border-white/5 hover:border-white/10"
                )} data-testid={`card-annual-winner-${i + 1}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0",
                        isLeader ? "bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/30" : "bg-white/5 border border-white/10 text-muted-foreground"
                      )}>
                        {isLeader ? <Crown size={16} /> : i + 1}
                      </div>
                      <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                        <AvatarImage src={entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`} />
                        <AvatarFallback>{name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={cn("font-display font-bold truncate", isLeader ? "text-sm" : "text-xs")}>{name}</span>
                          <TierBadge tier={entry.user?.membershipTier} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{winRate}% Win Rate</span>
                          <span>{entry.wins}W - {entry.losses}L</span>
                        </div>
                      </div>
                      {isLeader && (
                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold font-mono text-yellow-400">
                            {fmtMoney(remainingPool)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Prize if year ends now</div>
                        </div>
                      )}
                      <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-foreground/50 shrink-0 hidden md:block" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
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

  const FOUNDER_ID = "29b670b7-5296-44dc-a0a0-aec0d878ef9b";
  const fetchFounderStats = async (p?: string) => {
    const url = p ? `/api/users/${FOUNDER_ID}/sport-stats?period=${p}` : `/api/users/${FOUNDER_ID}/sport-stats`;
    const res = await fetch(url);
    if (!res.ok) return { overall: { wins: 0, losses: 0 }, bySport: [] };
    return res.json();
  };

  const { data: daily }        = useQuery<any>({ queryKey: ["/api/sport-stats", "last24h"],  queryFn: () => fetchStats("last24h"), refetchInterval: 30000 });
  const { data: annual }       = useQuery<any>({ queryKey: ["/api/sport-stats", "annual"],   queryFn: () => fetchStats("annual"),  refetchInterval: 60000 });
  const { data: founderAnnual} = useQuery<any>({ queryKey: ["/api/founder-sport-stats"],     queryFn: () => fetchFounderStats("annual"), refetchInterval: 60000 });

  const periodData = [daily, annual];

  const SPORT_ORDER = ["NFL", "NBA", "MLB", "NHL", "NCAAB", "MLS", "NWSL", "WNBA"];
  const allLeagues = Array.from(
    new Set(periodData.flatMap(d => (d?.bySport ?? []).map((s: any) => s.league)))
  ).sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a), bi = SPORT_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const getSport = (d: any, league: string) =>
    d?.bySport?.find((s: any) => s.league === league) ?? { wins: 0, losses: 0 };

  const cols = [
    { label: "Daily",  icon: Clock,   d: daily,  accent: "text-blue-400" },
    { label: "Annual", icon: Trophy,  d: annual, accent: "text-yellow-400" },
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
                  <td colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No graded picks recorded yet</td>
                </tr>
              )}

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

              {allLeagues.length > 0 && (() => {
                const mlb = getSport(founderAnnual, "MLB");
                return (
                  <tr className="border-t-2 border-yellow-400/40 bg-yellow-400/5" data-testid="row-scorecard-betfans-total">
                    <td colSpan={3} className="py-5 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap size={12} className="text-yellow-400" />
                          <div>
                            <span className="font-black text-[10px] uppercase tracking-widest text-yellow-400">BetFans Total</span>
                            <span className="block text-[9px] text-yellow-400/60 uppercase tracking-widest">MLB Prize Pool Picks</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-black text-primary tabular-nums">{mlb.wins ?? 0}W</span>
                          <span className="text-muted-foreground text-sm font-bold">—</span>
                          <span className="text-xl font-black text-red-400 tabular-nums">{mlb.losses ?? 0}L</span>
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
    wallet_credited: "text-green-400 bg-green-500/10 border-green-500/20",
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
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{p.period}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground capitalize">{p.period} · {p.periodLabel}</span>
                    {p.wins != null && (
                      <span className="text-[10px] font-mono font-bold">
                        <span className="text-green-400">{p.wins}W</span>
                        <span className="text-muted-foreground/40">-</span>
                        <span className="text-red-400">{p.losses}L</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono font-bold text-primary">
                    ${p.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <Badge className={cn("text-[9px] px-1.5 py-0 border", statusColor[p.status] || statusColor.pending)}>
                    {p.status === "wallet_credited" || p.status === "credited" || p.status === "paid" ? "Paid to Wallet" : p.status}
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

export default function Winners() {
  const [activeTab, setActiveTab] = useState<Period>("daily");

  const { data: prizePool } = useQuery<PrizePoolData>({
    queryKey: ["/api/prize-pool"],
    queryFn: async () => {
      const res = await fetch("/api/prize-pool");
      if (!res.ok) return { amount: 0, daily: 0, annual: 0 };
      return res.json();
    },
    refetchInterval: 15000,
  });

  const totalPool = prizePool?.amount || 0;
  const dailyPool = prizePool?.daily || 0;
  const annualPool = prizePool?.annual || 0;

  const tabs: { period: Period; label: string; icon: any }[] = [
    { period: "daily", label: "Daily", icon: Clock },
    { period: "annual", label: "Annual", icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
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
              {totalPool > 0 ? "$" + totalPool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "growing"}
            </span>
          </p>
        </div>

        <PrizePoolQualRule className="max-w-3xl mx-auto mb-8" />

        <SportScorecardTable />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10 max-w-3xl mx-auto">
          <DailyPrizePoolTracker poolAmount={totalPool} />
          <AnnualPrizePoolTracker annualAmount={annualPool} />
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.period}
                onClick={() => setActiveTab(tab.period)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all",
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

        <div className="max-w-3xl mx-auto">
          {activeTab === "daily" ? (
            <DailyWinners poolAmount={totalPool} />
          ) : (
            <AnnualWinners remainingPool={annualPool} />
          )}
        </div>

        <Card className="bg-card/20 border-white/5 max-w-3xl mx-auto mt-10">
          <CardContent className="p-6">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-primary" /> How the Prize Pool Works
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Trophy size={16} className="text-primary" />
                <span className="text-sm flex-1">Daily Winner (all tiers compete)</span>
                <span className="text-xs text-muted-foreground">10% of prize pool</span>
                <span className="font-mono font-bold text-sm text-primary">
                  {fmtMoney(totalPool * DAILY_POOL_SHARE)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Trophy size={16} className="text-yellow-400" />
                <span className="text-sm flex-1">Annual Grand Prize</span>
                <span className="text-xs text-muted-foreground">All remaining pool</span>
                <span className="font-mono font-bold text-sm text-yellow-400">
                  {fmtMoney(annualPool)}
                </span>
              </div>
              <div className="border-t border-white/10 pt-3 mt-3 flex items-center gap-3">
                <DollarSign size={16} className="text-primary" />
                <span className="text-sm font-bold flex-1">Remaining Prize Pool</span>
                <span className="font-mono font-bold text-lg text-primary">
                  {fmtMoney(totalPool)}
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
                <strong className="text-foreground">How it works:</strong> Each day, all members compete together regardless of tier.
                The best MLB predictor wins 10% of the prize pool. Tied winners split the 10% equally.
                The remaining 90% accumulates all year for the annual grand prize.
                On January 1st, the year's top MLB predictor wins the entire remaining pool.
                Tied annual winners split the pool equally.
              </p>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">
                <strong className="text-primary">Payouts:</strong> Winnings are credited directly to your BetFans wallet.
                Your payout is automatically credited — no extra steps needed.
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
      <AdBannerInline />
    </div>
  );
}
