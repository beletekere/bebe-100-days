// גיבוי מקומי - ייצוא/ייבוא ידני של כל הנתונים (כולל מדיה) לקובץ אחד.
// לא קשור ל-Firebase: זה לא סנכרון אוטומטי, רק רשת ביטחון שהמשתמש מפעיל בעצמו.

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mime) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}

async function exportBackup() {
  const entries = loadEntries();
  const settings = loadSettings();
  const mediaRaw = await getAllMedia();

  const media = [];
  for (const m of mediaRaw) {
    media.push({
      date: m.date,
      type: m.type,
      mime: m.blob.type || (m.type === 'photo' ? 'image/jpeg' : 'video/mp4'),
      createdAt: m.createdAt,
      data: await blobToBase64(m.blob),
    });
  }

  const payload = { version: 1, exportedAt: Date.now(), entries, settings, media };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bebe100-backup-${dateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { entriesCount: Object.keys(entries).length, mediaCount: media.length };
}

async function importBackup(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload || typeof payload.entries !== 'object') {
    throw new Error('קובץ גיבוי לא תקין');
  }

  Object.values(payload.entries).forEach((entry) => mergeCloudEntry(entry));

  if (payload.settings) {
    saveSettings({ ...loadSettings(), ...payload.settings });
  }

  for (const m of payload.media || []) {
    const blob = base64ToBlob(m.data, m.mime);
    await addMedia(m.date, m.type, blob);
  }

  return { entriesCount: Object.keys(payload.entries).length, mediaCount: (payload.media || []).length };
}

window.Backup = { exportBackup, importBackup };
