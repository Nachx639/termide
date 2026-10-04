#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
import { disposeAllTerminals } from "./lib/terminal/TerminalManager";
import { quit } from "./lib/quit";
import { disposeAllAgents } from "./hooks/useACP";
import * as path from "path";
import * as fs from "fs";

// Debug log
const debugLog = (msg: string) => {
  fs.appendFileSync("/tmp/termide-debug.log", `[${new Date().toISOString()}] ${msg}\n`);
};

// Note: Ctrl+C exits the app (handled by Bun at low level)
// Use Ctrl+Q for Zen Mode toggle within the app

// Get the root path from command line or use current directory
const rootPath = path.resolve(process.argv[2] || process.cwd());

// 🎯 Full mouse support + Ctrl+C goes to PTY, not to exit
const renderer = await createCliRenderer({
  useMouse: true,
  exitOnCtrlC: false, // Critical: let Terminal.tsx handle Ctrl+C → PTY, don't kill Termide
});
debugLog("🖱️ Renderer created with useMouse: true");

// Export renderer for selection API
(globalThis as any).__termideRenderer = renderer;

const root = createRoot(renderer);
root.render(<App rootPath={rootPath} />);

// SIGTERM / SIGHUP (terminal window closed): restore the terminal and exit.
process.on("SIGTERM", () => quit(0));
process.on("SIGHUP", () => quit(0));
// Shells and the programs inside them go down with termide, whatever the exit path.
process.on("exit", () => {
  disposeAllTerminals();
  disposeAllAgents();
});
