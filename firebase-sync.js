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

// Convert deck (array-based) to Firebase (map-based)
function deckToFirebase(deck) {
  const cardsMap = {};
  for (const c of deck.cards) {
    const entry = {
      type: c.type,
      front: c.front,
      back: c.back,
      dateAdded: c.dateAdded,
      dateLastViewed: c.dateLastViewed || null,
    };
    if (c.wildResolvedType) entry.wildResolvedType = c.wildResolvedType;
    if (c.wildResolvedDate) entry.wildResolvedDate = c.wildResolvedDate;
    cardsMap[c.id] = entry;
  }
  return { cards: cardsMap, lastWildDate: deck.lastWildDate || null };
}

// Convert Firebase (map-based) back to deck (array-based)
function firebaseToDeck(fbData) {
  if (!fbData) return { cards: [], lastWildDate: null };
  const cards = [];
  if (fbData.cards) {
    for (const [id, c] of Object.entries(fbData.cards)) {
      cards.push({ id, ...c });
    }
  }
  return { cards, lastWildDate: fbData.lastWildDate || null };
}

window.FirebaseSync = {
  // Promise that resolves once initial Firebase data is loaded
  ready: new Promise((resolve) => {
    db.ref('deck').once('value', () => resolve());
  }),

  saveDeck(deck) {
    db.ref('deck').set(deckToFirebase(deck));
  },

  saveCompleted(dateKey, idsArray) {
    db.ref('completed/' + dateKey).set(idsArray);
  },

  onDeckChanged(callback) {
    db.ref('deck').on('value', (snap) => {
      const remoteDeck = firebaseToDeck(snap.val());
      callback(remoteDeck);
    });
  },

  onCompletedChanged(dateKey, callback) {
    db.ref('completed/' + dateKey).on('value', (snap) => {
      callback(snap.val() || []);
    });
  },

  clearAll() {
    db.ref('deck').set(null);
    db.ref('completed').set(null);
  },
};
