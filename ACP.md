# Agent Client Protocol (ACP) Support

Termide now supports the Agent Client Protocol (ACP), allowing you to integrate AI agents directly into the terminal IDE.

## Getting Started

1.  **Open the Agent Panel**:
    - Press `Ctrl+Space`.
    - Or open the Command Palette (`Ctrl+K`) and select "Toggle AI Agent".

2.  **Connect to an Agent**:
    - When the panel opens, you will be prompted to enter a command.
    - Enter the command to launch your ACP-compliant agent.
    - Examples:
        - `npx claude-code` (Claude Code)
        - `goose` (Goose Agent)
        - Custom scripts that speak ACP over stdio.

3.  **Chat**:
    - Once connected, use the input box to send messages to the agent.
    - The agent's responses will appear in the chat history.
    - To stop the agent, press `Ctrl+C` while the agent panel is focused.

## Architecture

The ACP implementation consists of:

-   `src/lib/ACP.ts`: The low-level JSON-RPC client that handles communication over `stdio`.
-   `src/hooks/useACP.ts`: A React hook managing the agent lifecycle and message state.
-   `src/components/AgentPanel.tsx`: The UI component for the chat interface.

## Supported Features

-   **Stdio Transport**: Launches agents as subprocesses using standard input/output.
-   **JSON-RPC 2.0**: Full support for requests, responses, and notifications.
-   **Chat Interface**: Basic conversational UI.

## Future Roadmap

-   **Tool Integration**: Expose Termide's file system and editor capabilities to the agent (e.g., `read_file`, `open_tab`).
-   **Mcp Support**: Enhanced support for Model Context Protocol features.
-   **Config**: Save preferred agent commands in user settings.
