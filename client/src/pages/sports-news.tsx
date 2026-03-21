import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Newspaper, ExternalLink, Clock, RefreshCw, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type League = "ALL" | "NFL" | "NBA" | "WNBA" | "NHL" | "MLB" | "MLS" | "NWSL" | "NCAAB" | "NCAABB";

const leagueColors: Record<string, string> = {
  NFL: "bg-green-600/20 text-green-400 border-green-500/30",
  NBA: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  WNBA: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  NHL: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  MLB: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  MLS: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  NWSL: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  NCAAB: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  NCAABB: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const leagueNames: Record<string, string> = {
  NFL: "NFL Football",
  NBA: "NBA Basketball",
  WNBA: "WNBA Basketball",
  NHL: "NHL Hockey",
  MLB: "MLB Baseball",
  MLS: "MLS Soccer",
  NWSL: "NWSL Soccer",
  NCAAB: "College Basketball",
  NCAABB: "College Baseball",
};

function LeagueSection({ league, articles }: { league: string; articles: any[] }) {
  return (
    <section data-testid={`section-news-${league}`}>
      <div className="flex items-center gap-3 mb-4">
        <Badge className={cn("text-xs px-2.5 py-1 border font-display font-bold tracking-wider", leagueColors[league] || "bg-white/10 text-white border-white/20")}>
          {league}
        </Badge>
        <h2 className="text-lg font-display font-bold text-foreground/80">
          {leagueNames[league] || league}
        </h2>
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-xs text-muted-foreground">{articles.length} articles</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article: any) => (
          <Card
            key={article.id}
            className="bg-card/30 border-white/5 hover:border-primary/20 transition-all group overflow-hidden flex flex-col"
            data-testid={`card-news-${article.id}`}
          >
            {article.imageUrl && (
              <div className="relative h-44 overflow-hidden">
                <img
                  src={article.imageUrl}
                  alt={article.headline}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
              </div>
            )}
            <CardContent className={cn("p-4 flex flex-col flex-1", !article.imageUrl && "pt-5")}>
              <h3 className="font-display font-bold text-sm leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-3">
                {article.headline}
              </h3>
              {article.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1">
                  {article.description}
                </p>
              )}
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock size={11} />
                  {article.publishedAt ? timeAgo(article.publishedAt) : "Recent"}
                </div>
                {article.sourceUrl && (
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    data-testid={`link-read-more-${article.id}`}
                  >
                    Read More <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default function SportsNews() {
  const [filter, setFilter] = useState<League>("ALL");

  const { data: articles = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/news", filter],
    queryFn: async () => {
      const url = filter !== "ALL" ? `/api/news?league=${filter}` : "/api/news";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
  });

  const leagues: { value: League; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "NFL", label: "NFL" },
    { value: "NBA", label: "NBA" },
    { value: "WNBA", label: "WNBA" },
    { value: "NHL", label: "NHL" },
    { value: "MLB", label: "MLB" },
    { value: "MLS", label: "MLS" },
    { value: "NWSL", label: "NWSL" },
    { value: "NCAAB", label: "NCAAB" },
    { value: "NCAABB", label: "College BB" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Newspaper size={20} className="text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-news-title">
                Sports News
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Latest headlines from across the sports world, updated throughout the day
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0 self-start"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-news"
          >
            <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {leagues.map((league) => (
            <button
              key={league.value}
              onClick={() => setFilter(league.value)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                filter === league.value
                  ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/10"
              )}
              data-testid={`button-filter-${league.value}`}
            >
              {league.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-12 text-center">
              <Newspaper size={48} className="text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-muted-foreground">No news available right now. Check back soon!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-10">
            {(() => {
              const grouped: Record<string, any[]> = {};
              const leagueOrder = ["NFL", "NBA", "WNBA", "NHL", "MLB", "MLS", "NWSL", "NCAAB", "NCAABB"];
              for (const article of articles) {
                const league = article.league || "OTHER";
                if (!grouped[league]) grouped[league] = [];
                grouped[league].push(article);
              }
              if (filter !== "ALL") {
                const filtered = grouped[filter] || [];
                return (
                  <LeagueSection key={filter} league={filter} articles={filtered} />
                );
              }
              return leagueOrder
                .filter((l) => grouped[l] && grouped[l].length > 0)
                .map((league) => (
                  <LeagueSection key={league} league={league} articles={grouped[league]} />
                ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
