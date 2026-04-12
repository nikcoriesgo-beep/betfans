import { Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import {
  Trophy, Target, DollarSign, Users, Zap, Star, Crown, Flame,
  ArrowRight, TrendingUp, Shield, Sparkles, CheckCircle2, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

function SignupCTA({ variant = "default" }: { variant?: "default" | "accent" | "subtle" }) {
  return (
    <div className={cn(
      "rounded-2xl p-6 md:p-8 text-center my-8",
      variant === "accent"
        ? "bg-primary/10 border border-primary/30"
        : variant === "subtle"
        ? "bg-white/5 border border-white/10"
        : "bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20"
    )}>
      <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Ready to Win?</p>
      <h3 className="text-2xl md:text-3xl font-display font-black text-foreground mb-3">
        Join BetFans Now
      </h3>
      <p className="text-muted-foreground text-sm mb-5 max-w-sm mx-auto">
        Start making picks, climb the leaderboard, and win real cash prizes. Memberships start at just $19/month.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
        <Link href="/membership">
          <Button
            size="lg"
            className="gap-2 shadow-[0_0_30px_rgba(34,197,94,0.35)] px-8"
            data-testid="button-cta-join"
          >
            Choose Your Plan <ArrowRight size={18} />
          </Button>
        </Link>
        <Link href="/auth">
          <Button size="lg" variant="outline" className="gap-2 px-8" data-testid="button-cta-signin">
            Already a Member? Sign In
          </Button>
        </Link>
      </div>
    </div>
  );
}

function SectionBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-white/5 text-muted-foreground border border-white/10 mb-4">
      {label}
    </div>
  );
}

const TIERS = [
  {
    name: "Rookie",
    price: "$19",
    color: "text-blue-400",
    border: "border-blue-400/30",
    bg: "bg-blue-400/5",
    perks: ["Access to all Spider AI picks", "Daily & annual leaderboard", "Prize pool eligible", "$5 instant payout per referral", "$5/mo residual income per referral"],
  },
  {
    name: "Pro",
    price: "$29",
    color: "text-purple-400",
    border: "border-purple-400/40",
    bg: "bg-purple-400/10",
    badge: "Most Popular",
    perks: ["Everything in Rookie", "Pro-locked premium picks", "Pro leaderboard status", "$10 instant payout per referral", "$10/mo residual income per referral"],
  },
  {
    name: "Legend",
    price: "$99",
    color: "text-yellow-400",
    border: "border-yellow-400/40",
    bg: "bg-yellow-400/10",
    perks: ["Everything in Pro", "Max prize pool share", "Legend badge + status", "$50 instant payout per referral", "$50/mo residual income per referral"],
  },
];

