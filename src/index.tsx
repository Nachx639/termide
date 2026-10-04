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

// Command line: termide [dir] | --help | --version. Handled before the renderer
// takes over the terminal (a bad path used to start the IDE in a directory that
// does not exist, with a dead shell).
const arg = process.argv[2];
if (arg === "-h" || arg === "--help") {
  console.log(`termide — terminal IDE for AI coding agents

Usage: termide [directory]      open a project (default: current directory)
       termide --version

Inside: Ctrl+X is the leader key (Ctrl+X H shows every shortcut), F1 help.`);
  process.exit(0);
}
if (arg === "-v" || arg === "--version") {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  console.log(pkg.version);
  process.exit(0);
}
if (arg?.startsWith("-")) {
  console.error(`termide: unknown option ${arg} (try --help)`);
  process.exit(2);
}

// Get the root path from command line or use current directory
const rootPath = path.resolve(arg || process.cwd());
if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
  console.error(`termide: ${rootPath} is not a directory`);
  process.exit(1);
}

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
