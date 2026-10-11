import { pacificDay } from "./prizePoolRules";

// Owner-approved exception: this fixture was unavailable until after kickoff.
// Never change the actual league, kickoff, or live status to implement a waiver.
export function isPrizePoolExempt(game: {
  externalId?: string | null;
  homeTeam: string;
  awayTeam: string;
  gameTime: Date | string;
}): boolean {
  const day = pacificDay(new Date(game.gameTime));
  if (day === "2026-10-11" &&
    (game.externalId === "NFL:401872981" ||
      (game.homeTeam === "Jacksonville Jaguars" && game.awayTeam === "Philadelphia Eagles"))) return true;
  return day === "2026-10-04" &&
    (game.externalId === "NFL:401872965" ||
      (game.homeTeam === "Washington Commanders" && game.awayTeam === "Indianapolis Colts"));
}