import { useState, useCallback, useRef } from "react";
import { ACPClient } from "../lib/ACP";

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export function useACP() {
  const [client, setClient] = useState<ACPClient | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const connect = useCallback(async (command: string, args: string[] = []) => {
    if (client) {
      client.kill();
    }

    setStatus('connecting');
    setError(null);

    const newClient = new ACPClient({
      command,
      args,
      onNotification: (method, params) => {
        // Handle session/update notifications (streaming responses)
        if (method === 'session/update') {
          const update = params?.update;
          if (!update) return;

          // Handle text message chunks from the agent
          if (update.sessionUpdate === 'agent_message_chunk' && update.content) {
            if (update.content.type === 'text' && update.content.text) {
              appendToLastAssistantMessage(update.content.text);
            }
          }
          // Handle agent thoughts (for extended thinking)
          else if (update.sessionUpdate === 'agent_thought_chunk' && update.content) {
            if (update.content.type === 'text' && update.content.text) {
              addMessage('system', `[Thinking] ${update.content.text}`);
            }
          }
          // Handle tool calls
          else if (update.sessionUpdate === 'tool_call' && update.toolCall) {
            addMessage('system', `[Tool: ${update.toolCall.name}]`);
          }
        }
      },
      onRequest: async (method, params) => {
        // Handle agent requests to the client
        // For now, we just return success for most things
        if (method === 'fs/readTextFile') {
          try {
            const file = Bun.file(params.path);
            const content = await file.text();
            return { content };
          } catch {
            return { error: 'File not found' };
          }
        }
        if (method === 'requestPermission') {
          // Auto-approve for now (dangerous in production!)
          return { outcome: 'approved' };
        }
        return { success: true };
      }
    });

    try {
      await newClient.connect();

      // ACP Handshake: initialize
      // Minimal params compatible with both Claude and Gemini ACP
      const initResult = await newClient.sendRequest('initialize', {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true
        }
      });

      addMessage('system', `Connected to agent: ${command}`);

      // Create a new session
      // Note: Don't send mcpServers if empty, as some agents (like Gemini) have strict validation
      const sessionResult = await newClient.sendRequest('session/new', {
        cwd: process.cwd()
      });

      sessionIdRef.current = sessionResult?.sessionId || sessionResult?.id || 'default';

      setStatus('connected');
      setClient(newClient);

    } catch (e: any) {
      console.error(e);
      setStatus('disconnected');
      setError(e.message || "Failed to connect");
      addMessage('system', `Error: ${e.message}`);
    }
  }, [client]);

  const disconnect = useCallback(() => {
    if (client) {
      client.kill();
      setClient(null);
      setStatus('disconnected');
      sessionIdRef.current = null;
      addMessage('system', "Disconnected");
    }
  }, [client]);

  const addMessage = (role: Message['role'], content: string) => {
    setMessages(prev => [...prev, { role, content, timestamp: Date.now() }]);
  };

  // Append text to the last assistant message, or create one if none exists
  const appendToLastAssistantMessage = (text: string) => {
    setMessages(prev => {
      const lastIdx = prev.length - 1;
      const lastMessage = prev[lastIdx];
      // If last message is from assistant, append to it
      if (lastIdx >= 0 && lastMessage && lastMessage.role === 'assistant') {
        const updated = [...prev];
        updated[lastIdx] = {
          role: 'assistant' as const,
          content: lastMessage.content + text,
          timestamp: lastMessage.timestamp
        };
        return updated;
      }
      // Otherwise create a new assistant message
      return [...prev, { role: 'assistant' as const, content: text, timestamp: Date.now() }];
    });
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!client || !sessionIdRef.current) return;

    addMessage('user', text);

    try {
      // ACP method: session/prompt
      const response = await client.sendRequest('session/prompt', {
        sessionId: sessionIdRef.current,
        prompt: [{ type: 'text', text }]
      });

      // The response may contain the final message or it may come via notifications
      if (response?.message?.content) {
        const content = response.message.content;
        if (Array.isArray(content)) {
          const text = content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('');
          if (text) addMessage('assistant', text);
        } else if (typeof content === 'string') {
          addMessage('assistant', content);
        }
      } else if (response?.stopReason) {
        // Session ended - don't show this to the user, it's internal
        // addMessage('system', `Turn ended: ${response.stopReason}`);
      }
    } catch (e: any) {
      addMessage('system', `Error sending message: ${e.message}`);
    }
  }, [client]);

  return { connect, disconnect, sendMessage, messages, status, error };
}
