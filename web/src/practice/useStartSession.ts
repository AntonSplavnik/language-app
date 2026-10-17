import type { CreateSessionRequest } from "@language-app/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api";
import { errorMessage, useToast } from "../lib/toast";

/** Starts a practice session and opens its first card (§8.1). */
export function useStartSession() {
  const navigate = useNavigate();
  const toast = useToast();
  const [starting, setStarting] = useState(false);

  /** A source, with the import to practise for `import`. */
  const start = async (choice: CreateSessionRequest) => {
    setStarting(true);
    try {
      const session = await api.createSession(choice);
      navigate(`/practice/${session.id}`, { state: session });
    } catch (error) {
      toast.show(errorMessage(error));
      setStarting(false);
    }
  };

  return { start, starting };
}
