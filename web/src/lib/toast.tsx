import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import styles from "./Toast.module.css";

type Toast = { id: number; message: string };
type ToastApi = { show: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = 4000;

/** Short messages at the bottom of the screen, e.g. a server error (§12 General). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.filter((t) => t.message !== message), { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), DURATION_MS);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a <ToastProvider>");
  return api;
}

/** The message to show for a failed request. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";
