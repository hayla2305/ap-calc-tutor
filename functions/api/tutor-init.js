/**
 * POST /api/tutor-init — Mint an attemptToken for a tutor conversation.
 *
 * Validates CORS origin, generates HMAC-SHA256 signed JWT-like token.
 * One token = one conversation.
 */

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncode(obj) {
  const json = JSON.stringify(obj);
  const encoder = new TextEncoder();
  return base64url(encoder.encode(json));
}

async function signHMAC(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64url(signature);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.env),
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const cors = corsHeaders(env);

  // CORS: exact origin match
  const origin = request.headers.get('Origin') || '';
  if (origin !== env.APP_ORIGIN) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { problemId } = body;
  if (!problemId) {
    return new Response(JSON.stringify({ error: 'missing_problemId' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const userId = 'student-1'; // Single-user app

  // Atomic conversation quota check + increment
  const today = new Date().toISOString().slice(0, 10);
  const quota = await env.DB.prepare(
    `INSERT INTO daily_quota (user_id, date, conversations, turns)
     VALUES (?, ?, 1, 0)
     ON CONFLICT(user_id, date) DO UPDATE
       SET conversations = daily_quota.conversations + 1
       WHERE daily_quota.conversations < 25
     RETURNING conversations`
  ).bind(userId, today).first();

  if (!quota) {
    return new Response(JSON.stringify({ error: 'daily_limit_reached' }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Generate token
  const jti = crypto.randomUUID();
  const exp = now + 300; // 5 minutes

  const header = base64urlEncode({ alg: 'HS256', typ: 'JWT' });
  const payload = base64urlEncode({ jti, iat: now, exp, problemId, userId });
  const signature = await signHMAC(env.ATTEMPT_TOKEN_SECRET, `${header}.${payload}`);
  const token = `${header}.${payload}.${signature}`;

  // Create conversation turn tracker
  await env.DB.prepare(
    'INSERT INTO conversation_turns (token_jti, turn_count, created_at) VALUES (?, 0, ?)'
  ).bind(jti, now).run();

  return new Response(JSON.stringify({ token, expiresAt: exp }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
