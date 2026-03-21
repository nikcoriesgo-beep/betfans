import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, DollarSign, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export function StatsOverview() {
  const { isAuthenticated } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const winRate = stats && stats.wins + stats.losses > 0
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
    : "0.0";

  const statCards = [
    {
      title: "Win Rate",
      value: stats ? `${winRate}%` : "--",
      change: "+2.4%",
      icon: Target,
      color: "text-blue-400",
    },
    {
      title: "Current ROI",
      value: stats ? `+${(stats.roi || 0).toFixed(1)}%` : "--",
      change: "+5.2%",
      icon: TrendingUp,
      color: "text-primary",
    },
    {
      title: "Total Profit",
      value: stats ? `$${Math.round(stats.profit || 0).toLocaleString()}` : "--",
      change: "+$850",
      icon: DollarSign,
      color: "text-green-400",
    },
    {
      title: "Active Streak",
      value: stats ? `${stats.streak || 0} Wins` : "--",
      change: stats?.streak > 2 ? "On Fire" : "Building",
      icon: Activity,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat, i) => (
        <Card key={i} className="bg-card/50 backdrop-blur-sm border-white/5 hover:border-primary/20 transition-colors" data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display" data-testid={`text-stat-value-${i}`}>{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-400 font-medium">{stat.change}</span> from last month
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
