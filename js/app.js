const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MOODS = ['😞', '😕', '😐', '🙂', '💪'];
const MILESTONES = [10, 30, 50, 100];

let today = new Date();
let todayKey = dateKey(today);
let currentMedia = []; // media rows for today, loaded from IndexedDB
let draftChecklist = {};
let draftRunning = { location: '', minutes: '' };
let editingDate = new Date(today);
let editingKey = todayKey;
let draftMood = null;

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

function currentDayNumber() {
  const settings = loadSettings();
  return Math.max(1, Math.min(100, dayNumberFor(today, settings.startDate)));
}

function renderHeader() {
  const settings = loadSettings();
  const dayNum = dayNumberFor(today, settings.startDate);
  const clamped = currentDayNumber();
  el('#dayBadge').textContent = dayNum > 100 ? `סיימת את ה-100 ימים! 🎉` : dayNum < 1 ? `האתגר יתחיל בקרוב` : `יום ${clamped} מתוך 100`;
  el('#quoteCard').textContent = '"' + quoteForDay(clamped) + '"';
}

function loadTodayDraftFromEntry() {
  const entry = getEntry(editingKey);
  draftChecklist = { ...entry.checklist };
  draftRunning = entry.running ? { ...entry.running } : { location: '', minutes: '' };
  draftMood = entry.mood;
}