export default function HowToPlay() {
  const { user } = useAuth();
  const currentTier = user?.membershipTier || "free";
  const tierRank: Record<string, number> = { rookie: 1, pro: 2, legend: 3 };
  const currentRank = tierRank[currentTier] || 0;

  const upgradeLabel = (tierName: string) => {
    const name = tierName.toLowerCase();
    const rank = tierRank[name] || 0;
    if (currentRank === 0) return `Get ${tierName}`;
    if (currentRank === rank) return "Current Plan";
    if (currentRank > rank) return `${tierName} Plan`;
    return `Upgrade to ${tierName}`;
  };

  const upgradeDisabled = (tierName: string) => {
    const rank = tierRank[tierName.toLowerCase()] || 0;
    return currentRank >= rank;
  };

  const nextUpgrade = currentTier === "rookie" ? "pro" : currentTier === "pro" ? "legend" : null;
  const nextUpgradeLabel = nextUpgrade === "pro" ? "Upgrade to Pro — $29/mo" : nextUpgrade === "legend" ? "Upgrade to Legend — $99/mo" : null;
  const nextUpgradePriceHref = "/membership";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-20">

        {/* Hero */}
        <section className="container mx-auto px-4 text-center max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-bold uppercase tracking-widest mb-6">
            <Zap size={14} /> How To Play
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-black leading-[0.92] mb-6">
            <span className="bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Predict.
            </span>
            <br />
            Win.{" "}
            <span className="bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Get Paid.
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            BetFans is a membership-based sports prediction platform. Make daily picks on real games, compete on the leaderboard, and win cash from the live prize pool.
          </p>
          {!user ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/membership">
                <Button
                  size="lg"
                  className="gap-2 shadow-[0_0_40px_rgba(34,197,94,0.4)] px-10 text-lg"
                  data-testid="button-hero-join"
                >
                  Join BetFans <ArrowRight size={20} />
                </Button>
              </Link>
              <Link href="/auth">
                <Button size="lg" variant="outline" className="gap-2 px-10 text-lg" data-testid="button-hero-signin">
                  Sign In
                </Button>
              </Link>
            </div>
          ) : nextUpgrade && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={nextUpgradePriceHref}>
                <Button
                  size="lg"
                  className={`gap-2 px-10 text-lg ${nextUpgrade === "legend" ? "bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.3)]" : "shadow-[0_0_40px_rgba(34,197,94,0.4)]"}`}
                  data-testid="button-hero-upgrade"
                >
                  {nextUpgradeLabel} <ArrowRight size={20} />
                </Button>
              </Link>
            </div>
          )}
        </section>

        <div className="container mx-auto px-4 max-w-3xl">

          {/* Step 1 */}
          <section className="mb-16">
            <SectionBadge label="Step 1" />
            <div className="flex items-start gap-5 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
                <Target size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-black mb-2">Pick Your Sport</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Choose from 8 leagues including NBA, NHL, MLB, MLS, NCAAB, NFL, and more. Spider AI analyzes every matchup and delivers confidence-rated predictions directly to your dashboard.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["NBA", "NHL & MLB", "MLS", "NCAAB & NFL"].map((sport) => (
                <div
                  key={sport}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium"
                >
                  <Sparkles size={13} className="text-primary shrink-0" />
                  {sport}
                </div>
              ))}
            </div>
          </section>

          {/* Step 2 */}
          <section className="mb-16">
            <SectionBadge label="Step 2" />
            <div className="flex items-start gap-5 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0 shadow-lg">
                <Flame size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-black mb-2">Make Your Prediction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Use Spider AI's picks or trust your own instincts. Every correct prediction earns you points and moves you up the leaderboard. Choose from Spreads, Moneylines, and Over/Unders.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-5 space-y-3">
              {[
                { label: "Spider AI Picks", desc: "AI-powered predictions with confidence ratings on every game" },
                { label: "Pro-Locked Picks", desc: "Exclusive high-confidence picks reserved for Pro and Legend members" },
                { label: "Real-Time Lines", desc: "Live odds updated throughout the day so you're never behind" },
              ].map(({ label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-foreground">{label}</span>
                    <span className="text-muted-foreground text-sm"> — {desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Step 3 */}
          <section className="mb-16">
            <SectionBadge label="Step 3" />
            <div className="flex items-start gap-5 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg">
                <TrendingUp size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-black mb-2">Climb The Leaderboard</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Two leaderboards run simultaneously — Daily and Annual. Build streaks, rack up wins, and watch your name rise. The more you predict, the more chances you have to claim the top spot.
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  title: "Daily Leaderboard",
                  desc: "Resets each day. Yesterday's picks count — perfect for consistent daily players.",
                  icon: Zap,
                  gradient: "from-emerald-500 to-teal-500",
                },
                {
                  title: "Annual Leaderboard",
                  desc: "The full-season championship. The best predictor all year takes home the grand prize.",
                  icon: Trophy,
                  gradient: "from-yellow-400 to-amber-500",
                },
              ].map(({ title, desc, icon: Icon, gradient }) => (
                <div key={title} className="rounded-xl bg-white/5 border border-white/10 p-5">
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 shadow", gradient)}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <SignupCTA variant="accent" />

          {/* Step 4 — Prize Pool */}
          <section className="mb-16">
            <SectionBadge label="Step 4" />
            <div className="flex items-start gap-5 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg">
                <DollarSign size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-black mb-2">Win Real Cash</h2>
                <p className="text-muted-foreground leading-relaxed">
                  50% of all membership fees go directly into the live prize pool. Payouts go straight back to the card you signed up with — no manual withdrawal needed.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 p-5 mb-4">
              <p className="text-sm font-black text-yellow-300 uppercase tracking-wide mb-3">To Qualify For The Prize Pool:</p>
              <ul className="space-y-2 text-sm text-yellow-100/90">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                  <span><strong className="text-yellow-200">Pick every MLB game</strong> each day — MLB picks only count toward the prize pool</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                  <span><strong className="text-yellow-200">No exceptions</strong> — miss one game and you're disqualified from that day's payout</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                  <span><strong className="text-yellow-200">Auto payouts</strong> — winnings are paid directly to your original payment method</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-yellow-300/50">* All members must predict over 2,000 MLB games to qualify for the annual prize pool payout.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { tier: "Rookie", pool: "$14", instant: "$5", color: "text-blue-400", border: "border-blue-400/20" },
                { tier: "Pro", pool: "$19", instant: "$10", color: "text-purple-400", border: "border-purple-400/20" },
                { tier: "Legend", pool: "$49", instant: null, color: "text-yellow-400", border: "border-yellow-400/20" },
              ].map(({ tier, pool, instant, color, border }) => (
                <div key={tier} className={cn("rounded-xl bg-white/5 border p-4 text-center", border)}>
                  <div className={cn("text-xs font-bold uppercase tracking-wide mb-2", color)}>{tier}</div>
                  <div className="text-xl font-display font-black text-foreground">{pool}</div>
                  <div className="text-xs text-muted-foreground mb-1">to prize pool/mo</div>
                  {instant && (
                    <div className="text-xs text-primary font-semibold">+ {instant} instant</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Step 5 — Community */}
          <section className="mb-16">
            <SectionBadge label="Step 5" />
            <div className="flex items-start gap-5 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-lg">
                <Users size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-black mb-2">Join The Community</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Post on member walls, earn badges, and track predictors worldwide on the Member Map. Talk trash. Brag. Compete. This is sports prediction the way it was meant to be.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["Profile Walls", "Member Map", "Community Badges", "Global Rankings"].map((f) => (
                <div key={f} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium">
                  <Star size={13} className="text-primary shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </section>

          <SignupCTA variant="subtle" />

          {/* Membership Tiers */}
          <section className="mb-16">
            <div className="text-center mb-8">
              <SectionBadge label="Membership" />
              <h2 className="text-3xl md:text-4xl font-display font-black mt-2">Choose Your Tier</h2>
              <p className="text-muted-foreground mt-2">All tiers get access to Spider AI picks and the prize pool. No hidden fees.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={cn("rounded-2xl border p-6 relative", tier.bg, tier.border)}
                  data-testid={`card-tier-${tier.name.toLowerCase()}`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest">
                      {tier.badge}
                    </div>
                  )}
                  <div className={cn("text-sm font-bold uppercase tracking-widest mb-1", tier.color)}>{tier.name}</div>
                  <div className="text-3xl font-display font-black text-foreground mb-0.5">{tier.price}<span className="text-base font-normal text-muted-foreground">/mo</span></div>
                  <div className="h-px bg-white/10 my-4" />
                  <ul className="space-y-2">
                    {tier.perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={15} className={cn("mt-0.5 shrink-0", tier.color)} />
                        {perk}
                      </li>
                    ))}
                  </ul>
                  <Link href="/membership" className="block mt-5">
                    <Button
                      className={`w-full gap-2 ${tier.name === "Legend" && !upgradeDisabled(tier.name) ? "bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500" : ""}`}
                      variant={tier.name === "Pro" && !upgradeDisabled(tier.name) ? "default" : "outline"}
                      disabled={upgradeDisabled(tier.name)}
                      data-testid={`button-select-tier-${tier.name.toLowerCase()}`}
                    >
                      {upgradeLabel(tier.name)} <ChevronRight size={16} />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </section>

          {/* Residual Income */}
          <section className="mb-16 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shrink-0">
                <Shield size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-black mb-1">Earn Instant Payouts + Residual Income</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Every member at every tier earns both an instant payout the moment someone joins using their code, plus ongoing monthly residual income for as long as that member stays active.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { tier: "Rookie", instant: "$5", residual: "$5/mo", color: "text-blue-400", border: "border-blue-400/20" },
                { tier: "Pro", instant: "$10", residual: "$10/mo", color: "text-purple-400", border: "border-purple-400/20" },
                { tier: "Legend", instant: "$50", residual: "$50/mo", color: "text-yellow-400", border: "border-yellow-400/20" },
              ].map(({ tier, instant, residual, color, border }) => (
                <div key={tier} className={cn("rounded-xl bg-white/5 border p-4 text-center", border)}>
                  <div className={cn("text-xs font-bold uppercase tracking-wide mb-2", color)}>{tier}</div>
                  <div className="text-sm font-bold text-foreground">{instant} <span className="text-muted-foreground font-normal text-xs">instant</span></div>
                  <div className="text-sm font-bold text-foreground">{residual} <span className="text-muted-foreground font-normal text-xs">residual</span></div>
                </div>
              ))}
            </div>

            {/* Tier rules */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Who Can Refer Who</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Crown size={13} className="text-yellow-400 shrink-0" />
                  <span className="text-yellow-400 font-bold">Legend</span>
                  <span className="text-muted-foreground">can refer</span>
                  <span className="text-white font-medium">Rookie, Pro & Legend</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star size={13} className="text-primary shrink-0" />
                  <span className="text-primary font-bold">Pro</span>
                  <span className="text-muted-foreground">can refer</span>
                  <span className="text-white font-medium">Rookie & Pro only</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground font-bold">Rookie</span>
                  <span className="text-muted-foreground">can refer</span>
                  <span className="text-white font-medium">Rookie only</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/membership">
                <Button size="lg" className="gap-2 w-full sm:w-auto" data-testid="button-cta-residual">
                  {nextUpgrade ? nextUpgradeLabel! : user ? "View Your Plan" : "Start Earning Today"} <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </section>

          {/* Final CTA */}
          <section className="text-center py-10 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/25">
            <Crown size={40} className="text-primary mx-auto mb-4" />
            <h2 className="text-4xl md:text-5xl font-display font-black mb-3">
              {nextUpgrade ? "Ready to Upgrade?" : user ? "You're In — Keep Winning!" : "Start Winning "}
              {!user && <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">Today.</span>}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {nextUpgrade
                ? `You're currently on ${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}. Upgrade now for higher referral payouts, more picks, and bigger prize pool shares.`
                : user
                ? "Keep making picks, climbing the leaderboard, and sharing your code to earn."
                : "Your first pick is waiting. Join thousands of BetFans members making picks, climbing leaderboards, and winning real cash prizes."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/membership">
                <Button
                  size="lg"
                  className={`gap-2 px-10 text-lg ${nextUpgrade === "legend" ? "bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.3)]" : "shadow-[0_0_40px_rgba(34,197,94,0.4)]"}`}
                  data-testid="button-final-join"
                >
                  {nextUpgrade ? nextUpgradeLabel! : user ? "View Membership" : "Join BetFans Now"} <ArrowRight size={20} />
                </Button>
              </Link>
              {!user && (
                <Link href="/auth">
                  <Button size="lg" variant="outline" className="gap-2 px-10 text-lg" data-testid="button-final-signin">
                    Already a Member?
                  </Button>
                </Link>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Questions? Contact us at{" "}
              <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline">nikcox@betfans.us</a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
