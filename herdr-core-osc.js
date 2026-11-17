// Reports Kilo agent state to herdr-core via OSC 7501 so herdr-app's Agents pane shows this terminal.
// Companion to herdr-agent-state.js (herdr TUI socket integration, inert under herdr-app/herdr-core).
// State mapping mirrors herdr-agent-state.js. herdr-core accepts states: idle, working, done, blocked, error.
// Guarded by HC_TERMINAL_ID, the env marker herdr-core sets in every terminal it launches.
// Never throws, never logs.

import fs from "node:fs";

const APP = "kilo";
const ST = "\x1b\\";
let lastRecord = "";

function stateFromSessionStatus(status) {
  if (typeof status !== "string") {
    return undefined;
  }
  switch (status.toLowerCase()) {
    case "idle":
      return "idle";
    case "active":
    case "busy":
    case "pending":
    case "running":
    case "streaming":
    case "working":
      return "working";
    default:
      return undefined;
  }
}

function emit(record) {
  try {
    if (!process.env.HC_TERMINAL_ID) {
      return;
    }
    if (record === lastRecord) {
      return;
    }
    lastRecord = record;
    const seq = `\x1b]7501;${record}${ST}`;
    if (process.stdout && process.stdout.isTTY) {
      process.stdout.write(seq);
      return;
    }
    // stdout redirected (e.g. kilo serve with a log file): write to the controlling terminal
    const fd = fs.openSync("/dev/tty", "w");
    try {
      fs.writeSync(fd, seq);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // never disturb the CLI
  }
}

function report(state, kind) {
  emit(kind ? `state=${state}:kind=${kind}:app=${APP}` : `state=${state}:app=${APP}`);
}

export const HerdrCoreOscPlugin = async () => {
  if (!process.env.HC_TERMINAL_ID) {
    return {};
  }

  return {
    "chat.message": async () => {
      report("working");
    },
    event: async ({ event }) => {
      const type = event?.type;
      const properties = event?.properties ?? {};

      switch (type) {
        case "session.status": {
          const state = stateFromSessionStatus(properties.status);
          if (state) {
            report(state);
          }
          break;
        }
        case "tool.execute.before":
        case "tool.execute.after":
        case "permission.replied":
        case "question.replied":
        case "question.rejected":
        case "session.compacted":
          report("working");
          break;
        case "permission.asked":
          report("blocked", "permission");
          break;
        case "question.asked":
          report("blocked", "question");
          break;
        case "session.error":
          report("blocked");
          break;
        case "session.idle":
          report("idle");
          break;
        default:
          break;
      }
    },
  };
};
