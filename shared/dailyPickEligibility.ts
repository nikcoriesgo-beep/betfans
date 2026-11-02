/** NCAA basketball Skill Play includes matchups with at least one ranked team. */
export function hasTop25Team(homeRank: unknown, awayRank: unknown): boolean {
  return [homeRank, awayRank].some(rank => typeof rank === "number" && Number.isInteger(rank) && rank >= 1 && rank <= 25);
}

export function isDailyPickEligible(game: { league: string; isTop25?: boolean | null }): boolean {
  return game.league !== "NCAAB" || game.isTop25 === true;
}
