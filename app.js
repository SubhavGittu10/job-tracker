/**
 * app.js — Frontend logic for Job Tracker
 * Fetches live data from /api/jobs + /api/preferences
 * Calls /api/generate, /api/update, /api/connections
 */

// ─── STATE ────────────────────────────────────────────────
var JOBS  = [];
var PREFS = {};   // loaded from Airtable Preferences table
var CONNS = [];   // loaded from Airtable Connections table
var S     = { statusFilter: 'all', openId: null };
var LS_KEY = 'jt_overrides_v3';

// ─── LOCAL OVERRIDES (stars/status only — not preferences) ─
function loadOv()         { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch(e) { return {}; } }
function saveOv(id, upd)  { var o = loadOv(); o[id] = Object.assign(o[id] || {}, upd); try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch(e) {} }
function applyOverrides() { var o = loadOv(); JOBS.forEach(function(j){ if(o[j.id]) Object.assign(j, o[j.id]); }); }

// ─── BOOT ─────────────────────────────────────────────────
async function boot() {
  showLoading(true);
  try {
    // Fetch jobs + preferences in parallel
    var [jobsRes, prefsRes] = await Promise.all([
      fetch('/api/jobs'),
      fetch('/api/preferences'),
    ]);
    var jobsData  = await jobsRes.json();
    var prefsData = await prefsRes.json();
    if (!jobsRes.ok)  throw new Error(jobsData.error  || 'Jobs API error');

    JOBS  = jobsData.jobs || [];
    PREFS = prefsData.prefs || {};
    applyOverrides();
    updateStats();
    renderJobs();
    document.getElementById('ts').textContent = 'Updated just now · ' + JOBS.length + ' jobs';
  } catch (err) {
    document.getElementById('grid').innerHTML = '<div class="empty">⚠️ Could not load: ' + err.message + '</div>';
  }
  showLoading(false);
}

// Helper: get BIO string from loaded prefs
function getBio() {
  return PREFS['bio'] ? PREFS['bio'].value : 'Subhav Malhotra — PM with 4.5+ years AI product experience.';
}

// ─── BOOT (original single-fetch kept as fallback) ────────
async function _legacyBoot() {
  showLoading(true);
  try {
    var res  = await fetch('/api/jobs');
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    JOBS = data.jobs || [];
    applyOverrides();
    updateStats();
    renderJobs();
    document.getElementById('ts').textContent = 'Updated just now · ' + JOBS.length + ' jobs';
  } catch (err) {
    document.getElementById('grid').innerHTML = '<div class="empty">⚠️ Could not load jobs: ' + err.message + '</div>';
  }
  showLoading(false);
}

function showLoading(on) {
  var el = document.getElementById('loading-bar');
  if (el) el.style.display = on ? 'block' : 'none';
}

