import { ApiClientError, SignInOptions } from "@language-app/core";
import { describe, expect, it } from "vitest";
import {
  INVITE_ONLY,
  INVITE_ONLY_NOTE,
  isAuthPage,
  nextPath,
  PASSWORD_HINT,
  redirectFor,
  signInError,
  signInMethod,
  signInOptionsOrNone,
  signInPath,
  signUpError,
  signUpFieldErrors,
  signUpNote,
  TOO_MANY,
  USERNAME_HINT,
  WRONG_LOGIN,
} from "../src/auth/rules";

// Sign in and Create account (§10 screens 17 and 18).

const failed = (code: string, status = 400) =>
  new ApiClientError(code, `server says ${code}`, status);

describe("Sign in's one field", () => {
  it("is an email with an @, otherwise a username", () => {
    expect(signInMethod("anton@example.com")).toBe("email");
    expect(signInMethod("Anton")).toBe("username");
    expect(signInMethod("anton.k_2")).toBe("username");
    // Even a broken email goes to the email sign-in, whose answer then says it's wrong.
    expect(signInMethod("anton@")).toBe("email");
  });
});

describe("a page opened signed out", () => {
  it("goes to Sign in with the page kept in next", () => {
    expect(signInPath("/words?status=learned&q=tisch")).toBe(
      "/signin?next=%2Fwords%3Fstatus%3Dlearned%26q%3Dtisch",
    );
    expect(signInPath("/settings/imports/5")).toBe("/signin?next=%2Fsettings%2Fimports%2F5");
  });

  it("needs no next for Home, or for Sign in and Create account themselves", () => {
    expect(signInPath("/")).toBe("/signin");
    expect(signInPath("/signin?next=%2Fwords")).toBe("/signin");
    expect(signInPath("/signup")).toBe("/signin");
  });

  it("comes back to next after signing in", () => {
    const back = (page: string) => nextPath(new URL(signInPath(page), "http://x").search);
    expect(back("/words?status=learned&q=tisch")).toBe("/words?status=learned&q=tisch");
    expect(back("/practice/12")).toBe("/practice/12");
    expect(back("/")).toBe("/");
  });

  it("never leaves the app or goes back to a sign-in page", () => {
    expect(nextPath("")).toBe("/");
    expect(nextPath("?next=")).toBe("/");
    expect(nextPath("?next=https%3A%2F%2Fevil.example")).toBe("/");
    expect(nextPath("?next=%2F%2Fevil.example%2Fwords")).toBe("/");
    expect(nextPath("?next=%2F%5Cevil.example")).toBe("/");
    expect(nextPath("?next=words")).toBe("/");
    expect(nextPath("?next=%2Fsignup")).toBe("/");
    expect(nextPath("?next=%2Fsignin%3Fnext%3D%252Fwords")).toBe("/");
  });

  it("the app's gate: signed out to Sign in with next, signed in on to next", () => {
    const out = { signedIn: false } as const;
    const signedIn = { signedIn: true } as const;
    expect(redirectFor(out, "/words", "?status=learned")).toBe(
      "/signin?next=%2Fwords%3Fstatus%3Dlearned",
    );
    expect(redirectFor(out, "/signin", "?next=%2Fwords")).toBeNull();
    expect(redirectFor(out, "/signup", "")).toBeNull();
    expect(redirectFor(signedIn, "/words", "")).toBeNull();
    expect(redirectFor(signedIn, "/signin", "?next=%2Fwords")).toBe("/words");
    expect(redirectFor(signedIn, "/signup", "")).toBe("/");
  });

  it("after Sign out, Sign in opens without the page in next", () => {
    expect(redirectFor({ signedIn: false, byChoice: true }, "/settings/account", "")).toBe(
      "/signin",
    );
  });

  it("only Sign in and Create account are open signed out", () => {
    expect(isAuthPage("/signin")).toBe(true);
    expect(isAuthPage("/signup")).toBe(true);
    expect(isAuthPage("/")).toBe(false);
    expect(isAuthPage("/settings/account")).toBe(false);
  });
});

describe("Create account's field rules", () => {
  const valid = { email: "new@example.com", username: "New.User_1", password: "12345678" };

  it("accepts an email, a username of 3–30 letters, digits, . or _, and 8+ characters", () => {
    expect(signUpFieldErrors(valid)).toEqual({});
    expect(signUpFieldErrors({ ...valid, username: "abc" })).toEqual({});
    expect(signUpFieldErrors({ ...valid, username: "a".repeat(30) })).toEqual({});
    // Spaces typed around the email and the username don't count.
    expect(
      signUpFieldErrors({ ...valid, email: " new@example.com ", username: " Anton " }),
    ).toEqual({});
  });

  it("asks for an email, and a valid one", () => {
    expect(signUpFieldErrors({ ...valid, email: "  " })).toEqual({
      email: "Enter your email address",
    });
    expect(signUpFieldErrors({ ...valid, email: "new@" })).toEqual({
      email: "Enter a valid email address",
    });
  });

  it.each(["", "ab", "a".repeat(31), "new user", "new-user", "näme"])(
    "refuses the username %j with the rule",
    (username) => {
      expect(signUpFieldErrors({ ...valid, username })).toEqual({ username: USERNAME_HINT });
    },
  );

  it("needs at least 8 characters of password, and at most 128", () => {
    expect(signUpFieldErrors({ ...valid, password: "1234567" })).toEqual({
      password: PASSWORD_HINT,
    });
    expect(PASSWORD_HINT).toBe("At least 8 characters");
    expect(signUpFieldErrors({ ...valid, password: "x".repeat(129) })).toEqual({
      password: "At most 128 characters",
    });
  });

  it("names every field that's wrong at once", () => {
    expect(Object.keys(signUpFieldErrors({ email: "", username: "", password: "" }))).toEqual([
      "email",
      "username",
      "password",
    ]);
  });
});

