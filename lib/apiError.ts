import { randomUUID } from 'node:crypto';
import { AiError } from './ai/qwen';

export interface ApiErrorBody {
  error: string;
  code: string;
  errorId: string;
}

/**
 * Turns any thrown error into a client-safe response. Internal details
 * (provider messages, SQL errors) are logged with an error ID, never returned.
 */
export function apiErrorResponse(err: unknown, tag: string): { status: number; body: ApiErrorBody } {
  const errorId = randomUUID().replace(/-/g, '').slice(0, 8);
  console.error(`[${tag}] error ${errorId}:`, (err as Error)?.message ?? err);

  if (err instanceof AiError) {
    switch (err.kind) {
      case 'rate_limited':
        return { status: 503, body: { error: 'The AI service is busy right now. Please try again in a minute.', code: 'ai_busy', errorId } };
      case 'timeout':
        return { status: 504, body: { error: 'The AI took too long to respond. Please try again.', code: 'ai_timeout', errorId } };
      case 'invalid_output':
      case 'unavailable':
        return { status: 502, body: { error: "We couldn't get a good answer from the AI. Please try again.", code: 'ai_unavailable', errorId } };
    }
  }
  return { status: 500, body: { error: 'Something went wrong. Please try again.', code: 'internal', errorId } };
}