// ─── HELPERS ──────────────────────────────────────────────
function scLabel(v) {
  if (v >= 85) return { cls: 'sc-hot',  t: '🔥 ' + v };
  if (v >= 70) return { cls: 'sc-good', t: '✅ ' + v };
  if (v >= 55) return { cls: 'sc-ok',   t: '⚠️ ' + v };
  return              { cls: 'sc-low',  t: '' + v };
}
function stCls(s) {
  return { 'New Lead': 's-nl', Applied: 's-ap', Interview: 's-iv', Offer: 's-of', Rejected: 's-rj', Withdrawn: 's-wd' }[s] || 's-nl';
}
function escHtml(str) { return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─── STATS ────────────────────────────────────────────────
function updateStats() {
  document.getElementById('cn-all').textContent = JOBS.length;
  ['New Lead','Applied','Interview','Offer','Rejected'].forEach(function(s) {
    var el = document.getElementById('cn-' + s.toLowerCase().replace(' ','-').replace('new-lead','nl').replace('applied','app').replace('interview','int').replace('offer','off').replace('rejected','rej'));
    if (el) el.textContent = JOBS.filter(function(j){ return j.status === s; }).length;
  });
  document.getElementById('cn-nl').textContent  = JOBS.filter(function(j){ return j.status === 'New Lead'; }).length;
  document.getElementById('cn-app').textContent = JOBS.filter(function(j){ return j.status === 'Applied'; }).length;
  document.getElementById('cn-int').textContent = JOBS.filter(function(j){ return j.status === 'Interview'; }).length;
  document.getElementById('cn-off').textContent = JOBS.filter(function(j){ return j.status === 'Offer'; }).length;
  document.getElementById('cn-rej').textContent = JOBS.filter(function(j){ return j.status === 'Rejected'; }).length;
  document.getElementById('cn-sel').textContent = JOBS.filter(function(j){ return j.sel; }).length;
}

// ─── FILTER / RENDER JOBS ─────────────────────────────────
function setFilter(val) {
  S.statusFilter = val;
  document.querySelectorAll('.stab').forEach(function(el){ el.classList.remove('on'); });
  var tabId = val === 'all' ? 'stab-all' : val === 'selected' ? 'stab-sel' : 'stab-' + val;
  var el = document.getElementById(tabId);
  if (el) el.classList.add('on');
  renderJobs();
}

function renderJobs() {
  var q   = (document.getElementById('f-search').value || '').toLowerCase();
  var src = document.getElementById('f-src').value;
  var loc = (document.getElementById('f-loc').value || '').toLowerCase();
  var srt = document.getElementById('f-sort').value;
  var sf  = S.statusFilter;

  var list = JOBS.filter(function(j) {
    if (sf === 'selected' && !j.sel) return false;
    if (sf !== 'all' && sf !== 'selected' && j.status !== sf) return false;
    if (q && j.co.toLowerCase().indexOf(q) < 0 && j.role.toLowerCase().indexOf(q) < 0) return false;
    if (src && j.src !== src) return false;
    if (loc && (j.loc || '').toLowerCase().indexOf(loc) < 0) return false;
    return true;
  });

  list.sort(function(a, b) {
    if (srt === 'score') return b.score - a.score;
    if (srt === 'date')  return (b.da || '').localeCompare(a.da || '');
    return a.co.localeCompare(b.co);
  });

  if (!list.length) {
    document.getElementById('grid').innerHTML = '<div class="empty">No jobs match your filters</div>';
    return;
  }

  document.getElementById('grid').innerHTML = list.map(function(j) {
    var sl = scLabel(j.score);
    return '<div class="card' + (j.sel ? ' starred' : '') + '" data-id="' + j.id + '">'
      + '<div class="card-top"><span class="src-b">' + escHtml(j.src) + '</span>'
      + '<button class="star-b" data-star="' + j.id + '">' + (j.sel ? '⭐' : '☆') + '</button></div>'
      + '<div class="card-co">' + escHtml(j.co) + '</div>'
      + '<div class="card-role">' + escHtml(j.role) + '</div>'
      + '<div class="card-foot"><span class="loc-txt">📍 ' + (j.loc || '—') + '</span>'
      + '<div class="chips"><span class="sc ' + sl.cls + '">' + sl.t + '</span>'
      + '<span class="chip ' + stCls(j.status) + '">' + j.status + '</span></div></div>'
      + '</div>';
  }).join('');
}

// ─── GRID CLICK DELEGATION ────────────────────────────────
document.getElementById('grid').addEventListener('click', function(e) {
  var starBtn = e.target.closest('[data-star]');
  if (starBtn) {
    e.stopPropagation();
    var id = starBtn.getAttribute('data-star');
    var j  = JOBS.find(function(x){ return x.id === id; });
    if (j) { j.sel = !j.sel; saveOv(id, { sel: j.sel }); updateStats(); renderJobs(); }
    return;
  }
  var card = e.target.closest('.card');
  if (card) openModal(card.getAttribute('data-id'));
});

// ─── MODAL ────────────────────────────────────────────────
function openModal(id) {
  var j = JOBS.find(function(x){ return x.id === id; }); if (!j) return;
  S.openId = id;
  var sl = scLabel(j.score);
  var l = (j.loc || '').toLowerCase();
  var locPts = l.indexOf('bengaluru') >= 0 || l.indexOf('bangalore') >= 0 ? 40
    : l.indexOf('mumbai') >= 0 ? 32 : l.indexOf('remote') >= 0 ? 28
    : l.indexOf('hyderabad') >= 0 ? 22 : 18;
  var r = j.role.toLowerCase();
  var rolePts = r.indexOf('senior') >= 0 || r.indexOf('sr.') >= 0 ? 15
    : r.indexOf('lead') >= 0 || r.indexOf('principal') >= 0 ? 14 : 11;

  var html = '<div class="m-co">' + escHtml(j.co) + '</div>'
    + '<div class="m-role">' + escHtml(j.role) + '</div>'
    + '<div class="m-meta">'
    + '<span class="m-chip">📍 ' + (j.loc || '—') + '</span>'
    + '<span class="m-chip">🗓 ' + (j.da  || '—') + '</span>'
    + '<span class="m-chip">' + j.src + '</span>'
    + '<span class="sc ' + sl.cls + '" style="padding:4px 11px">' + sl.t + '</span>'
    + '<span class="chip ' + stCls(j.status) + '" style="padding:4px 10px;font-size:10px">' + j.status + '</span>'
    + '</div>';

  if (j.notes) html += '<div class="m-lbl">Notes</div><div class="m-notes">' + escHtml(j.notes) + '</div>';

  html += '<div class="m-lbl">Match Score — ' + j.score + '/100</div>'
    + '<div class="m-scores">'
    + '<div class="m-score-row"><span>📍 Location (40%)</span><span class="m-score-val">' + locPts + '/40</span></div>'
    + '<div class="m-score-row"><span>🎯 Role Level (15%)</span><span class="m-score-val">' + rolePts + '/15</span></div>'
    + '<div class="m-score-row"><span>🤖 Domain (15%)</span><span class="m-score-val">' + (j.score >= 70 ? 'Strong' : 'Moderate') + '</span></div>'
    + '<div class="m-score-row"><span>🏢 Company (10%)</span><span class="m-score-val">' + (j.score >= 80 ? 'Tier 1' : 'Tier 2') + '</span></div>'
    + '</div>';

  html += '<div class="m-lbl" style="margin-top:12px">Update Status '
    + '<span class="saved-tick" id="saved-tick">✓ Saved to Airtable</span></div>'
    + '<select class="m-status-sel" id="m-status-sel">'
    + ['New Lead','Applied','Interview','Offer','Rejected','Withdrawn'].map(function(s){
        return '<option' + (j.status === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select>';

  html += '<div class="m-actions">';
  if (j.lnk) html += '<a href="' + j.lnk + '" target="_blank" class="btn-apply">🚀 Apply Now</a>';
  else html += '<span style="color:#94a3b8;font-size:12px">No apply link stored</span>';
  html += '<button class="btn-star2" id="m-star-btn">' + (j.sel ? '⭐ Starred' : '☆ Star') + '</button>';
  if (j.gm) html += '<a href="https://mail.google.com/mail/u/0/#inbox/' + j.gm + '" target="_blank" class="btn-gm">📧 Gmail</a>';
  html += '</div>';

  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('overlay').classList.add('on');

  document.getElementById('m-status-sel').addEventListener('change', async function() {
    var j2 = JOBS.find(function(x){ return x.id === S.openId; }); if (!j2) return;
    j2.status = this.value;
    saveOv(S.openId, { status: j2.status });
    updateStats(); renderJobs();
    try {
      await fetch('/api/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: j2.id, fields: { status: j2.status } }),
      });
      var tick = document.getElementById('saved-tick');
      if (tick) { tick.classList.add('on'); setTimeout(function(){ tick.classList.remove('on'); }, 2000); }
    } catch(e) { console.warn('Update failed', e.message); }
  });

  document.getElementById('m-star-btn').addEventListener('click', function() {
    var j2 = JOBS.find(function(x){ return x.id === S.openId; }); if (!j2) return;
    j2.sel = !j2.sel; saveOv(S.openId, { sel: j2.sel });
    this.textContent = j2.sel ? '⭐ Starred' : '☆ Star';
    var card = document.querySelector('.card[data-id="' + S.openId + '"]');
    if (card) { card.classList.toggle('starred', j2.sel); var sb = card.querySelector('[data-star]'); if (sb) sb.textContent = j2.sel ? '⭐' : '☆'; }
    updateStats();
  });
}

function closeModal() { document.getElementById('overlay').classList.remove('on'); S.openId = null; }

// ─── PAGE NAV ─────────────────────────────────────────────
function goPage(id) {
  ['jobs','pipeline','nurture','settings'].forEach(function(p) {
    document.getElementById('pg-' + p).classList.toggle('on', p === id);
    document.getElementById('nav-' + p).classList.toggle('on', p === id);
  });
  if (id === 'pipeline') renderPipeline();
  if (id === 'nurture')  renderNurture();
}

// ─── PIPELINE ─────────────────────────────────────────────
function renderPipeline() {
  var cols = [
    { key: 'Applied',   icon: '📋', color: '#2563eb' },
    { key: 'Interview', icon: '📞', color: '#d97706' },
    { key: 'Offer',     icon: '🎉', color: '#059669' },
    { key: 'Rejected',  icon: '❌', color: '#dc2626' },
  ];
  document.getElementById('pipeline').innerHTML = cols.map(function(col) {
    var jobs = JOBS.filter(function(j){ return j.status === col.key; }).sort(function(a,b){ return b.score - a.score; });
    return '<div class="pipe-col">'
      + '<div class="pipe-title" style="color:' + col.color + '">' + col.icon + ' ' + col.key
      + ' <span class="p-cnt" style="background:' + col.color + '22;color:' + col.color + '">' + jobs.length + '</span></div>'
      + (jobs.length
          ? jobs.map(function(j){ var sl = scLabel(j.score); return '<div class="p-card" data-pipe-id="' + j.id + '"><div class="p-co">' + escHtml(j.co) + '</div><div class="p-role">' + escHtml(j.role) + '</div><div style="margin-top:5px"><span class="sc ' + sl.cls + '">' + sl.t + '</span></div></div>'; }).join('')
          : '<div class="p-empty">Empty</div>')
      + '</div>';
  }).join('');

  document.getElementById('pipeline').addEventListener('click', function(e) {
    var card = e.target.closest('[data-pipe-id]');
    if (card) { goPage('jobs'); openModal(card.getAttribute('data-pipe-id')); }
  });
}

// ─── NURTURE AGENT ────────────────────────────────────────
function renderNurture() {
  var leads    = JOBS.filter(function(j){ return j.status === 'New Lead' && j.score >= 70; }).sort(function(a,b){ return b.score - a.score; }).slice(0, 8);
  var applied  = JOBS.filter(function(j){ return j.status === 'Applied'; }).sort(function(a,b){ return b.score - a.score; });
  var iviews   = JOBS.filter(function(j){ return j.status === 'Interview'; });

  document.getElementById('np-leads').textContent      = leads.length;
  document.getElementById('np-applied').textContent    = applied.length;
  document.getElementById('np-interviews').textContent = iviews.length;

  // ── Lead → Applied (with browser auto-apply) ──────────
  document.getElementById('funnel-leads').innerHTML = !leads.length
    ? '<div class="p-empty">No actionable leads</div>'
    : leads.map(function(j, i) {
        var sl = scLabel(j.score);
        return '<div class="nc" id="nc-l-' + j.id + '">'
          + '<div class="nc-top"><div><div class="nc-co">' + escHtml(j.co) + (i < 3 ? ' <span class="ref-rec">🔥 Top Pick</span>' : '') + '</div></div>'
          + '<span class="sc ' + sl.cls + '">' + sl.t + '</span></div>'
          + '<div class="nc-role">' + escHtml(j.role) + '</div>'
          + '<div class="nc-meta"><span class="nc-tag">' + j.src + '</span>' + (j.loc ? '<span class="nc-date">📍 ' + j.loc + '</span>' : '') + '<span class="nc-date">' + j.da + '</span></div>'
          + '<div class="nc-actions">'
          + '<button class="btn-automate" id="btn-draft-' + j.id + '" onclick="draftApp(\'' + j.id + '\')">✉️ Draft Cover Email</button>'
          + (j.lnk
              ? '<button class="btn-automate" style="background:#7c3aed" onclick="autoApply(\'' + j.id + '\')">🤖 Auto Apply</button>'
              : '')
          + '<button class="btn-mark-applied" onclick="markApplied(\'' + j.id + '\')">✓ Mark Applied</button>'
          + '</div>'
          + '<div class="gen-area" id="gen-l-' + j.id + '"></div>'
          + '</div>';
      }).join('');

  // ── Applied → Referral (with LinkedIn connection finder) ──
  document.getElementById('funnel-applied').innerHTML = !applied.length
    ? '<div class="p-empty">No applied roles yet</div>'
    : applied.map(function(j, i) {
        // Count existing connections for this job
        var existingConns = CONNS.filter(function(c){ return c.company.toLowerCase() === j.co.toLowerCase(); });
        var connBadge = existingConns.length
          ? ' <span class="ref-rec" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7">👥 ' + existingConns.length + ' saved</span>'
          : '';
        return '<div class="nc" id="nc-r-' + j.id + '">'
          + '<div class="nc-top"><div><div class="nc-co">' + escHtml(j.co) + (i < 3 ? ' <span class="ref-rec">⭐ Priority</span>' : '') + connBadge + '</div></div>'
          + (j.score > 0 ? '<span class="sc ' + scLabel(j.score).cls + '">' + j.score + '</span>' : '')
          + '</div>'
          + '<div class="nc-role">' + escHtml(j.role) + '</div>'
          + '<div class="nc-meta"><span class="nc-tag">' + j.src + '</span><span class="nc-date">Applied ' + j.da + '</span>'
          + (j.gm ? '<a href="https://mail.google.com/mail/u/0/#inbox/' + j.gm + '" target="_blank" style="font-size:10px;color:#4f46e5;text-decoration:none">📧</a>' : '')
          + '</div>'
          + '<div class="nc-actions">'
          + '<button class="btn-ref" id="btn-ref-' + j.id + '" onclick="genReferral(\'' + j.id + '\')">🤝 Get Referral Ask</button>'
          + '<button class="btn-ref" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd" id="btn-li-' + j.id + '" onclick="findLinkedInConnections(\'' + j.id + '\')">🔍 Find Connections</button>'
          + '</div>'
          + '<div class="gen-area" id="gen-r-' + j.id + '"></div>'
          + '</div>';
      }).join('');
}

function markApplied(id) {
  var j = JOBS.find(function(x){ return x.id === id; }); if (!j) return;
  j.status = 'Applied'; saveOv(id, { status: 'Applied' });
  updateStats(); renderNurture();
  fetch('/api/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, fields: { status: 'Applied' } }) });
}

// ── Auto Apply via Claude in Chrome ─────────────────────
function autoApply(id) {
  var j = JOBS.find(function(x){ return x.id === id; }); if (!j || !j.lnk) return;
  var bio = getBio();
  // Sends a prompt to Claude which triggers Claude in Chrome to navigate and fill the form
  sendPrompt(
    'Use Claude in Chrome to apply for this job:\n' +
    'URL: ' + j.lnk + '\n' +
    'Role: ' + j.role + ' at ' + j.co + '\n\n' +
    'Candidate profile:\n' + bio + '\n\n' +
    'Instructions: Open the URL, fill in the application form with the candidate details above, ' +
    'upload their resume if prompted (ask them to confirm), and submit. ' +
    'After applying, call PATCH /api/update with id=' + j.id + ' to set status to Applied.'
  );
}

async function draftApp(id) {
  var j   = JOBS.find(function(x){ return x.id === id; }); if (!j) return;
  var btn  = document.getElementById('btn-draft-' + id);
  var area = document.getElementById('gen-l-' + id);
  btn.disabled = true; btn.textContent = '⏳ Drafting…';
  area.classList.add('on');
  area.innerHTML = loadingDots('Generating cover email…');
  try {
    var res  = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cover_letter', job: j, bio: getBio() }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    area.innerHTML = '<div class="m-lbl" style="margin-bottom:6px">✉️ Application Draft</div>'
      + '<div class="gen-doc">' + escHtml(data.text) + '</div>'
      + '<div class="gen-doc-footer"><button class="btn-copy" onclick="copyDoc(\'' + id + '\',\'l\')">📋 Copy</button><span class="copy-ok" id="cok-l-' + id + '">Copied!</span>'
      + '<button class="btn-mark-applied" onclick="markApplied(\'' + id + '\')">✓ Mark Applied</button></div>';
  } catch(e) {
    area.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px">⚠️ ' + e.message + '</div>';
  }
  btn.disabled = false; btn.textContent = '✉️ Draft Cover Email';
}

async function genReferral(id) {
  var j   = JOBS.find(function(x){ return x.id === id; }); if (!j) return;
  var btn  = document.getElementById('btn-ref-' + id);
  var area = document.getElementById('gen-r-' + id);
  btn.disabled = true; btn.textContent = '⏳ Generating…';
  area.classList.add('on');
  area.innerHTML = loadingDots('Building referral outreach…');
  try {
    var res  = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'referral', job: j, bio: getBio() }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    area.innerHTML = '<div class="m-lbl" style="margin-bottom:6px">🤝 Referral Outreach Docs</div>'
      + '<div class="gen-doc">' + escHtml(data.text) + '</div>'
      + '<div class="gen-doc-footer"><button class="btn-copy" onclick="copyDoc(\'' + id + '\',\'r\')">📋 Copy</button><span class="copy-ok" id="cok-r-' + id + '">Copied!</span></div>';
  } catch(e) {
    area.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px">⚠️ ' + e.message + '</div>';
  }
  btn.disabled = false; btn.textContent = '🤝 Get Referral Ask';
}

// ── LinkedIn Connection Finder via LinkedIn MCP ──────────
async function findLinkedInConnections(id) {
  var j   = JOBS.find(function(x){ return x.id === id; }); if (!j) return;
  var btn  = document.getElementById('btn-li-' + id);
  var area = document.getElementById('gen-r-' + id);
  btn.disabled = true; btn.textContent = '⏳ Searching…';
  area.classList.add('on');
  area.innerHTML = loadingDots('Searching LinkedIn connections at ' + j.co + '…');

  // First, get AI strategy for best search approach
  try {
    var stratRes  = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'linkedin_search', job: j, bio: getBio() }),
    });
    var stratData = await stratRes.json();
    var strategy  = stratRes.ok ? stratData.text : 'Search for Product Manager, HR, or Recruiter at ' + j.co;

    // Show strategy + trigger LinkedIn MCP via sendPrompt
    area.innerHTML = '<div class="m-lbl" style="margin-bottom:6px">🔍 LinkedIn Search Strategy</div>'
      + '<div class="gen-doc">' + escHtml(strategy) + '</div>'
      + '<div class="gen-doc-footer">'
      + '<button class="btn-copy" onclick="copyDoc(\'' + id + '\',\'r\')">📋 Copy Strategy</button>'
      + '<span class="copy-ok" id="cok-r-' + id + '">Copied!</span>'
      + '<button class="btn-automate" style="font-size:11px;padding:5px 10px" onclick="triggerLinkedInSearch(\'' + id + '\')">🤖 Search via LinkedIn MCP</button>'
      + '</div>';
  } catch(e) {
    area.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px">⚠️ ' + e.message + '</div>';
  }
  btn.disabled = false; btn.textContent = '🔍 Find Connections';
}

