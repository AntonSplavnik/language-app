import { useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { api } from "../api";
import { ACCOUNT_DELETED } from "../auth/deleteAccount";
import {
  CONTINUE_WITH_GOOGLE,
  continueWithGoogle,
  googleSignInError,
  googleStartError,
} from "../auth/google";
import { SIGN_UP, signInError, signInMethod } from "../auth/rules";
import { useAuth } from "../auth/session";
import { useCallbackError, useGoogleRedirect } from "../auth/useGoogle";
import { FormCard, FormError, FormField } from "../components/FormCard";
import { GoogleButton } from "../components/GoogleButton";
import { CheckIcon, ChevronRightIcon } from "../components/icons";
import { Page } from "../components/Page";
import ui from "../styles/ui.module.css";
import styles from "./AuthScreens.module.css";

/**
 * Sign in (§10 screen 17): one field for the email or the username, and the password, or Continue
 * with Google where Google can work. Signing in returns to the page kept in `?next=` (the app's
 * gate does that once the account is known); Google comes back here with `?error=` when it
 * didn't sign in.
 */
export function SignInScreen() {
  const { search } = useLocation();
  const auth = useAuth();
  // Right after Delete account (§10 screen 19); a reload, or signing in, forgets it.
  const deleted = auth.state.kind === "signedOut" && auth.state.deleted === true;
  const formId = useId();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const googleCode = useCallbackError();
  const [error, setError] = useState<string | null>(() =>
    googleCode ? googleSignInError(googleCode) : null,
  );
  const [busy, setBusy] = useState(false);
  const google = useGoogleRedirect();

  const continueGoogle = () => {
    setError(null);
    google.go(
      () => api.signInSocial(continueWithGoogle(search)),
      (failure) => setError(googleStartError(failure)),
    );
  };

  const signIn = async () => {
    const name = login.trim();
    if (busy || !name || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { user } =
        signInMethod(name) === "email"
          ? await api.signInEmail({ email: name, password })
          : await api.signInUsername({ username: name, password });
      auth.signedIn(user);
    } catch (failure) {
      setError(signInError(failure));
      setBusy(false);
    }
  };

  return (
    <Page
      largeTitle="Sign in"
      footer={
        <button
          type="submit"
          form={formId}
          className={`${ui.button} ${ui.primary} ${ui.cta}`}
          disabled={busy || google.busy || !login.trim() || !password}
        >
          {busy && <span className={ui.spinner} />}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      }
    >
      {deleted && (
        <p className={`${ui.card} ${styles.notice}`} role="status">
          <CheckIcon size={18} className={styles.noticeIcon} />
          {ACCOUNT_DELETED}
        </p>
      )}
      <form
        id={formId}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          signIn();
        }}
      >
        <FormCard>
          <FormField
            label="Email or username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormCard>
        {error && <FormError>{error}</FormError>}
      </form>
      {auth.googleOffered && (
        <GoogleButton
          label={CONTINUE_WITH_GOOGLE}
          onClick={continueGoogle}
          busy={google.busy}
          disabled={busy}
        />
      )}
      <nav className={styles.others} aria-label="No account yet">
        <Link to={`${SIGN_UP}${search}`} className={`${ui.button} ${ui.quiet} ${styles.other}`}>
          Create an account
          <ChevronRightIcon size={16} />
        </Link>
      </nav>
    </Page>
  );
}
