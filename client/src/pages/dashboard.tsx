import { Navbar } from "@/components/layout/Navbar";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { DailyPredictions } from "@/components/dashboard/DailyPredictions";
import { PlaceBetModal } from "@/components/dashboard/PlaceBetModal";
import { CommunityChat } from "@/components/dashboard/CommunityChat";
import { Button } from "@/components/ui/button";
import { Plus, Users, Trophy, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { AdSidebar } from "@/components/AdBanner";
import { SharePicksCard } from "@/components/SharePicksCard";
import { Share2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

function ShareMyStats({ username, profileImage, predictions }: { username: string; profileImage?: string; predictions: any[] }) {
  const [showCard, setShowCard] = useState(false);
  const wins = predictions.filter((p: any) => p.result === "win").length;
  const losses = predictions.filter((p: any) => p.result === "loss").length;
  const total = wins + losses;
  const winRate = total > 0 ? `${((wins / total) * 100).toFixed(1)}%` : "0%";

  let streakCount = 0;
  let streakType = "";
  for (const p of predictions) {
    if (!p.result || p.result === "pending") continue;
    if (!streakType) { streakType = p.result; streakCount = 1; }
    else if (p.result === streakType) streakCount++;
    else break;
  }
  const streak = streakCount > 0 ? `${streakCount}${streakType === "win" ? "W" : "L"}` : "N/A";

  const recentPicks = predictions.slice(0, 5).map((p: any) => ({
    game: p.pick || "Pick",
    pick: `${p.predictionType || "bet"}`,
    result: p.result === "win" ? "won" : p.result === "loss" ? "lost" : "pending",
    odds: p.odds || "N/A",
  }));

  if (!showCard) {
    return (
      <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-xl p-6">
        <h3 className="font-display font-bold text-lg mb-2 flex items-center gap-2">
          <Share2 size={16} className="text-primary" /> Share Your Stats
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Show off your record and picks. Share to social media or screenshot your stats card.
        </p>
        <Button size="sm" className="gap-2" onClick={() => setShowCard(true)} data-testid="button-show-share-card">
          <Share2 size={14} /> Create Share Card
        </Button>
      </div>
    );
  }

  return (
    <div>
      <SharePicksCard data={{
        username,
        record: `${wins}-${losses}`,
        winRate,
        streak,
        picks: recentPicks,
        profileImage,
      }} />
    </div>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: predictions = [] } = useQuery<any[]>({
    queryKey: ["/api/predictions"],
    queryFn: async () => {
      const res = await fetch("/api/predictions", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated,
  });

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast({ title: "Welcome to BetFans!", description: "Your membership is now active. Let's make some picks!" });
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  const displayName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User" : "Guest";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <CommunityChat />
      <div className="container mx-auto px-4 pt-24 pb-12">
        {/* Live Community Stats */}
        <div className="mb-8 grid grid-cols-2 lg:grid-cols-3 gap-4" data-testid="live-community-stats">
          <div className="bg-card/50 backdrop-blur-sm border border-primary/20 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Users size={22} className="text-primary" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-display font-bold text-primary" data-testid="text-live-members">
                {memberCount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Active Members</div>
            </div>
          </div>
          <div className="bg-card/50 backdrop-blur-sm border border-yellow-500/20 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
              <Trophy size={22} className="text-yellow-500" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-display font-bold text-yellow-500" data-testid="text-live-prize-pool">
                ${prizePool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Prize Pool</div>
            </div>
          </div>
        </div>

        <PrizePoolQualRule compact className="mb-8" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold" data-testid="text-dashboard-title">Dashboard</h1>
            <p className="text-muted-foreground" data-testid="text-welcome">
              {isAuthenticated ? `Welcome back, ${displayName}` : "Sign in to track your predictions"}
            </p>
          </div>
          {isAuthenticated ? (
            <PlaceBetModal 
              trigger={
                <Button className="gap-2 shadow-[0_0_15px_rgba(34,197,94,0.4)]" data-testid="button-new-prediction">
                  <Plus size={16} />
                  New Prediction
                </Button>
              }
            />
          ) : (
            <a href="/auth">
              <Button className="gap-2 shadow-[0_0_15px_rgba(34,197,94,0.4)]" data-testid="button-sign-in-predict">
                Sign In to Predict
              </Button>
            </a>
          )}
        </div>

        <div className="space-y-8">
          <StatsOverview />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <DailyPredictions />
              <Leaderboard />
            </div>
            
            <div className="space-y-6">
              <div className="bg-card/50 backdrop-blur-sm border border-white/5 rounded-xl p-6">
                <h3 className="font-display font-bold text-lg mb-4" data-testid="text-recent-activity">Recent Activity</h3>
                <div className="space-y-4">
                  {predictions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {isAuthenticated ? "No predictions yet. Make your first one!" : "Sign in to see your activity"}
                    </p>
                  ) : (
                    predictions.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="flex items-center gap-3 pb-3 border-b border-white/5 last:border-0 last:pb-0" data-testid={`activity-prediction-${p.id}`}>
                        <div className={`w-2 h-2 rounded-full ${p.result === 'win' ? 'bg-green-500' : p.result === 'loss' ? 'bg-red-500' : 'bg-primary'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{p.pick}</p>
                          <p className="text-xs text-muted-foreground">{p.predictionType}</p>
                        </div>
                        <span className={`text-xs font-mono ${p.result === 'win' ? 'text-green-400' : p.result === 'loss' ? 'text-red-400' : 'text-primary'}`}>
                          {(p.result || "PENDING").toUpperCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 rounded-xl p-6">
                <h3 className="font-display font-bold text-lg mb-2">Weekly Challenge</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Predict 5 NBA winners correctly in a row to win the "Hoops King" badge and $500.
                </p>
                <div className="w-full bg-black/20 h-2 rounded-full mb-2 overflow-hidden">
                  <div className="bg-primary h-full w-3/5" />
                </div>
                <p className="text-xs text-right font-mono text-primary">3/5 Completed</p>
              </div>

              {isAuthenticated && predictions.length > 0 && (
                <ShareMyStats
                  username={displayName}
                  profileImage={user?.profileImageUrl}
                  predictions={predictions}
                />
              )}

              <AdSidebar />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
