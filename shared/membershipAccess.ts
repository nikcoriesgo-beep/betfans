export const PAID_MEMBERSHIPS = ["rookie", "pro", "legend", "corporate", "premium_corporate"];
// Browsing membership pages is separate from entering paid competitions.
export function canBrowseMemberPages(tier: string | null | undefined) {
  return tier === "free_play" || PAID_MEMBERSHIPS.includes(tier ?? "");
}
export function canPlayFreeGames(user: { membershipTier?: string | null; referredBy?: string | null } | null | undefined) {
  return !!user && (PAID_MEMBERSHIPS.includes(user.membershipTier ?? "") ||
    (user.membershipTier === "free_play" && !!user.referredBy));
}
export function hasPrizePoolAccess(tier: string | null | undefined) {
  return PAID_MEMBERSHIPS.includes(tier ?? "");
}
