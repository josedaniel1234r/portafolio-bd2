// ============================================================
// PORTAFOLIO · BASE DE DATOS II
// Navegación entre pantallas, login por rol, unidades / semanas /
// actividades (con subida de archivos vía Supabase), foto de
// perfil y fondo animado de video.
// ============================================================

/* ============================================================
   BASE DE DATOS: SUPABASE
   Reemplaza estos 2 valores con los de TU proyecto en supabase.com
   (Project Settings → API → Project URL / anon public key).
   Es seguro que estos valores sean públicos: la protección real
   la dan las políticas RLS configuradas en la base de datos.
   ============================================================ */
const SUPABASE_URL = 'https://lqdmamscraarfhylluzj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_l1102i6iNs_XCuV-2SxX2A_Af-UExG6';
const FILES_BUCKET = 'portfolio-files';

const sb = (SUPABASE_URL.startsWith('http') && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!sb) {
  console.warn('Supabase no está configurado todavía: reemplaza SUPABASE_URL y SUPABASE_ANON_KEY en script.js.');
}

function makeFilePath(prefix, fileName) {
  const safe = (fileName || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
}

async function uploadFile(path, file) {
  const { error } = await sb.storage.from(FILES_BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

function getPublicFileUrl(path) {
  if (!path || !sb) return null;
  const { data } = sb.storage.from(FILES_BUCKET).getPublicUrl(path);
  return data ? data.publicUrl : null;
}

async function deleteStoredFile(path) {
  if (!path || !sb) return;
  try { await sb.storage.from(FILES_BUCKET).remove([path]); } catch (e) { /* no crítico */ }
}

/* ---------- datos base (editar aquí nombre y descripción) ---------- */
const PROFILE_DEFAULTS = {
  name: 'Jose Daniel Perez Villalva',
  initials: 'JP'
};

const UNIT_DEFS = [
  {
    title: 'Arquitecturas de Bases de Datos y Configuración del Entorno Corporativo',
    weekNames: [
      'Formulación del Proyecto y Selección de la Arquitectura',
      'Despliegue y Configuración de Motores de Datos (DBMS)',
      'Modelamiento Físico y Mecanismos de Integración',
      'Sustentación y Validación de la Infraestructura de Datos'
    ]
  },
  { title: 'Administración de Instancias, Estructuras de Almacenamiento y Gestión de Datos Masivos' },
  { title: 'Seguridad Corporativa, Conectividad de Red y Alta Disponibilidad de Datos' },
  { title: 'Monitoreo de Servidores, Optimización del Desempeño y Recuperación Basada en Flashback' }
];

const ROMAN = ['I', 'II', 'III', 'IV'];
const UNIT_COLORS = ['#ff2166', '#ff6a8f', '#9d3dff', '#c026d3'];

function buildDefaultUnits() {
  return UNIT_DEFS.map((def, i) => ({
    id: i,
    roman: ROMAN[i],
    title: `Unidad ${ROMAN[i]}: ${def.title}`,
    weeks: [0, 1, 2, 3].map(w => ({
      id: w,
      name: `Semana ${w + 1}`,
      subtitle: def.weekNames ? def.weekNames[w] : null,
      activities: [] // se llenan dinámicamente desde Supabase (loadActivitiesFromDB)
    }))
  }));
}

/* ---------- estado ----------
   Solo el "rol" de sesión (admin/usuario) se guarda en este navegador,
   y SOLO mientras la pestaña siga abierta (sessionStorage, no
   localStorage) — así cualquiera que abra el link (o tú mismo, en una
   visita nueva) siempre ve primero la pantalla de inicio, en vez de
   entrar directo al dashboard por una sesión vieja olvidada. */
const ROLE_KEY = 'bd2_role';

let state = {
  role: sessionStorage.getItem(ROLE_KEY) || null,
  profileName: null,
  profilePhotoPath: null,
  units: buildDefaultUnits()
};
try { localStorage.removeItem(ROLE_KEY); } catch (e) { /* limpia el dato viejo de sesiones permanentes anteriores */ }

function saveRole() {
  try {
    if (state.role) sessionStorage.setItem(ROLE_KEY, state.role);
    else sessionStorage.removeItem(ROLE_KEY);
  } catch (e) { /* no crítico */ }
}

/* ---------- carga de datos reales desde Supabase ---------- */
async function loadProfileFromDB() {
  if (!sb) return;
  const { data, error } = await sb.from('profile').select('*').eq('id', 1).single();
  if (!error && data) {
    state.profileName = data.name;
    state.profilePhotoPath = data.photo_path;
  }
}

async function saveProfileToDB() {
  if (!sb) return;
  await sb.from('profile').upsert({ id: 1, name: state.profileName, photo_path: state.profilePhotoPath });
}

async function loadActivitiesFromDB() {
  state.units.forEach(u => u.weeks.forEach(w => { w.activities = []; }));
  if (!sb) return;
  const { data, error } = await sb.from('activities').select('*').order('slot_order', { ascending: true });
  if (error) { console.error('Error cargando actividades de Supabase:', error); return; }
  (data || []).forEach(row => {
    const u = state.units.find(x => x.id === row.unit_id);
    const w = u && u.weeks.find(x => x.id === row.week_id);
    if (!w) return;
    w.activities.push({
      id: row.id,
      name: row.name,
      order: row.slot_order,
      items: []
    });
  });
}

async function loadItemsFromDB() {
  if (!sb) return;
  const { data, error } = await sb.from('portfolio_items').select('*').order('item_order', { ascending: true });
  if (error) { console.error('Error cargando elementos de Supabase:', error); return; }
  (data || []).forEach(row => {
    const u = state.units.find(x => x.id === row.unit_id);
    const w = u && u.weeks.find(x => x.id === row.week_id);
    const a = w && w.activities.find(x => x.id === row.activity_id);
    if (!a) return;
    a.items.push({
      id: row.id,
      order: row.item_order,
      title: row.title,
      desc: row.description,
      link: row.link,
      filePath: row.file_path,
      fileName: row.file_name,
      fileType: row.file_type
    });
  });
}

let currentUnitId = null;
let pendingActivity = { unitId: null, weekId: null, activityId: null };
let pendingFiles = []; // File[] seleccionados en el formulario (se suben a Supabase Storage al enviar)

/* ---------- navegación entre pantallas (con transición de velo) ---------- */
let isTransitioning = false;
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function applyScreenSwap(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'enter'));
  const target = document.getElementById(`screen-${name}`);
  if (target) {
    target.classList.add('active');
    void target.offsetWidth; // fuerza reflow para poder re-disparar la animación
    target.classList.add('enter');
  }

  const topnav = document.getElementById('topnav');
  const showNav = state.role && (name === 'dashboard' || name === 'unit' || name === 'about');
  topnav.classList.toggle('visible', !!showNav);

  const chatWidget = document.getElementById('chatbot-widget');
  if (chatWidget) chatWidget.classList.toggle('visible', name === 'home');

  window.scrollTo(0, 0);

  if (name === 'dashboard') renderDashboard();
  if (name === 'unit') renderUnit(currentUnitId);
  if (name === 'home') renderPreviewStrip();
}

function showScreen(name) {
  const target = document.getElementById(`screen-${name}`);
  if (!target || target.classList.contains('active')) return;

  if (REDUCE_MOTION) { applyScreenSwap(name); return; }
  if (isTransitioning) return;
  isTransitioning = true;

  const veil = document.getElementById('transition-veil');
  veil.classList.remove('run');
  void veil.offsetWidth; // reinicia la animación aunque se dispare varias veces seguidas
  veil.classList.add('run');

  setTimeout(() => applyScreenSwap(name), 380);   // instante en que el velo cubre toda la pantalla
  setTimeout(() => { veil.classList.remove('run'); isTransitioning = false; }, 900);
}

document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.goto));
});

