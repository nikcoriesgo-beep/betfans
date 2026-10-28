import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CodeState = "idle" | "checking" | "valid" | "invalid";

interface CodeInfo {
  referrerName: string;
  tier: string;
}

import { initialAffiliateCode } from "@shared/referralDefaults";

export default function Auth() {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("NIKCOX");
  const [codeState, setCodeState] = useState<CodeState>("idle");
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref") || params.get("code");
    if (refCode) {
      localStorage.setItem("betfans_affiliate_code", refCode);
    }
    setReferralCode(initialAffiliateCode(refCode, localStorage.getItem("betfans_affiliate_code")));
  }, []);

  // Validate referral code whenever it changes (debounced)
  useEffect(() => {
    let cancelled = false;
    if (mode !== "signup") return;
    const code = referralCode.trim();
    if (!code) {
      setCodeState("idle");
      setCodeInfo(null);
      return;
    }
    setCodeState("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.valid) {
          setCodeState("valid");
          setCodeInfo({ referrerName: data.referrerName, tier: data.tier });
        } else {
          setCodeState("invalid");
          setCodeInfo(null);
        }
      } catch {
        if (cancelled) return;
        setCodeState("idle");
        setCodeInfo(null);
      }
    }, 500);
    return () => { cancelled = true; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [referralCode, mode]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && (!referralCode.trim() || codeState !== "valid")) {
      toast({ title: "Valid affiliate code required", description: "Enter your affiliate's code and wait for validation.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const body: any = { phone: phone.replace(/\D/g, ""), password };
    if (mode === "signup") {
      body.firstName = firstName;
      body.lastName = lastName;
      if (email.trim()) body.email = email.trim().toLowerCase();
      body.referralCode = referralCode.trim().toUpperCase();
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      localStorage.removeItem("betfans_affiliate_code");

      if (mode === "signup") {
        const affiliateName = codeInfo?.referrerName || "BetFans";
        toast({ title: "Welcome to BetFans!", description: `Signed up under ${affiliateName}` });
      }
      const signedInUser = await queryClient.fetchQuery<{ membershipTier: string } | null>({
        queryKey: ["/api/auth/user"],
        queryFn: async () => (await apiRequest("GET", "/api/auth/user")).json(),
      });
      setLocation(mode === "signup" ? "/master-championships" : signedInUser?.membershipTier === "free_play" ? "/daily-picks" : "/dashboard");
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  const tierBadgeColor = (tier: string) => {
    if (tier === "founder") return "text-yellow-400";
    if (tier === "legend") return "text-purple-400";
    if (tier === "pro") return "text-blue-400";
    return "text-green-400";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4">
        <Card className="w-full max-w-md bg-card/50 border-white/10 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-display font-bold">
              {mode === "signup" ? "Join BetFans" : "Welcome Back"}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {mode === "signup"
                ? "Start with Free Play — daily picks and Master Championships for $0"
                : "Sign in to your account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">First Name</label>
                      <Input
                        data-testid="input-first-name"
                        placeholder="First name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="bg-background/50 border-white/10"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Last Name</label>
                      <Input
                        data-testid="input-last-name"
                        placeholder="Last name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="bg-background/50 border-white/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Email <span className="text-xs opacity-60">(optional)</span></label>
                    <Input
                      data-testid="input-email"
                      type="email"
                      placeholder="you@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-background/50 border-white/10"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Phone Number</label>
                <Input
                  data-testid="input-phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  required
                  className="bg-background/50 border-white/10"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Password</label>
                <div className="relative">
                  <Input
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-background/50 border-white/10 pr-14"
                  />
                  <button
                    type="button"
                    data-testid="button-toggle-password"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-1.5 top-1/2 flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              {mode === "signup" && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Affiliate Code <span className="text-xs opacity-60">(who referred you?)</span>
                  </label>
                  <div className="relative">
                    <Input
                      data-testid="input-referral-code"
                      placeholder="Enter affiliate code"
                      value={referralCode}
                      onChange={(e) => {
                        setReferralCode(e.target.value.toUpperCase());
                        setCodeState("idle");
                        setCodeInfo(null);
                      }}
                      className={`bg-background/50 border-white/10 font-mono tracking-widest pr-8 ${
                        codeState === "valid" ? "border-green-500/60" :
                        codeState === "invalid" ? "border-red-500/60" : ""
                      }`}
                    />
                    {codeState === "checking" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">...</span>
                    )}
                    {codeState === "valid" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-sm">✓</span>
                    )}
                    {codeState === "invalid" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✗</span>
                    )}
                  </div>
                  {codeState === "valid" && codeInfo && (
                    <p data-testid="text-referrer-name" className="mt-1.5 text-xs flex items-center gap-1.5">
                      <span className="text-green-400">Referred by:</span>
                      <span className={`font-semibold ${tierBadgeColor(codeInfo.tier)}`}>
                        {codeInfo.referrerName}
                      </span>
                    </p>
                  )}
                  {codeState === "invalid" && (
                    <p className="mt-1.5 text-xs text-red-400">Code not found. Enter a valid affiliate code to join Free Play.</p>
                  )}
                </div>
              )}
              <Button
                data-testid="button-auth-submit"
                type="submit"
                disabled={loading || (mode === "signup" && codeState !== "valid")}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 text-base"
              >
                {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signup" ? (
                <>
                  Already have an account?{" "}
                  <button
                    data-testid="link-switch-to-login"
                    onClick={() => setMode("login")}
                    className="text-primary hover:underline font-medium"
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  New to BetFans?{" "}
                  <a
                    data-testid="link-choose-membership"
                    href="/membership"
                    className="text-primary hover:underline font-medium"
                  >
                    Choose a membership plan
                  </a>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
