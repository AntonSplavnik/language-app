import { useState } from "react";
import { api } from "../api";
import { useAuth, useSignedInUser } from "../auth/session";
import { CheckIcon } from "../components/icons";
import { Page } from "../components/Page";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./AccountScreen.module.css";

/**
 * Account (§10 screen 19): who is signed in, how they sign in, whether the AI features are
 * included, and Sign out. (Google and Delete account come with M12.3 and M12.2.)
 */
export function AccountScreen() {
  const user = useSignedInUser();
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await api.signOut();
      // The app's gate goes to Sign in, without this page in `next`.
      auth.signedOut();
    } catch (error) {
      toast.show(errorMessage(error));
      setBusy(false);
    }
  };

  return (
    <Page largeTitle="Account" back="/settings">
      <section className={`${ui.card} ${styles.who}`} aria-label="Signed in as">
        <p className={styles.name}>{user.displayUsername ?? user.username ?? user.email}</p>
        <p className={styles.email}>{user.email}</p>
      </section>

      <section className={`${ui.card} ${styles.section}`} aria-labelledby="sign-in-methods">
        <h2 id="sign-in-methods" className={ui.label}>
          Sign-in methods
        </h2>
        <ul className={styles.methods}>
          <li className={styles.method}>
            Password
            <CheckIcon className={styles.check} />
            <span className={ui.srOnly}>(in use)</span>
          </li>
        </ul>
      </section>

      <section className={`${ui.card} ${styles.section}`} aria-labelledby="ai-features">
        <h2 id="ai-features" className={ui.label}>
          AI features
        </h2>
        <p className={styles.text}>
          {user.aiEnabled
            ? "Included: photo and PDF import, Ask AI, example sentences"
            : "Not included in your account"}
        </p>
      </section>

      <button
        type="button"
        className={`${ui.button} ${ui.secondary} ${ui.large} ${ui.block}`}
        disabled={busy}
        onClick={signOut}
      >
        {busy && <span className={ui.spinner} />}
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </Page>
  );
}
