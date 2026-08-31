#!/usr/bin/env node

import { main } from "../src/ui";
import {
  createSession,
  loadLatestSession,
  loadSession,
  listSessions,
  saveSession,
} from "../src/session";
import { pickSession } from "../src/session-picker";
import type { Session } from "../src/session";

const args = process.argv.slice(2);

let session: Session | null = null;

if (args[0] === "--continue") {
  session = await loadLatestSession();

  if (!session) {
    console.error("No previous session found.");
    process.exit(1);
  }
} else if (args[0] === "--resume") {
  if (args[1]) {
    try {
      session = await loadSession(args[1]);
    } catch {
      console.error(`Session not found: ${args[1]}`);
      process.exit(1);
    }
  } else {
    const sessions = await listSessions();

    if (!sessions.length) {
      console.error("No saved sessions.");
      process.exit(1);
    }

    session = await pickSession(sessions);

    if (!session) {
      process.exit(0);
    }
  }
} else {
  session = createSession();
  await saveSession(session);
}

if (!session) {
  process.exit(1);
}

main(session);
