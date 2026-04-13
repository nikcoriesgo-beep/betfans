import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, Clock, Calendar, Target, DollarSign, Users,
  TrendingUp, Sparkles, Calculator, Divide, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const MEMBER_COUNT = 1000;

const tierPrices = {
  rookie: 19,
  pro: 29,
  legend: 99,
};

const tierDistribution = {
  rookie: 0.50,
  pro: 0.35,
  legend: 0.15,
};

const periodConfig = {
  daily: {
    title: "Daily Prize",
    poolPercent: 0.05,
    topWinners: 3,
    splits: [0.50, 0.30, 0.20],
    icon: Clock,
    gradient: "from-blue-500 to-cyan-500",
    border: "border-blue-500/30",
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    frequency: "Every 24 Hours",
    annualMultiplier: 365,
  },
  weekly: {
    title: "Weekly Prize",
    poolPercent: 0.10,
    topWinners: 5,
    splits: [0.35, 0.25, 0.20, 0.12, 0.08],
    icon: Calendar,
    gradient: "from-emerald-500 to-green-500",
    border: "border-emerald-500/30",
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    frequency: "Every Sunday",
    annualMultiplier: 52,
  },
  monthly: {
    title: "Monthly Prize",
    poolPercent: 0.35,
    topWinners: 5,
    splits: [0.40, 0.25, 0.15, 0.12, 0.08],
    icon: Target,
    gradient: "from-purple-500 to-violet-500",
    border: "border-purple-500/30",
    accent: "text-purple-400",
    bg: "bg-purple-500/10",
    frequency: "End of Month",
    annualMultiplier: 12,
  },
  annual: {
    title: "Annual Grand Prize",
    poolPercent: 0.50,
    topWinners: 10,
    splits: [0.30, 0.20, 0.15, 0.10, 0.08, 0.05, 0.04, 0.03, 0.03, 0.02],
    icon: Trophy,
    gradient: "from-yellow-500 to-orange-500",
    border: "border-yellow-500/30",
    accent: "text-yellow-400",
    bg: "bg-yellow-500/10",
    frequency: "Year End",
    annualMultiplier: 1,
  },
};

