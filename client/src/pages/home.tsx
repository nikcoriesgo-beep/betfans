import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/home/Hero";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, DollarSign, Users, TrendingUp, Share2, Trophy, Zap, LogIn, Building2, Crown, Gem, Star } from "lucide-react";
import { AdBannerInline, AdMarquee } from "@/components/AdBanner";
import { QuickShareButton } from "@/components/SharePicksCard";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

function AnnouncementBar() {
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/site-settings"],
    queryFn: () => fetch("/api/site-settings").then(r => r.json()),
    staleTime: 60000,
  });
  const announcements: string[] = settings?.announcements ? JSON.parse(settings.announcements) : [
    "NCAA Division I FBS 2026™ games are optional Skill Play picks. They count toward records and rankings but are not required for Prize Pool qualification.",
    "NFL 2026™ games are optional Skill Play picks. They count toward records and rankings but are not required for Prize Pool qualification.",
    "Premier League 2026™ games are now available as Skill Play picks. They count toward rankings but are not required for Prize Pool qualification.",
  ];
  if (!announcements.length) return null;
  return (
    <div className="w-full bg-primary/10 border-b border-primary/30 px-4 py-2 space-y-1" data-testid="notice-cwbs-rule">
      {announcements.map((text, i) => (
        <div key={i} className="flex items-start justify-center gap-1.5">
          <span className="text-primary font-bold text-[11px] shrink-0 mt-0.5">*</span>
          <p className="text-[11px] text-primary/90 text-center leading-tight">{text}</p>
        </div>
      ))}
    </div>
  );
}

