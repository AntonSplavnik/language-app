import { createInterface } from "node:readline";

/**
 * Asks for a password. On a terminal it is typed hidden and asked twice; piped in
 * (`echo … | pnpm …`), the first line is used.
 */
export async function askPassword(): Promise<string> {
  if (!process.stdin.isTTY) return firstLine();
  const password = await readHidden("Password: ");
  if ((await readHidden("Repeat it: ")) !== password) throw new Error("The passwords differ");
  return password;
}

/**
 * Asks once for a secret that isn't chosen here, such as a key pasted from the password manager:
 * typed hidden on a terminal; piped in, the first line.
 */
export async function askSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return firstLine();
  return readHidden(question);
}

/**
 * Asks for one line that may be seen, such as a confirmation: typed visibly on a terminal (Ctrl+C
 * or Ctrl+D answer nothing); piped in, the first line.
 */
export async function askLine(question: string): Promise<string> {
  if (!process.stdin.isTTY) return firstLine();
  return new Promise((resolve) => {
    const lines = createInterface({ input: process.stdin, output: process.stdout });
    let answer = "";
    lines.question(question, (typed) => {
      answer = typed;
      lines.close();
    });
    lines.once("SIGINT", () => {
      process.stdout.write("\n");
      lines.close();
    });
    lines.once("close", () => resolve(answer));
  });
}

function firstLine(): Promise<string> {
  return new Promise((resolve) => {
    const lines = createInterface({ input: process.stdin });
    let answered = false;
    lines.once("line", (line) => {
      answered = true;
      resolve(line);
      lines.close();
    });
    lines.once("close", () => {
      if (!answered) resolve("");
    });
  });
}

function readHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let typed = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(typed);
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(new Error("Cancelled"));
          return;
        }
        typed = char === "\u007f" || char === "\b" ? typed.slice(0, -1) : typed + char;
      }
    };
    stdin.on("data", onData);
  });
}

/** The database a script works on, without its password, so the output says which one. */
export function databaseName(url: string): string {
  const { hostname, port, pathname } = new URL(url);
  return `${hostname}${port ? `:${port}` : ""}${pathname}`;
}