document.getElementById('brand-btn').addEventListener('click', () => {
  showScreen(state.role ? 'dashboard' : 'home');
});
document.getElementById('btn-login').addEventListener('click', () => showScreen('login'));
document.getElementById('btn-about').addEventListener('click', () => showScreen('about'));

document.getElementById('logout-btn').addEventListener('click', () => {
  state.role = null;
  saveRole();
  updateNavRole();
  showScreen('home');
});

/* ---------- envío del formulario de login ----------
   Dos cuentas fijas: la del administrador (privada) y una cuenta
   pública de invitado de solo lectura (sus datos se muestran en la
   propia pantalla de login, ya que no da ningún permiso de edición). */
const ADMIN_EMAIL = 'zafiror14@gmail.com';
const ADMIN_PASSWORD = 'joseperez123456';
const GUEST_EMAIL = 'usuario@bd2.com';
const GUEST_PASSWORD = 'usuario2026';

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  let role = null;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) role = 'admin';
  else if (email === GUEST_EMAIL && password === GUEST_PASSWORD) role = 'user';

  if (!role) {
    errorEl.textContent = 'Correo o contraseña incorrectos.';
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  state.role = role;
  saveRole();
  updateNavRole();
  showScreen('dashboard');
  document.getElementById('login-form').reset();
});

/* copiar correo/contraseña de invitado con un clic */
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const value = btn.dataset.copy;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(value);
      btn.textContent = '¡Copiado!';
    } catch (err) {
      window.prompt('Copia manualmente:', value);
    }
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
});

function updateNavRole() {
  const roleEl = document.getElementById('nav-role');
  roleEl.textContent = state.role === 'admin' ? 'Administrador' : state.role === 'user' ? 'Usuario' : '';
}

/* ---------- foto de perfil (subida desde el computador, guardada en Supabase Storage) ---------- */
function renderProfilePhoto() {
  const box = document.getElementById('about-photo');
  const initialsSpan = document.getElementById('about-initials');
  let img = box.querySelector('img');
  const url = getPublicFileUrl(state.profilePhotoPath);
  if (url) {
    if (!img) {
      img = document.createElement('img');
      img.alt = 'Foto de perfil';
      box.insertBefore(img, box.firstChild);
    }
    img.src = url;
    if (initialsSpan) initialsSpan.style.display = 'none';
  } else {
    if (img) img.remove();
    if (initialsSpan) initialsSpan.style.display = '';
  }
}

document.getElementById('photo-edit-btn').addEventListener('click', () => {
  document.getElementById('photo-input').click();
});

document.getElementById('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const oldPath = state.profilePhotoPath;
    const path = makeFilePath('profile', file.name);
    await uploadFile(path, file);
    state.profilePhotoPath = path;
    await saveProfileToDB();
    renderProfilePhoto();
    if (oldPath) deleteStoredFile(oldPath);
  } catch (err) {
    console.error(err);
    alert('No se pudo guardar la foto. Revisa tu conexión o la configuración de Supabase.');
  }
  e.target.value = '';
});

/* ---------- tira de vista previa en Home ---------- */
function renderPreviewStrip() {
  const wrap = document.getElementById('preview-strip');
  wrap.innerHTML = state.units.map(u => `
    <div class="preview-chip" style="--unit-color:${UNIT_COLORS[u.id]}">
      <span class="preview-chip-num">Unidad ${u.roman}</span>
      <p class="preview-chip-title">${u.title.split(': ')[1]}</p>
    </div>
  `).join('');
}

/* ---------- conteo de elementos en una semana ---------- */
function countWeekItems(week) {
  return week.activities.reduce((sum, a) => sum + a.items.length, 0);
}

