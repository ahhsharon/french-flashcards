// ─── Data Layer ───

const STORAGE_KEY = 'french-flashcards';
const SCHEDULE_OFFSETS = [0, 1, 4, 11, 27, 58];
const WILD_TYPES = ['Lingo', 'Reading', 'Listening', 'Speaking', 'Languish'];
const ALL_TYPES = ['Vocab', ...WILD_TYPES, 'Wild'];
const MAX_SAME_TYPE = 3;
const DISPLAY_NAMES = {
  Vocab: 'Vocab',
  Lingo: 'Lingo',
  Reading: 'Reading',
  Listening: 'Listen',
  Speaking: 'Speaking',
  Languish: 'Phrases',
  Wild: 'Wild',
};

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today() {
  return formatLocalDate(new Date());
}

function dateNDaysAgoFrom(baseDate, n) {
  const d = new Date(baseDate + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

function loadDeck() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : { cards: [], lastWildDate: null };
}

function saveDeck(deck) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  if (window.FirebaseSync) {
    FirebaseSync.saveDeck(deck);
  }
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function addCard(deck, type, front, back, dateAdded) {
  deck.cards.push({
    id: generateId(),
    type,
    front: front || '',
    back: back || '',
    dateAdded: dateAdded || today(),
    dateLastViewed: null,
  });
}

// ─── Daily Wild Card ───

function ensureDailyWild(deck) {
  const t = today();

  // Find the earliest Wild card date as the deck start date
  let earliest = t;
  for (const c of deck.cards) {
    if (c.type === 'Wild' && c.dateAdded < earliest) {
      earliest = c.dateAdded;
    }
  }

  // Build set of dates that already have a Wild card
  const wildDates = new Set();
  for (const c of deck.cards) {
    if (c.type === 'Wild') wildDates.add(c.dateAdded);
  }

  // Add a Wild card for every day from earliest through today that's missing one
  let added = false;
  let d = earliest;
  while (d <= t) {
    if (!wildDates.has(d)) {
      addCard(deck, 'Wild', '', '', d);
      added = true;
    }
    d = addDays(d, 1);
  }

  if (added) {
    deck.lastWildDate = t;
    saveDeck(deck);
  }
}

// ─── Wild Card Resolution ───

function resolveWildType(stackTypes) {
  const counts = {};
  for (const t of stackTypes) counts[t] = (counts[t] || 0) + 1;

  // Try up to 20 times to find a type under the limit
  for (let i = 0; i < 20; i++) {
    const pick = WILD_TYPES[Math.floor(Math.random() * WILD_TYPES.length)];
    if ((counts[pick] || 0) < MAX_SAME_TYPE) return pick;
  }
  // Fallback: pick the type with the lowest count
  return WILD_TYPES.reduce((best, t) =>
    (counts[t] || 0) < (counts[best] || 0) ? t : best
  );
}

// ─── Build Daily Stack ───

function buildDailyStack(deck, forDate) {
  const stack = []; // each entry: { card, offsetIndex }

  for (let oi = 0; oi < SCHEDULE_OFFSETS.length; oi++) {
    const targetDate = dateNDaysAgoFrom(forDate, SCHEDULE_OFFSETS[oi]);
    const matches = deck.cards.filter(c => c.dateAdded === targetDate);
    for (const m of matches) stack.push({ card: m, offsetIndex: oi });
  }

  // Resolve Wild cards: determine their display type
  // Wild resolutions are keyed by forDate so each day's draw is stable
  // Pre-fill resolved types: use persisted Wild resolutions if available
  const resolvedTypes = stack.map(e => {
    if (e.card.type === 'Wild') {
      const orig = deck.cards.find(c => c.id === e.card.id);
      // Check if resolution exists for this viewing date
      if (orig && orig.wildResolutions && orig.wildResolutions[forDate]) {
        return orig.wildResolutions[forDate];
      }
      // Legacy: migrate old single-date format
      if (orig && orig.wildResolvedType && orig.wildResolvedDate === forDate) {
        if (!orig.wildResolutions) orig.wildResolutions = {};
        orig.wildResolutions[forDate] = orig.wildResolvedType;
        return orig.wildResolvedType;
      }
      return null; // needs resolving
    }
    return e.card.type;
  });
  let deckChanged = false;

  const stackResolved = [];
  for (let i = 0; i < stack.length; i++) {
    const { card, offsetIndex } = stack[i];
    if (card.type === 'Wild') {
      const original = deck.cards.find(c => c.id === card.id);
      let resolved;
      // Reuse already-persisted type
      if (resolvedTypes[i]) {
        resolved = resolvedTypes[i];
      } else {
        const currentTypes = resolvedTypes.filter(Boolean);
        resolved = resolveWildType(currentTypes);
        resolvedTypes[i] = resolved;
        // Persist on the original card, keyed by viewing date
        if (original) {
          if (!original.wildResolutions) original.wildResolutions = {};
          original.wildResolutions[forDate] = resolved;
          deckChanged = true;
        }
      }
      stackResolved.push({ ...card, resolvedType: resolved, offsetIndex });
    } else {
      stackResolved.push({ ...card, resolvedType: card.type, offsetIndex });
    }
  }

  // Only update dateLastViewed when viewing today
  if (forDate === today()) {
    for (const item of stackResolved) {
      const original = deck.cards.find(c => c.id === item.id);
      if (original) original.dateLastViewed = forDate;
    }
  }

  if (deckChanged || forDate === today()) {
    saveDeck(deck);
  }

  return stackResolved;
}

// ─── CSV Import ───

function normalizeDate(str) {
  str = str.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // M/D/YYYY or MM/DD/YYYY
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const m = match[1].padStart(2, '0');
    const d = match[2].padStart(2, '0');
    return `${match[3]}-${m}-${d}`;
  }
  return str;
}

