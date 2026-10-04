# Agent Client Protocol (ACP) Support

termide's agent panel is an [ACP](https://agentclientprotocol.com) client: it runs an
ACP agent as a subprocess (JSON-RPC over stdio) and gives it access to the project.

## Using it

1. `Ctrl+Space` (or `Ctrl+K` → "Toggle AI Agent") opens the panel.
2. Pick an agent with `↑↓` and `Enter`:
   - **Claude** — uses `claude-agent-acp` if installed, otherwise runs
     `bunx @agentclientprotocol/claude-agent-acp` (no setup needed).
   - **Gemini** — `gemini --experimental-acp` (`npm install -g @google/gemini-cli`).
   - **Custom…** — any command that speaks ACP over stdio.
3. Type a prompt and press `Enter`. `/` lists the agent's slash commands (`Tab` completes).

| Key | Action |
| :--- | :--- |
| `Esc` | Stop the running turn (`session/cancel`) |
| `Esc Esc` | Disconnect |
| `←/→` `Enter`, `1`-`9`, `Esc` | Answer a permission request (Esc rejects) |
| `Ctrl+T` | Show / hide the agent's thinking |

The agent keeps running when the panel is hidden (Zen mode, `Ctrl+Space`, small
screens); it stops when termide exits.

## What the agent can do

termide implements the ACP v1 client methods:

- `fs/read_text_file` (with `line` / `limit`) and `fs/write_text_file` (creates
  directories). Paths are resolved against the project and **cannot leave it**.
- `session/request_permission` — shown as a dialog; you choose the option.
- `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`,
  `terminal/release` — commands run in the project with an output byte limit.

The timeline shows streamed replies (Markdown), tool calls with their status,
locations (click to open) and diff stats (click to open the file), live terminal
output, and the agent's plan while it works. If the agent dies, pending requests
fail and the last lines of its stderr are shown.

## Architecture

- `src/lib/ACP.ts` — JSON-RPC 2.0 over stdio (requests, notifications, agent →
  client requests, stderr capture, exit handling).
- `src/lib/acp/AcpSession.ts` — the protocol: handshake, timeline, client methods,
  permissions, cancellation. UI-free; tested against `src/lib/acp/fixtures/mock-agent.ts`.
- `src/hooks/useACP.ts` — one session per project for the app's lifetime.
- `src/components/AgentPanel.tsx` — the UI.
