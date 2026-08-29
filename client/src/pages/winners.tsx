import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, Crown, Star, DollarSign, Clock,
  Award, Sparkles, ChevronRight,
  Timer, Zap, Users, ArrowUpRight,
  CheckCircle2, XCircle, Shield, Send, Loader2,
} from "lucide-react";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExpertBadge, isExpertAnalyst } from "@/components/ExpertBadge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type PrizePoolData = {
  amount: number;
  daily: number;
};

const DAILY_POOL_SHARE = 0.10;


const tierConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  legend: { label: "Legend", color: "text-purple-400", bg: "bg-purple-600/20", border: "border-purple-500/30", icon: Crown },
  pro: { label: "Pro", color: "text-primary", bg: "bg-primary/20", border: "border-primary/30", icon: Star },
  rookie: { label: "Rookie", color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30", icon: Award },
};

function TierBadge({ tier }: { tier: string | null }) {
  return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1.5 py-0"><Crown size={10} /> Legend</Badge>;
}

function WinnerCard({ entry, payout, accentClass }: { entry: any; payout: number; accentClass: string }) {
  const name = entry.name || "Member";
  const wins = entry.total?.wins ?? entry.wins ?? 0;
  const losses = entry.total?.losses ?? entry.losses ?? 0;
  const avatar = entry.avatar || entry.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`;
  const tier = entry.tier || entry.user?.membershipTier;

  return (
    <Link href={`/winners/${entry.userId}`}>
      <Card className="bg-card/30 border-white/5 hover:border-white/10 transition-all cursor-pointer group hover:scale-[1.02]" data-testid={`card-winner-${entry.userId}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white/10 shrink-0">
              <AvatarImage src={avatar} />
              <AvatarFallback>{name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-display font-bold truncate text-sm">{name}</span>
                <TierBadge tier={tier} />
              </div>
              <div className="font-mono text-sm">
                <span className="text-green-400">{wins}W</span>
                <span className="text-muted-foreground/40 mx-1">-</span>
                <span className="text-red-400">{losses}L</span>
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

function useCountdown(period: "daily") {
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
  return "$" + Math.floor(n).toLocaleString();
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
          {poolAmount > 0 ? "$" + Math.floor(poolAmount).toLocaleString() : "Building..."}
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


function DailyWinners({ poolAmount }: { poolAmount: number }) {
  const { data: scorecard } = useQuery<any>({
    queryKey: ["/api/daily-scorecard"],
    queryFn: async () => {
      const res = await fetch("/api/daily-scorecard");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });

  const rawMembers: any[] = scorecard?.members ?? [];
  const sorted = [...rawMembers]
    .filter((m: any) => m.qualified)
    .sort((a: any, b: any) => b.total.wins - a.total.wins || a.total.losses - b.total.losses);
  const topWins = sorted[0]?.total.wins;
  const topLosses = sorted[0]?.total.losses;
  const winners = sorted.length > 0
    ? sorted.filter((m: any) => m.total.wins === topWins && m.total.losses === topLosses)
    : [];
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
            <p className="text-xs text-muted-foreground/50 mt-1">Pick every MLB, NBA & NHL game to qualify</p>
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


function RecordCell({ wins, losses, bold }: { wins: number; losses: number; bold?: boolean }) {
  return (
    <div className={cn("font-mono text-center tabular-nums", bold ? "text-base font-black" : "text-sm font-bold")}>
      <span className="text-green-400">{wins}</span>
      <span className="text-muted-foreground/30">-</span>
      <span className="text-red-400">{losses}</span>
    </div>
  );
}


function SportCell({ wins, losses, picks, total, qualified }: { wins: number; losses: number; picks: number; total: number; qualified: boolean }) {
  const missing = total - picks;
  return (
    <td className="py-3 px-2 text-center align-middle">
      {total === 0 ? (
        <span className="text-muted-foreground/30 text-xs">—</span>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <div className="font-mono text-sm font-bold tabular-nums">
            <span className="text-green-400">{wins}</span>
            <span className="text-muted-foreground/30">-</span>
            <span className="text-red-400">{losses}</span>
          </div>
          <div className={cn("text-[10px] tabular-nums", missing > 0 ? "text-red-400/70" : "text-muted-foreground/50")}>
            {picks}/{total} picks
          </div>
        </div>
      )}
    </td>
  );
}

function DailyMemberScorecard() {
  const { user } = useAuth() as { user: any };
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isFounder = user?.referralCode === "NIKCOX" || user?.referralCode === "DAMON822";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/daily-scorecard"],
    queryFn: async () => {
      const res = await fetch("/api/daily-scorecard");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });


  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payouts/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "daily" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Payout failed");
      }
      return res.json();
    },
    onSuccess: (result) => {
      const detail = result?.results?.[0]?.detail ?? "Done";
      toast({ title: "Prize Pool Paid", description: detail });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-scorecard"] });
    },
    onError: (e: any) => {
      toast({ title: "Payout Error", description: e.message, variant: "destructive" });
    },
  });

  const games = data?.games ?? { mlb: 0, nba: 0, nhl: 0, wc: 0, epl: 0, ncaabb: 0, total: 0 };
  const rawMembers: any[] = data?.members ?? [];
  const label = data?.period?.label ?? "";
  const winner = data?.winner ?? null;

  // Sort by wins DESC, then losses ASC — same ranking as Top Predictors & Daily Rankings
  const members = [...rawMembers].sort((a, b) =>
    b.total.wins - a.total.wins || a.total.losses - b.total.losses
  );

  // Find all tied winners (same W-L as the winner, all qualified)
  const tiedWinners = winner
    ? members.filter((m: any) => m.qualified && m.total.wins === winner.wins && m.total.losses === winner.losses)
    : [];

  const formattedDate = label
    ? new Date(label + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <div className="max-w-4xl mx-auto mb-10" data-testid="daily-member-scorecard">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Yesterday's Final Results</h2>
          {formattedDate && (
            <span className="text-xs text-muted-foreground/50 font-mono">{formattedDate}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          {games.mlb > 0 && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">MLB {games.mlb}G</span>}
          {games.ncaaf > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">🏈 FBS {games.ncaaf}G</span>}
          {games.nfl > 0 && <span className="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400">🏈 NFL {games.nfl}G</span>}
          {games.nba > 0 && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">NBA {games.nba}G</span>}
          {games.nhl > 0 && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">NHL {games.nhl}G</span>}
          {games.wc > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">🌍 WC {games.wc}G</span>}
           {games.epl > 0 && <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">⚽ EPL {games.epl}G</span>}
          {games.ucl > 0 && <span className="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400">🏆 UCL {games.ucl}G</span>}
        </div>
      </div>

      {/* Winner Banner — handles both sole winner and tied winners */}
      {winner && tiedWinners.length === 1 && (
        <div className="mb-3 rounded-xl bg-gradient-to-r from-yellow-500/10 via-primary/10 to-yellow-500/10 border border-yellow-500/20 px-4 py-3 flex items-center gap-3" data-testid="scorecard-winner-banner">
          <Trophy size={20} className="text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest text-yellow-400/80 mb-0.5">Daily Prize Pool Winner</div>
            <div className="font-display font-black text-lg text-foreground leading-tight flex items-center gap-2">{winner.name}{isExpertAnalyst(winner.referralCode) && <ExpertBadge />}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-2xl font-black tabular-nums">
              <span className="text-green-400">{winner.wins}</span>
              <span className="text-white/20">-</span>
              <span className="text-red-400">{winner.losses}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">W - L</div>
          </div>
        </div>
      )}
      {winner && tiedWinners.length > 1 && (
        <div className="mb-3 rounded-xl bg-gradient-to-r from-yellow-500/10 via-primary/10 to-yellow-500/10 border border-yellow-500/20 px-4 py-3" data-testid="scorecard-winner-banner">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={16} className="text-yellow-400" />
            <div className="text-xs font-bold uppercase tracking-widest text-yellow-400/80">
              Prize Pool Split — {tiedWinners.length}-Way Tie
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {tiedWinners.map((w: any) => (
              <div key={w.userId} className="flex items-center gap-2">
                <span className="font-display font-black text-base text-foreground">{w.name}</span>
                {isExpertAnalyst(w.referralCode) && <ExpertBadge />}
                <span className="font-mono text-sm tabular-nums">
                  <span className="text-green-400">{w.total.wins}</span>
                  <span className="text-white/30">-</span>
                  <span className="text-red-400">{w.total.losses}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}


      <Card className="bg-transparent border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="text-left py-3 px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Member</th>
                <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-blue-400">MLB</th>
                {games.ncaaf > 0 && <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-amber-400">🏈 FBS</th>}
                {games.nfl > 0 && <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-green-400">🏈 NFL</th>}
                <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-orange-400">NBA</th>
                <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-cyan-400">NHL</th>
                {games.wc > 0 && <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-emerald-400">🌍 WC</th>}
               {games.epl > 0 && <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-indigo-400">⚽ EPL</th>}
                {games.ucl > 0 && <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-violet-400">🏆 UCL</th>}
                <th className="py-3 px-2 text-center text-[11px] font-bold uppercase tracking-widest text-foreground">Total W-L</th>
                <th className="py-3 px-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && members.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No results yet</td></tr>
              )}
              {members.map((m: any) => {
                const isWinner = winner && m.userId === winner.userId;
                return (
                  <tr
                    key={m.userId}
                    className={cn(
                      "border-b border-white/5 transition-colors",
                      isWinner ? "bg-yellow-500/[0.06] hover:bg-yellow-500/[0.09]" : m.qualified ? "bg-green-500/[0.03] hover:bg-white/[0.03]" : "hover:bg-white/[0.02]"
                    )}
                    data-testid={`row-scorecard-member-${m.userId}`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {isWinner && <Trophy size={14} className="text-yellow-400 shrink-0" />}
                        <Avatar className="h-7 w-7 border border-white/10 shrink-0">
                          <AvatarImage src={m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.userId}`} />
                          <AvatarFallback className="text-xs">{m.name?.[0] ?? "M"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className={cn("font-bold text-xs flex items-center gap-1 truncate", isWinner && "text-yellow-300")}>
                            <span className="truncate">{m.name}</span>
                            {isExpertAnalyst(m.referralCode) && <ExpertBadge />}
                          </div>
                          <TierBadge tier={m.tier} />
                          {m.firstPickAt && (
                            <div className="font-mono text-[10px] mt-1 space-y-0.5">
                              <div className="flex items-center gap-1 text-green-400/80">
                                <Clock size={9} className="shrink-0" />
                                <span className="font-semibold">{m.firstPickAt}</span>
                              </div>
                              {m.lastPickAt && m.lastPickAt !== m.firstPickAt && (
                                <div className="flex items-center gap-1 text-orange-400/90">
                                  <Clock size={9} className="shrink-0" />
                                  <span className="font-semibold">last: {m.lastPickAt}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <SportCell wins={m.mlb.wins} losses={m.mlb.losses} picks={m.mlb.picks} total={games.mlb} qualified={m.mlb.picks >= games.mlb} />
                    {games.ncaaf > 0 && <SportCell wins={m.ncaaf?.wins ?? 0} losses={m.ncaaf?.losses ?? 0} picks={m.ncaaf?.picks ?? 0} total={games.ncaaf} qualified={(m.ncaaf?.picks ?? 0) >= games.ncaaf} />}
                    {games.nfl > 0 && <SportCell wins={m.nfl?.wins ?? 0} losses={m.nfl?.losses ?? 0} picks={m.nfl?.picks ?? 0} total={games.nfl} qualified={(m.nfl?.picks ?? 0) >= games.nfl} />}
                    <SportCell wins={m.nba.wins} losses={m.nba.losses} picks={m.nba.picks} total={games.nba} qualified={games.nba === 0 || m.nba.picks >= games.nba} />
                    <SportCell wins={m.nhl.wins} losses={m.nhl.losses} picks={m.nhl.picks} total={games.nhl} qualified={games.nhl === 0 || m.nhl.picks >= games.nhl} />
                    {games.wc > 0 && <SportCell wins={m.wc?.wins ?? 0} losses={m.wc?.losses ?? 0} picks={m.wc?.picks ?? 0} total={games.wc} qualified={games.wc === 0 || (m.wc?.picks ?? 0) >= games.wc} />}
                   {games.epl > 0 && <SportCell wins={m.epl?.wins ?? 0} losses={m.epl?.losses ?? 0} picks={m.epl?.picks ?? 0} total={games.epl} qualified />}
                    {games.ucl > 0 && <SportCell wins={m.ucl?.wins ?? 0} losses={m.ucl?.losses ?? 0} picks={m.ucl?.picks ?? 0} total={games.ucl} qualified />}
                    {games.ncaabb > 0 && <SportCell wins={m.ncaabb?.wins ?? 0} losses={m.ncaabb?.losses ?? 0} picks={m.ncaabb?.picks ?? 0} total={games.ncaabb} qualified={games.ncaabb === 0 || (m.ncaabb?.picks ?? 0) >= games.ncaabb} />}
                    <td className="py-3 px-2 text-center align-middle">
                      <div className={cn("font-mono text-base font-black tabular-nums", isWinner ? "text-yellow-300" : "")}>
                        <span className="text-green-400">{m.total.wins}</span>
                        <span className="text-muted-foreground/30 mx-0.5">-</span>
                        <span className="text-red-400">{m.total.losses}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/40 tabular-nums">{m.total.picks}/{games.total} picks</div>
                    </td>
                    <td className="py-3 px-3 text-center align-middle">
                      {isWinner ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] font-black text-yellow-400 uppercase tracking-wider px-2 py-0.5 bg-yellow-500/10 rounded-full border border-yellow-500/20">Winner</span>
                        </div>
                      ) : m.qualified ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <CheckCircle2 size={16} className="text-green-400" />
                          <span className="text-[9px] text-green-400/70 font-bold uppercase tracking-wider">Qualified</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <XCircle size={16} className="text-muted-foreground/30" />
                          <span className="text-[9px] text-red-400/50 uppercase tracking-wider">
                            {m.total.picks === 0 ? "No picks" : `${games.total - m.total.picks} missing`}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-white/5 text-[10px] text-muted-foreground/40 flex items-center gap-1">
          <Shield size={10} /> Transparent — all members can verify each other's qualifying picks · Auto-refreshes every 30s
        </div>
      </Card>
    </div>
  );
}

function PayoutHistory() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: payoutHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/payouts/history"],
    queryFn: async () => {
      const res = await fetch("/api/payouts/history");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: adminCheck } = useQuery<any>({
    queryKey: ["/api/admin/members"],
    queryFn: async () => {
      const res = await fetch("/api/admin/members");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentUser,
    retry: false,
  });
  const isAdmin = adminCheck !== null && Array.isArray(adminCheck);

  const sendToCard = useMutation({
    mutationFn: async (payoutId: number) => {
      const res = await fetch(`/api/admin/send-to-card/${payoutId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Sent to card!", description: `PayPal payout dispatched to ${data.email}` });
      queryClient.invalidateQueries({ queryKey: ["/api/payouts/history"] });
    },
    onError: (e: any) => {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (payoutId: number) => {
      const res = await fetch(`/api/admin/mark-paid/${payoutId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark paid");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: `Marked as paid — $${data.amount}`,
        description: `Send manually via PayPal to: ${data.recipientInfo}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payouts/history"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (payoutHistory.length === 0) return null;

  const statusColor: Record<string, string> = {
    paid: "text-green-400 bg-green-500/10 border-green-500/20",
    credited: "text-green-400 bg-green-500/10 border-green-500/20",
    wallet_credited: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    paypal_sent: "text-green-400 bg-green-500/10 border-green-500/20",
    pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    failed: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  function statusLabel(status: string) {
    if (status === "paypal_sent" || status === "paid" || status === "credited") return "Sent to Card";
    if (status === "wallet_credited") return "Pending Card Send";
    return status;
  }

  return (
    <Card className="bg-card/20 border-white/5 max-w-3xl mx-auto mt-8" data-testid="card-payout-history">
      <CardContent className="p-6">
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          <ArrowUpRight size={18} className="text-primary" /> Recent Payouts
        </h3>
        <div className="space-y-2">
          {payoutHistory.slice(0, 20).map((p: any) => {
            const name = p.user ? `${p.user.firstName || ""} ${p.user.lastName || ""}`.trim() || "Member" : "Member";
            const needsSend = p.status === "wallet_credited" || p.status === "pending";
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5" data-testid={`row-payout-${p.id}`}>
                <Avatar className="h-8 w-8 border border-white/10">
                  <AvatarImage src={p.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.userId}`} />
                  <AvatarFallback>{name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{name}</span>
                    {isExpertAnalyst(p.user?.referralCode) && <ExpertBadge />}
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
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && needsSend && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 border-primary/40 text-primary hover:bg-primary/10"
                        onClick={() => sendToCard.mutate(p.id)}
                        disabled={sendToCard.isPending || markPaid.isPending}
                        data-testid={`button-send-to-card-${p.id}`}
                      >
                        {sendToCard.isPending ? <Loader2 size={10} className="animate-spin" /> : "Send to Card"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                        onClick={() => markPaid.mutate(p.id)}
                        disabled={sendToCard.isPending || markPaid.isPending}
                        data-testid={`button-mark-paid-${p.id}`}
                        title="Mark as manually paid — sends you the recipient info to send via PayPal.com"
                      >
                        {markPaid.isPending ? <Loader2 size={10} className="animate-spin" /> : "Mark Paid"}
                      </Button>
                    </>
                  )}
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-primary">
                      ${p.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <Badge className={cn("text-[9px] px-1.5 py-0 border", statusColor[p.status] || statusColor.pending)}>
                      {statusLabel(p.status)}
                    </Badge>
                  </div>
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
            The best predictors earn real money. Compete daily for available prizes — subject to availability and change at any time.
          </p>
        </div>

        <PrizePoolQualRule className="max-w-3xl mx-auto mb-8" />

        <DailyMemberScorecard />

        <div className="max-w-3xl mx-auto mb-10">
          <DailyPrizePoolTracker poolAmount={totalPool} />
        </div>

        <div className="max-w-3xl mx-auto">
          <DailyWinners poolAmount={totalPool} />
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
              <div className="border-t border-white/10 pt-3 mt-3 flex items-center gap-3">
                <DollarSign size={16} className="text-primary" />
                <span className="text-sm font-bold flex-1">Total Prize Pool</span>
                <span className="font-mono font-bold text-lg text-primary">
                  {fmtMoney(totalPool)}
                </span>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/25">
              <p className="text-xs text-yellow-300 leading-relaxed">
                <strong className="text-yellow-200">Qualification Rule:</strong> You must predict <strong>every MLB, NBA, and NHL game daily</strong> to qualify for any payout. Missing even one game in any sport that day disqualifies you from that day's pool.
              </p>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/5">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">How it works:</strong> Each day, all members compete together regardless of tier.
                The best MLB predictor wins the daily prize. Tied winners split equally. Prizes subject to availability.
              </p>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">
                <strong className="text-primary">Payouts:</strong> Winnings are sent directly to your debit card via PayPal.
                Your payout is dispatched automatically — no extra steps needed.
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
