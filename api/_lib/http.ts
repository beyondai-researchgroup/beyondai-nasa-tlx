import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Minimal shape of what Vercel's Node.js runtime actually hands each /api/*.ts
 * handler at runtime (parsed JSON body, parsed query) — avoids adding @vercel/node
 * purely for types.
 */
export interface ApiRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: unknown;
}

export type ApiResponse = ServerResponse;

export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
