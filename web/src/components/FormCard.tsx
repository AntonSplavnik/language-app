import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import ui from "../styles/ui.module.css";
import styles from "./FormCard.module.css";

/**
 * Several fields on one card (Sign in, Create account): each a FormField, the small uppercase
 * label over the field sunk into the card. See docs/design-system/components/TextField.md.
 */
export function FormCard({ children }: { children: ReactNode }) {
  return <div className={`${ui.card} ${styles.card}`}>{children}</div>;
}

type FormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  /** Help under the field in grey ("At least 8 characters"). */
  note?: string;
  /** In red under the field instead of the note; marks the field invalid. */
  error?: string | null;
};

export function FormField({ label, note, error, ...input }: FormFieldProps) {
  const id = useId();
  const noteId = useId();
  const text = error ?? note;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <input
        id={id}
        className={`${ui.input} ${ui.sunk}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={text ? noteId : undefined}
        {...input}
      />
      {text && (
        <span id={noteId} className={`${styles.note} ${error ? styles.invalid : ""}`}>
          {text}
        </span>
      )}
    </div>
  );
}

/** What went wrong for the whole form, in red under its card. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}