// ── Trigger LinkedIn MCP search via sendPrompt ───────────
function triggerLinkedInSearch(id) {
  var j = JOBS.find(function(x){ return x.id === id; }); if (!j) return;
  sendPrompt(
    'Use the LinkedIn MCP server to find 1st and 2nd degree connections at ' + j.co + ' who could refer me for the ' + j.role + ' role.\n\n' +
    'Steps:\n' +
    '1. Use search_people with company="' + j.co + '" and degree filters for 1st and 2nd connections\n' +
    '2. Use get_company_employees for "' + j.co + '" to find Product, Engineering, or HR people\n' +
    '3. For each person found, save to Airtable Connections table (POST /api/connections) with: name, linkedinUrl, company="' + j.co + '", title, degree, jobId="' + id + '"\n' +
    '4. Generate a personalised outreach message for each person and save it in the outreachMessage field\n' +
    '5. Return a summary of who was found and their connection degree\n\n' +
    'Priority: 1st degree > 2nd degree. Focus on: Product Manager, Engineering Lead, Recruiter, HR.'
  );
}

function copyDoc(id, prefix) {
  var doc = document.querySelector('#gen-' + prefix + '-' + id + ' .gen-doc'); if (!doc) return;
  navigator.clipboard.writeText(doc.textContent).then(function() {
    var ok = document.getElementById('cok-' + prefix + '-' + id);
    if (ok) { ok.classList.add('on'); setTimeout(function(){ ok.classList.remove('on'); }, 2000); }
  });
}

