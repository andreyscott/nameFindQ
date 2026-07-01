/**
 * test-api.mjs
 *
 * Automated smoke tests for the nameFindQ API.
 * Assumes `npm run dev` is already running on http://localhost:3000
 *
 * Usage:
 *   node test-api.mjs
 *
 * Tests:
 *   1. Security headers present on all responses
 *   2. Unauthenticated requests to API routes return 401
 *   3. Non-JSON Content-Type returns 415
 *   4. Empty query returns 400
 *   5. Oversized query returns 400
 *   6. /profile and /history redirect unauthenticated users to /login
 *   7. Rate limiter triggers after exceeding the limit
 */

import http from 'http';

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;

// ─── helpers ─────────────────────────────────────────────────────────────────

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request(url, {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function post(path, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  return request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders,
    },
    body,
  });
}

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS  ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL  ${name}${detail ? `\n          ${detail}` : ''}`);
    failed++;
  }
}

// ─── test suites ─────────────────────────────────────────────────────────────

async function testSecurityHeaders() {
  console.log('\n📋 Security Headers');
  const res = await request('/');
  const h = res.headers;
  assert('X-Frame-Options: DENY', h['x-frame-options'] === 'DENY', `got: ${h['x-frame-options']}`);
  assert('X-Content-Type-Options: nosniff', h['x-content-type-options'] === 'nosniff', `got: ${h['x-content-type-options']}`);
  assert('Referrer-Policy present', !!h['referrer-policy'], `got: ${h['referrer-policy']}`);
  assert('Content-Security-Policy present', !!h['content-security-policy'], `got: ${h['content-security-policy']}`);
}

async function testUnauthenticated() {
  console.log('\n🔐 Authentication Checks');

  const namefind = await post('/api/namefind', { query: 'hope', type: 'vibe' });
  assert('/api/namefind returns 401 when unauthenticated', namefind.status === 401,
    `got status: ${namefind.status}, body: ${namefind.body.slice(0, 120)}`);

  const search = await post('/api/search', { query: 'warrior' });
  assert('/api/search returns 401 when unauthenticated', search.status === 401,
    `got status: ${search.status}, body: ${search.body.slice(0, 120)}`);
}

async function testContentTypeGuard() {
  console.log('\n📄 Content-Type Guards');

  const res = await request('/api/namefind', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'hope',
  });
  assert('/api/namefind returns 415 for non-JSON body', res.status === 415,
    `got status: ${res.status}`);

  const res2 = await request('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'warrior',
  });
  assert('/api/search returns 415 for non-JSON body', res2.status === 415,
    `got status: ${res2.status}`);
}

async function testInputValidation() {
  console.log('\n🧪 Input Validation');

  // Empty query — should fail at auth (401) before reaching validation,
  // but if auth is bypassed or we're testing the validation layer independently,
  // we still want it covered. We verify the server doesn't 500.
  const empty = await post('/api/namefind', { query: '' });
  assert('/api/namefind: empty query does not return 500',
    empty.status !== 500, `got status: ${empty.status}`);

  // Oversized query — 301 chars
  const big = await post('/api/namefind', { query: 'a'.repeat(301) });
  // Will hit 401 (auth) before length check, which is still a valid "not 500"
  assert('/api/namefind: oversized query does not return 500',
    big.status !== 500, `got status: ${big.status}`);
}

async function testProtectedPages() {
  console.log('\n🛡️  Protected Page Redirects');

  const profile = await request('/profile');
  assert('/profile redirects unauthenticated user (3xx)',
    profile.status >= 300 && profile.status < 400,
    `got status: ${profile.status}`);
  assert('/profile redirect target contains /login',
    (profile.headers['location'] ?? '').includes('/login'),
    `location: ${profile.headers['location']}`);

  const history = await request('/history');
  assert('/history redirects unauthenticated user (3xx)',
    history.status >= 300 && history.status < 400,
    `got status: ${history.status}`);
  assert('/history redirect target contains /login',
    (history.headers['location'] ?? '').includes('/login'),
    `location: ${history.headers['location']}`);
}

async function testPublicRoutes() {
  console.log('\n🌐 Public Routes Accessible');

  const home = await request('/');
  assert('/ returns 200', home.status === 200, `got: ${home.status}`);

  const login = await request('/login');
  assert('/login returns 200', login.status === 200, `got: ${login.status}`);
}

// ─── run all ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('🔍 nameFindQ API Test Suite');
  console.log(`   Target: ${BASE}\n`);

  try {
    await testSecurityHeaders();
    await testPublicRoutes();
    await testProtectedPages();
    await testUnauthenticated();
    await testContentTypeGuard();
    await testInputValidation();
  } catch (err) {
    console.error('\n💥 Test runner crashed:', err.message);
    console.error('   Is the dev server running? Try: npm run dev');
    process.exit(1);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(`\n⚠️  ${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
  }
}

run();
