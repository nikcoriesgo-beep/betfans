import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  TrendingUp, DollarSign, Users, Zap, Crown, Star, Award,
  ArrowRight, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const TIERS = [
  {
    key: "rookie",
    label: "Rookie",
    price: 19,
    commission: 5,
    color: "text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    gradient: "from-blue-500 to-cyan-500",
    icon: Award,
    maxSlider: 200,
  },
  {
    key: "pro",
    label: "Pro",
    price: 29,
    commission: 10,
    color: "text-primary",
    border: "border-primary/30",
    bg: "bg-primary/10",
    gradient: "from-primary to-emerald-500",
    icon: Star,
    maxSlider: 100,
  },
  {
    key: "legend",
    label: "Legend",
    price: 99,
    commission: 50,
    color: "text-purple-400",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10",
    gradient: "from-purple-500 to-violet-500",
    icon: Crown,
    maxSlider: 50,
  },
] as const;

const MILESTONES = [5, 10, 25, 50, 100, 250, 500];

function fmt(n: number) {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toLocaleString();
}

export default function ResidualIncomeEstimator() {
  const [counts, setCounts] = useState<Record<string, number>>({
    rookie: 10,
    pro: 5,
    legend: 2,
  });

  const monthly = useMemo(() =>
    TIERS.reduce((sum, t) => sum + (counts[t.key] || 0) * t.commission, 0),
    [counts]
  );
  const annual = monthly * 12;
  const totalReferrals = Object.values(counts).reduce((a, b) => a + b, 0);

  const incomeLevel = useMemo(() => {
    if (annual >= 100000) return { label: "7-Figure Track", color: "text-yellow-400" };
    if (annual >= 50000) return { label: "Six Figures", color: "text-purple-400" };
    if (annual >= 24000) return { label: "Full-Time Income", color: "text-primary" };
    if (annual >= 12000) return { label: "Part-Time Income", color: "text-blue-400" };
    if (annual >= 3000) return { label: "Side Income", color: "text-emerald-400" };
    return { label: "Getting Started", color: "text-muted-foreground" };
  }, [annual]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="container mx-auto px-4 pt-24 pb-16 max-w-4xl">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-4">
            <TrendingUp size={14} /> Residual Income Estimator
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-3" data-testid="text-estimator-title">
            Build Residual Income
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every member you refer pays you every month — automatically. Adjust the sliders below to see what your monthly and annual residual income looks like.
          </p>
        </div>

        <Card className="bg-gradient-to-br from-primary/10 via-card/60 to-purple-900/20 border border-primary/20 mb-8">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Your Projected Income</p>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <span className="text-5xl md:text-6xl font-display font-black text-primary" data-testid="text-monthly-income">
                      {fmt(monthly)}
                    </span>
                    <span className="text-muted-foreground text-sm ml-2">/month</span>
                  </div>
                  <div className="mb-1">
                    <span className="text-2xl font-display font-bold text-white/60" data-testid="text-annual-income">
                      {fmt(annual)}
                    </span>
                    <span className="text-muted-foreground text-xs ml-1">/year</span>
                  </div>
                </div>
                <Badge className={cn("mt-2 font-medium", incomeLevel.color, "bg-white/5 border-white/10")}>
                  <ChevronUp size={12} className="mr-1" />{incomeLevel.label}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 shrink-0">
                {TIERS.map(t => (
                  <div key={t.key} className={cn("text-center p-3 rounded-xl border", t.bg, t.border)}>
                    <div className={cn("text-xs font-bold uppercase tracking-wider mb-0.5", t.color)}>{t.label}</div>
                    <div className="text-xl font-mono font-black">{counts[t.key] || 0}</div>
                    <div className="text-[10px] text-muted-foreground">referrals</div>
                    <div className={cn("text-xs font-bold mt-0.5", t.color)}>
                      {fmt((counts[t.key] || 0) * t.commission)}/mo
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5 mb-10">
          {TIERS.map(t => {
            const Icon = t.icon;
            const tierMonthly = (counts[t.key] || 0) * t.commission;
            const tierAnnual = tierMonthly * 12;
            return (
              <Card key={t.key} className={cn("border overflow-hidden", t.border)} data-testid={`card-tier-${t.key}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg", t.gradient)}>
                        <Icon size={18} className="text-white" />
                      </div>
                      <div>
                        <div className={cn("font-display font-bold text-base", t.color)}>{t.label} Members</div>
                        <div className="text-[11px] text-muted-foreground">${t.price}/mo · you earn <span className={cn("font-bold", t.color)}>${t.commission}/mo</span> per referral</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-xl font-mono font-black", t.color)}>{fmt(tierMonthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                      <div className="text-[11px] text-muted-foreground">{fmt(tierAnnual)}/yr</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Slider
                        min={0}
                        max={t.maxSlider}
                        step={1}
                        value={[counts[t.key] || 0]}
                        onValueChange={([v]) => setCounts(prev => ({ ...prev, [t.key]: v }))}
                        className="w-full"
                        data-testid={`slider-${t.key}`}
                      />
                      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground/50">
                        <span>0</span>
                        <span>{t.maxSlider / 4}</span>
                        <span>{t.maxSlider / 2}</span>
                        <span>{t.maxSlider * 3 / 4}</span>
                        <span>{t.maxSlider}</span>
                      </div>
                    </div>
                    <div className={cn("w-14 text-center py-1.5 rounded-lg font-mono font-bold text-lg shrink-0", t.bg, t.color)}>
                      {counts[t.key] || 0}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="bg-card/20 border-white/5 mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base flex items-center gap-2">
              <Zap size={16} className="text-primary" /> Milestone Projections
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Referrals</th>
                  <th className="text-right py-2 px-2 text-xs text-blue-400 font-medium">Rookie $5</th>
                  <th className="text-right py-2 px-2 text-xs text-primary font-medium">Pro $10</th>
                  <th className="text-right py-2 px-2 text-xs text-purple-400 font-medium">Legend $50</th>
                  <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Annual</th>
                </tr>
              </thead>
              <tbody>
                {MILESTONES.map(n => {
                  const rookieMo = n * 5, proMo = n * 10, legendMo = n * 50;
                  const isActive = totalReferrals > 0 && n === MILESTONES.reduce((best, m) => m <= totalReferrals ? m : best, 0);
                  return (
                    <tr key={n} className={cn("border-b border-white/5 transition-colors", isActive ? "bg-primary/5" : "hover:bg-white/[0.02]")} data-testid={`row-milestone-${n}`}>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          {isActive && <Zap size={12} className="text-primary" />}
                          <span className={cn("font-mono font-bold text-xs", isActive ? "text-primary" : "text-foreground")}>{n} each</span>
                          <span className="text-[10px] text-muted-foreground">= {n * 3} total</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-2 font-mono text-xs text-blue-400">{fmt(rookieMo)}/mo</td>
                      <td className="text-right py-2.5 px-2 font-mono text-xs text-primary">{fmt(proMo)}/mo</td>
                      <td className="text-right py-2.5 px-2 font-mono text-xs text-purple-400">{fmt(legendMo)}/mo</td>
                      <td className="text-right py-2.5 px-2 font-mono text-xs font-bold text-white">
                        {fmt((rookieMo + proMo + legendMo) * 12)}/yr
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="bg-card/20 border-white/5 mb-8">
          <CardContent className="p-5">
            <h3 className="font-display font-bold text-base mb-4 flex items-center gap-2">
              <DollarSign size={16} className="text-primary" /> How It Works
            </h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <p>Share your unique referral link. When someone signs up and subscribes through your link, they become your referral.</p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <p>Every month they renew, you earn your commission automatically — <span className="text-blue-400 font-medium">$5 (Rookie)</span>, <span className="text-primary font-medium">$10 (Pro)</span>, or <span className="text-purple-400 font-medium">$50 (Legend)</span> — deposited directly to your account.</p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                <p>Residual income stacks. Build your referral base once and collect month after month, year after year — regardless of whether you win picks that day.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/referrals">
            <Button className="bg-primary text-primary-foreground gap-2 px-8" data-testid="button-start-referring">
              <Users size={14} /> Start Referring Now
              <ArrowRight size={14} />
            </Button>
          </Link>
          <Link href="/membership">
            <Button variant="outline" className="gap-2 px-8 border-white/10" data-testid="button-upgrade">
              <Crown size={14} /> Upgrade Your Tier
            </Button>
          </Link>
        </div>

      </div>
      <AdBannerInline />
    </div>
  );
}
