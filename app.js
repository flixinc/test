/* ============================================================
   COMPIER Dashboard — App logica
   v1.9 | 2026-04-02
   ============================================================ */

// ── Constanten ────────────────────────────────────────────
const STATUS_LABELS = {
  offerte: 'Offerte',
  lopend: 'Lopend',
  wacht: 'Wacht op materiaal',
  'wacht-reactie': 'Wacht op reactie',
  'wacht-akkoord': 'Wacht op akkoord',
  klaar: 'Klaar'
};
const STATUS_CLASS = {
  offerte: 's-offerte',
  lopend: 's-lopend',
  wacht: 's-wacht',
  'wacht-reactie': 's-wacht',
  'wacht-akkoord': 's-wacht',
  klaar: 's-klaar'
};
const OPDRACHTGEVER_LOGOS = {};

// ── State ─────────────────────────────────────────────────
let projecten = [];
let nextId = 1;
let activeFilter = 'alle';
let searchQuery = '';
let editingId = null;
let sortKey = 'datum';
let sortDir = 1;
let apiKey = localStorage.getItem('compier_api_key') || '';
let sbUrl  = localStorage.getItem('compier_sb_url') || '';
let sbKey  = localStorage.getItem('compier_sb_key') || '';

// ── Auth state ────────────────────────────────────────────
let sbAccessToken  = '';
let sbRefreshToken = '';
let sbTokenExpiry  = 0;

// ── Logo helper ───────────────────────────────────────────
function toonLogo(opdrachtgever) {
  const logoWrap = document.getElementById('modal-logo');
  const logoImg  = document.getElementById('modal-logo-img');
  const key = (opdrachtgever || '').toLowerCase().replace(/[^a-z]/g, '');
  const src = OPDRACHTGEVER_LOGOS[key];
  if (src) {
    logoImg.src = src;
    logoWrap.style.display = 'flex';
  } else {
    logoWrap.style.display = 'none';
  }
}

// ── Auth functies ─────────────────────────────────────────
async function initAuth() {
  const stored = JSON.parse(localStorage.getItem('compier_session') || 'null');
  if (stored?.access_token) {
    sbAccessToken  = stored.access_token;
    sbRefreshToken = stored.refresh_token;
    sbTokenExpiry  = stored.expires_at || 0;
    if (Date.now() / 1000 < sbTokenExpiry - 60) { toonApp(); return; }
    if (await vernieuwSession()) { toonApp(); return; }
  }
  toonLoginScherm();
}

async function doLogin() {
  const emailEl  = document.getElementById('login-email');
  const passEl   = document.getElementById('login-password');
  const errorEl  = document.getElementById('login-error');
  const btn      = document.querySelector('.login-btn');
  const email    = emailEl.value.trim();
  const password = passEl.value;
  if (!sbUrl || !sbKey) {
    sbUrl = (document.getElementById('login-sb-url')?.value || '').trim().replace(/\/+$/, '');
    sbKey = (document.getElementById('login-sb-key')?.value || '').trim();
    if (sbUrl) localStorage.setItem('compier_sb_url', sbUrl);
    if (sbKey) localStorage.setItem('compier_sb_key', sbKey);
  }
  if (!sbUrl || !sbKey) { document.getElementById('login-setup').style.display = 'block'; errorEl.textContent = 'Vul eerst de Supabase URL en Key in.'; return; }
  if (!email || !password) { errorEl.textContent = 'Vul e-mail en wachtwoord in.'; return; }
  errorEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Bezig…';
  try {
    const res = await fetch(sbUrl + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || err.msg || 'E-mail of wachtwoord onjuist.');
    }
    slaSessionOp(await res.json());
    toonApp();
  } catch(e) {
    errorEl.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Inloggen';
  }
}

async function vernieuwSession() {
  if (!sbRefreshToken || !sbUrl || !sbKey) return false;
  try {
    const res = await fetch(sbUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sbRefreshToken })
    });
    if (!res.ok) return false;
    slaSessionOp(await res.json());
    return true;
  } catch(e) { return false; }
}

function slaSessionOp(data) {
  sbAccessToken  = data.access_token;
  sbRefreshToken = data.refresh_token;
  sbTokenExpiry  = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
  localStorage.setItem('compier_session', JSON.stringify({
    access_token: sbAccessToken, refresh_token: sbRefreshToken, expires_at: sbTokenExpiry
  }));
}

async function logoutUser() {
  if (!confirm('Uitloggen?')) return;
  try {
    await fetch(sbUrl + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbAccessToken }
    });
  } catch(e) {}
  sbAccessToken = ''; sbRefreshToken = ''; sbTokenExpiry = 0;
  localStorage.removeItem('compier_session');
  toonLoginScherm();
}

function toonLoginScherm() {
  document.getElementById('login-screen').style.display = 'flex';
  if (!sbUrl || !sbKey) document.getElementById('login-setup').style.display = 'block';
}

function toonApp() {
  document.getElementById('login-screen').style.display = 'none';
  initApiKey();
  laadProjecten();
  laadMedewerkers();
}

