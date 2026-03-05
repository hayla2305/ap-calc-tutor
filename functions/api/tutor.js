/**
 * POST /api/tutor — Anthropic proxy for tutor conversations.
 *
 * Validates attemptToken (HMAC, expiry, JTI replay), enforces server-side
 * turn counting, quota limits, and proxies to Anthropic with the hardened
 * system prompt.
 */

const TUTOR_SYSTEM_PROMPT = `You are an AP Calculus AB Socratic tutor for ONE current problem. Goal: help student identify recognition cue + technique, not give final answer immediately.  Rules: 1) Ask exactly one focused question per turn. 2) Max 80 words per turn. 3) Do not reveal final technique/option/number in turns 1-2. 4) If student asks "just tell me" or "A or B?", require evidence: one cue from stem + why. 5) If student says "I don't know" twice, give one micro-hint (concept family + cue direction), then ask again. 6) If still stuck by turn 6, reveal the technique briefly and require student restatement before ending. 7) Use provided confusion history explicitly: contrast current concept vs top confusion concept in one sentence. 8) Refuse non-current-problem requests.  Output JSON only: { "mode": "question|micro_hint|reveal", "message": "...", "checksCue": true|false, "usedConfusionPair": true|false }`;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return binary;
}

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyHMAC(secret, data, expectedSig) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const computed = base64url(signature);
  // Constant-time comparison
  if (computed.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}

async function validateToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };

  const [header, payload, signature] = parts;

  // Verify HMAC signature
  const valid = await verifyHMAC(secret, `${header}.${payload}`, signature);
  if (!valid) return { valid: false };

  // Decode payload
  let claims;
  try {
    claims = JSON.parse(base64urlDecode(payload));
  } catch {
    return { valid: false };
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) return { valid: false };

  return { valid: true, claims };
}

function validateTutorResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const validModes = ['question', 'micro_hint', 'reveal'];
  if (!validModes.includes(parsed.mode)) return false;
  if (typeof parsed.message !== 'string') return false;
  if (typeof parsed.checksCue !== 'boolean') return false;
  if (typeof parsed.usedConfusionPair !== 'boolean') return false;
  return true;
}

function buildSafeContext(raw, turn) {
  const ctx = raw && typeof raw === 'object' ? raw : {};
  const safe = {
    problemId: typeof ctx.problemId === 'string' ? ctx.problemId : null,
    stem: typeof ctx.stem === 'string' ? ctx.stem : '',
    concept: typeof ctx.concept === 'string' ? ctx.concept : '',
    disguise_level: Number.isInteger(ctx.disguise_level) ? ctx.disguise_level : null,
    cue_tokens: Array.isArray(ctx.cue_tokens) ? ctx.cue_tokens.slice(0, 8) : [],
    selectedTechnique: typeof ctx.selectedTechnique === 'string' ? ctx.selectedTechnique : null,
    confusionHistory: Array.isArray(ctx.confusionHistory) ? ctx.confusionHistory.slice(0, 5) : [],
  };
  if (turn >= 6) {
    if (Array.isArray(ctx.solution_steps)) safe.solution_steps = ctx.solution_steps.slice(0, 8);
    if (typeof ctx.answer === 'string') safe.answer = ctx.answer;
  }
  return safe;
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

  const { token, message, requestId, context: tutorContext } = body;
  if (!token || !message) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!requestId || typeof requestId !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_requestId' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Validate token (HMAC + expiry only; jti replay is per-turn via requestId)
  const tokenResult = await validateToken(token, env.ATTEMPT_TOKEN_SECRET);
  if (!tokenResult.valid) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { claims } = tokenResult;

  // Problem-bound token enforcement — problemId is mandatory
  if (
    !tutorContext?.problemId ||
    tutorContext.problemId !== claims.problemId
  ) {
    return new Response(JSON.stringify({ error: 'problem_mismatch' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Per-turn replay check using namespaced requestId
  const nowSec = Math.floor(Date.now() / 1000);
  const replayKey = `req:${claims.jti}:${requestId}`;
  const inserted = await env.DB.prepare(
    `INSERT INTO jti_replay (jti, expires_at)
     VALUES (?, ?)
     ON CONFLICT(jti) DO NOTHING
     RETURNING jti`
  ).bind(replayKey, nowSec + 600).first();

  if (!inserted) {
    return new Response(JSON.stringify({ error: 'replay_detected' }), {
      status: 409,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Opportunistic JTI cleanup (non-blocking)
  env.DB.prepare('DELETE FROM jti_replay WHERE expires_at < ?').bind(nowSec).run().catch(() => {});

  // Server-authoritative turn tracking (atomic, capped at 10)
  const turn = await env.DB.prepare(
    `INSERT INTO conversation_turns (token_jti, turn_count, created_at)
     VALUES (?, 1, ?)
     ON CONFLICT(token_jti) DO UPDATE
       SET turn_count = conversation_turns.turn_count + 1
       WHERE conversation_turns.turn_count < 10
     RETURNING turn_count`
  ).bind(claims.jti, nowSec).first();

  if (!turn) {
    return new Response(JSON.stringify({ error: 'turn_limit_reached' }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const serverTurnIndex = turn.turn_count;

  // Atomic daily turns quota check + increment
  const today = new Date().toISOString().slice(0, 10);
  const turnQuota = await env.DB.prepare(
    `INSERT INTO daily_quota (user_id, date, conversations, turns)
     VALUES (?, ?, 0, 1)
     ON CONFLICT(user_id, date) DO UPDATE
       SET turns = daily_quota.turns + 1
       WHERE daily_quota.turns < 150
     RETURNING turns`
  ).bind(claims.userId, today).first();

  if (!turnQuota) {
    return new Response(JSON.stringify({ error: 'daily_limit_reached' }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Build allowlist-filtered context for Anthropic
  const contextPayload = buildSafeContext(tutorContext, serverTurnIndex);

  // Build messages for Anthropic
  const userContent = `Problem context: ${JSON.stringify(contextPayload)}\n\nStudent (turn ${serverTurnIndex}): ${message}`;

  const anthropicModel = env.ANTHROPIC_TUTOR_MODEL || 'claude-sonnet-4-5-20250929';

  try {
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 300,
        temperature: 0.7,
        system: TUTOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (apiResponse.status === 429) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (!apiResponse.ok) {
      return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } else {
      const apiData = await apiResponse.json();
      const text = apiData.content?.[0]?.text || '';

      const invalidPayload = () =>
        new Response(JSON.stringify({ error: 'invalid_tutor_payload' }), {
          status: 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });

      // Try to parse JSON from response
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Try to extract JSON from text that might have extra content
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            return invalidPayload();
          }
        } else {
          return invalidPayload();
        }
      }

      if (!validateTutorResponse(parsed)) {
        return invalidPayload();
      }

      return new Response(JSON.stringify({
        ...parsed,
        turnIndex: serverTurnIndex,
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  } catch {
    // Timeout or network error — return 502 so client triggers deterministic fallback
    return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
