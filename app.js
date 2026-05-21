(() => {
  const STORAGE_KEY = 'notebook_notes';

  const $list = document.getElementById('notes-list');
  const $search = document.getElementById('search');
  const $newBtn = document.getElementById('new-note');
  const $editorArea = document.getElementById('editor-area');
  const $emptyState = document.getElementById('empty-state');
  const $title = document.getElementById('note-title');
  const $body = document.getElementById('note-body');
  const $date = document.getElementById('note-date');
  const $deleteBtn = document.getElementById('delete-note');

  let notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let activeId = null;

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
    const filtered = notes.filter(n =>
      n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)
    );

    $list.innerHTML = '';
    filtered.forEach(note => {
      const li = document.createElement('li');
      if (note.id === activeId) li.classList.add('active');
      li.innerHTML = `
        <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-item-preview">${escapeHtml(note.body.slice(0, 80) || 'No content')}</div>
        <div class="note-item-date">${formatDate(note.updatedAt)}</div>
      `;
      li.addEventListener('click', () => selectNote(note.id));
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
    $body.value = note.body;
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
  $body.addEventListener('input', updateActive);
  $deleteBtn.addEventListener('click', deleteActive);
  $search.addEventListener('input', renderList);

  // Keyboard shortcut: Ctrl/Cmd+N for new note
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNote();
    }
  });

  // Initial render
  renderList();
})();