// ── Supabase helpers ──────────────────────────────────────
async function sbFetch(path, method = 'GET', body = null) {
  if (sbAccessToken && Date.now() / 1000 > sbTokenExpiry - 60) {
    await vernieuwSession();
  }
  const opts = {
    method,
    headers: {
      'apikey': sbKey,
      'Authorization': 'Bearer ' + (sbAccessToken || sbKey),
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(sbUrl + '/rest/v1/' + path, opts);
  if (!res.ok) throw new Error(await res.text());
  return method === 'DELETE' ? null : res.json();
}

async function laadMedewerkers() {
  const select = document.getElementById('f-toegewezen');
  if (!select || !sbUrl || !sbKey) return;
  try {
    const data = await sbFetch('medewerkers?order=naam.asc');
    select.length = 0;
    const leeg = new Option('— Niet toegewezen —', '');
    select.add(leeg);
    (data || []).forEach(m => select.add(new Option(m.naam, m.email)));
  } catch(e) { /* tabel bestaat nog niet of lege lijst */ }
}

async function laadProjecten() {
  if (!sbUrl || !sbKey) { render(); return; }
  try {
    const data = await sbFetch('projecten?order=id.asc');
    if (Array.isArray(data)) {
      projecten = data;
      if (projecten.length > 0) nextId = Math.max(...projecten.map(p => p.id)) + 1;
    }
  } catch(e) {
    console.warn('Laden mislukt:', e.message);
  }
  render();
}

async function slaOpInDb(project) {
  if (!sbUrl || !sbKey) return;
  try {
    if (editingId) {
      await sbFetch('projecten?id=eq.' + project.id, 'PATCH', project);
    } else {
      const result = await sbFetch('projecten', 'POST', project);
      if (Array.isArray(result) && result[0]?.id) project.id = result[0].id;
    }
  } catch(e) {
    console.warn('Opslaan mislukt:', e.message);
  }
}

async function verwijderUitDb(id) {
  if (!sbUrl || !sbKey) return;
  try {
    await sbFetch('projecten?id=eq.' + id, 'DELETE');
  } catch(e) {
    console.warn('Verwijderen mislukt:', e.message);
  }
}

// ── Instellingen banner ───────────────────────────────────
function initApiKey() {
  if (apiKey) document.getElementById('api-key-input').value = apiKey;
  if (sbUrl)  document.getElementById('sb-url-input').value = sbUrl;
  if (sbKey)  document.getElementById('sb-key-input').value = sbKey;
  updateApiStatus();
  collapseBannerIfComplete();
}

function updateApiStatus() {
  const s = document.getElementById('api-status');
  if (apiKey && sbUrl && sbKey) { s.textContent = '✓ Alles ingesteld'; s.className = 'api-status'; }
  else if (apiKey) { s.textContent = '⚠ Supabase ontbreekt'; s.className = 'api-status missing'; }
  else { s.textContent = 'Niet ingesteld'; s.className = 'api-status missing'; }
}

function collapseBannerIfComplete() {
  const allesOk = apiKey && sbUrl && sbKey;
  document.querySelector('.api-banner').classList.toggle('collapsed', allesOk);
}

function toggleApiBanner() {
  document.querySelector('.api-banner').classList.toggle('collapsed');
}

function saveApiKey() {
  apiKey = document.getElementById('api-key-input').value.trim();
  sbUrl  = document.getElementById('sb-url-input').value.trim().replace(/\/+$/, '');
  sbKey  = document.getElementById('sb-key-input').value.trim();
  localStorage.setItem('compier_api_key', apiKey);
  localStorage.setItem('compier_sb_url', sbUrl);
  localStorage.setItem('compier_sb_key', sbKey);
  updateApiStatus();
  collapseBannerIfComplete();
  if (sbUrl && sbKey) laadProjecten();
}

// ── AI Bon uitlezen ───────────────────────────────────────
async function uitLezenBon() {
  const tekst = document.getElementById('bon-tekst').value.trim();
  if (!tekst) { alert('Plak eerst de tekst van de bon.'); return; }
  if (!apiKey) { alert('Vul eerst je API key in bovenaan de pagina.'); return; }
  const btn = document.querySelector('.btn-uitlezen');
  btn.disabled = true;
  document.getElementById('ai-loading').classList.add('show');
  const resultEl = document.getElementById('ai-result');
  resultEl.className = 'ai-result';
  try {
    const response = await fetch('https://damp-surf-e962compier-proxy.rayflix.workers.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `Dit is een Nederlandse opdrachtbon of offerte-aanvraag van Compier O&A. Extraheer de volgende velden en geef ALLEEN een geldig JSON-object terug, geen uitleg, geen markdown.
Velden:
- nummer: kenmerk of referentienummer (bijv. "M2603 0024"), of leeg als niet aanwezig
- adres: volledig werklocatie-adres (straat + huisnummer + postcode + plaats)
- ruimte: ruimtenummer zoals letterlijk vermeld in de bon, vaak aangeduid als "ruimtenummer", "ruimte", "lokaal" of "kamer" (bijv. "3.12", "hal 2e verdieping"). Geef de exacte waarde terug, of leeg als niet aanwezig. BELANGRIJK: verwerk het ruimtenummer ALLEEN hier, nooit in omschrijving
- opdrachtgever: de organisatie die de opdracht verleent aan Compier. Dit is NOOIT Compier zelf. Kijk naar de afzender, de ondertekening of de organisatienaam bij het adres van de opdrachtgever. Gebruik de overkoepelende naam, niet een afdeling zoals 'Servicedesk Facilitair'.
- contact: de naam die onder "Met vriendelijke groet" staat (de ondertekenaar) plus diens telefoonnummer, formaat "Naam — telefoonnummer"
- aanmelder: de contactpersoon op de werklocatie (bijv. vermeld als "Naam aanmelder" of "contactpersoon ter plaatse"), formaat "Naam — telefoonnummer"
- omschrijving: volledige omschrijving van de werkzaamheden of gevraagde offerte, max 400 tekens. Vermeld hier GEEN ruimtenummer (dat gaat in het ruimte-veld)
- status: bepaal zelf op basis van de tekst: "offerte" als het een prijsaanvraag of offerteverzoek is, "lopend" als het een opdracht of werkopdracht is
- schilder: true als de werkzaamheden (deels) schilderwerk betreffen (verven, schilderen, lakken, coating, behangen) of als er RAL-kleurnummers worden genoemd (bijv. RAL 9010), anders false
Tekst:
${tekst.substring(0, 4000)}`
        }]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const raw    = data.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    const geldig = ['offerte','lopend','wacht','wacht-reactie','wacht-akkoord','klaar'];
    if (parsed.status && geldig.includes(parsed.status)) document.getElementById('f-status').value = parsed.status;
    if (parsed.schilder === true) document.getElementById('f-schilder').checked = true;
    if (parsed.nummer)        document.getElementById('f-nummer').value = parsed.nummer;
    if (parsed.adres)         document.getElementById('f-adres').value = parsed.adres;
    if (parsed.ruimte)        document.getElementById('f-ruimte').value = parsed.ruimte;
    if (parsed.opdrachtgever) document.getElementById('f-opdrachtgever').value = parsed.opdrachtgever;
    if (parsed.contact)       document.getElementById('f-contact').value = parsed.contact;
    if (parsed.aanmelder)     document.getElementById('f-aanmelder').value = parsed.aanmelder;
    if (parsed.omschrijving)  document.getElementById('f-notitie').value = parsed.omschrijving;
    resultEl.textContent = `✓ Uitgelezen: ${parsed.nummer || '?'} — ${parsed.adres || '?'}`;
    resultEl.className = 'ai-result show';
  } catch(err) {
    resultEl.textContent = 'Fout bij uitlezen: ' + err.message;
    resultEl.className = 'ai-result show error';
  } finally {
    document.getElementById('ai-loading').classList.remove('show');
    btn.disabled = false;
  }
}

// ── Filter & render helpers ───────────────────────────────
function getFiltered() {
  return projecten.filter(p => {
    const matchFilter = activeFilter === 'alle' || p.status === activeFilter ||
      (activeFilter === 'wacht' && p.status?.startsWith('wacht')) ||
      (activeFilter === 'schilder' && p.schilder === true);
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || [p.nummer, p.adres, p.ruimte, p.opdrachtgever, p.actie, p.notitie, p.contact]
      .some(v => (v||'').toLowerCase().includes(q));
    return matchFilter && matchSearch;
  }).sort((a, b) => {
    let av = a[sortKey] || '', bv = b[sortKey] || '';
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

function dateClass(ds) {
  if (!ds) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = (new Date(ds) - today) / 86400000;
  return diff < 0 ? 'urgent' : diff <= 3 ? 'soon' : '';
}

function fmt(ds) {
  if (!ds) return '';
  const hasTime = ds.includes('T');
  const [y, m, d] = ds.slice(0, 10).split('-');
  return hasTime ? `${d}-${m}-${y} ${ds.slice(11, 16)}` : `${d}-${m}-${y}`;
}

// ── Render ────────────────────────────────────────────────
function render() {
  const data = getFiltered();
  document.getElementById('stat-lopend').textContent = projecten.filter(p => p.status === 'lopend').length;
  document.getElementById('stat-wacht').textContent  = projecten.filter(p => p.status?.startsWith('wacht')).length;
  document.getElementById('stat-totaal').textContent = projecten.filter(p => p.status !== 'klaar').length;
  const empty = document.getElementById('empty');
  const tbody = document.getElementById('tbody');
  if (data.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; }
  else {
    empty.style.display = 'none';
    tbody.innerHTML = data.map(p => `
      <tr onclick="openModal(${p.id})">
        <td>
          <div class="proj-num">${p.nummer}</div>
          ${p.schilder ? '<span class="schilder-badge">🖌 Schilder</span>' : ''}
        </td>
        <td>
          <div class="proj-addr">${p.adres}</div>
          ${p.notitie ? `<div class="proj-client">${p.notitie.substring(0,55)}${p.notitie.length>55?'…':''}</div>` : ''}
        </td>
        <td><div class="proj-client">${p.ruimte || '—'}</div></td>
        <td>
          <div style="font-size:13px">${p.opdrachtgever}</div>
          ${p.contact ? `<div class="proj-client">${p.contact.split('—')[0].trim()}</div>` : ''}
        </td>
        <td><span class="status-badge ${STATUS_CLASS[p.status]}"><span class="status-dot"></span>${STATUS_LABELS[p.status]}</span></td>
        <td>
          ${p.status === 'klaar' ? '' : `
            <div class="actie-cell">${p.actie || '—'}</div>
            ${p.datum ? `<div class="actie-date ${dateClass(p.datum)}">${fmt(p.datum)}</div>` : ''}
          `}
        </td>
      </tr>`).join('');
  }
  document.getElementById('cards').innerHTML = data.map(p => `
    <div class="card" onclick="openModal(${p.id})">
      <div class="card-top">
        <span class="card-num">${p.nummer}</span>
        <div style="display:flex;align-items:center;gap:6px">
          ${p.schilder ? '<span class="schilder-badge">🖌 Schilder</span>' : ''}
          <span class="status-badge ${STATUS_CLASS[p.status]}"><span class="status-dot"></span>${STATUS_LABELS[p.status]}</span>
        </div>
      </div>
      <div class="card-addr">${p.adres}</div>
      <div class="card-client">${p.opdrachtgever}${p.contact ? ' · ' + p.contact.split('—')[0].trim() : ''}</div>
      ${p.notitie ? `<div class="card-actie" style="color:var(--muted);font-size:12px;margin-bottom:6px">${p.notitie.substring(0,80)}…</div>` : ''}
      ${p.status !== 'klaar' && p.actie ? `<div class="card-actie">${p.actie}</div>` : ''}
      ${(p.status !== 'klaar' && p.datum) || p.ruimte ? `<div class="card-footer">
        ${p.status !== 'klaar' && p.datum ? `<span class="card-date ${dateClass(p.datum)}">${fmt(p.datum)}</span>` : '<span></span>'}
        ${p.ruimte ? `<span class="card-ruimte">${p.ruimte}</span>` : ''}
      </div>` : ''}
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:20px 0">Geen projecten gevonden.</div>';
}

function sortBy(key) {
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
  render();
}

// ── Filter knoppen ────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    updateStatHighlight();
    render();
  });
});

function setStatFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  updateStatHighlight();
  render();
}

function updateStatHighlight() {
  document.getElementById('stat-lopend-wrap').classList.toggle('active', activeFilter === 'lopend');
  document.getElementById('stat-wacht-wrap').classList.toggle('active', activeFilter === 'wacht');
  document.getElementById('stat-totaal-wrap').classList.toggle('active', activeFilter === 'alle');
}

// ── Zoekbalk ──────────────────────────────────────────────
document.getElementById('search').addEventListener('input', e => {
  searchQuery = e.target.value;
  document.getElementById('search-clear').style.display = searchQuery ? 'block' : 'none';
  render();
});

function clearSearch() {
  document.getElementById('search').value = '';
  document.getElementById('search-clear').style.display = 'none';
  searchQuery = '';
  render();
}

