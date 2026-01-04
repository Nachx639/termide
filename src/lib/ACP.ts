import { spawn } from "bun";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface ACPOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  onNotification?: (method: string, params: any) => void;
  onRequest?: (method: string, params: any) => Promise<any>;
}

export class ACPClient {
  private proc: any;
  private requestId = 0;
  private pendingRequests = new Map<number | string, { resolve: (val: any) => void, reject: (err: any) => void }>();
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

  private async readLoop() {
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
        } catch (err: any) {
          this.sendError(request.id, -32603, err.message || "Internal error");
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

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.isConnected) throw new Error("ACP Client not connected");

    const id = this.requestId++;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const str = JSON.stringify(req) + "\n";
      try {
        this.proc.stdin.write(new TextEncoder().encode(str));
        this.proc.stdin.flush();
      } catch (e) {
        this.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  async sendNotification(method: string, params?: any) {
    if (!this.isConnected) return;
    const notif: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params
    };
    const str = JSON.stringify(notif) + "\n";
    this.proc.stdin.write(new TextEncoder().encode(str));
    this.proc.stdin.flush();
  }

  private sendResponse(id: number | string, result: any) {
    if (!this.isConnected) return;
    const resp: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      result
    };
    const str = JSON.stringify(resp) + "\n";
    this.proc.stdin.write(new TextEncoder().encode(str));
    this.proc.stdin.flush();
  }

  private sendError(id: number | string, code: number, message: string) {
    if (!this.isConnected) return;
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
