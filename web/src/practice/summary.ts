import type { CardResult, SessionSummary } from "@language-app/core";

type Counts = Pick<SessionSummary, "knew" | "didntKnow" | "skipped">;

/**
 * The Summary's headline, "14 of 20 knew" (§8.6): every card answered counts, skipped ones too.
 * Null for a session without cards, which shows only the three counts.
 */
export function knewOf({ knew, didntKnow, skipped }: Counts): { knew: number; of: number } | null {
  const of = knew + didntKnow + skipped;
  return of === 0 ? null : { knew, of };
}

/** The Summary's bar: one share per answer given, in this order; answers nobody gave are left out. */
export function resultShares({
  knew,
  didntKnow,
  skipped,
}: Counts): { result: CardResult; count: number }[] {
  const shares: { result: CardResult; count: number }[] = [
    { result: "knew", count: knew },
    { result: "didnt_know", count: didntKnow },
    { result: "skipped", count: skipped },
  ];
  return shares.filter((share) => share.count > 0);
}