// ── Modal ─────────────────────────────────────────────────
function openModal(id) {
  editingId = id || null;
  const isNew = !id;
  document.getElementById('upload-section').style.display = isNew ? 'block' : 'none';
  document.getElementById('modal-title').textContent = isNew ? 'NIEUWE OPDRACHT' : 'OPDRACHT BEWERKEN';
  document.getElementById('btn-delete').style.display = isNew ? 'none' : 'block';
  document.getElementById('btn-deel').style.display   = isNew ? 'none' : 'block';
  document.getElementById('ai-result').className = 'ai-result';
  document.getElementById('ai-loading').classList.remove('show');
  if (id) {
    const p = projecten.find(x => x.id === id);
    if (!p) { console.warn('openModal: project niet gevonden voor id', id); return; }
    document.getElementById('f-nummer').value = p.nummer;
    document.getElementById('f-adres').value = p.adres;
    document.getElementById('f-ruimte').value = p.ruimte || '';
    document.getElementById('f-opdrachtgever').value = p.opdrachtgever;
    document.getElementById('f-status').value = p.status;
    onStatusChange(p.status);
    document.getElementById('f-actie').value = p.actie || '';
    document.getElementById('f-datum').value = p.datum || '';
    document.getElementById('f-contact').value = p.contact || '';
    document.getElementById('f-aanmelder').value = p.aanmelder || '';
    document.getElementById('f-notitie').value = p.notitie || '';
    document.getElementById('f-schilder').checked = !!p.schilder;
    document.getElementById('f-toegewezen').value = p.toegewezen_aan || '';
    renderActieLog(p.acties_log || []);
    document.querySelectorAll('.actie-chip').forEach(c => {
      c.classList.toggle('selected', c.textContent === (p.actie || ''));
    });
    toonLogo(p.opdrachtgever);
    const sectie = document.getElementById('deuren-sectie');
    sectie.style.display = 'block';
    document.getElementById('deuren-tool-btn').setAttribute('data-url', 'https://flixinc.github.io/deuren/?m=' + encodeURIComponent(p.nummer));
    laadDeuren(p.nummer);
  } else {
    ['f-nummer','f-adres','f-ruimte','f-opdrachtgever','f-actie','f-contact','f-aanmelder','f-notitie'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('f-schilder').checked = false;
    document.getElementById('f-toegewezen').value = '';
    document.getElementById('f-status').value = 'lopend';
    onStatusChange('lopend');
    document.getElementById('f-datum').value = '';
    const bonTekst = document.getElementById('bon-tekst'); if (bonTekst) bonTekst.value = '';
    renderActieLog([]);
    document.querySelectorAll('.actie-chip').forEach(c => c.classList.remove('selected'));
    toonLogo('');
    document.getElementById('deuren-sectie').style.display = 'none';
  }
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  editingId = null;
}

document.getElementById('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Deuren ────────────────────────────────────────────────
async function laadDeuren(nummer) {
  const lijst = document.getElementById('deuren-lijst');
  lijst.innerHTML = '<div class="deuren-loading">Laden…</div>';
  try {
    const data = await sbFetch(`deuren?m_nummer=eq.${encodeURIComponent(nummer)}&order=deur_nr.asc`);
    renderDeuren(data || []);
  } catch(e) {
    lijst.innerHTML = '<div class="deuren-leeg">Kon deuren niet laden.</div>';
  }
}

function renderDeuren(deuren) {
  const lijst = document.getElementById('deuren-lijst');
  if (deuren.length === 0) { lijst.innerHTML = '<div class="deuren-leeg">Nog geen deuren ingemeten voor dit project.</div>'; return; }
  lijst.innerHTML = deuren.map(d => {
    const maat = d.breedte && d.hoogte ? `${d.breedte} × ${d.hoogte}` : '—';
    const ing  = d.status === 'ingemeten';
    return `<div class="deuren-item">
      <span class="deuren-item-nr">${d.deur_nr}</span>
      <span class="deuren-item-naam">${d.naam || 'Deur ' + d.deur_nr}</span>
      <span class="deuren-item-maat">${maat}</span>
      <span class="deuren-item-status ${ing ? 'ds-ingemeten' : 'ds-open'}">${ing ? 'Ingemeten' : 'Open'}</span>
    </div>`;
  }).join('');
}

// ── Agenda (.ics) ─────────────────────────────────────────
function agendaPunt() {
  const actie   = document.getElementById('f-actie').value.trim();
  const datum   = document.getElementById('f-datum').value;
  const nummer  = document.getElementById('f-nummer').value.trim();
  const adres   = document.getElementById('f-adres').value.trim();
  const notitie = document.getElementById('f-notitie').value.trim();
  if (!actie) { alert('Vul eerst een volgende actie in.'); return; }
  if (!datum) { alert('Vul eerst een datum in.'); return; }
  const hasTime = datum.includes('T') && datum.length > 10;
  const titel = (nummer ? nummer + ' — ' : '') + actie;
  const omschrijving = [adres, notitie].filter(Boolean).join('\n').replace(/\n/g, '\\n');
  const uid = Date.now() + '@compier';
  let dtStart, dtEnd;
  if (hasTime) {
    dtStart = datum.slice(0,16).replace(/[-:T]/g, (c) => c === 'T' ? 'T' : '') + '00';
    const endDate = new Date(datum); endDate.setHours(endDate.getHours() + 1);
    dtEnd = endDate.toISOString().slice(0,16).replace(/[-:T]/g, (c) => c === 'T' ? 'T' : '') + '00';
  } else {
    dtStart = 'VALUE=DATE:' + datum.replace(/-/g,'');
    const nextDay = new Date(datum); nextDay.setDate(nextDay.getDate() + 1);
    dtEnd = 'VALUE=DATE:' + nextDay.toISOString().slice(0,10).replace(/-/g,'');
  }
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compier//Dashboard//NL',
    'BEGIN:VEVENT', 'UID:' + uid,
    hasTime ? 'DTSTART:' + dtStart : 'DTSTART;' + dtStart,
    hasTime ? 'DTEND:'   + dtEnd   : 'DTEND;'   + dtEnd,
    'SUMMARY:' + titel,
    omschrijving ? 'DESCRIPTION:' + omschrijving : '',
    adres ? 'LOCATION:' + adres : '',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = (nummer || 'compier') + '.ics'; a.click();
  URL.revokeObjectURL(url);
  const btn = document.getElementById('btn-agenda');
  btn.textContent = '✓'; btn.classList.add('success');
  setTimeout(() => { btn.textContent = '📅'; btn.classList.remove('success'); }, 2000);
}

// ── Opslag berekening ─────────────────────────────────────
function toggleWR() {
  const panel = document.getElementById('wr-panel');
  const btn   = document.querySelector('.wr-btn');
  const open  = panel.style.display === 'none';
  if (open) { document.getElementById('ral-panel').style.display = 'none'; document.getElementById('ral-btn').classList.remove('active'); }
  panel.style.display = open ? 'block' : 'none';
  btn.classList.toggle('active', open);
  if (open) document.getElementById('wr-bedrag').focus();
}

function berekenWR() {
  const bedrag = parseFloat(document.getElementById('wr-bedrag').value) || 0;
  const fmt = v => bedrag ? '€ ' + v.toFixed(2).replace('.', ',') : '—';
  document.getElementById('wr-ak').textContent = fmt(bedrag * 0.10);
  document.getElementById('wr-wr').textContent = fmt(bedrag * 0.05);
}

function kopieelRij(omschrijving, pct) {
  const bedrag = parseFloat(document.getElementById('wr-bedrag').value) || 0;
  if (!bedrag) { toonWRCopied('Vul eerst een bedrag in'); return; }
  const val = (bedrag * pct / 100).toFixed(2).replace('.', ',');
  navigator.clipboard.writeText(`${omschrijving}\t${pct}%\t€ ${val}`);
  toonWRCopied('✓ Gekopieerd');
}

function kopieelAlles() {
  const bedrag = parseFloat(document.getElementById('wr-bedrag').value) || 0;
  if (!bedrag) { toonWRCopied('Vul eerst een bedrag in'); return; }
  const ak = (bedrag * 0.10).toFixed(2).replace('.', ',');
  const wr = (bedrag * 0.05).toFixed(2).replace('.', ',');
  navigator.clipboard.writeText(`Algemene kosten\t10%\t€ ${ak}\nWinst & Risico\t5%\t€ ${wr}`);
  toonWRCopied('✓ Beide regels gekopieerd');
}

function toonWRCopied(msg) {
  const el = document.getElementById('wr-copied');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Status & actie chips ──────────────────────────────────
const WACHT_ACTIES = ['Wachten op reactie', 'Wachten op akkoord', 'Wachten op materiaal'];

function onStatusChange(status) {
  const isKlaar = status === 'klaar';
  document.getElementById('actie-sectie').style.display = isKlaar ? 'none' : '';
  document.getElementById('datum-sectie').style.display = isKlaar ? 'none' : '';
  if (isKlaar) {
    document.getElementById('f-actie').value = '';
    document.getElementById('f-datum').value = '';
    document.querySelectorAll('.actie-chip').forEach(c => c.classList.remove('selected'));
  }
}

function kiesActie(tekst) {
  document.getElementById('f-actie').value = tekst;
  document.querySelectorAll('.actie-chip').forEach(c => c.classList.toggle('selected', c.textContent === tekst));
  const statusEl = document.getElementById('f-status');
  if (WACHT_ACTIES.includes(tekst)) { statusEl.value = 'wacht'; }
  else if (statusEl.value === 'wacht') { statusEl.value = 'lopend'; }
}

function renderActieLog(log) {
  const wrap  = document.getElementById('actie-log');
  const items = document.getElementById('actie-log-items');
  if (!log || log.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  items.innerHTML = log.map(l => `
    <div class="actie-log-item">
      <span class="actie-log-datum">${l.datum ? fmt(l.datum) : '—'}</span>
      <span class="actie-log-tekst">${l.actie || ''}</span>
    </div>`).join('');
}

// ── Project CRUD ──────────────────────────────────────────
async function saveProject() {
  const p = {
    nummer:        document.getElementById('f-nummer').value.trim(),
    adres:         document.getElementById('f-adres').value.trim(),
    ruimte:        document.getElementById('f-ruimte').value.trim(),
    opdrachtgever: document.getElementById('f-opdrachtgever').value.trim(),
    status:        document.getElementById('f-status').value,
    actie:         document.getElementById('f-actie').value.trim(),
    datum:         document.getElementById('f-datum').value,
    contact:       document.getElementById('f-contact').value.trim(),
    aanmelder:     document.getElementById('f-aanmelder').value.trim(),
    notitie:        document.getElementById('f-notitie').value.trim(),
    schilder:       document.getElementById('f-schilder').checked,
    toegewezen_aan: document.getElementById('f-toegewezen').value,
  };
  if (!p.nummer || !p.adres) { alert('Vul minimaal kenmerk en adres in.'); return; }
  const dubbel = projecten.find(x => x.nummer.trim().toLowerCase() === p.nummer.toLowerCase() && x.id !== editingId);
  if (dubbel) {
    alert(`⚠️ Kenmerk "${p.nummer}" bestaat al bij:\n${dubbel.adres}${dubbel.ruimte ? ' · ' + dubbel.ruimte : ''} — ${dubbel.opdrachtgever}`);
    return;
  }
  if (editingId) {
    const idx      = projecten.findIndex(x => x.id === editingId);
    const bestaand = projecten[idx];
    let log = Array.isArray(bestaand.acties_log) ? [...bestaand.acties_log] : [];
    if (bestaand.actie && (bestaand.actie !== p.actie || bestaand.datum !== p.datum)) {
      log.unshift({ actie: bestaand.actie, datum: bestaand.datum || '' });
      if (log.length > 5) log = log.slice(0, 5);
    }
    p.acties_log = log;
    projecten[idx] = { ...bestaand, ...p };
    await slaOpInDb(projecten[idx]);
  } else {
    const nieuw = { id: nextId++, ...p, acties_log: [] };
    projecten.push(nieuw);
    await slaOpInDb(nieuw);
  }
  closeModal();
  render();
}

async function deleteProject() {
  if (!confirm('Project verwijderen?')) return;
  await verwijderUitDb(editingId);
  projecten = projecten.filter(x => x.id !== editingId);
  closeModal();
  render();
}

// ── Tab navigatie ─────────────────────────────────────────
let activeTab = 'projecten';
let locatiesInitialized = false;

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('view-projecten').style.display = tab === 'projecten' ? '' : 'none';
  document.getElementById('view-kalender').style.display  = tab === 'kalender'   ? '' : 'none';
  const locView = document.getElementById('view-locaties');
  locView.classList.toggle('active', tab === 'locaties');
  document.getElementById('tab-projecten').classList.toggle('active', tab === 'projecten');
  document.getElementById('tab-locaties').classList.toggle('active', tab === 'locaties');
  document.getElementById('tab-kalender').classList.toggle('active', tab === 'kalender');
  if (tab === 'locaties') {
    if (!locatiesInitialized) { locatiesInitialized = true; setTimeout(initLocatiesTab, 50); }
    else if (locatieMap) { setTimeout(() => locatieMap.invalidateSize(), 50); }
  }
  if (tab === 'kalender') renderKalender();
}

// ── Locaties + Kaart ──────────────────────────────────────
let LOCATIES = [];
let locatieMap = null;
let locatieMarkers = {};
let selectedLocId = null;
let locTypeFilter = 'alle';
let locSearchQuery = '';
let geocodeCache = {};
let geocodeQueue = [];
let geocodingActive = false;

try {
  const cached = JSON.parse(localStorage.getItem('compier_geo_cache') || '{}');
  if (cached.__v !== 3) { geocodeCache = {}; }
  else { geocodeCache = cached; }
} catch(e) {}

async function initLocatiesTab() {
  if (!window.L) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    document.head.appendChild(s);
    await new Promise(r => { s.onload = r; });
  }
  if (!sbUrl || !sbKey) {
    document.getElementById('loc-body').innerHTML = '<div class="loc-error">Supabase nog niet ingesteld. Vul eerst de API-gegevens in.</div>';
    return;
  }
  try {
    const data = await sbFetch('locaties?order=naam.asc');
    LOCATIES = Array.isArray(data) ? data : [];
  } catch(e) {
    document.getElementById('loc-body').innerHTML = `<div class="loc-error">Laden mislukt: ${e.message}<br>Controleer of de tabel 'locaties' bestaat in Supabase.</div>`;
    return;
  }
  bouwLocBody();
  buildMap();
  renderLocatieLijst();
  startGeocode();
  setTimeout(() => { if (locatieMap) locatieMap.invalidateSize(); }, 300);
}

function bouwLocBody() {
  document.getElementById('loc-body').innerHTML = `
    <div class="loc-list" id="loc-list"><div class="loc-count" id="loc-count">—</div></div>
    <div id="loc-map"></div>
    <div class="geo-status hidden" id="geo-status"></div>
  `;
}

let activeLayer = null;
const TILE_LAYERS = {
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© <a href="https://openstreetmap.org">OSM</a> © <a href="https://carto.com">CARTO</a>', label: '🌑 Dark' },
  satelliet: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© <a href="https://www.esri.com">Esri</a>', label: '🛰 Satelliet' },
  straten:   { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr: '© <a href="https://openstreetmap.org">OSM</a> © <a href="https://carto.com">CARTO</a>', label: '🗺 Straten' }
};

function buildMap() {
  if (locatieMap) return;
  locatieMap = L.map('loc-map', { zoomControl: true, attributionControl: true }).setView([52.505, 4.97], 11);
  setMapLayer('satelliet');
  const ctrl = L.control({ position: 'topright' });
  ctrl.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-layer-ctrl');
    div.innerHTML = Object.entries(TILE_LAYERS).map(([key, val]) =>
      `<button class="map-layer-btn${key==='satelliet'?' active':''}" data-layer="${key}" onclick="setMapLayer('${key}')">${val.label}</button>`
    ).join('');
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  ctrl.addTo(locatieMap);
  LOCATIES.forEach(loc => {
    const key = geoKey(loc);
    if (geocodeCache[key]) addMarker(loc, geocodeCache[key].lat, geocodeCache[key].lng);
  });
}

function setMapLayer(key) {
  if (activeLayer) locatieMap.removeLayer(activeLayer);
  const cfg = TILE_LAYERS[key];
  activeLayer = L.tileLayer(cfg.url, { attribution: cfg.attr, maxZoom: 19 });
  activeLayer.addTo(locatieMap);
  document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === key));
}

