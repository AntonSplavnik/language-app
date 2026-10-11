import type { z } from "zod";
import { WordView } from "./words";

// Session request/response shapes are added in M7.

/** One flashcard in a practice session (§8.2). */
export const PracticeCard = WordView;
export type PracticeCard = z.infer<typeof PracticeCard>;