function loadingDots(msg) {
  return '<div class="gen-loading"><div class="gen-loading-dot"></div><div class="gen-loading-dot"></div><div class="gen-loading-dot"></div><span>' + msg + '</span></div>';
}

// ─── SETTINGS — rendered from Airtable Preferences ────────
function renderSettings() {
  // Render search criteria chips
  var criteria = ['target_roles','target_locations','target_industries','salary_range','company_type'];
  var gridHtml = criteria.map(function(key) {
    var p = PREFS[key];
    if (!p) return '';
    var val = p.value || '';
    // Try to parse JSON arrays for chip display
    var chips = '';
    try {
      var arr = JSON.parse(val);
      if (Array.isArray(arr)) {
        chips = arr.map(function(v){ return '<span class="tag">' + escHtml(v) + '</span>'; }).join('');
      }
    } catch(e) {
      chips = '<span style="font-size:12px;color:#475569">' + escHtml(val) + '</span>';
    }
    return '<div class="p-card2">'
      + '<div class="p-lbl">' + escHtml(p.label) + '</div>'
      + '<div class="tag-row">' + chips + '</div>'
      + '<button onclick="editPref(\'' + p.id + '\',\'' + escHtml(p.label) + '\')" style="margin-top:6px;background:none;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;color:#64748b">✏️ Edit</button>'
      + '</div>';
  }).join('');
  var gridEl = document.getElementById('pref-grid');
  if (gridEl) gridEl.innerHTML = gridHtml;

  // Render Q&A from Airtable
  renderQA();
}

