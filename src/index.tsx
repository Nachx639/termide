#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
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

// Handle graceful shutdown on SIGTERM (kill command)
// Selection/copy is handled via onMouseUp in App.tsx
const cleanExit = () => {
    // Reset terminal modes before exit
    process.stdout.write("\x1b[?1000l"); // Disable mouse tracking
    process.stdout.write("\x1b[?1006l"); // Disable SGR mouse
    process.stdout.write("\x1b[?25h");   // Show cursor
    process.stdout.write("\x1b[?1049l"); // Exit alternate buffer if active

    // Force exit without letting React try to unmount
    process.exit(0);
};

// SIGTERM for clean exit
process.on("SIGTERM", cleanExit);
