import { Crown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { dailyPrizeStandings } from "@shared/dailyPrizeStandings";

type DailyPrizeEntry = ReturnType<typeof dailyPrizeStandings>[number];

export function DailyPrizePodium({ entries }: { entries: DailyPrizeEntry[] }) {
  // Standings owns ranking. Only display qualified, graded required-game results.
  const eligible = entries.filter(member =>
    member.qualified && member.rank !== null &&
    member.prizePoolTotal.wins + member.prizePoolTotal.losses > 0);
  if (eligible.length === 0) return null;

  // Include every member tied at the third-position cutoff, not just three cards.
  const cutoff = eligible[Math.min(2, eligible.length - 1)].rank!;
  const top = eligible.filter(member => member.rank! <= cutoff);
  // Keep the leading member centered even when the two side places are tied.
  const podium = top.length >= 3 ? [top[1], top[0], ...top.slice(2)] : top;
  const isTied = (rank: number) => eligible.filter(member => member.rank === rank).length > 1;

  return (
    <section aria-label="Daily Prize Pool top standings" className="mb-8 pt-6"
      data-testid="daily-prize-podium">
      <div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-8 sm:gap-x-4">
        {podium.map(member => {
          const rank = member.rank!;
          const tied = isTied(rank);
          const height = rank === 1 ? "h-36" : rank === 2 ? "h-28" : "h-24";
          const border = member.isWinner
            ? "border-yellow-500/60 ring-2 ring-yellow-500/20"
            : rank === 2 ? "border-slate-400/60" : "border-orange-600/60";
          return (
            <a key={member.userId} href={`/profile?user=${encodeURIComponent(member.userId)}`}
              className="group flex w-24 flex-col items-center rounded-t-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:w-28"
              data-testid={`daily-podium-${member.userId}`} data-rank={rank}
              aria-label={`${member.name}, ${tied ? "tied " : ""}rank ${rank}, ${member.prizePoolTotal.wins} wins and ${member.prizePoolTotal.losses} losses, required games`}>
              <div className="relative mb-2 flex h-20 items-end justify-center">
                <Avatar className={`${member.isWinner ? "h-20 w-20" : "h-14 w-14"} border-2 ${border}`}>
                  <AvatarImage src={member.avatar ?? undefined} alt={member.name} />
                  <AvatarFallback className="bg-primary/10 font-bold text-primary">
                    {member.name.trim().charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                {member.isWinner && (
                  <Crown size={22} aria-hidden="true"
                    className="absolute -top-5 left-1/2 -translate-x-1/2 fill-yellow-500 text-yellow-500" />
                )}
              </div>
              <p className="flex min-h-10 w-full items-center justify-center break-words px-1 text-sm font-bold leading-5 group-hover:text-primary">
                {member.name}
              </p>
              <p className="mt-1 whitespace-nowrap font-mono text-base font-bold sm:text-lg">
                <span className="text-green-400">{member.prizePoolTotal.wins}W</span>
                <span className="mx-1 text-muted-foreground">–</span>
                <span className="text-red-400">{member.prizePoolTotal.losses}L</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">required games</p>
              <div className={`${height} mt-3 flex w-full items-end justify-center rounded-t-xl border border-b-0 border-primary/20 bg-gradient-to-t from-primary/15 to-primary/5 pb-3 group-hover:border-primary/40`}>
                <span className="font-display text-2xl font-bold text-primary/70">
                  {tied && <span className="mb-1 block text-[10px] font-sans font-medium uppercase tracking-wider">Tied</span>}
                  #{rank}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
