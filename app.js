// ─── Constants ───

const CARD_TYPES = ['Lingo', 'Reading', 'Listening', 'Speaking', 'Languish'];
const CARDS_PER_DAY = 6;
const MAX_SAME_TYPE = 3;
const CUTOVER_DATE = '2026-05-22';
const DISPLAY_NAMES = {
  Lingo: 'Lingo',
  Reading: 'Reading',
  Listening: 'Listen',
  Speaking: 'Speaking',
  Languish: 'Phrases',
  Vocab: 'Vocab',
  Wild: 'Wild',
};
const EMOJIS = {
  Lingo: '🎵',
  Reading: '📘',
  Listening: '🎧',
  Speaking: '🎙️',
  Languish: '🇫🇷',
  Vocab: '🃏',
  Wild: '🎲',
};

// Legacy constants for old date support
const SCHEDULE_OFFSETS = [0, 1, 4, 11, 27, 58];

// ─── Date Utils ───

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today() {
  return formatLocalDate(new Date());
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

// ─── Card Generation ───

function generateDayCards() {
  const cards = [];
  const counts = {};
  for (let i = 0; i < CARDS_PER_DAY; i++) {
    // Weight each type: 1x base, halved for each time already drawn
    const weights = CARD_TYPES.map(t => {
      const n = counts[t] || 0;
      if (n >= MAX_SAME_TYPE) return 0;
      return 1 / Math.pow(4, n);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    let type;
    for (let j = 0; j < CARD_TYPES.length; j++) {
      roll -= weights[j];
      if (roll <= 0) { type = CARD_TYPES[j]; break; }
    }
    type = type || CARD_TYPES[CARD_TYPES.length - 1];
    counts[type] = (counts[type] || 0) + 1;
    cards.push({ id: generateId(), type });
  }
  return cards;
}

// ─── Legacy Support (dates before cutover) ───

let legacyDeck = null;

function buildLegacyStack(forDate) {
  if (!legacyDeck || legacyDeck.cards.length === 0) return [];

  const stack = [];
  for (const offset of SCHEDULE_OFFSETS) {
    const targetDate = addDays(forDate, -offset);
    const matches = legacyDeck.cards.filter(c => c.dateAdded === targetDate);
    for (const m of matches) {
      let displayType = m.type;
      if (m.type === 'Wild') {
        if (m.wildResolutions && m.wildResolutions[forDate]) {
          displayType = m.wildResolutions[forDate];
        } else {
          displayType = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
        }
      }
      stack.push({
        id: m.id,
        type: displayType,
        front: m.front || '',
        back: m.back || '',
      });
    }
  }
  return stack;
}

// ─── Data Loading ───

async function loadDayCards(date) {
  if (date > today()) return [];

  if (date < CUTOVER_DATE) {
    return buildLegacyStack(date);
  }

  if (!window.FirebaseSync) return [];

  let cards = await FirebaseSync.getDayCards(date);
  if (!cards) {
    cards = generateDayCards();
    FirebaseSync.saveDayCards(date, cards);
  }
  return cards;
}

function loadCompleted(dateStr) {
  return new Set(
    JSON.parse(localStorage.getItem('completed-today-' + dateStr) || '[]')
  );
}

// ─── UI State ───

let viewingDate;
let dayCards = [];
let completedSet = new Set();

// ─── Init ───

async function init() {
  viewingDate = today();

  // Set up UI
  renderDate();
  setupDateNav();
  setupNav();
  setupManage();

  if (window.FirebaseSync) {
    await FirebaseSync.ready;

    // Load legacy deck from Firebase for old date browsing
    legacyDeck = await FirebaseSync.getLegacyDeck();
  }

  dayCards = await loadDayCards(viewingDate);
  completedSet = loadCompleted(viewingDate);
  renderList();

  if (window.FirebaseSync) {
    setupCompletionListener();
  }
}

// ─── Completion Sync ───

let currentCompletedKey = null;

function setupCompletionListener() {
  const key = 'completed-today-' + viewingDate;
  if (currentCompletedKey === key) return;
  if (currentCompletedKey) {
    FirebaseSync.offCompleted(currentCompletedKey);
  }
  currentCompletedKey = key;
  FirebaseSync.onCompletedChanged(key, (ids) => {
    completedSet = new Set(ids || []);
    localStorage.setItem(key, JSON.stringify([...completedSet]));
    renderList();
  });
}

// ─── Date Navigation ───

async function switchToDate(newDate) {
  viewingDate = newDate;
  dayCards = await loadDayCards(viewingDate);
  completedSet = loadCompleted(viewingDate);
  renderDate();
  renderList();
  if (window.FirebaseSync) setupCompletionListener();
}

function renderDate() {
  const d = new Date(viewingDate + 'T12:00:00');
  const dateEl = document.getElementById('date-display');
  const isToday = viewingDate === today();

  dateEl.textContent = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  dateEl.classList.toggle('is-today', isToday);
  document.getElementById('btn-next-day').classList.toggle('at-today', isToday);
}

function setupDateNav() {
  document.getElementById('btn-prev-day').addEventListener('click', () => {
    switchToDate(addDays(viewingDate, -1));
  });
  document.getElementById('btn-next-day').addEventListener('click', () => {
    if (viewingDate < today()) {
      switchToDate(addDays(viewingDate, 1));
    }
  });

  // Swipe left/right on card list to navigate days
  const container = document.getElementById('card-list-container');
  let touchStartX = 0;
  let touchStartY = 0;
  let swiping = false;

  container.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    if (dy > dx) swiping = false;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 60) return;
    if (dx > 0) {
      switchToDate(addDays(viewingDate, -1));
    } else if (viewingDate < today()) {
      switchToDate(addDays(viewingDate, 1));
    }
  }, { passive: true });
}

