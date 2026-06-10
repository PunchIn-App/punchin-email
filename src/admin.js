// Admin UI + JSON settings API, served by the worker's fetch() handler.
// Auth is handled upstream by authenticateAdmin(); these handlers assume the
// caller is already an authenticated admin (identity is passed in).

import { getSettings, updateSettings } from './settings.js';

const EDITABLE_FIELDS = ['forwardTo', 'allowedAliases', 'contactUrl'];

// Kept in sync with package.json / CLAUDE.md on each behaviour change.
const VERSION = '1.6.0';
const REPO_URL = 'https://github.com/PunchIn-App/punchin-email';

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
      // The Origin must be *present* and match — a missing Origin is rejected
      // too, since browsers attach it to every state-changing fetch and its
      // absence signals a non-browser / forged caller (issue #28).
      const origin = request.headers.get('Origin');
      if (origin !== url.origin) {
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
<style>
  /* No CDN fonts (project font policy): the Noto families render when
     installed locally; otherwise the system fallbacks below apply. */
  /* Design tokens from the PunchIn design system
     (punchin-design-system/project/colors_and_type.css — dark theme). */
  :root {
    color-scheme: dark;
    --accent-rgb: 45 91 245;
    --accent: rgb(45 91 245);            /* PunchIn Blue */
    --bg-primary:#0F1117; --bg-secondary:#161923; --bg-tertiary:#1E2232;
    --border-color:#2A2F45;
    --text-primary:#FFFFFF; --text-secondary:#C7D0E0; --text-muted:#8A93A6; --text-disabled:#5E6781;
    --ok:#34D399; --err:#FB6B6B;
    --shadow-accent:0 6px 18px color-mix(in srgb, var(--accent) 38%, transparent);
  }
  * { box-sizing: border-box; }
  body {
    margin:0; background:var(--bg-primary); color:var(--text-secondary);
    font:15px/1.6 "Noto Sans", system-ui, sans-serif;
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }
  .wrap { max-width:640px; margin:0 auto; padding:40px 20px; }
  .head { display:flex; align-items:center; gap:12px; margin:0 0 4px; }
  .mark { width:32px; height:32px; border-radius:8px; background:var(--accent); flex:0 0 auto; display:flex; align-items:center; justify-content:center; }
  h1 { font-family:"Noto Sans Display","Noto Sans",system-ui,sans-serif; font-weight:800; font-size:22px; letter-spacing:-0.02em; color:var(--text-primary); margin:0; }
  .sub { color:var(--text-muted); margin:0 0 28px; font-size:13px; }
  code { font-family:"Noto Sans Mono", ui-monospace, monospace; font-size:.92em; color:var(--text-secondary); }
  .card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.3); }
  label { display:block; font-weight:600; color:var(--text-primary); margin:20px 0 6px; }
  label:first-of-type { margin-top:0; }
  .hint { color:var(--text-muted); font-weight:400; font-size:12px; margin-top:2px; }
  input[type=text] {
    width:100%; margin-top:8px; padding:11px 14px; background:var(--bg-primary); color:var(--text-primary);
    border:1px solid var(--border-color); border-radius:11px; font:inherit; transition:border-color .15s, box-shadow .15s;
  }
  input::placeholder { color:var(--text-disabled); }
  input:focus { outline:none; border-color:rgb(var(--accent-rgb) / .6); box-shadow:0 0 0 2px rgb(var(--accent-rgb) / .5); }
  .badge { display:inline-block; font-family:"Noto Sans Mono",ui-monospace,monospace; font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; padding:2px 8px; border-radius:999px; margin-left:8px; vertical-align:middle; }
  .badge.kv { background:rgb(var(--accent-rgb) / .15); color:var(--accent); }
  .badge.env { background:rgba(107,114,128,.18); color:var(--text-muted); }
  .row { display:flex; align-items:center; gap:14px; margin-top:28px; }
  button {
    background:var(--accent); color:#fff; border:0; border-radius:13px; padding:13px 20px;
    font:inherit; font-weight:700; cursor:pointer; box-shadow:var(--shadow-accent); transition:filter .15s, box-shadow .15s;
  }
  button:hover { filter:brightness(1.08); }
  button:active { filter:brightness(.92); }
  button:disabled { opacity:.4; cursor:default; filter:none; box-shadow:none; }
  .status { font-size:13px; font-weight:500; }
  .status.ok { color:var(--ok); }
  .status.err { color:var(--err); }
  .meta { color:var(--text-muted); font-size:12px; margin-top:24px; }
  .about { margin-top:20px; }
  .about h2 { font-family:"Noto Sans Display","Noto Sans",system-ui,sans-serif; font-weight:700; font-size:15px; color:var(--text-primary); margin:0 0 10px; }
  .about p { margin:0 0 12px; font-size:13px; color:var(--text-secondary); }
  .about p:last-of-type { margin-bottom:0; }
  .about dl { display:grid; grid-template-columns:auto 1fr; gap:6px 14px; margin:0 0 14px; font-size:13px; }
  .about dt { color:var(--text-muted); }
  .about dd { margin:0; color:var(--text-secondary); }
  .about .links { display:flex; flex-wrap:wrap; gap:8px 18px; font-size:13px; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  :focus-visible { outline:2px solid rgb(var(--accent-rgb) / .75); outline-offset:2px; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <span class="mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.6h5"></path><path d="M12 2.6v2.4"></path><circle cx="12" cy="13.4" r="8.2"></circle><path d="M12 13.4V8.6"></path><path d="M12 13.4l3 1.9"></path><circle cx="12" cy="13.4" r="0.6" fill="#fff" stroke="none"></circle></svg>
    </span>
    <h1>Punch<span style="color:var(--accent)">I</span>n Email — Admin</h1>
  </div>
  <p class="sub">Signed in as <strong id="who">…</strong> · relay domain <code id="relayDomain"></code></p>
  <form id="form" class="card" autocomplete="off">
    <label>Forwarding address <span id="forwardToSrc" class="badge"></span></label>
    <div class="hint">Where inbound mail is delivered, and the only address allowed to drive replies.</div>
    <input id="forwardTo" type="text" inputmode="email" placeholder="you@example.com">

    <label>Accepted aliases <span id="allowedAliasesSrc" class="badge"></span></label>
    <div class="hint">Comma-separated local-parts allowed to forward, e.g. <code>abuse, cla, contact, cve, feedback, licensing</code>.</div>
    <input id="allowedAliases" type="text" placeholder="abuse, cla, contact, cve, feedback, licensing">

    <label>Contact URL <span id="contactUrlSrc" class="badge"></span></label>
    <div class="hint">Shown in the bounce for unknown addresses. Leave blank to default to https://&lt;relay domain&gt;.</div>
    <input id="contactUrl" type="text" placeholder="https://trackmytime.today">

    <div class="row">
      <button id="saveBtn" type="submit">Save</button>
      <span id="status" class="status"></span>
    </div>
    <div id="meta" class="meta"></div>
  </form>

  <section class="card about" aria-labelledby="aboutHead">
    <h2 id="aboutHead">About this worker</h2>
    <p>A Cloudflare Email Worker that gives the relay domain two-way role
       aliases. Inbound mail to an accepted alias is forwarded to the address above;
       when you hit <strong>Reply</strong>, the response goes back out
       <strong>from the alias</strong> to the original sender — your inbox stays
       private and no "From" picking is required.</p>
    <dl>
      <dt>Version</dt><dd>v${VERSION}</dd>
      <dt>Relay domain</dt><dd><code id="relayDomain2"></code></dd>
      <dt>Auth</dt><dd>Cloudflare Access (fails closed)</dd>
    </dl>
    <p class="links">
      <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Source &amp; docs ↗</a>
      <a href="${REPO_URL}/blob/main/docs/CHANGELOG.md" target="_blank" rel="noopener noreferrer">Changelog ↗</a>
      <a href="${REPO_URL}/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">Security policy ↗</a>
    </p>
  </section>
</div>
<script>
  var $ = function(id){ return document.getElementById(id); };
  function setStatus(msg, kind){ var el = $('status'); el.textContent = msg || ''; el.className = 'status ' + (kind || ''); }
  function badge(id, src){ var el = $(id); if(!el) return; var kv = src === 'kv'; el.textContent = kv ? 'saved' : 'default'; el.className = 'badge ' + (kv ? 'kv' : 'env'); }
  function fill(data){
    var s = data.settings;
    $('who').textContent = data.identity || 'unknown';
    $('relayDomain').textContent = s.relayDomain || '';
    var rd2 = $('relayDomain2'); if (rd2) rd2.textContent = s.relayDomain || '';
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
