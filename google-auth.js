'use strict';

/* ------------------------------------------------------------------ *
 * google-auth.js — "구글로 로그인" for a desktop app.
 *
 * OAuth 2.0 authorization code flow with PKCE, which is what Google
 * prescribes for installed apps: the browser goes to Google, Google
 * redirects back to a loopback port this process is listening on, and
 * the code is exchanged for tokens here.
 *
 * The scope is calendar.readonly — the app never asks for permission
 * to create or delete anything.
 *
 * Credentials live in userData, encrypted with Electron safeStorage
 * (Keychain on macOS, DPAPI on Windows). Nothing is written in clear.
 * ------------------------------------------------------------------ */

const { shell, safeStorage } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

let storePath = null;
let store = { clientId: '', clientSecret: '', refreshToken: '', email: '' };
let bundled = null;          // client shipped with the build, if any
let accessToken = '';
let accessExpiry = 0;
let pending = null;          // the in-flight sign-in, if any

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- persistence ---------- */

/* `builtIn` is an optional { clientId, clientSecret } baked into the
   build. It identifies the app, not a person — Google states the secret
   of an installed app is not confidential — so shipping it means a
   teammate sees only a "구글로 로그인" button. Each person still signs in
   with their own account and their own token; nobody gains access to
   anybody else's calendar. */
function init(dir, builtIn) {
  storePath = path.join(dir, 'google-auth.json');
  if (builtIn && builtIn.clientId && builtIn.clientSecret) bundled = builtIn;
  try {
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (raw && raw.enc && safeStorage.isEncryptionAvailable()) {
      Object.assign(store, JSON.parse(safeStorage.decryptString(Buffer.from(raw.enc, 'base64'))));
    }
  } catch (e) { /* first run, or an unreadable store — start empty */ }

  /* A client typed into settings before the same one was bundled would
     shadow it forever, leaving the setup fields on screen with no way
     to dismiss them. If the override says the same thing as the build,
     it is not an override. */
  if (bundled && store.clientId === bundled.clientId && store.clientSecret === bundled.clientSecret) {
    store.clientId = '';
    store.clientSecret = '';
    save();
  }
}

function save() {
  if (!storePath) return;
  try {
    if (!safeStorage.isEncryptionAvailable()) return;   // never fall back to clear text
    const enc = safeStorage.encryptString(JSON.stringify(store)).toString('base64');
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ v: 1, enc }), { mode: 0o600 });
  } catch (e) { /* non-fatal */ }
}

function client() {
  if (store.clientId && store.clientSecret) return store;
  return bundled || { clientId: '', clientSecret: '' };
}

function status() {
  const c = client();
  return {
    hasClient: !!(c.clientId && c.clientSecret),
    hasBundled: !!bundled,
    bundled: !!bundled && !(store.clientId && store.clientSecret),
    signedIn: !!store.refreshToken,
    email: store.email || '',
    canStore: safeStorage.isEncryptionAvailable(),
    busy: !!pending
  };
}

function setClient(clientId, clientSecret) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  if (id !== store.clientId || secret !== store.clientSecret) {
    // a different app identity invalidates the old grant
    store.refreshToken = '';
    store.email = '';
    accessToken = '';
    accessExpiry = 0;
  }
  store.clientId = id;
  store.clientSecret = secret;
  save();
}

function signOut() {
  store.refreshToken = '';
  store.email = '';
  accessToken = '';
  accessExpiry = 0;
  save();
}

/* ---------- loopback redirect ---------- */

function listen() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    // port 0 → the OS picks a free one; Google allows any loopback port
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function page(title, note) {
  return '<!doctype html><meta charset="utf-8"><title>' + title + '</title>' +
    '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
    'font:15px -apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;' +
    'background:#F2F1EE;color:#1D1B18">' +
    '<div style="text-align:center"><div style="font-size:19px;font-weight:600">' + title + '</div>' +
    '<div style="margin-top:8px;color:#8B8780">' + note + '</div></div>';
}

function waitForCode(server, state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('로그인이 3분 안에 끝나지 않아 취소했습니다.'));
    }, 180000);

    server.on('request', (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      const gotState = url.searchParams.get('state');

      // favicon and anything else the browser asks for on the way
      if (!code && !err) { res.writeHead(204).end(); return; }

      const finish = (title, note) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page(title, note));
        clearTimeout(timer);
        server.close();
      };

      if (err) { finish('연결하지 못했습니다', err); return reject(new Error(err)); }
      if (gotState !== state) {
        finish('연결하지 못했습니다', '요청이 일치하지 않습니다');
        return reject(new Error('state 불일치 — 요청이 가로채였을 수 있습니다.'));
      }
      finish('연결됐습니다', '이 창은 닫으셔도 됩니다.');
      resolve(code);
    });
  });
}

/* ---------- token endpoints ---------- */

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json.error_description || json.error || ('HTTP ' + res.status);
    throw new Error(detail);
  }
  return json;
}

async function fetchEmail() {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!res.ok) return '';
    const json = await res.json();
    return json.email || '';
  } catch (e) { return ''; }
}

async function signIn() {
  if (pending) return pending;
  const cred = client();
  if (!cred.clientId || !cred.clientSecret) {
    throw new Error('클라이언트 ID와 보안 비밀번호를 먼저 입력해 주세요.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 시스템에서 자격증명을 안전하게 저장할 수 없어 로그인을 중단했습니다.');
  }

  pending = (async () => {
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));

    const { server, port } = await listen();
    const redirectUri = 'http://127.0.0.1:' + port;

    const url = AUTH_URL + '?' + new URLSearchParams({
      client_id: cred.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      // without this Google hands back a refresh token only on the very
      // first consent, and a re-login would silently come back read-only
      prompt: 'consent',
      state
    }).toString();

    const codePromise = waitForCode(server, state);
    shell.openExternal(url);
    const code = await codePromise;

    const tok = await postToken({
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    accessToken = tok.access_token || '';
    accessExpiry = Date.now() + ((tok.expires_in || 3600) - 60) * 1000;
    if (tok.refresh_token) store.refreshToken = tok.refresh_token;
    store.email = await fetchEmail();
    save();

    if (!store.refreshToken) {
      throw new Error('구글이 갱신 토큰을 주지 않았습니다. 계정 권한에서 이 앱을 제거한 뒤 다시 로그인해 주세요.');
    }
    return status();
  })();

  try { return await pending; }
  finally { pending = null; }
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessExpiry) return accessToken;
  if (!store.refreshToken) throw new Error('로그인이 필요합니다.');

  const cred = client();
  const tok = await postToken({
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    refresh_token: store.refreshToken,
    grant_type: 'refresh_token'
  });

  accessToken = tok.access_token || '';
  accessExpiry = Date.now() + ((tok.expires_in || 3600) - 60) * 1000;
  return accessToken;
}

/* A revoked or expired grant should drop the pet back to "signed out"
   rather than retrying a dead token every five minutes. */
function invalidate() {
  accessToken = '';
  accessExpiry = 0;
  store.refreshToken = '';
  save();
}

module.exports = { init, status, setClient, signIn, signOut, getAccessToken, invalidate };
