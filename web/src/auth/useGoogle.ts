import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { callbackError, withoutCallbackError } from "./google";

/**
 * The `?error=<code>` Google's return left in the address, read once when the screen opens; it is
 * then taken out of the address (keeping `next`), so a reload doesn't show it again.
 */
export function useCallbackError(): string | null {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [code] = useState(() => callbackError(search));
  useEffect(() => {
    if (callbackError(search)) {
      navigate({ pathname, search: withoutCallbackError(search) }, { replace: true });
    }
  }, [pathname, search, navigate]);
  return code;
}

/**
 * Sends the browser to Google: `start` asks the server for Google's address (sign-in/social or
 * link-social), then the page leaves for it. Busy until then; a failure goes to `onError` and the
 * button can be pressed again. Coming back with the browser's Back button can restore the page
 * as it was left (Safari's back-forward cache), so it is no longer busy then.
 */
export function useGoogleRedirect() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  const go = async (start: () => Promise<{ url: string }>, onError: (error: unknown) => void) => {
    if (busy) return;
    setBusy(true);
    try {
      const { url } = await start();
      window.location.assign(url);
    } catch (error) {
      onError(error);
      setBusy(false);
    }
  };

  return { busy, go };
}
