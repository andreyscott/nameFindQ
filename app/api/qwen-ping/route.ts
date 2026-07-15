/**
 * GET /api/qwen-ping
 *
 * Diagnostic endpoint — makes the simplest possible Qwen API call
 * and returns the full raw response for debugging.
 *
 * REMOVE THIS FILE BEFORE GOING TO PRODUCTION.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.QWEN_API_KEY;
  const baseURL = process.env.QWEN_BASE_URL
    ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

  if (!apiKey) {
    return NextResponse.json({ error: 'QWEN_API_KEY env var is not set' }, { status: 500 });
  }

  const url = `${baseURL}/chat/completions`;

  let httpStatus = 0;
  let rawBody = '';
  let parsedBody: any = null;
  let fetchError = '';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [{ role: 'user', content: 'Say the word OK and nothing else.' }],
        temperature: 0.5,
      }),
    });

    httpStatus = res.status;
    rawBody = await res.text();

    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }
  } catch (err: any) {
    fetchError = err.message ?? String(err);
  }

  return NextResponse.json({
    config: {
      baseURL,
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.slice(0, 8) + '...' : null,
      model: 'qwen-turbo',
    },
    http_status: httpStatus,
    fetch_error: fetchError || null,
    response_body: parsedBody ?? rawBody,
    content: parsedBody?.choices?.[0]?.message?.content ?? null,
    success: !fetchError && httpStatus >= 200 && httpStatus < 300 && !!parsedBody?.choices?.[0]?.message?.content,
  });
}
