/**
 * Upper bounds on what a Brief can hold, the same whether a value comes from
 * the model, a chip or an edit. Past them a value is refused (or, from the
 * model, read as unknown and asked for).
 */
export const BRIEF_LIMITS = {
  /** Guests at one Function, or at the Event. */
  guests: 100_000,
  households: 100_000,
  /** ₹10,000 crore, in rupees. */
  budget: 100_000_000_000,
  /** Functions in one Event. */
  functions: 12,
} as const;
