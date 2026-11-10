import { isFreeMembership } from "../shared/membershipAccess";

type PrizePoolMember = {
  userId: string;
  name: string;
  qualified: boolean;
  tier?: string | null;
  prizePoolTotal: { wins: number; losses: number };
};

/** Read-only scorecard selection. Optional/all-sport totals never break a tie. */
export function scorecardWinners<T extends PrizePoolMember>(members: T[]) {
  const eligible = members.filter(m =>
    !isFreeMembership(m.tier) && m.qualified && m.prizePoolTotal.wins + m.prizePoolTotal.losses > 0
  ).sort((a, b) =>
    b.prizePoolTotal.wins - a.prizePoolTotal.wins ||
    a.prizePoolTotal.losses - b.prizePoolTotal.losses
  );
  const best = eligible[0]?.prizePoolTotal;
  const tied = eligible.filter(m =>
    m.prizePoolTotal.wins === best?.wins && m.prizePoolTotal.losses === best?.losses
  );
  const winners = tied.map(m => ({
    ...m,
    wins: m.prizePoolTotal.wins,
    losses: m.prizePoolTotal.losses,
    // Fraction of the daily prize, not the remaining community pool or a payment receipt.
    shareFraction: 1 / tied.length,
  }));
  const first = winners[0];
  return {
    winners,
    // Legacy alias only; new consumers must use winners to include every co-winner.
    winner: first ? { userId: first.userId, name: first.name, wins: first.wins, losses: first.losses } : null,
  };
}
