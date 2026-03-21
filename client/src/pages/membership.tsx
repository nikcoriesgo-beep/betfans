import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Check, Star, Crown, Clock, Trophy, Calendar, Lock, Users, Gift, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Membership() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [affiliateCode, setAffiliateCode] = useState("");
  const [codeApplied, setCodeApplied] = useState(false);
  const [founderCode, setFounderCode] = useState("");
  const [referrerTier, setReferrerTier] = useState<string | null>(null);

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
      toast({ title: "Login Temporarily Unavailable", description: "Please try again in a moment. If this continues, refresh the page.", variant: "destructive" });
      window.history.replaceState({}, "", "/membership");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && affiliateCode && !user?.referredBy && !codeApplied) {
      applyAffiliateCode(affiliateCode);
    }
  }, [isAuthenticated, affiliateCode]);

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
    } catch (e) {
    }
  };

  const { data: productsData } = useQuery({
    queryKey: ["/api/stripe/products"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/products");
      return res.json();
    },
  });

  const FALLBACK_PRICES: Record<string, string> = {
    rookie: "price_1TBNTPBN1rLreuOWjB1mvEk8",
    pro: "price_1TB3bZBN1rLreuOWFHlQfwO2",
    legend: "price_1TB3baBN1rLreuOWhpmGLLR1",
  };

  const getMonthlyPriceId = (productName: string): string | null => {
    const product = productsData?.data?.find((p: any) =>
      p.name?.toLowerCase().includes(productName.toLowerCase())
    );
    if (product) {
      const monthlyPrice = product.prices?.find((p: any) => {
        const recurring = typeof p.recurring === "string" ? JSON.parse(p.recurring) : p.recurring;
        return recurring?.interval === "month" && p.active;
      });
      if (monthlyPrice?.id) return monthlyPrice.id;
    }
    return FALLBACK_PRICES[productName.toLowerCase()] || null;
  };

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      setLoading(priceId);
      const res = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
      setLoading(null);
    },
    onError: (err: any) => {
      setLoading(null);
      toast({ title: "Checkout Error", description: err.message || "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  const handleUpgrade = async (tier: string) => {
    if (!isAuthenticated) {
      if (affiliateCode) {
        localStorage.setItem("betfans_affiliate_code", affiliateCode);
      }
      window.location.href = "/auth";
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
        try {
          await applyAffiliateCode(affiliateCode);
        } catch (e) {}
      } else {
        try {
          await fetch("/api/referral/assign-platform", { method: "POST", credentials: "include" });
        } catch (e) {}
      }
    }

    let priceId: string | null = null;
    if (tier === "rookie") priceId = getMonthlyPriceId("Rookie");
    else if (tier === "pro") priceId = getMonthlyPriceId("Pro");
    else priceId = getMonthlyPriceId("Legend");
    if (!priceId) {
      toast({ title: "Error", description: "Unable to find pricing. Please refresh and try again.", variant: "destructive" });
      return;
    }
    checkoutMutation.mutate(priceId);
  };

  const currentTier = user?.membershipTier || "free";
  const isPro = currentTier === "pro" || currentTier === "legend";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6" data-testid="text-membership-heading">Unlock Your Full Potential</h1>
          <p className="text-xl text-muted-foreground">
            Join the elite community of sports analysts. Track your stats, compete for daily prize pools, and earn up to $50/month residual income for every Legend member you refer.
          </p>
        </div>

        <div className="mb-20">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
            
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-primary font-bold tracking-wider text-sm uppercase mb-2 block">How We Reward Winners</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">50% Winners Payout Pool</h2>
              <p className="text-muted-foreground">
                We believe in rewarding the best predictors. Half of all membership fees go directly back to the community prize pool.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 relative z-10">
              <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4">
                  <Clock size={24} />
                </div>
                <div className="text-4xl font-bold font-display text-primary mb-2">5%</div>
                <h3 className="font-bold text-lg mb-2">Daily Payouts</h3>
                <p className="text-sm text-muted-foreground">Distributed every 24 hours to the top 3 daily performers.</p>
              </div>

              <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center hover:border-primary/40 transition-colors transform md:-translate-y-4 shadow-xl">
                <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4">
                  <Calendar size={32} />
                </div>
                <div className="text-5xl font-bold font-display text-primary mb-2">35%</div>
                <h3 className="font-bold text-xl mb-2">Monthly Jackpot</h3>
                <p className="text-sm text-muted-foreground">The big prize. Awarded to the monthly leaderboard champion.</p>
              </div>

              <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4">
                  <Trophy size={24} />
                </div>
                <div className="text-4xl font-bold font-display text-primary mb-2">10%</div>
                <h3 className="font-bold text-lg mb-2">Weekly Prizes</h3>
                <p className="text-sm text-muted-foreground">Consistent winners get paid every Sunday night.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mb-16">
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Gift size={18} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg">Were you referred by someone?</h3>
                  <p className="text-xs text-muted-foreground">Enter their affiliate code to connect your accounts</p>
                </div>
              </div>
              {(user?.referredBy && user.referredBy !== "NIKCOX") || codeApplied ? (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                  <Check size={16} className="text-green-400" />
                  <span className="text-sm text-green-400 font-medium">Affiliate code applied</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Enter affiliate code (e.g. 847291)"
                      value={affiliateCode}
                      onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
                      className="bg-background/50 border-white/10 font-mono"
                      data-testid="input-membership-affiliate-code"
                    />
                    <Button
                      onClick={() => {
                        if (!isAuthenticated) {
                          localStorage.setItem("betfans_affiliate_code", affiliateCode);
                          window.location.href = "/auth";
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
                  {founderCode && affiliateCode === founderCode && (
                    <p className="text-[11px] text-primary/70 mt-2">
                      Pre-filled with Founder's code. Have a friend's code? Replace it above!
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">
                    No code? No problem — the $1/month residual goes to the Founder. Want to earn your own?{" "}
                    <Link href="/referrals" className="text-primary hover:underline">
                      Get your affiliate link
                    </Link>{" "}
                    and start earning $1/month for every member you bring in.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="bg-card/30 border-white/5 flex flex-col">
            <CardHeader>
              <CardTitle className="text-2xl font-display">Rookie</CardTitle>
              <CardDescription>For casual predictors</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-6">$19<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
              <ul className="space-y-4">
                {[
                  "Basic Stats Tracking", 
                  "Daily Leaderboard Access", 
                  "Follow up to 5 Pros",
                  "Community Forum Access"
                ].map((f, i) => (
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
            <CardFooter>
              {currentTier === "rookie" ? (
                <Button variant="outline" className="w-full" disabled data-testid="button-current-plan">Current Plan</Button>
              ) : isPro ? (
                <Button variant="outline" className="w-full" disabled data-testid="button-rookie-tier">Rookie Tier</Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                  onClick={() => handleUpgrade("rookie")}
                  disabled={!!loading}
                  data-testid="button-upgrade-rookie"
                >
                  {loading ? "Processing..." : "Get Rookie"}
                </Button>
              )}
            </CardFooter>
          </Card>

          <Card className="bg-primary/5 border-primary/30 relative overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle className="text-2xl font-display">Pro</CardTitle>
              <CardDescription>For serious handicappers</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-6">$29<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
              <ul className="space-y-4">
                {[
                  "Eligible for Prize Pools",
                  "Unlock Spider AI Picks",
                  "View Members' Daily Picks",
                  "Advanced ROI Analytics", 
                  "Unlimited Following", 
                  "Verified 'Pro' Badge",
                  "Ad-Free Experience",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              {user?.membershipTier === "pro" ? (
                <Button className="w-full" disabled>Current Plan</Button>
              ) : (
                <Button 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base shadow-lg shadow-primary/20" 
                  onClick={() => handleUpgrade("pro")}
                  disabled={!!loading}
                  data-testid="button-upgrade-pro"
                >
                  {loading ? "Processing..." : "Upgrade to Pro"}
                </Button>
              )}
            </CardFooter>
          </Card>

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
                <p className="text-[10px] text-yellow-400/50 mt-1">
                  1M referrals = $50,000,000/month
                </p>
              </div>
              <ul className="space-y-4">
                {[
                  "Everything in Pro",
                  "$50/mo Residual Income Per Referral",
                  "50% Instant Affiliate Payouts",
                  "Double Prize Pool Entries",
                  "1-on-1 Strategy Coaching", 
                  "Private Discord Access", 
                  "White-label Reports",
                  "Exclusive 'Legend' Badge"
                ].map((f, i) => (
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
                  disabled={!!loading}
                  data-testid="button-upgrade-legend"
                >
                  {loading ? "Processing..." : "Become a Legend"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

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
    </div>
  );
}
