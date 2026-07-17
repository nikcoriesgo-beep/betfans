import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users, Gift, Copy, Check, DollarSign, UserPlus, Loader2, Share2,
  TrendingUp, Repeat, Crown, Rocket, Twitter, Facebook, Instagram, MessageSquare,
  Trophy, Medal, Mail, AlertCircle, ExternalLink, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const AFFILIATE_NAMES = ["Scott Lunny", "Ian C Glover", "Moe McCoy", "Bryant Nelson"];

function RotatingNames({ names, interval = 2500 }: { names: string[]; interval?: number }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % names.length);
        setVisible(true);
      }, 350);
    }, interval);
    return () => clearInterval(timer);
  }, [names.length, interval]);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-primary font-bold transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <Crown size={11} />
      {names[idx]}
    </span>
  );
}

function TikTokIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card className="bg-card/30 border-white/5">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-display font-bold leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const legendMilestones = [
  { members: 10, monthly: "$500", instant: "$500", icon: "🔥" },
  { members: 100, monthly: "$5,000", instant: "$5,000", icon: "💰" },
  { members: 1000, monthly: "$50,000", instant: "$50,000", icon: "🚀" },
  { members: 10000, monthly: "$500,000", instant: "$500,000", icon: "💎" },
  { members: 100000, monthly: "$5,000,000", instant: "$5,000,000", icon: "👑" },
  { members: 1000000, monthly: "$50,000,000", instant: "$50,000,000", icon: "🏆" },
];

const rankColors: Record<number, string> = {
  1: "from-yellow-500/30 to-yellow-600/10 border-yellow-500/40",
  2: "from-slate-300/20 to-slate-400/10 border-slate-400/30",
  3: "from-amber-700/20 to-amber-800/10 border-amber-700/30",
};

const rankIcons: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

type TabId = "affiliate" | "leaderboard" | "all-members";

