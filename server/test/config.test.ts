import { describe, expect, it } from "vitest";
import { authSecret, googleCredentials, parseConfig, parseVercelConfig } from "../src/config";

describe("parseConfig", () => {
  it("fills defaults for a bare environment", () => {
    const config = parseConfig({});
    expect(config.AI_EFFORT).toBe("medium");
    expect(config.DAILY_PHOTO_LIMIT).toBe(50);
    expect(config.SERVER_PORT).toBe(3000);
    expect(config.AI_MODEL_EXTRACT).toBe("claude-haiku-5-5");
    expect(config.AI_MODEL_ENRICH).toBe("claude-haiku-5-5");
    // Ask AI (§11.5, §11.6).
    expect(config.AI_MODEL_DESCRIBE).toBe("claude-haiku-5-5");
    expect(config.DAILY_DESCRIBE_LIMIT).toBe(200);
    // Accounts (§4 Accounts): invite-only unless switched to open.
    expect(config.SIGNUP_MODE).toBe("invite");
    expect(config.WEB_PORT).toBe(5173);
    // The daily limits' day (§11.5).
    expect(config.APP_TIME_ZONE).toBe("Europe/Berlin");
  });

  it("treats empty values as unset", () => {
    expect(parseConfig({ DAILY_PHOTO_LIMIT: "" }).DAILY_PHOTO_LIMIT).toBe(50);
  });

  it("coerces numbers and rejects bad values", () => {
    expect(parseConfig({ DAILY_PHOTO_LIMIT: "5" }).DAILY_PHOTO_LIMIT).toBe(5);
    expect(parseConfig({ DAILY_DESCRIBE_LIMIT: "10" }).DAILY_DESCRIBE_LIMIT).toBe(10);
    expect(() => parseConfig({ AI_EFFORT: "turbo" })).toThrow();
    expect(() => parseConfig({ DAILY_DESCRIBE_LIMIT: "0" })).toThrow();
  });
});

describe("the Better Auth secret", () => {
  const secret = "s".repeat(32);

  it("is required to sign anyone in", () => {
    expect(() => authSecret(parseConfig({}))).toThrow(/BETTER_AUTH_SECRET/);
    expect(authSecret(parseConfig({ BETTER_AUTH_SECRET: secret }))).toBe(secret);
  });

  it("must be at least 32 characters", () => {
    expect(() => parseConfig({ BETTER_AUTH_SECRET: "s".repeat(31) })).toThrow();
  });

  it("accepts only the two sign-up modes", () => {
    expect(parseConfig({ SIGNUP_MODE: "open" }).SIGNUP_MODE).toBe("open");
    expect(() => parseConfig({ SIGNUP_MODE: "closed" })).toThrow();
  });
});

describe("APP_TIME_ZONE (§11.5)", () => {
  it("takes an IANA time zone", () => {
    expect(parseConfig({ APP_TIME_ZONE: "America/New_York" }).APP_TIME_ZONE).toBe(
      "America/New_York",
    );
    expect(parseConfig({ APP_TIME_ZONE: "UTC" }).APP_TIME_ZONE).toBe("UTC");
  });

  it.each(["Mars/Olympus_Mons", "Berlin", "+02:00", "CEST+2"])("refuses %s", (zone) => {
    expect(() => parseConfig({ APP_TIME_ZONE: zone })).toThrow(/APP_TIME_ZONE/);
  });
});

describe("the Google pair (§4 Accounts, §14)", () => {
  const pair = {
    GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "a-client-secret",
  };

  it("is optional: without it Google isn't offered", () => {
    expect(googleCredentials(parseConfig({}))).toBeNull();
    // Empty values count as unset, as everywhere in .env.
    expect(
      googleCredentials(parseConfig({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" })),
    ).toBeNull();
  });

  it("with both set, gives the client id and secret", () => {
    expect(googleCredentials(parseConfig(pair))).toEqual({
      clientId: pair.GOOGLE_CLIENT_ID,
      clientSecret: pair.GOOGLE_CLIENT_SECRET,
    });
  });

  it("refuses one without the other", () => {
    expect(() => parseConfig({ GOOGLE_CLIENT_ID: pair.GOOGLE_CLIENT_ID })).toThrow(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/,
    );
    expect(() => parseConfig({ GOOGLE_CLIENT_SECRET: pair.GOOGLE_CLIENT_SECRET })).toThrow(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/,
    );
  });
});

describe("BETTER_AUTH_URL, production's address (§18.3)", () => {
  it("is unset on the Mac", () => {
    expect(parseConfig({}).BETTER_AUTH_URL).toBeUndefined();
    expect(parseConfig({ BETTER_AUTH_URL: "" }).BETTER_AUTH_URL).toBeUndefined();
  });

  it("takes the app's https address, without a trailing slash", () => {
    expect(parseConfig({ BETTER_AUTH_URL: "https://dingsda.vercel.app" }).BETTER_AUTH_URL).toBe(
      "https://dingsda.vercel.app",
    );
    expect(parseConfig({ BETTER_AUTH_URL: "https://dingsda.vercel.app/" }).BETTER_AUTH_URL).toBe(
      "https://dingsda.vercel.app",
    );
  });

  it.each([
    ["plain http", "http://dingsda.vercel.app"],
    ["the Mac's address", "http://localhost:5173"],
    ["a path", "https://dingsda.vercel.app/api/auth"],
    ["a query", "https://dingsda.vercel.app/?x=1"],
    ["not an address", "dingsda.vercel.app"],
  ])("refuses %s", (_, value) => {
    expect(() => parseConfig({ BETTER_AUTH_URL: value })).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("the configuration on Vercel (§18.3)", () => {
  const production = {
    DATABASE_URL: "postgres://neondb_owner:pw@ep-x-pooler.eu-central-1.aws.neon.tech/neondb",
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "https://dingsda.vercel.app",
  };

  it("reads Vercel's variables as the Mac reads .env", () => {
    const config = parseVercelConfig(production);
    expect(config.DATABASE_URL).toBe(production.DATABASE_URL);
    expect(config.BETTER_AUTH_URL).toBe("https://dingsda.vercel.app");
    expect(config.APP_TIME_ZONE).toBe("Europe/Berlin");
  });

  // The Mac's defaults (its own database, its dynamic addresses) mean nothing there.
  it.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const)(
    "refuses to start without %s",
    (name) => {
      expect(() => parseVercelConfig({ ...production, [name]: undefined })).toThrow(name);
      expect(() => parseVercelConfig({ ...production, [name]: "" })).toThrow(name);
    },
  );
});
