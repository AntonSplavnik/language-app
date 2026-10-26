import { ApiClientError } from "@language-app/core";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETED,
  canConfirmDelete,
  DELETE_QUESTION,
  DELETE_WARNING,
  deleteAccountError,
  hasPassword,
} from "../src/auth/deleteAccount";
import { redirectFor } from "../src/auth/rules";

// Delete account on Account (docs/design.md §10 screen 19): it asks in place, with the password
// for an account that has one, and afterwards Sign in says the account was deleted.

const failed = (code: string, status = 400) =>
  new ApiClientError(code, `server says ${code}`, status);

describe("the delete confirmation", () => {
  it("asks the question and says it can't be undone", () => {
    expect(DELETE_QUESTION).toBe(
      "Delete your account and all its words, imports and practice history?",
    );
    expect(DELETE_WARNING).toBe("This can't be undone.");
  });

  it("asks for the password when the account has one", () => {
    const credential = { id: "3", providerId: "credential" };
    const google = { id: "4", providerId: "google" };
    expect(hasPassword([credential])).toBe(true);
    expect(hasPassword([google, credential])).toBe(true);
    expect(hasPassword([google])).toBe(false);
    // Not known (the list didn't load): ask, as every account but a Google-only one has one.
    expect(hasPassword(null)).toBe(true);
  });

  it("Delete waits for the password; an account without one can delete at once", () => {
    expect(canConfirmDelete({ needsPassword: true, password: "" })).toBe(false);
    expect(canConfirmDelete({ needsPassword: true, password: "x" })).toBe(true);
    expect(canConfirmDelete({ needsPassword: false, password: "" })).toBe(true);
  });

  it("says what went wrong, in place", () => {
    expect(deleteAccountError(failed("INVALID_PASSWORD"))).toBe("Wrong password");
    expect(deleteAccountError(failed("PASSWORD_REQUIRED"))).toBe("Enter your password");
    expect(deleteAccountError(failed("SESSION_EXPIRED"))).toBe(
      "Sign out and in again, then delete the account.",
    );
    expect(deleteAccountError(failed("too_many_requests", 429))).toBe(
      "Too many attempts. Try again in a minute.",
    );
    expect(deleteAccountError(new ApiClientError("network", "Can't reach the server", null))).toBe(
      "Can't reach the server",
    );
  });
});

describe("after deleting", () => {
  it("Sign in opens without the page in next, and says the account was deleted", () => {
    expect(redirectFor({ signedIn: false, byChoice: true }, "/settings/account", "")).toBe(
      "/signin",
    );
    expect(ACCOUNT_DELETED).toBe("Your account was deleted.");
  });
});
