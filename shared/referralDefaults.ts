/** Explicit invitations win over saved codes; only uninvited signups default. */
export function initialAffiliateCode(linked?: string | null, saved?: string | null) {
  return linked?.trim().toUpperCase() || saved?.trim().toUpperCase() || "NIKCOX";
}
