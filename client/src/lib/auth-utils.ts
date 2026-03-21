export function isUnauthorizedError(error: Error): boolean {
  return error.message === "401" || error.message?.toLowerCase().includes("unauthorized") || error.message?.toLowerCase().includes("not authenticated");
}