function geoKey(loc) {
  return (loc.adres + ' ' + (loc.postcode||'') + ' ' + (loc.plaats||'')).trim();
}

function addMarker(loc, lat, lng) {
  if (locatieMarkers[loc.id]) return;
  const color = loc.type === 'dagbesteding' ? '#4a90d9' : '#4caf6e';
  const icon  = L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid rgba(0,0,0,0.4);box-shadow:0 0 6px ${color}88;"></div>`,
    iconSize: [12,12], iconAnchor: [6,6], popupAnchor: [0,-10]
  });
  const marker = L.marker([lat,lng], { icon }).addTo(locatieMap);
  const telLink = t => `tel:${t.replace(/[^\d+]/g,'')}`;
  const telLine = loc.tel ? `<div class="popup-tel"><a href="${telLink(loc.tel)}">${loc.tel}</a></div>` : '';
  const mobLine = loc.mob ? `<div class="popup-mob"><a href="${telLink(loc.mob)}">${loc.mob}</a></div>` : '';
  const subs    = Array.isArray(loc.subgroepen) ? loc.subgroepen : [];
  const subHtml = subs.length ? `
    <div style="margin-top:8px;border-top:1px solid #333;padding-top:6px;">
      ${subs.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px;">
          <span style="font-size:11px;color:#aaa;">${s.naam||'—'}</span>
          ${s.mob ? `<a href="${telLink(s.mob)}" style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#e87722;text-decoration:none;">${s.mob}</a>` : ''}
        </div>`).join('')}
    </div>` : '';
  marker.bindPopup(`
    <div class="popup-naam">${loc.naam}</div>
    <div class="popup-adres">${loc.adres||''}, ${loc.postcode||''} ${loc.plaats||''}</div>
    ${telLine}${mobLine}${subHtml}
  `, { maxWidth: 260 });
  marker.on('click', () => selectLocatie(loc.id, false));
  locatieMarkers[loc.id] = marker;
}

