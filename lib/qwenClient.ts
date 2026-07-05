import OpenAI from 'openai';

/**
 * lib/qwenClient.ts
 *
 * Module-level singleton Qwen client.
 * Created once per serverless instance, reused across all route handlers.
 * Eliminates repeated HTTP connection pool initialisation per request.
 */

let _client: OpenAI | null = null;

export function getQwenClient(): OpenAI {
  if (!_client) {
    if (!process.env.QWEN_API_KEY) {
      throw new Error('QWEN_API_KEY environment variable is not set.');
    }
    _client = new OpenAI({
      apiKey: process.env.QWEN_API_KEY,
      baseURL:
        process.env.QWEN_BASE_URL ??
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });
  }
  return _client;
}
