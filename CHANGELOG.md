# Changelog

## Unreleased

### Terminal
- Real terminal emulation (xterm.js headless): truecolor and 256 colours, emoji/CJK
  wide characters, scroll regions, alternate screen, application cursor keys,
  bracketed paste, window titles, and replies to device queries (some CLIs hang
  without them). Claude Code, vim, less and htop render correctly.
- Native renderer that paints cells straight into the frame buffer, repaints only
  on change, and sizes the PTY to the exact panel size.
- Correct keyboard encoding, including the kitty protocol (Ghostty/kitty/WezTerm):
  upper case, Alt, Ctrl+symbols, F-keys and keypad; Shift+Enter inserts a newline
  in Claude Code; Shift+Tab is passed through.
- Every key goes to the shell (Tab completion, Ctrl+R/W/K, `?`). `Ctrl+X` is the
  leader key to reach the IDE.
- Tabs (`Ctrl+X T`, `]`/`[`, `W`) and side-by-side split (`Ctrl+X \`, `O`), with
  `•`/`🔔` marks and a notification when a background tab rings the bell.
- Shells survive Zen mode, maximize, the agent panel and mini mode.
- Mouse: wheel scrollback, drag to select (copied automatically), and double-click
  on `file.ts:42` in the output to open it.
- Scrollback search (`Ctrl+X /`); `Shift+PgUp`/`Shift+↑` scrolling; Enter restarts
  an exited shell.

### AI agent panel (ACP)
- A working ACP v1 client.
  - Before: wrong method names; every request answered "success" without doing
    anything, so writes were silently lost; permissions auto-approved.
  - Now: real file read/write (sandboxed to the project), terminals, permission
    dialogs, cancel with Esc, plans, thoughts, and `/` command suggestions.
- Claude works out of the box: it uses `claude-agent-acp` or runs it via `bunx`.
- The agent keeps running when its panel is hidden. Clicking a tool's file opens it.

### Editor
- Syntax highlighting: tree-sitter for TS/JS/Markdown/Zig, a tokenizer for the rest.
  Before, everything was plain text.
- Themes now apply to code colours and panel accents; preferences are saved.
- Data safety:
  - Fixed truncation of files larger than 1 MB on save.
  - Fixed files being emptied when the editor was hidden with a pending save.
  - Fixed every opened file being rewritten unchanged.
  - Fixed Ctrl+K/W/D editing the buffer.
  - A deleted or renamed file is no longer recreated.
  - The last edit is no longer lost on quit.
- Follows changes made on disk by other programs: reloads when there are no unsaved
  edits, otherwise shows a conflict banner (`Ctrl+R` theirs, `Ctrl+S` yours).
- F12 go to definition, Ctrl+Z/Ctrl+Shift+Z undo/redo, Ctrl+C copy, Ctrl+S save.
- The cursor position tracks arrow keys, so word highlight, bracket matching and
  go-to-definition act at the right place.
- Huge files open instantly (600k lines: under 1 s).
- Quick settings work: word wrap, line numbers, minimap, auto save.

### Git and files
- Fixed git integration bugs: every repo was detected as "not a repo", the file
  tree never showed status, paths were wrong and failed commands reported success.
- Commit with Enter. Discard asks for confirmation and keeps staged changes.
  Enter on a commit shows its diff, with multi-file patches.
- One project watcher: changes show up in about 0.3 s, with no polling.
- The file tree follows the file system, keeps expanded folders, scrolls in long
  folders and shows dotfiles. Tabs follow renames.
- Search in files uses ripgrep / git grep and no longer freezes the UI. The file
  finder honours `.gitignore`.

### UI
- Usable at 80×24 and at 46×14 (mini mode); nothing is drawn over borders and
  labels no longer wrap.
- Each panel is isolated by an error boundary (a crash shows a reloadable panel).
- Quitting restores your terminal (alternate screen, mouse, cursor, paste modes).
- Idle CPU went from about 5% to 0.9%.
- Help and shortcut overlays are accurate.
- The command palette ranks results and has new terminal commands.
- `termide --help`, `--version`, and an error for a path that is not a directory.

### Development
- More than 300 tests (`bun test`): PTY sessions, rendering via `testRender`, ACP
  against a mock agent, and git in temporary repos.
- `bun scripts/smoke.ts` runs the whole app headlessly and prints the screen.
  `bun scripts/exit-check.ts` verifies terminal restoration and the save on quit.
