// שכבת נתונים מקומית (טקסט בלבד: צ'קליסט, יומן, ריצה). תמיד עובד גם בלי ענן.
const ENTRIES_KEY = 'bebe100_entries';
const SETTINGS_KEY = 'bebe100_settings';
const DEFAULT_START_DATE = '2026-08-02';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(ENTRIES_KEY)) || {};
  } catch {
    return {};
  }
}

function saveEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

function getEntry(date) {
  const entries = loadEntries();
  return (
    entries[date] || {
      date,
      checklist: {},
      running: null,
      mood: null,
      note: '',
      updatedAt: 0,
    }
  );
}

function saveEntry(entry) {
  const entries = loadEntries();
  entry.updatedAt = Date.now();
  entries[entry.date] = entry;
  saveEntries(entries);
  if (window.Cloud && window.Cloud.isEnabled()) {
    window.Cloud.saveEntry(entry.date, entry);
  }
  return entry;
}

// מיזוג נתונים שהגיעו מהענן - מנצח מי שעודכן מאוחר יותר (updatedAt)
function mergeCloudEntry(remote) {
  const entries = loadEntries();
  const local = entries[remote.date];
  if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
    entries[remote.date] = remote;
    saveEntries(entries);
    return true;
  }
  return false;
}

function loadSettings() {
  try {
    return { startDate: DEFAULT_START_DATE, whyText: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { startDate: DEFAULT_START_DATE, whyText: '' };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (window.Cloud && window.Cloud.isEnabled()) {
    window.Cloud.saveSettings(settings);
  }
}

function dayNumberFor(date, startDateStr) {
  const start = new Date(startDateStr + 'T00:00:00');
  const diffDays = Math.floor((date - start) / 86400000) + 1;
  return diffDays;
}
