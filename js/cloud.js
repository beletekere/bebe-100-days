// שכבת סנכרון ענן (Firestore) - אופציונלי. אם לא הוגדר Firebase, האפליקציה עובדת מקומית בלבד.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const BOX_KEY = 'bebe100_boxId';
let db = null;
let boxId = null;
let enabled = false;

function isConfigured() {
  return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY');
}

function getBoxId() {
  return localStorage.getItem(BOX_KEY);
}

function setBoxId(id) {
  localStorage.setItem(BOX_KEY, id);
}

function generateBoxId() {
  return crypto.randomUUID();
}

function init() {
  if (!isConfigured()) return false;
  boxId = getBoxId();
  if (!boxId) return false;
  try {
    const app = initializeApp(window.FIREBASE_CONFIG);
    db = getFirestore(app);
    enabled = true;
  } catch (e) {
    console.error('Firebase init failed', e);
    enabled = false;
  }
  return enabled;
}

async function saveEntry(dateKey, data) {
  if (!enabled) return;
  try {
    await setDoc(doc(db, 'boxes', boxId, 'entries', dateKey), data, { merge: true });
  } catch (e) {
    console.error('שגיאת סנכרון (entry)', e);
  }
}

async function saveSettings(settings) {
  if (!enabled) return;
  try {
    await setDoc(doc(db, 'boxes', boxId, 'settings', 'main'), settings, { merge: true });
  } catch (e) {
    console.error('שגיאת סנכרון (settings)', e);
  }
}

function subscribeEntries(onEntry) {
  if (!enabled) return () => {};
  return onSnapshot(collection(db, 'boxes', boxId, 'entries'), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'removed') return;
      onEntry(change.doc.data());
    });
  });
}

function subscribeSettings(onSettings) {
  if (!enabled) return () => {};
  return onSnapshot(doc(db, 'boxes', boxId, 'settings', 'main'), (snap) => {
    if (snap.exists()) onSettings(snap.data());
  });
}

window.Cloud = {
  isConfigured,
  isEnabled: () => enabled,
  init,
  getBoxId,
  setBoxId,
  generateBoxId,
  saveEntry,
  saveSettings,
  subscribeEntries,
  subscribeSettings,
};

window.dispatchEvent(new Event('cloud-module-ready'));
