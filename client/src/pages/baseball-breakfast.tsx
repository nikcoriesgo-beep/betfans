import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trophy, TrendingUp, Flame, Target, CircleDot, Clock, Loader2, Coffee, Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

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

function resultBadge(result: string) {
  if (result === "win") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">WIN</Badge>;
  if (result === "loss") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">LOSS</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">PENDING</Badge>;
}

export default function BaseballBreakfast() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/baseball-breakfast"],
  });

  const founder = data?.founder;
  const picks = data?.picks || [];
  const stats = data?.stats || { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0, totalPicks: 0 };
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">

        <div className="relative mb-10 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/40 via-card/60 to-red-900/20 border border-white/5 p-6 md:p-10">
          <div className="absolute top-4 right-4 opacity-10">
            <Coffee size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Sun size={16} className="text-yellow-400" />
              <span className="text-xs text-yellow-400/80 font-medium tracking-wider uppercase">Good Morning</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-display font-bold mb-2" data-testid="text-bb-title">
              Baseball For Breakfast
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-xl">
              The Founder's daily MLB picks, served fresh every morning. Check back daily for new selections and track the season-long record.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-3">{today}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            {founder && (
              <div className="flex items-center gap-4 mb-8 p-4 rounded-xl bg-card/20 border border-white/5 w-fit">
                {founder.profileImageUrl ? (
                  <img src={founder.profileImageUrl} alt="Founder" className="w-12 h-12 rounded-full border-2 border-primary/30" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                    {(founder.firstName?.[0] || "F").toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-display font-bold text-sm">
                    {founder.firstName} {founder.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">Founder &middot; MLB Specialist</p>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] ml-2">FOUNDER</Badge>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                MLB Season Stats
              </h2>
              <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 text-[10px]">MLB ONLY</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
              <StatCard icon={Trophy} label="MLB Record" value={`${stats.wins}-${stats.losses}`} color="bg-primary/20 text-primary" />
              <StatCard icon={TrendingUp} label="MLB ROI" value={`${stats.roi > 0 ? "+" : ""}${stats.roi}%`} color={stats.roi >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"} />
              <StatCard icon={Target} label="MLB Win Rate" value={stats.totalPicks > 0 ? `${Math.round((stats.wins / stats.totalPicks) * 100)}%` : "—"} color="bg-blue-500/20 text-blue-400" />
              <StatCard icon={CircleDot} label="MLB Picks" value={stats.totalPicks} color="bg-violet-500/20 text-violet-400" />
              <StatCard icon={Flame} label="MLB Streak" value={stats.streak > 0 ? `${stats.streak}W` : "—"} color="bg-orange-500/20 text-orange-400" />
              <StatCard
                icon={TrendingUp}
                label="MLB Profit"
                value={`${stats.profit >= 0 ? "+" : ""}${stats.profit.toFixed(2)}u`}
                color={stats.profit >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}
              />
            </div>

            <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
              <Coffee size={18} className="text-yellow-400" />
              Today's MLB Picks
            </h2>

            {picks.length === 0 ? (
              <Card className="bg-card/30 border-white/5">
                <CardContent className="p-10 text-center">
                  <Coffee size={40} className="text-muted-foreground/20 mx-auto mb-3" />
                  <p className="font-display font-bold text-sm mb-1">No picks yet today</p>
                  <p className="text-xs text-muted-foreground">
                    The Founder hasn't posted today's MLB picks yet. Check back soon — fresh picks are served daily!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {picks.map((pick: any) => (
                  <Card
                    key={pick.id}
                    className="bg-card/30 border-white/5 hover:border-primary/20 transition-all"
                    data-testid={`card-pick-${pick.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 text-[10px]">
                          MLB
                        </Badge>
                        {resultBadge(pick.result)}
                      </div>
                      {pick.game && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1">
                            {pick.game.awayTeam} @ {pick.game.homeTeam}
                          </p>
                          {pick.game.startTime && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                              <Clock size={10} />
                              {new Date(pick.game.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{pick.predictionType}</p>
                        <p className="font-display font-bold text-sm">{pick.pick}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{pick.odds > 0 ? `+${pick.odds}` : pick.odds}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
