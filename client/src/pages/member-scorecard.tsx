import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trophy, Crown, Star, TrendingUp, Flame,
  Calendar, Clock, Target, ArrowLeft, BarChart3,
  ChevronUp, ChevronDown, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly" | "annual";

const periodConfig: Record<Period, { label: string; icon: any; accent: string; gradient: string; desc: string }> = {
  daily: {
    label: "Daily",
    icon: Clock,
    accent: "text-blue-400",
    gradient: "from-blue-500 to-cyan-500",
    desc: "Today's picks",
  },
  weekly: {
    label: "Weekly",
    icon: Calendar,
    accent: "text-emerald-400",
    gradient: "from-emerald-500 to-green-500",
    desc: "This week's picks",
  },
  monthly: {
    label: "Monthly",
    icon: Target,
    accent: "text-purple-400",
    gradient: "from-purple-500 to-violet-500",
    desc: "This month's picks",
  },
  annual: {
    label: "Annual",
    icon: Trophy,
    accent: "text-yellow-400",
    gradient: "from-yellow-500 to-orange-500",
    desc: "This year's picks",
  },
};

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "legend") return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 gap-1"><Crown size={11} /> Legend</Badge>;
  if (tier === "pro") return <Badge className="bg-primary/20 text-primary border-primary/30 gap-1"><Star size={11} /> Pro</Badge>;
  if (tier === "rookie") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">Rookie</Badge>;
  return null;
}

function WinRateBar({ winRate, wins, losses }: { winRate: number; wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return null;
  const wPct = (wins / total) * 100;
  const lPct = (losses / total) * 100;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden gap-0.5">
      <div className="bg-green-500 rounded-l-full transition-all" style={{ width: `${wPct}%` }} />
      <div className="bg-red-500 rounded-r-full transition-all" style={{ width: `${lPct}%` }} />
    </div>
  );
}

