const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MOODS = ['😞', '😕', '😐', '🙂', '💪'];

let today = new Date();
let todayKey = dateKey(today);
let currentMedia = []; // media rows for today, loaded from IndexedDB
let draftChecklist = {};
let draftRunning = { location: '', distanceKm: '' };
let draftMood = null;
let draftNote = '';

function el(sel, root = document) {
  return root.querySelector(sel);
}

function switchView(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'progress') renderProgress();
  if (view === 'history') renderHistory();
  if (view === 'why') renderWhy();
}

function renderHeader() {
  const settings = loadSettings();
  const dayNum = dayNumberFor(today, settings.startDate);
  const clamped = Math.max(1, Math.min(100, dayNum));
  el('#dayBadge').textContent = dayNum > 100 ? `סיימת את ה-100 ימים! 🎉` : dayNum < 1 ? `האתגר יתחיל בקרוב` : `יום ${clamped} מתוך 100`;
  el('#quoteCard').textContent = '"' + quoteForDay(Math.max(1, clamped)) + '"';
}

function loadTodayDraftFromEntry() {
  const entry = getEntry(todayKey);
  draftChecklist = { ...entry.checklist };
  draftRunning = entry.running ? { ...entry.running } : { location: '', distanceKm: '' };
  draftMood = entry.mood;
  draftNote = entry.note || '';
}

async function renderToday() {
  const habitsToday = habitsForDate(today);
  const wrap = el('#habitList');
  wrap.innerHTML = '';

  habitsToday.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'habit-row' + (draftChecklist[h.id] ? ' done' : '');
    row.innerHTML = `<span class="habit-icon">${h.icon}</span><span class="habit-label">${h.label}</span><span class="habit-check">✓</span>`;
    row.addEventListener('click', () => {
      draftChecklist[h.id] = !draftChecklist[h.id];
      renderToday();
    });
    wrap.appendChild(row);

    if (h.id === 'running' && draftChecklist.running) {
      const details = document.createElement('div');
      details.className = 'running-details';
      details.innerHTML = `
        <div>
          <label class="small-label">איפה רצת?</label>
          <input type="text" id="runLocation" placeholder="לדוגמה: הפארק" value="${draftRunning.location || ''}">
        </div>
        <div>
          <label class="small-label">כמה ק"מ?</label>
          <input type="number" id="runDistance" placeholder="5" min="0" step="0.1" value="${draftRunning.distanceKm || ''}">
        </div>`;
      wrap.appendChild(details);
      el('#runLocation', details).addEventListener('input', (e) => (draftRunning.location = e.target.value));
      el('#runDistance', details).addEventListener('input', (e) => (draftRunning.distanceKm = e.target.value));
    }
  });

  // mood
  const moodWrap = el('#moodRow');
  moodWrap.innerHTML = '';
  MOODS.forEach((m, i) => {
    const opt = document.createElement('div');
    opt.className = 'mood-option' + (draftMood === i + 1 ? ' selected' : '');
    opt.textContent = m;
    opt.addEventListener('click', () => {
      draftMood = i + 1;
      renderToday();
    });
    moodWrap.appendChild(opt);
  });

  el('#noteInput').value = draftNote;

  // media thumbs
  currentMedia = await getMediaForDate(todayKey);
  renderThumbs();

  el('#saveFlash').textContent = '';
}

function renderThumbs() {
  const thumbs = el('#thumbs');
  thumbs.innerHTML = '';
  currentMedia.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    const url = URL.createObjectURL(m.blob);
    div.innerHTML =
      m.type === 'photo' ? `<img src="${url}">` : `<video src="${url}" muted></video>`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteMedia(m.id);
      currentMedia = await getMediaForDate(todayKey);
      renderThumbs();
    });
    div.appendChild(del);
    thumbs.appendChild(div);
  });
}

function setupTodayHandlers() {
  el('#noteInput').addEventListener('input', (e) => (draftNote = e.target.value));

  el('#photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await addMedia(todayKey, 'photo', file);
    currentMedia = await getMediaForDate(todayKey);
    renderThumbs();
    e.target.value = '';
  });

  el('#videoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await addMedia(todayKey, 'video', file);
    currentMedia = await getMediaForDate(todayKey);
    renderThumbs();
    e.target.value = '';
  });

  el('#photoBtn').addEventListener('click', () => el('#photoInput').click());
  el('#videoBtn').addEventListener('click', () => el('#videoInput').click());

  el('#saveBtn').addEventListener('click', () => {
    const running = draftChecklist.running
      ? { location: draftRunning.location || '', distanceKm: draftRunning.distanceKm ? Number(draftRunning.distanceKm) : 0 }
      : null;
    saveEntry({
      date: todayKey,
      checklist: draftChecklist,
      running,
      mood: draftMood,
      note: draftNote,
    });
    el('#saveFlash').textContent = 'נשמר! 💪';
  });
}

