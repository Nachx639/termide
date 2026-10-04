/**
 * Environment for running termide under a test harness. The shells termide
 * spawns must not touch the user's real setup: an empty ZDOTDIR (no ~/.zshrc,
 * no history file) and HISTFILE=/dev/null for bash/sh. Before 2026-10-04 the
 * harness commands (echo, less, vim, claude...) ended up in ~/.zsh_history.
 */
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export function harnessEnv(prefix = "termide-harness-"): Record<string, string> {
  const zdot = mkdtempSync(join(tmpdir(), `${prefix}zdot-`));
  // A minimal, predictable prompt; no history is kept anywhere.
  writeFileSync(join(zdot, ".zshrc"), "unset HISTFILE\nSAVEHIST=0\nPROMPT='%~ › '\n");
  return {
    TERMIDE_SESSION_DIR: mkdtempSync(join(tmpdir(), prefix)),
    ZDOTDIR: zdot,
    HISTFILE: "/dev/null",
  };
}