function parseCSV(text) {
  // Parse entire CSV respecting multiline quoted fields
  const records = parseCSVRecords(text.trim());
  const cards = [];
  for (const parts of records) {
    const type = (parts[0] || '').trim();
    const front = (parts[1] || '').trim();
    const back = (parts[2] || '').trim();
    const rawDate = (parts[3] || '').trim();

    // Skip header
    if (type.toLowerCase() === 'type') continue;
    if (!ALL_TYPES.includes(type)) continue;

    const dateAdded = rawDate ? normalizeDate(rawDate) : today();
    cards.push({ type, front, back, dateAdded });
  }
  return cards;
}

function parseCSVRecords(text) {
  const records = [];
  let i = 0;
  while (i < text.length) {
    const { fields, nextIndex } = parseCSVRecord(text, i);
    records.push(fields);
    i = nextIndex;
  }
  return records;
}

function parseCSVRecord(text, start) {
  const fields = [];
  let i = start;
  let current = '';
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        fields.push(current);
        i += (ch === '\r') ? 2 : 1;
        return { fields, nextIndex: i };
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return { fields, nextIndex: i };
}

function exportCSV(deck) {
  let csv = 'type,front,back,date_added,date_last_viewed\n';
  for (const c of deck.cards) {
    const front = c.front.includes(',') ? `"${c.front}"` : c.front;
    const back = c.back.includes(',') ? `"${c.back}"` : c.back;
    csv += `${c.type},${front},${back},${c.dateAdded},${c.dateLastViewed || ''}\n`;
  }
  return csv;
}

// ─── UI ───

let deck, stack, completedSet, viewingDate;