// ---------------- Progress ----------------
function renderProgress() {
  const settings = loadSettings();
  const start = new Date(settings.startDate + 'T00:00:00');
  const entries = loadEntries();

  let fullDays = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let streakRun = 0;
  const runs = [];
  const moodPoints = [];
  const cells = [];
  let totalRuns = 0;
  let lastRunDate = null;

  for (let day = 1; day <= 100; day++) {
    const d = new Date(start.getTime() + (day - 1) * 86400000);
    const key = dateKey(d);
    // ריצה לא נדרשת בכל יום (היעד שבועי, לא ימים קבועים) - לא נכנסת לחישוב "יום מושלם"
    const applicable = habitsForDate(d).filter((h) => h.id !== 'running');
    const entry = entries[key];
    const doneCount = entry ? applicable.filter((h) => entry.checklist && entry.checklist[h.id]).length : 0;
    const isFull = applicable.length > 0 && doneCount === applicable.length;
    const isPartial = doneCount > 0 && !isFull;
    const isFuture = d > today;

    if (isFull) {
      fullDays++;
      streakRun++;
      longestStreak = Math.max(longestStreak, streakRun);
    } else if (!isFuture) {
      streakRun = 0;
    }

    if (!isFuture && entry) {
      if (entry.checklist && entry.checklist.running) {
        if (entry.running) runs.push({ date: key, ...entry.running });
        totalRuns++;
        lastRunDate = d;
      }
      if (entry.mood) moodPoints.push(entry.mood);
    }

    cells.push({ day, key, isFull, isPartial, isFuture, isToday: key === todayKey });
  }
  currentStreak = streakRun;

  const daysSinceRun = lastRunDate ? Math.floor((today - lastRunDate) / 86400000) : null;
  el('#statTotalRuns').textContent = totalRuns;
  const gapBox = el('#statRunGap').closest('.stat-box');
  el('#statRunGap').textContent = daysSinceRun === null ? '—' : daysSinceRun === 0 ? 'היום' : `${daysSinceRun} ימים`;
  gapBox.classList.remove('run-good', 'run-warn', 'run-bad');
  if (daysSinceRun !== null) {
    gapBox.classList.add(daysSinceRun <= 1 ? 'run-good' : daysSinceRun === 2 ? 'run-warn' : 'run-bad');
  }

  el('#statFull').textContent = fullDays;
  el('#statStreak').textContent = currentStreak;
  el('#statLongest').textContent = longestStreak;

  const grid = el('#calendarGrid');
  grid.innerHTML = '';
  cells.forEach((c) => {
    const cell = document.createElement('div');
    cell.className =
      'cal-cell' + (c.isFull ? ' full' : c.isPartial ? ' partial' : '') + (c.isFuture ? ' future' : '') + (c.isToday ? ' today' : '');
    cell.textContent = c.day;
    cell.title = c.key;
    grid.appendChild(cell);
  });

  const runList = el('#runList');
  runList.innerHTML = runs.length
    ? ''
    : '<div class="run-item"><span class="meta">עוד לא סימנת ריצות</span></div>';
  runs
    .slice()
    .reverse()
    .forEach((r) => {
      const item = document.createElement('div');
      item.className = 'run-item';
      item.innerHTML = `<span class="date">${r.date}</span><span class="meta">${r.location || '—'} · ${r.distanceKm || 0} ק"מ</span>`;
      runList.appendChild(item);
    });

  drawMoodChart(el('#moodChart'), moodPoints);
}

function drawMoodChart(canvas, points) {
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = canvas.clientHeight * 2);
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('עוד אין מספיק נתונים להצגת גרף מצב רוח', w / 2, h / 2);
    return;
  }
  const max = 5;
  const stepX = w / (points.length - 1);
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = i * stepX;
    const y = h - (p / max) * (h - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#ff5e7e';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  points.forEach((p, i) => {
    const x = i * stepX;
    const y = h - (p / max) * (h - 20) - 10;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#7b2ff7';
    ctx.fill();
  });
}

