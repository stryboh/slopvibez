import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type Session = {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  messages: Message[];
};

const SESSION_DIR = join(
  process.env.HOME ?? ".",
  ".config",
  "slopvibez",
  "sessions",
);

export function createSession(): Session {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: "New session",
    cwd: process.cwd(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export async function saveSession(
  session: Session,
): Promise<void> {
  await mkdir(SESSION_DIR, { recursive: true });

  session.updatedAt = new Date().toISOString();

  await writeFile(
    join(SESSION_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf8",
  );
}

export async function loadSession(
  id: string,
): Promise<Session> {
  const data = await readFile(
    join(SESSION_DIR, `${id}.json`),
    "utf8",
  );

  const session = JSON.parse(data) as Session;

  session.name ??= "Unnamed session";
  session.messages ??= [];

  return session;
}

export async function listSessions(): Promise<Session[]> {
  try {
    const files = await readdir(SESSION_DIR);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      try {
        sessions.push(
          await loadSession(file.slice(0, -5)),
        );
      } catch {
        // Ignore broken session files.
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export async function loadLatestSession(): Promise<Session | null> {
  const sessions = await listSessions();
  return sessions[0] ?? null;
}
