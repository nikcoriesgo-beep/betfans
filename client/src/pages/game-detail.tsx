import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Activity, Shield } from "lucide-react";
import { Link, useRoute } from "wouter";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { PlaceBetModal } from "@/components/dashboard/PlaceBetModal";
import { useQuery } from "@tanstack/react-query";

const MOCK_CHART_DATA = [
  { time: "10am", value: 30 },
  { time: "11am", value: 45 },
  { time: "12pm", value: 42 },
  { time: "1pm", value: 55 },
  { time: "2pm", value: 52 },
  { time: "3pm", value: 68 },
  { time: "4pm", value: 75 },
  { time: "5pm", value: 82 },
];

export default function GameDetail() {
  const [match, params] = useRoute("/game/:id");
  const id = params?.id;

  const { data: game, isLoading } = useQuery({
    queryKey: ["/api/games", id],
    queryFn: async () => {
      const res = await fetch(`/api/games/${id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-12 flex justify-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-12 text-center">
          <h1 className="text-2xl font-bold">Game not found</h1>
          <Link href="/dashboard"><Button variant="outline" className="mt-4">Back to Dashboard</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">
        <Link href="/dashboard">
          <Button variant="ghost" className="gap-2 mb-6 text-muted-foreground hover:text-primary pl-0" data-testid="button-back">
            <ArrowLeft size={16} /> Back to Dashboard
          </Button>
        </Link>

        <div className="bg-card/50 backdrop-blur-md border border-white/10 rounded-2xl p-8 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="text-center md:text-left">
              <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Badge variant="outline" className="border-white/10" data-testid="badge-league">{game.league}</Badge>
                <span>{new Date(game.gameTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                {game.status === "live" && <Badge className="bg-red-500 animate-pulse">LIVE</Badge>}
              </div>
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-3xl md:text-5xl font-display font-bold" data-testid="text-home-team">{game.homeTeam}</div>
                  <div className="text-sm text-muted-foreground mt-1">Home{game.homeScore !== null ? ` (${game.homeScore})` : ""}</div>
                </div>
                <div className="text-2xl font-display text-muted-foreground font-light">vs</div>
                <div className="text-center">
                  <div className="text-3xl md:text-5xl font-display font-bold" data-testid="text-away-team">{game.awayTeam}</div>
                  <div className="text-sm text-muted-foreground mt-1">Away{game.awayScore !== null ? ` (${game.awayScore})` : ""}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[200px]">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
                <div className="text-xs text-primary uppercase font-bold tracking-wider mb-1">Spider Pick</div>
                <div className="text-2xl font-bold font-display text-primary" data-testid="text-spider-pick">
                  {game.isProLocked ? "🔒 Pro Only" : game.spiderPick}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Confidence: {game.spiderConfidence}%</div>
              </div>
              <PlaceBetModal 
                trigger={
                  <Button className="w-full shadow-[0_0_15px_rgba(34,197,94,0.3)]" data-testid="button-place-prediction">Place Prediction</Button>
                }
                defaultGame={{
                  id: game.id,
                  home: game.homeTeam,
                  away: game.awayTeam,
                  spread: game.spread || "-4.5",
                  total: game.total || "224.5",
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="bg-card/30 border-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity size={20} className="text-primary" />
                  Live Betting Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={MOCK_CHART_DATA}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)', fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)', fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: 'hsl(var(--primary))' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-card/30 border-white/5">
                <CardHeader>
                  <CardTitle className="text-lg">Public Sentiment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-bold text-green-400">72%</div>
                      <div className="text-xs text-muted-foreground">Betting {game.homeTeam}</div>
                    </div>
                    <div className="h-12 w-px bg-white/10" />
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-bold text-red-400">28%</div>
                      <div className="text-xs text-muted-foreground">Betting {game.awayTeam}</div>
                    </div>
                  </div>
                  <div className="w-full bg-red-400/20 h-2 rounded-full overflow-hidden">
                    <div className="bg-green-400 h-full w-[72%]" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/30 border-white/5">
                <CardHeader>
                  <CardTitle className="text-lg">Odds Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Spread</span>
                      <span className="text-sm font-bold font-mono">{game.spread || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="text-sm font-bold font-mono">{game.total || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Moneyline</span>
                      <span className="text-sm font-bold font-mono">{game.moneylineHome || "N/A"} / {game.moneylineAway || "N/A"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Shield size={20} />
                  Pro Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">
                  Spider AI analysis for this matchup with {game.spiderConfidence}% confidence.
                </p>
                {!game.isProLocked && game.spiderPick && (
                  <p className="text-sm leading-relaxed font-medium text-primary">
                    Pick: {game.spiderPick}
                  </p>
                )}
                <div className="pt-4 border-t border-primary/20">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Model Confidence</span>
                    <span className="font-bold text-primary">{game.spiderConfidence}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/30 border-white/5">
              <CardHeader>
                <CardTitle>Game Lines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span>{game.homeTeam}</span>
                  <Badge variant="outline" className="border-green-500/50 text-green-500 font-mono">{game.moneylineHome}</Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>{game.awayTeam}</span>
                  <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 font-mono">{game.moneylineAway}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
