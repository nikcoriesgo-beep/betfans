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
import MembersMap from "@/pages/members-map";
import LeaderboardPage from "@/pages/leaderboard";
import Advertising from "@/pages/advertising";
import Winners from "@/pages/winners";
import WinnersProbability from "@/pages/winners-probability";
import MemberScorecard from "@/pages/member-scorecard";
import SportsNews from "@/pages/sports-news";
import BaseballBreakfast from "@/pages/baseball-breakfast";
import DailyPicks from "@/pages/daily-picks";
import ArticleReader from "@/pages/article-reader";
import Referrals from "@/pages/referrals";
import ResidualIncome from "@/pages/residual-income";
import HowToPlay from "@/pages/how-to-play";
import OfficialRules from "@/pages/official-rules";
import Auth from "@/pages/auth";
import { PhoneConsentModal } from "@/components/PhoneConsentModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";

declare const __BUILD_ID__: string;

const FOUNDER_CODES = ["NIKCOX"];
const PAID_TIERS = ["rookie", "pro", "legend"];
const BUILD_KEY = "bf_build_id";

function PaymentGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading || !user) return;
    const isFounder = FOUNDER_CODES.includes(user.referralCode ?? "");
    const isPaid = PAID_TIERS.includes(user.membershipTier ?? "");
    const isMembershipPage = location === "/membership" || location.startsWith("/membership?");
    const isAuthPage = location === "/auth" || location.startsWith("/auth?");
    const isOfficialRulesPage = location === "/official-rules";
    if (!isFounder && !isPaid && !isMembershipPage && !isAuthPage && !isOfficialRulesPage) {
      navigate("/membership");
    }
  }, [user, isLoading, location]);

  return <>{children}</>;
}

function Router() {
  return (
    <PaymentGate>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/membership" component={Membership} />
      <Route path="/members-map" component={MembersMap} />
      <Route path="/leaderboard/daily" component={LeaderboardPage} />
      <Route path="/leaderboard/annual" component={LeaderboardPage} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/profile" component={Profile} />
      <Route path="/winners" component={Winners} />
      <Route path="/winners/:userId" component={MemberScorecard} />
      <Route path="/winners-probability" component={WinnersProbability} />
      <Route path="/news" component={SportsNews} />
      <Route path="/article" component={ArticleReader} />
      <Route path="/baseball-breakfast" component={BaseballBreakfast} />
      <Route path="/daily-picks" component={DailyPicks} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/residual-income" component={ResidualIncome} />
      <Route path="/how-to-play" component={HowToPlay} />
      <Route path="/auth" component={Auth} />
      <Route path="/official-rules" component={OfficialRules} />
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

function BuildVersionGuard() {
  useEffect(() => {
    const stored = localStorage.getItem(BUILD_KEY);
    if (stored !== __BUILD_ID__) {
      fetch("/api/auth/logout", { method: "POST", credentials: "include" })
        .catch(() => {})
        .finally(() => {
          const affiliate = localStorage.getItem("betfans_affiliate_code");
          localStorage.clear();
          if (affiliate) localStorage.setItem("betfans_affiliate_code", affiliate);
          localStorage.setItem(BUILD_KEY, __BUILD_ID__);
          queryClient.clear();
          window.location.href = "/";
        });
    }
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BuildVersionGuard />
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