async function pdokGeocode(adres, postcode, plaats) {
  const q   = encodeURIComponent(`${adres} ${postcode||''} ${plaats||''}`);
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${q}&rows=1&fl=centroide_ll,weergavenaam`;
  const res = await fetch(url);
  const data = await res.json();
  const docs = data?.response?.docs;
  if (docs && docs[0] && docs[0].centroide_ll) {
    const m = docs[0].centroide_ll.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
    if (m) return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  }
  return null;
}

async function startGeocode() {
  geocodeQueue = LOCATIES.filter(loc => !geocodeCache[geoKey(loc)]);
  if (!geocodeQueue.length) { updateGeoStatus(0); return; }
  if (geocodingActive) return;
  geocodingActive = true;
  let remaining = geocodeQueue.length;
  for (const loc of geocodeQueue) {
    const key = geoKey(loc);
    if (geocodeCache[key]) { remaining--; updateGeoStatus(remaining); continue; }
    updateGeoStatus(remaining);
    try {
      const result = await pdokGeocode(loc.adres, loc.postcode, loc.plaats);
      if (result) {
        geocodeCache[key] = result;
        geocodeCache.__v  = 3;
        try { localStorage.setItem('compier_geo_cache', JSON.stringify(geocodeCache)); } catch(e) {}
        addMarker(loc, result.lat, result.lng);
      }
    } catch(e) {}
    remaining--;
    updateGeoStatus(remaining);
    await new Promise(r => setTimeout(r, 150));
  }
  geocodingActive = false;
  updateGeoStatus(0);
}

function updateGeoStatus(remaining) {
  const el = document.getElementById('geo-status');
  if (!el) return;
  if (remaining <= 0) { el.classList.add('hidden'); }
  else { el.classList.remove('hidden'); el.textContent = `📍 ${remaining} locaties laden…`; }
}

function renderLocatieLijst() {
  const q = locSearchQuery.toLowerCase();
  const gefilterd = LOCATIES.filter(loc => {
    if (locTypeFilter !== 'alle' && loc.type !== locTypeFilter) return false;
    if (q) {
      const zoek = [loc.naam,loc.adres,loc.postcode,loc.plaats,loc.tel,loc.mob].join(' ').toLowerCase();
      if (!zoek.includes(q)) return false;
    }
    return true;
  });
  const telTxt = loc => {
    const nr = loc.mob || loc.tel;
    if (!nr) return '—';
    return `<a href="tel:${nr.replace(/[^\d+]/g,'')}" style="color:var(--orange);text-decoration:none;">${nr}</a>`;
  };
  const subTxt = loc => {
    const subs = Array.isArray(loc.subgroepen) ? loc.subgroepen : [];
    if (!subs.length) return '';
    return `<div style="font-size:11px;color:#666;margin-top:2px;">${subs.length} groep${subs.length!==1?'en':''}</div>`;
  };
  const items = gefilterd.map(loc => `
    <div class="loc-item${selectedLocId===loc.id?' selected':''}" onclick="selectLocatie(${loc.id},true)" id="loc-item-${loc.id}">
      <div><span class="loc-type-tag ${loc.type}">${loc.type}</span></div>
      <div class="loc-item-naam">${loc.naam}</div>
      <div class="loc-item-adres">${loc.adres||''}, ${loc.postcode||''} ${loc.plaats||''}</div>
      <div class="loc-item-tel">${telTxt(loc)}${subTxt(loc)}</div>
    </div>`).join('');
  const listEl = document.getElementById('loc-list');
  if (!listEl) return;
  listEl.innerHTML = `<div class="loc-count" id="loc-count">${gefilterd.length} locatie${gefilterd.length!==1?'s':''}</div>${items || '<div class="loc-error">Geen resultaten</div>'}`;
  const clr = document.getElementById('loc-search-clear');
  if (clr) clr.style.display = q ? 'block' : 'none';
}

function selectLocatie(id, flyTo) {
  selectedLocId = id;
  renderLocatieLijst();
  const marker = locatieMarkers[id];
  if (marker && flyTo && locatieMap) {
    locatieMap.flyTo(marker.getLatLng(), 16, { duration: 0.8 });
    setTimeout(() => marker.openPopup(), 900);
  } else if (marker) { marker.openPopup(); }
  setTimeout(() => {
    const el = document.getElementById('loc-item-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

function filterLocaties() {
  locSearchQuery = document.getElementById('loc-search').value;
  renderLocatieLijst();
}

function clearLocSearch() {
  document.getElementById('loc-search').value = '';
  locSearchQuery = '';
  renderLocatieLijst();
}

function setLocType(type) {
  locTypeFilter = type;
  document.querySelectorAll('.loc-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type===type));
  renderLocatieLijst();
}

// ── Accentkleur ───────────────────────────────────────────
const ACCENTS = [
  { color:'#E8611A', dim:'#b54c12', name:'Oranje' },
  { color:'#2563EB', dim:'#1a4fc4', name:'Blauw' },
  { color:'#16A34A', dim:'#0f7a37', name:'Groen' },
  { color:'#9333EA', dim:'#7519d0', name:'Paars' },
  { color:'#DC2626', dim:'#b01c1c', name:'Rood' },
  { color:'#0891B2', dim:'#066c8a', name:'Cyaan' },
  { color:'#CA8A04', dim:'#9a6803', name:'Goud' },
];

function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}`;
}

function darkenHex(hex, factor) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return '#' + [r,g,b].map(v => Math.round(v*factor).toString(16).padStart(2,'0')).join('');
}

function setAccent(color, dim) {
  if (!dim) dim = darkenHex(color, 0.78);
  document.documentElement.style.setProperty('--orange', color);
  document.documentElement.style.setProperty('--orange-rgb', hexToRgb(color));
  document.documentElement.style.setProperty('--orange-dim', dim);
  const dot = document.getElementById('accent-dot');
  if (dot) dot.style.background = color;
  const custom = document.getElementById('accent-custom');
  if (custom) custom.value = color;
  document.querySelectorAll('.accent-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === color));
  localStorage.setItem('compier_accent', color);
  localStorage.setItem('compier_accent_dim', dim);
}

function toggleAccentPanel() {
  document.getElementById('accent-panel').classList.toggle('open');
}

function initAccentSwatches() {
  const wrap = document.getElementById('accent-swatches');
  wrap.innerHTML = ACCENTS.map(a =>
    `<div class="accent-swatch" style="background:${a.color}" data-color="${a.color}" title="${a.name}" onclick="setAccent('${a.color}','${a.dim}')"></div>`
  ).join('');
  const saved    = localStorage.getItem('compier_accent');
  const savedDim = localStorage.getItem('compier_accent_dim');
  setAccent(saved || '#E8611A', savedDim || '#b54c12');
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('accent-wrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('accent-panel').classList.remove('open');
});

// ── Thema ─────────────────────────────────────────────────
function toggleTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  localStorage.setItem('compier_theme', isLight ? 'light' : 'dark');
}

(function initTheme() {
  const saved = localStorage.getItem('compier_theme');
  if (saved === 'light') {
    document.body.classList.add('light');
    const tog = document.getElementById('theme-toggle');
    if (tog) tog.checked = true;
  }
})();

