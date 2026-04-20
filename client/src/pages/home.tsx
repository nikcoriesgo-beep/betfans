import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/home/Hero";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, DollarSign, Users, TrendingUp, Share2, Trophy, Zap, LogIn } from "lucide-react";
import { AdBannerTop, AdBannerInline, AdMarquee } from "@/components/AdBanner";
import { QuickShareButton } from "@/components/SharePicksCard";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

function CaptureReferralCode() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref") || params.get("code");
    if (refCode) {
      localStorage.setItem("betfans_affiliate_code", refCode);
    }
  }, []);
  return null;
}

function timeAgo(date: string | Date | null): string {
  if (!date) return "recently";
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const TIER_STYLES: Record<string, string> = {
  rookie: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  pro: "text-purple-400 border-purple-400/40 bg-purple-400/10",
  legend: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
};

function LiveMemberFeed() {
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ["/api/members/recent"],
    queryFn: async () => {
      const res = await fetch("/api/members/recent");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (members.length <= 1) return;
    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % members.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [members.length]);

  if (!members.length) return null;

  const m = members[current];
  const name = m.firstName
    ? `${m.firstName}${m.lastName ? " " + m.lastName[0] + "." : ""}`
    : "New Member";
  const tier = m.membershipTier || "rookie";
  const tierStyle = TIER_STYLES[tier] || TIER_STYLES.rookie;

  return (
    <section className="py-3 bg-primary/5 border-y border-primary/10">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1">
              <Zap size={10} /> Live Members
            </span>
          </div>
          <div className="w-px h-4 bg-white/10 shrink-0" />
          <div
            className="flex items-center gap-2"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.35s ease" }}
            data-testid="live-member-feed-item"
          >
            <span className="text-sm font-semibold text-white">{name}</span>
            <span className={`text-xs border rounded-full px-2 py-0.5 font-bold capitalize ${tierStyle}`}>
              {tier}
            </span>
            <span className="text-xs text-muted-foreground">joined {timeAgo(m.createdAt)}</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block" data-testid="live-member-feed-count">
            {members.length} active member{members.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </section>
  );
}

function AnimatedCounter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) return;
    const duration = 1500;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span>{prefix}{display.toLocaleString()}</span>;
}

