import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { PrizePoolQualRule } from "@/components/PrizePoolQualRule";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy } from "lucide-react";
import { dailyPrizeStandings, type DailyPrizeMember } from "@shared/dailyPrizeStandings";

type Scorecard = {
  period: { label: string } | null;
  members: DailyPrizeMember[];
};

export function DailyPrizeLeaderboard() {
  const { data, isLoading, isError, refetch } = useQuery<Scorecard>({
    queryKey: ["/api/daily-scorecard"],
    queryFn: async () => {
      const response = await fetch("/api/daily-scorecard");
      if (!response.ok) throw new Error("Unable to load daily results");
      return response.json();
    },
    refetchInterval: 30000,
  });
  const entries = dailyPrizeStandings(data?.members ?? []);
  const winners = entries.filter(m => m.isWinner);
  const date = data?.period?.label;
  const label = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", year: "numeric",
  }) : null;

  return <div className="min-h-screen bg-background">
    <Navbar />
    <main className="max-w-4xl mx-auto px-4 pt-32 pb-20">
      <header className="text-center mb-6">
        <h1 className="text-3xl md:text-5xl font-display font-bold">Daily <span className="text-primary">Leaderboard</span></h1>
        <p className="text-muted-foreground mt-3">Daily Prize Pool results · required games only</p>
        {label && <p className="text-primary mt-2" data-testid="daily-results-date">{label} · Pacific Time</p>}
      </header>
      <PrizePoolQualRule compact className="mb-6" />
      {isLoading ? <p role="status" className="text-center py-12">Loading daily results…</p> :
        isError ? <div role="alert" className="text-center py-12">
          <p>Daily results could not be loaded.</p>
          <button className="mt-3 text-primary underline" onClick={() => refetch()}>Try again</button>
        </div> : <>
          <section className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 mb-6" aria-label="Daily Prize Pool winners">
            <h2 className="text-yellow-400 font-bold flex items-center gap-2 mb-4">
              <Trophy size={20} />
              {winners.length > 1 ? `Prize Pool split — ${winners.length}-way tie` : winners.length === 1 ? "Daily Prize Pool winner" : "No qualified winner yet"}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {winners.map(member => <a href={`/profile?user=${member.userId}`} key={member.userId}
                className="flex items-center gap-3 rounded-lg border border-yellow-500/20 p-3"
                data-testid={`daily-winner-${member.userId}`}>
                <Avatar><AvatarImage src={member.avatar ?? undefined} /><AvatarFallback>{member.name[0]}</AvatarFallback></Avatar>
                <div><p className="font-bold">{member.name}</p>
                  <p className="text-sm text-yellow-400">{winners.length > 1 ? "Tied #1 · " : "#1 · "}
                    {member.prizePoolTotal.wins}W – {member.prizePoolTotal.losses}L</p></div>
              </a>)}
            </div>
            <p className="text-sm text-muted-foreground mt-4">Matches the daily Prize Pool scorecard. Optional sports and exempt games do not affect these rankings.</p>
          </section>
          <section className="rounded-xl border border-white/10 overflow-hidden" aria-label="Daily standings">
            <div className="grid grid-cols-[3rem_1fr_5rem] gap-2 px-4 py-3 bg-white/5 text-xs text-muted-foreground uppercase">
              <span>Rank</span><span>Member</span><span className="text-right">Record</span>
            </div>
            {entries.length === 0 && <p className="p-8 text-center text-muted-foreground">No daily results available yet.</p>}
            {entries.map(member => <a key={member.userId} href={`/profile?user=${member.userId}`}
              className={`grid grid-cols-[3rem_1fr_5rem] items-center gap-2 px-4 py-4 border-t border-white/10 ${member.isWinner ? "bg-yellow-500/5" : ""}`}
              data-testid={`daily-row-${member.userId}`}>
              <span className={member.isWinner ? "text-yellow-400 font-bold" : "text-muted-foreground"}>{member.rank ? `#${member.rank}` : "—"}</span>
              <div className="min-w-0"><p className="font-bold break-words">{member.name}</p>
                <p className={`text-xs mt-1 ${member.isWinner ? "text-yellow-400" : "text-muted-foreground"}`}>
                  {member.isWinner ? winners.length > 1 ? "Tied winner" : "Winner" : member.qualified ? "Qualified" : "Not qualified"}
                </p></div>
              <div className="text-right font-mono"><span className="text-green-400">{member.prizePoolTotal.wins}</span>
                <span className="text-muted-foreground">–</span><span className="text-red-400">{member.prizePoolTotal.losses}</span>
                <p className="text-[10px] text-muted-foreground font-sans">required games</p></div>
            </a>)}
          </section>
        </>}
    </main>
  </div>;
}
