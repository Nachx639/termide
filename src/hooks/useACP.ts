import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { spawn } from "bun";
import { AcpSession } from "../lib/acp/AcpSession";
import { logger } from "../lib/logger";

/**
 * React binding for an AcpSession. One session per hook instance; the agent and an
 * optional proxy process are killed on unmount.
 */
export function useACP(cwd: string) {
  const [session] = useState(() => new AcpSession());
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const proxyRef = useRef<ReturnType<typeof spawn> | null>(null);

  const killProxy = useCallback(() => {
    try {
      proxyRef.current?.kill();
    } catch (err) {
      logger.debug("acp", "Failed to kill proxy process (may already be dead)", err);
    }
    proxyRef.current = null;
  }, []);

  const connect = useCallback(
    async (command: string, args: string[] = [], env?: Record<string, string>, proxyCommand?: string) => {
      killProxy();
      if (proxyCommand) {
        try {
          const [cmd, ...rest] = proxyCommand.split(" ");
          proxyRef.current = spawn([cmd!, ...rest], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
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

  useEffect(
    () => () => {
      session.disconnect(false);
      killProxy();
    },
    [session, killProxy],
  );

  return {
    state,
    connect,
    disconnect,
    prompt: (text: string) => session.prompt(text),
    cancel: () => session.cancel(),
    respondPermission: (optionId: string | null) => session.respondPermission(optionId),
  };
}