async function renderToday() {
  const isEditingPast = editingKey !== todayKey;
  el('#editingBanner').style.display = isEditingPast ? 'flex' : 'none';
  el('#editingDateLabel').textContent = editingKey;

  const habitsToday = habitsForDate(editingDate);
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
          <label class="small-label">כמה דקות?</label>
          <input type="number" id="runMinutes" placeholder="30" min="0" step="1" value="${draftRunning.minutes || ''}">
        </div>`;
      wrap.appendChild(details);
      el('#runLocation', details).addEventListener('input', (e) => (draftRunning.location = e.target.value));
      el('#runMinutes', details).addEventListener('input', (e) => (draftRunning.minutes = e.target.value));
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

  // media thumbs
  currentMedia = await getMediaForDate(editingKey);
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
      m.type === 'photo' ? `<img class="viewable-media" src="${url}">` : `<video class="viewable-media" src="${url}" muted></video>`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteMedia(m.id);
      currentMedia = await getMediaForDate(editingKey);
      renderThumbs();
    });
    div.appendChild(del);
    thumbs.appendChild(div);
  });
}

function setupTodayHandlers() {
  el('#photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await addMedia(editingKey, 'photo', file);
    currentMedia = await getMediaForDate(editingKey);
    renderThumbs();
    e.target.value = '';
  });

  el('#videoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await addMedia(editingKey, 'video', file);
    currentMedia = await getMediaForDate(editingKey);
    renderThumbs();
    e.target.value = '';
  });

  el('#photoBtn').addEventListener('click', () => el('#photoInput').click());
  el('#videoBtn').addEventListener('click', () => el('#videoInput').click());

  el('#backToTodayBtn').addEventListener('click', () => {
    editingDate = new Date(today);
    editingKey = todayKey;
    loadTodayDraftFromEntry();
    renderToday();
  });

  el('#saveBtn').addEventListener('click', () => {
    const wasEditingPast = editingKey !== todayKey;
    const running = draftChecklist.running
      ? { location: draftRunning.location || '', minutes: draftRunning.minutes ? Number(draftRunning.minutes) : 0 }
      : null;
    saveEntry({
      date: editingKey,
      checklist: draftChecklist,
      running,
      mood: draftMood,
    });
    el('#saveFlash').textContent = 'נשמר! 💪';
    renderBanners();
    if (wasEditingPast) {
      editingDate = new Date(today);
      editingKey = todayKey;
      loadTodayDraftFromEntry();
      switchView('history');
    }
  });
}

// ריצה לא נדרשת בכל יום (יעד "יום כן יום לא", לא ימים קבועים) - לא נכנסת לחישוב "יום מושלם"
function dayStatus(date, entry) {
  const applicable = habitsForDate(date).filter((h) => h.id !== 'running');
  const doneCount = entry ? applicable.filter((h) => entry.checklist && entry.checklist[h.id]).length : 0;
  if (applicable.length > 0 && doneCount === applicable.length) return 'full';
  if (doneCount > 0) return 'partial';
  return 'none';
}

// סטטיסטיקות על טווח ימי-אתגר (1-100), לצורך השוואות שבועיות ולפני/אחרי
function computeRangeStats(startDay, endDay, settings, entries, todayDayNum) {
  const start = new Date(settings.startDate + 'T00:00:00');
  const clampedStart = Math.max(1, startDay);
  const clampedEnd = Math.min(endDay, todayDayNum, 100);
  let fullDays = 0;
  let runs = 0;
  let moodSum = 0;
  let moodCount = 0;
  let countedDays = 0;

  for (let day = clampedStart; day <= clampedEnd; day++) {
    const d = new Date(start.getTime() + (day - 1) * 86400000);
    const entry = entries[dateKey(d)];
    if (dayStatus(d, entry) === 'full') fullDays++;
    if (entry && entry.checklist && entry.checklist.running) runs++;
    if (entry && entry.mood) {
      moodSum += entry.mood;
      moodCount++;
    }
    countedDays++;
  }

  return { fullDays, runs, moodAvg: moodCount ? moodSum / moodCount : null, countedDays };
}

function compareMetricsHtml(stats) {
  return `
    <div class="compare-metric"><span>ימים מושלמים</span><span>${stats.fullDays}</span></div>
    <div class="compare-metric"><span>ריצות</span><span>${stats.runs}</span></div>
    <div class="compare-metric"><span>מצב רוח ממוצע</span><span>${stats.moodAvg ? stats.moodAvg.toFixed(1) : '—'}</span></div>
  `;
}

function diffLineHtml(before, after) {
  const diff = after.fullDays - before.fullDays;
  if (diff > 0) return `<div class="diff-line diff-up">📈 ${diff} ימים מושלמים יותר</div>`;
  if (diff < 0) return `<div class="diff-line diff-down">📉 ${Math.abs(diff)} ימים מושלמים פחות</div>`;
  return `<div class="diff-line diff-same">➡️ אותה רמת עקביות</div>`;
}

function renderMilestones(dayNum) {
  const row = el('#milestoneRow');
  row.innerHTML = '';
  MILESTONES.forEach((m) => {
    const reached = dayNum >= m;
    const div = document.createElement('div');
    div.className = 'milestone' + (reached ? ' reached' : '') + (dayNum === m ? ' today' : '');
    div.innerHTML = `<div class="num">${m}</div><div class="lbl">${reached ? '✓ הושלם' : `בעוד ${m - dayNum}`}</div>`;
    row.appendChild(div);
  });
}

function renderWeeklyCompare(dayNum, settings, entries) {
  const container = el('#weeklyCompare');
  const currentWeekIndex = Math.ceil(dayNum / 7);
  if (currentWeekIndex <= 1) {
    container.innerHTML = '<div class="empty-note">עוד אין שבוע קודם להשוואה - תחזור לכאן אחרי השבוע הראשון</div>';
    return;
  }
  const curStart = (currentWeekIndex - 1) * 7 + 1;
  const curEnd = currentWeekIndex * 7;
  const cur = computeRangeStats(curStart, curEnd, settings, entries, dayNum);
  const prev = computeRangeStats(curStart - 7, curEnd - 7, settings, entries, dayNum);

  container.innerHTML = `
    <div class="compare-grid">
      <div class="compare-col">
        <div class="compare-title">שבוע קודם</div>
        ${compareMetricsHtml(prev)}
      </div>
      <div class="compare-col">
        <div class="compare-title">השבוע הזה</div>
        ${compareMetricsHtml(cur)}
      </div>
    </div>
    ${diffLineHtml(prev, cur)}
  `;
}

async function renderBeforeAfterMedia() {
  const container = el('#beforeAfter');
  const allMedia = await getAllMedia();
  if (allMedia.length < 2) return;
  const sorted = allMedia.slice().sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.date === last.date) return;

  const firstUrl = URL.createObjectURL(first.blob);
  const lastUrl = URL.createObjectURL(last.blob);
  container.insertAdjacentHTML(
    'beforeend',
    `<div class="ba-media-row">
      <div class="ba-media-col">
        <div class="ba-label">${first.date}</div>
        ${first.type === 'photo' ? `<img class="viewable-media" src="${firstUrl}">` : `<video class="viewable-media" src="${firstUrl}" muted></video>`}
      </div>
      <div class="ba-media-col">
        <div class="ba-label">${last.date}</div>
        ${last.type === 'photo' ? `<img class="viewable-media" src="${lastUrl}">` : `<video class="viewable-media" src="${lastUrl}" muted></video>`}
      </div>
    </div>`
  );
}

function renderBeforeAfter(dayNum, settings, entries) {
  const container = el('#beforeAfter');

  if (dayNum <= 7) {
    container.innerHTML = '<div class="empty-note">עוד מוקדם - ההשוואה תופיע אחרי השבוע הראשון של האתגר</div>';
    return;
  }

  const before = computeRangeStats(1, 7, settings, entries, dayNum);
  const afterStart = Math.max(8, dayNum - 6);
  const after = computeRangeStats(afterStart, dayNum, settings, entries, dayNum);

  container.innerHTML = `
    <div class="compare-grid">
      <div class="compare-col">
        <div class="compare-title">שבוע 1 (ההתחלה)</div>
        ${compareMetricsHtml(before)}
      </div>
      <div class="compare-col">
        <div class="compare-title">7 הימים האחרונים</div>
        ${compareMetricsHtml(after)}
      </div>
    </div>
    ${diffLineHtml(before, after)}
  `;

  renderBeforeAfterMedia();
}

function renderProgress() {
  const settings = loadSettings();
  const start = new Date(settings.startDate + 'T00:00:00');
  const entries = loadEntries();
  const dayNum = currentDayNumber();

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
    const entry = entries[key];
    const status = dayStatus(d, entry);
    const isFull = status === 'full';
    const isPartial = status === 'partial';
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
    if (!c.isFuture) {
      cell.classList.add('clickable');
      cell.addEventListener('click', () => startEditingDay(c.key));
    }
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
      item.innerHTML = `<span class="date">${r.date}</span><span class="meta">${r.location || '—'} · ${r.minutes || 0} דקות</span>`;
      runList.appendChild(item);
    });

  drawMoodChart(el('#moodChart'), moodPoints);

  renderMilestones(dayNum);
  renderWeeklyCompare(dayNum, settings, entries);
  renderBeforeAfter(dayNum, settings, entries);
  renderGallery(dayNum, settings, entries);
}

async function renderGallery(dayNum, settings, entries) {
  const grid = el('#galleryGrid');
  const start = new Date(settings.startDate + 'T00:00:00');
  const days = [];
  for (let day = 1; day <= dayNum; day++) {
    const d = new Date(start.getTime() + (day - 1) * 86400000);
    days.push({ day, date: d, key: dateKey(d) });
  }

  const mediaByDay = await Promise.all(days.map((d) => getMediaForDate(d.key)));

  grid.innerHTML = '';
  days.forEach((d, i) => {
    const status = dayStatus(d.date, entries[d.key]);
    const media = mediaByDay[i];
    const cell = document.createElement('div');
    cell.className = 'gallery-cell ' + status;
    cell.title = d.key;
    if (media.length) {
      const url = URL.createObjectURL(media[0].blob);
      cell.innerHTML = media[0].type === 'photo' ? `<img class="viewable-media" src="${url}">` : `<video class="viewable-media" src="${url}" muted></video>`;
    } else {
      cell.innerHTML = `<span class="gallery-day-num">${d.day}</span>`;
    }
    grid.appendChild(cell);
  });
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
        return m.type === 'photo' ? `<img class="viewable-media" src="${url}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;margin-left:4px">` : `<video class="viewable-media" src="${url}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;margin-left:4px" muted></video>`;
      })
      .join('');
    div.innerHTML = `
      <div class="date">${key}</div>
      <div class="chips">${chips}</div>
      ${entry.mood ? `<div>${MOODS[entry.mood - 1]}</div>` : ''}
      ${thumbsHtml ? `<div class="thumbs">${thumbsHtml}</div>` : ''}
      <button class="btn-secondary edit-day-btn" data-edit-key="${key}">✏️ ערוך יום זה</button>
    `;
    list.appendChild(div);
  }
}

function startEditingDay(key) {
  editingKey = key;
  editingDate = new Date(key + 'T00:00:00');
  loadTodayDraftFromEntry();
  renderToday();
  switchView('today');
}

function setupHistoryHandlers() {
  el('#historyList').addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-day-btn');
    if (!btn) return;
    startEditingDay(btn.dataset.editKey);
  });
}

// ---------------- Settings (sync + backup) ----------------
function renderWhy() {
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

  el('#exportBackupBtn').addEventListener('click', async () => {
    const status = el('#backupStatus');
    status.textContent = 'מייצא...';
    try {
      const { entriesCount, mediaCount } = await Backup.exportBackup();
      status.textContent = `הורד קובץ גיבוי (${entriesCount} ימים, ${mediaCount} קבצי מדיה) 💾`;
    } catch (e) {
      console.error(e);
      status.textContent = 'שגיאה בייצוא הגיבוי';
    }
  });

  el('#importBackupBtn').addEventListener('click', () => el('#importBackupInput').click());

  el('#importBackupInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = el('#backupStatus');
    status.textContent = 'מייבא...';
    try {
      const { entriesCount, mediaCount } = await Backup.importBackup(file);
      status.textContent = `שוחזרו ${entriesCount} ימים ו-${mediaCount} קבצי מדיה ✅`;
      loadTodayDraftFromEntry();
      renderHeader();
      renderToday();
      renderBanners();
    } catch (err) {
      console.error(err);
      status.textContent = 'קובץ גיבוי לא תקין';
    }
    e.target.value = '';
  });
}

// ---------------- Reminder banners ----------------
function renderBanners() {
  const area = el('#bannerArea');
  const messages = [];
  const dayNum = currentDayNumber();

  if (MILESTONES.includes(dayNum)) {
    messages.push({
      cls: 'celebrate',
      text: dayNum === 100 ? 'סיימת את כל האתגר! 100 יום שלמים 🎉🎉🎉' : `הגעת ליום ${dayNum}! ציון דרך חדש 🎉`,
    });
  }

  const entry = getEntry(todayKey);
  const habitsToday = habitsForDate(today);
  const doneCount = habitsToday.filter((h) => entry.checklist && entry.checklist[h.id]).length;
  if (today.getHours() >= 20 && doneCount < habitsToday.length) {
    messages.push({ cls: '', text: 'עדיין לא סימנת את כל היום - כמה דקות ותוכל לסגור אותו לפני השינה 💪' });
  }

  area.innerHTML = messages.map((m) => `<div class="banner${m.cls ? ' ' + m.cls : ''}">${m.text}</div>`).join('');
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
        if (remote.date === editingKey && activeView === 'today') {
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

// ---------------- Lightbox (הצגת תמונה/סרטון בגודל מלא) ----------------
function openLightbox(src, tagName) {
  el('#lightboxContent').innerHTML =
    tagName === 'video' ? `<video src="${src}" controls autoplay></video>` : `<img src="${src}">`;
  el('#lightbox').classList.remove('hidden');
}

function closeLightbox() {
  el('#lightbox').classList.add('hidden');
  el('#lightboxContent').innerHTML = '';
}

function setupLightbox() {
  document.addEventListener('click', (e) => {
    const media = e.target.closest('.viewable-media');
    if (media) {
      openLightbox(media.currentSrc || media.src, media.tagName.toLowerCase());
    }
  });
  el('#lightboxClose').addEventListener('click', closeLightbox);
  el('#lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
}

// הוסר שירות ה-Service Worker לגמרי - גרם לתקיעות על גרסאות ישנות ואף לכשל בטעינה.
// הפונקציה כאן מנטרלת כל רישום קודם שנשאר על מכשירים שכבר התקינו אותו.
function disableServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
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
  setupHistoryHandlers();
  setupLightbox();
  renderBanners();
  setupCloud();
  disableServiceWorker();
});
