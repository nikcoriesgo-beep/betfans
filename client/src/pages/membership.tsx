import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { Button } from "@/components/ui/button";
import { Check, Star, Crown, Clock, Trophy, Calendar, Lock, Users, Gift, DollarSign, X, ArrowRight, Copy, ExternalLink, FileText, AlertCircle, Building2, Gem } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { PayPalCorporateButton } from "@/components/PayPalCorporateButton";
import { PayPalPremiumCorporateButton } from "@/components/PayPalPremiumCorporateButton";

type Tier = "legend" | "corporate" | "premium_corporate";

export default function Membership() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [affiliateCode, setAffiliateCode] = useState("");
  const [codeApplied, setCodeApplied] = useState(false);
  const [founderCode, setFounderCode] = useState("");
  const [referrerTier, setReferrerTier] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(null);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    const savedCode = localStorage.getItem("betfans_affiliate_code");
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get("ref") || urlParams.get("code");

    if (savedCode) {
      setAffiliateCode(savedCode);
    } else if (urlCode) {
      setAffiliateCode(urlCode);
      localStorage.setItem("betfans_affiliate_code", urlCode);
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

  // Auto-open checkout when returning from signup with a saved tier,
  // OR when a free-tier user lands here (they must pay to proceed)
  useEffect(() => {
    if (!isAuthenticated) return;
    const savedTier = localStorage.getItem("betfans_checkout_tier") as Tier | null;
    if (savedTier === "legend") {
      localStorage.removeItem("betfans_checkout_tier");
      setTimeout(() => handleUpgrade("legend"), 600);
    } else if (!savedTier && user?.membershipTier === "free") {
      setTimeout(() => handleUpgrade("legend"), 800);
    }
  }, [isAuthenticated]);

  const { data: myCodeData } = useQuery<{ code: string }>({
    queryKey: ["/api/referral/code"],
    queryFn: async () => {
      const res = await fetch("/api/referral/code", { credentials: "include" });
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const myReferralCode = myCodeData?.code || "";

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

    if (affiliateCode.trim() && (tier === "legend" || tier === "corporate" || tier === "premium_corporate")) {
      try {
        const checkRes = await fetch("/api/referral/check-tier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: affiliateCode, selectedTier: tier }),
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
    legend: "Legend — $99/mo",
    corporate: "Corporate Partnership — $1,200/yr",
    premium_corporate: "Premium Corporate Partnership — $12,000/yr",
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
            Join the elite community of sports analysts. Make picks, compete for daily prize pools, and earn $50/month residual income for every member you refer.
          </p>
        </div>

        {/* Daily Prize Competition */}
        <div className="mb-20">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
            <div className="text-center max-w-2xl mx-auto mb-8">
              <span className="text-primary font-bold tracking-wider text-sm uppercase mb-2 block">How We Reward Winners</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Play For Daily Prizes</h2>
              <p className="text-muted-foreground">
                We reward the best predictors. Compete every day for available cash prizes — subject to availability and change at any time.
              </p>
            </div>
            <PrizePoolQualRule className="max-w-2xl mx-auto mb-10 relative z-10" />
            <div className="grid md:grid-cols-2 gap-6 relative z-10 max-w-2xl mx-auto">
              <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4"><Clock size={24} /></div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Daily Winner</div>
                <div className="text-3xl font-bold font-display text-primary mb-1">Daily</div>
                <h3 className="font-bold text-base mb-2">One Winner Per Day</h3>
                <p className="text-xs text-muted-foreground">All members compete together. The day's best MLB predictor wins. Prizes subject to availability.</p>
              </div>
              <div className="bg-background/40 backdrop-blur-md border border-primary/30 rounded-xl p-6 text-center hover:border-primary/60 transition-colors shadow-xl">
                <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4"><Crown size={28} /></div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">All Members</div>
                <div className="text-4xl font-bold font-display text-primary mb-1">Compete</div>
                <h3 className="font-bold text-lg mb-2">Equal Footing</h3>
                <p className="text-xs text-muted-foreground">Every Legend member competes on equal footing for the same daily prize. No guarantees — prizes vary.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Affiliate Code Section ── */}
        <div className="max-w-2xl mx-auto mb-16">

          {/* ALL paid members: show their own affiliate code */}
          {isAuthenticated && myReferralCode && currentTier !== "free" && (
            <Card className={`mb-6 ${isFounder ? "bg-gradient-to-br from-primary/10 via-card/30 to-card/30 border-primary/30" : "bg-gradient-to-br from-primary/8 via-card/30 to-card/30 border-primary/20"}`}>
              <CardContent className="p-6 md:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    {isFounder ? <Star size={18} className="text-primary" /> : <DollarSign size={18} className="text-primary" />}
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">{isFounder ? "Your Founder Code" : "Your Affiliate Code"}</h3>
                    <p className="text-xs text-muted-foreground">Share this to earn residual income on every member you bring in</p>
                  </div>
                </div>

                {/* Code display */}
                <div className="bg-background/60 border border-primary/20 rounded-2xl p-5 mb-5 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Your Affiliate Code</p>
                  <p className="text-4xl font-mono font-black text-primary tracking-[0.3em] mb-3" data-testid="text-member-code">
                    {myReferralCode}
                  </p>
                  <button
                    onClick={() => copyCode(myReferralCode)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    data-testid="button-copy-code"
                  >
                    <Copy size={12} /> Copy code
                  </button>
                </div>

                {/* Earnings breakdown */}
                <div className="mb-5">
                  <div className="bg-background/40 rounded-xl p-4 text-center border border-yellow-500/20">
                    <p className="text-3xl font-bold text-yellow-400">$50<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-xs text-muted-foreground mt-1">per Legend referral — every month they stay active</p>
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
                    onClick={() => copyCode(`betfans.us/?ref=${myReferralCode}`)}
                    className="flex-1 text-center bg-background/40 hover:bg-background/60 border border-white/10 text-muted-foreground hover:text-foreground text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                    data-testid="button-copy-link"
                  >
                    <Copy size={14} /> Copy Referral Link
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Affiliate code entry section (enter someone else's code) */}
          {!isFounder && (!isAuthenticated || currentTier === "free") && (
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
                {(user?.referredBy || codeApplied) ? (
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
                        Your referrer earns <span className="text-yellow-400 font-semibold">$50/mo</span> per Legend member they bring in
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
                      and earn $50/month residual income for every Legend member you bring in.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Terms Agreement ── */}
        <div className="max-w-3xl mx-auto mb-10">
          <div className={`rounded-2xl border p-5 transition-all duration-200 ${agreedToTerms ? "bg-primary/5 border-primary/40" : "bg-card/40 border-white/10"}`}>
            <div className="flex items-start gap-4">
              <button
                onClick={() => setAgreedToTerms(v => !v)}
                data-testid="checkbox-agree-terms"
                aria-label="Agree to Official Rules"
                className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
                  agreedToTerms
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-white/30 bg-transparent hover:border-primary/60"
                }`}
              >
                {agreedToTerms && <Check size={14} strokeWidth={3} />}
              </button>
              <div className="flex-1">
                <p className="text-sm font-medium leading-relaxed">
                  I have read and agree to the{" "}
                  <a
                    href="/official-rules"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-bold hover:underline inline-flex items-center gap-1"
                    data-testid="link-official-rules"
                  >
                    <FileText size={13} className="inline" /> OFFICIAL RULES
                  </a>
                  {" "}& Terms of Participation. I understand that BetFans is a skill-based prediction platform, not a sports betting operator, and that I must be 18+ and eligible in my jurisdiction to participate.
                </p>
                {!agreedToTerms && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <AlertCircle size={12} className="text-yellow-500" />
                    You must agree to the Official Rules before selecting a membership tier.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Legend Tier (only tier) ── */}
        <div className="max-w-lg mx-auto">
          <Card className="bg-gradient-to-b from-yellow-500/10 via-card/30 to-card/30 border-yellow-500/50 flex flex-col relative overflow-hidden shadow-[0_0_40px_rgba(234,179,8,0.2)]">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 text-black text-center py-1.5 text-xs font-bold uppercase tracking-widest">
              The Only Membership — $50/mo Per Referral
            </div>
            <CardHeader className="pt-10 text-center">
              <CardTitle className="text-3xl font-display flex items-center justify-center gap-2">
                Legend <Crown size={22} className="text-yellow-500" />
              </CardTitle>
              <CardDescription>For serious predictors & earners</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-5xl font-bold mb-2 text-center">$99<span className="text-xl text-muted-foreground font-normal">/mo</span></div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-6 text-center">
                <p className="text-yellow-400 font-display font-bold text-sm flex items-center justify-center gap-2">
                  <DollarSign size={14} /> $50/mo Residual Income Per Referral
                </p>
                <p className="text-xs text-yellow-400/70 mt-1">
                  Earn <span className="font-bold text-yellow-400">$50/month</span> for every Legend member you refer — month after month
                </p>
              </div>
              <ul className="space-y-4">
                {[
                  "Spider AI Daily Picks",
                  "Prize Pool Eligibility",
                  "View All Members' Daily Picks",
                  "Advanced ROI Analytics",
                  "$50/mo Residual Income Per Referral",
                  "Double Prize Pool Entries",
                  "1-on-1 Strategy Coaching",
                  "Private Discord Access",
                  "Exclusive Legend Badge",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check size={16} className={i < 2 ? "text-yellow-400" : "text-primary"} />
                    <span className={i < 2 ? "text-yellow-400 font-medium" : ""}>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              {user?.membershipTier === "legend" || (user as any)?.referralCode === "NIKCOX" ? (
                <Button className="w-full bg-yellow-600/30 text-yellow-300 border border-yellow-500/30" disabled>Active Legend Member</Button>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 font-bold h-12 text-base shadow-lg shadow-yellow-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  onClick={() => handleUpgrade("legend")}
                  disabled={!agreedToTerms}
                  data-testid="button-upgrade-legend"
                >
                  {isAuthenticated ? "Subscribe — $99/mo" : "Join BetFans — $99/mo"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* ── Corporate Partnership Tier ── */}
        <div className="max-w-2xl mx-auto mt-16">
          <div className="text-center mb-8">
            <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-bold uppercase tracking-widest border border-yellow-500/20 mb-3">For Businesses</span>
            <h2 className="text-2xl md:text-3xl font-display font-bold">Corporate Partnership</h2>
            <p className="text-muted-foreground mt-2 text-sm">Grow your brand, generate residual income, and fund the community prize pool.</p>
          </div>

          <Card className="bg-gradient-to-b from-yellow-900/20 via-card/30 to-card/30 border-yellow-600/40 relative overflow-hidden shadow-[0_0_40px_rgba(161,109,8,0.15)]">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-700 via-yellow-600 to-yellow-700 text-black text-center py-1.5 text-xs font-bold uppercase tracking-widest">
              Annual Partnership · $600 to Prize Pool + $600 to Your Affiliate
            </div>
            <div className="grid md:grid-cols-2 gap-0 pt-8">
              {/* Left: pricing + split */}
              <CardContent className="p-6 border-b md:border-b-0 md:border-r border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 size={18} className="text-yellow-500" />
                  <h3 className="text-xl font-display font-bold">Corporate Partner</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-5">For brands, agencies, and businesses</p>
                <div className="text-4xl font-bold mb-1">$1,200<span className="text-base text-muted-foreground font-normal">/year</span></div>
                <p className="text-xs text-muted-foreground mb-6">Billed annually · $100/month equivalent</p>

                {/* Split breakdown */}
                <div className="space-y-3 mb-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">On signup, your $1,200 splits:</p>
                  <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
                    <Trophy size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-primary">$600 → Prize Pool</p>
                      <p className="text-xs text-muted-foreground">Immediately added to the community prize pool</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                    <DollarSign size={16} className="text-yellow-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-yellow-400">$600 → Your Affiliate</p>
                      <p className="text-xs text-muted-foreground">Instantly paid to whoever referred you</p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                {currentTier === "corporate" ? (
                  <Button className="w-full bg-yellow-700/30 text-yellow-400 border border-yellow-600/30" disabled>
                    Active Corporate Partner
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-gradient-to-r from-yellow-700 to-yellow-600 text-white hover:from-yellow-600 hover:to-yellow-500 font-bold h-12 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => handleUpgrade("corporate")}
                    disabled={!agreedToTerms}
                    data-testid="button-upgrade-corporate"
                  >
                    {isAuthenticated ? "Partner Up — $1,200/yr" : "Become a Partner — $1,200/yr"}
                  </Button>
                )}
                {!agreedToTerms && (
                  <p className="text-[10px] text-muted-foreground text-center mt-2">Agree to the Official Rules above to unlock</p>
                )}
              </CardContent>

              {/* Right: features */}
              <CardContent className="p-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">What's Included</p>
                <ul className="space-y-3">
                  {[
                    { icon: DollarSign, label: "Your own affiliate code", desc: "Earn monthly residual income for every member you refer", accent: true },
                    { icon: Crown, label: "Full Legend access", desc: "Spider AI picks, prize pool eligibility, all member picks" },
                    { icon: Trophy, label: "$600 funds the prize pool", desc: "Half your fee goes directly to daily community prizes" },
                    { icon: Users, label: "Double prize pool entries", desc: "Two entries for every daily competition" },
                    { icon: Star, label: "Priority partner support", desc: "Dedicated onboarding and account management" },
                    { icon: ArrowRight, label: "Corporate badge", desc: "Displayed next to your name in the community" },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${f.accent ? "bg-yellow-500/20" : "bg-primary/10"}`}>
                        <f.icon size={12} className={f.accent ? "text-yellow-400" : "text-primary"} />
                      </div>
                      <div>
                        <p className={`font-semibold ${f.accent ? "text-yellow-400" : ""}`}>{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 p-3 bg-background/40 border border-white/5 rounded-xl text-center">
                  <p className="text-xs text-muted-foreground">Questions? <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline font-semibold">nikcox@betfans.us</a></p>
                </div>
              </CardContent>
            </div>
          </Card>
        </div>

        {/* ── Premium Corporate Partnership Tier ── */}
        <div className="max-w-2xl mx-auto mt-12">
          <div className="text-center mb-8">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold uppercase tracking-widest border border-purple-500/20 mb-3">Premium · For Major Brands</span>
            <h2 className="text-2xl md:text-3xl font-display font-bold">Premium Corporate Partnership</h2>
            <p className="text-muted-foreground mt-2 text-sm">Your logo on betfans.us, the biggest impact on the prize pool, and the highest affiliate commissions in the platform.</p>
          </div>

          <Card className="bg-gradient-to-b from-purple-900/20 via-card/30 to-card/30 border-purple-500/40 relative overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.15)]">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-700 via-purple-500 to-purple-700 text-white text-center py-1.5 text-xs font-bold uppercase tracking-widest">
              Premium Annual Partnership · $6,000 to Prize Pool + $6,000 to Your Affiliate
            </div>
            <div className="grid md:grid-cols-2 gap-0 pt-8">
              {/* Left: pricing + split */}
              <CardContent className="p-6 border-b md:border-b-0 md:border-r border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Gem size={18} className="text-purple-400" />
                  <h3 className="text-xl font-display font-bold">Premium Partner</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-5">For major brands & enterprise sponsors</p>
                <div className="text-4xl font-bold mb-1">$12,000<span className="text-base text-muted-foreground font-normal">/year</span></div>
                <p className="text-xs text-muted-foreground mb-6">Billed annually · $1,000/month equivalent</p>

                {/* Split breakdown */}
                <div className="space-y-3 mb-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">On signup, your $12,000 splits:</p>
                  <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
                    <Trophy size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-primary">$6,000 → Prize Pool</p>
                      <p className="text-xs text-muted-foreground">Immediately added to the community prize pool</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                    <DollarSign size={16} className="text-yellow-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-yellow-400">$6,000 → Your Affiliate</p>
                      <p className="text-xs text-muted-foreground">Instantly paid to whoever referred you</p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                {currentTier === "premium_corporate" ? (
                  <Button className="w-full bg-purple-700/30 text-purple-300 border border-purple-500/30" disabled>
                    Active Premium Partner
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-gradient-to-r from-purple-700 to-purple-500 text-white hover:from-purple-600 hover:to-purple-400 font-bold h-12 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => handleUpgrade("premium_corporate")}
                    disabled={!agreedToTerms}
                    data-testid="button-upgrade-premium-corporate"
                  >
                    {isAuthenticated ? "Partner Up — $12,000/yr" : "Become a Premium Partner — $12,000/yr"}
                  </Button>
                )}
                {!agreedToTerms && (
                  <p className="text-[10px] text-muted-foreground text-center mt-2">Agree to the Official Rules above to unlock</p>
                )}
              </CardContent>

              {/* Right: features */}
              <CardContent className="p-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">What's Included</p>
                <ul className="space-y-3">
                  {[
                    { icon: Gem, label: "Logo on betfans.us", desc: "Your brand displayed to the entire BetFans community", accent: true },
                    { icon: DollarSign, label: "Your own affiliate code", desc: "Earn monthly residual income for every member you refer", accent: true },
                    { icon: Crown, label: "Full Legend access", desc: "Spider AI picks, prize pool eligibility, all member picks" },
                    { icon: Trophy, label: "$6,000 funds the prize pool", desc: "Half your fee goes directly to daily community prizes" },
                    { icon: Users, label: "Double prize pool entries", desc: "Two entries for every daily competition" },
                    { icon: Star, label: "Premium partner badge", desc: "Displayed next to your name — highest status on the platform" },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${f.accent ? "bg-purple-500/20" : "bg-primary/10"}`}>
                        <f.icon size={12} className={f.accent ? "text-purple-400" : "text-primary"} />
                      </div>
                      <div>
                        <p className={`font-semibold ${f.accent ? "text-purple-300" : ""}`}>{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl text-center">
                  <p className="text-xs text-muted-foreground">After subscribing, email your logo + company details to <a href="mailto:nikcox@betfans.us" className="text-purple-400 hover:underline font-semibold">nikcox@betfans.us</a> to go live.</p>
                </div>
              </CardContent>
            </div>
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
                {checkoutTier === "premium_corporate" ? (
                  <>
                    <p className="text-sm text-muted-foreground">Logo advertising on betfans.us, full Legend access, your own affiliate code, and an immediate <span className="text-yellow-400 font-semibold">$6,000 boost</span> to the prize pool + <span className="text-primary font-semibold">$6,000 to your referring affiliate</span>.</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20">
                      <Gem size={12} className="shrink-0" />
                      Annual billing · $12,000 charged once per year · Logo goes live after you email nikcox@betfans.us
                    </div>
                  </>
                ) : checkoutTier === "corporate" ? (
                  <>
                    <p className="text-sm text-muted-foreground">Full Legend-level platform access, your own affiliate code for monthly residual income, and an immediate <span className="text-yellow-400 font-semibold">$600 boost</span> to the prize pool + <span className="text-primary font-semibold">$600 to your referring affiliate</span>.</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20">
                      <Building2 size={12} className="shrink-0" />
                      Annual billing · $1,200 charged once per year
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Spider AI daily picks, prize pool eligibility, all member picks, <span className="text-yellow-400 font-semibold">$50/mo per referral</span>, double prize pool entries, 1-on-1 coaching, and private Discord.</p>
                )}
              </div>

              {/* Terms agreement confirmation */}
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <Check size={14} className="text-primary flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  You agreed to the{" "}
                  <a
                    href="/official-rules"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline"
                    data-testid="link-checkout-official-rules"
                  >
                    Official Rules
                  </a>
                  {" "}& Terms of Participation.
                </p>
              </div>

              {/* PayPal Button */}
              <div>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {(checkoutTier === "corporate" || checkoutTier === "premium_corporate")
                    ? "Secure annual payment via PayPal · Cancel anytime"
                    : "Secure payment via PayPal · Cancel anytime"}
                </p>
                {checkoutTier === "premium_corporate" ? (
                  <PayPalPremiumCorporateButton
                    onSuccess={handlePayPalSuccess}
                    onError={handlePayPalError}
                  />
                ) : checkoutTier === "corporate" ? (
                  <PayPalCorporateButton
                    onSuccess={handlePayPalSuccess}
                    onError={handlePayPalError}
                  />
                ) : (
                  <PayPalSubscribeButton
                    tier={checkoutTier}
                    onSuccess={handlePayPalSuccess}
                    onError={handlePayPalError}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <AdBannerInline />
    </div>
  );
}
