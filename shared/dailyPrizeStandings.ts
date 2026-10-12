export interface DailyPrizeMember {
  userId: string;
  name: string;
  avatar?: string | null;
  qualified: boolean;
  prizePoolTotal: { wins: number; losses: number; picks: number };
}

// Use only the scorecard's required-game totals, never all-sports totals.
export function dailyPrizeStandings<T extends DailyPrizeMember>(members: T[]) {
  const sorted = [...members].sort((a, b) =>
    Number(b.qualified) - Number(a.qualified) ||
    b.prizePoolTotal.wins - a.prizePoolTotal.wins ||
    a.prizePoolTotal.losses - b.prizePoolTotal.losses);
  const best = sorted.find(m => m.qualified &&
    m.prizePoolTotal.wins + m.prizePoolTotal.losses > 0);
  return sorted.map((member, index) => {
    const firstEqual = sorted.findIndex(m => m.qualified === member.qualified &&
      m.prizePoolTotal.wins === member.prizePoolTotal.wins &&
      m.prizePoolTotal.losses === member.prizePoolTotal.losses);
    return {
      ...member,
      rank: member.qualified ? firstEqual + 1 : null,
      isWinner: Boolean(best && member.qualified &&
        member.prizePoolTotal.wins === best.prizePoolTotal.wins &&
        member.prizePoolTotal.losses === best.prizePoolTotal.losses),
    };
  });
}
