// Admin UI + JSON settings API, served by the worker's fetch() handler.
// Auth is handled upstream by authenticateAdmin(); these handlers assume the
// caller is already an authenticated admin (identity is passed in).

import { getSettings, updateSettings } from './settings.js';

const EDITABLE_FIELDS = ['forwardTo', 'allowedAliases', 'contactUrl'];

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Shape settings for the client (all of these are safe for the admin to see). */
function publicSettings(s) {
  return {
    forwardTo: s.forwardTo,
    allowedAliases: s.allowedAliases,
    contactUrl: s.contactUrl,
    relayDomain: s.relayDomain,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
    source: s.source,
  };
}

/**
 * Route an authenticated admin request.
 * @param {Request} request
 * @param {object} env
 * @param {string|null} identity authenticated admin identity (email/sub)
 * @returns {Promise<Response>}
 */
export async function handleAdminRequest(request, env, identity) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && (path === '/' || path === '/admin' || path === '/index.html')) {
    return new Response(renderAdminPage(), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (path === '/api/settings') {
    if (request.method === 'GET') {
      const s = await getSettings(env);
      return jsonResponse({ settings: publicSettings(s), identity });
    }

    if (request.method === 'PUT') {
      // CSRF defence: Access injects its header on any request that passes the
      // gate (including cross-site ones), so also require a same-origin Origin.
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) {
        return jsonResponse({ error: 'Cross-origin request blocked' }, 403);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
      if (!body || typeof body !== 'object') {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const patch = {};
      for (const k of EDITABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
      }

      try {
        const s = await updateSettings(env, patch, identity);
        return jsonResponse({ settings: publicSettings(s), identity });
      } catch (e) {
        return jsonResponse({ error: (e && e.message) || 'Invalid settings' }, 400);
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0F1117">
<title>PunchIn Email — Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Display:wght@600;700;800&family=Noto+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  /* Design tokens mirror the main PunchIn app (src/index.css). */
  :root {
    color-scheme: dark;
    --accent-rgb: 31 111 235;
    --accent: rgb(31 111 235);
    --bg-primary:#0F1117; --bg-secondary:#161923; --bg-tertiary:#1E2232;
    --border-color:#2A2F45;
    --text-primary:#FFFFFF; --text-secondary:#E2E8F0; --text-muted:#6B7280; --text-disabled:#374151;
    --ok:#34D399; --err:#F87171;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; background:var(--bg-primary); color:var(--text-secondary);
    font:15px/1.6 "Noto Sans", system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }
  .wrap { max-width:640px; margin:0 auto; padding:40px 20px; }
  .head { display:flex; align-items:center; gap:12px; margin:0 0 4px; }
  .mark { width:32px; height:32px; border-radius:8px; background:var(--accent); flex:0 0 auto; display:flex; align-items:center; justify-content:center; }
  h1 { font-family:"Noto Sans Display","Noto Sans",sans-serif; font-weight:800; font-size:22px; color:var(--text-primary); margin:0; }
  .sub { color:var(--text-muted); margin:0 0 28px; font-size:13px; }
  code { font-family:"Noto Sans Mono", ui-monospace, monospace; font-size:.92em; color:var(--text-secondary); }
  .card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.3); }
  label { display:block; font-weight:600; color:var(--text-primary); margin:20px 0 6px; }
  label:first-of-type { margin-top:0; }
  .hint { color:var(--text-muted); font-weight:400; font-size:12px; margin-top:2px; }
  input[type=text] {
    width:100%; margin-top:8px; padding:10px 12px; background:var(--bg-primary); color:var(--text-primary);
    border:1px solid var(--border-color); border-radius:10px; font:inherit; transition:border-color .15s, box-shadow .15s;
  }
  input::placeholder { color:var(--text-disabled); }
  input:focus { outline:none; border-color:rgb(var(--accent-rgb) / .6); box-shadow:0 0 0 2px rgb(var(--accent-rgb) / .5); }
  .badge { display:inline-block; font-family:"Noto Sans",sans-serif; font-size:11px; font-weight:600; padding:1px 8px; border-radius:999px; margin-left:8px; vertical-align:middle; }
  .badge.kv { background:rgb(var(--accent-rgb) / .15); color:var(--accent); }
  .badge.env { background:rgba(107,114,128,.18); color:var(--text-muted); }
  .row { display:flex; align-items:center; gap:14px; margin-top:28px; }
  button {
    background:var(--accent); color:#0F1117; border:0; border-radius:12px; padding:11px 20px;
    font:inherit; font-weight:700; cursor:pointer; transition:filter .15s;
  }
  button:hover { filter:brightness(1.1); }
  button:active { filter:brightness(.9); }
  button:disabled { opacity:.4; cursor:default; filter:none; }
  .status { font-size:13px; font-weight:500; }
  .status.ok { color:var(--ok); }
  .status.err { color:var(--err); }
  .meta { color:var(--text-muted); font-size:12px; margin-top:24px; }
  :focus-visible { outline:2px solid rgb(var(--accent-rgb) / .75); outline-offset:2px; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <span class="mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F1117" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
    </span>
    <h1>PunchIn Email — Admin</h1>
  </div>
  <p class="sub">Signed in as <strong id="who">…</strong> · relay domain <code id="relayDomain"></code></p>
  <form id="form" class="card" autocomplete="off">
    <label>Forwarding address <span id="forwardToSrc" class="badge"></span></label>
    <div class="hint">Where inbound mail is delivered, and the only address allowed to drive replies.</div>
    <input id="forwardTo" type="text" inputmode="email" placeholder="you@example.com">

    <label>Accepted aliases <span id="allowedAliasesSrc" class="badge"></span></label>
    <div class="hint">Comma-separated local-parts allowed to forward, e.g. <code>cla, licensing, cve, abuse</code>.</div>
    <input id="allowedAliases" type="text" placeholder="cla, licensing, cve, abuse">

    <label>Contact URL <span id="contactUrlSrc" class="badge"></span></label>
    <div class="hint">Shown in the bounce for unknown addresses. Leave blank to default to https://&lt;relay domain&gt;.</div>
    <input id="contactUrl" type="text" placeholder="https://trackmytime.today">

    <div class="row">
      <button id="saveBtn" type="submit">Save</button>
      <span id="status" class="status"></span>
    </div>
    <div id="meta" class="meta"></div>
  </form>
</div>
<script>
  var $ = function(id){ return document.getElementById(id); };
  function setStatus(msg, kind){ var el = $('status'); el.textContent = msg || ''; el.className = 'status ' + (kind || ''); }
  function badge(id, src){ var el = $(id); if(!el) return; var kv = src === 'kv'; el.textContent = kv ? 'saved' : 'default'; el.className = 'badge ' + (kv ? 'kv' : 'env'); }
  function fill(data){
    var s = data.settings;
    $('who').textContent = data.identity || 'unknown';
    $('relayDomain').textContent = s.relayDomain || '';
    $('forwardTo').value = s.forwardTo || '';
    $('allowedAliases').value = s.allowedAliases || '';
    $('contactUrl').value = s.contactUrl || '';
    badge('forwardToSrc', s.source.forwardTo);
    badge('allowedAliasesSrc', s.source.allowedAliases);
    badge('contactUrlSrc', s.source.contactUrl);
    $('meta').textContent = s.updatedAt
      ? ('Last changed ' + new Date(s.updatedAt).toLocaleString() + ' by ' + (s.updatedBy || 'unknown'))
      : 'Using defaults from deploy config — nothing saved yet.';
  }
  function readJson(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); }
  function load(){
    setStatus('Loading…');
    fetch('/api/settings', { headers: { 'accept': 'application/json' } }).then(readJson)
      .then(function(res){ if(!res.ok){ setStatus((res.j && res.j.error) || 'Failed to load', 'err'); return; } fill(res.j); setStatus(''); })
      .catch(function(){ setStatus('Failed to load settings', 'err'); });
  }
  function save(e){
    e.preventDefault();
    $('saveBtn').disabled = true;
    setStatus('Saving…');
    var payload = { forwardTo: $('forwardTo').value.trim(), allowedAliases: $('allowedAliases').value.trim(), contactUrl: $('contactUrl').value.trim() };
    fetch('/api/settings', { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(payload) }).then(readJson)
      .then(function(res){ if(!res.ok){ setStatus((res.j && res.j.error) || 'Save failed', 'err'); return; } fill(res.j); setStatus('Saved.', 'ok'); })
      .catch(function(){ setStatus('Save failed', 'err'); })
      .then(function(){ $('saveBtn').disabled = false; });
  }
  document.addEventListener('DOMContentLoaded', function(){ $('form').addEventListener('submit', save); load(); });
</script>
</body>
</html>`;
}
