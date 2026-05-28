(() => {
  const STORAGE_KEY = 'notebook_notes';

  const $list = document.getElementById('notes-list');
  const $search = document.getElementById('search');
  const $newBtn = document.getElementById('new-note');
  const $editorArea = document.getElementById('editor-area');
  const $emptyState = document.getElementById('empty-state');
  const $title = document.getElementById('note-title');
  const $tags = document.getElementById('note-tags');
  const $body = document.getElementById('note-body');
  const $date = document.getElementById('note-date');
  const $deleteBtn = document.getElementById('delete-note');
  const $collections = document.getElementById('smart-collections');
  const $activeTagFilter = document.getElementById('active-tag-filter');
  const $activeTagFilterText = document.getElementById('active-tag-filter-text');
  const $clearTagFilter = document.getElementById('clear-tag-filter');
  const $backlinks = document.getElementById('backlinks');
  const $backlinksList = document.getElementById('backlinks-list');

  let notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeNote);
  let activeId = null;
  let activeCollection = 'all';
  let activeTag = '';

  notes.sort((a, b) => b.updatedAt - a.updatedAt);

  function normalizeNote(note) {
    return {
      id: note.id || crypto.randomUUID(),
      title: typeof note.title === 'string' ? note.title : '',
      body: typeof note.body === 'string' ? note.body : '',
      tags: Array.isArray(note.tags) ? parseTags(note.tags.join(',')) : [],
      createdAt: typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
      updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : Date.now(),
    };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function renderList() {
    const query = $search.value.toLowerCase();
    let filtered = notes.filter(note => {
      const matchesQuery = note.title.toLowerCase().includes(query) ||
        note.body.toLowerCase().includes(query) ||
        note.tags.some(tag => tag.toLowerCase().includes(query));
      const matchesTag = !activeTag || note.tags.some(tag => tag.toLowerCase() === activeTag.toLowerCase());
      const matchesWeek = activeCollection !== 'week' || note.updatedAt >= Date.now() - 7 * 24 * 60 * 60 * 1000;
      return matchesQuery && matchesTag && matchesWeek;
    });

    if (activeCollection === 'recent') {
      filtered = filtered.slice(0, 5);
    }

    $list.innerHTML = '';
    filtered.forEach(note => {
      const li = document.createElement('li');
      if (note.id === activeId) li.classList.add('active');
      const tagsHtml = note.tags.map(tag => `
        <button type="button" class="note-tag" data-tag="${encodeURIComponent(tag)}">#${escapeHtml(tag)}</button>
      `).join('');
      li.innerHTML = `
        <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-item-preview">${escapeHtml(note.body.slice(0, 80) || 'No content')}</div>
        ${tagsHtml ? `<div class="note-item-tags">${tagsHtml}</div>` : ''}
        <div class="note-item-date">${formatDate(note.updatedAt)}</div>
      `;
      li.addEventListener('click', () => selectNote(note.id));
      li.querySelectorAll('.note-tag').forEach($tag => {
        $tag.addEventListener('click', e => {
          e.stopPropagation();
          activeTag = decodeURIComponent($tag.dataset.tag || '');
          renderActiveTagFilter();
          renderList();
        });
      });
      $list.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function selectNote(id) {
    activeId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    $emptyState.classList.add('hidden');
    $editorArea.classList.remove('hidden');
    $title.value = note.title;
    $tags.value = note.tags.join(', ');
    $body.value = note.body;
    $date.textContent = 'Last edited ' + formatDate(note.updatedAt);
    document.querySelector('.app').classList.add('editing');
    renderBacklinks(note);
    renderList();
  }

  function createNote() {
    const note = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
    note.body = $body.value;
    note.tags = parseTags($tags.value);
    note.updatedAt = Date.now();
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    save();
    renderList();
    renderBacklinks(note);
    $date.textContent = 'Last edited ' + formatDate(note.updatedAt);
  }

  function deleteActive() {
    if (!activeId) return;
    notes = notes.filter(n => n.id !== activeId);
    activeId = null;
    save();
    $editorArea.classList.add('hidden');
    $emptyState.classList.remove('hidden');
    $backlinks.classList.add('hidden');
    document.querySelector('.app').classList.remove('editing');
    renderList();
  }

  function parseTags(rawTags) {
    const seen = new Set();
    return rawTags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag)
      .filter(tag => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function extractLinks(note) {
    const links = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = regex.exec(note.body)) !== null) {
      const target = match[1].trim();
      if (target) links.push(target.toLowerCase());
    }
    return links;
  }

  function renderBacklinks(note) {
    const title = note.title.trim().toLowerCase();
    if (!title) {
      $backlinks.classList.add('hidden');
      return;
    }

    const backlinks = notes.filter(other =>
      other.id !== note.id && extractLinks(other).includes(title)
    );

    if (!backlinks.length) {
      $backlinks.classList.add('hidden');
      return;
    }

    $backlinks.classList.remove('hidden');
    $backlinksList.innerHTML = '';
    backlinks.forEach(linkedNote => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = linkedNote.title || 'Untitled';
      button.addEventListener('click', () => selectNote(linkedNote.id));
      li.appendChild(button);
      $backlinksList.appendChild(li);
    });
  }

  function renderCollectionState() {
    $collections.querySelectorAll('[data-collection]').forEach(button => {
      button.classList.toggle('active', button.dataset.collection === activeCollection);
    });
  }

  function renderActiveTagFilter() {
    if (!activeTag) {
      $activeTagFilter.classList.add('hidden');
      $activeTagFilterText.textContent = '';
      return;
    }
    $activeTagFilter.classList.remove('hidden');
    $activeTagFilterText.textContent = `Filtering by #${activeTag}`;
  }

  // Event listeners
  $newBtn.addEventListener('click', createNote);
  $title.addEventListener('input', updateActive);
  $tags.addEventListener('input', updateActive);
  $body.addEventListener('input', updateActive);
  $deleteBtn.addEventListener('click', deleteActive);
  $search.addEventListener('input', renderList);
  $collections.addEventListener('click', e => {
    const button = e.target.closest('[data-collection]');
    if (!button) return;
    activeCollection = button.dataset.collection;
    renderCollectionState();
    renderList();
  });
  $clearTagFilter.addEventListener('click', () => {
    activeTag = '';
    renderActiveTagFilter();
    renderList();
  });

  // Keyboard shortcut: Ctrl/Cmd+N for new note
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNote();
    }
  });

  // Initial render
  renderCollectionState();
  renderActiveTagFilter();
  renderList();
})();
