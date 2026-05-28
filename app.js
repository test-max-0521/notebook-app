(() => {
  const STORAGE_KEY = 'notebook_notes';

  const $list = document.getElementById('notes-list');
  const $search = document.getElementById('search');
  const $newBtn = document.getElementById('new-note');
  const $editorArea = document.getElementById('editor-area');
  const $emptyState = document.getElementById('empty-state');
  const $title = document.getElementById('note-title');
  const $body = document.getElementById('note-body');
  const $preview = document.getElementById('markdown-preview');
  const $slashMenu = document.getElementById('slash-menu');
  const $template = document.getElementById('note-template');
  const $modeWrite = document.getElementById('mode-write');
  const $modePreview = document.getElementById('mode-preview');
  const $date = document.getElementById('note-date');
  const $deleteBtn = document.getElementById('delete-note');

  let notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(note => ({
    ...note,
    title: typeof note.title === 'string' ? note.title : '',
    body: typeof note.body === 'string' ? note.body : '',
    editorMode: note.editorMode === 'preview' ? 'preview' : 'write',
  }));
  let activeId = null;
  let visibleCommands = [];
  let activeCommandIndex = 0;

  const templates = {
    meeting: `## Meeting Notes
Date: ${new Date().toLocaleDateString()}

### Agenda
- 

### Notes
- 

### Action Items
- [ ] `,
    daily: `## Daily Journal
Date: ${new Date().toLocaleDateString()}

### Top priorities
- [ ] 

### Notes

### Wins
- `,
    tasks: `## Task List
- [ ] Inbox triage
- [ ] Deep work block
- [ ] Follow-up messages`,
  };

  const slashCommands = [
    { key: 'todo', title: 'Checklist item', description: 'Insert a task checkbox', snippet: '- [ ] ' },
    { key: 'code', title: 'Code block', description: 'Insert a fenced code block', snippet: '```txt\n\n```' },
    { key: 'image', title: 'Image', description: 'Insert markdown image', snippet: '![description](https://example.com/image.png)' },
    { key: 'audio', title: 'Audio', description: 'Insert playable audio link', snippet: '[audio](https://example.com/audio.mp3)' },
    { key: 'h2', title: 'Heading', description: 'Insert a section heading', snippet: '## ' },
  ];

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

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  function sanitizeUrl(url) {
    const trimmed = (url || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed) || /^blob:/i.test(trimmed)) {
      return trimmed;
    }
    return '';
  }

  function renderInline(text) {
    return text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, rawUrl) => {
        const safeUrl = sanitizeUrl(rawUrl);
        return safeUrl ? `<img src="${escapeAttr(safeUrl)}" alt="${escapeAttr(alt)}">` : `[image blocked: invalid URL]`;
      })
      .replace(/\[audio\]\(([^)]+)\)/gi, (_, rawUrl) => {
        const safeUrl = sanitizeUrl(rawUrl);
        return safeUrl ? `<audio controls preload="none" src="${escapeAttr(safeUrl)}"></audio>` : `[audio blocked: invalid URL]`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, rawUrl) => {
        const safeUrl = sanitizeUrl(rawUrl);
        return safeUrl
          ? `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : label;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function renderMarkdown(markdown) {
    const codeBlocks = [];
    let text = escapeHtml(markdown || '').replace(/\r\n?/g, '\n');

    text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => {
      const idx = codeBlocks.length;
      const langClass = language.trim() ? ` class="language-${language.trim()}"` : '';
      codeBlocks.push(`<pre><code${langClass}>${code}</code></pre>`);
      return `\u0000CODE_${idx}\u0000`;
    });

    const lines = text.split('\n');
    const html = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
      if (inUl) html.push('</ul>');
      if (inOl) html.push('</ol>');
      inUl = false;
      inOl = false;
    };

    lines.forEach(line => {
      const codeMatch = line.match(/^\u0000CODE_(\d+)\u0000$/);
      if (codeMatch) {
        closeLists();
        html.push(codeBlocks[Number(codeMatch[1])]);
        return;
      }

      if (!line.trim()) {
        closeLists();
        return;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeLists();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        return;
      }

      const checklist = line.match(/^- \[([ xX])\]\s+(.+)$/);
      if (checklist) {
        if (!inUl) {
          if (inOl) {
            html.push('</ol>');
            inOl = false;
          }
          html.push('<ul>');
          inUl = true;
        }
        const checked = checklist[1].toLowerCase() === 'x' ? ' checked' : '';
        html.push(`<li class="md-checklist"><input type="checkbox" disabled${checked}>${renderInline(checklist[2])}</li>`);
        return;
      }

      const ul = line.match(/^[-*]\s+(.+)$/);
      if (ul) {
        if (!inUl) {
          if (inOl) {
            html.push('</ol>');
            inOl = false;
          }
          html.push('<ul>');
          inUl = true;
        }
        html.push(`<li>${renderInline(ul[1])}</li>`);
        return;
      }

      const ol = line.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        if (!inOl) {
          if (inUl) {
            html.push('</ul>');
            inUl = false;
          }
          html.push('<ol>');
          inOl = true;
        }
        html.push(`<li>${renderInline(ol[1])}</li>`);
        return;
      }

      closeLists();
      html.push(`<p>${renderInline(line)}</p>`);
    });

    closeLists();
    return html.join('') || '<p>Nothing to preview.</p>';
  }

  function updatePreview() {
    $preview.innerHTML = renderMarkdown($body.value);
  }

  function getActiveNote() {
    return notes.find(n => n.id === activeId);
  }

  function setEditorMode(mode) {
    const note = getActiveNote();
    const nextMode = mode === 'preview' ? 'preview' : 'write';

    if (note) {
      note.editorMode = nextMode;
      save();
    }

    $modeWrite.classList.toggle('active', nextMode === 'write');
    $modePreview.classList.toggle('active', nextMode === 'preview');
    $body.classList.toggle('hidden', nextMode === 'preview');
    $preview.classList.toggle('hidden', nextMode !== 'preview');

    if (nextMode === 'preview') {
      hideSlashMenu();
      updatePreview();
    } else {
      $body.focus();
    }
  }

  function applyTemplate(key) {
    const template = templates[key];
    if (!template || !activeId) return;

    if ($body.value.trim() && !confirm('Replace current note content with this template?')) {
      $template.value = '';
      return;
    }

    $body.value = template;
    updateActive();
    setEditorMode('write');
    $template.value = '';
    $body.focus();
  }

  function getSlashQuery() {
    if (!activeId || $body.classList.contains('hidden')) return null;
    const cursor = $body.selectionStart;
    const beforeCursor = $body.value.slice(0, cursor);
    const lineStart = beforeCursor.lastIndexOf('\n') + 1;
    const currentLine = beforeCursor.slice(lineStart);
    const match = currentLine.match(/^\/([a-z]*)$/i);
    if (!match) return null;
    return {
      query: match[1].toLowerCase(),
      lineStart,
      cursor,
    };
  }

  function hideSlashMenu() {
    $slashMenu.classList.add('hidden');
    $slashMenu.innerHTML = '';
    visibleCommands = [];
    activeCommandIndex = 0;
  }

  function renderSlashMenu(query) {
    const context = getSlashQuery();
    if (!context) {
      hideSlashMenu();
      return;
    }

    visibleCommands = slashCommands.filter(cmd => cmd.key.startsWith(query));
    if (!visibleCommands.length) {
      hideSlashMenu();
      return;
    }

    activeCommandIndex = Math.min(activeCommandIndex, visibleCommands.length - 1);
    $slashMenu.innerHTML = visibleCommands.map((cmd, idx) => `
      <button type="button" class="slash-option ${idx === activeCommandIndex ? 'active' : ''}" data-command="${cmd.key}">
        <div class="slash-option-title">/${cmd.key} — ${cmd.title}</div>
        <div class="slash-option-desc">${cmd.description}</div>
      </button>
    `).join('');

    $slashMenu.classList.remove('hidden');
  }

  function applySlashCommand(commandKey) {
    const context = getSlashQuery();
    const command = slashCommands.find(item => item.key === commandKey);
    if (!context || !command) return;

    const before = $body.value.slice(0, context.lineStart);
    const after = $body.value.slice(context.cursor);
    const nextValue = `${before}${command.snippet}${after}`;
    const nextCursorPos = before.length + command.snippet.length;

    $body.value = nextValue;
    $body.setSelectionRange(nextCursorPos, nextCursorPos);
    hideSlashMenu();
    updateActive();
  }

  function selectNote(id) {
    activeId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    $emptyState.classList.add('hidden');
    $editorArea.classList.remove('hidden');
    $title.value = note.title;
    $body.value = note.body;
    updatePreview();
    $date.textContent = 'Last edited ' + formatDate(note.updatedAt);
    setEditorMode(note.editorMode);
    hideSlashMenu();
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
      editorMode: 'write',
    };
    notes.unshift(note);
    save();
    selectNote(note.id);
    $title.focus();
  }

  function updateActive() {
    const note = getActiveNote();
    if (!note) return;
    note.title = $title.value;
    note.body = $body.value;
    note.updatedAt = Date.now();
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    save();
    renderList();
    updatePreview();
    $date.textContent = 'Last edited ' + formatDate(note.updatedAt);
  }

  function deleteActive() {
    if (!activeId) return;
    notes = notes.filter(n => n.id !== activeId);
    activeId = null;
    save();
    $editorArea.classList.add('hidden');
    $emptyState.classList.remove('hidden');
    hideSlashMenu();
    document.querySelector('.app').classList.remove('editing');
    renderList();
  }

  // Event listeners
  $newBtn.addEventListener('click', createNote);
  $title.addEventListener('input', updateActive);
  $body.addEventListener('input', () => {
    updateActive();
    const context = getSlashQuery();
    if (context) {
      activeCommandIndex = 0;
      renderSlashMenu(context.query);
    } else {
      hideSlashMenu();
    }
  });
  $deleteBtn.addEventListener('click', deleteActive);
  $search.addEventListener('input', renderList);
  $template.addEventListener('change', () => applyTemplate($template.value));
  $modeWrite.addEventListener('click', () => setEditorMode('write'));
  $modePreview.addEventListener('click', () => setEditorMode('preview'));
  $slashMenu.addEventListener('click', e => {
    const target = e.target.closest('.slash-option');
    if (!target) return;
    applySlashCommand(target.dataset.command);
  });
  $body.addEventListener('keydown', e => {
    if ($slashMenu.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeCommandIndex = (activeCommandIndex + 1) % visibleCommands.length;
      renderSlashMenu(getSlashQuery()?.query || '');
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeCommandIndex = (activeCommandIndex - 1 + visibleCommands.length) % visibleCommands.length;
      renderSlashMenu(getSlashQuery()?.query || '');
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = visibleCommands[activeCommandIndex];
      if (selected) applySlashCommand(selected.key);
      return;
    }

    if (e.key === 'Escape') {
      hideSlashMenu();
    }
  });
  $body.addEventListener('blur', () => {
    setTimeout(hideSlashMenu, 120);
  });

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
