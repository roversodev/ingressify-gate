import { Doc } from "./_generated/dataModel";

// Time constants in milliseconds
export const DURATIONS = {
  TICKET_OFFER: 30 * 60 * 1000,
} as const;

export const TICKET_STATUS: Record<string, Doc<"tickets">["status"]> = {
  VALID: "valid",
  USED: "used",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
} as const;
