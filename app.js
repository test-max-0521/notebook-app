(() => {
  const STORAGE_KEY = 'notebook_notes';
  const RECENT_SEARCHES_KEY = 'notebook_recent_searches';
  const FREQUENT_SEARCHES_KEY = 'notebook_frequent_searches';

  const $list = document.getElementById('notes-list');
  const $search = document.getElementById('search');
  const $filterNotebook = document.getElementById('filter-notebook');
  const $filterTag = document.getElementById('filter-tag');
  const $filterDateFrom = document.getElementById('filter-date-from');
  const $filterDateTo = document.getElementById('filter-date-to');
  const $recentSearches = document.getElementById('recent-searches');
  const $frequentSearches = document.getElementById('frequent-searches');
  const $newBtn = document.getElementById('new-note');
  const $editorArea = document.getElementById('editor-area');
  const $emptyState = document.getElementById('empty-state');
  const $title = document.getElementById('note-title');
  const $notebook = document.getElementById('note-notebook');
  const $tags = document.getElementById('note-tags');
  const $attachments = document.getElementById('note-attachments');
  const $body = document.getElementById('note-body');
  const $ocr = document.getElementById('note-ocr');
  const $date = document.getElementById('note-date');
  const $deleteBtn = document.getElementById('delete-note');

  let notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeNote);
  let activeId = null;
  let recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  let frequentSearches = JSON.parse(localStorage.getItem(FREQUENT_SEARCHES_KEY) || '{}');

  function normalizeStringArray(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
  }

  function normalizeNote(note) {
    const now = Date.now();
    return {
      id: note.id || crypto.randomUUID(),
      title: typeof note.title === 'string' ? note.title : '',
      body: typeof note.body === 'string' ? note.body : '',
      createdAt: typeof note.createdAt === 'number' ? note.createdAt : now,
      updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : now,
      notebook: typeof note.notebook === 'string' && note.notebook.trim() ? note.notebook.trim() : 'General',
      tags: normalizeStringArray(note.tags),
      attachments: normalizeStringArray(note.attachments),
      ocrText: typeof note.ocrText === 'string' ? note.ocrText : '',
    };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function saveSearchHistory() {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
    localStorage.setItem(FREQUENT_SEARCHES_KEY, JSON.stringify(frequentSearches));
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getSearchTerms() {
    return $search.value
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function highlightMatches(text, terms) {
    const value = String(text || '');
    if (!terms.length) return escapeHtml(value);

    const uniqueTerms = [...new Set(terms)].sort((a, b) => b.length - a.length);
    const regex = new RegExp(`(${uniqueTerms.map(escapeRegExp).join('|')})`, 'ig');
    const termSet = new Set(uniqueTerms.map(term => term.toLowerCase()));

    return value.split(regex).map(part => {
      if (!part) return '';
      if (termSet.has(part.toLowerCase())) return `<mark>${escapeHtml(part)}</mark>`;
      return escapeHtml(part);
    }).join('');
  }

  function buildSearchableText(note) {
    return [
      note.title,
      note.body,
      note.notebook,
      note.tags.join(' '),
      note.attachments.join(' '),
      note.ocrText,
    ].join(' ').toLowerCase();
  }

  function getDateRange() {
    const from = $filterDateFrom.value ? new Date($filterDateFrom.value + 'T00:00:00').getTime() : null;
    const to = $filterDateTo.value ? new Date($filterDateTo.value + 'T23:59:59.999').getTime() : null;
    return { from, to };
  }

  function populateSelect($select, placeholder, values, selectedValue) {
    $select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholder;
    $select.appendChild(defaultOption);

    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      $select.appendChild(option);
    });

    $select.value = values.includes(selectedValue) ? selectedValue : '';
  }

  function refreshFilterOptions() {
    const selectedNotebook = $filterNotebook.value;
    const selectedTag = $filterTag.value;

    const notebooks = [...new Set(notes.map(note => note.notebook).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const tags = [...new Set(notes.flatMap(note => note.tags))].sort((a, b) => a.localeCompare(b));

    populateSelect($filterNotebook, 'All notebooks', notebooks, selectedNotebook);
    populateSelect($filterTag, 'All tags', tags, selectedTag);
  }

  function filterNotes() {
    const terms = getSearchTerms();
    const notebookFilter = $filterNotebook.value.toLowerCase();
    const tagFilter = $filterTag.value.toLowerCase();
    const { from, to } = getDateRange();

    return notes.filter(note => {
      if (notebookFilter && note.notebook.toLowerCase() !== notebookFilter) return false;
      if (tagFilter && !note.tags.some(tag => tag.toLowerCase() === tagFilter)) return false;
      if (from && note.updatedAt < from) return false;
      if (to && note.updatedAt > to) return false;

      if (!terms.length) return true;
      const searchableText = buildSearchableText(note);
      return terms.every(term => searchableText.includes(term));
    });
  }

  function renderList() {
    refreshFilterOptions();

    const terms = getSearchTerms();
    const filtered = filterNotes();

    $list.innerHTML = '';

    if (!filtered.length) {
      const li = document.createElement('li');
      li.className = 'empty-list';
      li.textContent = 'No matching notes';
      $list.appendChild(li);
      return;
    }

    filtered.forEach(note => {
      const li = document.createElement('li');
      if (note.id === activeId) li.classList.add('active');

      const previewSource = note.body || note.ocrText || note.attachments.join(', ') || 'No content';
      li.innerHTML = `
        <div class="note-item-title">${highlightMatches(note.title || 'Untitled', terms)}</div>
        <div class="note-item-preview">${highlightMatches(previewSource.slice(0, 110), terms)}</div>
        <div class="note-item-meta">${escapeHtml(note.notebook)}${note.tags.length ? ` • ${escapeHtml(note.tags.join(', '))}` : ''}</div>
        <div class="note-item-date">${formatDate(note.updatedAt)}</div>
      `;

      li.addEventListener('click', () => selectNote(note.id));
      $list.appendChild(li);
    });
  }

  function renderSearchChips($container, items) {
    $container.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'search-chip-empty';
      empty.textContent = 'None';
      $container.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'search-chip';
      chip.textContent = item;
      chip.addEventListener('click', () => {
        $search.value = item;
        recordSearch(item);
        renderList();
      });
      $container.appendChild(chip);
    });
  }

  function renderSearchSuggestions() {
    const frequent = Object.entries(frequentSearches)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([query]) => query);

    renderSearchChips($recentSearches, recentSearches.slice(0, 6));
    renderSearchChips($frequentSearches, frequent);
  }

  function recordSearch(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return;

    recentSearches = [normalized, ...recentSearches.filter(item => item !== normalized)].slice(0, 10);
    frequentSearches[normalized] = (frequentSearches[normalized] || 0) + 1;

    saveSearchHistory();
    renderSearchSuggestions();
  }

  function selectNote(id) {
    activeId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    $emptyState.classList.add('hidden');
    $editorArea.classList.remove('hidden');
    $title.value = note.title;
    $notebook.value = note.notebook;
    $tags.value = note.tags.join(', ');
    $attachments.value = note.attachments.join(', ');
    $body.value = note.body;
    $ocr.value = note.ocrText;
    $date.textContent = 'Last edited ' + formatDate(note.updatedAt);
    document.querySelector('.app').classList.add('editing');
    renderList();
  }

  function createNote() {
    const note = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notebook: 'General',
      tags: [],
      attachments: [],
      ocrText: '',
    };
    notes.unshift(note);
    save();
    selectNote(note.id);
    $title.focus();
  }

  function updateActive() {
    const note = notes.find(n => n.id === activeId);
    if (!note) return;

    note.title = $title.value;
    note.notebook = $notebook.value.trim() || 'General';
    note.tags = normalizeStringArray($tags.value);
    note.attachments = normalizeStringArray($attachments.value);
    note.body = $body.value;
    note.ocrText = $ocr.value;
    note.updatedAt = Date.now();

    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    save();
    renderList();
    $date.textContent = 'Last edited ' + formatDate(note.updatedAt);
  }

  function deleteActive() {
    if (!activeId) return;
    notes = notes.filter(n => n.id !== activeId);
    activeId = null;
    save();
    $editorArea.classList.add('hidden');
    $emptyState.classList.remove('hidden');
    document.querySelector('.app').classList.remove('editing');
    renderList();
  }

  // Event listeners
  $newBtn.addEventListener('click', createNote);
  $title.addEventListener('input', updateActive);
  $notebook.addEventListener('input', updateActive);
  $tags.addEventListener('input', updateActive);
  $attachments.addEventListener('input', updateActive);
  $body.addEventListener('input', updateActive);
  $ocr.addEventListener('input', updateActive);
  $deleteBtn.addEventListener('click', deleteActive);

  $search.addEventListener('input', renderList);
  $search.addEventListener('change', () => recordSearch($search.value));
  $search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      recordSearch($search.value);
      renderList();
    }
  });

  $filterNotebook.addEventListener('change', renderList);
  $filterTag.addEventListener('change', renderList);
  $filterDateFrom.addEventListener('change', renderList);
  $filterDateTo.addEventListener('change', renderList);

  // Keyboard shortcut: Ctrl/Cmd+N for new note
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNote();
    }
  });

  save();
  renderSearchSuggestions();
  renderList();
})();
