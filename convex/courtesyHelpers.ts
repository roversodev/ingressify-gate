/** userId usado em cortesia (e checkout sem conta) até o destinatário criar conta (Clerk + sync Convex). */
export const PENDING_COURTESY_USER_ID = "__pending_courtesy__";

export function normalizeCourtesyEmail(email: string): string {
  return email.trim().toLowerCase();
}