// ── RAL + Farrow & Ball kleuren ───────────────────────────
const RAL_DB=[
  [1000,'Groenbeige','#CDBA88'],[1001,'Beige','#D0B084'],[1002,'Zandgeel','#D3AA6D'],
  [1003,'Signaalgeel','#F9A800'],[1004,'Goudgeel','#E49E00'],[1005,'Honinggeel','#CB8E00'],
  [1006,'Maisgeel','#EE9D00'],[1007,'Narcissengeel','#EE9C00'],[1011,'Bruinbeige','#A07A4A'],
  [1012,'Citroengeel','#E6C14F'],[1013,'Parelwit','#EFE5D3'],[1014,'Ivoor','#F0CE8F'],
  [1015,'Lichtivoor','#EED9B0'],[1016,'Zwavengeel','#FFEF36'],[1017,'Saffraangeel','#FFC846'],
  [1018,'Zinkgeel','#FFEA33'],[1019,'Grijsbeige','#A1906E'],[1020,'Olijfgeel','#A1905C'],
  [1021,'Koolzaadgeel','#FFCD19'],[1023,'Verkeersgeel','#FFCB15'],[1024,'Okergeel','#C99C58'],
  [1026,'Briljantgeel','#FFF722'],[1027,'Currygeel','#AE8829'],[1028,'Meloengeel','#F4A61E'],
  [1032,'Bremgeel','#F3B320'],[1033,'Dahliageel','#F6A323'],[1034,'Pastelgeel','#F3AE5B'],
  [1035,'Parelbeige','#725D4A'],[1036,'Parelgoud','#6B5034'],[1037,'Zonnegeel','#F59E2A'],
  [2000,'Geeloranje','#DB6E00'],[2001,'Roodoranje','#B04321'],[2002,'Vermiljoen','#BB3628'],
  [2003,'Pasteloranje','#F2760E'],[2004,'Zuiver oranje','#EC5216'],[2005,'Briljantoranje','#ED3F15'],
  [2007,'Briljantlichtoranje','#FF9422'],[2008,'Helderlichtoranje','#F0651A'],[2009,'Verkeersoranje','#EA4B1A'],
  [2010,'Signaloranje','#C44B28'],[2011,'Dieporanje','#EB7516'],[2012,'Zalmoranje','#D05840'],
  [2013,'Parloranje','#A64C3C'],[3000,'Vuurrood','#A72920'],[3001,'Signaalrood','#9E231A'],
  [3002,'Karmijnrood','#9E201C'],[3003,'Robijnrood','#8C1724'],[3004,'Purperrood','#7A1825'],
  [3005,'Wijnrood','#641C26'],[3007,'Zwart-rood','#471F23'],[3009,'Oxiderood','#7A2B2A'],
  [3011,'Bruinrood','#842424'],[3012,'Beigerood','#C97F6E'],[3013,'Tomaatrood','#9A2522'],
  [3014,'Antiekroze','#BD6F70'],[3015,'Lichtroze','#D8ACB1'],[3016,'Koraaltje rood','#BD4231'],
  [3017,'Roze','#D96A6A'],[3018,'Aardbeirood','#CA4046'],[3020,'Verkeersrood','#C03126'],
  [3022,'Zalm-rood','#D57463'],[3024,'Briljant rood','#E93B32'],[3026,'Briljantlicht rood','#F04632'],
  [3027,'Framboosrood','#AA2A3B'],[3028,'Zuiver rood','#C73025'],[3031,'Oriënt rood','#A32C2E'],
  [3032,'Parelborstelrood','#942A23'],[3033,'Parloze roze','#C2584E'],[4001,'Roodlila','#816083'],
  [4002,'Roodviolet','#8A415E'],[4003,'Heideroze','#BD608F'],[4004,'Bordeauxviolet','#5D2A42'],
  [4005,'Blauwlila','#6A6B92'],[4006,'Verkeerspaars','#913569'],[4007,'Purperviolet','#4B2A45'],
  [4008,'Signaalviolet','#8C4476'],[4009,'Pastellilla','#AC8DA4'],[4010,'Telemagenta','#BC477A'],
  [4011,'Parel doorschijnend lila','#7E789A'],[4012,'Parel braambes','#6E6D89'],[5000,'Violetblauw','#1D5179'],
  [5001,'Groenblauw','#024E6B'],[5002,'Ultramarijnblauw','#003F87'],[5003,'Saffier blauw','#21405E'],
  [5004,'Zwartblauw','#222B3D'],[5005,'Signaalblauw','#005289'],[5007,'Briljant blauw','#2E678E'],
  [5008,'Grijs blauw','#344D61'],[5009,'Azuurblauw','#1E6580'],[5010,'Gentiaanblauw','#084C80'],
  [5011,'Staalblauw','#21324A'],[5012,'Lichtblauw','#3B8FBA'],[5013,'Kobaltblauw','#1F416E'],
  [5014,'Duivenblauw','#5683A0'],[5015,'Hemelsblauw','#007CB0'],[5017,'Verkeersblauw','#005F89'],
  [5018,'Turkooisgroen','#31858E'],[5019,'Capriblauw','#015D7D'],[5020,'Oceaanblauw','#184756'],
  [5021,'Waterblauw','#1D7386'],[5022,'Nachtblauw','#203556'],[5023,'Verre blauw','#446D8E'],
  [5024,'Pastelblauw','#669EB8'],[5025,'Parel gentiaanblauw','#3A6183'],[5026,'Parel nacht blauw','#29405B'],
  [6000,'Patinalroen','#3B7460'],[6001,'Smaragdgroen','#316541'],[6002,'Bladgroen','#32613F'],
  [6003,'Olijfgroen','#576247'],[6004,'Blauwgroen','#26504B'],[6005,'Mosgroen','#33523D'],
  [6006,'Grijs olijf','#505645'],[6007,'Flessegroen','#364A36'],[6008,'Bruingroen','#3E4536'],
  [6009,'Dennengroen','#31493C'],[6010,'Grasgroen','#496F3F'],[6011,'Resedagroen','#6E875F'],
  [6012,'Zwartgroen','#394B44'],[6013,'Rietgroen','#878961'],[6014,'Geelgroen','#625D4C'],
  [6015,'Zwart olijfgroen','#464B41'],[6016,'Turkooisgroen','#367863'],[6017,'Geelgroen','#5E8348'],
  [6018,'Geelgroen licht','#729548'],[6019,'Witgroen','#C0CDA5'],[6020,'Chroomoxydegroen','#37412F'],
  [6021,'Bleekgroen','#8BA17A'],[6022,'Olijfgroen donker','#4D513F'],[6024,'Verkeersgroen','#387C5E'],
  [6025,'Varngroen','#5C7946'],[6026,'Opaakgroen','#2C4F45'],[6027,'Lichtgroen','#8EBCAB'],
  [6028,'Dennengroen','#3F5541'],[6029,'Mintgroen','#3D805A'],[6032,'Signaalgroen','#3E7D58'],
  [6033,'Mintturkoois','#458883'],[6034,'Pastelturkoois','#78AAAB'],[6035,'Parelgroen','#3A573B'],
  [6036,'Parel opaakgroen','#39675F'],[6037,'Zuiver groen','#277E4E'],[6038,'Briljant groen','#289050'],
  [7000,'Pijlstaartgrijs','#7A888E'],[7001,'Zilvergrijs','#959CA1'],[7002,'Olijfgrijs','#918979'],
  [7003,'Mosgrijs','#827F72'],[7004,'Signaalgrijs','#9A9B9C'],[7005,'Muisgrijs','#7D7E7B'],
  [7006,'Beigegrijs','#7F7367'],[7008,'Kaki grijs','#7C6951'],[7009,'Groenbeigrijs','#6A695E'],
  [7010,'Tentgrijs','#66655E'],[7011,'Ijzergrijs','#5D6063'],[7012,'Bazaltgrijs','#626664'],
  [7013,'Bruingrijs','#6C6155'],[7015,'Leisteengrijs','#555960'],[7016,'Antracietgrijs','#464A4D'],
  [7021,'Zwartgrijs','#3D3E41'],[7022,'Ombergrijs','#615D59'],[7023,'Betongrijs','#80807C'],
  [7024,'Grafietgrijs','#4F5358'],[7026,'Granietgrijs','#4D5152'],[7030,'Steengrijs','#969087'],
  [7031,'Blauwgrijs','#5F6A6E'],[7032,'Kiezelsteen grijs','#B5AD9D'],[7033,'Cementgrijs','#898E86'],
  [7034,'Geelgrijs','#ADA08C'],[7035,'Lichtgrijs','#C2C1BF'],[7036,'Platinumgrijs','#95979A'],
  [7037,'Stofgrijs','#919392'],[7038,'Agaatgrijs','#ACACAA'],[7039,'Kwartsgrijs','#7E7C78'],
  [7040,'Venstergrijs','#9DA2A6'],[7042,'Verkeersgrijs A','#A5A7A7'],[7043,'Verkeersgrijs B','#727375'],
  [7044,'Zijdegrijs','#B8B6B2'],[7045,'Telegrijs 1','#A2A5A6'],[7046,'Telegrijs 2','#8C9092'],
  [7047,'Telegrijs 4','#B3B4B3'],[7048,'Parel muisgrijs','#86837E'],[8000,'Geel bruin','#8A693F'],
  [8001,'Okra bruin','#A46835'],[8002,'Signaalbruin','#744946'],[8003,'Leembruin','#885939'],
  [8004,'Koperbruin','#96573D'],[8007,'Reebruin','#7A533E'],[8008,'Olijfbruin','#7A5B3E'],
  [8009,'Hazelnootbruin','#65483B'],[8010,'Tenthuid','#6E4A3E'],[8011,'Notabruin','#543F37'],
  [8012,'Roodbruin','#69413E'],[8014,'Sepia bruin','#523E34'],[8015,'Kastanjebruin','#613838'],
  [8016,'Mahognibruin','#543B39'],[8017,'Chocoladebruin','#4B3A38'],[8019,'Grijs bruin','#49413F'],
  [8022,'Zwart bruin','#2B2A29'],[8023,'Oranje bruin','#9C5E3D'],[8024,'Beigebruin','#8E6348'],
  [8025,'Bleekbruin','#8F6D58'],[8028,'Terrabruin','#6A5040'],[8029,'Parelkoperen','#7A4E3E'],
  [9001,'Crèmewit','#F0E6D9'],[9002,'Grijswit','#E2DED7'],[9003,'Signaalwit','#ECECE7'],
  [9004,'Signaalkzwart','#3B3C3C'],[9005,'Gitzwart','#0D0E10'],[9006,'Witalu','#9D9FA0'],
  [9007,'Grijsaluminium','#908D8A'],[9010,'Zuiver wit','#F3F1EC'],[9011,'Grafiet zwart','#2E3032'],
  [9016,'Verkeerswit','#EEEDE9'],[9017,'Verkeers zwart','#303132'],[9018,'Papyruswit','#DEE0DB'],
  [9022,'Parel lichtgrijs','#9C9C9B'],[9023,'Parel donkergrijs','#7E7E7D']
];

