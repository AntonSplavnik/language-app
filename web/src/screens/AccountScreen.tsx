import type { SignInMethods } from "@language-app/core";
import { useEffect, useState } from "react";
import { api } from "../api";
import { aiFeaturesText } from "../auth/aiFeatures";
import {
  canConfirmDelete,
  DELETE_QUESTION,
  DELETE_WARNING,
  deleteAccountError,
  hasPassword,
} from "../auth/deleteAccount";
import { useAuth, useSignedInUser } from "../auth/session";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { FormField } from "../components/FormCard";
import { CheckIcon } from "../components/icons";
import { Page } from "../components/Page";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./AccountScreen.module.css";

/**
 * Account (§10 screen 19): who is signed in, how they sign in, whether the AI features are
 * included, Sign out, and Delete account at the bottom. (Google comes with M12.3.)
 */
export function AccountScreen() {
  const user = useSignedInUser();
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "signOut" | "delete">(null);
  // How the account signs in; null until known (or if it can't be loaded).
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api.listAccounts().then(
      (found) => current && setMethods(found),
      // Without the list the screen assumes a password, as every account but a Google-only one has.
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);

  const needsPassword = hasPassword(methods);

  const signOut = async () => {
    setBusy("signOut");
    try {
      await api.signOut();
      // The app's gate goes to Sign in, without this page in `next`.
      auth.signedOut();
    } catch (error) {
      toast.show(errorMessage(error));
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    setDeleteError(null);
    try {
      await api.deleteAccount(needsPassword ? { password } : {});
      // Sign in, saying the account was deleted; nothing of it is left to go back to.
      auth.accountDeleted();
    } catch (error) {
      setDeleteError(deleteAccountError(error));
      setBusy(null);
    }
  };

  const keep = () => {
    setConfirming(false);
    setPassword("");
    setDeleteError(null);
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
          {needsPassword && (
            <li className={styles.method}>
              Password
              <CheckIcon className={styles.check} />
              <span className={ui.srOnly}>(in use)</span>
            </li>
          )}
        </ul>
      </section>

      <section className={`${ui.card} ${styles.section}`} aria-labelledby="ai-features">
        <h2 id="ai-features" className={ui.label}>
          AI features
        </h2>
        <p className={`${styles.text} ${user.aiEnabled ? "" : styles.off}`}>
          {aiFeaturesText(user.aiEnabled)}
        </p>
      </section>

      <button
        type="button"
        className={`${ui.button} ${ui.secondary} ${ui.large} ${ui.block}`}
        disabled={busy !== null}
        onClick={signOut}
      >
        {busy === "signOut" && <span className={ui.spinner} />}
        {busy === "signOut" ? "Signing out…" : "Sign out"}
      </button>

      <ConfirmDelete
        label="Delete account"
        question={DELETE_QUESTION}
        asking={confirming}
        onAsk={() => setConfirming(true)}
        onKeep={keep}
        onDelete={deleteAccount}
        deleting={busy === "delete"}
        disabled={busy !== null}
        ready={canConfirmDelete({ needsPassword, password })}
        fields={
          needsPassword ? (
            <FormField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              error={deleteError}
              onChange={(event) => {
                setPassword(event.target.value);
                setDeleteError(null);
              }}
            />
          ) : (
            deleteError && (
              <p className={styles.deleteError} role="alert">
                {deleteError}
              </p>
            )
          )
        }
      >
        {DELETE_WARNING}
      </ConfirmDelete>
    </Page>
  );
}
