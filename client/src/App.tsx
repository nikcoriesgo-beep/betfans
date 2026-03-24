import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Membership from "@/pages/membership";

import GameDetail from "@/pages/game-detail";
import Profile from "@/pages/profile";
import Merch from "@/pages/merch";
import MerchOrderSuccess from "@/pages/merch-order-success";
import Bragging from "@/pages/bragging";
import MembersMap from "@/pages/members-map";
import LeaderboardPage from "@/pages/leaderboard";
import Community from "@/pages/community";
import Advertising from "@/pages/advertising";
import Winners from "@/pages/winners";
import WinnersProbability from "@/pages/winners-probability";
import SportsNews from "@/pages/sports-news";
import BaseballBreakfast from "@/pages/baseball-breakfast";
import DailyPicks from "@/pages/daily-picks";
import ArticleReader from "@/pages/article-reader";
import Referrals from "@/pages/referrals";
import ResidualIncome from "@/pages/residual-income";
import Auth from "@/pages/auth";
import { MusicPlayer } from "@/components/MusicPlayer";
import { PhoneConsentModal } from "@/components/PhoneConsentModal";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/membership" component={Membership} />
      <Route path="/merch" component={Merch} />
      <Route path="/merch/order-success" component={MerchOrderSuccess} />
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
      <Route path="/winners-probability" component={WinnersProbability} />
      <Route path="/news" component={SportsNews} />
      <Route path="/article" component={ArticleReader} />
      <Route path="/baseball-breakfast" component={BaseballBreakfast} />
      <Route path="/daily-picks" component={DailyPicks} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/residual-income" component={ResidualIncome} />
      <Route path="/auth" component={Auth} />
      <Route path="/advertising" component={Advertising} />
      <Route path="/game/:id" component={GameDetail} />
      <Route component={NotFound} />
    </Switch>
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
        <Router />
        <PhoneConsentModal />
        <MusicPlayer />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