// ─── Rendering ───

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderList() {
  const list = document.getElementById('card-list');
  const empty = document.getElementById('empty-state');

  if (dayCards.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = '';

  dayCards.forEach((card) => {
    const isCompleted = completedSet.has(card.id);
    const displayName = DISPLAY_NAMES[card.type] || card.type;

    const row = document.createElement('div');
    row.className = `list-row row-type-${card.type}`;
    if (isCompleted) row.classList.add('completed');

    const emoji = EMOJIS[card.type] || '';
    row.innerHTML = `
      <div class="row-icon">${emoji}</div>
      <div class="row-label">${escapeHTML(displayName)}</div>
      <button class="row-check" aria-label="Mark complete">${isCompleted ? '\u2713' : ''}</button>
    `;

    row.querySelector('.row-check').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleComplete(card.id, row);
    });

    list.appendChild(row);
  });
}

function toggleComplete(cardId, rowEl) {
  if (completedSet.has(cardId)) {
    completedSet.delete(cardId);
  } else {
    completedSet.add(cardId);
  }
  const arr = [...completedSet];
  const key = 'completed-today-' + viewingDate;
  localStorage.setItem(key, JSON.stringify(arr));
  if (window.FirebaseSync) {
    FirebaseSync.saveCompleted(key, arr);
  }

  const isCompleted = completedSet.has(cardId);
  rowEl.classList.toggle('completed', isCompleted);
  rowEl.querySelector('.row-check').textContent = isCompleted ? '\u2713' : '';
}

// ─── Navigation ───

function setupNav() {
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('manage-screen').classList.remove('hidden');
    renderStats();
  });
  document.getElementById('btn-close-manage').addEventListener('click', () => {
    document.getElementById('manage-screen').classList.add('hidden');
  });
}

// ─── Manage ───

function setupManage() {
  // Export
  document.getElementById('btn-export').addEventListener('click', async () => {
    let csv = 'date,card_1,card_2,card_3,card_4,card_5,card_6\n';

    // Export new-format days
    if (window.FirebaseSync) {
      const allDays = await FirebaseSync.getAllDays();
      if (allDays) {
        for (const [date, day] of Object.entries(allDays).sort()) {
          const types = (day.cards || []).map(c => c.type);
          csv += `${date},${types.join(',')}\n`;
        }
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flashcards.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported');
  });

  // Clear
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Delete all flashcard data? This cannot be undone.')) return;
    localStorage.clear();
    if (window.FirebaseSync) FirebaseSync.clearAll();
    dayCards = [];
    completedSet.clear();
    renderList();
    renderStats();
    toast('All data cleared');
  });
}

async function renderStats() {
  const statsEl = document.getElementById('deck-stats');
  statsEl.innerHTML = '<div style="color:var(--text-dim)">Loading...</div>';

  const typeCounts = {};
  let totalCards = 0;
  let totalCompleted = 0;
  let daysWithCards = 0;

  if (window.FirebaseSync) {
    const allDays = await FirebaseSync.getAllDays();
    if (allDays) {
      const cutoff = addDays(today(), -30);
      for (const [date, day] of Object.entries(allDays)) {
        if (date < cutoff) continue;
        const cards = day.cards || [];
        daysWithCards++;
        for (const c of cards) {
          typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
          totalCards++;
        }
      }
    }

    // Count completions for the last 30 days
    const snap = await FirebaseSync.getAllCompleted();
    if (snap) {
      const cutoff = addDays(today(), -30);
      for (const [key, ids] of Object.entries(snap)) {
        const date = key.replace('completed-today-', '');
        if (date < cutoff) continue;
        totalCompleted += (ids || []).length;
      }
    }
  }

  statsEl.innerHTML = `
    <div>Days tracked: <strong>${daysWithCards}</strong></div>
    <div>Total cards: <strong>${totalCards}</strong></div>
    <div style="margin-top:8px">
      ${CARD_TYPES.map(t =>
        `<div>${EMOJIS[t]} ${DISPLAY_NAMES[t]}: <strong>${typeCounts[t] || 0}</strong></div>`
      ).join('')}
    </div>
    <div style="margin-top:8px">Completed: <strong>${totalCompleted}</strong> / ${totalCards}</div>
  `;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ─── Init ───
init();
