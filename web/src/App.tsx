import { useEffect, useState } from "react";
import { checkServer, type ServerState } from "./health";

export function App() {
  const [server, setServer] = useState<ServerState | "checking">("checking");

  useEffect(() => {
    checkServer().then(setServer);
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h1>Language App</h1>
      <p>
        {server === "checking" && "Checking server…"}
        {server === "ok" && "server ok"}
        {server === "unreachable" && "Server unreachable"}
      </p>
    </main>
  );
}