const FB_DB=[
  [239,"Wimborne White","#F4F2E7"],[2005,"All White","#F6F6F2"],[2003,"Pointing","#F3EFE3"],
  [241,"Skimming Stone","#DBD5CA"],[229,"Elephant's Breath","#C7BEB3"],[291,"School House White","#E3DED0"],
  [231,"Setting Plaster","#D9C0AE"],[2008,"Dimity","#EAE1D3"],[2004,"Slipper Satin","#E6E0D2"],
  [18,"French Gray","#B0AF9B"],[47,"Green Smoke","#6F7B71"],[201,"Shaded White","#D5CFC0"],
  [2001,"Strong White","#E4E2DC"],[273,"Wevet","#ECEBE9"],[274,"Ammonite","#D8D6CF"],
  [283,"Drop Cloth","#C5BDAC"],[226,"Joa's White","#DBCFBB"],[300,"Stirabout","#D9CFC2"],
  [30,"Hague Blue","#3F4D57"],[311,"Scallop","#D9C8BA"],[2011,"Blackened","#DBDBDA"],
  [228,"Cornforth White","#CFCBC4"],[277,"Dimpse","#D4D4D2"],[275,"Purbeck Stone","#C0BCB3"],
  [242,"Pavilion Gray","#C3C1BB"],[282,"Shadow White","#DCD7C8"],[267,"Dove Tale","#B7AFA9"],
  [1,"Lime White","#E3DCC7"],[3,"Off-White","#DBD4BF"],[264,"Oxford Stone","#CFC1AD"],
  [4,"Old White","#C7BFAB"],[2010,"James White","#E9E7D8"],[293,"Jitney","#C1B2A2"],
  [2002,"White Tie","#EFE9D8"],[6,"London Stone","#B3A28E"],[59,"New White","#EFE6CF"],
  [28,"Dead Salmon","#B19C8D"],[2013,"Matchstick","#E2D5BC"],[211,"Stony Ground","#C9BFAB"],
  [8,"String","#D8CBAE"],[17,"Light Gray","#AFA592"],[16,"Cord","#D1C19F"],
  [40,"Mouse's Back","#958975"],[285,"Cromarty","#CACCC0"],[15,"Bone","#C6C0AA"],
  [266,"Mizzle","#BEC1B3"],[5,"Hardwick White","#B2ADA0"],[91,"Blue Gray","#AEB2A4"],
  [314,"Sizing","#DFE6EA"],[88,"Lamp Room Gray","#B1B1AA"],[25,"Pigeon","#9A9F94"],
  [265,"Manor House Gray","#9EA09D"],[301,"Eddy","#CACCBA"],[272,"Plummett","#8C8E8D"],
  [292,"Treron","#8C8C7A"],[284,"Worsted","#A09C97"],[276,"Mole's Breath","#87847F"],
  [2006,"Great White","#E4DFDC"],[302,"Tailor Tack","#F4E7DD"],[286,"Peignoir","#CFC4C0"],
  [245,"Middleton Pink","#F6E4E4"],[270,"Calluna","#C9C7CD"],[230,"Calamine","#E2D0CA"],
  [271,"Brassica","#8D838C"],[246,"Cinder Rose","#C2A2A7"],[254,"Pelt","#53454F"],
  [295,"Sulking Room Pink","#AA8D87"],[294,"Paean Black","#484348"],[243,"Charleston Gray","#9A9087"],
  [198,"Broccoli Brown","#827462"],[312,"Dibber","#7E775B"],[313,"Reduced Green","#5C594B"],
  [255,"Tanner's Brown","#4F4A4A"],[244,"London Clay","#736660"],[202,"Pink Ground","#EAD4C6"],
  [64,"Red Earth","#BF7B69"],[42,"Picture Gallery Red","#9B594F"],[303,"Templeton Pink","#CDB19D"],
  [315,"Naperon","#D7A287"],[304,"Bamboozle","#A75346"],[278,"Nancy's Blushes","#E6B7BA"],
  [268,"Charlotte's Locks","#CF5E3E"],[296,"Rangwali","#B7788D"],[43,"Eating Room Red","#8B4D4F"],
  [316,"Marmelo","#A36E4C"],[56,"Etruscan Red","#805348"],[217,"Rectory Red","#9F404B"],
  [297,"Preference Red","#6F4449"],[248,"Incarnadine","#9C4547"],[222,"Brinjal","#5E4449"],
  [281,"Stiffkey Blue","#4A5B6B"],[235,"Borrowed Light","#D1DADB"],[205,"Skylight","#C9CFCD"],
  [26,"Down Pipe","#606565"],[22,"Light Blue","#B5BBB4"],[305,"Hopper Head","#505456"],
  [85,"Oval Room Blue","#889B9B"],[31,"Railings","#45494C"],[306,"Selvedge","#7C8E96"],
  [57,"Off-Black","#454749"],
];

let _ralCol = 'ral';

function switchKleurCol(col) {
  _ralCol = col;
  document.getElementById('tab-ral').classList.toggle('active', col === 'ral');
  document.getElementById('tab-fb').classList.toggle('active', col === 'fb');
  document.getElementById('ral-panel-title').textContent = col === 'ral' ? 'RAL Kleuren' : 'Farrow & Ball';
  document.getElementById('ral-search').value = '';
  renderRAL('');
}

function toggleRAL() {
  const panel = document.getElementById('ral-panel');
  const btn   = document.getElementById('ral-btn');
  const open  = panel.style.display === 'none';
  if (open) { document.getElementById('wr-panel').style.display = 'none'; document.querySelector('.wr-btn').classList.remove('active'); }
  panel.style.display = open ? 'block' : 'none';
  btn.classList.toggle('active', open);
  if (open) { document.getElementById('ral-search').value = ''; renderRAL(''); setTimeout(() => document.getElementById('ral-search').focus(), 50); }
}

