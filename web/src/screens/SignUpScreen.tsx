import { useId, useState } from "react";
import { useLocation } from "react-router";
import { api } from "../api";
import {
  type FieldErrors,
  PASSWORD_HINT,
  SIGN_IN,
  type SignUpField,
  type SignUpFields,
  signUpError,
  signUpFieldErrors,
  USERNAME_HINT,
} from "../auth/rules";
import { useAuth } from "../auth/session";
import { FormCard, FormError, FormField } from "../components/FormCard";
import { Page } from "../components/Page";
import ui from "../styles/ui.module.css";
import styles from "./AuthScreens.module.css";

/**
 * Create account (§10 screen 18): email, username and password, for an email on the invite list.
 * The new account is signed in at once; the app's gate then returns to `?next=`.
 */
export function SignUpScreen() {
  const { search } = useLocation();
  const auth = useAuth();
  const formId = useId();
  const [fields, setFields] = useState<SignUpFields>({ email: "", username: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Typing in a field takes its error away.
  const change = (field: SignUpField) => (event: { target: { value: string } }) => {
    setFields((current) => ({ ...current, [field]: event.target.value }));
    setErrors(({ [field]: _, ...rest }) => rest);
  };

  const create = async (form: HTMLFormElement) => {
    if (busy) return;
    const found = signUpFieldErrors(fields);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const { user } = await api.signUp({
        email: fields.email.trim(),
        username: fields.username.trim(),
        password: fields.password,
      });
      auth.signedIn(user);
    } catch (failure) {
      const { field, message } = signUpError(failure);
      if (field) setErrors({ [field]: message });
      else setFormError(message);
      setBusy(false);
    }
  };

  return (
    <Page
      largeTitle="Create account"
      back={`${SIGN_IN}${search}`}
      footer={
        <button
          type="submit"
          form={formId}
          className={`${ui.button} ${ui.primary} ${ui.cta}`}
          disabled={busy}
        >
          {busy && <span className={ui.spinner} />}
          {busy ? "Creating account…" : "Create account"}
        </button>
      }
    >
      <p className={ui.lead}>Invite only: use the email your invite was sent to.</p>
      <form
        id={formId}
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          create(event.currentTarget);
        }}
      >
        <FormCard>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            value={fields.email}
            error={errors.email}
            onChange={change("email")}
          />
          <FormField
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            note={USERNAME_HINT}
            value={fields.username}
            error={errors.username}
            onChange={change("username")}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            enterKeyHint="go"
            note={PASSWORD_HINT}
            value={fields.password}
            error={errors.password}
            onChange={change("password")}
          />
        </FormCard>
        {formError && <FormError>{formError}</FormError>}
      </form>
    </Page>
  );
}
