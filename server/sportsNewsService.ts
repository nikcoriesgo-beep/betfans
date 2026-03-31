const ESPN_NEWS_ENDPOINTS: Record<string, string> = {
  TOP: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news",
  NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news",
  NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news",
  WNBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/news",
  NHL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news",
  MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news",
  MLS: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/news",
  NWSL: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.nwsl/news",
  NCAAB: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/news",
};

interface ESPNNewsArticle {
  headline: string;
  description?: string;
  published: string;
  images?: { url: string; caption?: string }[];
  links?: { web?: { href: string } };
  categories?: { description?: string; type?: string }[];
  type?: string;
}

export interface NewsArticle {
  id: string;
  headline: string;
  description: string;
  publishedAt: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  league: string;
  category: string | null;
}

let newsCache: { articles: NewsArticle[]; fetchedAt: number } = {
  articles: [],
  fetchedAt: 0,
};

const CACHE_TTL = 10 * 60 * 1000;

async function fetchLeagueNews(league: string): Promise<NewsArticle[]> {
  const url = ESPN_NEWS_ENDPOINTS[league];
  if (!url) return [];

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    const articles: ESPNNewsArticle[] = data.articles || [];

    return articles.slice(0, 15).map((article, i) => ({
      id: `${league}-${i}-${Date.now()}`,
      headline: article.headline,
      description: article.description || "",
      publishedAt: article.published,
      imageUrl: article.images?.[0]?.url || null,
      sourceUrl: article.links?.web?.href || null,
      league,
      category: article.categories?.[0]?.description || null,
    }));
  } catch (err) {
    console.error(`[news] Failed to fetch ${league} news:`, err);
    return [];
  }
}

export async function fetchAllSportsNews(league?: string): Promise<NewsArticle[]> {
  if (league && league !== "ALL") {
    return fetchLeagueNews(league);
  }

  const now = Date.now();
  if (newsCache.articles.length > 0 && now - newsCache.fetchedAt < CACHE_TTL) {
    return newsCache.articles;
  }

  const leagues = Object.keys(ESPN_NEWS_ENDPOINTS).filter((l) => l !== "TOP");
  const results = await Promise.allSettled(leagues.map((l) => fetchLeagueNews(l)));

  const allArticles: NewsArticle[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allArticles.push(...result.value);
    }
  }

  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  newsCache = { articles: allArticles, fetchedAt: now };
  return allArticles;
}