async function editPref(id, label) {
  var p    = Object.values(PREFS).find(function(x){ return x.id === id; });
  var curr = p ? p.value : '';
  var newVal = prompt('Edit ' + label + ':', curr);
  if (newVal === null || newVal === curr) return;
  try {
    var r = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, value: newVal }),
    });
    if (!r.ok) throw new Error('Save failed');
    // Update local cache
    if (p) p.value = newVal;
    renderSettings();
  } catch(e) { alert('Could not save: ' + e.message); }
}

// ─── Q&A KB — stored in Airtable, not localStorage ───────
function renderQA() {
  var qaItems = Object.values(PREFS).filter(function(p){ return p.category === 'Q&A'; });
  if (!qaItems.length) {
    document.getElementById('qa-list').innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px">No Q&A items found. Add them in Airtable Preferences table.</div>';
    return;
  }
  document.getElementById('qa-list').innerHTML = qaItems.map(function(item, i) {
    return '<div class="qa-item">'
      + '<div class="qa-q" onclick="toggleQA(' + i + ')"><span>' + escHtml(item.label) + '</span><span id="qa-arr-' + i + '">▼</span></div>'
      + '<div class="qa-body" id="qa-body-' + i + '">'
      + '<div class="qa-text" id="qa-text-' + i + '">' + escHtml(item.value) + '</div>'
      + '<button class="qa-edit-btn" onclick="editQAItem(\'' + item.id + '\',' + i + ')">✏️ Edit</button>'
      + '</div></div>';
  }).join('');
}

