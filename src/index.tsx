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

// 🔥 CRITICAL: Register SIGINT handler IMMEDIATELY before anything else
debugLog("📍 index.tsx: Registering SIGINT handler FIRST");
let lastSigint = 0;
process.on("SIGINT", () => {
  debugLog("⚡ SIGINT received in index.tsx!");
  const now = Date.now();
  if (now - lastSigint < 500) {
    debugLog("  → Double-tap, exiting...");
    process.stdout.write("\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l");
    process.exit(0);
  }
  lastSigint = now;
  debugLog("  → Single tap, should copy...");
});

// Get the root path from command line or use current directory
const rootPath = path.resolve(process.argv[2] || process.cwd());

// 🎯 Disable mouse handling at source so native Cmd+C copy works!
const renderer = await createCliRenderer({ useMouse: false });
debugLog("🖱️ Renderer created with useMouse: false");

const root = createRoot(renderer);
root.render(<App rootPath={rootPath} />);

// Handle graceful shutdown on SIGTERM (kill command)
// Note: SIGINT (Cmd+C) is handled in App.tsx for copy functionality!
const cleanExit = () => {
    // Reset terminal modes before exit
    process.stdout.write("\x1b[?1000l"); // Disable mouse tracking
    process.stdout.write("\x1b[?1006l"); // Disable SGR mouse
    process.stdout.write("\x1b[?25h");   // Show cursor
    process.stdout.write("\x1b[?1049l"); // Exit alternate buffer if active

    // Force exit without letting React try to unmount
    process.exit(0);
};

// Only SIGTERM triggers exit - SIGINT is now Cmd+C copy in App.tsx!
process.on("SIGTERM", cleanExit);
