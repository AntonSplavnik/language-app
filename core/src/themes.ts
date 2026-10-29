import { z } from "zod";

/**
 * The app's 22 themes (docs/design.md §7 Themes), written once for the screens and the server: a
 * stable key stored in the database, the English label the app shows (labels can change, keys
 * can't), and what belongs to the theme, for the AI that chooses a word's themes (the rules for
 * choosing are in `server/src/ai/themes.ts`).
 */
export const THEMES = [
  {
    key: "family",
    label: "Family & people",
    about:
      "relatives, partners and friends, kinds of people, ages and stages of life, personal details (name, origin, nationality, marital status)",
  },
  {
    key: "body",
    label: "Body & health",
    about:
      "parts of the body, illness and injury, doctors, hospitals, medicine, hygiene and personal care",
  },
  {
    key: "food",
    label: "Food & drink",
    about: "food, drinks, cooking, meals, restaurants and cafés, how food tastes",
  },
  {
    key: "home",
    label: "Home",
    about:
      "houses and flats, rooms, furniture, things in the household, housework, renting and moving",
  },
  {
    key: "clothes",
    label: "Clothes",
    about: "clothes, shoes, accessories, materials, sizes, getting dressed",
  },
  {
    key: "shopping",
    label: "Shopping & money",
    about: "shops, buying and selling, prices, paying, money",
  },
  {
    key: "town",
    label: "Town & places",
    about: "towns and villages, the buildings and places in them, streets, finding the way",
  },
  {
    key: "travel",
    label: "Travel & transport",
    about: "vehicles, roads and traffic, public transport, journeys, holidays away, hotels, abroad",
  },
  {
    key: "work",
    label: "Work",
    about:
      "jobs and professions, workplaces, colleagues, applying for a job, working hours and pay",
  },
  {
    key: "school",
    label: "School & learning",
    about: "school, university, courses, exams, studying, languages and grammar",
  },
  {
    key: "culture",
    label: "Culture & celebrations",
    about:
      "festivals and holidays, celebrations, customs, religion, art, music, theatre, film, books",
  },
  {
    key: "free-time",
    label: "Free time",
    about: "hobbies, games, going out, meeting friends, leisure activities",
  },
  {
    key: "sport",
    label: "Sport",
    about: "sports, exercise, training, matches and competitions",
  },
  {
    key: "nature",
    label: "Nature & animals",
    about: "animals, plants, landscapes, the countryside, the environment",
  },
  {
    key: "weather",
    label: "Weather & seasons",
    about: "weather, temperature, climate, the four seasons",
  },
  {
    key: "time",
    label: "Time & dates",
    about:
      "clock times, parts of the day, days, weeks, months, dates, the calendar, how often and how long (the seasons are weather)",
  },
  {
    key: "numbers",
    label: "Numbers & amounts",
    about: "numbers, counting, fractions, quantities, measures, units and weights",
  },
  {
    key: "colours",
    label: "Colours & shapes",
    about: "colours, shapes, patterns",
  },
  {
    key: "feelings",
    label: "Feelings & character",
    about: "emotions, moods, personality and character, how people treat each other",
  },
  {
    key: "communication",
    label: "Communication & media",
    about:
      "conversations and phone calls, letters and post, email, the internet and social media, newspapers, TV, radio",
  },
  {
    key: "offices",
    label: "Offices & paperwork",
    about:
      "authorities and their forms, documents, registration, visas and residence, banks, insurance, the law",
  },
  {
    key: "technology",
    label: "Technology",
    about: "computers, devices, software, machines, electricity, engineering",
  },
] as const;

export type Theme = (typeof THEMES)[number];
export type ThemeKey = Theme["key"];

export const THEME_KEYS = THEMES.map((theme) => theme.key) as [ThemeKey, ...ThemeKey[]];
export const ThemeKey = z.enum(THEME_KEYS);

/** A word has 0–2 themes, the main one first (§7 Themes). */
export const THEMES_MAX = 2;

const LABELS = new Map<string, string>(THEMES.map((theme) => [theme.key, theme.label]));

export const themeLabel = (key: ThemeKey): string => LABELS.get(key) ?? key;

/**
 * An answer of the AI checked against THEMES (§7 Themes): unknown keys and repeats dropped, at most
 * 2 kept, in the order given (the main one first).
 */
export function knownThemes(keys: readonly string[]): ThemeKey[] {
  const known: ThemeKey[] = [];
  for (const key of keys) {
    if (!LABELS.has(key) || known.includes(key as ThemeKey)) continue;
    known.push(key as ThemeKey);
    if (known.length === THEMES_MAX) break;
  }
  return known;
}

/** Whether two choices hold the same themes, whatever their order. */
export function sameThemes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}