/* ---------- dashboard: 4 unidades ---------- */
function renderDashboard() {
  document.getElementById('dash-hint').textContent =
    state.role === 'admin' ? 'Modo administrador — puedes cargar actividades' : 'Modo lectura';

  const grid = document.getElementById('units-grid');
  const totalActivities = state.units.reduce((sum, u) => sum + u.weeks.reduce((s, w) => s + w.activities.length, 0), 0);
  const totalItems = state.units.reduce((sum, u) => sum + u.weeks.reduce((s, w) => s + countWeekItems(w), 0), 0);
  const totalWeeks = state.units.reduce((sum, u) => sum + u.weeks.length, 0);
  const activeWeeks = state.units.reduce((sum, u) => sum + u.weeks.filter(w => countWeekItems(w) > 0).length, 0);
  const summary = document.getElementById('dashboard-summary');
  if (summary) summary.innerHTML = `
    <div class="dash-stat"><strong>${state.units.length}</strong><span>UNIDADES</span></div>
    <div class="dash-stat"><strong>${activeWeeks}/${totalWeeks}</strong><span>SEMANAS</span></div>
    <div class="dash-stat"><strong>${totalActivities}</strong><span>ACTIVIDADES</span></div>
    <div class="dash-stat"><strong>${totalItems}</strong><span>EVIDENCIAS</span></div>`;
  const existingToolbar = document.getElementById('dashboard-toolbar');
  if (!existingToolbar) {
    const toolbar = document.createElement('div');
    toolbar.id = 'dashboard-toolbar';
    toolbar.className = 'dashboard-toolbar';
    toolbar.innerHTML = `
      <div class="dashboard-search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        <input id="unit-search" type="search" placeholder="Buscar una unidad..." autocomplete="off">
      </div>
      <div class="dashboard-filters" role="group" aria-label="Filtrar unidades">
        <button class="dash-filter active" data-filter="all" type="button">Todas</button>
        <button class="dash-filter" data-filter="progress" type="button">Con avance</button>
        <button class="dash-filter" data-filter="empty" type="button">Pendientes</button>
      </div>`;
    grid.parentNode.insertBefore(toolbar, grid);
    const search = toolbar.querySelector('#unit-search');
    const filters = toolbar.querySelectorAll('.dash-filter');
    const applyFilters = () => {
      const q = search.value.trim().toLowerCase();
      const active = toolbar.querySelector('.dash-filter.active')?.dataset.filter || 'all';
      grid.querySelectorAll('.unit-card').forEach(card => {
        const text = card.dataset.search || '';
        const pct = Number(card.dataset.pct || 0);
        const okText = !q || text.includes(q);
        const okFilter = active === 'all' || (active === 'progress' && pct > 0) || (active === 'empty' && pct === 0);
        card.classList.toggle('is-filtered', !(okText && okFilter));
      });
    };
    search.addEventListener('input', applyFilters);
    filters.forEach(btn => btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    }));
  }
  grid.innerHTML = state.units.map((u, idx) => {
    const totalItems = u.weeks.reduce((sum, w) => sum + countWeekItems(w), 0);
    const weeksWithContent = u.weeks.filter(w => countWeekItems(w) > 0).length;
    const pct = Math.round((weeksWithContent / u.weeks.length) * 100);
    const R = 15.5;
    const C = 2 * Math.PI * R;
    const dash = (pct / 100) * C;
    const dots = u.weeks.map(w => `<span class="week-dot ${countWeekItems(w) ? 'filled' : ''}"></span>`).join('');
    return `
      <button class="unit-card" data-unit="${u.id}" data-roman="${u.roman}" data-pct="${pct}" data-search="${escapeAttr((u.title + ' ' + u.roman).toLowerCase())}" style="--unit-color:${UNIT_COLORS[u.id]}; --i:${idx}">
        <span class="unit-card-glow"></span>
        <div class="unit-top">
          <span class="unit-num">Unidad ${u.roman}</span>
          <span class="unit-ring" title="${weeksWithContent} de ${u.weeks.length} semanas con contenido">
            <svg viewBox="0 0 36 36" width="38" height="38">
              <circle class="unit-ring-track" cx="18" cy="18" r="${R}"/>
              <circle class="unit-ring-fill" cx="18" cy="18" r="${R}"
                stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}"/>
            </svg>
            <span class="unit-ring-label">${pct}%</span>
          </span>
        </div>
        <h3 class="unit-name">${u.title.split(': ')[1]}</h3>
        <div class="unit-bottom">
          <div class="unit-bottom-left">
            <div class="unit-weeks-dots">${dots}</div>
            <span class="unit-progress">${totalItems} elemento${totalItems === 1 ? '' : 's'}</span>
          </div>
          <span class="unit-arrow">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </div>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.unit-card').forEach(card => {
    card.addEventListener('click', () => {
      currentUnitId = Number(card.dataset.unit);
      showScreen('unit');
    });
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
    });
  });
}

/* ---------- detalle de unidad: semanas → actividad 1 / actividad 2 → elementos ---------- */
/* ---------- recuerda qué semanas/actividades dejaste abiertas (por navegador) ---------- */
const OPEN_WEEKS_KEY = 'bd2_open_weeks';
const OPEN_ACTS_KEY = 'bd2_open_activities';
function loadOpenSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch (e) { return new Set(); }
}
function saveOpenSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) { /* no crítico */ }
}
const openWeeks = loadOpenSet(OPEN_WEEKS_KEY);
const openActivities = loadOpenSet(OPEN_ACTS_KEY);

function renderUnit(unitId) {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return;

  document.getElementById('unit-tag').style.setProperty('--unit-color', UNIT_COLORS[unit.id]);
  document.getElementById('unit-tag').textContent = `Unidad ${unit.roman}`;
  document.getElementById('unit-title').textContent = unit.title;

  const totalItems = unit.weeks.reduce((sum, w) => sum + countWeekItems(w), 0);
  const weeksWithContent = unit.weeks.filter(w => countWeekItems(w) > 0).length;
  const unitPct = Math.round((weeksWithContent / unit.weeks.length) * 100);
  const statsEl = document.getElementById('unit-stats');
  if (statsEl) {
    statsEl.style.setProperty('--unit-color', UNIT_COLORS[unit.id]);
    statsEl.innerHTML = `
      <div class="unit-stats-bar"><div class="unit-stats-bar-fill" style="width:${unitPct}%"></div></div>
      <div class="unit-stats-row">
        <span>${weeksWithContent} de ${unit.weeks.length} semanas con contenido</span>
        <span>${totalItems} elemento${totalItems === 1 ? '' : 's'} en total</span>
      </div>
    `;
  }

  const list = document.getElementById('weeks-list');
  list.innerHTML = unit.weeks.map(week => {
    const weekKey = `${unit.id}-${week.id}`;
    const isWeekOpen = openWeeks.has(weekKey);
    const weekItemCount = countWeekItems(week);
    const hasContent = weekItemCount > 0;
    const actsWithContent = week.activities.filter(a => a.items.length > 0).length;
    const weekPct = week.activities.length ? Math.round((actsWithContent / week.activities.length) * 100) : 0;
    return `
    <div class="week-row${isWeekOpen ? ' open' : ''}" data-week="${week.id}">
      <button class="week-summary" data-toggle="${weekKey}">
        <span class="week-summary-left">
          <span class="week-node${hasContent ? ' filled' : ''}">${hasContent
            ? '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : String(week.id + 1).padStart(2, '0')}</span>
          <span class="week-name-col">
            <span class="week-name">${week.name}</span>
            ${week.subtitle ? `<span class="week-subtitle">${escapeHtml(week.subtitle)}</span>` : ''}
            ${week.activities.length ? `<span class="week-mini-bar"><span class="week-mini-bar-fill" style="width:${weekPct}%"></span></span>` : ''}
          </span>
        </span>
        <span class="week-summary-left">
          <span class="week-count">${weekItemCount} elemento${weekItemCount === 1 ? '' : 's'}</span>
          <span class="week-chevron">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2.5 9.5 7 5 11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </span>
      </button>
      <div class="week-panel">
        <div class="week-panel-inner">
          ${week.activities.map((act, i) => renderActivityBlock(unit, week, act, i)).join('')}
          ${state.role === 'admin' ? `<button type="button" class="add-slot-btn" data-slot-unit="${unit.id}" data-slot-week="${week.id}">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            Agregar apartado de actividad
          </button>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

  // abrir/cerrar semanas (acordeón) — recordando la elección en este navegador
  list.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.week-row');
      const isOpen = row.classList.toggle('open');
      const key = btn.dataset.toggle;
      if (isOpen) openWeeks.add(key); else openWeeks.delete(key);
      saveOpenSet(OPEN_WEEKS_KEY, openWeeks);
    });
  });

  // abrir/cerrar cada actividad dentro de una semana (acordeón anidado) — con memoria propia
  list.querySelectorAll('[data-activity-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const block = btn.closest('.activity-block');
      const isOpen = block.classList.toggle('open');
      const id = btn.dataset.activityToggle;
      if (isOpen) openActivities.add(id); else openActivities.delete(id);
      saveOpenSet(OPEN_ACTS_KEY, openActivities);
    });
  });

  // borrar apartado: como es un <span role="button"> (no puede ir un <button> dentro de otro <button>),
  // manejamos clic y teclado a mano
  list.querySelectorAll('.activity-slot-del').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); }
    });
  });

  // crear un nuevo apartado de actividad (ej. "Actividad 3") en una semana
  list.querySelectorAll('[data-slot-unit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const uId = Number(btn.dataset.slotUnit);
      const wId = Number(btn.dataset.slotWeek);
      const week = unit.weeks.find(w => w.id === wId);
      pendingSlot = { unitId: uId, weekId: wId };
      document.getElementById('slot-week-label').textContent = `Unidad ${unit.roman} · ${week.name}`;
      document.getElementById('slot-name').value = `Actividad ${week.activities.length + 1}`;
      openSlotModal();
    });
  });

  // eliminar un apartado de actividad completo (borra también sus elementos y archivos)
  list.querySelectorAll('[data-delslot-unit]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uId = Number(btn.dataset.delslotUnit);
      const wId = Number(btn.dataset.delslotWeek);
      const acId = btn.dataset.delslotActivity; // uuid
      const u = state.units.find(x => x.id === uId);
      const w = u.weeks.find(x => x.id === wId);
      const a = w.activities.find(x => x.id === acId);
      if (!a) return;
      if (!confirm(`¿Eliminar "${a.name}" completo, junto con todo lo que tenga adentro? Esta acción no se puede deshacer.`)) return;

      btn.disabled = true;
      try {
        if (sb) {
          const { error } = await sb.from('activities').delete().eq('id', acId);
          if (error) throw error;
        }
        a.items.forEach(it => { if (it.filePath) deleteStoredFile(it.filePath); });
        w.activities = w.activities.filter(x => x.id !== acId);
        renderUnit(currentUnitId);
      } catch (err) {
        console.error(err);
        alert('No se pudo eliminar el apartado. Revisa tu conexión o la configuración de Supabase.');
        btn.disabled = false;
      }
    });
  });

  // agregar elemento dentro de una actividad
  list.querySelectorAll('[data-add-unit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingActivity = {
        unitId: Number(btn.dataset.addUnit),
        weekId: Number(btn.dataset.addWeek),
        activityId: btn.dataset.addActivity // uuid de Supabase, no numérico
      };
      const week = unit.weeks.find(w => w.id === pendingActivity.weekId);
      const act = week.activities.find(a => a.id === pendingActivity.activityId);
      document.getElementById('modal-week-label').textContent =
        `Unidad ${unit.roman} · ${week.name} · ${act.name}`;
      openModal();
    });
  });

  // eliminar elemento (borra también el archivo real en Supabase Storage)
  list.querySelectorAll('[data-del-unit]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uId = Number(btn.dataset.delUnit);
      const wId = Number(btn.dataset.delWeek);
      const acId = btn.dataset.delActivity; // uuid de Supabase, no numérico
      const itId = btn.dataset.delItem; // uuid de Supabase, no numérico
      const u = state.units.find(x => x.id === uId);
      const w = u.weeks.find(x => x.id === wId);
      const a = w.activities.find(x => x.id === acId);
      const item = a.items.find(x => x.id === itId);
      const label = item ? item.title : 'este elemento';
      if (!confirm(`¿Eliminar "${label}"? Esta acción no se puede deshacer.`)) return;

      btn.disabled = true;
      try {
        if (sb) {
          const { error } = await sb.from('portfolio_items').delete().eq('id', itId);
          if (error) throw error;
        }
        if (item && item.filePath) deleteStoredFile(item.filePath);
        a.items = a.items.filter(it => it.id !== itId);
        renderUnit(currentUnitId);
      } catch (err) {
        console.error(err);
        alert('No se pudo eliminar. Revisa tu conexión o la configuración de Supabase.');
        btn.disabled = false;
      }
    });
  });

  // visualizar elemento dentro del portafolio (sin descargar)
  list.querySelectorAll('[data-view-unit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const uId = Number(btn.dataset.viewUnit);
      const wId = Number(btn.dataset.viewWeek);
      const acId = btn.dataset.viewActivity; // uuid de Supabase, no numérico
      const itId = btn.dataset.viewItem; // uuid de Supabase, no numérico
      const u = state.units.find(x => x.id === uId);
      const w = u.weeks.find(x => x.id === wId);
      const a = w.activities.find(x => x.id === acId);
      const it = a.items.find(x => x.id === itId);
      if (it) openViewer(it);
    });
  });

  // reemplazar el archivo de un elemento existente, sin borrar y volver a crearlo
  list.querySelectorAll('[data-replace-unit]').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', async (e) => {
      e.stopPropagation();
      const file = input.files[0];
      if (!file) return;
      const uId = Number(input.dataset.replaceUnit);
      const wId = Number(input.dataset.replaceWeek);
      const acId = input.dataset.replaceActivity;
      const itId = input.dataset.replaceItem;
      const u = state.units.find(x => x.id === uId);
      const w = u.weeks.find(x => x.id === wId);
      const a = w.activities.find(x => x.id === acId);
      const item = a.items.find(x => x.id === itId);
      if (!item) return;

      const label = input.closest('.activity-replace-btn');
      const originalHTML = label.innerHTML;
      label.innerHTML = 'Subiendo…';

      try {
        if (!sb) throw new Error('Supabase no está configurado.');
        const oldPath = item.filePath;
        const newPath = makeFilePath('items', file.name);
        await uploadFile(newPath, file);

        const { error } = await sb.from('portfolio_items')
          .update({ file_path: newPath, file_name: file.name, file_type: file.type })
          .eq('id', itId);
        if (error) throw error;

        item.filePath = newPath;
        item.fileName = file.name;
        item.fileType = file.type;
        if (oldPath) deleteStoredFile(oldPath);

        renderUnit(currentUnitId);
      } catch (err) {
        console.error(err);
        alert('No se pudo reemplazar el archivo: ' + (err.message || 'revisa tu conexión o la configuración de Supabase.'));
        label.innerHTML = originalHTML;
      }
    });
  });
}

function renderActivityBlock(unit, week, act, slotIndex) {
  const isOpen = openActivities.has(act.id);
  return `
    <div class="activity-block${isOpen ? ' open' : ''}" data-activity-block="${act.id}" style="--i:${slotIndex || 0}">
      <button type="button" class="activity-block-head" data-activity-toggle="${act.id}">
        <span class="activity-block-title">
          <span class="activity-block-chevron">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5 2.5 9.5 7 5 11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          ${escapeHtml(act.name)}
        </span>
        <span class="activity-block-right">
          <span class="activity-block-count">${act.items.length} elemento${act.items.length === 1 ? '' : 's'}</span>
          ${state.role === 'admin' ? `<span class="activity-slot-del" data-delslot-unit="${unit.id}" data-delslot-week="${week.id}" data-delslot-activity="${act.id}" title="Eliminar este apartado de actividad completo" role="button" tabindex="0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>` : ''}
        </span>
      </button>
      <div class="activity-panel">
        <div class="activity-panel-inner">
          <div class="activity-items">
            ${act.items.length === 0
              ? '<p class="empty-week">Aún no hay elementos cargados.</p>'
              : act.items.map((it, i) => renderItem(unit, week, act, it, i)).join('')
            }
          </div>
          ${state.role === 'admin'
            ? `<button class="add-activity-btn" data-add-unit="${unit.id}" data-add-week="${week.id}" data-add-activity="${act.id}">+ Agregar elemento a ${escapeHtml(act.name)}</button>`
            : ''}
        </div>
      </div>
    </div>
  `;
}

/* ---------- estilo del ícono según el tipo de archivo ---------- */
const FILE_TYPE_STYLES = {
  pdf:  { color: '#ff5a5a', label: 'PDF' },
  doc:  { color: '#5b9dff', label: 'DOC' },
  docx: { color: '#5b9dff', label: 'DOC' },
  xls:  { color: '#4ade80', label: 'XLS' },
  xlsx: { color: '#4ade80', label: 'XLS' },
  ppt:  { color: '#ff9d3d', label: 'PPT' },
  pptx: { color: '#ff9d3d', label: 'PPT' },
  zip:  { color: '#b8bfce', label: 'ZIP' },
  rar:  { color: '#b8bfce', label: 'RAR' },
  mp4:  { color: '#9d3dff', label: 'VID' },
  mov:  { color: '#9d3dff', label: 'VID' },
  txt:  { color: '#8b97b8', label: 'TXT' }
};
function fileTypeStyle(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  return FILE_TYPE_STYLES[ext] || { color: 'var(--unit-color, var(--accent))', label: (ext || 'ARCH').slice(0, 4).toUpperCase() };
}

function renderItem(unit, week, act, it, itemIndex) {
  const isImage = it.fileType && it.fileType.startsWith('image/');
  const fileUrl = getPublicFileUrl(it.filePath);
  let media = '';
  if (isImage && fileUrl) {
    media = `<img class="activity-item-thumb" src="${fileUrl}" alt="">`;
  } else if (it.filePath) {
    const meta = fileTypeStyle(it.fileName);
    media = `<div class="activity-item-icon" style="--file-color:${meta.color}">${meta.label}</div>`;
  } else {
    media = `<div class="activity-item-icon">${String(it.order).padStart(2,'0')}</div>`;
  }
  return `
    <div class="activity-item" style="--i:${itemIndex || 0}">
      ${media}
      <div class="activity-item-body">
        <div class="activity-item-top">
          <div>
            <p class="activity-title">${escapeHtml(it.title)}</p>
            ${it.desc ? `<p class="activity-desc">${escapeHtml(it.desc)}</p>` : ''}
            <div class="activity-links">
              ${fileUrl ? `<button type="button" class="activity-link activity-view-btn" data-view-unit="${unit.id}" data-view-week="${week.id}" data-view-activity="${act.id}" data-view-item="${it.id}">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
                Visualizar
              </button>` : ''}
              ${(fileUrl && state.role === 'admin') ? `<a class="activity-link" href="${fileUrl}" download="${escapeAttr(it.fileName || 'archivo')}" target="_blank" rel="noopener">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1.5v8m0 0L5 6.7M8 9.5l3-2.8M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Descargar
              </a>` : ''}
              ${state.role === 'admin' ? `<label class="activity-link activity-replace-btn">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M12 2.5v2.6H9.4M4 13.5v-2.6h2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Reemplazar
                <input type="file" class="activity-replace-input" hidden data-replace-unit="${unit.id}" data-replace-week="${week.id}" data-replace-activity="${act.id}" data-replace-item="${it.id}">
              </label>` : ''}
              ${it.link ? `<a class="activity-link" href="${escapeAttr(it.link)}" target="_blank" rel="noopener">Ver enlace ↗</a>` : ''}
            </div>
          </div>
          ${state.role === 'admin' ? `<button class="activity-del" data-del-unit="${unit.id}" data-del-week="${week.id}" data-del-activity="${act.id}" data-del-item="${it.id}" title="Eliminar actividad">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.7 7.2v4M9.3 7.2v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ---------- modal de nuevo elemento ---------- */
function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('activity-title').focus();
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('activity-form').reset();
  document.getElementById('activity-file-name').textContent = '';
  pendingFiles = [];
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

/* ---------- modal de nuevo apartado de actividad (ej. "Actividad 3") ---------- */
let pendingSlot = { unitId: null, weekId: null };

function openSlotModal() {
  document.getElementById('slot-modal-overlay').classList.remove('hidden');
  const nameInput = document.getElementById('slot-name');
  nameInput.focus();
  nameInput.select();
}
function closeSlotModal() {
  document.getElementById('slot-modal-overlay').classList.add('hidden');
  document.getElementById('slot-form').reset();
}
document.getElementById('slot-modal-close').addEventListener('click', closeSlotModal);
document.getElementById('slot-modal-cancel').addEventListener('click', closeSlotModal);
document.getElementById('slot-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'slot-modal-overlay') closeSlotModal();
});

document.getElementById('slot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('slot-name').value.trim();
  if (!name) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creando…'; }

  const unit = state.units.find(u => u.id === pendingSlot.unitId);
  const week = unit.weeks.find(w => w.id === pendingSlot.weekId);
  const nextOrder = week.activities.length ? Math.max(...week.activities.map(a => a.order)) + 1 : 1;

  try {
    if (!sb) throw new Error('Supabase no está configurado.');
    const row = { unit_id: unit.id, week_id: week.id, name, slot_order: nextOrder };
    const { data, error } = await sb.from('activities').insert(row).select().single();
    if (error) throw error;
    week.activities.push({ id: data.id, name: data.name, order: data.slot_order, items: [] });
    closeSlotModal();
    renderUnit(currentUnitId);
    // abre la semana automáticamente para que se vea el apartado recién creado
    setTimeout(() => {
      const row = document.querySelector(`.week-row[data-week="${week.id}"]`);
      if (row && !row.classList.contains('open')) row.classList.add('open');
    }, 0);
  } catch (err) {
    console.error(err);
    alert('No se pudo crear el apartado: ' + (err.message || 'revisa tu conexión o la configuración de Supabase.'));
  }

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Crear'; }
});

/* ---------- modal de visualización de archivos (sin necesidad de descargar) ---------- */
let activeZoomCleanup = null;

function openViewer(it) {
  if (activeZoomCleanup) { activeZoomCleanup(); activeZoomCleanup = null; }

  document.getElementById('viewer-title').textContent = it.title || 'Vista previa';
  document.getElementById('viewer-overlay').classList.remove('hidden');
  const body = document.getElementById('viewer-body');

  const url = getPublicFileUrl(it.filePath);
  const type = it.fileType || '';
  const name = it.fileName || 'archivo';

  if (!url) {
    body.innerHTML = `<div class="viewer-fallback"><p>Este elemento no tiene un archivo asociado.</p></div>`;
    return;
  }

  if (type.startsWith('image/')) {
    body.innerHTML = `
      <div class="viewer-img-wrap" id="viewer-img-wrap" title="Arrastra o usa el scroll para moverte · Ctrl + rueda para zoom">
        <img class="viewer-img" id="viewer-img" src="${url}" alt="${escapeAttr(it.title || name)}" draggable="false">
      </div>
      <div class="viewer-zoom-controls">
        <button type="button" id="viewer-zoom-out" title="Alejar">−</button>
        <span id="viewer-zoom-level">100%</span>
        <button type="button" id="viewer-zoom-in" title="Acercar">+</button>
        <button type="button" id="viewer-zoom-reset" title="Restablecer">⤢</button>
      </div>`;
    setupImageZoom(document.getElementById('viewer-img-wrap'), document.getElementById('viewer-img'));
  } else if (type === 'application/pdf') {
    body.innerHTML = `<iframe class="viewer-frame" src="${url}" title="${escapeAttr(name)}"></iframe>`;
  } else if (type.startsWith('video/')) {
    body.innerHTML = `<video class="viewer-video" src="${url}" controls autoplay></video>`;
  } else if (type.startsWith('audio/')) {
    body.innerHTML = `<audio class="viewer-audio" src="${url}" controls autoplay></audio>`;
  } else if (type.startsWith('text/')) {
    body.innerHTML = `<iframe class="viewer-frame" src="${url}" title="${escapeAttr(name)}"></iframe>`;
  } else {
    body.innerHTML = `
      <div class="viewer-fallback">
        <div class="activity-item-icon viewer-fallback-icon">${name.split('.').pop().slice(0,4).toUpperCase()}</div>
        <p>La vista previa dentro del navegador no está disponible para este tipo de archivo (<strong>${escapeHtml(name)}</strong>).</p>
        ${state.role === 'admin' ? `<a class="btn btn-primary" href="${url}" download="${escapeAttr(name)}">Descargar archivo</a>` : ''}
      </div>`;
  }
}

/* zoom + arrastre (mouse y táctil) para la imagen dentro del visor */
function setupImageZoom(wrap, img) {
  // El visor mantiene la imagen realmente centrada. Antes se usaba
  // `inset: 0` junto con una escala CSS, lo que hacía que el navegador
  // dimensionara primero la imagen al ancho del contenedor y luego la
  // redujera; por eso podía aparecer corrida hacia un lado.
  let baseScale = 1;
  let userZoom = 0.3; // arranca bien alejado (30%) para ver la infografía completa de un vistazo
  let tx = 0, ty = 0;
  let dragging = false, dragStartX = 0, dragStartY = 0, dragOrigTx = 0, dragOrigTy = 0;
  let touchStartDist = 0, touchStartZoom = 1, touchPanStart = null;
  const MIN_ZOOM = 0.3, MAX_ZOOM = 6;
  const label = () => document.getElementById('viewer-zoom-level');

  function currentScale() { return baseScale * userZoom; }

  function computeBaseScale() {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const rect = wrap.getBoundingClientRect();
    const fitWidth = rect.width / img.naturalWidth;
    const fitHeight = rect.height / img.naturalHeight;
    const isLandscape = img.naturalWidth >= img.naturalHeight;

    // Verticales (infografías, capturas, tareas): priorizamos el ancho para
    // que sean legibles y permitimos desplazamiento vertical.
    // Horizontales: caben completas dentro del visor.
    baseScale = isLandscape ? Math.min(fitWidth, fitHeight) : fitWidth;
  }

  function renderedSize() {
    const s = currentScale();
    return {
      width: img.naturalWidth * s,
      height: img.naturalHeight * s
    };
  }

  function clampOffset() {
    if (!img.naturalWidth) return;
    const rect = wrap.getBoundingClientRect();
    const size = renderedSize();
    const maxX = Math.max(0, (size.width - rect.width) / 2);
    const maxY = Math.max(0, (size.height - rect.height) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  function apply() {
    const s = currentScale();
    // El centro geométrico de la imagen queda exactamente en el centro del
    // contenedor; tx/ty son únicamente el desplazamiento realizado por el usuario.
    img.style.width = `${img.naturalWidth * s}px`;
    img.style.height = `${img.naturalHeight * s}px`;
    img.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
    if (label()) label().textContent = Math.round(userZoom * 100) + '%';
  }

  function setZoom(newZoom, originX = 0, originY = 0) {
    newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    if (Math.abs(newZoom - userZoom) < 0.001) return;

    // Mantiene el punto bajo el cursor en una posición estable al hacer zoom.
    const f = newZoom / userZoom;
    tx = originX * (1 - f) + f * tx;
    ty = originY * (1 - f) + f * ty;
    userZoom = newZoom;
    clampOffset();
    apply();
  }

  function initSize() {
    computeBaseScale();
    tx = 0;
    ty = 0;
    userZoom = 0.3; // se abre alejado (30%) en vez de al 100%
    apply();
    img.classList.add('ready');
  }

  if (img.complete && img.naturalWidth) initSize();
  else img.addEventListener('load', initSize, { once: true });

  const onResize = () => {
    computeBaseScale();
    clampOffset();
    apply();
  };
  window.addEventListener('resize', onResize);

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      setZoom(userZoom + userZoom * (e.deltaY < 0 ? 0.22 : -0.22), mx, my);
    } else {
      if (e.shiftKey) tx -= e.deltaY;
      else ty -= e.deltaY;
      clampOffset();
      apply();
    }
  }

  function onDblClick(e) {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    if (userZoom > 1.05) setZoom(1, 0, 0);
    else setZoom(2.4, mx, my);
  }

  function onPointerDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true;
    wrap.classList.add('dragging');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigTx = tx;
    dragOrigTy = ty;
    wrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    tx = dragOrigTx + (e.clientX - dragStartX);
    ty = dragOrigTy + (e.clientY - dragStartY);
    clampOffset();
    apply();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    try { wrap.releasePointerCapture(e.pointerId); } catch (err) { /* no crítico */ }
  }

  // Táctil: un dedo desplaza, dos dedos hacen zoom.
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      touchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartZoom = userZoom;
    } else if (e.touches.length === 1) {
      touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const rect = wrap.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left - rect.width / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top - rect.height / 2;
      setZoom(touchStartZoom * (dist / (touchStartDist || dist)), midX, midY);
    } else if (e.touches.length === 1 && touchPanStart) {
      tx = touchPanStart.tx + (e.touches[0].clientX - touchPanStart.x);
      ty = touchPanStart.ty + (e.touches[0].clientY - touchPanStart.y);
      clampOffset();
      apply();
    }
  }

  function onTouchEnd() { touchPanStart = null; }

  wrap.addEventListener('wheel', onWheel, { passive: false });
  wrap.addEventListener('dblclick', onDblClick);
  wrap.addEventListener('pointerdown', onPointerDown);
  wrap.addEventListener('pointermove', onPointerMove);
  wrap.addEventListener('pointerup', onPointerUp);
  wrap.addEventListener('pointercancel', onPointerUp);
  wrap.addEventListener('touchstart', onTouchStart, { passive: true });
  wrap.addEventListener('touchmove', onTouchMove, { passive: false });
  wrap.addEventListener('touchend', onTouchEnd);

  const btnIn = document.getElementById('viewer-zoom-in');
  const btnOut = document.getElementById('viewer-zoom-out');
  const btnReset = document.getElementById('viewer-zoom-reset');
  if (btnIn) btnIn.addEventListener('click', () => setZoom(userZoom + 0.5));
  if (btnOut) btnOut.addEventListener('click', () => setZoom(userZoom - 0.5));
  if (btnReset) btnReset.addEventListener('click', () => {
    userZoom = 0.3;
    tx = 0;
    ty = 0;
    clampOffset();
    apply();
  });

  activeZoomCleanup = () => window.removeEventListener('resize', onResize);
}

function closeViewer() {
  if (activeZoomCleanup) { activeZoomCleanup(); activeZoomCleanup = null; }
  document.getElementById('viewer-overlay').classList.add('hidden');
  document.getElementById('viewer-body').innerHTML = '';
}
document.getElementById('viewer-close').addEventListener('click', closeViewer);
document.getElementById('viewer-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'viewer-overlay') closeViewer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeViewer();
});

document.getElementById('activity-file').addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  const nameEl = document.getElementById('activity-file-name');
  pendingFiles = files; // los File se suben directo a Supabase Storage al enviar el formulario
  nameEl.textContent = !files.length
    ? ''
    : files.length === 1
      ? `Seleccionado: ${files[0].name}`
      : `${files.length} archivos seleccionados: ${files.map(f => f.name).join(', ')}`;
});

document.getElementById('activity-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('activity-title').value.trim();
  const desc = document.getElementById('activity-desc').value.trim();
  const link = document.getElementById('activity-link').value.trim();
  if (!title) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando…'; }

  const unit = state.units.find(u => u.id === pendingActivity.unitId);
  const week = unit.weeks.find(w => w.id === pendingActivity.weekId);
  const act = week.activities.find(a => a.id === pendingActivity.activityId);
  const nextOrder = act.items.length ? Math.max(...act.items.map(it => it.order)) + 1 : 1;
  const filesToAdd = pendingFiles.length ? pendingFiles : [null];

  try {
    if (!sb) throw new Error('Supabase no está configurado (revisa SUPABASE_URL / SUPABASE_ANON_KEY en script.js).');

    for (let i = 0; i < filesToAdd.length; i++) {
      const file = filesToAdd[i];
      let filePath = null;
      if (file) {
        filePath = makeFilePath('items', file.name);
        await uploadFile(filePath, file);
      }
      const row = {
        unit_id: unit.id,
        week_id: week.id,
        activity_id: act.id,
        item_order: nextOrder + i,
        title: filesToAdd.length > 1 ? `${title} — ${file.name}` : title,
        description: desc || null,
        link: link || null,
        file_path: filePath,
        file_name: file ? file.name : null,
        file_type: file ? file.type : null
      };
      const { data, error } = await sb.from('portfolio_items').insert(row).select().single();
      if (error) throw error;
      act.items.push({
        id: data.id,
        order: data.item_order,
        title: data.title,
        desc: data.description,
        link: data.link,
        filePath: data.file_path,
        fileName: data.file_name,
        fileType: data.file_type
      });
    }
  } catch (err) {
    console.error(err);
    alert('No se pudo guardar: ' + (err.message || 'revisa tu conexión o la configuración de Supabase.'));
  }

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar'; }
  closeModal();
  renderUnit(currentUnitId);
});

/* ---------- utilidades ---------- */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

/* ---------- diagrama ERD decorativo en Home ---------- */
function drawErd() {
  const svg = document.getElementById('erd-svg');
  const nodes = [
    { x: 60, y: 40, w: 130, h: 46, label: 'UNIDAD_I', c: UNIT_COLORS[0] },
    { x: 230, y: 110, w: 130, h: 46, label: 'UNIDAD_II', c: UNIT_COLORS[1] },
    { x: 60, y: 190, w: 130, h: 46, label: 'UNIDAD_III', c: UNIT_COLORS[2] },
    { x: 230, y: 260, w: 130, h: 46, label: 'UNIDAD_IV', c: UNIT_COLORS[3] },
    { x: 120, y: 340, w: 170, h: 46, label: 'PORTAFOLIO', c: '#e9edf7' }
  ];
  const lines = [[0, 4], [1, 4], [2, 4], [3, 4], [0, 1], [2, 3]];
  let svgContent = '';
  lines.forEach(([a, b]) => {
    const n1 = nodes[a], n2 = nodes[b];
    const x1 = n1.x + n1.w / 2, y1 = n1.y + n1.h / 2;
    const x2 = n2.x + n2.w / 2, y2 = n2.y + n2.h / 2;
    svgContent += `<line class="erd-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  });
  nodes.forEach((n, i) => {
    const isMain = i === nodes.length - 1;
    svgContent += `
      <rect class="erd-node-box ${isMain ? 'active' : ''}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" style="stroke:${isMain ? '#ff2166' : n.c}"/>
      <circle class="erd-dot" cx="${n.x + 14}" cy="${n.y + n.h / 2}" r="3.5" style="fill:${n.c}"/>
      <text class="${isMain ? 'erd-label-strong' : 'erd-label'}" x="${n.x + 26}" y="${n.y + n.h / 2 + 4}" style="${isMain ? '' : `fill:${n.c}`}">${n.label}</text>
    `;
  });
  svg.innerHTML = svgContent;
}

/* ---------- fondo: video en loop (con respaldo robusto si el navegador bloquea el autoplay) ---------- */
function initBgVideo() {
  const video = document.getElementById('bg-video');
  if (!video) return;

  // refuerza lo que ya pide el HTML: algunos navegadores solo respetan
  // el autoplay si estas propiedades también se fijan por JS.
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('muted', '');
  video.playsInline = true;

  let resumeListenersAttached = false;
  const RESUME_EVENTS = ['pointerdown', 'click', 'touchstart', 'keydown', 'scroll', 'wheel'];

  const attachResumeListeners = () => {
    if (resumeListenersAttached) return;
    resumeListenersAttached = true;
    const resume = () => {
      video.play().then(detachResumeListeners).catch(() => {});
    };
    const detachResumeListeners = () => {
      RESUME_EVENTS.forEach(evt => document.removeEventListener(evt, resume));
      resumeListenersAttached = false;
    };
    RESUME_EVENTS.forEach(evt => document.addEventListener(evt, resume, { passive: true }));
  };

  const tryPlay = () => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.then(() => {
        // se reprodujo bien, no hace falta ningún respaldo
      }).catch(() => attachResumeListeners());
    }
  };

  // intenta apenas hay datos suficientes, y también de inmediato
  video.addEventListener('loadedmetadata', tryPlay);
  video.addEventListener('canplay', tryPlay);
  tryPlay();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause(); else tryPlay();
  });
}

