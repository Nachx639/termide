#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
import * as path from "path";

// Get the root path from command line or use current directory
const rootPath = path.resolve(process.argv[2] || process.cwd());

const renderer = await createCliRenderer();
createRoot(renderer).render(<App rootPath={rootPath} />);