function LiveViewsCounter() {
  const [displayCount, setDisplayCount] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const prevCount = useRef<number | null>(null);
  const hasCounted = useRef(false);

  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/views/home"],
    queryFn: async () => {
      const res = await fetch("/api/views/home");
      return res.json();
    },
    refetchInterval: 15000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!hasCounted.current) {
      hasCounted.current = true;
      fetch("/api/views/home", { method: "POST" })
        .then((r) => r.json())
        .then((d) => {
          if (d?.count !== undefined) {
            prevCount.current = d.count - 1;
            animateTo(d.count);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (data?.count !== undefined && data.count !== prevCount.current) {
      animateTo(data.count);
    }
  }, [data?.count]);

  function animateTo(target: number) {
    const start = prevCount.current ?? Math.max(0, target - 1);
    prevCount.current = target;
    if (start === target) { setDisplayCount(target); return; }
    setAnimating(true);
    const duration = 800;
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * eased);
      setDisplayCount(current);
      if (progress < 1) requestAnimationFrame(tick);
      else { setDisplayCount(target); setAnimating(false); }
    }
    requestAnimationFrame(tick);
  }

  const formatted = displayCount !== null
    ? displayCount.toLocaleString("en-US")
    : "—";

  return (
    <div className="flex flex-col items-center md:items-start gap-1 mt-1" data-testid="live-views-counter">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)] ${animating ? "scale-125" : ""} transition-transform duration-200`} />
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Live Page Views</span>
      </div>
      <span
        className="text-2xl font-bold tabular-nums text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]"
        data-testid="text-view-count"
      >
        {formatted}
      </span>
    </div>
  );
}

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
  const tier = "legend";
  const tierStyle = TIER_STYLES.legend;

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
  const homeTierRank: Record<string, number> = { legend: 1 };
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
        <div className="pt-14">
          <Link href="/auth" data-testid="login-banner" className="block bg-primary text-primary-foreground py-4 px-4 flex items-center justify-center gap-3 hover:bg-primary/90 transition-colors cursor-pointer">
            <span className="text-base font-bold tracking-wide font-display">Already a member?</span>
            <span className="flex items-center gap-1.5 bg-black/25 text-white font-bold text-sm px-5 py-2 rounded-full">
              <LogIn size={15} /> Log In Now
            </span>
          </Link>
        </div>
      )}
      <AnnouncementBar />
      <Hero />
      <LiveMemberFeed />

      {/* Live Stats Bar */}
      <section className="py-6 border-y border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            <div className="flex items-center gap-3" data-testid="stat-prize-pool">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                <Trophy size={22} className="text-yellow-500" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-display font-bold text-yellow-500">
                  <AnimatedCounter value={prizePool} prefix="$" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Prize Pool</div>
                <div className="text-xs text-yellow-400/80 font-semibold mt-0.5">
                  Today's Payout: ${Math.floor(prizePool * 0.10).toLocaleString()}
                </div>
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
              <p className="text-sm text-muted-foreground">Get paid the moment someone joins with your code — $50/month for every active Legend you refer</p>
            </div>
          </div>

          <div className="max-w-md mx-auto">
            <div className="p-8 rounded-2xl border bg-yellow-500/5 border-yellow-500/50 relative overflow-hidden shadow-[0_0_30px_rgba(234,179,8,0.15)] flex flex-col">
              <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                LEGEND ONLY
              </div>
              <h3 className="text-2xl font-bold font-display mb-2 text-center">Legend</h3>
              <div className="text-5xl font-bold mb-4 text-center">$99<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
              <div className="rounded-xl px-3 py-2.5 mb-5 border bg-yellow-500/10 border-yellow-500/30 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-black text-yellow-300">
                  <Zap size={13} className="shrink-0" />
                  $50/mo Per Legend Referral
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Check size={11} className="shrink-0" />
                  Residual income every month they stay active
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1 text-left">
                {["Spider AI Daily Picks", "Prize Pool Eligibility", "Private Discord", "Legend Badge", "1-on-1 Coaching"].map((f, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Check size={12} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/membership">
                <Button className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 font-bold">
                  Join BetFans — $99/mo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Corporate Partnership Section */}
      <section className="py-16 border-t border-yellow-600/20 bg-gradient-to-b from-yellow-900/10 to-transparent">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-bold uppercase tracking-widest border border-yellow-500/20 mb-3">For Businesses</span>
              <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Corporate Partnership</h2>
              <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                Brands and businesses join at $1,200/year — get your own affiliate code, full Legend access, with your investment split between your affiliate, the community prize pool, and corporate profit share.
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-600/40 bg-gradient-to-r from-yellow-900/20 via-card/30 to-yellow-900/20 overflow-hidden shadow-[0_0_40px_rgba(161,109,8,0.1)]">
              {/* Top banner */}
              <div className="bg-gradient-to-r from-yellow-700 via-yellow-600 to-yellow-700 text-black text-center py-2 text-xs font-bold uppercase tracking-widest">
                Annual Partnership · $1,200/yr · Billed Once Per Year
              </div>

              <div className="p-6 md:p-8 grid md:grid-cols-3 gap-6">
                {/* Split breakdown */}
                <div className="md:col-span-1 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Your $1,200 Splits Instantly</p>
                  <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                    <DollarSign size={18} className="text-yellow-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-yellow-400">$600 → Your Affiliate</p>
                      <p className="text-[11px] text-muted-foreground">Instantly to their wallet</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
                    <Trophy size={18} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-primary">$300 → Prize Pool</p>
                      <p className="text-[11px] text-muted-foreground">50/50 corporate prize pool share</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <ArrowRight size={18} className="text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-muted-foreground">$300 → Profit Share</p>
                      <p className="text-[11px] text-muted-foreground">Retained in-house</p>
                    </div>
                  </div>
                </div>

                {/* What you get */}
                <div className="md:col-span-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">What You Get</p>
                  <ul className="space-y-2">
                    {[
                      { icon: DollarSign, label: "Own affiliate code", sub: "Earn residual income on referrals" },
                      { icon: Crown, label: "Full Legend access", sub: "Spider AI, picks, analytics" },
                      { icon: Users, label: "Double prize entries", sub: "Two daily competition entries" },
                      { icon: Building2, label: "Corporate badge", sub: "Brand recognition in community" },
                    ].map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <f.icon size={10} className="text-primary" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">{f.label}</span>
                          <span className="text-muted-foreground"> · {f.sub}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="md:col-span-1 flex flex-col justify-center gap-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold font-display mb-1">$1,200<span className="text-sm font-normal text-muted-foreground">/yr</span></div>
                    <p className="text-xs text-muted-foreground">$100/month equivalent</p>
                  </div>
                  <Link href="/membership">
                    <Button className="w-full bg-gradient-to-r from-yellow-700 to-yellow-600 text-white hover:from-yellow-600 hover:to-yellow-500 font-bold" data-testid="button-corporate-home">
                      <Building2 size={15} className="mr-2" /> Become a Partner
                    </Button>
                  </Link>
                  <a href="mailto:nikcox@betfans.us" className="text-center text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="link-corporate-contact">
                    Questions? nikcox@betfans.us
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Corporate Partnership Section */}
      <section className="py-16 border-t border-purple-600/20 bg-gradient-to-b from-purple-900/10 to-transparent">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold uppercase tracking-widest border border-purple-500/20 mb-3">Premium · For Major Brands</span>
              <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Premium Corporate Partnership</h2>
              <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                Elite brands join at $12,000/year — get your logo displayed on betfans.us, the highest affiliate commissions on the platform, and a massive prize pool contribution that puts your brand at the center of the community.
              </p>
            </div>

            <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-r from-purple-900/20 via-card/30 to-purple-900/20 overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.15)]">
              {/* Top banner */}
              <div className="bg-gradient-to-r from-purple-700 via-purple-500 to-purple-700 text-white text-center py-2 text-xs font-bold uppercase tracking-widest">
                Annual Partnership · $12,000/yr · $6,000 to Affiliate · $3,000 Prize Pool · $3,000 Profit Share
              </div>

              <div className="p-6 md:p-8 grid md:grid-cols-3 gap-6">
                {/* Split breakdown */}
                <div className="md:col-span-1 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Your $12,000 Splits Instantly</p>
                  <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                    <DollarSign size={18} className="text-yellow-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-yellow-400">$6,000 → Your Affiliate</p>
                      <p className="text-[11px] text-muted-foreground">Instantly to their wallet</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
                    <Trophy size={18} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-primary">$3,000 → Prize Pool</p>
                      <p className="text-[11px] text-muted-foreground">50/50 corporate prize pool share</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <ArrowRight size={18} className="text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-muted-foreground">$3,000 → Profit Share</p>
                      <p className="text-[11px] text-muted-foreground">Retained in-house</p>
                    </div>
                  </div>
                </div>

                {/* What you get */}
                <div className="md:col-span-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">What You Get</p>
                  <ul className="space-y-2">
                    {[
                      { icon: Gem, label: "Logo on betfans.us", sub: "Brand visibility across the platform" },
                      { icon: DollarSign, label: "Own affiliate code", sub: "$6,000 commission on referrals" },
                      { icon: Crown, label: "Full Legend access", sub: "Spider AI, picks, analytics" },
                      { icon: Star, label: "Premium partner badge", sub: "Highest status in the community" },
                    ].map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <f.icon size={10} className="text-purple-400" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">{f.label}</span>
                          <span className="text-muted-foreground"> · {f.sub}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="md:col-span-1 flex flex-col justify-center gap-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold font-display mb-1">$12,000<span className="text-sm font-normal text-muted-foreground">/yr</span></div>
                    <p className="text-xs text-muted-foreground">$1,000/month equivalent</p>
                  </div>
                  <Link href="/membership">
                    <Button className="w-full bg-gradient-to-r from-purple-700 to-purple-500 text-white hover:from-purple-600 hover:to-purple-400 font-bold" data-testid="button-premium-corporate-home">
                      <Gem size={15} className="mr-2" /> Become a Premium Partner
                    </Button>
                  </Link>
                  <a href="mailto:nikcox@betfans.us" className="text-center text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="link-premium-corporate-contact">
                    Questions? nikcox@betfans.us
                  </a>
                </div>
              </div>
            </div>
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
              Earn <span className="text-primary">$50/Month</span> For Every Member You Refer
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              No caps. No limits. Every Legend member earns $50/month for every person they refer — as long as they stay subscribed.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
            {[
              { icon: Share2, value: "Share", label: "Your unique referral link", desc: "Every member gets a personal affiliate code to share" },
              { icon: Users, value: "Grow", label: "Build your network", desc: "Refer friends, followers, and sports fans" },
              { icon: DollarSign, value: "Earn", label: "$50/mo per active member", desc: "$50/month affiliate income for every member you refer — as long as they stay subscribed" },
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
                <TrendingUp size={16} /> View Affiliate Leaderboard
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
              <a href="mailto:nikcox@betfans.us" className="text-sm text-green-400 font-semibold hover:opacity-80 transition-colors" data-testid="link-contact-email">
                nikcox@betfans.us
              </a>
              <a href="tel:+12482757932" className="text-sm text-green-400 font-semibold hover:opacity-80 transition-colors" data-testid="link-contact-phone">
                248-275-7932
              </a>
              <p className="text-xs text-muted-foreground">For all inquiries</p>
              <LiveViewsCounter />
            </div>
            <div className="flex items-center gap-4">
              <QuickShareButton text="Join BetFans — the sports prediction platform where you predict, compete, and win daily prizes!" className="text-xs" />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Link href="/membership"><span className="hover:text-primary cursor-pointer">Membership</span></Link>
                <Link href="/referrals"><span className="hover:text-primary cursor-pointer">Affiliate Program</span></Link>
                <Link href="/referrals"><span className="hover:text-primary cursor-pointer">Affiliate Program</span></Link>
                <a href="mailto:nikcox@betfans.us" className="hover:text-primary cursor-pointer">Contact</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