/* ---------- cursor personalizado tipo mira ---------- */
/* ---------- interacciones especiales de los botones del hero (login / sobre mí) ---------- */
function initHeroButtons() {
  const buttons = document.querySelectorAll('.hero-btn');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  buttons.forEach(btn => {
    // efecto magnético: el botón se inclina levemente siguiendo al cursor
    if (!reduceMotion) {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const rotateX = (-y / rect.height) * 12;
        const rotateY = (x / rect.width) * 12;
        btn.style.transform = `perspective(400px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px) scale(1.035)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'perspective(400px)';
      });
    }

    // ondas expansivas al hacer clic
    btn.addEventListener('click', (e) => {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'hero-btn-ripple';
      const size = Math.max(rect.width, rect.height) * 1.8;
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });
}

/* ---------- inclinación 3D suave para la foto de "Sobre mí" ---------- */
function initPhotoTilt() {
  const photo = document.getElementById('about-photo');
  if (!photo) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  photo.addEventListener('mousemove', (e) => {
    const rect = photo.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = (-y / rect.height) * 16;
    const rotateY = (x / rect.width) * 16;
    photo.style.transform = `perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.04)`;
  });
  photo.addEventListener('mouseleave', () => {
    photo.style.transform = 'perspective(500px)';
  });
}

/* ---------- botón de "dato curioso" en Sobre mí ---------- */
const FUN_FACTS = [
  { icon: '🧤', text: 'Como arquero, mi mayor cualidad es la concentración bajo presión — la misma que uso para depurar una consulta SQL a las 2 a.m.' },
  { icon: '🎮', text: 'He perdido la cuenta de cuántos "rollback" he hecho... tanto en una base de datos como en una partida en línea.' },
  { icon: '☕', text: 'Mi combo favorito para programar: café, buena música y una consulta bien optimizada.' },
  { icon: '⚡', text: 'Si las bases de datos tuvieran modo competitivo, ya estaría en rango máximo de normalización.' },
  { icon: '🥅', text: 'Fuera de la cancha, atajo balones. Frente al teclado, atajo errores de sintaxis.' },
  { icon: '🕹️', text: 'Cuando no estoy en clases de Ingeniería de Sistemas, lo más probable es que esté jugando algo o pateando un balón.' }
];
let funFactIndex = -1;
function initFunFactButton() {
  const btn = document.getElementById('fun-fact-btn');
  if (!btn) return;
  const textEl = document.getElementById('fun-fact-text');
  const iconEl = document.getElementById('fun-fact-icon');
  const hintEl = btn.querySelector('.fun-fact-hint');

  btn.addEventListener('click', () => {
    funFactIndex = (funFactIndex + 1) % FUN_FACTS.length;
    const fact = FUN_FACTS[funFactIndex];
    textEl.classList.add('swapping');
    setTimeout(() => {
      textEl.textContent = fact.text;
      iconEl.textContent = fact.icon;
      if (hintEl) hintEl.textContent = 'siguiente →';
      textEl.classList.remove('swapping');
    }, 180);
  });
}

function initCustomCursor() {
  const cursor = document.getElementById('custom-cursor');
  if (!window.matchMedia('(pointer: fine)').matches) return;

  window.addEventListener('pointermove', (e) => {
    cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  });
  window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));

  const hoverSelector = 'button, a, input, textarea, .unit-card, [role="tab"], [data-goto]';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(hoverSelector)) cursor.classList.add('is-hover');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(hoverSelector)) cursor.classList.remove('is-hover');
  });
}

/* ============================================================
   CHATBOT ANIME · "Aiko" — asistente de preguntas frecuentes
   (basado en reglas/palabras clave; no requiere servidor ni IA externa)
   ============================================================ */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
}

const CHAT_QUICK_REPLIES = [
  '¿Quién es José?',
  '¿De qué trata este curso?',
  '¿Qué unidades hay?',
  '¿Cómo veo las actividades?',
  '¿Cómo inicio sesión?'
];

const CHAT_RULES = [
  {
    keywords: ['quien es jose', 'quien eres tu creador', 'sobre jose', 'quien es el autor', 'de quien es este portafolio', 'quien es'],
    reply: 'Este portafolio es de <strong>Jose Daniel Perez Villalva</strong>, estudiante de Ingeniería de Sistemas 👨‍💻. Fuera de clases le encantan los videojuegos y juega fútbol como arquero. Puedes ver más en la sección "Sobre mí".'
  },
  {
    keywords: ['curso', 'materia', 'de que trata', 'asignatura', 'base de datos'],
    reply: 'Este es el portafolio de la asignatura <strong>Base de Datos II</strong>, enfocado en arquitecturas corporativas, alta disponibilidad, seguridad y administración de instancias con SQL Server Management Studio.'
  },
  {
    keywords: ['unidad', 'unidades', 'temas', 'contenido del curso'],
    reply: 'El curso tiene 4 unidades: <strong>I.</strong> Arquitecturas y configuración del entorno · <strong>II.</strong> Administración de instancias y almacenamiento · <strong>III.</strong> Seguridad, red y alta disponibilidad · <strong>IV.</strong> Monitoreo, desempeño y Flashback. Puedes verlas todas en "Unidades" del menú.'
  },
  {
    keywords: ['actividad', 'actividades', 'tarea', 'ver archivo', 'subir archivo', 'como veo', 'como subo'],
    reply: 'Cada unidad tiene 4 semanas, y cada semana tiene Actividad 1 y Actividad 2. Ahí puedes visualizar los archivos directamente sin descargarlos, o descargarlos si prefieres. Solo el administrador puede subir o borrar elementos.'
  },
  {
    keywords: ['iniciar sesion', 'login', 'entrar', 'contrasena', 'usuario', 'admin', 'administrador'],
    reply: 'Desde el botón "Iniciar sesión" puedes entrar como <strong>administrador</strong> (para cargar o borrar actividades) o como <strong>usuario</strong> (modo lectura, solo para ver el contenido).'
  },
  {
    keywords: ['videojuego', 'gamer', 'jugar', 'futbol', 'arquero', 'portero', 'hobby', 'hobbies', 'pasatiempo'],
    reply: 'A José le encantan los videojuegos, y en las canchas de fútbol juega de arquero — dice que ahí es donde mejor rinde 🧤⚽'
  },
  {
    keywords: ['quien eres', 'tu nombre', 'como te llamas', 'que eres'],
    reply: 'Soy <strong>Aiko</strong>, la asistente de este portafolio 🌸 Estoy aquí para ayudarte a moverte por el sitio y responder dudas rápidas sobre el curso.'
  },
  {
    keywords: ['contacto', 'correo', 'email', 'telefono', 'whatsapp'],
    reply: 'Por ahora este portafolio no tiene un correo de contacto público configurado. Si necesitas comunicarte con José, lo mejor es hacerlo directamente por los medios que ya conoces de la universidad.'
  },
  {
    keywords: ['gracias', 'genial', 'perfecto', 'excelente'],
    reply: '¡De nada! 💗 Aquí estaré si necesitas algo más.'
  },
  {
    keywords: ['hola', 'buenas', 'hey', 'que tal', 'buenos dias', 'buenas tardes', 'buenas noches'],
    reply: '¡Hola! 👋 Soy Aiko. Puedo ayudarte a navegar el portafolio de Base de Datos II. ¿Qué quieres saber?'
  },
  {
    keywords: ['adios', 'chao', 'nos vemos', 'bye'],
    reply: '¡Nos vemos! Vuelve cuando quieras 🌙'
  }
];

const CHAT_FALLBACK = 'Mmm, no estoy segura de haber entendido eso 🤔 Puedo ayudarte con el curso, las unidades, cómo ver actividades o cómo iniciar sesión. ¿Probamos con una de estas?';

function findChatReply(userText) {
  const text = normalize(userText);
  for (const rule of CHAT_RULES) {
    if (rule.keywords.some(k => text.includes(normalize(k)))) return rule.reply;
  }
  return CHAT_FALLBACK;
}

function chatAvatarSvg() {
  return '<svg viewBox="0 0 100 100"><use href="#chatbot-face"/></svg>';
}

function appendChatMessage(sender, html) {
  const list = document.getElementById('chatbot-messages');
  const row = document.createElement('div');
  row.className = `chat-msg ${sender}`;
  row.innerHTML = sender === 'bot'
    ? `<div class="chat-msg-avatar">${chatAvatarSvg()}</div><div class="chat-msg-bubble">${html}</div>`
    : `<div class="chat-msg-bubble">${html}</div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
  return row;
}

function renderChatQuickReplies() {
  const wrap = document.getElementById('chatbot-quick');
  wrap.innerHTML = CHAT_QUICK_REPLIES.map(q => `<button type="button" class="chat-quick-btn">${escapeHtml(q)}</button>`).join('');
  wrap.querySelectorAll('.chat-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => sendChatMessage(btn.textContent));
  });
}

function sendChatMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  appendChatMessage('user', escapeHtml(trimmed));

  const list = document.getElementById('chatbot-messages');
  const typingRow = document.createElement('div');
  typingRow.className = 'chat-msg bot';
  typingRow.innerHTML = `<div class="chat-msg-avatar">${chatAvatarSvg()}</div><div class="chat-msg-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  list.appendChild(typingRow);
  list.scrollTop = list.scrollHeight;

  const delay = 450 + Math.random() * 500;
  setTimeout(() => {
    typingRow.remove();
    appendChatMessage('bot', findChatReply(trimmed));
  }, delay);
}

function initChatbot() {
  const fab = document.getElementById('chatbot-fab');
  const panel = document.getElementById('chatbot-panel');
  const hint = document.getElementById('chatbot-hint');
  const closeBtn = document.getElementById('chatbot-close');
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chatbot-input');
  let opened = false;

  renderChatQuickReplies();

  fab.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    hint.classList.add('hidden');
    if (!panel.classList.contains('hidden')) {
      if (!opened) {
        opened = true;
        appendChatMessage('bot', '¡Hola! Soy <strong>Aiko</strong> 🌸 Bienvenido al portafolio de Base de Datos II de José. ¿En qué te ayudo?');
      }
      input.focus();
    }
  });

  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    sendChatMessage(text);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) panel.classList.add('hidden');
  });
}

/* ---------- inicialización ---------- */
async function init() {
  drawErd();
  initBgVideo();
  initCustomCursor();
  initHeroButtons();
  initPhotoTilt();
  initFunFactButton();
  initChatbot();

  // carga los datos reales desde Supabase antes de pintar cualquier contenido dinámico
  await loadActivitiesFromDB(); // primero los "apartados" de cada semana...
  await Promise.all([loadProfileFromDB(), loadItemsFromDB()]); // ...luego el perfil y los elementos dentro de ellos

  const name = state.profileName || PROFILE_DEFAULTS.name;
  document.getElementById('about-initials').textContent = PROFILE_DEFAULTS.initials;
  document.getElementById('about-name').textContent = name;
  renderProfilePhoto();
  renderPreviewStrip();
  updateNavRole();

  if (state.role) {
    showScreen('dashboard');
  } else {
    showScreen('home');
    document.getElementById('chatbot-widget').classList.add('visible'); // showScreen('home') no dispara el swap si ya estaba activa al cargar
  }
}

init();
