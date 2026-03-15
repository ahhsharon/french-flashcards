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

function today() {
  return new Date().toISOString().split('T')[0];
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
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

function addCard(deck, type, front, back, dateAdded) {
  deck.cards.push({
    id: crypto.randomUUID(),
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
  if (deck.lastWildDate === t) return;
  // Check if a Wild card for today was already imported
  const alreadyHasWild = deck.cards.some(c => c.type === 'Wild' && c.dateAdded === t);
  if (!alreadyHasWild) {
    addCard(deck, 'Wild', '', '', t);
  }
  deck.lastWildDate = t;
  saveDeck(deck);
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

function buildDailyStack(deck) {
  const stack = []; // each entry: { card, offsetIndex }

  for (let oi = 0; oi < SCHEDULE_OFFSETS.length; oi++) {
    const targetDate = dateNDaysAgo(SCHEDULE_OFFSETS[oi]);
    const matches = deck.cards.filter(c => c.dateAdded === targetDate);
    for (const m of matches) stack.push({ card: m, offsetIndex: oi });
  }

  // Resolve Wild cards: determine their display type
  // Persist resolved type per day so it doesn't re-roll on refresh
  const t = today();
  // Pre-fill resolved types: use persisted Wild resolutions if available
  const resolvedTypes = stack.map(e => {
    if (e.card.type === 'Wild') {
      const orig = deck.cards.find(c => c.id === e.card.id);
      if (orig && orig.wildResolvedType && orig.wildResolvedDate === t) {
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
        // Persist on the original card
        if (original) {
          original.wildResolvedType = resolved;
          original.wildResolvedDate = t;
          deckChanged = true;
        }
      }
      stackResolved.push({ ...card, resolvedType: resolved, offsetIndex });
    } else {
      stackResolved.push({ ...card, resolvedType: card.type, offsetIndex });
    }
  }

  // Update dateLastViewed
  for (const item of stackResolved) {
    const original = deck.cards.find(c => c.id === item.id);
    if (original) original.dateLastViewed = t;
  }
  saveDeck(deck);

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

let deck, stack, completedSet;

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

  ensureDailyWild(deck);
  stack = buildDailyStack(deck);
  completedSet = new Set(
    JSON.parse(localStorage.getItem('completed-today-' + today()) || '[]')
  );

  renderDate();
  renderList();
  setupVocabOverlay();
  setupNav();
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
        stack = buildDailyStack(deck);
        renderList();
      }
    });

    // Listen for remote completion changes
    const completedKey = 'completed-today-' + today();
    FirebaseSync.onCompletedChanged(completedKey, (ids) => {
      completedSet = new Set(ids || []);
      localStorage.setItem(completedKey, JSON.stringify([...completedSet]));
      renderList();
    });
  }
}

function renderDate() {
  const d = new Date();
  document.getElementById('date-display').textContent =
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getScheduleLabel(offsetIndex) {
  const labels = ['Today', '1 day ago', '4 days ago', '11 days ago', '27 days ago', '58 days ago'];
  return labels[offsetIndex] || '';
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
  const key = 'completed-today-' + today();
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
      stack = buildDailyStack(deck);
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
    stack = buildDailyStack(deck);

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
