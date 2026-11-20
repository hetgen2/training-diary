'use strict';

const KEY = 'trainlog.sets.v1';
const KEY_DAYS = 'trainlog.days.v1';
const TYPES = { up: { full: 'Верх', short: 'В' }, down: { full: 'Низ', short: 'Н' } };
const START_DELAY = 3;              
const sets = load();
const days = loadDays();
let kind = 'strength';
let showAll = false;                 
let selDay = dayOf(Date.now());      
let month = new Date();              
month.setDate(1);

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY)) || [];
    list.forEach(fixKind);
    return list;
  } catch { return []; }
}
function loadDays() {
  try { return JSON.parse(localStorage.getItem(KEY_DAYS)) || {}; } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
    localStorage.setItem(KEY_DAYS, JSON.stringify(days));
  } catch { alert('Не удалось сохранить данные.'); }
}

function fixKind(s) { if (s.kind === 'static') s.kind = 'time'; }


const $ = (sel) => document.querySelector(sel);
const norm = (s) => s.trim().toLowerCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (sel) => parseFloat($(sel).value.replace(',', '.')) || 0;

function dayOf(ts) { return new Date(ts).toLocaleDateString('sv'); } // формат ГГГГ-ММ-ДД
function dateOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const longDay = (day) => cap(dateOf(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
const shortDay = (day) => `${dateOf(day).toLocaleDateString('ru-RU', { weekday: 'short' })} ${day.slice(8)}.${day.slice(5, 7)}`;

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function fmtTime(total) {
  const t = Math.round(total * 10) / 10;
  const m = Math.floor(t / 60);
  const s = Number((t - m * 60).toFixed(1));
  if (!m) return `${s} с`;
  return s ? `${m} мин ${s} с` : `${m} мин`;
}

function fmt(s) {
  if (s.kind === 'time') return fmtTime(s.secs);
  return s.weight ? `${s.weight} кг × ${s.reps}` : `${s.reps} повт.`;
}

function exercises() {
  const names = new Map();
  for (const s of sets) names.set(norm(s.ex), s.ex);
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'ru'));
}

function lastOf(name) {
  for (let i = sets.length - 1; i >= 0; i--) if (norm(sets[i].ex) === norm(name)) return sets[i];
  return null;
}


function fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'меньше минуты';
  const h = Math.floor(min / 60);
  return h ? `${h} ч ${min % 60} мин` : `${min} мин`;
}


function durationLine(daySets) {
  if (daySets.length < 2) return null;
  const times = daySets.map((s) => s.ts);
  return el('p', `Время тренировки: ${fmtDuration(Math.max(...times) - Math.min(...times))}`, 'total');
}


function dayTypeControl(day) {
  const box = el('div', undefined, 'daytype');
  box.append(el('span', 'День', 'muted'));
  for (const [key, t] of Object.entries(TYPES)) {
    const b = el('button', t.full);
    b.type = 'button';
    if (days[day] === key) b.className = 'on';
    b.onclick = () => {
      if (days[day] === key) delete days[day];
      else days[day] = key;
      showAll = false;
      save();
      renderAll();
    };
    box.append(b);
  }
  return box;
}