// ---------------- History ----------------
async function renderHistory() {
  const entries = loadEntries();
  const list = el('#historyList');
  list.innerHTML = '';
  const keys = Object.keys(entries).sort().reverse();
  if (!keys.length) {
    list.innerHTML = '<div class="history-item">עדיין אין תיעוד. תתחיל היום! 💪</div>';
    return;
  }
  for (const key of keys) {
    const entry = entries[key];
    const div = document.createElement('div');
    div.className = 'history-item';
    const chips = HABITS.filter((h) => entry.checklist && h.id in entry.checklist)
      .map((h) => `<span class="chip">${h.icon} ${entry.checklist[h.id] ? '✅' : '❌'}</span>`)
      .join('');
    const media = await getMediaForDate(key);
    const thumbsHtml = media
      .map((m) => {
        const url = URL.createObjectURL(m.blob);
        return m.type === 'photo' ? `<img src="${url}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;margin-left:4px">` : `<video src="${url}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;margin-left:4px" muted></video>`;
      })
      .join('');
    div.innerHTML = `
      <div class="date">${key}</div>
      <div class="chips">${chips}</div>
      ${entry.mood ? `<div>${MOODS[entry.mood - 1]}</div>` : ''}
      ${entry.note ? `<div class="note">${escapeHtml(entry.note)}</div>` : ''}
      ${thumbsHtml ? `<div class="thumbs">${thumbsHtml}</div>` : ''}
    `;
    list.appendChild(div);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------------- Why ----------------
const DEFAULT_WHY = `אני עושה את זה כדי:
- לסדר את הראש ולשפר את המצב המנטלי שלי
- לשפר את הכושר הגופני שלי
- לנצל את הזמן שלי בצורה נכונה יותר
- להפסיק לגמרי עם אלכוהול ועישון
- לישון יותר טוב ולצמצם את הזמן מול הפלאפון`;

function renderWhy() {
  const settings = loadSettings();
  if (!settings.whyText) settings.whyText = DEFAULT_WHY;
  el('#whyInput').value = settings.whyText;

  const syncDot = el('#syncDot');
  const enabled = window.Cloud && window.Cloud.isEnabled();
  syncDot.classList.toggle('on', !!enabled);
  el('#syncStatusText').textContent = enabled
    ? 'מסונכרן בין המכשירים'
    : window.Cloud && window.Cloud.isConfigured()
    ? 'Firebase מוגדר, אבל אין קוד אישי במכשיר הזה'
    : 'עובד מקומית בלבד (ראה README להפעלת סנכרון)';

  const boxId = window.Cloud ? window.Cloud.getBoxId() : null;
  el('#boxIdBox').textContent = boxId || 'לא הוגדר';
}

function setupWhyHandlers() {
  el('#whyInput').addEventListener('input', (e) => {
    const settings = loadSettings();
    settings.whyText = e.target.value;
    saveSettings(settings);
  });

  el('#generateBoxBtn').addEventListener('click', () => {
    if (!window.Cloud) return;
    const id = window.Cloud.generateBoxId();
    window.Cloud.setBoxId(id);
    alert('קוד אישי נוצר! העתק אותו והדבק גם במכשיר השני כדי לסנכרן ביניהם:\n' + id);
    location.reload();
  });

  el('#enterBoxBtn').addEventListener('click', () => {
    if (!window.Cloud) return;
    const id = prompt('הדבק כאן את הקוד האישי מהמכשיר השני:');
    if (id) {
      window.Cloud.setBoxId(id.trim());
      location.reload();
    }
  });
}

// ---------------- Reminder banner ----------------
function renderBanner() {
  const banner = el('#banner');
  const entry = getEntry(todayKey);
  const habitsToday = habitsForDate(today);
  const doneCount = habitsToday.filter((h) => entry.checklist && entry.checklist[h.id]).length;
  const hour = today.getHours();
  if (hour >= 20 && doneCount < habitsToday.length) {
    banner.style.display = 'block';
    banner.textContent = 'עדיין לא סימנת את כל היום - כמה דקות ותוכל לסגור אותו לפני השינה 💪';
  } else {
    banner.style.display = 'none';
  }
}

// ---------------- Cloud wiring ----------------
function setupCloud() {
  if (!window.Cloud) return;
  const enabled = window.Cloud.init();
  if (enabled) {
    window.Cloud.subscribeEntries((remote) => {
      const changed = mergeCloudEntry(remote);
      if (changed) {
        const activeView = el('.tab-btn.active')?.dataset.view;
        if (remote.date === todayKey && activeView === 'today') {
          loadTodayDraftFromEntry();
          renderToday();
        }
        if (activeView === 'progress') renderProgress();
        if (activeView === 'history') renderHistory();
      }
    });
    window.Cloud.subscribeSettings((remote) => {
      const local = loadSettings();
      localStorage.setItem('bebe100_settings', JSON.stringify({ ...local, ...remote }));
    });
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------------- Init ----------------
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  renderHeader();
  loadTodayDraftFromEntry();
  renderToday();
  setupTodayHandlers();
  setupWhyHandlers();
  renderBanner();
  setupCloud();
  registerServiceWorker();
});
