import type { AuthUser, SignUpMode } from "@language-app/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, onUnauthorized } from "../api";
import { errorMessage } from "../lib/toast";
import { googleOffered } from "./google";
import { type KnownSignInOptions, signInOptionsOrNone } from "./rules";

/** Who is signed in on this device, as the app knows it (§10, Signed in or not). */
export type AuthState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  /**
   * `byChoice`: the learner signed out (or deleted the account), so Sign in opens without the page
   * in `next`; `deleted`: Sign in says "Your account was deleted."
   */
  | { kind: "signedOut"; byChoice?: boolean; deleted?: boolean }
  | { kind: "signedIn"; user: AuthUser };

type AuthApi = {
  state: AuthState;
  /**
   * Whether Google can be offered on this page: the server has the Google pair and the app is
   * opened where Google returns to (https, or localhost; §10).
   */
  googleOffered: boolean;
  /** Who can create an account, as the server says (§4 Accounts); null when it couldn't be asked. */
  signUpMode: SignUpMode | null;
  /** After signing in or creating an account. */
  signedIn: (user: AuthUser) => void;
  /** After Sign out. */
  signedOut: () => void;
  /** After Delete account: signed out, and Sign in says so. */
  accountDeleted: () => void;
  /** Asks the server again, after the first request failed. */
  reload: () => void;
};

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Asks who is signed in when the app starts (`GET /api/auth/get-session`, which also keeps the
 * session cookie fresh), and at the same time whether the server offers Google and who can create
 * an account, so Sign in and Create account show the right things from the start; notices when
 * any request finds the session gone (a 401).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });
  const [options, setOptions] = useState<KnownSignInOptions>({ google: false, signUp: null });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    Promise.all([api.getSession(), signInOptionsOrNone(api.signInOptions)]).then(
      ([found, known]) => {
        setOptions(known);
        setState(found ? { kind: "signedIn", user: found.user } : { kind: "signedOut" });
      },
      (error: unknown) => setState({ kind: "failed", message: errorMessage(error) }),
    );
  }, []);

  useEffect(reload, [reload]);
  useEffect(() => onUnauthorized(() => setState({ kind: "signedOut" })), []);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      googleOffered: googleOffered(options.google, window.location),
      signUpMode: options.signUp,
      signedIn: (user) => setState({ kind: "signedIn", user }),
      signedOut: () => setState({ kind: "signedOut", byChoice: true }),
      accountDeleted: () => setState({ kind: "signedOut", byChoice: true, deleted: true }),
      reload,
    }),
    [state, options, reload],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthApi {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth needs an <AuthProvider>");
  return auth;
}

/** The signed-in account; only for screens behind the sign-in (every screen but two). */
export function useSignedInUser(): AuthUser {
  const { state } = useAuth();
  if (state.kind !== "signedIn") throw new Error("useSignedInUser needs a signed-in learner");
  return state.user;
}