function renderGroups(box, daySets) {
  const groups = new Map();
  for (const s of daySets) {
    const k = norm(s.ex);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const wrap = el('div', undefined, 'groups');
  for (const list of groups.values()) {
    const card = el('div', undefined, 'card');
    card.append(el('h3', list[0].ex));
    list.forEach((s, i) => {
      const row = el('div', undefined, 'set');
      row.append(el('span', `${i + 1}. ${fmt(s)}`));
      const del = el('button', '×', 'del');
      del.setAttribute('aria-label', 'Удалить подход');
      del.onclick = () => removeSet(s.id);
      row.append(del);
      card.append(row);
    });
    wrap.append(card);
  }
  box.append(wrap);
}

function renderLists() {
  const names = exercises();
  const sel = $('#pex');
  const current = sel.value;
  sel.replaceChildren(...names.map((n) => { const o = el('option', n); o.value = n; return o; }));
  if (names.includes(current)) sel.value = current;
}


function suggestions(onlyType) {
  const type = days[dayOf(Date.now())];
  const found = new Map();
  for (const s of sets) {
    if (s.kind !== kind) continue;
    if (onlyType && days[dayOf(s.ts)] !== type) continue;
    const k = norm(s.ex);
    const item = found.get(k) || { name: s.ex, n: 0 };
    item.name = s.ex;
    item.n++;
    found.set(k, item);
  }
  return [...found.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
}

function renderChips() {
  const box = $('#chips');
  box.replaceChildren();
  const type = days[dayOf(Date.now())];
  const q = norm($('#ex').value);
  const list = suggestions(Boolean(type) && !showAll).filter((x) => norm(x.name).includes(q));
  for (const x of list) {
    const b = el('button', x.name, 'chip');
    b.type = 'button';
    if (norm(x.name) === q) b.classList.add('on');
    b.onclick = () => { $('#ex').value = x.name; onExercise(); };
    box.append(b);
  }

  if (type && suggestions(false).length > suggestions(true).length) {
    const more = el('button', showAll ? `Только ${TYPES[type].full.toLowerCase()}` : 'Все', 'chip more');
    more.type = 'button';
    more.onclick = () => { showAll = !showAll; renderChips(); };
    box.append(more);
  }
}

function renderToday() {
  const today = dayOf(Date.now());
  $('#today-type').replaceChildren(dayTypeControl(today));
  const box = $('#list');
  box.replaceChildren();
  const list = sets.filter((s) => dayOf(s.ts) === today);
  if (!list.length) box.append(el('p', 'Сегодня подходов нет. Запишите первый.', 'muted'));
  else {
    const total = durationLine(list);
    if (total) box.append(total);
    renderGroups(box, list);
  }
}

function renderDays() {
  $('#month').textContent = cap(month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }));
  const y = month.getFullYear();
  const m = month.getMonth();
  const trained = new Set(sets.map((s) => dayOf(s.ts)));
  const today = dayOf(Date.now());

  const cal = $('#cal');
  cal.replaceChildren();
  for (const w of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) cal.append(el('span', w, 'wd'));
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;   // неделя начинается с понедельника
  for (let i = 0; i < offset; i++) cal.append(el('span'));
  const count = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= count; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const b = el('button', String(d), 'day');
    b.type = 'button';
    if (days[key]) b.append(el('sup', TYPES[days[key]].short));
    if (trained.has(key)) b.classList.add('has');
    if (key === today) b.classList.add('now');
    if (key === selDay) b.classList.add('sel');
    b.onclick = () => { selDay = key; renderDays(); };
    cal.append(b);
  }

  const box = $('#day');
  box.replaceChildren(el('h2', longDay(selDay)), dayTypeControl(selDay));
  const list = sets.filter((s) => dayOf(s.ts) === selDay);
  if (!list.length) box.append(el('p', 'В этот день подходов нет.', 'muted'));
  else {
    const total = durationLine(list);
    if (total) box.append(total);
    renderGroups(box, list);
  }
}

function renderEx() {
  const box = $('#chart');
  box.replaceChildren();
  const name = $('#pex').value;
  if (!name) { box.append(el('p', 'Данных пока нет.', 'muted')); return; }


  const best = new Map();
  for (const s of sets.filter((x) => norm(x.ex) === norm(name))) {
    const score = s.kind === 'time' ? s.secs : (s.weight || s.reps);
    const d = dayOf(s.ts);
    if (!best.has(d) || score > best.get(d).score) best.set(d, { score, s });
  }
  const all = [...best.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...all.map(([, v]) => v.score));
  const record = all.find(([, v]) => v.score === max)[1].s;
  box.append(el('p', `Рекорд: ${fmt(record)}`, 'record'));

  for (const [d, v] of all.slice(-14).reverse()) {
    const row = el('div', undefined, 'bar');
    row.append(el('span', shortDay(d), 'bd'));
    const track = el('div', undefined, 'track');
    const fill = el('i');
    fill.style.width = `${(v.score / max) * 100}%`;
    if (v.score === max) fill.className = 'top';
    track.append(fill);
    row.append(track, el('span', fmt(v.s)));
    box.append(row);
  }
}

function renderAll() {
  renderLists();
  renderToday();
  renderChips();
  renderDays();
  renderEx();
}


function removeSet(id) {
  const i = sets.findIndex((s) => s.id === id);
  if (i >= 0) sets.splice(i, 1);
  save();
  renderAll();
}

function setKind(k) {
  kind = k;
  document.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === k));
  $('#f-strength').hidden = k !== 'strength';
  $('#f-time').hidden = k !== 'time';
  renderChips();
}


