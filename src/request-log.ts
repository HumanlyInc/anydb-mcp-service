import type { NextFunction, Request, Response } from "express";

/**
 * One log line per HTTP request, written when the response finishes.
 *
 * Exists because a hosted client's "authorization failed" report was not
 * diagnosable from production: nginx keeps no headers or bodies, and a request
 * the SDK transport rejects (for example an unsupported MCP-Protocol-Version)
 * left nothing in this service's own log. ISSUE - 495.
 *
 * Deliberately narrow. It records the method, path, user agent, the protocol
 * version header, the JSON-RPC method name and the status, plus the error text
 * on a 4xx/5xx. It never records the Authorization header, API-key headers, a
 * request's params, or a successful response body: any of those can carry
 * credentials or customer data.
 */

/** Longest error body kept, so a large failure page cannot flood the log. */
const MAX_ERROR_BYTES = 2048;

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** The JSON-RPC method of the request, or a joined list for a batch. */
function rpcMethod(body: unknown): string | undefined {
  const methods = (Array.isArray(body) ? body : [body])
    .map((message) => (message as { method?: unknown } | undefined)?.method)
    .filter((method): method is string => typeof method === "string");
  return methods.length > 0 ? methods.join(",") : undefined;
}

/** The `error.message` of a JSON-RPC error body, else the raw text, trimmed. */
function errorText(raw: string): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") return parsed.error.message;
  } catch {
    // Not JSON (an nginx or Express HTML error page): fall through to the text.
  }
  return raw.slice(0, 300);
}

export function requestLogger(
  write: (line: string) => void = (line) => console.error(line),
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const chunks: Buffer[] = [];
    let captured = 0;

    // The status is not known yet, so every body is offered to the capture and
    // only kept on a failure; successful responses are discarded unread.
    const capture = (chunk: unknown) => {
      if (res.statusCode < 400 || captured >= MAX_ERROR_BYTES) return;
      if (typeof chunk === "string" || chunk instanceof Uint8Array) {
        const buffer = Buffer.from(chunk);
        chunks.push(buffer);
        captured += buffer.length;
      }
    };
    const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;
    const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      capture(chunk);
      return originalWrite(chunk, ...rest);
    }) as typeof res.write;
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      capture(chunk);
      return originalEnd(chunk, ...rest);
    }) as typeof res.end;

    res.on("finish", () => {
      const failed = res.statusCode >= 400;
      write(
        JSON.stringify({
          msg: "[MCP HTTP] request",
          time: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - startedAt,
          userAgent: header(req, "user-agent"),
          protocolVersion: header(req, "mcp-protocol-version"),
          rpcMethod: rpcMethod(req.body),
          error: failed
            ? errorText(Buffer.concat(chunks).toString("utf8"))
            : undefined
        })
      );
    });

    next();
  };
}