type Period = keyof typeof periodConfig;

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function TieBreakdownTable({ period, poolForPeriod }: { period: Period; poolForPeriod: number }) {
  const config = periodConfig[period];
  const Icon = config.icon;
  const [expanded, setExpanded] = useState(false);

  const tieScenarios = useMemo(() => {
    const scenarios: { tiedWinners: number; payouts: number[] }[] = [];

    scenarios.push({
      tiedWinners: 1,
      payouts: config.splits.map((s) => poolForPeriod * s),
    });

    for (let tied = 2; tied <= 10; tied++) {
      const tiedPool = config.splits.slice(0, Math.min(tied, config.splits.length)).reduce((a, b) => a + b, 0) * poolForPeriod;
      const perPerson = tiedPool / tied;
      const remaining = config.splits.slice(tied).map((s) => poolForPeriod * s);
      const payouts: number[] = [];
      for (let i = 0; i < tied; i++) payouts.push(perPerson);
      payouts.push(...remaining);
      scenarios.push({ tiedWinners: tied, payouts });
    }

    return scenarios;
  }, [poolForPeriod, config.splits]);

  const displayScenarios = expanded ? tieScenarios : tieScenarios.slice(0, 4);

  return (
    <Card className={cn("border overflow-hidden", config.border)} data-testid={`card-probability-${period}`}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-5", config.gradient)} />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg", config.gradient)}>
              <Icon size={20} className="text-white" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">{config.title}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {config.frequency}
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", config.accent, config.border)}>
                  Top {config.topWinners} paid
                </Badge>
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <div className={cn("text-2xl font-mono font-black", config.accent)}>
              ${poolForPeriod.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-[10px] text-muted-foreground">{(config.poolPercent * 100).toFixed(0)}% of pool</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Scenario</th>
                {Array.from({ length: Math.min(config.topWinners, 5) }, (_, i) => (
                  <th key={i} className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">
                    {ordinal(i + 1)}
                  </th>
                ))}
                {config.topWinners > 5 && (
                  <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Others</th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayScenarios.map((scenario) => {
                const isSingle = scenario.tiedWinners === 1;
                return (
                  <tr
                    key={scenario.tiedWinners}
                    className={cn(
                      "border-b border-white/5 transition-colors",
                      isSingle ? cn(config.bg, "font-medium") : "hover:bg-white/[0.03]"
                    )}
                  >
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        {isSingle ? (
                          <Crown size={14} className={config.accent} />
                        ) : (
                          <Divide size={14} className="text-muted-foreground" />
                        )}
                        <span className={cn("text-xs", isSingle ? "font-bold" : "text-muted-foreground")}>
                          {isSingle ? "Solo Winner" : `${scenario.tiedWinners}-Way Tie`}
                        </span>
                      </div>
                    </td>
                    {Array.from({ length: Math.min(config.topWinners, 5) }, (_, i) => {
                      const payout = scenario.payouts[i] || 0;
                      const isTied = i < scenario.tiedWinners;
                      return (
                        <td key={i} className="text-right py-2.5 px-2">
                          <span className={cn(
                            "font-mono text-xs",
                            isTied && scenario.tiedWinners > 1 ? "text-yellow-400 font-bold" :
                            isSingle && i === 0 ? cn(config.accent, "font-bold") :
                            "text-foreground"
                          )}>
                            ${payout.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </td>
                      );
                    })}
                    {config.topWinners > 5 && (
                      <td className="text-right py-2.5 px-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          ${scenario.payouts.slice(5).reduce((a, b) => a + b, 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tieScenarios.length > 4 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
            data-testid={`button-expand-${period}`}
          >
            {expanded ? "Show Less" : `Show All Tie Scenarios (up to 10-way)`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function WinnersProbability() {
  const monthlyRevenue = useMemo(() => {
    const rookieRev = MEMBER_COUNT * tierDistribution.rookie * tierPrices.rookie;
    const proRev = MEMBER_COUNT * tierDistribution.pro * tierPrices.pro;
    const legendRev = MEMBER_COUNT * tierDistribution.legend * tierPrices.legend;
    return rookieRev + proRev + legendRev;
  }, []);

  const monthlyPool = monthlyRevenue * 0.5;
  const annualPool = monthlyPool * 12;

  const poolForPeriod = useMemo(() => ({
    daily: (monthlyPool * periodConfig.daily.poolPercent),
    weekly: (monthlyPool * periodConfig.weekly.poolPercent),
    monthly: (monthlyPool * periodConfig.monthly.poolPercent),
    annual: (annualPool * periodConfig.annual.poolPercent),
  }), [monthlyPool, annualPool]);

  const periods: Period[] = ["daily", "weekly", "monthly", "annual"];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="container mx-auto px-4 pt-24 pb-12">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-4">
            <Calculator size={14} /> Probability Estimator
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-3" data-testid="text-probability-title">
            Winners Probability
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Hypothetical prize pool estimates based on{" "}
            <span className="text-primary font-bold">{MEMBER_COUNT.toLocaleString()} monthly members</span>.
            See how payouts split when winners tie — from a solo champion to a 10-way split.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 max-w-4xl mx-auto">
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4 text-center">
              <Users size={20} className="text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono text-primary" data-testid="text-member-count">{MEMBER_COUNT.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Members</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4 text-center">
              <DollarSign size={20} className="text-emerald-400 mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono text-emerald-400" data-testid="text-monthly-revenue">${monthlyRevenue.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Revenue</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4 text-center">
              <Trophy size={20} className="text-yellow-400 mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono text-yellow-400" data-testid="text-monthly-pool">${monthlyPool.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Pool (50%)</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4 text-center">
              <Sparkles size={20} className="text-purple-400 mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono text-purple-400" data-testid="text-annual-pool">${annualPool.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Annual Pool</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/20 border-white/5 mb-10 max-w-4xl mx-auto">
          <CardContent className="p-5">
            <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" /> Revenue Breakdown (Estimated)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {(Object.entries(tierDistribution) as [keyof typeof tierDistribution, number][]).map(([tier, pct]) => {
                const count = Math.round(MEMBER_COUNT * pct);
                const revenue = count * tierPrices[tier];
                const colors = { rookie: "text-blue-400", pro: "text-primary", legend: "text-purple-400" };
                return (
                  <div key={tier} className="text-center p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <div className={cn("text-xs font-bold uppercase tracking-wider mb-1", colors[tier])}>
                      {tier}
                    </div>
                    <div className="text-lg font-mono font-bold">{count}</div>
                    <div className="text-[10px] text-muted-foreground">
                      @ ${tierPrices[tier]}/mo = <span className={cn("font-bold", colors[tier])}>${revenue.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-8 max-w-4xl mx-auto">
          {periods.map((period) => (
            <TieBreakdownTable key={period} period={period} poolForPeriod={poolForPeriod[period]} />
          ))}
        </div>

        <Card className="bg-card/20 border-white/5 max-w-4xl mx-auto mt-10">
          <CardContent className="p-6">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-primary" /> How Tie-Splitting Works
            </h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                When multiple members finish a period with the same top record, the prize money for those positions is combined and split evenly among the tied winners.
              </p>
              <p>
                <strong className="text-foreground">Example:</strong> If 3 members tie for 1st place in the Daily prize, the 1st, 2nd, and 3rd place prize money is pooled together and divided equally by 3. Any remaining positions shift down accordingly.
              </p>
              <p>
                <strong className="text-foreground">50% to the Pool:</strong> Half of all membership revenue goes directly into the prize pool. With {MEMBER_COUNT.toLocaleString()} members, that's approximately <span className="text-primary font-mono font-bold">${monthlyPool.toLocaleString()}</span> per month.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <Link href="/winners">
                <Button variant="outline" className="gap-2" data-testid="button-view-winners">
                  <Trophy size={14} /> View Current Winners
                </Button>
              </Link>
              <Link href="/membership">
                <Button className="bg-primary text-primary-foreground gap-2" data-testid="button-join-now">
                  <Users size={14} /> Join Now
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      <AdBannerInline />
    </div>
  );
}