function onExercise() {
  const last = lastOf($('#ex').value);
  $('#hint').textContent = last ? `В прошлый раз: ${fmt(last)}` : '';
  if (!last) return;
  setKind(last.kind);
  if (last.kind === 'strength') $('#weight').value = last.weight || '';
}

$('#ex').addEventListener('change', onExercise);
$('#ex').addEventListener('input', renderChips);

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const ex = $('#ex').value.trim();
  if (!ex) return;
  const s = { id: Date.now(), ts: Date.now(), ex, kind };
  if (kind === 'time') {
    s.secs = Math.round((num('#mins') * 60 + num('#secs')) * 10) / 10;
    if (!s.secs) return;
  } else {
    s.weight = num('#weight');
    s.reps = Math.round(num('#reps'));
    if (!s.reps) return;
  }
  sets.push(s);
  save();
  $('#reps').value = '';
  $('#mins').value = '';
  $('#secs').value = '';
  resetTimer();
  renderAll();
  onExercise();
});


let t0 = 0;
let tick = null;       
let countdown = null;  
let audio = null;


function beep(freq, ms) {
  try {
    audio = audio || new AudioContext();
    const osc = audio.createOscillator();
    osc.frequency.value = freq;
    osc.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + ms / 1000);
  } catch { /* звук недоступен, это не страшно */ }
}

function resetTimer() {
  clearInterval(tick);
  clearInterval(countdown);
  tick = null;
  countdown = null;
  $('#timer').textContent = '▶ 0.0';
}

$('#timer').addEventListener('click', () => {
  if (tick) {                                  
    const total = (Date.now() - t0) / 1000;
    const m = Math.floor(total / 60);
    $('#mins').value = m || '';
    $('#secs').value = Number((total - m * 60).toFixed(1));
    resetTimer();
    return;
  }
  if (countdown) { resetTimer(); return; }      

  let left = START_DELAY;
  $('#timer').textContent = `${left}…`;
  beep(660, 120);
  countdown = setInterval(() => {
    left--;
    if (left > 0) {
      $('#timer').textContent = `${left}…`;
      beep(660, 120);
      return;
    }
    clearInterval(countdown);
    countdown = null;
    beep(880, 400);
    if (navigator.vibrate) navigator.vibrate(300);
    t0 = Date.now();
    tick = setInterval(() => { $('#timer').textContent = `■ ${((Date.now() - t0) / 1000).toFixed(1)}`; }, 100);
  }, 1000);
});


document.querySelectorAll('nav button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== b.dataset.tab; });
    if (b.dataset.tab === 'progress') { renderDays(); renderEx(); }
  });
});
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
document.querySelectorAll('[data-view]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    $('#v-days').hidden = b.dataset.view !== 'days';
    $('#v-ex').hidden = b.dataset.view !== 'ex';
  });
});
$('#pex').addEventListener('change', renderEx);

function shiftMonth(delta) {
  month.setMonth(month.getMonth() + delta);
  renderDays();
}
$('#prev').addEventListener('click', () => shiftMonth(-1));
$('#next').addEventListener('click', () => shiftMonth(1));


$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ sets, days }, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trainlog-${dayOf(Date.now())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import').addEventListener('change', async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
   
    const list = Array.isArray(data) ? data : data.sets;
    const dayTypes = Array.isArray(data) ? {} : (data.days || {});
    const ids = new Set(sets.map((s) => s.id));
    for (const s of list) {
      fixKind(s);
      const ok = s && typeof s.ex === 'string' && typeof s.ts === 'number' && (s.kind === 'time' || s.kind === 'strength');
      if (ok && !ids.has(s.id)) sets.push(s);
    }
    for (const [k, v] of Object.entries(dayTypes)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && TYPES[v] && !days[k]) days[k] = v;
    }
    sets.sort((a, b) => a.ts - b.ts);
    save();
    renderAll();
  } catch {
    alert('Не удалось прочитать файл. Нужна копия, сохранённая этим приложением.');
  }
  e.target.value = '';
});

$('#clear').addEventListener('click', () => {
  if (confirm('Удалить все записи? Это нельзя отменить.')) {
    sets.length = 0;
    for (const k of Object.keys(days)) delete days[k];
    save();
    renderAll();
  }
});


$('#date').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
setKind('strength');
renderAll();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
