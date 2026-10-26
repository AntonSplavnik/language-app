import type { AuthUser } from "@language-app/core";
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

/** Who is signed in on this device, as the app knows it (§17.3). */
export type AuthState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  /** `byChoice`: the learner signed out, so Sign in opens without the page in `next`. */
  | { kind: "signedOut"; byChoice?: boolean }
  | { kind: "signedIn"; user: AuthUser };

type AuthApi = {
  state: AuthState;
  /** After signing in or creating an account. */
  signedIn: (user: AuthUser) => void;
  /** After Sign out. */
  signedOut: () => void;
  /** Asks the server again, after the first request failed. */
  reload: () => void;
};

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Asks who is signed in when the app starts (`GET /api/auth/get-session`, which also keeps the
 * session cookie fresh), and notices when any request finds the session gone (a 401).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    api.getSession().then(
      (found) => setState(found ? { kind: "signedIn", user: found.user } : { kind: "signedOut" }),
      (error: unknown) => setState({ kind: "failed", message: errorMessage(error) }),
    );
  }, []);

  useEffect(reload, [reload]);
  useEffect(() => onUnauthorized(() => setState({ kind: "signedOut" })), []);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      signedIn: (user) => setState({ kind: "signedIn", user }),
      signedOut: () => setState({ kind: "signedOut", byChoice: true }),
      reload,
    }),
    [state, reload],
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
