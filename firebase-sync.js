// Firebase configuration and sync layer
const firebaseConfig = {
  apiKey: "AIzaSyA9LFQmfTinYnSW7AK8F2bqcKVXeF8FT9A",
  authDomain: "flashcards-53d09.firebaseapp.com",
  databaseURL: "https://flashcards-53d09-default-rtdb.firebaseio.com",
  projectId: "flashcards-53d09",
  storageBucket: "flashcards-53d09.firebasestorage.app",
  messagingSenderId: "960844723678",
  appId: "1:960844723678:web:820e9efcdeb4a28823194f",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

window.FirebaseSync = {
  ready: new Promise((resolve) => {
    db.ref('days').once('value', () => resolve());
  }),

  // ─── New per-date model ───

  async getDayCards(date) {
    const snap = await db.ref('days/' + date + '/cards').once('value');
    return snap.val();
  },

  saveDayCards(date, cards) {
    db.ref('days/' + date + '/cards').set(cards);
  },

  async getAllDays() {
    const snap = await db.ref('days').once('value');
    return snap.val();
  },

  // ─── Legacy deck (read-only, for old date browsing) ───

  async getLegacyDeck() {
    const snap = await db.ref('deck').once('value');
    const fbData = snap.val();
    if (!fbData) return { cards: [] };
    const cards = [];
    if (fbData.cards) {
      for (const [id, c] of Object.entries(fbData.cards)) {
        cards.push({ id, ...c });
      }
    }
    return { cards };
  },

  // ─── Completion tracking ───

  saveCompleted(dateKey, idsArray) {
    db.ref('completed/' + dateKey).set(idsArray);
  },

  offCompleted(dateKey) {
    db.ref('completed/' + dateKey).off();
  },

  onCompletedChanged(dateKey, callback) {
    db.ref('completed/' + dateKey).on('value', (snap) => {
      callback(snap.val() || []);
    });
  },

  async getAllCompleted() {
    const snap = await db.ref('completed').once('value');
    return snap.val();
  },

  // ─── Admin ───

  clearAll() {
    db.ref('deck').set(null);
    db.ref('days').set(null);
    db.ref('completed').set(null);
  },
};