async function init() {
  deck = loadDeck();

  // Import seed data if available (first run)
  if (window.__SEED_CSV && deck.cards.length === 0) {
    const parsed = parseCSV(window.__SEED_CSV);
    for (const c of parsed) {
      addCard(deck, c.type, c.front, c.back, c.dateAdded);
    }
    saveDeck(deck);
    delete window.__SEED_CSV;
  }

  viewingDate = today();
  ensureDailyWild(deck);
  stack = buildDailyStack(deck, viewingDate);
  completedSet = loadCompleted(viewingDate);

  renderDate();
  renderList();
  setupVocabOverlay();
  setupNav();
  setupDateNav();
  setupManage();

  // Firebase sync
  if (window.FirebaseSync) {
    await FirebaseSync.ready;

    // Listen for remote deck changes
    let isFirstDeckSync = true;
    FirebaseSync.onDeckChanged((remoteDeck) => {
      // On first sync, if Firebase is empty, push local data up
      if (isFirstDeckSync && remoteDeck.cards.length === 0 && deck.cards.length > 0) {
        FirebaseSync.saveDeck(deck);
        isFirstDeckSync = false;
        return;
      }
      isFirstDeckSync = false;

      if (remoteDeck.cards.length > 0) {
        deck = remoteDeck;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
        ensureDailyWild(deck);
        stack = buildDailyStack(deck, viewingDate);
        renderList();
      }
    });

    // Listen for remote completion changes for current viewing date
    let currentCompletedKey = null;
    function listenToCompleted() {
      const key = 'completed-today-' + viewingDate;
      if (currentCompletedKey && currentCompletedKey !== key) {
        FirebaseSync.offCompleted(currentCompletedKey);
      }
      currentCompletedKey = key;
      FirebaseSync.onCompletedChanged(key, (ids) => {
        completedSet = new Set(ids || []);
        localStorage.setItem(key, JSON.stringify([...completedSet]));
        renderList();
      });
    }
    listenToCompleted();

    // Re-listen when date changes
    window._onDateChanged = listenToCompleted;
  }
}

function loadCompleted(dateStr) {
  return new Set(
    JSON.parse(localStorage.getItem('completed-today-' + dateStr) || '[]')
  );
}

function renderDate() {
  const d = new Date(viewingDate + 'T12:00:00');
  const dateEl = document.getElementById('date-display');
  const isToday = viewingDate === today();

  dateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  dateEl.classList.toggle('is-today', isToday);

  // Disable next button if viewing today
  document.getElementById('btn-next-day').classList.toggle('at-today', isToday);
}

function switchToDate(newDate) {
  viewingDate = newDate;
  stack = buildDailyStack(deck, viewingDate);
  completedSet = loadCompleted(viewingDate);
  renderDate();
  renderList();
  if (window._onDateChanged) window._onDateChanged();
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
}

