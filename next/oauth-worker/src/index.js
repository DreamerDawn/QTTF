/**
 * QTTF Decap CMS GitHub OAuth Proxy
 * Cloudflare Worker（免费额度即可）。
 *
 * 绑定变量：
 *   GITHUB_OAUTH_ID       GitHub OAuth App 的 Client ID（明文变量）
 *   GITHUB_OAUTH_SECRET   GitHub OAuth App 的 Client Secret（Secret）
 *   ALLOWED_ORIGINS       允许的站点 origin，逗号分隔
 *   GITHUB_REPO_PRIVATE   1 表示私有仓库（scope 需要 repo）
 *
 * 路由：
 *   GET /auth?provider=github   -> 跳转 GitHub 授权
 *   GET /callback?code=...      -> 交换 token 并回传 Decap 弹窗
 */

const DEFAULT_SITE_ORIGIN = 'https://dreamerdawn.github.io';

function jsonError(message, status = 400) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToText(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createState(origin, secret) {
  const payload = {
    origin,
    nonce: crypto.randomUUID(),
    issuedAt: Date.now(),
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await sign(encoded, secret)}`;
}

async function verifyState(state, secret, fallbackOrigin) {
  if (!state || !state.includes('.')) return fallbackOrigin;
  const [encoded, signature] = state.split('.');
  const expected = await sign(encoded, secret);
  if (signature !== expected) return fallbackOrigin;
  try {
    const payload = JSON.parse(base64UrlToText(encoded));
    if (Date.now() - Number(payload.issuedAt) > 10 * 60 * 1000) return fallbackOrigin;
    return typeof payload.origin === 'string' ? payload.origin : fallbackOrigin;
  } catch {
    return fallbackOrigin;
  }
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_SITE_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function pickOrigin(request, env) {
  const allowed = allowedOrigins(env);
  const referer = request.headers.get('Referer') || '';
  try {
    const origin = new URL(referer).origin;
    if (allowed.includes(origin)) return origin;
  } catch {
    /* ignore malformed referer */
  }
  return allowed[0] || DEFAULT_SITE_ORIGIN;
}

function callbackPage(origin, status, token) {
  const payload = JSON.stringify({ token });
  const safeOrigin = JSON.stringify(origin);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>QTTF CMS authorization</title>
  <style>
    body { font-family: system-ui, sans-serif; display:grid; place-items:center; min-height:100vh; margin:0; background:#f6f8fb; color:#0b1220; }
    main { padding:24px 28px; background:#fff; border-radius:14px; box-shadow:0 12px 40px rgba(2,6,23,.08); text-align:center; }
  </style>
</head>
<body>
  <main>
    <h1>QTTF 内容管理</h1>
    <p>正在完成 GitHub 登录…</p>
  </main>
  <script>
    (function () {
      var targetOrigin = ${safeOrigin};
      function receiveMessage(message) {
        window.opener.postMessage(
          'authorization:github:${status}:${payload.replaceAll('</script>', '<\\/script>')}',
          targetOrigin
        );
        window.removeEventListener('message', receiveMessage, false);
        document.querySelector('p').textContent = '登录成功，可以关闭此窗口。';
      }
      window.addEventListener('message', receiveMessage, false);
      if (window.opener) {
        window.opener.postMessage('authorizing:github', targetOrigin);
      } else {
        document.querySelector('p').textContent = '请从 /admin/ 页面重新登录。';
      }
    })();
  </script>
</body>
</html>`;
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('provider') !== 'github') {
    return jsonError('Invalid provider');
  }
  const clientId = env.GITHUB_OAUTH_ID;
  const secret = env.GITHUB_OAUTH_SECRET;
  if (!clientId || !secret) {
    return jsonError('OAuth worker is not configured. Set GITHUB_OAUTH_ID and GITHUB_OAUTH_SECRET.');
  }

  const origin = pickOrigin(request, env);
  const state = await createState(origin, secret);
  const scope = env.GITHUB_REPO_PRIVATE === '1' ? 'repo,user' : 'public_repo,user';
  const redirectUri = `${url.origin}/callback?provider=github`;
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', scope);
  authorize.searchParams.set('state', state);
  return Response.redirect(authorize.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('provider') !== 'github') {
    return jsonError('Invalid provider');
  }
  const code = url.searchParams.get('code');
  if (!code) return jsonError('Missing code');
  const secret = env.GITHUB_OAUTH_SECRET;
  if (!env.GITHUB_OAUTH_ID || !secret) {
    return jsonError('OAuth worker is not configured.');
  }

  const fallback = allowedOrigins(env)[0] || DEFAULT_SITE_ORIGIN;
  const origin = await verifyState(url.searchParams.get('state'), secret, fallback);
  const redirectUri = `${url.origin}/callback?provider=github`;

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'qttf-decap-oauth-worker',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenJson = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenJson.access_token) {
    return jsonError(`GitHub token exchange failed: ${tokenJson.error_description || tokenJson.error || tokenResponse.status}`, 502);
  }

  return new Response(callbackPage(origin, 'success', tokenJson.access_token), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return jsonError('Method not allowed', 405);
    if (url.pathname === '/auth') return handleAuth(request, env);
    if (url.pathname === '/callback') return handleCallback(request, env);
    if (url.pathname === '/') {
      return new Response('QTTF Decap OAuth proxy is running. Configure /auth in Decap CMS.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return jsonError('Not found', 404);
  },
};
