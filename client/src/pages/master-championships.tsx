import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trophy, Lock, Check, Search } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ChampionPick = { sportId: string; teamId: string; teamName: string; season: string };
type Sport = {
  id: string; name: string;
  teams: { id: string; name: string; logo?: string | null }[];
  lockAt: string | null; lockRule: "playoffs" | "final_round" | "world_series_friday"; locked: boolean; available: boolean; error?: string;
};
type Championships = { season: string; sports: Sport[]; picks: ChampionPick[]; canPlay: boolean };

export function MemberChampions({ userId }: { userId: string }) {
  const champions = useQuery<{ season: string; picks: ChampionPick[] }>({
    queryKey: ["/api/master-championships/members", userId],
    queryFn: async () => (await apiRequest("GET", `/api/master-championships/members/${encodeURIComponent(userId)}`)).json(),
  });
  return (
    <Card className="bg-card/30 border-primary/20 mb-8">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2"><Trophy size={20} className="text-primary" /> Master Champion List</CardTitle>
        <CardDescription>{champions.data?.season ? `${champions.data.season} saved champions` : "Season-long champion selections"}</CardDescription>
      </CardHeader>
      <CardContent>
        {champions.isLoading ? <div className="h-20 rounded-lg bg-primary/10 animate-pulse" aria-label="Loading champions" /> :
          champions.isError ? <div role="alert"><p className="text-sm text-muted-foreground mb-3">Couldn't load saved champions.</p><Button variant="outline" onClick={() => champions.refetch()}>Try again</Button></div> :
          <ChampionList picks={champions.data?.picks || []} />}
        <Link href="/master-championships" className="inline-block text-sm text-primary hover:underline mt-4">View Master Championships</Link>
      </CardContent>
    </Card>
  );
}

function ChampionList({ picks }: { picks: ChampionPick[] }) {
  return picks.length ? <ul className="divide-y divide-primary/10">
    {picks.map(pick => <li key={pick.sportId} className="flex justify-between gap-4 py-3">
      <strong className="uppercase text-primary text-sm">{pick.sportId}</strong>
      <strong className="text-right">{pick.teamName}</strong>
    </li>)}
  </ul> : <div className="rounded-xl border border-dashed border-primary/20 p-6 text-center">
    <Trophy className="mx-auto text-primary/40 mb-3" size={28} />
    <p className="font-display font-bold">No champions selected yet</p>
    <p className="text-sm text-muted-foreground mt-1">Saved selections will appear here, one per sport.</p>
  </div>;
}

