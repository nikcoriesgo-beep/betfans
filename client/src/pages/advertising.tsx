import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Eye, MousePointer, DollarSign, Building2,
  ToggleLeft, ToggleRight, Pencil, Globe, ExternalLink, BarChart3,
} from "lucide-react";

interface Advertiser {
  id: number;
  companyName: string;
  logoUrl: string;
  tagline: string | null;
  websiteUrl: string | null;
  placement: string;
  annualFee: number;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
}

const PLACEMENTS = [
  { value: "hero", label: "Hero Banner", desc: "Top of homepage, highest visibility" },
  { value: "banner", label: "Inline Banner", desc: "Between content sections" },
  { value: "sidebar", label: "Sidebar", desc: "Side panel on dashboard pages" },
  { value: "marquee", label: "Scrolling Marquee", desc: "Animated ticker across pages" },
];

function AddAdvertiserDialog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    logoUrl: "",
    tagline: "",
    websiteUrl: "",
    placement: "banner",
    annualFee: 100000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ads", {
        ...form,
        tagline: form.tagline || null,
        websiteUrl: form.websiteUrl || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads"] });
      setOpen(false);
      setForm({ companyName: "", logoUrl: "", tagline: "", websiteUrl: "", placement: "banner", annualFee: 100000 });
      toast({ title: "Advertiser added!" });
    },
    onError: () => toast({ title: "Failed to add advertiser", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-add-advertiser"><Plus size={16} /> Add Advertiser</Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-white/10 max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-xl">New Advertising Partner</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Company Name</label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. BMW" className="bg-background/50 border-white/10" data-testid="input-company-name" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Logo URL</label>
            <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" className="bg-background/50 border-white/10" data-testid="input-logo-url" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tagline</label>
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="The Ultimate Driving Machine" className="bg-background/50 border-white/10" data-testid="input-tagline" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Website URL</label>
            <Input value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://bmw.com" className="bg-background/50 border-white/10" data-testid="input-website-url" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Placement</label>
            <div className="grid grid-cols-2 gap-2">
              {PLACEMENTS.map((p) => (
                <button key={p.value} onClick={() => setForm({ ...form, placement: p.value })}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    form.placement === p.value ? "bg-primary/10 border-primary/30 text-primary" : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`} data-testid={`button-placement-${p.value}`}>
                  <p className="text-xs font-bold">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Annual Fee ($)</label>
            <Input type="number" value={form.annualFee} onChange={(e) => setForm({ ...form, annualFee: parseInt(e.target.value) || 0 })} className="bg-background/50 border-white/10" data-testid="input-annual-fee" />
          </div>
          <Button onClick={() => create.mutate()} disabled={!form.companyName.trim() || !form.logoUrl.trim() || create.isPending} className="w-full font-display" data-testid="button-submit-advertiser">
            {create.isPending ? "Adding..." : "Add Advertising Partner"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Advertising() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: advertisers = [] } = useQuery<Advertiser[]>({
    queryKey: ["/api/ads/admin"],
    queryFn: async () => {
      const res = await fetch("/api/ads/admin", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/ads/${id}`, { active });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ads"] }),
  });

  const deleteAd = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/ads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads"] });
      toast({ title: "Advertiser removed" });
    },
  });

  const totalRevenue = advertisers.filter(a => a.active).reduce((sum, a) => sum + a.annualFee, 0);
  const totalImpressions = advertisers.reduce((sum, a) => sum + (a.impressions || 0), 0);
  const totalClicks = advertisers.reduce((sum, a) => sum + (a.clicks || 0), 0);
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2" data-testid="text-page-title">Advertising Partners</h1>
            <p className="text-muted-foreground">Manage premium advertising spots — $100,000/year per placement</p>
          </div>
          <AddAdvertiserDialog />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={14} className="text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Active Partners</span>
              </div>
              <p className="text-2xl font-bold font-mono" data-testid="text-active-count">{advertisers.filter(a => a.active).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={14} className="text-green-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Annual Revenue</span>
              </div>
              <p className="text-2xl font-bold font-mono text-green-400" data-testid="text-revenue">${totalRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Eye size={14} className="text-blue-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Impressions</span>
              </div>
              <p className="text-2xl font-bold font-mono text-blue-400" data-testid="text-impressions">{totalImpressions.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <MousePointer size={14} className="text-orange-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">CTR</span>
              </div>
              <p className="text-2xl font-bold font-mono text-orange-400" data-testid="text-ctr">{avgCtr}%</p>
            </CardContent>
          </Card>
        </div>

        {advertisers.length === 0 ? (
          <Card className="bg-card/20 border-white/5">
            <CardContent className="p-12 text-center">
              <Building2 size={48} className="text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-xl font-display font-bold mb-2">No Advertising Partners Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Add premium brand partners to display their logos and taglines across the platform.</p>
              <p className="text-xs text-muted-foreground/60">Each placement generates $100,000/year in revenue.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {advertisers.map((ad) => {
              const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00";
              const placementInfo = PLACEMENTS.find(p => p.value === ad.placement);
              return (
                <Card key={ad.id} className={`border-white/5 transition-all ${ad.active ? "bg-card/40" : "bg-card/20 opacity-60"}`} data-testid={`card-advertiser-${ad.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-5">
                      <div className="w-24 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center p-2 shrink-0">
                        <img src={ad.logoUrl} alt={ad.companyName} className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" rx="8" fill="#0a0a0a"/><text x="100" y="32" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="24" letter-spacing="2"><tspan fill="#22c55e">BET</tspan><tspan fill="#ffffff">FANS</tspan></text></svg>')}`; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-display font-bold text-lg">{ad.companyName}</h3>
                          <Badge className={ad.active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
                            {ad.active ? "Active" : "Inactive"}
                          </Badge>
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                            {placementInfo?.label || ad.placement}
                          </Badge>
                        </div>
                        {ad.tagline && <p className="text-sm text-muted-foreground mb-2">"{ad.tagline}"</p>}
                        {ad.websiteUrl && (
                          <a href={ad.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary/60 hover:text-primary flex items-center gap-1 mb-2">
                            <Globe size={10} /> {ad.websiteUrl}
                          </a>
                        )}
                        <div className="flex items-center gap-6 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><DollarSign size={12} className="text-green-400" /> ${ad.annualFee.toLocaleString()}/yr</span>
                          <span className="flex items-center gap-1.5"><Eye size={12} className="text-blue-400" /> {(ad.impressions || 0).toLocaleString()} impressions</span>
                          <span className="flex items-center gap-1.5"><MousePointer size={12} className="text-orange-400" /> {(ad.clicks || 0).toLocaleString()} clicks</span>
                          <span className="flex items-center gap-1.5"><BarChart3 size={12} className="text-purple-400" /> {ctr}% CTR</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleActive.mutate({ id: ad.id, active: !ad.active })}
                          className={`p-2 rounded-lg transition-colors ${ad.active ? "text-green-400 hover:bg-green-500/10" : "text-muted-foreground hover:bg-white/5"}`}
                          title={ad.active ? "Deactivate" : "Activate"}
                          data-testid={`button-toggle-${ad.id}`}
                        >
                          {ad.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                        </button>
                        <button
                          onClick={() => { if (confirm(`Remove ${ad.companyName}?`)) deleteAd.mutate(ad.id); }}
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          data-testid={`button-delete-${ad.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="bg-card/20 border-white/5 mt-8">
          <CardHeader>
            <CardTitle className="font-display text-lg">Placement Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PLACEMENTS.map((p) => (
                <div key={p.value} className="p-4 rounded-lg bg-white/5 border border-white/5">
                  <p className="font-bold text-sm mb-1">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.desc}</p>
                  <p className="text-xs text-primary mt-1">$100,000/year</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
