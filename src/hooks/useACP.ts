import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { spawn } from "bun";
import { AcpSession } from "../lib/acp/AcpSession";
import { logger } from "../lib/logger";

interface AgentSlot {
  session: AcpSession;
  proxy: ReturnType<typeof spawn> | null;
}

// One agent per project for the life of the app: hiding the agent panel (Ctrl+Space,
// Zen mode, mini mode) must not kill a running agent mid-task.
const slots = new Map<string, AgentSlot>();

function slotFor(cwd: string): AgentSlot {
  let slot = slots.get(cwd);
  if (!slot) {
    slot = { session: new AcpSession(), proxy: null };
    slots.set(cwd, slot);
  }
  return slot;
}

export function disposeAllAgents() {
  for (const slot of slots.values()) {
    slot.session.disconnect(false);
    try {
      slot.proxy?.kill();
    } catch {}
    slot.proxy = null;
  }
}

/** React binding for the project's AcpSession (pass `isolated` for a private one, e.g. tests). */
export function useACP(cwd: string, isolated = false) {
  const [slot] = useState(() => (isolated ? { session: new AcpSession(), proxy: null } : slotFor(cwd)));
  const session = slot.session;
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const killProxy = useCallback(() => {
    try {
      slot.proxy?.kill();
    } catch (err) {
      logger.debug("acp", "Failed to kill proxy process (may already be dead)", err);
    }
    slot.proxy = null;
  }, [slot]);

  const connect = useCallback(
    async (command: string, args: string[] = [], env?: Record<string, string>, proxyCommand?: string) => {
      killProxy();
      if (proxyCommand) {
        try {
          const [cmd, ...rest] = proxyCommand.split(" ");
          slot.proxy = spawn([cmd!, ...rest], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
          // Give the proxy a moment to bind its port.
          await new Promise((r) => setTimeout(r, 1500));
        } catch (e) {
          logger.debug("acp", "Failed to start proxy", e);
        }
      }
      await session.connect({ command, args, env, cwd });
    },
    [session, cwd, killProxy],
  );

  const disconnect = useCallback(() => {
    session.disconnect();
    killProxy();
  }, [session, killProxy]);

  // Only a private session dies with the component; the project's agent lives on.
  useEffect(() => () => {
    if (isolated) session.disconnect(false);
  }, [session, isolated]);

  return {
    state,
    connect,
    disconnect,
    prompt: (text: string) => session.prompt(text),
    cancel: () => session.cancel(),
    respondPermission: (optionId: string | null) => session.respondPermission(optionId),
  };
}
