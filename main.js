const { Plugin, ItemView, WorkspaceLeaf, Notice, PluginSettingTab, Setting, SuggestModal, setIcon } = require('obsidian');

const VIEW_TYPE_SCABBARD = 'draw-steel-scabbard-view';

const DEFAULT_SETTINGS = {
  serverUrl: 'https://scabbard.leweber.org',
  defaultCategory: 'Weapons',
  insertFormat: 'wikilink', // 'wikilink' | 'card' | 'markdown'
  notesFolder: 'Compendium/Items',
  enableHoverPreview: true
};

class ScabbardPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.itemsCache = [];
    this.itemsMap = new Map();
    this.hoverPopoverEl = null;
    this.hidePopoverTimer = null;

    // Register custom sidebar view
    this.registerView(
      VIEW_TYPE_SCABBARD,
      (leaf) => new ScabbardView(leaf, this)
    );

    // Left ribbon icon (sword) to open Scabbard view
    this.addRibbonIcon('sword', 'Scabbard: Weapons & Items', () => {
      this.activateView();
    });

    // Command: Open Scabbard View
    this.addCommand({
      id: 'open-scabbard-view',
      name: 'Open Scabbard Weapons & Items Window',
      callback: () => {
        this.activateView();
      }
    });

    // Command: Quick Search & Link Weapon or Item
    this.addCommand({
      id: 'quick-search-scabbard-item',
      name: 'Quick Search & Link Weapon or Item',
      editorCallback: (editor) => {
        new ScabbardQuickModal(this.app, this, editor).open();
      }
    });

    // Command: Generate All Compendium Item Notes into Vault
    this.addCommand({
      id: 'generate-all-scabbard-notes',
      name: 'Generate All Compendium Item Notes into Vault',
      callback: async () => {
        await this.generateAllItemNotes();
      }
    });

    // Register hover popover on document for both Editing (Live Preview) and Reading modes
    this.registerHoverListener();

    // Register Markdown Post Processor for Reading Mode styling
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (!this.settings.enableHoverPreview) return;
      const links = el.querySelectorAll('a.internal-link');
      links.forEach(link => {
        const text = (link.getAttribute('data-href') || link.textContent || '').trim();
        if (this.findItemByName(text)) {
          link.classList.add('scabbard-linked-item');
        }
      });
    });

    // Settings tab
    this.addSettingTab(new ScabbardSettingTab(this.app, this));

    // Initial background load of items cache
    this.fetchItems().catch(() => {});
  }

  onunload() {
    this.removeHoverPopover();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_SCABBARD)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_SCABBARD,
          active: true
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  normalizeName(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  findItemByName(name) {
    if (!name) return null;
    const norm = this.normalizeName(name.replace(/^\[\[|\]\]$/g, '').trim());
    return this.itemsMap.get(norm) || null;
  }

  async fetchItems(force = false) {
    if (!force && this.itemsCache.length > 0) {
      return this.itemsCache;
    }

    const baseUrl = (this.settings.serverUrl || 'https://scabbard.leweber.org').replace(/\/+$/, '');
    const url = `${baseUrl}/api/items`;
    try {
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      this.itemsCache = data;
      this.itemsMap.clear();
      data.forEach(item => {
        this.itemsMap.set(this.normalizeName(item.name), item);
      });
      return data;
    } catch (err) {
      console.error('[Scabbard Plugin] Failed to fetch items:', err);
      throw err;
    }
  }

  // -------------------------------------------------------------------
  // HOVER POPOVER PREVIEW
  // -------------------------------------------------------------------
  registerHoverListener() {
    this.registerDomEvent(document, 'mouseover', (evt) => {
      if (!this.settings.enableHoverPreview) return;
      const target = evt.target.closest('a.internal-link, .cm-hmd-internal-link, .cm-underline');
      if (!target) return;

      const linkText = target.getAttribute('data-href') || target.textContent.replace(/^\[\[|\]\]$/g, '').trim();
      const item = this.findItemByName(linkText);
      if (item) {
        if (this.hidePopoverTimer) {
          clearTimeout(this.hidePopoverTimer);
          this.hidePopoverTimer = null;
        }
        this.showHoverPopover(target, item);
      }
    });

    this.registerDomEvent(document, 'mouseout', (evt) => {
      const target = evt.target.closest('a.internal-link, .cm-hmd-internal-link, .cm-underline');
      if (target) {
        this.scheduleHidePopover();
      }
    });
  }

  showHoverPopover(targetEl, item) {
    this.removeHoverPopover();

    const popover = document.createElement('div');
    popover.className = 'scabbard-hover-popover';

    popover.addEventListener('mouseenter', () => {
      if (this.hidePopoverTimer) {
        clearTimeout(this.hidePopoverTimer);
        this.hidePopoverTimer = null;
      }
    });
    popover.addEventListener('mouseleave', () => {
      this.scheduleHidePopover();
    });

    // Badges Row
    const badgesRow = document.createElement('div');
    badgesRow.className = 'scabbard-badges';
    badgesRow.style.marginBottom = '6px';

    const isWeapon = (item.category || '').toLowerCase().includes('weapon');
    const isArmor = (item.category || '').toLowerCase().includes('armor');
    const isTrinket = (item.category || '').toLowerCase().includes('trinket');
    const catClass = isWeapon ? 'badge-weapon' : isArmor ? 'badge-armor' : isTrinket ? 'badge-trinket' : 'badge-consumable';

    const catBadge = document.createElement('span');
    catBadge.className = `scabbard-badge ${catClass}`;
    catBadge.textContent = item.category;
    badgesRow.appendChild(catBadge);

    const echBadge = document.createElement('span');
    echBadge.className = 'scabbard-badge badge-echelon';
    echBadge.textContent = item.echelon;
    badgesRow.appendChild(echBadge);

    if (item.source_book) {
      const srcBadge = document.createElement('span');
      srcBadge.className = 'scabbard-badge';
      srcBadge.textContent = item.source_book.includes('Beastheart') ? 'Beastheart' :
                             item.source_book.includes('Summoner') ? 'Summoner' :
                             item.source_book.includes('Mythic') ? 'Mythic' : 'Core';
      badgesRow.appendChild(srcBadge);
    }
    popover.appendChild(badgesRow);

    // Title
    const title = document.createElement('h4');
    title.className = 'scabbard-card-title';
    title.textContent = item.name;
    popover.appendChild(title);

    // Keywords
    if (item.keywords && item.keywords.length > 0) {
      const kwRow = document.createElement('div');
      kwRow.className = 'scabbard-card-keywords';
      kwRow.style.marginBottom = '6px';
      item.keywords.forEach(kw => {
        const tag = document.createElement('span');
        tag.className = 'scabbard-keyword-tag';
        tag.textContent = kw;
        kwRow.appendChild(tag);
      });
      popover.appendChild(kwRow);
    }

    // Flavor
    if (item.flavor) {
      const flavor = document.createElement('p');
      flavor.className = 'scabbard-card-flavor';
      flavor.style.marginBottom = '8px';
      flavor.textContent = item.flavor;
      popover.appendChild(flavor);
    }

    // Effect / Leveled progression
    const effectBox = document.createElement('div');
    effectBox.className = 'scabbard-card-effect';
    if (item.leveled_benefits && Object.keys(item.leveled_benefits).length > 0) {
      Object.entries(item.leveled_benefits).forEach(([lvl, txt]) => {
        const lvlDiv = document.createElement('div');
        lvlDiv.style.marginBottom = '4px';
        const strong = document.createElement('strong');
        strong.textContent = `${lvl}: `;
        lvlDiv.appendChild(strong);
        const span = document.createElement('span');
        span.textContent = txt;
        lvlDiv.appendChild(span);
        effectBox.appendChild(lvlDiv);
      });
    } else {
      effectBox.textContent = item.effect || 'No special effect.';
    }
    popover.appendChild(effectBox);

    // Prerequisite / Goal footer
    if (item.item_prerequisite && item.item_prerequisite !== 'None') {
      const prereq = document.createElement('div');
      prereq.style.fontSize = '10px';
      prereq.style.fontFamily = 'var(--font-monospace)';
      prereq.style.color = 'var(--text-muted)';
      prereq.style.marginTop = '6px';
      prereq.innerHTML = `<strong>Prerequisite:</strong> ${item.item_prerequisite} ${item.project_goal ? `(Goal: ${item.project_goal})` : ''}`;
      popover.appendChild(prereq);
    }

    document.body.appendChild(popover);
    this.hoverPopoverEl = popover;

    // Positioning
    const rect = targetEl.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();

    let top = rect.bottom + 8;
    let left = rect.left;

    // Keep on screen horizontally
    if (left + popRect.width > window.innerWidth - 16) {
      left = window.innerWidth - popRect.width - 16;
    }
    if (left < 16) left = 16;

    // Keep on screen vertically
    if (top + popRect.height > window.innerHeight - 16) {
      top = rect.top - popRect.height - 8;
    }

    popover.style.top = `${Math.max(16, top)}px`;
    popover.style.left = `${left}px`;
  }

  scheduleHidePopover() {
    if (this.hidePopoverTimer) clearTimeout(this.hidePopoverTimer);
    this.hidePopoverTimer = setTimeout(() => {
      this.removeHoverPopover();
      this.hidePopoverTimer = null;
    }, 280);
  }

  removeHoverPopover() {
    if (this.hoverPopoverEl && this.hoverPopoverEl.parentNode) {
      this.hoverPopoverEl.parentNode.removeChild(this.hoverPopoverEl);
    }
    this.hoverPopoverEl = null;
  }

  // -------------------------------------------------------------------
  // CARD & NOTE FORMATTING
  // -------------------------------------------------------------------
  formatMarkdownCard(item) {
    const keywordsStr = (item.keywords || []).join(', ') || 'None';
    const lines = [
      `> [!example] ${item.name}`,
      `> *${item.category} • ${item.echelon}*  `,
      `> **Keywords:** ${keywordsStr}  `
    ];

    if (item.flavor) {
      lines.push(`> *"${item.flavor}"*  `);
    }

    if (item.item_prerequisite && item.item_prerequisite !== 'None') {
      lines.push(`> **Recipe / Ingredients:** ${item.item_prerequisite}  `);
      if (item.project_goal) {
        lines.push(`> **Project Goal:** ${item.project_goal}  `);
      }
    }

    lines.push(`> `);

    if (item.leveled_benefits && Object.keys(item.leveled_benefits).length > 0) {
      Object.entries(item.leveled_benefits).forEach(([lvl, text]) => {
        lines.push(`> **${lvl}:** ${text.replace(/\n/g, '\n> ')}  `);
      });
    } else if (item.effect) {
      lines.push(`> ${item.effect.replace(/\n/g, '\n> ')}`);
    }

    return lines.join('\n') + '\n';
  }

  async createItemNote(item, silent = false) {
    const folder = (this.settings.notesFolder || 'Compendium/Items').replace(/\/+$/, '');
    const filename = `${item.name.replace(/[\\/:*?"<>|]/g, '')}.md`;
    const fullPath = `${folder}/${filename}`;

    try {
      const parts = folder.split('/');
      let currentPath = '';
      for (const part of parts) {
        if (!part) continue;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!this.app.vault.getAbstractFileByPath(currentPath)) {
          await this.app.vault.createFolder(currentPath);
        }
      }

      const existing = this.app.vault.getAbstractFileByPath(fullPath);
      if (existing) {
        if (!silent) {
          new Notice(`Note already exists: ${filename}`);
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(existing);
        }
        return false;
      }

      const keywordsYaml = (item.keywords || []).map(k => `  - "${k}"`).join('\n');
      const content = [
        `---`,
        `type: item`,
        `name: "${item.name}"`,
        `category: "${item.category}"`,
        `echelon: "${item.echelon}"`,
        `keywords:`,
        keywordsYaml,
        `source: "${item.source_book || 'Draw Steel'}"`,
        `scabbard_id: "${item.id}"`,
        `---`,
        ``,
        `# ${item.name}`,
        `*${item.category} • ${item.echelon}*`,
        ``,
        item.flavor ? `> [!quote] Lore\n> *"${item.flavor}"*\n` : '',
        (item.item_prerequisite && item.item_prerequisite !== 'None') ? `> [!info] Downtime Crafting\n> **Prerequisites:** ${item.item_prerequisite}\n> **Goal:** ${item.project_goal || 'Standard'}\n` : '',
        `## Effect`,
        item.effect || 'None',
        ``
      ].filter(Boolean).join('\n');

      const newFile = await this.app.vault.create(fullPath, content);
      if (!silent) {
        new Notice(`Created note: ${filename}`);
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(newFile);
      }
      return true;
    } catch (err) {
      if (!silent) new Notice(`Failed to create note: ${err.message}`);
      console.error(err);
      return false;
    }
  }

  async generateAllItemNotes() {
    new Notice('Fetching all items from Scabbard to generate notes...');
    try {
      const items = await this.fetchItems(true);
      let created = 0;
      let skipped = 0;

      for (const item of items) {
        const wasCreated = await this.createItemNote(item, true);
        if (wasCreated) created++;
        else skipped++;
      }

      new Notice(`Compendium Generation Complete!\nCreated: ${created} new notes\nPreserved: ${skipped} existing`);
    } catch (err) {
      new Notice(`Failed to generate notes: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------
// SCABBARD SIDEBAR / WINDOW VIEW
// ---------------------------------------------------------------------
class ScabbardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.allItems = [];
    this.searchQuery = '';
    this.activeCategory = plugin.settings.defaultCategory || 'Weapons';
    this.isLoading = false;
  }

  getViewType() {
    return VIEW_TYPE_SCABBARD;
  }

  getDisplayText() {
    return 'Scabbard Weapons & Items';
  }

  getIcon() {
    return 'sword';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('scabbard-view-container');

    await this.loadAndRender();
  }

  async loadAndRender() {
    this.isLoading = true;
    this.renderHeader();
    this.renderLoading();

    try {
      this.allItems = await this.plugin.fetchItems(true);
      this.isLoading = false;
      this.render();
    } catch (err) {
      this.isLoading = false;
      this.renderError(err.message);
    }
  }

  renderHeader() {
    const container = this.containerEl.children[1];
    let header = container.querySelector('.scabbard-header');
    if (!header) {
      header = container.createDiv({ cls: 'scabbard-header' });
    } else {
      header.empty();
    }

    const titleRow = header.createDiv({ cls: 'scabbard-title-row' });
    const title = titleRow.createDiv({ cls: 'scabbard-title' });
    const iconSpan = title.createSpan();
    setIcon(iconSpan, 'sword');
    title.createSpan({ text: 'Draw Steel Scabbard' });
    title.createSpan({ cls: 'scabbard-badge-source', text: 'Live API' });

    const actions = titleRow.createDiv({ cls: 'scabbard-header-actions' });
    
    const refreshBtn = actions.createEl('button', { cls: 'scabbard-icon-btn', attr: { title: 'Refresh from Scabbard' } });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.onclick = () => this.loadAndRender();

    const searchRow = header.createDiv({ cls: 'scabbard-search-row' });
    const searchInput = searchRow.createEl('input', {
      cls: 'scabbard-search-input',
      attr: { type: 'text', placeholder: 'Search weapons, traits, effects...' }
    });
    searchInput.value = this.searchQuery;
    searchInput.oninput = (e) => {
      this.searchQuery = e.target.value;
      this.renderCards();
    };

    if (this.searchQuery) {
      const clearBtn = searchRow.createEl('button', { cls: 'scabbard-search-clear', text: '×' });
      clearBtn.onclick = () => {
        this.searchQuery = '';
        searchInput.value = '';
        this.renderCards();
      };
    }

    const pillsRow = header.createDiv({ cls: 'scabbard-pills-row' });
    const categories = [
      { key: 'Weapons', label: 'Weapons' },
      { key: 'Armor', label: 'Armor' },
      { key: 'Trinket', label: 'Trinkets' },
      { key: 'Consumable', label: 'Consumables' },
      { key: 'Artifact', label: 'Artifacts' },
      { key: 'All', label: 'All Items' }
    ];

    categories.forEach(cat => {
      const pill = pillsRow.createEl('button', {
        cls: `scabbard-pill ${cat.key === 'Weapons' ? 'pill-weapons' : ''} ${this.activeCategory === cat.key ? 'active' : ''}`,
        text: cat.label
      });
      pill.onclick = () => {
        this.activeCategory = cat.key;
        this.renderHeader();
        this.renderCards();
      };
    });

    const metaRow = header.createDiv({ cls: 'scabbard-meta-row' });
    metaRow.id = 'scabbard-meta-count';
  }

  renderLoading() {
    const container = this.containerEl.children[1];
    let list = container.querySelector('.scabbard-cards-list');
    if (!list) list = container.createDiv({ cls: 'scabbard-cards-list' });
    list.empty();
    list.createDiv({ cls: 'scabbard-loading', text: 'Connecting to Scabbard API...' });
  }

  renderError(msg) {
    const container = this.containerEl.children[1];
    let list = container.querySelector('.scabbard-cards-list');
    if (!list) list = container.createDiv({ cls: 'scabbard-cards-list' });
    list.empty();
    const errBox = list.createDiv({ cls: 'scabbard-empty-state' });
    errBox.createDiv({ text: `Could not connect to ${this.plugin.settings.serverUrl}` });
    errBox.createEl('small', { text: msg });
  }

  getFilteredItems() {
    let list = [...this.allItems];

    if (this.activeCategory === 'Weapons') {
      list = list.filter(i => (i.category || '').toLowerCase().includes('weapon'));
    } else if (this.activeCategory === 'Armor') {
      list = list.filter(i => (i.category || '').toLowerCase().includes('armor'));
    } else if (this.activeCategory !== 'All') {
      list = list.filter(i => i.category === this.activeCategory);
    }

    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.flavor && i.flavor.toLowerCase().includes(q)) ||
        (i.effect && i.effect.toLowerCase().includes(q)) ||
        (i.keywords || []).some(k => k.toLowerCase().includes(q))
      );
    }

    return list;
  }

  render() {
    this.renderHeader();
    this.renderCards();
  }

  renderCards() {
    const container = this.containerEl.children[1];
    let list = container.querySelector('.scabbard-cards-list');
    if (!list) list = container.createDiv({ cls: 'scabbard-cards-list' });
    list.empty();

    const filtered = this.getFilteredItems();

    const meta = container.querySelector('#scabbard-meta-count');
    if (meta) {
      meta.textContent = `Showing ${filtered.length} item(s) • ${this.activeCategory}`;
    }

    if (filtered.length === 0) {
      list.createDiv({ cls: 'scabbard-empty-state', text: 'No items match your criteria.' });
      return;
    }

    filtered.forEach(item => {
      this.renderCard(list, item);
    });
  }

  renderCard(container, item) {
    const card = container.createDiv({ cls: 'scabbard-card' });

    const headerRow = card.createDiv({ cls: 'scabbard-card-header' });
    const badges = headerRow.createDiv({ cls: 'scabbard-badges' });

    const isWeapon = (item.category || '').toLowerCase().includes('weapon');
    const isArmor = (item.category || '').toLowerCase().includes('armor');
    const isTrinket = (item.category || '').toLowerCase().includes('trinket');

    const catBadgeClass = isWeapon ? 'badge-weapon' : isArmor ? 'badge-armor' : isTrinket ? 'badge-trinket' : 'badge-consumable';
    badges.createSpan({ cls: `scabbard-badge ${catBadgeClass}`, text: item.category });
    badges.createSpan({ cls: 'scabbard-badge badge-echelon', text: item.echelon });

    if (item.source_book) {
      const srcShort = item.source_book.includes('Beastheart') ? 'Beastheart' :
                       item.source_book.includes('Summoner') ? 'Summoner' :
                       item.source_book.includes('Mythic') ? 'Mythic' : 'Core';
      badges.createSpan({ cls: 'scabbard-badge', text: srcShort });
    }

    headerRow.createEl('h4', { cls: 'scabbard-card-title', text: item.name });

    if (item.flavor) {
      card.createEl('p', { cls: 'scabbard-card-flavor', text: item.flavor });
    }

    if (item.keywords && item.keywords.length > 0) {
      const kwRow = card.createDiv({ cls: 'scabbard-card-keywords' });
      item.keywords.forEach(kw => {
        kwRow.createSpan({ cls: 'scabbard-keyword-tag', text: kw });
      });
    }

    const effectBox = card.createDiv({ cls: 'scabbard-card-effect' });
    if (item.leveled_benefits && Object.keys(item.leveled_benefits).length > 0) {
      Object.entries(item.leveled_benefits).forEach(([lvl, txt]) => {
        const lvlDiv = effectBox.createDiv();
        lvlDiv.createEl('strong', { text: `${lvl}: ` });
        lvlDiv.createSpan({ text: txt });
      });
    } else {
      effectBox.createSpan({ text: item.effect || 'No special effect.' });
    }

    const actions = card.createDiv({ cls: 'scabbard-card-actions' });
    const groupLeft = actions.createDiv({ cls: 'scabbard-action-group' });

    const linkBtn = groupLeft.createEl('button', {
      cls: 'scabbard-btn-sm scabbard-btn-primary',
      text: '+ Link',
      attr: { title: 'Insert [[Wikilink]] into active note' }
    });
    linkBtn.onmousedown = (e) => e.preventDefault();
    linkBtn.onclick = (e) => {
      e.preventDefault();
      this.insertItemAtCursor(item, 'link');
    };

    const cardBtn = groupLeft.createEl('button', {
      cls: 'scabbard-btn-sm',
      text: '+ Card',
      attr: { title: 'Insert formatted Obsidian Callout box' }
    });
    cardBtn.onmousedown = (e) => e.preventDefault();
    cardBtn.onclick = (e) => {
      e.preventDefault();
      this.insertItemAtCursor(item, 'card');
    };

    const groupRight = actions.createDiv({ cls: 'scabbard-action-group' });

    const noteBtn = groupRight.createEl('button', {
      cls: 'scabbard-btn-sm',
      text: '+ Note',
      attr: { title: 'Create standalone note in Vault' }
    });
    noteBtn.onclick = () => this.plugin.createItemNote(item);

    const webBtn = groupRight.createEl('button', {
      cls: 'scabbard-btn-sm',
      attr: { title: 'Open in Scabbard web compendium' }
    });
    setIcon(webBtn, 'external-link');
    webBtn.onclick = () => {
      window.open(`${this.plugin.settings.serverUrl}`, '_blank');
    };
  }

  getTargetEditor() {
    // 1. Check workspace.activeEditor (Obsidian 1.0+ official active editor tracker)
    if (this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor) {
      return this.app.workspace.activeEditor.editor;
    }

    // 2. Check getActiveViewOfType
    const MarkdownView = require('obsidian').MarkdownView;
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.editor) {
      return activeView.editor;
    }

    // 3. Check getMostRecentLeaf
    const mostRecent = this.app.workspace.getMostRecentLeaf();
    if (mostRecent && mostRecent.view && mostRecent.view.editor) {
      return mostRecent.view.editor;
    }

    // 4. Check all open markdown leaves in workspace
    const mdLeaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of mdLeaves) {
      if (leaf.view && leaf.view.editor && leaf.view.getMode && leaf.view.getMode() !== 'preview') {
        return leaf.view.editor;
      }
    }
    for (const leaf of mdLeaves) {
      if (leaf.view && leaf.view.editor) {
        return leaf.view.editor;
      }
    }

    return null;
  }

  insertItemAtCursor(item, type) {
    const editor = this.getTargetEditor();
    const textToInsert = (type === 'link') ? `[[${item.name}]]` : this.plugin.formatMarkdownCard(item);

    if (editor) {
      editor.replaceSelection(textToInsert);
      new Notice(type === 'link' ? `Inserted link: [[${item.name}]]` : `Inserted card: ${item.name}`);
    } else {
      // Fallback: Copy to clipboard so user can instantly Ctrl+V into whatever note they want!
      navigator.clipboard.writeText(textToInsert);
      new Notice(`Copied ${type === 'link' ? 'link' : 'card'} to clipboard! (Press Ctrl + V to paste)`);
    }
  }
}

// ---------------------------------------------------------------------
// QUICK SEARCH & LINK MODAL (Ctrl + P)
// ---------------------------------------------------------------------
class ScabbardQuickModal extends SuggestModal {
  constructor(app, plugin, editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.items = [];
    this.setPlaceholder('Search weapons and items from Scabbard to link...');
  }

  async onOpen() {
    super.onOpen();
    try {
      this.items = await this.plugin.fetchItems();
    } catch (e) {
      new Notice('Failed to load items from Scabbard.');
    }
  }

  getSuggestions(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      return this.items
        .filter(i => (i.category || '').toLowerCase().includes('weapon'))
        .slice(0, 30);
    }

    return this.items
      .filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.category && i.category.toLowerCase().includes(q)) ||
        (i.keywords || []).some(k => k.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }

  renderSuggestion(item, el) {
    el.createEl('div', { text: item.name, cls: 'suggestion-title font-bold text-sm' });
    const meta = el.createEl('small', { cls: 'suggestion-note text-xs text-muted' });
    meta.textContent = `${item.category} • ${item.echelon} ${(item.keywords && item.keywords.length) ? '• ' + item.keywords.join(', ') : ''}`;
  }

  onChooseSuggestion(item, evt) {
    if (evt.shiftKey) {
      this.editor.replaceSelection(this.plugin.formatMarkdownCard(item));
      new Notice(`Inserted card: ${item.name}`);
    } else {
      this.editor.replaceSelection(`[[${item.name}]]`);
      new Notice(`Linked: [[${item.name}]]`);
    }
  }
}

// ---------------------------------------------------------------------
// PLUGIN SETTINGS TAB
// ---------------------------------------------------------------------
class ScabbardSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Draw Steel Scabbard Settings' });

    new Setting(containerEl)
      .setName('Scabbard Server URL')
      .setDesc('Address of your running Draw Steel Compendium web app / API.')
      .addText(text => text
        .setPlaceholder('https://scabbard.leweber.org')
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async (value) => {
          this.plugin.settings.serverUrl = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable Hover Previews')
      .setDesc('Show floating item card popup when hovering over item wikilinks in your notes.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableHoverPreview !== false)
        .onChange(async (val) => {
          this.plugin.settings.enableHoverPreview = val;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Default View Category')
      .setDesc('Which category to focus on when opening the Scabbard window.')
      .addDropdown(drop => drop
        .addOption('Weapons', 'Weapons (Default)')
        .addOption('Armor', 'Armor')
        .addOption('Trinket', 'Trinkets')
        .addOption('Consumable', 'Consumables')
        .addOption('Artifact', 'Artifacts')
        .addOption('All', 'All Items')
        .setValue(this.plugin.settings.defaultCategory || 'Weapons')
        .onChange(async (val) => {
          this.plugin.settings.defaultCategory = val;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Vault Notes Folder')
      .setDesc('Target folder where item markdown notes will be created.')
      .addText(text => text
        .setPlaceholder('Compendium/Items')
        .setValue(this.plugin.settings.notesFolder || 'Compendium/Items')
        .onChange(async (val) => {
          this.plugin.settings.notesFolder = val.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Generate All Compendium Notes')
      .setDesc('Download and create markdown notes in your vault for all 300+ items (enables native Obsidian Page Preview on all wikilinks).')
      .addButton(btn => btn
        .setButtonText('Generate All Notes')
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Generating...');
          await this.plugin.generateAllItemNotes();
          btn.setButtonText('Complete!');
          setTimeout(() => {
            btn.setDisabled(false);
            btn.setButtonText('Generate All Notes');
          }, 3000);
        }));

    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Test if Obsidian can communicate with your Scabbard server.')
      .addButton(btn => btn
        .setButtonText('Test Connection')
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Testing...');
          try {
            const items = await this.plugin.fetchItems(true);
            new Notice(`Connected to Scabbard! Loaded ${items.length} items successfully.`);
            btn.setButtonText('Connected');
          } catch (err) {
            new Notice(`Connection failed: ${err.message}`);
            btn.setButtonText('Failed');
          } finally {
            btn.setDisabled(false);
          }
        }));
  }
}

module.exports = ScabbardPlugin;