function toggleQA(i) { var b = document.getElementById('qa-body-' + i); var a = document.getElementById('qa-arr-' + i); var o = b.classList.toggle('on'); if(a) a.textContent = o ? '▲' : '▼'; }

function editQAItem(prefId, i) {
  var p = Object.values(PREFS).find(function(x){ return x.id === prefId; });
  var body = document.getElementById('qa-body-' + i);
  body.innerHTML = '<textarea class="qa-textarea" id="qa-ta-' + i + '">' + escHtml(p ? p.value : '') + '</textarea>'
    + '<button class="qa-save-btn" onclick="saveQAItemToAirtable(\'' + prefId + '\',' + i + ')">Save to Airtable</button>';
}

async function saveQAItemToAirtable(prefId, i) {
  var ta  = document.getElementById('qa-ta-' + i); if (!ta) return;
  var val = ta.value;
  try {
    var r = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prefId, value: val }),
    });
    if (!r.ok) throw new Error('Save failed');
    var p = Object.values(PREFS).find(function(x){ return x.id === prefId; });
    if (p) p.value = val;
    renderQA();
    var b = document.getElementById('qa-body-' + i); if(b) b.classList.add('on');
  } catch(e) { alert('Could not save: ' + e.message); }
}

// ─── EVENT LISTENERS ──────────────────────────────────────
document.getElementById('nav-settings').addEventListener('click', function(){ renderSettings(); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeModal(); });

// ─── START ────────────────────────────────────────────────
boot();
