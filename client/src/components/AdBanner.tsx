import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";

const BETFANS_LOGO_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" rx="8" fill="#0a0a0a"/><text x="100" y="32" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="24" letter-spacing="2"><tspan fill="#22c55e">BET</tspan><tspan fill="#ffffff">FANS</tspan></text></svg>`)}`;

interface Ad {
  id: number;
  companyName: string;
  logoUrl: string;
  tagline: string | null;
  websiteUrl: string | null;
  placement: string;
  annualFee: number;
  active: boolean;
  impressions: number;
  clicks: number;
}

function trackImpression(adId: number) {
  fetch(`/api/ads/${adId}/impression`, { method: "POST" }).catch(() => {});
}

function trackClick(adId: number) {
  fetch(`/api/ads/${adId}/click`, { method: "POST" }).catch(() => {});
}

export function AdBannerTop() {
  const { data: ads = [] } = useQuery<Ad[]>({
    queryKey: ["/api/ads", "hero"],
    queryFn: async () => {
      const res = await fetch("/api/ads?placement=hero");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (ads.length === 0) return null;

  return (
    <div className="w-full bg-gradient-to-r from-card/80 via-card/60 to-card/80 border-b border-white/5" data-testid="ad-banner-hero">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-8 py-3 overflow-x-auto">
          {ads.map((ad) => (
            <AdSpot key={ad.id} ad={ad} variant="hero" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdSidebar() {
  const { data: ads = [] } = useQuery<Ad[]>({
    queryKey: ["/api/ads", "sidebar"],
    queryFn: async () => {
      const res = await fetch("/api/ads?placement=sidebar");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (ads.length === 0) return null;

  return (
    <div className="space-y-4" data-testid="ad-sidebar">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center">Sponsored</p>
      {ads.map((ad) => (
        <AdSpot key={ad.id} ad={ad} variant="sidebar" />
      ))}
    </div>
  );
}

export function AdBannerInline() {
  const { data: ads = [] } = useQuery<Ad[]>({
    queryKey: ["/api/ads", "banner"],
    queryFn: async () => {
      const res = await fetch("/api/ads?placement=banner");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (ads.length === 0) return null;

  return (
    <div className="w-full py-4" data-testid="ad-banner-inline">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center mb-2">Sponsored Partners</p>
      <div className="flex items-center justify-center gap-6 flex-wrap">
        {ads.map((ad) => (
          <AdSpot key={ad.id} ad={ad} variant="inline" />
        ))}
      </div>
    </div>
  );
}

export function AdMarquee() {
  const { data: ads = [] } = useQuery<Ad[]>({
    queryKey: ["/api/ads", "marquee"],
    queryFn: async () => {
      const res = await fetch("/api/ads?placement=marquee");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (ads.length === 0) return null;

  return (
    <div className="w-full overflow-hidden bg-card/30 border-y border-white/5 py-3" data-testid="ad-marquee">
      <div className="flex animate-marquee gap-12 items-center whitespace-nowrap">
        {[...ads, ...ads, ...ads].map((ad, i) => (
          <AdSpot key={`${ad.id}-${i}`} ad={ad} variant="marquee" />
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

function AdSpot({ ad, variant }: { ad: Ad; variant: "hero" | "sidebar" | "inline" | "marquee" }) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      trackImpression(ad.id);
    }
  }, [ad.id]);

  const handleClick = () => {
    trackClick(ad.id);
    if (ad.websiteUrl) {
      window.open(ad.websiteUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (variant === "hero") {
    return (
      <button
        onClick={handleClick}
        className="flex items-center gap-4 px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/20 transition-all group shrink-0"
        data-testid={`ad-hero-${ad.id}`}
      >
        <img src={ad.logoUrl} alt={ad.companyName} className="h-8 w-auto object-contain max-w-[120px]" onError={(e) => { (e.target as HTMLImageElement).src = BETFANS_LOGO_SVG; }} />
        {ad.tagline && (
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block">{ad.tagline}</span>
        )}
        <ExternalLink size={10} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
      </button>
    );
  }

  if (variant === "sidebar") {
    return (
      <button
        onClick={handleClick}
        className="w-full p-4 rounded-xl bg-card/40 border border-white/5 hover:border-primary/20 hover:bg-card/60 transition-all group text-left"
        data-testid={`ad-sidebar-${ad.id}`}
      >
        <div className="flex items-center justify-center mb-3">
          <img src={ad.logoUrl} alt={ad.companyName} className="h-10 w-auto object-contain max-w-[160px]" onError={(e) => { (e.target as HTMLImageElement).src = BETFANS_LOGO_SVG; }} />
        </div>
        {ad.tagline && (
          <p className="text-xs text-muted-foreground text-center group-hover:text-foreground transition-colors">{ad.tagline}</p>
        )}
        <div className="flex items-center justify-center gap-1 mt-2">
          <span className="text-[10px] text-primary/60 group-hover:text-primary transition-colors">Learn More</span>
          <ExternalLink size={8} className="text-primary/60 group-hover:text-primary transition-colors" />
        </div>
      </button>
    );
  }

  if (variant === "marquee") {
    return (
      <button
        onClick={handleClick}
        className="flex items-center gap-3 px-4 py-1 hover:opacity-80 transition-opacity shrink-0"
        data-testid={`ad-marquee-${ad.id}`}
      >
        <img src={ad.logoUrl} alt={ad.companyName} className="h-6 w-auto object-contain max-w-[100px] opacity-60 hover:opacity-100 transition-opacity" onError={(e) => { (e.target as HTMLImageElement).src = BETFANS_LOGO_SVG; }} />
        {ad.tagline && (
          <span className="text-[11px] text-muted-foreground/60">{ad.tagline}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/20 transition-all group shrink-0"
      data-testid={`ad-inline-${ad.id}`}
    >
      <img src={ad.logoUrl} alt={ad.companyName} className="h-7 w-auto object-contain max-w-[100px]" onError={(e) => { (e.target as HTMLImageElement).src = BETFANS_LOGO_SVG; }} />
      {ad.tagline && (
        <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">{ad.tagline}</span>
      )}
    </button>
  );
}
