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
<title>PunchIn Email — Admin</title>
<style>
  :root { --accent:#1f6feb; --bg:#0d1117; --card:#161b22; --fg:#e6edf3; --muted:#8b949e; --border:#30363d; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:640px; margin:0 auto; padding:32px 20px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 24px; font-size:13px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:20px; }
  label { display:block; font-weight:600; margin:18px 0 6px; }
  label:first-of-type { margin-top:0; }
  .hint { color:var(--muted); font-weight:400; font-size:12px; margin-top:2px; }
  input[type=text] { width:100%; padding:9px 11px; background:var(--bg); color:var(--fg); border:1px solid var(--border); border-radius:7px; font:inherit; }
  input:focus { outline:2px solid var(--accent); border-color:var(--accent); }
  .badge { display:inline-block; font-size:11px; font-weight:600; padding:1px 7px; border-radius:999px; margin-left:8px; vertical-align:middle; }
  .badge.kv { background:rgba(31,111,235,.18); color:#79b8ff; }
  .badge.env { background:rgba(139,148,158,.18); color:var(--muted); }
  .row { display:flex; align-items:center; gap:12px; margin-top:24px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:7px; padding:10px 18px; font:inherit; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .status { font-size:13px; }
  .status.ok { color:#56d364; }
  .status.err { color:#f85149; }
  .meta { color:var(--muted); font-size:12px; margin-top:20px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>PunchIn Email — Admin</h1>
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
