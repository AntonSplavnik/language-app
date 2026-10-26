import { ApiClientError } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { deleteAccountError, needsGoogleAgain } from "../src/auth/deleteAccount";
import {
  CONNECT_GOOGLE,
  callbackError,
  continueWithGoogle,
  GOOGLE_NOT_CONNECTED,
  googleAccountError,
  googleOffered,
  googleRow,
  googleSignInError,
  googleStartError,
  signInWithGoogleAgain,
  withoutCallbackError,
} from "../src/auth/google";
import { INVITE_ONLY, TOO_MANY } from "../src/auth/rules";

// Google on Sign in, Create account and Account (docs/design.md §10 screens 17–19, §12).

const at = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return { protocol, hostname };
};

describe("where Google is offered", () => {
  it("on https, and on localhost over plain HTTP, when the server has the Google pair", () => {
    expect(googleOffered(true, at("https://dingsda.vercel.app/signin"))).toBe(true);
    expect(googleOffered(true, at("http://localhost:5173/signin"))).toBe(true);
  });

  it("not over the LAN's plain HTTP: Google won't return there", () => {
    expect(googleOffered(true, at("http://192.168.1.20:5173/signin"))).toBe(false);
    expect(googleOffered(true, at("http://10.0.0.5:5173/signin"))).toBe(false);
    expect(googleOffered(true, at("http://mac.local:5173/signin"))).toBe(false);
    // Only localhost is registered with Google, not its address.
    expect(googleOffered(true, at("http://127.0.0.1:5173/signin"))).toBe(false);
  });

  it("nowhere when the server has no Google pair", () => {
    expect(googleOffered(false, at("https://dingsda.vercel.app/signin"))).toBe(false);
    expect(googleOffered(false, at("http://localhost:5173/signin"))).toBe(false);
  });
});

describe("Continue with Google", () => {
  it("returns to the page in next, or Home; a failure returns to Sign in, keeping next", () => {
    expect(continueWithGoogle("?next=%2Fwords%3Fstatus%3Dlearned")).toEqual({
      provider: "google",
      callbackURL: "/words?status=learned",
      errorCallbackURL: "/signin?next=%2Fwords%3Fstatus%3Dlearned",
    });
    expect(continueWithGoogle("")).toEqual({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/signin",
    });
  });

  it("never returns outside the app", () => {
    expect(continueWithGoogle("?next=https%3A%2F%2Fevil.example").callbackURL).toBe("/");
    expect(continueWithGoogle("?next=%2F%2Fevil.example").callbackURL).toBe("/");
  });

  it("signing in again (to delete the account) returns to Account, the account's Google preselected", () => {
    expect(signInWithGoogleAgain("anna@gmail.com")).toEqual({
      provider: "google",
      callbackURL: "/settings/account",
      errorCallbackURL: "/settings/account",
      loginHint: "anna@gmail.com",
    });
  });

  it("Connect returns to Account, also when it fails", () => {
    expect(CONNECT_GOOGLE).toEqual({
      provider: "google",
      callbackURL: "/settings/account",
      errorCallbackURL: "/settings/account",
    });
  });
});

describe("what comes back in ?error=", () => {
  it("is read, and can be taken out of the address, keeping next", () => {
    expect(callbackError("?next=%2Fwords&error=not_invited")).toBe("not_invited");
    expect(callbackError("?next=%2Fwords")).toBeNull();
    expect(callbackError("?error=")).toBeNull();
    expect(withoutCallbackError("?next=%2Fwords&error=not_invited&error_description=x")).toBe(
      "?next=%2Fwords",
    );
    expect(withoutCallbackError("?error=access_denied")).toBe("");
  });

  it("says on Sign in why Google didn't sign in", () => {
    expect(googleSignInError("not_invited")).toBe(INVITE_ONLY);
    expect(INVITE_ONLY).toBe("This app is invite-only. Ask for an invite first.");
    expect(googleSignInError("account_not_linked")).toBe(GOOGLE_NOT_CONNECTED);
    expect(GOOGLE_NOT_CONNECTED).toBe(
      "That Google account isn't connected to an account here. Sign in with your password, then connect Google in Settings.",
    );
    expect(googleSignInError("access_denied")).toBe("Google sign-in was cancelled.");
    for (const code of ["state_mismatch", "invalid_code", "unable_to_create_user", "x"]) {
      expect(googleSignInError(code)).toBe("Couldn't sign in with Google. Try again.");
    }
  });

  it("says on Account why Google wasn't connected", () => {
    expect(googleAccountError("email_does_not_match", "anna@gmail.com")).toBe(
      "That Google account has another email. Connect the Google account of anna@gmail.com.",
    );
    expect(googleAccountError("account_already_linked_to_different_user", "anna@gmail.com")).toBe(
      "That Google account is already connected to another account here.",
    );
    expect(googleAccountError("access_denied", "anna@gmail.com")).toBe(
      "Google sign-in was cancelled.",
    );
    expect(googleAccountError("unable_to_link_account", "anna@gmail.com")).toBe(
      "Couldn't connect Google. Try again.",
    );
  });
});

describe("when Google's address can't be had", () => {
  it("too many tries read as everywhere else; anything else says what the client says", () => {
    expect(
      googleStartError(new ApiClientError("too_many_requests", "Too many requests.", 429)),
    ).toBe(TOO_MANY);
    expect(googleStartError(new ApiClientError("network", "Can't reach the server", null))).toBe(
      "Can't reach the server",
    );
  });
});

describe("Account's Google row", () => {
  const password = { id: "3", providerId: "credential" };
  const google = { id: "4", providerId: "google" };

  it("Connected when the account has Google, wherever it is viewed", () => {
    expect(googleRow([password, google], true)).toBe("connected");
    expect(googleRow([google], false)).toBe("connected");
  });

  it("Connect where Google can be offered, nothing where it can't", () => {
    expect(googleRow([password], true)).toBe("connect");
    expect(googleRow([password], false)).toBeNull();
  });

  it("nothing until the sign-in methods are known", () => {
    expect(googleRow(null, true)).toBeNull();
  });
});

describe("deleting a Google-only account with an old sign-in", () => {
  const expired = new ApiClientError("SESSION_EXPIRED", "Session expired", 400);

  it("offers Google again where Google is offered", () => {
    expect(needsGoogleAgain(expired, true)).toBe(true);
    expect(deleteAccountError(expired, { googleOffered: true })).toBe(
      "Your last sign-in was more than a day ago. Sign in with Google again, then delete the account.",
    );
  });

  it("otherwise says to sign out and in again, as before", () => {
    expect(needsGoogleAgain(expired, false)).toBe(false);
    expect(deleteAccountError(expired)).toBe("Sign out and in again, then delete the account.");
    const wrong = new ApiClientError("INVALID_PASSWORD", "Invalid password", 400);
    expect(needsGoogleAgain(wrong, true)).toBe(false);
  });
});
