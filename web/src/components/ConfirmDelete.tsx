import type { ReactNode } from "react";
import ui from "../styles/ui.module.css";
import styles from "./ConfirmDelete.module.css";
import { TrashIcon } from "./icons";

type ConfirmDeleteProps = {
  /** The button at rest, and the section's name: "Delete word", "Delete account". */
  label: string;
  /** While asking: the question, in bold. */
  question: ReactNode;
  /** What is lost, under the question. */
  children: ReactNode;
  /** Fields between the question and the buttons (Delete account's password). */
  fields?: ReactNode;
  asking: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onDelete: () => void;
  /** Deleting now: a spinner on Delete, and Keep can't be pressed. */
  deleting: boolean;
  /** The screen is busy otherwise (saving, signing out): nothing can be deleted meanwhile. */
  disabled?: boolean;
  /** Whether Delete can be pressed yet: false until its fields are filled (a password). */
  ready?: boolean;
};

/**
 * Deleting asks in place, never with a browser dialog (Edit word, Account): at rest a soft red
 * button with a bin; asking, a red-tinted card with the question, any fields, and Keep / Delete.
 * See docs/design-system/components/ConfirmDelete.md. Enter in a field deletes, as Delete does.
 */
export function ConfirmDelete({
  label,
  question,
  children,
  fields,
  asking,
  onAsk,
  onKeep,
  onDelete,
  deleting,
  disabled = false,
  ready = true,
}: ConfirmDeleteProps) {
  const canDelete = ready && !disabled && !deleting;
  return (
    <section className={styles.section} aria-label={label}>
      {asking ? (
        <form
          className={styles.confirm}
          onSubmit={(event) => {
            event.preventDefault();
            if (canDelete) onDelete();
          }}
        >
          <div className={styles.question}>
            <span className={styles.trash}>
              <TrashIcon size={20} />
            </span>
            <p>
              <strong>{question}</strong> {children}
            </p>
          </div>
          {fields}
          <div className={styles.buttons}>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary} ${styles.choice}`}
              disabled={deleting}
              onClick={onKeep}
            >
              Keep
            </button>
            <button
              type="submit"
              className={`${ui.button} ${ui.danger} ${styles.choice}`}
              disabled={!canDelete}
            >
              {deleting && <span className={ui.spinner} />}
              Delete
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={`${ui.button} ${styles.deleteButton}`}
          disabled={disabled}
          onClick={onAsk}
        >
          <TrashIcon size={20} />
          {label}
        </button>
      )}
    </section>
  );
}