export default function Home() {
  const { user, isLoading: authLoading } = useAuth();
  const homeTierRank: Record<string, number> = { rookie: 1, pro: 2, legend: 3 };
  const homeCurrentTier = user?.membershipTier || "free";
  const homeCurrentRank = homeTierRank[homeCurrentTier] || 0;
  const homePlanLabel = (planName: string) => {
    const rank = homeTierRank[planName.toLowerCase()] || 0;
    if (!user) return "Get Started";
    if (homeCurrentRank === rank) return "Current Plan";
    if (homeCurrentRank > rank) return `${planName} Plan`;
    return `Upgrade to ${planName}`;
  };
  const homePlanDisabled = (planName: string) => {
    const rank = homeTierRank[planName.toLowerCase()] || 0;
    return homeCurrentRank >= rank;
  };
  const { data: memberData } = useQuery({
    queryKey: ["/api/member-count"],
    queryFn: async () => {
      const res = await fetch("/api/member-count");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: prizePoolData } = useQuery({
    queryKey: ["/api/prize-pool"],
    queryFn: async () => {
      const res = await fetch("/api/prize-pool");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const memberCount = memberData?.count || 0;
  const prizePool = prizePoolData?.amount || 0;

  return (
    <div className="min-h-screen bg-background">
      <CaptureReferralCode />
      <Navbar />
      {!user && (
        <Link href="/auth" data-testid="login-banner" className="block mt-16 bg-primary text-primary-foreground py-4 px-4 flex items-center justify-center gap-3 hover:bg-primary/90 transition-colors cursor-pointer">
          <span className="text-base font-bold tracking-wide font-display">Already a member?</span>
          <span className="flex items-center gap-1.5 bg-black/25 text-white font-bold text-sm px-5 py-2 rounded-full">
            <LogIn size={15} /> Log In Now
          </span>
        </Link>
      )}
      <Hero />
      <LiveMemberFeed />
      <AdBannerTop />

      {/* Live Stats Bar */}
      <section className="py-6 border-y border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            <div className="flex items-center gap-3" data-testid="stat-member-count">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Users size={22} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-display font-bold text-primary">
                  <AnimatedCounter value={memberCount} />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Active Members</div>
              </div>
            </div>
            <div className="w-px h-12 bg-white/10 hidden md:block" />
            <div className="flex items-center gap-3" data-testid="stat-prize-pool">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                <Trophy size={22} className="text-yellow-500" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-display font-bold text-yellow-500">
                  <AnimatedCounter value={prizePool} prefix="$" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Prize Pool</div>
              </div>
            </div>
            <div className="w-px h-12 bg-white/10 hidden md:block" />
            <div className="flex items-center gap-3">
              <div className="relative flex items-center">
                <span className="absolute inline-flex h-3 w-3 rounded-full bg-primary opacity-75 animate-ping"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
              </div>
              <span className="text-sm text-muted-foreground">Live & Growing</span>
            </div>
          </div>
        </div>
      </section>

      {/* Ad Unit — below prize pool */}
      <div className="w-full flex justify-center py-4 bg-black/10" id="betfans-ad-slot" />

      {/* Sneak Peek Section */}
      <section className="py-20 bg-black/20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Live Rankings</h2>
              <p className="text-muted-foreground max-w-xl">
                See who's dominating the charts today. Our real-time leaderboard tracks every verified prediction across all major leagues.
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline" className="gap-2">
                View Full Leaderboard <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
          
          <Leaderboard />
        </div>
      </section>

      <AdMarquee />

      {/* Pricing Teaser */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">Choose Your Edge</h2>

          {/* Instant Payout Highlight Banner */}
          <div className="max-w-3xl mx-auto mb-10 rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 p-4 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(34,197,94,0.2)]" data-testid="banner-instant-payout">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(34,197,94,0.5)]">
              <Zap size={20} className="text-black" />
            </div>
            <div className="text-left">
              <p className="font-display font-black text-primary text-lg leading-tight">INSTANT PAYOUTS on Every Referral</p>
              <p className="text-sm text-muted-foreground">Get paid the moment someone joins with your code — plus monthly residual income forever</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: "Rookie", price: "$19/mo", instant: "$5 Instant", residual: "+ $5/mo Per Referral", features: ["Basic Stats", "Daily Leaderboard", "Follow 5 Pros"] },
              { name: "Pro", price: "$29/mo", instant: "$10 Instant", residual: "+ $10/mo Per Referral", features: ["Advanced Analytics", "Unlimited Following", "API Access", "Pro Badge"] },
              { name: "Legend", price: "$99/mo", instant: "$50 Instant", residual: "+ $50/mo Per Referral", features: ["Spider AI Picks", "Private Discord", "White-label Reports", "Legend Badge"], highlight: true },
            ].map((plan, i) => (
              <div key={i} className={`p-8 rounded-2xl border ${plan.highlight ? 'bg-yellow-500/5 border-yellow-500/50 relative overflow-hidden transform md:-translate-y-4 transition-transform shadow-[0_0_30px_rgba(234,179,8,0.15)]' : 'bg-card/30 border-white/5'} flex flex-col`}>
                {plan.highlight && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold font-display mb-2">{plan.name}</h3>
                <div className="text-4xl font-bold mb-4">{plan.price}</div>
                <div className={`rounded-xl px-3 py-2.5 mb-5 border flex flex-col gap-1 ${plan.highlight ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-primary/10 border-primary/20'}`}>
                  <div className={`flex items-center gap-2 text-sm font-black ${plan.highlight ? 'text-yellow-300' : 'text-primary'}`}>
                    <Zap size={13} className="shrink-0" />
                    {plan.instant} — paid immediately
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Check size={11} className="shrink-0" />
                    {plan.residual}
                  </div>
                </div>
                <ul className="space-y-4 mb-8 flex-1 text-left">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Check size={12} />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/membership">
                  <Button
                    className={plan.highlight && !homePlanDisabled(plan.name) ? "w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 font-bold" : "w-full"}
                    variant={plan.highlight && !homePlanDisabled(plan.name) ? "default" : "outline"}
                    disabled={homePlanDisabled(plan.name)}
                  >
                    {homePlanLabel(plan.name)}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 border-t border-white/5 bg-gradient-to-b from-transparent to-primary/5">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <span className="inline-block py-1 px-3 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4 border border-primary/20">
              Affiliate Program
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4" data-testid="text-affiliate-heading">
              Earn <span className="text-primary">$5–$50/Month</span> For Every Member You Refer
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              No caps. No limits. Every tier earns an instant payout the moment someone signs up with your code, plus monthly residual income — Rookie $5/mo, Pro $10/mo, Legend $50/mo.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
            {[
              { icon: Share2, value: "Share", label: "Your unique referral link", desc: "Every member gets a personal affiliate code to share" },
              { icon: Users, value: "Grow", label: "Build your network", desc: "Refer friends, followers, and sports fans" },
              { icon: DollarSign, value: "Earn", label: "$5–$50/mo per active member", desc: "Residual income based on your tier — as long as they stay subscribed" },
            ].map((item, i) => (
              <div key={i} className="text-center p-6 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
                  <item.icon size={24} />
                </div>
                <h3 className="text-2xl font-display font-bold text-primary mb-1" data-testid={`text-affiliate-step-${i}`}>{item.value}</h3>
                <p className="text-sm font-medium mb-1">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/referrals">
              <Button size="lg" className="gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)]" data-testid="button-join-affiliate">
                Join Affiliate Program <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/referrals">
              <Button size="lg" variant="outline" className="gap-2 border-white/10" data-testid="button-view-residual">
                <TrendingUp size={16} /> View Residual Income Leaderboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <AdBannerInline />

      <footer className="py-12 border-t border-white/5 bg-black/40">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start gap-2">
              <p className="text-muted-foreground text-sm">&copy; 2026 BetFans. All rights reserved.</p>
              <a href="mailto:nikcox@betfans.us" className="text-sm text-primary hover:text-primary/80 transition-colors" data-testid="link-contact-email">
                nikcox@betfans.us
              </a>
              <p className="text-xs text-muted-foreground">For all inquiries</p>
            </div>
            <div className="flex items-center gap-4">
              <QuickShareButton text="Join BetFans — the sports prediction platform where you predict, compete, win, and earn residual income!" className="text-xs" />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Link href="/membership"><span className="hover:text-primary cursor-pointer">Membership</span></Link>
                <Link href="/referrals"><span className="hover:text-primary cursor-pointer">Affiliate Program</span></Link>
                <Link href="/referrals"><span className="hover:text-primary cursor-pointer">Residual Income</span></Link>
                <a href="mailto:nikcox@betfans.us" className="hover:text-primary cursor-pointer">Contact</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
