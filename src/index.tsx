#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
import * as path from "path";

// Get the root path from command line or use current directory
const rootPath = path.resolve(process.argv[2] || process.cwd());

const renderer = await createCliRenderer();

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
