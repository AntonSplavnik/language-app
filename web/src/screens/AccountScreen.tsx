import { ApiClientError, type SignInMethods } from "@language-app/core";
import { useEffect, useState } from "react";
import { api } from "../api";
import { aiFeaturesText } from "../auth/aiFeatures";
import {
  canConfirmDelete,
  DELETE_QUESTION,
  DELETE_WARNING,
  deleteAccountError,
  hasPassword,
  needsGoogleAgain,
} from "../auth/deleteAccount";
import {
  CONNECT_GOOGLE,
  DISCONNECTING,
  disconnectError,
  disconnected,
  disconnectGoogle,
  GOOGLE_ONLY_WAY,
  googleAccountError,
  googleRow,
  googleStartError,
  SIGN_IN_WITH_GOOGLE,
  signInWithGoogleAgain,
  withoutMethod,
} from "../auth/google";
import { useAuth, useSignedInUser } from "../auth/session";
import { useCallbackError, useGoogleRedirect } from "../auth/useGoogle";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { FormField } from "../components/FormCard";
import { GoogleButton } from "../components/GoogleButton";
import { CheckIcon } from "../components/icons";
import { Page } from "../components/Page";
import { errorMessage, useToast } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./AccountScreen.module.css";

/**
 * Account (§10 screen 19): who is signed in, how they sign in (Password, Google with Connect or
 * Disconnect), whether the AI features are included, Sign out, and Delete account at the bottom.
 * Connect, and signing in with Google again before deleting, come back here (with `?error=` on a
 * failure); Disconnect stays on the page.
 */
export function AccountScreen() {
  const user = useSignedInUser();
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "signOut" | "delete" | "disconnect">(null);
  // How the account signs in; null until known (or if it can't be loaded).
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  // What deleting failed with, kept as the error itself: Sign in with Google depends on it.
  const [deleteFailure, setDeleteFailure] = useState<{ error: unknown } | null>(null);
  // Why Google didn't connect (or sign in again): from its return, or from asking for its address;
  // or why it didn't disconnect.
  const googleCode = useCallbackError();
  const [googleError, setGoogleError] = useState<string | null>(() =>
    googleCode ? googleAccountError(googleCode, user.email) : null,
  );
  // What Disconnect did, in grey under the rows.
  const [googleNote, setGoogleNote] = useState<string | null>(null);
  const google = useGoogleRedirect();

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
  const googleState = googleRow(methods, auth.googleOffered);
  const deleteError = deleteFailure
    ? deleteAccountError(deleteFailure.error, { googleOffered: auth.googleOffered })
    : null;
  // A Google-only account whose sign-in is a day old: Sign in with Google, back to Account.
  const googleAgain =
    deleteFailure !== null && needsGoogleAgain(deleteFailure.error, auth.googleOffered);
  const anyBusy = busy !== null || google.busy;

  const connect = () => {
    setGoogleError(null);
    setGoogleNote(null);
    google.go(
      () => api.linkSocial(CONNECT_GOOGLE),
      (error) => setGoogleError(googleStartError(error)),
    );
  };

  // Its failure (no answer from the server) is a toast: the confirmation keeps its message.
  const signInAgain = () =>
    google.go(
      () => api.signInSocial(signInWithGoogleAgain(user.email)),
      (error) => toast.show(googleStartError(error)),
    );

  // Stays on the page (it doesn't go to Google, so it works over the LAN too). Afterwards the row
  // is Connect where Google is offered, and gone where it isn't.
  const disconnect = async () => {
    const request = disconnectGoogle(methods);
    if (methods === null || request === null) return;
    setBusy("disconnect");
    setGoogleError(null);
    setGoogleNote(null);
    try {
      await api.unlinkAccount(request);
      setMethods(withoutMethod(methods, request.accountId));
      setGoogleNote(disconnected(user));
    } catch (error) {
      setGoogleError(disconnectError(error));
      // Disconnected elsewhere meanwhile: show the methods as they are now.
      if (error instanceof ApiClientError && error.code === "ACCOUNT_NOT_FOUND") {
        api.listAccounts().then(setMethods, () => {});
      }
    }
    setBusy(null);
  };

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
    setDeleteFailure(null);
    try {
      await api.deleteAccount(needsPassword ? { password } : {});
      // Sign in, saying the account was deleted; nothing of it is left to go back to.
      auth.accountDeleted();
    } catch (error) {
      setDeleteFailure({ error });
      setBusy(null);
    }
  };

  const keep = () => {
    setConfirming(false);
    setPassword("");
    setDeleteFailure(null);
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
          {googleState === "connected" && (
            <li className={styles.method}>
              Google
              <span className={styles.end}>
                {/* Hidden while disconnecting: it is no longer sure, and the row needs the room. */}
                {busy !== "disconnect" && (
                  <span className={styles.connected}>
                    Connected
                    <CheckIcon className={styles.check} />
                  </span>
                )}
                <button
                  type="button"
                  className={`${ui.button} ${ui.secondary} ${ui.small}`}
                  disabled={anyBusy}
                  aria-busy={busy === "disconnect" || undefined}
                  onClick={disconnect}
                >
                  {busy === "disconnect" && <span className={ui.spinner} />}
                  {busy === "disconnect" ? DISCONNECTING : "Disconnect"}
                </button>
              </span>
            </li>
          )}
          {googleState === "onlyWay" && (
            <li className={styles.method}>
              Google
              <span className={styles.connected}>
                Connected
                <CheckIcon className={styles.check} />
              </span>
            </li>
          )}
          {googleState === "connect" && (
            <li className={styles.method}>
              Google
              <button
                type="button"
                className={`${ui.button} ${ui.secondary} ${ui.small}`}
                disabled={anyBusy}
                aria-busy={google.busy || undefined}
                onClick={connect}
              >
                {google.busy && <span className={ui.spinner} />}
                {google.busy ? "Connecting…" : "Connect"}
              </button>
            </li>
          )}
        </ul>
        {googleState === "onlyWay" && <p className={styles.note}>{GOOGLE_ONLY_WAY}</p>}
        {googleNote && (
          <p className={styles.note} role="status">
            {googleNote}
          </p>
        )}
        {googleError && (
          <p className={styles.error} role="alert">
            {googleError}
          </p>
        )}
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
        disabled={anyBusy}
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
        disabled={anyBusy}
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
                setDeleteFailure(null);
              }}
            />
          ) : (
            deleteError && (
              <>
                <p className={styles.error} role="alert">
                  {deleteError}
                </p>
                {googleAgain && (
                  <GoogleButton
                    label={SIGN_IN_WITH_GOOGLE}
                    busy={google.busy}
                    disabled={busy !== null}
                    onClick={signInAgain}
                  />
                )}
              </>
            )
          )
        }
      >
        {DELETE_WARNING}
      </ConfirmDelete>
    </Page>
  );
}
