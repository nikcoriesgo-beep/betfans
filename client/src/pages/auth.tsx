import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function Auth() {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref") || params.get("code");
    if (refCode) {
      localStorage.setItem("betfans_affiliate_code", refCode);
    }
    const stored = localStorage.getItem("betfans_affiliate_code") || refCode || "NIKCOX";
    setReferralCode(stored.toUpperCase());
  }, []);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const body: any = { phone: phone.replace(/\D/g, ""), password };
    if (mode === "signup") {
      body.firstName = firstName;
      body.lastName = lastName;
      if (email.trim()) body.email = email.trim().toLowerCase();
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

      if (mode === "signup" && referralCode.trim()) {
        try {
          await fetch("/api/affiliate/apply-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code: referralCode.trim().toUpperCase() }),
          });
          localStorage.removeItem("betfans_affiliate_code");
        } catch {}
      }

      if (mode === "signup") toast({ title: "Welcome to BetFans!" });
      setLocation("/membership");
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
    setLoading(false);
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
                ? "Create your account to start predicting and winning"
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
                <Input
                  data-testid="input-password"
                  type="password"
                  placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-background/50 border-white/10"
                />
              </div>
              {mode === "signup" && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Referral Code <span className="text-xs opacity-60">(optional)</span></label>
                  <Input
                    data-testid="input-referral-code"
                    placeholder="Enter referral code"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    className="bg-background/50 border-white/10 font-mono tracking-widest"
                  />
                </div>
              )}
              <Button
                data-testid="button-auth-submit"
                type="submit"
                disabled={loading}
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
                  Don't have an account?{" "}
                  <button
                    data-testid="link-switch-to-signup"
                    onClick={() => setMode("signup")}
                    className="text-primary hover:underline font-medium"
                  >
                    Create Account
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