function renderRAL(q) {
  const grid   = document.getElementById('ral-grid');
  const s      = q.trim().toLowerCase();
  const db     = _ralCol === 'fb' ? FB_DB : RAL_DB;
  const list   = s ? db.filter(([nr,naam]) => String(nr).includes(s) || naam.toLowerCase().includes(s)) : db;
  grid.innerHTML = list.map(([nr,naam,hex]) => {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    const lum=(r*299+g*587+b*114)/1000;
    const overlay = lum > 160 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)';
    const label   = _ralCol === 'fb' ? `No. ${nr}` : `RAL ${nr}`;
    return `<div class="ral-swatch" onclick="openRalDetail(${nr},\`${naam.replace(/`/g,"'")}\`,\`${hex}\`)" title="${label} — ${naam}">
      <div class="ral-color" style="background:${hex}"></div>
      <div class="ral-info" style="background:${overlay}">
        <div class="ral-num">${label}</div>
        <div class="ral-naam">${naam}</div>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:12px;padding:10px 0">Geen resultaten.</div>';
}

let _ralDetailData = null;

function openRalDetail(nr, naam, hex) {
  _ralDetailData = {nr, naam, hex};
  const label = _ralCol === 'fb' ? `No. ${nr}` : `RAL ${nr}`;
  document.getElementById('ral-detail-color').style.background = hex;
  document.getElementById('ral-detail-label').textContent = label;
  document.getElementById('ral-detail-naam').textContent  = naam;
  document.getElementById('ral-detail-hex').textContent   = hex;
  document.getElementById('ral-detail').classList.add('open');
}

function sluitRalDetail() {
  document.getElementById('ral-detail').classList.remove('open');
  _ralDetailData = null;
}

function kopieelRALDetail() {
  if (!_ralDetailData) return;
  const {nr, naam} = _ralDetailData;
  const tekst = _ralCol === 'fb' ? `${naam} No. ${nr}` : `RAL ${nr} ${naam}`;
  navigator.clipboard.writeText(tekst);
  sluitRalDetail();
  const el = document.getElementById('ral-copied');
  el.textContent = `✓ ${tekst} gekopieerd`;
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', 2200);
}

function kopieelRAL(nr, naam) {
  const tekst = _ralCol === 'fb' ? `${naam} No. ${nr}` : `RAL ${nr} ${naam}`;
  navigator.clipboard.writeText(tekst);
  const el = document.getElementById('ral-copied');
  el.textContent = `✓ ${tekst} gekopieerd`;
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', 2200);
}

// ── PWA / Ververs ─────────────────────────────────────────
async function forceerVervers(e) {
  const btn = e.currentTarget;
  btn.style.color = 'var(--orange)';
  btn.style.transform = 'rotate(360deg)';
  btn.style.transition = 'transform 0.5s ease, color 0.15s';
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(k => caches.delete(k)));
    }
  } catch(e) {}
  setTimeout(() => location.reload(true), 400);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/compier-dashboard/sw.js').catch(() => {});
  });
}

// ── Kalender ──────────────────────────────────────────────
const KAL_MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const KAL_STATUS_KLEUR = {
  offerte: '#4a90d9', lopend: '#4caf6e',
  wacht: '#d4a017', 'wacht-reactie': '#d4a017', 'wacht-akkoord': '#d4a017',
  klaar: '#555'
};

let kalJaar  = new Date().getFullYear();
let kalMaand = new Date().getMonth();

function renderKalender() {
  document.getElementById('kal-titel').textContent = KAL_MAANDEN[kalMaand] + ' ' + kalJaar;
  const grid    = document.getElementById('kal-grid');
  const vandaag = new Date(); vandaag.setHours(0,0,0,0);

  // Eerste dag van de maand → omzetten naar Ma=0, Zo=6
  const eerstedag        = new Date(kalJaar, kalMaand, 1);
  const startdag         = (eerstedag.getDay() + 6) % 7;
  const dagenInMaand     = new Date(kalJaar, kalMaand + 1, 0).getDate();
  const dagenVorigeMaand = new Date(kalJaar, kalMaand, 0).getDate();

  // Projecten met datum in deze maand per dag clusteren
  const perDag = {};
  projecten.forEach(p => {
    if (!p.datum) return;
    const d = new Date(p.datum);
    if (d.getFullYear() === kalJaar && d.getMonth() === kalMaand) {
      const dag = d.getDate();
      if (!perDag[dag]) perDag[dag] = [];
      perDag[dag].push(p);
    }
  });

  // Controleer of er überhaupt projecten zijn deze maand
  const heeftProjecten = Object.keys(perDag).length > 0;

  // 42 cellen = 6 weken
  let html = '';
  for (let i = 0; i < 42; i++) {
    const dagNr          = i - startdag + 1;
    const isVorig        = dagNr < 1;
    const isVolgend      = dagNr > dagenInMaand;
    const weergave       = isVorig ? dagenVorigeMaand + dagNr : isVolgend ? dagNr - dagenInMaand : dagNr;
    const isVandaag      = !isVorig && !isVolgend &&
      new Date(kalJaar, kalMaand, dagNr).getTime() === vandaag.getTime();
    const klassen        = ['kal-dag', isVorig || isVolgend ? 'ander-maand' : '', isVandaag ? 'vandaag' : '']
      .filter(Boolean).join(' ');
    const dagProjecten   = (!isVorig && !isVolgend) ? (perDag[dagNr] || []) : [];

    const projectHtml = dagProjecten.map(p => {
      const tijd = p.datum?.includes('T') ? p.datum.slice(11, 16) : '';
      const kleur = KAL_STATUS_KLEUR[p.status] || '#666';
      return `<div class="kal-project" onclick="event.stopPropagation();openModal(${p.id})">
        <div class="kal-project-dot" style="background:${kleur}"></div>
        <div class="kal-project-text">
          <div class="kal-project-num">${p.nummer}${tijd ? `<span class="kal-project-tijd">${tijd}</span>` : ''}</div>
          ${p.adres ? `<div class="kal-project-adres">${p.adres}</div>` : ''}
          ${p.actie ? `<div class="kal-project-actie">${p.actie}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    html += `<div class="${klassen}">
      <div class="kal-dag-num">${weergave}</div>
      ${projectHtml}
    </div>`;
  }

  if (!heeftProjecten) {
    html += `<div class="kal-leeg">Geen projecten met datum in ${KAL_MAANDEN[kalMaand]}</div>`;
  }

  grid.innerHTML = html;
}

function kalNavigeer(delta) {
  kalMaand += delta;
  if (kalMaand > 11) { kalMaand = 0; kalJaar++; }
  if (kalMaand < 0)  { kalMaand = 11; kalJaar--; }
  renderKalender();
}

function kalNaarVandaag() {
  const nu = new Date();
  kalJaar  = nu.getFullYear();
  kalMaand = nu.getMonth();
  renderKalender();
}

// ── Deel kaart ────────────────────────────────────────────
function deelKaart() {
  const p = projecten.find(x => x.id === editingId);
  if (!p) return;

  const ORANGE  = getComputedStyle(document.documentElement).getPropertyValue('--orange').trim() || '#E8611A';
  const isLight = document.body.classList.contains('light');
  const C = {
    bg:      isLight ? '#ffffff' : '#111111',
    footer:  isLight ? '#f0f0ee' : '#1a1a1a',
    lijn:    isLight ? '#d0d0ce' : '#2a2a2a',
    chip:    isLight ? '#e6e6e4' : '#222222',
    chipRnd: isLight ? '#d0d0ce' : '#333333',
    tekst:   isLight ? '#1a1a1a' : '#e8e8e8',
    muted:   isLight ? '#888888' : '#555555',
    notitie: isLight ? '#444444' : '#aaaaaa',
    ruimte:  isLight ? '#555555' : '#999999',
  };

  // ── Bereken notitie-regels vooraf (voor dynamische hoogte) ──
  const W = 390;
  const REGEL_H = 17, NOTITIE_FONT = '400 12px "IBM Plex Sans", sans-serif';
  const tmpC = document.createElement('canvas').getContext('2d');
  tmpC.font = NOTITIE_FONT;
  const notitieRegels = [];
  if (p.notitie) {
    const woorden = p.notitie.split(' ');
    let huidig = '';
    for (const w of woorden) {
      const test = huidig ? huidig + ' ' + w : w;
      if (tmpC.measureText(test).width < W - 40) {
        huidig = test;
      } else {
        if (huidig) notitieRegels.push(huidig);
        huidig = w;
      }
    }
    if (huidig) notitieRegels.push(huidig);
  } else if (p.actie) {
    notitieRegels.push(p.actie);
  }

  // Vaste blokken + ruimte voor notitie-regels + datum + footer
  const VASTE_TOP   = 168; // t/m OPDRACHT label
  const NOTITIE_TOP = 184;
  const notitieH    = Math.max(notitieRegels.length * REGEL_H, 18);
  const DATUM_TOP   = NOTITIE_TOP + notitieH + 20; // lijn + ruimte
  const H           = DATUM_TOP + (p.datum ? 56 : 10) + 32; // datum blok + onderste padding

  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Achtergrond
  ctx.fillStyle = C.bg;
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 12); ctx.fill();

  // Header: COMPIER
  ctx.fillStyle = ORANGE;
  ctx.font = '700 11px "IBM Plex Mono", monospace';
  ctx.fillText('COMPIER', 20, 26);

  // Lijn
  ctx.strokeStyle = C.lijn; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 36); ctx.lineTo(W - 16, 36); ctx.stroke();

  // Projectnummer
  ctx.fillStyle = ORANGE;
  ctx.font = '700 26px "IBM Plex Mono", monospace';
  ctx.fillText(p.nummer, 20, 72);

  // Ruimte chip
  if (p.ruimte) {
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    const rw = ctx.measureText(p.ruimte).width + 14;
    ctx.fillStyle = C.chip;
    ctx.beginPath(); ctx.roundRect(20, 80, rw, 18, 3); ctx.fill();
    ctx.strokeStyle = C.chipRnd; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(20, 80, rw, 18, 3); ctx.stroke();
    ctx.fillStyle = C.ruimte;
    ctx.fillText(p.ruimte, 27, 92.5);
  }

  // Adres
  ctx.fillStyle = C.tekst;
  ctx.font = '600 14px "IBM Plex Sans", sans-serif';
  ctx.fillText(p.adres || '—', 20, 122);
  ctx.fillStyle = C.muted;
  ctx.font = '400 11px "IBM Plex Sans", sans-serif';
  ctx.fillText(p.opdrachtgever || '', 20, 140);

  // Lijn
  ctx.strokeStyle = C.lijn;
  ctx.beginPath(); ctx.moveTo(20, 152); ctx.lineTo(W - 16, 152); ctx.stroke();

  // Opdracht label
  ctx.fillStyle = C.tekst;
  ctx.font = '600 9px "IBM Plex Sans", sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('OPDRACHT', 20, VASTE_TOP);
  ctx.letterSpacing = '0px';

  // Notitie — alle regels
  ctx.fillStyle = C.notitie;
  ctx.font = NOTITIE_FONT;
  notitieRegels.forEach((r, i) => {
    ctx.fillText(r, 20, NOTITIE_TOP + i * REGEL_H);
  });

  // Lijn vóór datum
  ctx.strokeStyle = C.lijn;
  ctx.beginPath(); ctx.moveTo(20, DATUM_TOP - 10); ctx.lineTo(W - 16, DATUM_TOP - 10); ctx.stroke();

  // Datum
  if (p.datum) {
    const d    = new Date(p.datum);
    const dag  = d.toLocaleDateString('nl-NL', { weekday: 'long' });
    const dat  = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const tijd = p.datum.includes('T') ? p.datum.slice(11, 16) : null;
    ctx.fillStyle = C.tekst;
    ctx.font = '600 9px "IBM Plex Sans", sans-serif';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('DATUM', 20, DATUM_TOP + 6);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = ORANGE;
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.fillText(dag.charAt(0).toUpperCase() + dag.slice(1) + ' — ' + dat + (tijd ? '  ' + tijd : ''), 20, DATUM_TOP + 24);
  }

  // Oranje balk links — als laatste getekend zodat hij altijd schoon bovenop staat
  ctx.fillStyle = ORANGE;
  ctx.beginPath(); ctx.roundRect(0, 0, 4, H, [12, 0, 0, 12]); ctx.fill();

  // Naar PNG en openen in nieuw tabblad (iOS: lang indrukken → opslaan/delen)
  const imgUrl = canvas.toDataURL('image/png');
  const bgPagina = isLight ? '#f0f0ee' : '#0f0f0f';
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${p.nummer}</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${bgPagina}; display:flex; flex-direction:column;
               align-items:center; justify-content:center; min-height:100vh;
               gap:20px; padding:24px 16px; font-family:'IBM Plex Sans',sans-serif; }
        img { width:390px; max-width:100%; border-radius:12px;
              box-shadow:0 8px 32px rgba(0,0,0,.4); }
        .hint { color:#666; font-size:12px; text-align:center; }
        .terug {
          display:inline-flex; align-items:center; gap:6px;
          padding:10px 20px; border-radius:6px;
          background:${isLight ? '#e6e6e4' : '#1e1e1e'};
          border:1px solid ${isLight ? '#d0d0ce' : '#2a2a2a'};
          color:${isLight ? '#1a1a1a' : '#e8e8e8'};
          font-size:13px; font-weight:600; cursor:pointer;
          text-decoration:none; letter-spacing:0.02em;
        }
        .terug:hover { border-color:#E8611A; color:#E8611A; }
      </style></head><body>
      <img src="${imgUrl}" alt="${p.nummer}">
      <p class="hint">Houd de afbeelding ingedrukt om op te slaan of te delen</p>
      <a class="terug" onclick="window.close()" href="#">← Terug naar dashboard</a>
    </body></html>`);
    win.document.close();
  }
}

// ── Init ──────────────────────────────────────────────────
initAccentSwatches();
initAuth();
