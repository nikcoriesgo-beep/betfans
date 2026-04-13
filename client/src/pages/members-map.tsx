import { Navbar } from "@/components/layout/Navbar";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe, MapPin, Users, Crown, Star, ChevronRight, Search, Navigation,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier || tier === "rookie") {
    return <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/20">Rookie</Badge>;
  }
  if (tier === "legend") {
    return (
      <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1.5 py-0">
        <Crown size={10} /> Legend
      </Badge>
    );
  }
  return (
    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-0.5 px-1.5 py-0">
      <Star size={10} /> Pro
    </Badge>
  );
}

function tierColor(tier: string | null) {
  if (tier === "legend") return "#a855f7";
  if (tier === "pro") return "hsl(142, 70%, 50%)";
  return "#64748b";
}

function InteractiveMap({ members }: { members: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredMember, setHoveredMember] = useState<any>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const latLngToXY = useCallback((lat: number, lng: number, w: number, h: number) => {
    const x = ((lng + 180) / 360) * w;
    const latRad = (lat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = (h / 2) - (w * mercN) / (2 * Math.PI);
    return { x, y };
  }, []);

  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    setDimensions({ width: w, height: h });

    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(34, 197, 94, 0.06)";
    ctx.lineWidth = 0.5;
    for (let lat = -80; lat <= 80; lat += 20) {
      const p = latLngToXY(lat, -180, w, h);
      const p2 = latLngToXY(lat, 180, w, h);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let lng = -180; lng <= 180; lng += 30) {
      const p = latLngToXY(80, lng, w, h);
      const p2 = latLngToXY(-80, lng, w, h);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    const continents = [
      { points: [[-10,30],[37,10],[37,-10],[30,32],[36,35],[42,28],[55,40],[60,60],[70,100],[65,180],[50,130],[30,120],[35,105],[20,100],[10,77],[-10,115],[-35,140],[-45,170],[-35,150],[-25,115],[5,80],[25,55],[10,40]], name: "Eurasia" },
      { points: [[37,-5],[35,10],[30,10],[10,15],[5,10],[0,10],[-5,12],[-15,15],[-25,30],[-35,20],[-35,28],[-30,30],[-22,35],[-15,40],[-10,42],[0,42],[5,38],[10,35],[15,33],[20,20],[30,32],[35,35],[37,35]], name: "Africa" },
      { points: [[70,-165],[60,-165],[55,-130],[50,-125],[45,-125],[45,-65],[42,-80],[30,-82],[25,-80],[25,-98],[20,-105],[15,-90],[10,-84],[10,-75],[5,-77],[-5,-80],[-15,-75],[-20,-70],[-25,-65],[-35,-72],[-55,-70],[-55,-65],[-50,-74],[-45,-75],[-35,-57],[-20,-40],[-5,-35],[0,-50],[5,-60],[10,-62],[12,-72],[18,-67],[20,-75],[25,-90],[30,-85],[30,-82],[42,-70],[45,-60],[50,-55],[52,-58],[47,-65],[48,-88],[55,-95],[60,-95],[65,-90],[70,-80],[72,-95],[70,-165]], name: "Americas" },
      { points: [[-12,130],[-18,123],[-20,115],[-28,114],[-35,116],[-38,140],[-38,148],[-34,151],[-28,153],[-20,148],[-15,145],[-12,142],[-12,130]], name: "Australia" },
    ];

    for (const c of continents) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.08)";
      ctx.strokeStyle = "rgba(34, 197, 94, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const first = latLngToXY(c.points[0][0], c.points[0][1], w, h);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < c.points.length; i++) {
        const p = latLngToXY(c.points[i][0], c.points[i][1], w, h);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    for (const m of members) {
      const p = latLngToXY(m.latitude, m.longitude, w, h);
      const color = tierColor(m.membershipTier);

      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = color + "10";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = color + "25";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [members, latLngToXY]);

  useEffect(() => {
    drawMap();
    const handleResize = () => drawMap();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawMap]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: any = null;
    for (const m of members) {
      const p = latLngToXY(m.latitude, m.longitude, dimensions.width, dimensions.height);
      const dist = Math.sqrt((mx - p.x) ** 2 + (my - p.y) ** 2);
      if (dist < 15) {
        found = m;
        break;
      }
    }

    if (found) {
      setHoveredMember(found);
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      canvas.style.cursor = "pointer";
    } else {
      setHoveredMember(null);
      canvas.style.cursor = "default";
    }
  }, [members, dimensions, latLngToXY]);

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredMember(null)}
        data-testid="map-canvas"
      />
      {hoveredMember && (
        <div
          className="absolute z-50 pointer-events-none bg-card/95 border border-white/10 rounded-lg p-3 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(tooltipPos.x + 12, dimensions.width - 200),
            top: tooltipPos.y - 10,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-6 w-6 border border-white/20">
              <AvatarImage src={hoveredMember.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${hoveredMember.id}`} />
              <AvatarFallback className="text-[10px]">{hoveredMember.firstName?.[0] || "?"}</AvatarFallback>
            </Avatar>
            <span className="font-bold text-sm">
              {hoveredMember.firstName || "Member"} {hoveredMember.lastName || ""}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={10} />
            {[hoveredMember.city, hoveredMember.state].filter(Boolean).join(", ")}
          </div>
          <div className="mt-1">
            <TierBadge tier={hoveredMember.membershipTier} />
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#64748b]" /> Rookie</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(142, 70%, 50%)" }} /> Pro</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Legend</div>
      </div>
    </div>
  );
}

function SetLocationPanel() {
  const { user } = useAuth();
  const [city, setCity] = useState((user as any)?.city || "");
  const [state, setState] = useState((user as any)?.state || "");
  const [country, setCountry] = useState((user as any)?.country || "US");
  const [detecting, setDetecting] = useState(false);

  const updateLocation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/user/location", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members/by-region"] });
    },
  });

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateLocation.mutate({
          city, state, country,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setDetecting(false);
      },
      () => setDetecting(false)
    );
  };

  const handleSave = () => {
    const stateCoords: Record<string, [number, number]> = {
      "Alabama": [32.32, -86.90], "Alaska": [63.59, -154.49], "Arizona": [34.05, -111.09],
      "Arkansas": [35.20, -91.83], "California": [36.78, -119.42], "Colorado": [39.55, -105.78],
      "Connecticut": [41.60, -72.76], "Delaware": [38.91, -75.53], "Florida": [27.66, -81.52],
      "Georgia": [32.16, -82.90], "Hawaii": [19.90, -155.58], "Idaho": [44.07, -114.74],
      "Illinois": [40.63, -89.40], "Indiana": [40.27, -86.13], "Iowa": [41.88, -93.10],
      "Kansas": [39.01, -98.48], "Kentucky": [37.84, -84.27], "Louisiana": [30.98, -91.96],
      "Maine": [45.25, -69.45], "Maryland": [39.05, -76.64], "Massachusetts": [42.41, -71.38],
      "Michigan": [44.31, -85.60], "Minnesota": [46.73, -94.69], "Mississippi": [32.35, -89.40],
      "Missouri": [37.96, -91.83], "Montana": [46.88, -110.36], "Nebraska": [41.49, -99.90],
      "Nevada": [38.80, -116.42], "New Hampshire": [43.19, -71.57], "New Jersey": [40.06, -74.41],
      "New Mexico": [34.52, -105.87], "New York": [43.30, -74.22], "North Carolina": [35.76, -79.02],
      "North Dakota": [47.55, -101.00], "Ohio": [40.42, -82.91], "Oklahoma": [35.47, -97.52],
      "Oregon": [43.80, -120.55], "Pennsylvania": [41.20, -77.19], "Rhode Island": [41.58, -71.48],
      "South Carolina": [33.84, -81.16], "South Dakota": [43.97, -99.90], "Tennessee": [35.52, -86.58],
      "Texas": [31.97, -99.90], "Utah": [39.32, -111.09], "Vermont": [44.56, -72.58],
      "Virginia": [37.43, -78.66], "Washington": [47.75, -120.74], "West Virginia": [38.60, -80.45],
      "Wisconsin": [43.78, -88.79], "Wyoming": [43.08, -107.29], "DC": [38.91, -77.04],
    };
    const coords = stateCoords[state];
    updateLocation.mutate({
      city, state, country,
      latitude: coords ? coords[0] : 39.83,
      longitude: coords ? coords[1] : -98.58,
    });
  };

  return (
    <Card className="bg-card/40 border-white/10">
      <CardContent className="p-4 space-y-3">
        <h4 className="text-sm font-display font-bold flex items-center gap-2">
          <Navigation size={14} className="text-primary" /> Set Your Location
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="bg-background/50 border-white/10 text-sm" data-testid="input-city" />
          <Input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} className="bg-background/50 border-white/10 text-sm" data-testid="input-state" />
        </div>
        <Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="bg-background/50 border-white/10 text-sm" data-testid="input-country" />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateLocation.isPending} className="flex-1" data-testid="button-save-location">
            {updateLocation.isPending ? "Saving..." : "Save Location"}
          </Button>
          <Button size="sm" variant="outline" onClick={detectLocation} disabled={detecting} className="gap-1 border-white/10" data-testid="button-detect-location">
            <MapPin size={12} /> {detecting ? "..." : "Auto"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MembersMap() {
  const { isAuthenticated } = useAuth();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/members/locations"],
    queryFn: async () => {
      const res = await fetch("/api/members/locations");
      return res.json();
    },
  });

  const { data: regionData } = useQuery<{ byState: Record<string, any[]>; byCountry: Record<string, any[]>; total: number }>({
    queryKey: ["/api/members/by-region"],
    queryFn: async () => {
      const res = await fetch("/api/members/by-region");
      return res.json();
    },
  });

  const byState = regionData?.byState || {};
  const byCountry = regionData?.byCountry || {};

  const allRegions = [
    ...Object.entries(byState).map(([name, members]) => ({ name, type: "state" as const, members, count: members.length })),
    ...Object.entries(byCountry)
      .filter(([name]) => name !== "US")
      .map(([name, members]) => ({ name, type: "country" as const, members, count: members.length })),
  ].sort((a, b) => b.count - a.count);

  const filteredRegions = searchTerm
    ? allRegions.filter((r) => r.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : allRegions;

  const selectedMembers = selectedRegion
    ? allRegions.find((r) => r.name === selectedRegion)?.members || []
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="container mx-auto px-4 pt-24 pb-20">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Globe size={32} className="text-primary" />
            <h1 className="text-4xl md:text-5xl font-display font-bold" data-testid="text-map-heading">
              Member <span className="text-primary">World Map</span>
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            See where BetFans members are located around the globe
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Badge variant="outline" className="border-primary/30 text-primary gap-1">
              <Users size={12} /> {locations.length} Members on Map
            </Badge>
            <Badge variant="outline" className="border-white/20 gap-1">
              <MapPin size={12} /> {Object.keys(byState).length} States
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card className="bg-card/30 border-white/10 overflow-hidden">
              <CardContent className="p-2">
                <InteractiveMap members={locations} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {isAuthenticated && <SetLocationPanel />}

            <Card className="bg-card/40 border-white/10">
              <CardContent className="p-4 space-y-3">
                <h4 className="text-sm font-display font-bold flex items-center gap-2">
                  <MapPin size={14} className="text-primary" /> Browse by Region
                </h4>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search state or country..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-background/50 border-white/10 text-sm"
                    data-testid="input-search-region"
                  />
                </div>
                <div className="max-h-[350px] overflow-y-auto space-y-1">
                  {filteredRegions.map((region) => (
                    <button
                      key={region.name}
                      onClick={() => setSelectedRegion(selectedRegion === region.name ? null : region.name)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors text-sm ${
                        selectedRegion === region.name
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-white/5"
                      }`}
                      data-testid={`button-region-${region.name}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin size={12} className={selectedRegion === region.name ? "text-primary" : "text-muted-foreground"} />
                        <span className="truncate">{region.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10">
                          {region.count}
                        </Badge>
                        <ChevronRight size={12} className="text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                  {filteredRegions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No regions found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {selectedRegion && selectedMembers.length > 0 && (
          <Card className="bg-card/40 border-white/10 mt-6" data-testid="card-region-members">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <MapPin size={18} className="text-primary" />
                  Members in {selectedRegion}
                </h3>
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {selectedMembers.length} {selectedMembers.length === 1 ? "member" : "members"}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {selectedMembers.map((member: any) => (
                  <a
                    key={member.id}
                    href={`/profile?user=${member.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background/30 border border-white/5 hover:border-primary/20 hover:bg-primary/5 transition-all"
                    data-testid={`link-member-${member.id}`}
                  >
                    <Avatar className="h-10 w-10 border-2 border-white/10">
                      <AvatarImage src={member.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`} />
                      <AvatarFallback>{member.firstName?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {member.firstName || "Member"} {member.lastName || ""}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <TierBadge tier={member.membershipTier} />
                        {member.city && (
                          <span className="text-[10px] text-muted-foreground truncate">{member.city}</span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <AdBannerInline />
    </div>
  );
}
