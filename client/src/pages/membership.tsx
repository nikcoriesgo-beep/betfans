import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { Button } from "@/components/ui/button";
import { Check, Star, Crown, Clock, Trophy, Calendar, Lock, Users, Gift, DollarSign, X, ArrowRight, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";

type Tier = "rookie" | "pro" | "legend";

export default function Membership() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [affiliateCode, setAffiliateCode] = useState("");
  const [codeApplied, setCodeApplied] = useState(false);
  const [founderCode, setFounderCode] = useState("");
  const [referrerTier, setReferrerTier] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(null);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);

  useEffect(() => {
    const savedCode = localStorage.getItem("betfans_affiliate_code");
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get("ref") || urlParams.get("code");

    if (savedCode) {
      setAffiliateCode(savedCode);
    } else if (urlCode) {
      setAffiliateCode(urlCode);
      localStorage.setItem("betfans_affiliate_code", urlCode);
    } else {
      fetch("/api/referral/founder-code")
        .then(res => res.json())
        .then(data => {
          if (data.code) {
            setFounderCode(data.code);
            setAffiliateCode(data.code);
          }
        })
        .catch(() => {});
    }

    if (urlParams.get("login_error") === "true") {
      toast({ title: "Login Temporarily Unavailable", description: "Please try again in a moment.", variant: "destructive" });
      window.history.replaceState({}, "", "/membership");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && affiliateCode && !user?.referredBy && !codeApplied) {
      applyAffiliateCode(affiliateCode);
    }
  }, [isAuthenticated, affiliateCode]);

  // Auto-open checkout when returning from signup with a saved tier
  useEffect(() => {
    if (!isAuthenticated) return;
    const savedTier = localStorage.getItem("betfans_checkout_tier") as Tier | null;
    if (savedTier && ["rookie", "pro", "legend"].includes(savedTier)) {
      localStorage.removeItem("betfans_checkout_tier");
      // Small delay so the page and auth state fully settle
      setTimeout(() => handleUpgrade(savedTier), 600);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!affiliateCode.trim()) { setReferrerTier(null); return; }
    fetch("/api/referral/check-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: affiliateCode, selectedTier: "legend" }),
    })
      .then(r => r.json())
      .then(d => setReferrerTier(d.referrerTier || null))
      .catch(() => setReferrerTier(null));
  }, [affiliateCode]);

  const applyAffiliateCode = async (code: string) => {
    if (!code.trim() || codeApplied) return;
    try {
      const res = await fetch("/api/referral/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setCodeApplied(true);
        localStorage.removeItem("betfans_affiliate_code");
        toast({ title: "Affiliate code applied!", description: "You've been linked to your affiliate partner." });
      }
    } catch (e) {}
  };

  const handleUpgrade = async (tier: Tier) => {
    if (!isAuthenticated) {
      if (affiliateCode) localStorage.setItem("betfans_affiliate_code", affiliateCode);
      localStorage.setItem("betfans_checkout_tier", tier);
      window.location.href = "/auth?mode=signup";
      return;
    }

    if (affiliateCode.trim() && tier === "legend") {
      try {
        const checkRes = await fetch("/api/referral/check-tier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: affiliateCode, selectedTier: "legend" }),
        });
        const checkData = await checkRes.json();
        if (!checkData.allowed) {
          toast({ title: "Referral Tier Restriction", description: checkData.message || "Only Legend members can refer Legend signups.", variant: "destructive" });
          return;
        }
      } catch (e) {}
    }

    if (!user?.referredBy && !codeApplied) {
      if (affiliateCode.trim()) {
        try { await applyAffiliateCode(affiliateCode); } catch (e) {}
      } else {
        try { await fetch("/api/referral/assign-platform", { method: "POST", credentials: "include" }); } catch (e) {}
      }
    }

    setCheckoutTier(tier);
  };

  const handlePayPalSuccess = async (subscriptionId: string) => {
    try {
      const savedAffiliateCode = localStorage.getItem("betfans_affiliate_code") || undefined;
      const res = await fetch("/api/paypal/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subscriptionId, tier: checkoutTier, affiliateCode: savedAffiliateCode }),
      });
      if (res.ok) {
        setSubscriptionSuccess(true);
        setCheckoutTier(null);
        toast({
          title: "Welcome to BetFans!",
          description: `Your ${checkoutTier} membership is now active.`,
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast({ title: "Verification pending", description: "Your payment is being confirmed. Please refresh in a moment.", variant: "destructive" });
        setCheckoutTier(null);
      }
    } catch {
      toast({ title: "Payment received", description: "Your membership will be activated shortly.", variant: "destructive" });
      setCheckoutTier(null);
    }
  };

  const handlePayPalError = () => {
    toast({ title: "PayPal Error", description: "Something went wrong. Please try again.", variant: "destructive" });
  };

  const currentTier = user?.membershipTier || "free";
  const isPro = currentTier === "pro" || currentTier === "legend";
  const isFounder = user?.referralCode === "NIKCOX";

  const tierLabel: Record<Tier, string> = {
    rookie: "Rookie — $19/mo",
    pro: "Pro — $29/mo",
    legend: "Legend — $99/mo",
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: "Code copied!", description: `${code} copied to clipboard.` });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="container mx-auto px-4 pt-24 pb-20">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6" data-testid="text-membership-heading">
            Unlock Your Full Potential
          </h1>
          <p className="text-xl text-muted-foreground">
            Join the elite community of sports analysts. Make picks, compete for daily prize pools, and earn instant payouts + residual income for every member you refer — $5 to $50/month per referral.
          </p>
        </div>

        {/* 50% Winners Pool */}
        <div className="mb-20">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
            <div className="text-center max-w-2xl mx-auto mb-8">
              <span className="text-primary font-bold tracking-wider text-sm uppercase mb-2 block">How We Reward Winners</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">50% Winners Payout Pool</h2>
              <p className="text-muted-foreground">
                We believe in rewarding the best predictors. Half of all membership fees go directly back to the community prize pool.
              </p>
            </div>
            <PrizePoolQualRule className="max-w-2xl mx-auto mb-10 relative z-10" />
            <div className="grid md:grid-cols-3 gap-6 relative z-10">
              <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4"><Clock size={24} /></div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Daily Winner</div>
                <div className="text-3xl font-bold font-display text-primary mb-1">10%</div>
                <h3 className="font-bold text-base mb-2">One Winner Per Day</h3>
                <p className="text-xs text-muted-foreground">All tiers compete together. The day's best MLB predictor wins 10% of the prize pool. Tied winners split the 10% equally.</p>
              </div>
              <div className="bg-background/40 backdrop-blur-md border border-primary/30 rounded-xl p-6 text-center hover:border-primary/60 transition-colors transform md:-translate-y-4 shadow-xl">
                <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4"><Crown size={28} /></div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">All Tiers</div>
                <div className="text-5xl font-bold font-display text-primary mb-1">10%</div>
                <h3 className="font-bold text-lg mb-2">Daily Prize Payout</h3>
                <p className="text-xs text-muted-foreground">Every member — Rookie, Pro, and Legend — competes on equal footing for the same daily 10% payout.</p>
              </div>
              <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4"><Trophy size={24} /></div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Year-End</div>
                <div className="text-4xl font-bold font-display text-primary mb-1">All</div>
                <h3 className="font-bold text-base mb-2">Annual Grand Prize</h3>
                <p className="text-xs text-muted-foreground">The annual leaderboard champion claims every dollar remaining in the prize pool at year-end.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Affiliate Code Section ── */}
        <div className="max-w-2xl mx-auto mb-16">

          {/* FOUNDER view: show their own code + earnings */}
          {isAuthenticated && isFounder && (
            <Card className="bg-gradient-to-br from-primary/10 via-card/30 to-card/30 border-primary/30">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Star size={18} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">Your Founder Code</h3>
                    <p className="text-xs text-muted-foreground">Share this to earn residual income on every member you bring in</p>
                  </div>
                </div>

                {/* Code display */}
                <div className="bg-background/60 border border-primary/20 rounded-2xl p-5 mb-5 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Your Affiliate Code</p>
                  <p className="text-4xl font-mono font-black text-primary tracking-[0.3em] mb-3" data-testid="text-founder-code">
                    NIKCOX
                  </p>
                  <button
                    onClick={() => copyCode("NIKCOX")}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    data-testid="button-copy-code"
                  >
                    <Copy size={12} /> Copy code
                  </button>
                </div>

                {/* Earnings breakdown */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-background/40 rounded-xl p-4 text-center border border-white/5">
                    <p className="text-xl font-bold text-primary">$5<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-xs text-muted-foreground mt-1">per Rookie referral</p>
                  </div>
                  <div className="bg-background/40 rounded-xl p-4 text-center border border-primary/20">
                    <p className="text-xl font-bold text-primary">$10<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-xs text-muted-foreground mt-1">per Pro referral</p>
                  </div>
                  <div className="bg-background/40 rounded-xl p-4 text-center border border-yellow-500/20">
                    <p className="text-xl font-bold text-yellow-400">$50<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-xs text-muted-foreground mt-1">per Legend referral</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="/referrals"
                    className="flex-1 text-center bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                    data-testid="link-referral-dashboard"
                  >
                    <ExternalLink size={14} /> View Referral Dashboard
                  </a>
                  <button
                    onClick={() => copyCode(`betfans.us/membership?ref=NIKCOX`)}
                    className="flex-1 text-center bg-background/40 hover:bg-background/60 border border-white/10 text-muted-foreground hover:text-foreground text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                    data-testid="button-copy-link"
                  >
                    <Copy size={14} /> Copy Referral Link
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* NON-FOUNDER: show affiliate code section */}
          {(!isAuthenticated || !isFounder) && (
            <Card className="bg-card/30 border-white/5">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Gift size={18} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">Affiliate Code</h3>
                    <p className="text-xs text-muted-foreground">The code below earns residual income for whoever referred you</p>
                  </div>
                </div>

                {/* If code is applied already */}
                {((user?.referredBy && user.referredBy !== "NIKCOX") || codeApplied) ? (
                  <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                    <Check size={16} className="text-green-400" />
                    <span className="text-sm text-green-400 font-medium">Affiliate code applied — your referrer earns every month you're active</span>
                  </div>
                ) : (
                  <>
                    {/* Prominent code display */}
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Active Code</p>
                      <p className="text-3xl font-mono font-black text-primary tracking-[0.3em] mb-1" data-testid="text-active-affiliate-code">
                        {affiliateCode || "NIKCOX"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Referrer earns <span className="text-primary font-semibold">$5/mo</span> (Rookie) · <span className="text-primary font-semibold">$10/mo</span> (Pro) · <span className="text-yellow-400 font-semibold">$50/mo</span> (Legend) + an instant bonus
                      </p>
                    </div>

                    {/* Code input to override */}
                    <div className="flex gap-3 mb-3">
                      <Input
                        placeholder="Have a friend's code? Enter it here"
                        value={affiliateCode}
                        onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
                        className="bg-background/50 border-white/10 font-mono"
                        data-testid="input-membership-affiliate-code"
                      />
                      <Button
                        onClick={() => {
                          if (!isAuthenticated) {
                            localStorage.setItem("betfans_affiliate_code", affiliateCode);
                            window.location.href = "/auth?mode=signup";
                            return;
                          }
                          applyAffiliateCode(affiliateCode);
                        }}
                        disabled={!affiliateCode.trim()}
                        className="shrink-0 gap-2"
                        data-testid="button-apply-membership-affiliate"
                      >
                        <Users size={14} /> Apply
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Have your own referral code?{" "}
                      <a href="/referrals" className="text-primary hover:underline">
                        Get your affiliate link
                      </a>{" "}
                      and earn $5–$50/month residual + instant bonuses for every member you bring in.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Referral Tier Rules ── */}
        <div className="max-w-6xl mx-auto mb-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown size={16} className="text-yellow-400" />
              <p className="text-sm font-display font-bold uppercase tracking-widest">Referral Tier Rules</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-3 text-center">
                <Crown size={18} className="text-yellow-400 mx-auto mb-1" />
                <p className="text-xs font-bold text-yellow-400 mb-1">Legend</p>
                <p className="text-[11px] text-muted-foreground leading-snug">Can refer <span className="text-white font-medium">Rookie, Pro & Legend</span> members</p>
              </div>
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                <Star size={18} className="text-primary mx-auto mb-1" />
                <p className="text-xs font-bold text-primary mb-1">Pro</p>
                <p className="text-[11px] text-muted-foreground leading-snug">Can refer <span className="text-white font-medium">Rookie & Pro</span> members only</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <Users size={18} className="text-muted-foreground mx-auto mb-1" />
                <p className="text-xs font-bold text-muted-foreground mb-1">Rookie</p>
                <p className="text-[11px] text-muted-foreground leading-snug">Can refer <span className="text-white font-medium">Rookie</span> members only</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Pricing Grid ── */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">

          {/* Rookie */}
          <Card className="bg-card/30 border-white/5 flex flex-col">
            <CardHeader>
              <CardTitle className="text-2xl font-display">Rookie</CardTitle>
              <CardDescription>For casual predictors</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-2">$19<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-5">
                <p className="text-primary font-display font-bold text-sm flex items-center gap-2">
                  <DollarSign size={14} /> $5 Instant + $5/mo Per Referral
                </p>
                <p className="text-xs text-primary/70 mt-1">
                  Get <span className="font-bold text-primary">$5 instantly</span> when someone joins + <span className="font-bold text-primary">$5/month</span> residual income while they stay active
                </p>
              </div>
              <ul className="space-y-4">
                {["Basic Stats Tracking", "Daily Leaderboard Access", "Follow up to 5 Pros", "Community Forum Access"].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check size={16} className="text-muted-foreground" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
                <li className="flex items-center gap-3 text-sm">
                  <Lock size={16} className="text-muted-foreground/50" />
                  <span className="text-muted-foreground/50">View Members' Daily Picks (Pro+)</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              {currentTier === "rookie" ? (
                <>
                  <Button variant="outline" className="w-full" disabled data-testid="button-current-plan">Current Plan</Button>
                  <div className="flex gap-2 w-full">
                    <Button
                      size="sm"
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                      onClick={() => handleUpgrade("pro")}
                      data-testid="button-rookie-upgrade-pro"
                    >
                      Upgrade to Pro — $29/mo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-xs"
                      onClick={() => handleUpgrade("legend")}
                      data-testid="button-rookie-upgrade-legend"
                    >
                      Upgrade to Legend — $99/mo
                    </Button>
                  </div>
                </>
              ) : isPro ? (
                <Button variant="outline" className="w-full" disabled data-testid="button-rookie-tier">Rookie Tier</Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                  onClick={() => handleUpgrade("rookie")}
                  data-testid="button-upgrade-rookie"
                >
                  Get Rookie — $19/mo
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Pro */}
          <Card className="bg-primary/5 border-primary/30 relative overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle className="text-2xl font-display">Pro</CardTitle>
              <CardDescription>For serious handicappers</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-2">$29<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 mb-5">
                <p className="text-primary font-display font-bold text-sm flex items-center gap-2">
                  <DollarSign size={14} /> $10 Instant + $10/mo Per Referral
                </p>
                <p className="text-xs text-primary/70 mt-1">
                  Get <span className="font-bold text-primary">$10 instantly</span> when someone joins + <span className="font-bold text-primary">$10/month</span> residual income while they stay active
                </p>
              </div>
              <ul className="space-y-4">
                {["Eligible for Prize Pools", "Unlock Spider AI Picks", "View Members' Daily Picks", "Advanced ROI Analytics", "Unlimited Following", "Verified 'Pro' Badge", "Ad-Free Experience"].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              {user?.membershipTier === "pro" ? (
                <>
                  <Button className="w-full" disabled>Current Plan</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-xs"
                    onClick={() => handleUpgrade("legend")}
                    data-testid="button-pro-upgrade-legend"
                  >
                    Upgrade to Legend — $99/mo
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base shadow-lg shadow-primary/20"
                  onClick={() => handleUpgrade("pro")}
                  data-testid="button-upgrade-pro"
                >
                  Upgrade to Pro — $29/mo
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Legend */}
          <Card className="bg-gradient-to-b from-yellow-500/10 via-card/30 to-card/30 border-yellow-500/50 flex flex-col relative overflow-hidden transform md:-translate-y-4 transition-transform shadow-[0_0_30px_rgba(234,179,8,0.15)]">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 text-black text-center py-1.5 text-xs font-bold uppercase tracking-widest">
              Most Popular — $50/mo Per Referral
            </div>
            <CardHeader className="pt-10">
              <CardTitle className="text-2xl font-display flex items-center gap-2">
                Legend <Crown size={18} className="text-yellow-500" />
              </CardTitle>
              <CardDescription>For serious earners & professional syndicates</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-2">$99<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-6">
                <p className="text-yellow-400 font-display font-bold text-sm flex items-center gap-2">
                  <DollarSign size={14} /> 50% Instant Affiliate Payouts
                </p>
                <p className="text-xs text-yellow-400/70 mt-1">
                  Earn <span className="font-bold text-yellow-400">$50/month</span> for every member you refer — 50x more than standard!
                </p>
              </div>
              <ul className="space-y-4">
                {["Everything in Pro", "$50/mo Residual Income Per Referral", "50% Instant Affiliate Payouts", "Double Prize Pool Entries", "1-on-1 Strategy Coaching", "Private Discord Access", "White-label Reports", "Exclusive 'Legend' Badge"].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check size={16} className={i < 3 ? "text-yellow-400" : "text-primary"} />
                    <span className={i < 3 ? "text-yellow-400 font-medium" : ""}>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              {user?.membershipTier === "legend" ? (
                <Button className="w-full" disabled>Current Plan</Button>
              ) : referrerTier && referrerTier !== "legend" && referrerTier !== "founder" ? (
                <div className="w-full">
                  <Button className="w-full bg-gray-700 text-gray-400 cursor-not-allowed h-12 text-base" disabled data-testid="button-upgrade-legend-locked">
                    <Lock size={16} className="mr-2" /> Legend Requires Legend Referrer
                  </Button>
                  <p className="text-[11px] text-yellow-400/70 text-center mt-2">Your referrer is a {referrerTier.charAt(0).toUpperCase() + referrerTier.slice(1)} member. Only Legend members can refer Legend signups.</p>
                </div>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 font-bold h-12 text-base shadow-lg shadow-yellow-500/20"
                  onClick={() => handleUpgrade("legend")}
                  data-testid="button-upgrade-legend"
                >
                  Become a Legend — $99/mo
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* ── Footer ── */}
        <div className="mt-20 text-center">
          <h2 className="text-2xl font-display font-bold mb-8">Trusted by 10,000+ Predictors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            <div className="h-12 flex items-center justify-center border border-white/10 rounded">ESPN</div>
            <div className="h-12 flex items-center justify-center border border-white/10 rounded">DraftKings</div>
            <div className="h-12 flex items-center justify-center border border-white/10 rounded">FanDuel</div>
            <div className="h-12 flex items-center justify-center border border-white/10 rounded">Action Network</div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Questions about membership? Contact <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline" data-testid="link-membership-contact">nikcox@betfans.us</a>
          </p>
        </div>
      </div>

      {/* ── PayPal Checkout Modal ── */}
      {checkoutTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="modal-paypal-checkout">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h2 className="font-display font-bold text-xl">Complete Your Subscription</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{tierLabel[checkoutTier]}</p>
              </div>
              <button
                onClick={() => setCheckoutTier(null)}
                className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-close-checkout"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Affiliate confirmation */}
              {affiliateCode && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Affiliate code applied</p>
                  <p className="font-mono font-bold text-primary text-lg tracking-widest" data-testid="text-checkout-affiliate-code">
                    {affiliateCode}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {affiliateCode === "NIKCOX" || affiliateCode === founderCode
                      ? "The BetFans founder earns residual income from your subscription."
                      : "Your referrer earns residual income every month you stay active."}
                  </p>
                </div>
              )}

              {/* What you get */}
              <div className="bg-background/40 rounded-xl p-4 border border-white/5">
                <p className="text-sm font-semibold mb-2">What you get:</p>
                {checkoutTier === "rookie" && <p className="text-sm text-muted-foreground">Stats tracking, leaderboard access, community forum + <span className="text-primary font-semibold">$5 instant payout</span> + <span className="text-primary font-semibold">$5/mo residual income</span> per referral.</p>}
                {checkoutTier === "pro" && <p className="text-sm text-muted-foreground">Everything in Rookie + Spider AI picks, Pro badge, and <span className="text-primary font-semibold">$10 instant payout</span> + <span className="text-primary font-semibold">$10/mo residual income</span> per referral.</p>}
                {checkoutTier === "legend" && <p className="text-sm text-muted-foreground">Everything in Pro + <span className="text-yellow-400 font-semibold">$50/mo per Legend referral</span>, double prize pool entries, 1-on-1 coaching, and private Discord.</p>}
              </div>

              {/* PayPal Button */}
              <div>
                <p className="text-xs text-muted-foreground text-center mb-3">Secure payment via PayPal · Cancel anytime</p>
                <PayPalSubscribeButton
                  tier={checkoutTier}
                  onSuccess={handlePayPalSuccess}
                  onError={handlePayPalError}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <AdBannerInline />
    </div>
  );
}