describe("the wording for each error", () => {
  it("Sign in: a wrong password and an unknown name read alike", () => {
    for (const code of [
      "INVALID_EMAIL_OR_PASSWORD",
      "INVALID_USERNAME_OR_PASSWORD",
      "INVALID_EMAIL",
      "USERNAME_TOO_SHORT",
      "INVALID_USERNAME",
    ]) {
      expect(signInError(failed(code, 401)), code).toBe(WRONG_LOGIN);
    }
    expect(WRONG_LOGIN).toBe("Wrong email, username or password");
  });

  it("Sign in: too many attempts, and invite-only", () => {
    expect(signInError(failed("too_many_requests", 429))).toBe(TOO_MANY);
    expect(TOO_MANY).toBe("Too many attempts. Try again in a minute.");
    expect(signInError(failed("not_invited", 403))).toBe(INVITE_ONLY);
    expect(INVITE_ONLY).toBe("This app is invite-only. Ask for an invite first.");
  });

  it("Sign in: anything else says what went wrong", () => {
    expect(signInError(new ApiClientError("network", "Can't reach the server", null))).toBe(
      "Can't reach the server",
    );
  });

  it("Create account: a taken username or email under its field", () => {
    expect(signUpError(failed("USERNAME_IS_ALREADY_TAKEN"))).toEqual({
      field: "username",
      message: "This username is taken",
    });
    expect(signUpError(failed("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", 422))).toEqual({
      field: "email",
      message: "An account with this email exists. Sign in instead.",
    });
  });

  it("Create account: the server's own field rules under their fields", () => {
    expect(signUpError(failed("USERNAME_TOO_SHORT"))).toEqual({
      field: "username",
      message: USERNAME_HINT,
    });
    expect(signUpError(failed("INVALID_USERNAME"))).toEqual({
      field: "username",
      message: USERNAME_HINT,
    });
    expect(signUpError(failed("PASSWORD_TOO_SHORT"))).toEqual({
      field: "password",
      message: PASSWORD_HINT,
    });
    expect(signUpError(failed("INVALID_EMAIL"))).toEqual({
      field: "email",
      message: "Enter a valid email address",
    });
  });

  it("Create account: not invited, too many attempts or no connection under the card", () => {
    expect(signUpError(failed("not_invited", 403))).toEqual({ field: null, message: INVITE_ONLY });
    expect(signUpError(failed("too_many_requests", 429))).toEqual({
      field: null,
      message: TOO_MANY,
    });
    expect(signUpError(new ApiClientError("network", "Can't reach the server", null))).toEqual({
      field: null,
      message: "Can't reach the server",
    });
  });
});

describe("Create account's invite line (M12.7)", () => {
  const options = (google: boolean, signUp: "invite" | "open") => () =>
    Promise.resolve({ google, signUp });
  const lineFor = async (ask: () => Promise<SignInOptions>) =>
    signUpNote((await signInOptionsOrNone(ask)).signUp);

  it("shows while sign-up needs an invite", async () => {
    expect(await lineFor(options(true, "invite"))).toBe(
      "Invite only: use the email your invite was sent to.",
    );
    expect(await lineFor(options(false, "invite"))).toBe(INVITE_ONLY_NOTE);
  });

  it("not while sign-up is open", async () => {
    expect(await lineFor(options(true, "open"))).toBeNull();
    expect(await lineFor(options(false, "open"))).toBeNull();
  });

  it("not when the options request fails, which also means no Google", async () => {
    const offline = () =>
      Promise.reject(new ApiClientError("network", "Can't reach the server", null));
    expect(await signInOptionsOrNone(offline)).toEqual({ google: false, signUp: null });
    expect(await lineFor(offline)).toBeNull();
    // A server from before M12.7 answers without the mode, which the schema refuses.
    const old = () => Promise.reject(SignInOptions.safeParse({ google: true }).error);
    expect(await signInOptionsOrNone(old)).toEqual({ google: false, signUp: null });
  });

  it("the options come through as the server sent them", async () => {
    expect(await signInOptionsOrNone(options(true, "open"))).toEqual({
      google: true,
      signUp: "open",
    });
  });

  it("the refusal on submit keeps its own wording", () => {
    expect(INVITE_ONLY).toBe("This app is invite-only. Ask for an invite first.");
  });
});
