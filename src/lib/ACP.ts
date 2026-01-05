import { spawn, type Subprocess } from "bun";

// JSON-RPC 2.0 Types with generics for better type safety
export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: TResult;
  error?: JsonRpcError;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// Callback types for better inference
export type NotificationHandler = (method: string, params: unknown) => void;
export type RequestHandler = (method: string, params: unknown) => Promise<unknown>;

export interface ACPOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  onNotification?: NotificationHandler;
  onRequest?: RequestHandler;
}

// Pending request handler type
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: JsonRpcError | Error) => void;
}

export class ACPClient {
  private proc: Subprocess<"pipe", "pipe", "ignore"> | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private buffer = "";
  private isConnected = false;

  constructor(private options: ACPOptions) { }

  async connect() {
    if (this.isConnected) return;

    try {
      // Build environment with custom overrides
      const spawnEnv = this.options.env
        ? { ...process.env, ...this.options.env } as Record<string, string | undefined>
        : process.env;

      this.proc = spawn([this.options.command, ...(this.options.args || [])], {
        cwd: this.options.cwd || process.cwd(),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore", // Suppress agent debug output (e.g. "Spawning Claude Code...")
        env: spawnEnv,
      });

      this.isConnected = true;
      this.readLoop();
    } catch (e) {
      console.error("Failed to spawn ACP agent:", e);
      throw e;
    }
  }

  private async readLoop(): Promise<void> {
    if (!this.proc) return;
    const reader = this.proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        this.buffer += chunk;

        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
          const line = this.buffer.slice(0, newlineIndex).trim();
          this.buffer = this.buffer.slice(newlineIndex + 1);

          if (line) {
            try {
              const msg = JSON.parse(line);
              this.handleMessage(msg);
            } catch (e) {
              // Ignore partial or malformed lines for now, or log to a debug file
            }
          }
        }
      }
    } catch (e) {
      console.error("ACP Read Error:", e);
    } finally {
      this.isConnected = false;
    }
  }

  private async handleMessage(msg: JsonRpcMessage) {
    // Response to a request we sent
    if ('id' in msg && ('result' in msg || 'error' in msg)) {
      const response = msg as JsonRpcResponse;
      const handler = this.pendingRequests.get(response.id);
      if (handler) {
        if (response.error) handler.reject(response.error);
        else handler.resolve(response.result);
        this.pendingRequests.delete(response.id);
      }
      return;
    }

    // Request from server (Agent asking Client to do something)
    if ('id' in msg && 'method' in msg) {
      const request = msg as JsonRpcRequest;
      if (this.options.onRequest) {
        try {
          const result = await this.options.onRequest(request.method, request.params);
          this.sendResponse(request.id, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Internal error";
          this.sendError(request.id, -32603, message);
        }
      } else {
        // Method not found/handled
        this.sendError(request.id, -32601, "Method not found");
      }
      return;
    }

    // Notification from server
    if (!('id' in msg) && 'method' in msg) {
      if (this.options.onNotification) {
        this.options.onNotification(msg.method, msg.params);
      }
    }
  }

  async sendRequest<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams
  ): Promise<TResult> {
    if (!this.isConnected || !this.proc) {
      throw new Error("ACP Client not connected");
    }

    const id = this.requestId++;
    const req: JsonRpcRequest<TParams> = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      });
      const str = JSON.stringify(req) + "\n";
      try {
        this.proc!.stdin.write(new TextEncoder().encode(str));
        this.proc!.stdin.flush();
      } catch (e) {
        this.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  async sendNotification<TParams = unknown>(method: string, params?: TParams): Promise<void> {
    if (!this.isConnected || !this.proc) return;
    const notif: JsonRpcNotification<TParams> = {
      jsonrpc: "2.0",
      method,
      params
    };
    const str = JSON.stringify(notif) + "\n";
    this.proc.stdin.write(new TextEncoder().encode(str));
    this.proc.stdin.flush();
  }

  private sendResponse(id: number | string, result: unknown): void {
    if (!this.isConnected || !this.proc) return;
    const resp: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      result
    };
    const str = JSON.stringify(resp) + "\n";
    this.proc.stdin.write(new TextEncoder().encode(str));
    this.proc.stdin.flush();
  }

  private sendError(id: number | string, code: number, message: string): void {
    if (!this.isConnected || !this.proc) return;
    const resp: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    };
    const str = JSON.stringify(resp) + "\n";
    this.proc.stdin.write(new TextEncoder().encode(str));
    this.proc.stdin.flush();
  }

  kill() {
    if (this.proc) {
      this.proc.kill();
      this.isConnected = false;
    }
  }
}