function getScheduleLabel(offsetIndex) {
  const offsets = SCHEDULE_OFFSETS;
  const n = offsets[offsetIndex];
  if (n === undefined) return '';
  if (n === 0) return viewingDate === today() ? 'Today' : 'Day of';
  if (n === 1) return '1 day ago';
  return `${n} days ago`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getRowDisplayText(card) {
  if (card.type === 'Vocab') return card.front;
  if (card.type === 'Wild') return DISPLAY_NAMES[card.resolvedType] || card.resolvedType;
  return DISPLAY_NAMES[card.type] || card.type;
}

// ─── List View ───

function renderList() {
  const list = document.getElementById('card-list');
  const empty = document.getElementById('empty-state');

  if (stack.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = '';

  stack.forEach((card, i) => {
    const isCompleted = completedSet.has(card.id);
    const isVocab = card.type === 'Vocab';

    const row = document.createElement('div');
    row.className = `list-row row-type-${card.type}`;
    if (isVocab) row.classList.add('is-vocab');
    if (isCompleted) row.classList.add('completed');
    row.dataset.index = i;

    row.innerHTML = `
      <div class="row-type-badge">${DISPLAY_NAMES[card.type] || card.type}</div>
      <div class="row-content">
        <div class="row-front">${escapeHTML(getRowDisplayText(card))}</div>
        <div class="row-schedule">${getScheduleLabel(card.offsetIndex)}</div>
      </div>
      <button class="row-check" aria-label="Mark complete">${isCompleted ? '\u2713' : ''}</button>
    `;

    // Tap row to open vocab overlay
    if (isVocab) {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-check')) return;
        openVocabOverlay(card);
      });
    }

    // Check button
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
  const checkBtn = rowEl.querySelector('.row-check');
  checkBtn.textContent = isCompleted ? '\u2713' : '';
}

// ─── Vocab Overlay ───

function setupVocabOverlay() {
  const overlay = document.getElementById('vocab-overlay');
  const backdrop = document.getElementById('vocab-overlay-backdrop');
  const closeBtn = document.getElementById('vocab-close');
  const card = document.getElementById('vocab-card');

  function close() {
    overlay.classList.add('hidden');
    card.classList.remove('flipped');
  }

  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  card.addEventListener('click', () => {
    card.classList.toggle('flipped');
  });
}

function openVocabOverlay(card) {
  const overlay = document.getElementById('vocab-overlay');
  const cardEl = document.getElementById('vocab-card');

  cardEl.classList.remove('flipped');
  cardEl.className = 'card type-Vocab';

  cardEl.querySelector('.card-front .card-type-badge').textContent = 'Vocab';
  cardEl.querySelector('.card-front .card-content').textContent = card.front;
  cardEl.querySelector('.card-back .card-type-badge').textContent = 'Vocab';
  cardEl.querySelector('.card-back .card-content').textContent = card.back;

  overlay.classList.remove('hidden');
}

// ─── Navigation ───

function setupNav() {
  const manageScreen = document.getElementById('manage-screen');

  document.getElementById('btn-settings').addEventListener('click', () => {
    manageScreen.classList.remove('hidden');
    renderStats();
  });

  document.getElementById('btn-close-manage').addEventListener('click', () => {
    manageScreen.classList.add('hidden');
  });
}

// ─── Manage ───

function setupManage() {
  // Import
  const fileInput = document.getElementById('csv-file');

  document.getElementById('btn-import').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      if (parsed.length === 0) {
        toast('No valid cards found');
        return;
      }
      for (const c of parsed) {
        addCard(deck, c.type, c.front, c.back, c.dateAdded);
      }
      saveDeck(deck);
      stack = buildDailyStack(deck, viewingDate);
      toast(`Imported ${parsed.length} cards`);
      renderList();
      renderStats();
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  // Add type toggle
  document.getElementById('add-type').addEventListener('change', () => {
    const isVocab = document.getElementById('add-type').value === 'Vocab';
    document.getElementById('vocab-fields').classList.toggle('hidden', !isVocab);
  });

  // Set default date
  document.getElementById('add-date').value = today();

  // Add card
  document.getElementById('btn-add').addEventListener('click', () => {
    const type = document.getElementById('add-type').value;
    const front = document.getElementById('add-front').value.trim();
    const back = document.getElementById('add-back').value.trim();
    const dateAdded = document.getElementById('add-date').value || today();

    if (type === 'Vocab' && !front) {
      toast('Front text required for Vocab');
      return;
    }

    addCard(deck, type, front, back, dateAdded);
    saveDeck(deck);
    stack = buildDailyStack(deck, viewingDate);

    document.getElementById('add-front').value = '';
    document.getElementById('add-back').value = '';
    toast('Card added');
    renderList();
    renderStats();
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    const csv = exportCSV(deck);
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
    localStorage.removeItem(STORAGE_KEY);
    deck = { cards: [], lastWildDate: null };
    stack = [];
    completedSet.clear();
    if (window.FirebaseSync) FirebaseSync.clearAll();
    renderList();
    renderStats();
    toast('All data cleared');
  });
}

function renderStats() {
  const counts = {};
  for (const t of ALL_TYPES) counts[t] = 0;
  for (const c of deck.cards) counts[c.type]++;

  const statsEl = document.getElementById('deck-stats');
  statsEl.innerHTML = `
    <div>Total cards: <strong>${deck.cards.length}</strong></div>
    ${ALL_TYPES.map(t => `<div>${t}: <strong>${counts[t]}</strong></div>`).join('')}
    <div style="margin-top:8px">Today's stack: <strong>${stack.length}</strong> cards</div>
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