export default function Referrals() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [applyCode, setApplyCode] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("affiliate");
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [payoutEmailInput, setPayoutEmailInput] = useState("");
  const [payoutEmailSaved, setPayoutEmailSaved] = useState(false);

  const savePayoutEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/user/payout-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Failed to save email");
      }
      return res.json();
    },
    onSuccess: () => {
      setPayoutEmailSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "PayPal email saved!", description: "Your affiliate payouts will now be sent automatically." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: codeData } = useQuery<{ code: string }>({
    queryKey: ["/api/referral/code"],
    enabled: isAuthenticated,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/referral/stats"],
    enabled: isAuthenticated,
  });

  const { data: referralList = [] } = useQuery<any[]>({
    queryKey: ["/api/referral/list"],
    enabled: isAuthenticated,
  });

  const { data: allTeams = [] } = useQuery<any[]>({
    queryKey: ["/api/referral/all-teams"],
    enabled: isAuthenticated,
  });

  const { data: founderOverview = [], isLoading: overviewLoading } = useQuery<any[]>({
    queryKey: ["/api/referral/founder-overview"],
    enabled: isAuthenticated && (stats?.isFounder || false),
  });

  const { data: leaderboard = [] } = useQuery<any[]>({
    queryKey: ["/api/referral/leaderboard"],
  });

  const applyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/referral/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to apply code");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Affiliate code applied!", description: "You've been connected to your affiliate partner." });
      setApplyCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/referral/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const referralCode = codeData?.code || "";
  const referralLink = referralCode ? `${window.location.origin}?ref=${referralCode}` : "";

  const isLegend = user?.membershipTier === "legend";
  const isFounder = stats?.isFounder || false;
  const perReferral = 50;
  const activeReferrals = stats?.completedCount || 0;
  const monthlyIncome = stats?.monthlyIncome ?? (activeReferrals * perReferral);
  const milestones = legendMilestones;

  const totalMonthlyPayout = leaderboard.reduce((sum: number, e: any) => sum + (e.monthlyIncome ?? e.activeReferrals * 50), 0);
  const totalReferrals = leaderboard.reduce((sum: number, e: any) => sum + e.activeReferrals, 0);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="container mx-auto px-4 pt-24 pb-12">

        <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card/60 to-violet-900/20 border border-white/5 p-6 md:p-10">
          <div className="absolute top-4 right-4 opacity-10">
            <Repeat size={120} />
          </div>
          <div className="relative z-10">
            <Badge className="bg-primary/20 text-primary border-primary/30 mb-3">
              <DollarSign size={12} className="mr-1" /> Affiliate & Residual Income
            </Badge>
            <h1 className="text-3xl md:text-5xl font-display font-bold mb-3" data-testid="text-referral-title">
              Every Member Is An <span className="text-primary">Affiliate</span>
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-2xl mb-4">
              Share your unique code and earn residual income every month for each member you bring in — as long as they stay a member.
              No caps. No limits. Compete on the leaderboard for top earner recognition.
            </p>
            {(isLegend || isFounder) ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-2">
                  <Crown size={16} className="text-yellow-400" />
                  <span className="text-sm font-display font-bold text-yellow-400">
                    {isFounder ? "Founder" : "Legend Tier"}: <span className="text-yellow-300">$50/month per referral</span> — 50% Instant Affiliate Payouts
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2">
                  <Trophy size={16} className="text-yellow-500" />
                  <span className="text-sm font-display font-bold">
                    1,000,000 affiliate members = <span className="text-yellow-400">$50,000,000/month</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2">
                  <Crown size={16} className="text-yellow-400" />
                  <span className="text-sm font-display font-bold text-yellow-400">
                    1,000,000 affiliates = <span className="text-yellow-300">$50,000,000/month</span> at $50/mo
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-6 bg-card/20 rounded-xl p-1 border border-white/5">
          <button
            onClick={() => setActiveTab("affiliate")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-display font-bold text-sm transition-all",
              activeTab === "affiliate"
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-affiliate"
          >
            <Share2 size={16} /> My Affiliate
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-display font-bold text-sm transition-all",
              activeTab === "leaderboard"
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-leaderboard"
          >
            <Trophy size={16} /> Leaderboard
          </button>
          {isFounder && (
            <button
              onClick={() => setActiveTab("all-members")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-display font-bold text-sm transition-all",
                activeTab === "all-members"
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
              data-testid="tab-all-members"
            >
              <ShieldCheck size={16} /> All Members
            </button>
          )}
        </div>

        {activeTab === "affiliate" && (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <Card className="bg-card/30 border-white/5 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <Share2 size={20} className="text-primary" />
                </div>
                <h3 className="font-display font-bold mb-1">1. Share Your Link</h3>
                <p className="text-xs text-muted-foreground">Send your unique affiliate link to friends, family, and your network</p>
              </Card>
              <Card className="bg-card/30 border-white/5 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-3">
                  <UserPlus size={20} className="text-blue-400" />
                </div>
                <h3 className="font-display font-bold mb-1">2. They Join BetFans</h3>
                <p className="text-xs text-muted-foreground">When they sign up and become a member, they're your affiliate member</p>
              </Card>
              <Card className="bg-card/30 border-white/5 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                  <Repeat size={20} className="text-green-400" />
                </div>
                <h3 className="font-display font-bold mb-1">3. Earn $50/Month Each</h3>
                <p className="text-xs text-muted-foreground">Legend: $50/mo per referral — every month they stay active</p>
              </Card>
            </div>

            <Card className="bg-gradient-to-r from-primary/5 via-card/30 to-violet-900/10 border border-primary/20 mb-10">
              <CardContent className="p-6">
                <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <Rocket size={18} className="text-primary" />
                  Income Milestones
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {milestones.map((m) => (
                    <div
                      key={m.members}
                      className="rounded-xl border bg-card/20 border-white/5 p-3 text-center"
                    >
                      <span className="text-2xl">{m.icon}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.members.toLocaleString()} referrals
                      </p>
                      <p className="font-display font-bold text-sm text-white/70">
                        {m.monthly}/mo
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        +{m.instant} instant
                      </p>
                    </div>
                  ))}
                </div>
                {!isAuthenticated && (
                  <div className="mt-6 text-center">
                    <a href="/auth">
                      <Button className="gap-2" size="lg" data-testid="button-signin-milestones">
                        <UserPlus size={16} /> Join BetFans to Start Earning
                      </Button>
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {!isAuthenticated ? (
              <Card className="bg-gradient-to-r from-primary/5 via-card/30 to-primary/5 border border-primary/20 mb-8">
                <CardContent className="p-8 text-center">
                  <UserPlus size={40} className="text-primary mx-auto mb-4" />
                  <h2 className="font-display font-bold text-xl mb-2">Sign In to Start Earning</h2>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    Sign in to get your unique affiliate link, track your referrals, and start earning $50/month for every Legend member you bring in.
                  </p>
                  <a href="/auth">
                    <Button className="gap-2" size="lg" data-testid="button-signin-affiliate">
                      <UserPlus size={16} /> Sign In to Get Your Link
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ) : (
            <>
            <Card className="bg-card/30 border-white/5 mb-8">
              <CardContent className="p-6">
                <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <Copy size={18} className="text-primary" />
                  Your Affiliate Link
                </h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 bg-background/50 rounded-xl border border-white/10 px-4 py-3 font-mono text-sm text-muted-foreground truncate" data-testid="text-referral-link">
                    {referralLink || "Generating..."}
                  </div>
                  <Button
                    onClick={() => copyToClipboard(referralLink)}
                    className="gap-2 shrink-0"
                    disabled={!referralLink}
                    data-testid="button-copy-link"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-muted-foreground">Your code:</span>
                  <Badge className="bg-primary/20 text-primary border-primary/30 font-mono" data-testid="text-referral-code">
                    {referralCode || "..."}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyToClipboard(referralCode)}>
                    <Copy size={10} className="mr-1" /> Copy Code
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">Share on:</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/30 h-8"
                    onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent("Join me on BetFans! Predict sports, compete for daily prizes, and earn $50/month for every Legend you refer. Use my code: " + referralCode)}&url=${encodeURIComponent(referralLink)}`, "_blank")}
                    disabled={!referralLink}
                    data-testid="button-share-twitter"
                  >
                    <Twitter size={13} /> Post
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 hover:bg-blue-600/20 hover:text-blue-300 hover:border-blue-600/30 h-8"
                    onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}&quote=${encodeURIComponent("Join me on BetFans — predict sports, win prizes, and earn residual income!")}`, "_blank")}
                    disabled={!referralLink}
                    data-testid="button-share-facebook"
                  >
                    <Facebook size={13} /> Share
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 hover:bg-pink-500/20 hover:text-pink-400 hover:border-pink-500/30 h-8"
                    onClick={() => {
                      navigator.clipboard.writeText(`Join me on BetFans! Predict sports, compete for daily prizes, and earn $50/month for every Legend you refer. Use my code: ${referralCode}\n${referralLink}`);
                      toast({ title: "Caption copied! Opening Instagram...", description: "Paste the caption into your Instagram post or story." });
                      window.open("https://www.instagram.com/", "_blank");
                    }}
                    disabled={!referralLink}
                    data-testid="button-share-instagram"
                  >
                    <Instagram size={13} /> Instagram
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/30 h-8"
                    onClick={() => {
                      navigator.clipboard.writeText(`Join me on BetFans! Predict sports, compete for daily prizes, and earn $50/month for every Legend you refer. Use my code: ${referralCode}\n${referralLink}`);
                      toast({ title: "Caption copied! Opening TikTok...", description: "Paste the caption into your TikTok post." });
                      window.open("https://www.tiktok.com/upload", "_blank");
                    }}
                    disabled={!referralLink}
                    data-testid="button-share-tiktok"
                  >
                    <TikTokIcon size={13} /> TikTok
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 hover:bg-yellow-500/20 hover:text-yellow-400 hover:border-yellow-500/30 h-8"
                    onClick={() => {
                      const smsText = `Hey! Check out BetFans 🏆 Predict sports, compete for daily prizes, and earn $50/month for every Legend you refer. Use my code: ${referralCode}\n\n${referralLink}\n\n#BetFans #SportsPicks #WinningPicks #SpiderAI #AIpicks`;
                      navigator.clipboard.writeText(smsText);
                      toast({ title: "Text message copied!", description: "Paste into your text messages, WhatsApp, or any messaging app." });
                    }}
                    disabled={!referralLink}
                    data-testid="button-share-text"
                  >
                    <MessageSquare size={13} /> Text
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 hover:bg-violet-500/20 hover:text-violet-400 hover:border-violet-500/30 h-8"
                    onClick={async () => {
                      if (navigator.share) {
                        try { await navigator.share({ title: "BetFans", text: `Join me on BetFans! Use code: ${referralCode}`, url: referralLink }); } catch {}
                      } else { copyToClipboard(referralLink); }
                    }}
                    disabled={!referralLink}
                    data-testid="button-share-native"
                  >
                    <Share2 size={13} /> More
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* PayPal payout email prompt */}
            {isAuthenticated && !user?.paypalPayoutEmail && !payoutEmailSaved && (
              <div className="rounded-xl border-2 border-orange-400/40 bg-orange-500/10 p-5 mb-6" data-testid="payout-email-prompt">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                    <AlertCircle size={18} className="text-orange-400" />
                  </div>
                  <div>
                    <p className="font-black text-orange-300 text-sm uppercase tracking-wide mb-0.5">
                      ⚡ Add Your PayPal to Receive Payouts
                    </p>
                    <p className="text-xs text-orange-100/80 leading-relaxed">
                      Your affiliate bonuses and monthly residuals are paid <strong className="text-orange-200">instantly via PayPal</strong> — but we need your PayPal email first. Without it, earnings are wallet-credited only and not sent out.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400/60 pointer-events-none" />
                    <Input
                      type="email"
                      placeholder="your-paypal@email.com"
                      value={payoutEmailInput}
                      onChange={(e) => setPayoutEmailInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && payoutEmailInput.trim()) savePayoutEmailMutation.mutate(payoutEmailInput.trim()); }}
                      className="pl-8 bg-black/30 border-orange-400/30 focus:border-orange-400/60 text-white placeholder:text-orange-400/40"
                      data-testid="input-payout-email-referrals"
                    />
                  </div>
                  <Button
                    onClick={() => savePayoutEmailMutation.mutate(payoutEmailInput.trim())}
                    disabled={!payoutEmailInput.trim() || savePayoutEmailMutation.isPending}
                    className="bg-orange-500 hover:bg-orange-400 text-black font-bold shrink-0 gap-1.5"
                    data-testid="button-save-payout-email-referrals"
                  >
                    {savePayoutEmailMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save PayPal Email
                  </Button>
                </div>
                <p className="text-[11px] text-orange-400/50 mt-2">
                  You can also update this anytime in your{" "}
                  <a href="/profile" className="underline hover:text-orange-300 inline-flex items-center gap-0.5">
                    Profile <ExternalLink size={10} />
                  </a>
                </p>
              </div>
            )}

            {/* PayPal confirmed banner */}
            {isAuthenticated && (user?.paypalPayoutEmail || payoutEmailSaved) && (
              <div className="rounded-xl border border-green-400/20 bg-green-500/5 px-4 py-3 mb-6 flex items-center gap-3" data-testid="payout-email-confirmed">
                <Check size={16} className="text-green-400 shrink-0" />
                <p className="text-xs text-green-300">
                  <strong className="text-green-200">PayPal payouts active</strong> — your affiliate bonuses &amp; monthly residuals will be sent automatically to{" "}
                  <span className="font-mono text-green-400">{user?.paypalPayoutEmail || payoutEmailInput}</span>
                </p>
                <a href="/profile" className="ml-auto text-[11px] text-green-400/60 hover:text-green-300 underline shrink-0">Edit</a>
              </div>
            )}

            <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-primary" />
              Your Residual Income
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard icon={Users} label="Affiliate Members" value={stats?.totalReferred || 0} color="bg-primary/20 text-primary" />
              <StatCard icon={Check} label="Active Affiliates" value={activeReferrals} sub={`Earning $${perReferral}/mo each`} color="bg-emerald-500/20 text-emerald-400" />
              <StatCard icon={Repeat} label="Monthly Income" value={`$${monthlyIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`} sub="Recurring every month" color="bg-green-500/20 text-green-400" />
              <StatCard icon={TrendingUp} label="Yearly Projection" value={`$${(monthlyIncome * 12).toLocaleString(undefined, {minimumFractionDigits: 2})}`} sub="If all stay active" color="bg-blue-500/20 text-blue-400" />
            </div>
            {(stats?.instantBonus ?? 0) > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-10 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                  <DollarSign size={20} className="text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-display font-bold text-yellow-400">
                    ${stats.instantBonus.toFixed(2)} Instant Referral Bonus Earned
                  </p>
                  <p className="text-[11px] text-yellow-400/60">
                    Instant payout credited when your referred member signs up
                  </p>
                </div>
              </div>
            )}


            {(isLegend || isFounder) && (
              <Card className="bg-gradient-to-r from-yellow-500/10 via-yellow-600/5 to-yellow-500/10 border border-yellow-500/30 mb-10 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                      <TrendingUp size={28} className="text-yellow-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display font-bold text-lg text-yellow-400 mb-1">Legend Daily Referral Challenge</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Refer just <span className="text-yellow-400 font-bold">1 new Legend per day</span> and watch your residual income explode:
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-black/30 rounded-xl p-3 text-center border border-yellow-500/10">
                          <p className="text-[11px] text-muted-foreground">After 1 Month</p>
                          <p className="font-display font-bold text-yellow-400">$1,500<span className="text-[10px] text-yellow-400/60">/mo</span></p>
                          <p className="text-[10px] text-muted-foreground">30 Legends</p>
                        </div>
                        <div className="bg-black/30 rounded-xl p-3 text-center border border-yellow-500/10">
                          <p className="text-[11px] text-muted-foreground">After 3 Months</p>
                          <p className="font-display font-bold text-yellow-400">$4,500<span className="text-[10px] text-yellow-400/60">/mo</span></p>
                          <p className="text-[10px] text-muted-foreground">90 Legends</p>
                        </div>
                        <div className="bg-black/30 rounded-xl p-3 text-center border border-yellow-500/10">
                          <p className="text-[11px] text-muted-foreground">After 6 Months</p>
                          <p className="font-display font-bold text-yellow-400">$9,125<span className="text-[10px] text-yellow-400/60">/mo</span></p>
                          <p className="text-[10px] text-muted-foreground">182 Legends</p>
                        </div>
                        <div className="bg-black/30 rounded-xl p-3 text-center border border-yellow-500/20 ring-1 ring-yellow-500/20">
                          <p className="text-[11px] text-yellow-400 font-bold">After 1 Year</p>
                          <p className="font-display font-bold text-2xl text-yellow-400">$18,250<span className="text-xs text-yellow-400/60">/mo</span></p>
                          <p className="text-[10px] text-yellow-400/80 font-medium">365 Legends</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-3 text-center">
                        That's <span className="text-yellow-400 font-bold">$219,000 per year</span> in recurring residual income — just from 1 referral a day.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  Your Affiliate Members
                </h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <span>Active:</span>
                  <RotatingNames names={AFFILIATE_NAMES} interval={2200} />
                </div>
                {referralList.length === 0 ? (
                  <Card className="bg-card/30 border-white/5">
                    <CardContent className="p-8 text-center">
                      <Users size={40} className="text-muted-foreground/20 mx-auto mb-3" />
                      <p className="font-display font-bold text-sm mb-1">No affiliate members yet</p>
                      <p className="text-xs text-muted-foreground">Share your link to start building your income stream!</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-card/30 border-white/10 overflow-hidden">
                    <div className="grid grid-cols-3 bg-white/5 border-b border-white/10 px-4 py-2.5">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Member</span>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide text-center">Status</span>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide text-right">Earns</span>
                    </div>
                    {referralList.map((ref: any, i: number) => {
                      const name = ref.referred
                        ? `${ref.referred.firstName || ""} ${ref.referred.lastName || ""}`.trim() || "Member"
                        : "Member";
                      const isActive = ref.status === "active";
                      const isInactive = ref.status === "inactive";
                      const amt = isActive ? ((isLegend || isFounder || ref.referred?.membershipTier === "legend") ? 50 : perReferral) : 0;
                      return (
                        <div
                          key={ref.id}
                          className={cn("grid grid-cols-3 items-center px-4 py-3", i < referralList.length - 1 && "border-b border-white/5")}
                          data-testid={`row-referral-${ref.id}`}
                        >
                          <span className="text-sm font-medium">{name}</span>
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", isActive ? "bg-green-500" : isInactive ? "bg-white/20" : "bg-yellow-500")} />
                            <span className={cn("text-xs", isActive ? "text-green-400" : isInactive ? "text-white/40" : "text-yellow-400")}>
                              {isActive ? "Active" : isInactive ? "Inactive" : "Pending"}
                            </span>
                          </div>
                          <span className={cn("text-sm font-mono text-right", isActive ? "text-green-400" : "text-white/30")}>
                            {isActive ? `$${amt}/mo` : "$0/mo"}
                          </span>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-3 items-center px-4 py-3 bg-white/5 border-t border-white/10">
                      <span className="text-xs text-muted-foreground font-bold">Total</span>
                      <span />
                      <span className="text-sm font-bold font-mono text-right text-primary">
                        ${referralList.filter((r: any) => r.status === "active").reduce((sum: number, r: any) => sum + ((isLegend || isFounder || r.referred?.membershipTier === "legend") ? 50 : perReferral), 0)}/mo
                      </span>
                    </div>
                  </Card>
                )}

                {/* Sub-team panels — founder view only */}
                {isFounder && allTeams.filter((m: any) => m.subTeam?.length > 0).length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h3 className="font-display font-bold text-sm flex items-center gap-2">
                      <Users size={14} className="text-primary" />
                      Your Team's Teams
                    </h3>
                    {allTeams
                      .filter((m: any) => m.subTeam?.length > 0)
                      .map((m: any) => {
                        const memberName = m.referred
                          ? `${m.referred.firstName || ""} ${m.referred.lastName || ""}`.trim() || "Member"
                          : "Member";
                        const activeSubCount = m.subTeam.filter((s: any) => s.status === "active").length;
                        return (
                          <Card key={m.id} className="bg-card/30 border-white/10 overflow-hidden">
                            <div className="flex items-center justify-between bg-white/5 border-b border-white/10 px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-sm font-bold">{memberName}'s Team</span>
                              </div>
                              <span className="text-xs text-primary font-mono font-bold">${activeSubCount * 50}/mo</span>
                            </div>
                            <div className="grid grid-cols-3 bg-white/5 border-b border-white/5 px-4 py-1.5">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Member</span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-center">Status</span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-right">Earns</span>
                            </div>
                            {m.subTeam.map((sub: any, i: number) => {
                              const subName = sub.referred
                                ? `${sub.referred.firstName || ""} ${sub.referred.lastName || ""}`.trim() || "Member"
                                : "Member";
                              const subActive = sub.status === "active";
                              return (
                                <div key={sub.id} className={cn("grid grid-cols-3 items-center px-4 py-2.5", i < m.subTeam.length - 1 && "border-b border-white/5")}>
                                  <span className="text-xs font-medium">{subName}</span>
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className={cn("w-2 h-2 rounded-full shrink-0", subActive ? "bg-green-500" : "bg-white/20")} />
                                    <span className={cn("text-[10px]", subActive ? "text-green-400" : "text-white/40")}>
                                      {subActive ? "Active" : sub.status === "inactive" ? "Inactive" : "Pending"}
                                    </span>
                                  </div>
                                  <span className={cn("text-xs font-mono text-right", subActive ? "text-green-400" : "text-white/30")}>
                                    {subActive ? "$50/mo" : "$0/mo"}
                                  </span>
                                </div>
                              );
                            })}
                          </Card>
                        );
                      })}
                  </div>
                )}

              </div>

              <div>
                <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <Gift size={18} className="text-primary" />
                  Have an Affiliate Code?
                </h2>
                <Card className="bg-card/30 border-white/5 mb-6">
                  <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground mb-4">
                      If a BetFans member shared their affiliate code with you, enter it below to connect your accounts.
                    </p>
                    <div className="flex gap-3">
                      <Input
                        placeholder="Enter affiliate code (e.g. BF-XXXX-XXXX)"
                        value={applyCode}
                        onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                        className="bg-background/50 border-white/10 font-mono"
                        data-testid="input-apply-code"
                      />
                      <Button
                        onClick={() => applyMutation.mutate(applyCode)}
                        disabled={!applyCode.trim() || applyMutation.isPending}
                        className="shrink-0 gap-2"
                        data-testid="button-apply-code"
                      >
                        {applyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Apply
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/30 border-white/5">
                  <CardContent className="p-6">
                    <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp size={14} className="text-primary" />
                      How Affiliate Income Works
                    </h3>
                    <div className="space-y-3 text-xs text-muted-foreground">
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <DollarSign size={10} className="text-primary" />
                        </div>
                        <p>Every BetFans Legend member is an affiliate. You earn an <span className="text-white font-medium">instant payout</span> the moment someone signs up with your code, plus <span className="text-white font-medium">$50/month</span> as long as they stay active.</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Repeat size={10} className="text-primary" />
                        </div>
                        <p>Income is <span className="text-white font-medium">recurring and automatic</span>. No extra work needed once they join.</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <TrendingUp size={10} className="text-primary" />
                        </div>
                        <p><span className="text-white font-medium">No limits or caps</span>. 10, 1,000, or 1,000,000 referrals — every single one pays you an instant bonus plus monthly residual income.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            </>
            )}
          </>
        )}

        {activeTab === "leaderboard" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <StatCard icon={Trophy} label="Top Earners" value={leaderboard.length} color="bg-primary/20 text-primary" />
              <StatCard icon={DollarSign} label="Monthly Payouts" value={`$${totalMonthlyPayout.toLocaleString()}`} color="bg-green-500/20 text-green-400" />
              <StatCard icon={Users} label="Total Affiliates" value={totalReferrals.toLocaleString()} color="bg-blue-500/20 text-blue-400" />
              <StatCard icon={Crown} label="#1 Monthly Income" value={leaderboard.length > 0 ? `$${(leaderboard[0].monthlyIncome ?? leaderboard[0].activeReferrals * 5).toLocaleString()}` : "$0"} color="bg-yellow-500/20 text-yellow-400" />
            </div>

            <Card className="bg-gradient-to-r from-yellow-500/5 via-card/30 to-primary/5 border-yellow-500/20 mb-8">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Crown size={16} className="text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-display font-bold text-yellow-400">Affiliates vs. Founder</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Every uncoded signup earns the Founder the residual income instead of you. As an affiliate, every member you bring in with your code takes that income away from the Founder and puts it in your pocket — plus you get the instant payout too.
                    The more you share, the higher you climb — can you beat the Founder?
                  </p>
                </div>
              </CardContent>
            </Card>

            <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <Medal size={18} className="text-primary" />
              Top 10 Residual Income Earners
            </h2>

            {leaderboard.length === 0 ? (
              <Card className="bg-card/30 border-white/5">
                <CardContent className="p-12 text-center">
                  <TrendingUp size={48} className="text-muted-foreground/20 mx-auto mb-4" />
                  <p className="font-display font-bold text-lg mb-2">No earners yet</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Be the first to build your residual income stream through the BetFans Affiliate Program.
                  </p>
                  <Button className="gap-2" onClick={() => setActiveTab("affiliate")}>
                    <Users size={16} /> Start Sharing Your Link
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry: any, index: number) => {
                  const rank = index + 1;
                  const entryMonthlyIncome = entry.monthlyIncome ?? entry.activeReferrals * 5;
                  const yearlyIncome = entryMonthlyIncome * 12;
                  const isTop3 = rank <= 3;
                  const name = entry.firstName && entry.lastName
                    ? `${entry.firstName} ${entry.lastName}`
                    : entry.firstName || entry.lastName || "BetFans Member";
                  const lbKey = `lb-${entry.userId}`;
                  const isExpanded = expandedMembers.has(lbKey);
                  const hasMembers = isFounder && entry.members?.length > 0;

                  return (
                    <Card
                      key={entry.userId}
                      className={cn(
                        "border transition-all overflow-hidden",
                        isTop3
                          ? `bg-gradient-to-r ${rankColors[rank]}`
                          : "bg-card/30 border-white/5"
                      )}
                      data-testid={`card-residual-earner-${rank}`}
                    >
                      <button
                        className={cn("w-full text-left p-4 md:p-5", hasMembers && "cursor-pointer hover:bg-white/3 transition-colors")}
                        onClick={() => {
                          if (!hasMembers) return;
                          setExpandedMembers(prev => {
                            const next = new Set(prev);
                            next.has(lbKey) ? next.delete(lbKey) : next.add(lbKey);
                            return next;
                          });
                        }}
                      >
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className={cn(
                            "w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-display font-bold text-base md:text-lg shrink-0",
                            rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                            rank === 2 ? "bg-slate-300/20 text-slate-300" :
                            rank === 3 ? "bg-amber-700/20 text-amber-600" :
                            "bg-white/5 text-muted-foreground"
                          )}>
                            {rankIcons[rank] || `#${rank}`}
                          </div>

                          <Avatar className="h-10 w-10 md:h-12 md:w-12 border-2 border-white/10">
                            <AvatarImage src={entry.profileImageUrl} />
                            <AvatarFallback className="bg-card text-sm">{name[0]}</AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <p className="font-display font-bold text-sm md:text-base truncate">
                              {name}
                              {entry.isFounder && (
                                <Badge className="ml-2 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[9px] align-middle">
                                  <Crown size={8} className="mr-0.5" /> Founder
                                </Badge>
                              )}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                                <Users size={8} className="mr-1" />
                                {entry.activeReferrals.toLocaleString()} affiliate{entry.activeReferrals !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <DollarSign size={14} className="text-green-400" />
                                <span className="font-display font-bold text-lg md:text-xl text-green-400">
                                  {entryMonthlyIncome.toLocaleString()}
                                </span>
                                <span className="text-xs text-muted-foreground">/mo</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                ${yearlyIncome.toLocaleString()}/yr projected
                              </p>
                            </div>
                            {hasMembers && (
                              isExpanded
                                ? <ChevronUp size={16} className="text-muted-foreground" />
                                : <ChevronDown size={16} className="text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded affiliate list — founder only */}
                      {isFounder && isExpanded && entry.members?.length > 0 && (
                        <div className="border-t border-white/10">
                          <div className="grid grid-cols-3 bg-white/5 border-b border-white/5 px-4 py-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Member</span>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-center">Status</span>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-right">Earns</span>
                          </div>
                          {entry.members.map((m: any, i: number) => {
                            const isActive = m.status === "active";
                            return (
                              <div
                                key={m.id}
                                className={cn("grid grid-cols-3 items-center px-4 py-2.5", i < entry.members.length - 1 && "border-b border-white/5")}
                              >
                                <span className="text-xs font-medium">{m.name}</span>
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-green-500" : "bg-white/20")} />
                                  <span className={cn("text-[10px]", isActive ? "text-green-400" : "text-white/40")}>
                                    {isActive ? "Active" : "Inactive"}
                                  </span>
                                </div>
                                <span className={cn("text-xs font-mono text-right", isActive ? "text-green-400" : "text-white/30")}>
                                  {isActive ? "$50/mo" : "$0/mo"}
                                </span>
                              </div>
                            );
                          })}
                          <div className="grid grid-cols-3 items-center px-4 py-2.5 bg-white/5 border-t border-white/10">
                            <span className="text-xs text-muted-foreground font-bold">Total</span>
                            <span />
                            <span className="text-sm font-bold font-mono text-right text-primary">
                              ${entryMonthlyIncome}/mo
                            </span>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="mt-8 text-center">
              <Button className="gap-2" size="lg" onClick={() => setActiveTab("affiliate")}>
                <TrendingUp size={16} /> Start Earning Residual Income
              </Button>
            </div>
          </>
        )}

        {activeTab === "all-members" && isFounder && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard icon={Users} label="Total Members" value={founderOverview.length} color="bg-primary/20 text-primary" />
              <StatCard
                icon={Check}
                label="Total Active Affiliates"
                value={founderOverview.reduce((s: number, m: any) => s + m.activeReferrals, 0)}
                color="bg-emerald-500/20 text-emerald-400"
              />
              <StatCard
                icon={DollarSign}
                label="Platform Monthly Income"
                value={`$${founderOverview.reduce((s: number, m: any) => s + m.monthlyIncome, 0).toLocaleString()}`}
                color="bg-green-500/20 text-green-400"
              />
              <StatCard
                icon={TrendingUp}
                label="Platform Yearly"
                value={`$${(founderOverview.reduce((s: number, m: any) => s + m.monthlyIncome, 0) * 12).toLocaleString()}`}
                color="bg-blue-500/20 text-blue-400"
              />
            </div>

            {overviewLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            ) : founderOverview.length === 0 ? (
              <Card className="bg-card/30 border-white/5">
                <CardContent className="p-12 text-center">
                  <Users size={48} className="text-muted-foreground/20 mx-auto mb-4" />
                  <p className="font-display font-bold text-lg">No members yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {founderOverview.map((member: any) => {
                  const name = `${member.firstName || ""} ${member.lastName || ""}`.trim() || "Member";
                  const isExpanded = expandedMembers.has(member.userId);
                  const toggleExpanded = () => {
                    setExpandedMembers(prev => {
                      const next = new Set(prev);
                      next.has(member.userId) ? next.delete(member.userId) : next.add(member.userId);
                      return next;
                    });
                  };

                  return (
                    <Card
                      key={member.userId}
                      className={cn(
                        "border overflow-hidden transition-all",
                        member.isFounder
                          ? "bg-gradient-to-r from-yellow-500/10 via-card/30 to-yellow-500/10 border-yellow-500/30"
                          : "bg-card/30 border-white/10"
                      )}
                      data-testid={`card-member-overview-${member.userId}`}
                    >
                      {/* Member header row — always visible */}
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/3 transition-colors text-left"
                        onClick={toggleExpanded}
                        data-testid={`button-expand-member-${member.userId}`}
                      >
                        <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                          <AvatarImage src={member.profileImageUrl} />
                          <AvatarFallback className="bg-card text-xs">{name[0]}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-bold text-sm">{name}</span>
                            {member.isFounder && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[9px]">
                                <Crown size={8} className="mr-0.5" /> Founder
                              </Badge>
                            )}
                            {member.referralCode && (
                              <span className="font-mono text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                                {member.referralCode}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">
                              {member.totalReferred} referred · {member.activeReferrals} active
                            </span>
                            {member.monthlyIncome > 0 && (
                              <span className="text-[11px] text-green-400 font-mono font-bold">
                                ${member.monthlyIncome}/mo
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-mono font-bold text-primary">
                              ${member.monthlyIncome}/mo
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              ${(member.monthlyIncome * 12).toLocaleString()}/yr
                            </p>
                          </div>
                          {isExpanded
                            ? <ChevronUp size={16} className="text-muted-foreground" />
                            : <ChevronDown size={16} className="text-muted-foreground" />
                          }
                        </div>
                      </button>

                      {/* Expanded: their affiliate member table */}
                      {isExpanded && (
                        <div className="border-t border-white/10">
                          {member.members.length === 0 ? (
                            <div className="px-4 py-5 text-center">
                              <p className="text-xs text-muted-foreground">No affiliate members yet</p>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-3 bg-white/5 border-b border-white/5 px-4 py-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Member</span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-center">Status</span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-right">Earns</span>
                              </div>
                              {member.members.map((m: any, i: number) => {
                                const isActive = m.status === "active";
                                return (
                                  <div
                                    key={m.id}
                                    className={cn(
                                      "grid grid-cols-3 items-center px-4 py-2.5",
                                      i < member.members.length - 1 && "border-b border-white/5"
                                    )}
                                  >
                                    <span className="text-xs font-medium">{m.name}</span>
                                    <div className="flex items-center justify-center gap-1.5">
                                      <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-green-500" : "bg-white/20")} />
                                      <span className={cn("text-[10px]", isActive ? "text-green-400" : "text-white/40")}>
                                        {isActive ? "Active" : "Inactive"}
                                      </span>
                                    </div>
                                    <span className={cn("text-xs font-mono text-right", isActive ? "text-green-400" : "text-white/30")}>
                                      {isActive ? "$50/mo" : "$0/mo"}
                                    </span>
                                  </div>
                                );
                              })}
                              <div className="grid grid-cols-3 items-center px-4 py-2.5 bg-white/5 border-t border-white/10">
                                <span className="text-xs text-muted-foreground font-bold">Total</span>
                                <span />
                                <span className="text-sm font-bold font-mono text-right text-primary">
                                  ${member.monthlyIncome}/mo
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <AdBannerInline />
    </div>
  );
}