function SportSelection({ sport, pick, canPlay }: { sport: Sport; pick?: ChampionPick; canPlay: boolean }) {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const lockDate = sport.lockAt ? new Date(sport.lockAt) : null;
  const verifiedDeadline = !!lockDate && Number.isFinite(lockDate.getTime());
  const locked = sport.locked || (!!lockDate && lockDate.getTime() <= Date.now());
  const available = sport.available;
  const save = useMutation({
    mutationFn: async (teamId: string) => {
      if (!available || locked || !canPlay) throw new Error("Selections are unavailable for this sport.");
      return apiRequest("PUT", "/api/master-championships/picks", { sportId: sport.id, teamId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/master-championships"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/master-championships/members"] });
      toast({ title: "Champion saved", description: "Your Master Champion List has been updated." });
    },
    onError: () => {
      toast({ title: "Pick not saved", description: "Please retry. Picks cannot change after the sport's lock deadline.", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/master-championships"] });
    },
  });
  const teams = sport.teams.filter(team => team.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <Card className="bg-card/40 border-white/10">
    <CardHeader>
      <div className="flex justify-between items-start gap-3">
        <CardTitle className="font-display text-2xl">{sport.name}</CardTitle>
        <span className={`text-xs rounded-full px-3 py-1 border ${available && !locked ? "text-primary border-primary/30 bg-primary/10" : "text-muted-foreground border-white/10"}`}>
          {!available ? "Unavailable" : locked ? "Locked" : "Open"}
        </span>
      </div>
      <CardDescription>
        {verifiedDeadline ? <span className="flex items-start gap-2"><Lock size={14} className="shrink-0 mt-0.5" /><span>Verified {sport.lockRule === "world_series_friday" ? "World Series Friday" : sport.lockRule === "final_round" ? "final-round" : "playoff"} lock: {lockDate!.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} (Pacific Time)</span></span> :
          "Open — no lock date scheduled. Choose or change your champion until BetFans locks this sport or a scheduled deadline is reached."}
      </CardDescription>
      {sport.error && <p className="text-xs text-muted-foreground">{sport.error}</p>}
      {pick && <p className="rounded-lg bg-primary/10 border border-primary/30 text-primary font-bold px-3 py-2 text-sm">Your champion: <strong>{pick.teamName}</strong></p>}
    </CardHeader>
    <CardContent>
      <div className="relative mb-4"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label={`Search ${sport.name} teams`} placeholder={`Search ${sport.teams.length} teams`} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-background/50 border-white/10" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
        {teams.map(team => {
          const selected = String(pick?.teamId) === String(team.id);
          return <button key={team.id} type="button" aria-pressed={selected}
            disabled={!available || locked || !canPlay || save.isPending || selected}
            onClick={() => save.mutate(team.id)}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-default ${selected ? "bg-primary/20 border-primary text-primary font-bold" : "border-white/10 bg-background/30 hover:enabled:border-primary/50 disabled:opacity-60"}`}>
            {team.logo && <img src={team.logo} alt="" className="h-7 w-7 object-contain shrink-0" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} />}
            <span className="flex-1">{team.name}</span>{selected && <Check size={17} className="shrink-0" />}
          </button>;
        })}
      </div>
      {!teams.length && <p className="py-6 text-center text-sm text-muted-foreground">{sport.teams.length ? "No matching teams. Try another search." : "Team options are not available yet."}</p>}
      {save.isPending && <p role="status" className="text-xs text-primary mt-3">Saving your champion…</p>}
    </CardContent>
  </Card>;
}

export default function MasterChampionships() {
  const { user, isAuthenticated } = useAuth();
  const championships = useQuery<Championships>({
    queryKey: ["/api/master-championships", user?.id || "public"],
    queryFn: async () => (await apiRequest("GET", "/api/master-championships")).json(),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const data = championships.data;
  return <div className="min-h-[100dvh] bg-background">
    <Navbar />
    <main className="container mx-auto max-w-6xl px-4 pt-24 pb-16">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-3"><Trophy size={18} /> {data?.season || "Season championships"}</div>
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Master Championships</h1>
        <p className="text-muted-foreground max-w-2xl">Save one champion per sport and change your choice while selections are open. Sports without a scheduled lock date stay open until BetFans locks them or a deadline is scheduled. Confirmed deadlines appear on each sport below.</p>
        <p className="text-sm text-primary mt-3">MLB 2026 exception: picks lock Friday, October 23 at 12:00 AM Pacific, before the World Series begins.</p>
      </header>
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-8">
        <p className="font-bold mb-1">Included with Free Play — $0</p>
        <p className="text-sm text-muted-foreground">Daily picks and Master Championships. Free Play does not include Prize Pool entries, payouts, or referral cash rewards.</p>
        {!isAuthenticated ? <Link href="/auth?mode=signup" className="inline-block text-primary font-semibold mt-3 hover:underline">Join Free Play</Link> :
          data && !data.canPlay ? <Link href="/membership" className="inline-block text-primary font-semibold mt-3 hover:underline">Enroll in Free Play or choose a paid membership</Link> : null}
      </div>
      {championships.isLoading ? <div className="grid md:grid-cols-2 gap-6" aria-label="Loading championships">{[1, 2, 3, 4].map(n => <div key={n} className="h-80 rounded-xl bg-primary/10 animate-pulse" />)}</div> :
        championships.isError ? <Card className="bg-card/40 border-white/10"><CardContent className="p-8 text-center" role="alert"><h2 className="font-display text-xl font-bold mb-2">Championships couldn't load</h2><p className="text-muted-foreground mb-4">Your saved picks have not changed. Try again in a moment.</p><Button onClick={() => championships.refetch()}>Try again</Button></CardContent></Card> :
        data && <>
          {!data.sports.length && <p className="border border-dashed border-primary/20 rounded-xl p-8 text-center text-muted-foreground">Season schedules are being verified. Check back for available sports.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{data.sports.map(sport => <SportSelection key={sport.id} sport={sport} pick={isAuthenticated ? data.picks.find(p => p.sportId === sport.id) : undefined} canPlay={isAuthenticated && data.canPlay} />)}</div>
          {isAuthenticated && <Card className="mt-10 border-primary/30 bg-primary/5"><CardHeader><CardTitle className="font-display flex items-center gap-2"><Trophy size={20} className="text-primary" /> Master Champion List</CardTitle><CardDescription>{data.season} · Your saved picks remain highlighted above.</CardDescription></CardHeader><CardContent><ChampionList picks={data.picks} /></CardContent></Card>}
        </>}
    </main>
  </div>;
}