function SportCard({ s }: { s: any }) {
  const isHot = s.winRate >= 60;
  const isCold = s.winRate < 40;
  return (
    <div
      className={cn(
        "p-4 rounded-xl border flex flex-col gap-2",
        isHot ? "bg-green-500/10 border-green-500/20" : isCold ? "bg-red-500/10 border-red-500/20" : "bg-card/40 border-white/10"
      )}
      data-testid={`card-sport-${s.league}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.league}</span>
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", isHot ? "bg-green-500/20 text-green-400" : isCold ? "bg-red-500/20 text-red-400" : "bg-white/5 text-muted-foreground")}>
          {s.winRate}%
        </span>
      </div>
      <WinRateBar winRate={s.winRate} wins={s.wins} losses={s.losses} />
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono font-bold">
          <span className="text-green-400">{s.wins}W</span>
          <span className="text-muted-foreground/40 mx-1">—</span>
          <span className="text-red-400">{s.losses}L</span>
        </span>
        <span className="text-[11px] text-muted-foreground">{s.total} picks</span>
      </div>
    </div>
  );
}

function PeriodStats({ userId, period }: { userId: string; period: Period }) {
  const config = periodConfig[period];
  const Icon = config.icon;

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: [`/api/users/${userId}/sport-stats`, period],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/sport-stats?period=${period}`);
      if (!res.ok) return { overall: null, bySport: [] };
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const overall = stats?.overall;
  const bySport = stats?.bySport ?? [];
  const hasData = overall && overall.total > 0;

  return (
    <div className="space-y-6">
      {/* Period overall banner */}
      <div className={cn(
        "p-5 rounded-2xl border relative overflow-hidden",
        "bg-card/30 border-white/10"
      )}>
        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-5", config.gradient)} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br", config.gradient)}>
              <Icon size={16} className="text-white" />
            </div>
            <div>
              <div className={cn("text-xs font-bold uppercase tracking-wider", config.accent)}>{config.label} Combined</div>
              <div className="text-[11px] text-muted-foreground">{config.desc}</div>
            </div>
          </div>

          {!hasData ? (
            <div className="text-center py-6">
              <BarChart3 size={32} className="text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No graded picks this {config.label.toLowerCase()} period</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 items-end">
              <div>
                <div className="text-3xl font-mono font-black">
                  <span className="text-green-400">{overall.wins}W</span>
                  <span className="text-muted-foreground/30 mx-2">—</span>
                  <span className="text-red-400">{overall.losses}L</span>
                </div>
                <WinRateBar winRate={overall.winRate} wins={overall.wins} losses={overall.losses} />
              </div>
              <div className="flex gap-4">
                <div>
                  <div className={cn("text-2xl font-mono font-black", config.accent)}>{overall.winRate}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</div>
                </div>
                <div>
                  <div className="text-2xl font-mono font-black">{overall.total}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Graded</div>
                </div>
                {overall.streak > 0 && (
                  <div>
                    <div className="text-2xl font-mono font-black text-orange-400 flex items-center gap-1">
                      <Flame size={18} className="text-orange-400" /> {overall.streak}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Streak</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-sport grid */}
      {bySport.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Breakdown by Sport</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {bySport.map((s: any) => <SportCard key={s.league} s={s} />)}
          </div>
        </div>
      ) : hasData ? (
        <div className="text-center py-4 text-sm text-muted-foreground">No sport breakdown available</div>
      ) : null}
    </div>
  );
}

export default function MemberScorecard() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [period, setPeriod] = useState<Period>("annual");

  const { data: profile, isLoading: profileLoading } = useQuery<any>({
    queryKey: [`/api/users/${userId}/profile`],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: allTimeStats } = useQuery<any>({
    queryKey: [`/api/users/${userId}/sport-stats`, "all"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/sport-stats`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
      <AdBannerTop />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
      <AdBannerTop />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Trophy size={48} className="text-muted-foreground/20" />
          <p className="text-muted-foreground">Member not found</p>
          <Link href="/winners" className="text-primary text-sm hover:underline">← Back to Winners</Link>
        </div>
      </div>
    );
  }

  const displayName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Member";
  const overall = allTimeStats?.overall;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Back button */}
        <Link href="/winners">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back-winners">
            <ArrowLeft size={16} /> Back to Winners
          </button>
        </Link>

        {/* Member header */}
        <Card className="bg-card/30 border-white/10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardContent className="p-6 relative">
            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <Avatar className="h-20 w-20 border-2 border-primary/30 ring-4 ring-primary/10">
                <AvatarImage src={profile.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">{displayName[0]}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-display font-black" data-testid="text-member-name">{displayName}</h1>
                  <TierBadge tier={profile.membershipTier} />
                </div>
                {profile.bio && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{profile.bio}</p>}

                {/* All-time stats strip */}
                {overall && overall.total > 0 && (
                  <div className="flex flex-wrap gap-4 mt-2">
                    <div className="text-center">
                      <div className="font-mono font-black text-xl text-green-400">{overall.wins}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wins</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono font-black text-xl text-red-400">{overall.losses}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Losses</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono font-black text-xl text-primary">{overall.winRate}%</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono font-black text-xl">{overall.total}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">All-Time Picks</div>
                    </div>
                    {overall.streak > 0 && (
                      <div className="text-center">
                        <div className="font-mono font-black text-xl text-orange-400 flex items-center justify-center gap-0.5"><Flame size={16} />{overall.streak}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Streak</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <Link href={`/profile?id=${userId}`}>
                  <button className="text-xs text-primary hover:underline" data-testid="link-view-profile">View Profile →</button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Period Tabs */}
        <div>
          <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-primary" /> Pick Scores by Period
          </h2>

          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="grid grid-cols-4 w-full max-w-md mb-6 bg-card/40 border border-white/10">
              {(["daily", "weekly", "monthly", "annual"] as Period[]).map((p) => {
                const cfg = periodConfig[p];
                const Icon = cfg.icon;
                return (
                  <TabsTrigger
                    key={p}
                    value={p}
                    className="flex items-center gap-1.5 text-xs"
                    data-testid={`tab-${p}`}
                  >
                    <Icon size={12} />
                    {cfg.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(["daily", "weekly", "monthly", "annual"] as Period[]).map((p) => (
              <TabsContent key={p} value={p}>
                <PeriodStats userId={userId} period={p} />
              </TabsContent>
            ))}
          </Tabs>
        </div>

      </div>
      <AdBannerInline />
    </div>
  );
}
