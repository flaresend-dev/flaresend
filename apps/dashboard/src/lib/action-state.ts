/** What every server action returns to its form. */
export interface ActionState {
  ok?: boolean;
  /** `code: message`, shown inline. */
  error?: string;
  message?: string;
  /** A value shown once (new API key, webhook secret). */
  secret?: string;
  secretLabel?: string;
  /** Arbitrary JSON result for client components that need it. */
  data?: unknown;
  /** Increments on every result so effects can tell two identical results apart. */
  seq?: number;
}
