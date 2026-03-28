import { useEffect, type ReactNode } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Membership from "@/pages/membership";

import GameDetail from "@/pages/game-detail";
import Profile from "@/pages/profile";
import Bragging from "@/pages/bragging";
import MembersMap from "@/pages/members-map";
import LeaderboardPage from "@/pages/leaderboard";
import Community from "@/pages/community";
import Advertising from "@/pages/advertising";
import Winners from "@/pages/winners";
import WinnersProbability from "@/pages/winners-probability";
import MemberScorecard from "@/pages/member-scorecard";
import SportsNews from "@/pages/sports-news";
import DailyPicks from "@/pages/daily-picks";
import ArticleReader from "@/pages/article-reader";
import Referrals from "@/pages/referrals";
import ResidualIncome from "@/pages/residual-income";
import Auth from "@/pages/auth";
import { PhoneConsentModal } from "@/components/PhoneConsentModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const PUBLIC_PATHS = ["/", "/auth", "/membership"];
const FOUNDER_CODES = ["NIKCOX"];
const PAID_TIERS = ["rookie", "pro", "legend"];

function PaymentGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  const isPublic = PUBLIC_PATHS.some(
    (p) => location === p || location.startsWith(p + "?") || location.startsWith(p + "/")
  );

  useEffect(() => {
    if (isLoading || isPublic) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    const isFounder = FOUNDER_CODES.includes(user.referralCode ?? "");
    const isPaid = PAID_TIERS.includes(user.membershipTier ?? "");
    if (!isFounder && !isPaid) {
      navigate("/membership");
    }
  }, [user, isLoading, location, isPublic]);

  if (isLoading && !isPublic) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <PaymentGate>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/membership" component={Membership} />
      <Route path="/bragging" component={Bragging} />
      <Route path="/community" component={Community} />
      <Route path="/members-map" component={MembersMap} />
      <Route path="/leaderboard/daily" component={LeaderboardPage} />
      <Route path="/leaderboard/weekly" component={LeaderboardPage} />
      <Route path="/leaderboard/monthly" component={LeaderboardPage} />
      <Route path="/leaderboard/annual" component={LeaderboardPage} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/profile" component={Profile} />
      <Route path="/winners" component={Winners} />
      <Route path="/winners/:userId" component={MemberScorecard} />
      <Route path="/winners-probability" component={WinnersProbability} />
      <Route path="/news" component={SportsNews} />
      <Route path="/article" component={ArticleReader} />
      <Route path="/daily-picks" component={DailyPicks} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/residual-income" component={ResidualIncome} />
      <Route path="/auth" component={Auth} />
      <Route path="/advertising" component={Advertising} />
      <Route path="/game/:id" component={GameDetail} />
      <Route component={NotFound} />
    </Switch>
    </PaymentGate>
  );
}

function AffiliateCodeCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      localStorage.setItem("betfans_affiliate_code", refCode.toUpperCase());
      params.delete("ref");
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);
  return null;
}

function ReplitFounderAutoLogin() {
  useEffect(() => {
    fetch("/api/auth/replit-auto", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.recognized) {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }
      })
      .catch(() => {});
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AffiliateCodeCapture />
        <ReplitFounderAutoLogin />
        <ErrorBoundary>
          <Router />
          <PhoneConsentModal />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
