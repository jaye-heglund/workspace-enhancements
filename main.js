const { Plugin, PluginSettingTab, Setting, Modal, Platform, WorkspaceTabs, Notice, MarkdownRenderer, Component, TFile, parseYaml, prepareFuzzySearch } = require("obsidian");

class SearchPicker {
  constructor(options) {
    this.options = options;
    this.document = options.document || document;
    this.window = this.document.defaultView;
    this.prefix = options.classPrefix || "we-search-picker";
    this.selectedIndex = 0;
    this.results = [];
    this.closed = false;
    this.pointerMoved = false;
    this.root = this.document.createElement("div");
    this.root.className = options.rootClass || `${this.prefix}-picker`;
    this.root.setAttribute("role", "dialog");
    this.search = this.document.createElement("input");
    this.search.className = `${this.prefix}-search`;
    this.search.placeholder = options.placeholder || "Search";
    this.search.setAttribute("aria-label", options.ariaLabel || this.search.placeholder);
    this.list = this.document.createElement("div");
    this.list.className = `${this.prefix}-results`;
    this.list.setAttribute("role", "listbox");
    this.root.append(this.search, this.list);
    this.document.body.appendChild(this.root);
    this.document.documentElement.classList.add("we-picker-pointer-hidden");

    this.onInput = () => { this.selectedIndex = 0; this.render(); };
    this.onPointerMove = (event) => {
      this.pointerMoved = true;
      this.document.documentElement.classList.remove("we-picker-pointer-hidden");
      const hoveredItem = event.target?.closest?.('[role="option"]');
      const hoveredIndex = Array.from(this.list.children).indexOf(hoveredItem);
      if (hoveredIndex >= 0) {
        this.selectedIndex = hoveredIndex;
        this.updateSelection();
      }
    };
    this.onSearchKeyDown = (event) => this.handleKeyDown(event);
    this.onModifiedEnter = (event) => {
      if (!this.options.openWithModifiers || !this.root.contains(event.target)
        || event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || !this.results.length) return;
      this.handleKeyDown(event);
      if (event.defaultPrevented) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    this.onOutsidePointerDown = (event) => { if (!this.root.contains(event.target)) this.close(); };
    this.onSourceKeyDown = (event) => this.handleSourceKeyDown(event);
    this.search.addEventListener("input", this.onInput);
    this.search.addEventListener("keydown", this.onSearchKeyDown);
    this.document.addEventListener("mousemove", this.onPointerMove, { once: true });
    this.window?.addEventListener("keydown", this.onModifiedEnter, true);
    this.document.addEventListener("pointerdown", this.onOutsidePointerDown);
    if (options.sourceElement) this.document.addEventListener("keydown", this.onSourceKeyDown, true);
    this.render();
    this.search.focus();
  }

  render() {
    if (this.closed) return;
    this.list.replaceChildren();
    this.results = this.options.getResults(this.search.value) || [];
    if (!this.results.length) {
      const empty = this.document.createElement("div");
      empty.className = `${this.prefix}-empty`;
      empty.textContent = typeof this.options.emptyMessage === "function"
        ? this.options.emptyMessage(this.search.value)
        : this.options.emptyMessage || "No results found";
      this.list.appendChild(empty);
    } else {
      this.results.forEach((result, index) => {
        const item = this.options.renderItem(result, index, this.document);
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", index === this.selectedIndex ? "true" : "false");
        item.addEventListener("mouseenter", () => {
          if (!this.pointerMoved) return;
          this.selectedIndex = index;
          this.updateSelection();
        });
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => this.options.onChoose(result, false));
        this.list.appendChild(item);
      });
    }
    this.options.position?.(this.root);
  }

  updateSelection() {
    Array.from(this.list.children).forEach((item, index) => {
      const selected = index === this.selectedIndex;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) item.scrollIntoView({ block: "nearest" });
    });
  }

  handleSourceKeyDown(event) {
    if (!this.options.sourceElement?.contains(event.target)) return;
    if (["Escape", "ArrowDown", "ArrowUp", "ArrowRight", "Enter", "Tab"].includes(event.key)) {
      this.handleKeyDown(event);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      this.search.setSelectionRange(0, this.search.value.length);
      return;
    }
    const start = this.search.selectionStart ?? this.search.value.length;
    const end = this.search.selectionEnd ?? start;
    if (event.key === "Backspace") {
      event.preventDefault();
      const removeFrom = start === end ? Math.max(0, start - 1) : start;
      this.search.value = this.search.value.slice(0, removeFrom) + this.search.value.slice(end);
      this.search.setSelectionRange(removeFrom, removeFrom);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const next = start + event.key.length;
      this.search.value = this.search.value.slice(0, start) + event.key + this.search.value.slice(end);
      this.search.setSelectionRange(next, next);
    } else {
      return;
    }
    this.selectedIndex = 0;
    this.render();
  }

  handleKeyDown(event) {
    const count = this.results.length;
    if (event.key === "Escape") {
      event.preventDefault();
      this.close(true);
    } else if (this.options.openWithModifiers && event.key === "Enter" && (event.ctrlKey || event.metaKey) && count) {
      event.preventDefault();
      this.options.onChoose(this.results[this.selectedIndex], false, event.shiftKey ? "window" : "tab");
    } else if (event.key === "ArrowDown" && count) {
      event.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % count;
      this.updateSelection();
    } else if (event.key === "ArrowUp" && count) {
      event.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + count) % count;
      this.updateSelection();
    } else if (event.key === "ArrowRight" && count) {
      event.preventDefault();
      this.options.onChoose(this.results[this.selectedIndex], true);
    } else if ((event.key === "Enter" || event.key === "Tab") && count) {
      event.preventDefault();
      this.options.onChoose(this.results[this.selectedIndex], false);
    }
  }

  close(restoreFocus = false) {
    if (this.closed) return;
    this.closed = true;
    this.search.removeEventListener("input", this.onInput);
    this.search.removeEventListener("keydown", this.onSearchKeyDown);
    this.document.removeEventListener("mousemove", this.onPointerMove);
    this.document.documentElement.classList.remove("we-picker-pointer-hidden");
    this.window?.removeEventListener("keydown", this.onModifiedEnter, true);
    this.document.removeEventListener("pointerdown", this.onOutsidePointerDown);
    if (this.options.sourceElement) this.document.removeEventListener("keydown", this.onSourceKeyDown, true);
    this.root.remove();
    this.options.onClose?.(this, restoreFocus);
  }
}

class FileFinder {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.recentFileCount = 0;
  }

  open() {
    try {
      this.plugin.activePicker?.close();
      const searchIndex = this.buildSearchIndex();
      const activeLeaf = this.app.workspace.activeLeaf;
      const originView = activeLeaf?.view;
      const targetDocument = activeLeaf?.containerEl?.ownerDocument || document;
      let picker;
      picker = new SearchPicker({
        document: targetDocument,
        classPrefix: "we-search-picker",
        rootClass: "we-search-picker",
        placeholder: "Search files by name or path",
        ariaLabel: "Search files",
        openWithModifiers: true,
        getResults: (query) => this.searchFiles(query, searchIndex),
        emptyMessage: (query) => query ? "No matching files" : "No files found",
        renderItem: (file, index, document) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "we-search-picker-result";
          if (this.recentFileCount > 0 && index === this.recentFileCount) {
            item.classList.add("we-search-picker-section-start");
          }
          const title = document.createElement("span");
          title.className = "we-search-picker-title";
          title.textContent = file.basename;
          const metadata = document.createElement("span");
          metadata.className = "we-search-picker-metadata";
          metadata.textContent = file.parent?.path || "Vault root";
          item.append(title, metadata);
          return item;
        },
        onChoose: (file, keepOpen, destination) => this.openFile(file, keepOpen, destination),
        onClose: (closedPicker, restoreFocus) => {
          if (this.plugin.activePicker === closedPicker) this.plugin.activePicker = null;
          if (restoreFocus && originView?.containerEl?.isConnected) originView.editor?.focus();
        },
        position: (root) => {
          const targetWindow = targetDocument.defaultView || window;
          root.style.left = `${Math.max(12, (targetWindow.innerWidth - 560) / 2)}px`;
          root.style.top = `${Math.max(12, Math.round(targetWindow.innerHeight * 0.18))}px`;
        }
      });
      this.plugin.activePicker = picker;
    } catch (error) {
      console.error("UX Enhancements file finder failed to open", error);
      new Notice(`Could not open file finder: ${error.message || error}`);
    }
  }

  buildSearchIndex() {
    const excludedPaths = this.app.vault.getConfig?.("userIgnoreFilters") || [];
    const files = this.app.vault.getFiles().filter((file) => !excludedPaths.some((excludedPath) => {
      const normalizedPath = excludedPath.replace(/^\/+|\/+$/g, "");
      return normalizedPath && (file.path === normalizedPath || file.path.startsWith(`${normalizedPath}/`));
    })).map((file) => ({ file, path: file.path, basename: file.basename }));
    return {
      files,
      byPath: new Map(files.map((entry) => [entry.path, entry.file])),
      sortedFiles: [...files].sort((left, right) => left.path.localeCompare(right.path))
    };
  }

  searchFiles(query, searchIndex) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      const recentPaths = this.app.workspace.getLastOpenFiles?.() || [];
      const recent = [...new Set(recentPaths)]
        .slice(0, this.plugin.settings.recentFileLimit)
        .map((path) => searchIndex.byPath.get(path))
        .filter(Boolean);
      this.recentFileCount = recent.length;
      const recentSet = new Set(recent);
      const remaining = searchIndex.sortedFiles
        .filter((entry) => !recentSet.has(entry.file))
        .map((entry) => entry.file);
      return [...recent, ...remaining].slice(0, 80);
    }

    this.recentFileCount = 0;
    const fuzzySearch = prepareFuzzySearch(normalizedQuery);
    return searchIndex.files.map(({ file, path, basename }) => {
      const pathMatch = fuzzySearch(path);
      const nameMatch = fuzzySearch(basename);
      const match = !pathMatch ? nameMatch : !nameMatch ? pathMatch : pathMatch.score >= nameMatch.score ? pathMatch : nameMatch;
      return match ? { file, score: match.score } : null;
    }).filter(Boolean)
      .sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path))
      .slice(0, 80)
      .map((result) => result.file);
  }

  async openFile(file, keepOpen, destination) {
    if (!file) return;
    const openInNewWindow = destination === "window";
    if (openInNewWindow && !Platform.isDesktop) {
      new Notice("Opening a file in a new window is only available on desktop.");
      return;
    }
    const openInNewTab = destination === "tab" || (keepOpen && this.plugin.settings.features.quickSwitcherNewTab);
    const keepPickerOpen = keepOpen && this.plugin.settings.features.quickSwitcherNewTab && !destination;
    if (!keepPickerOpen) this.plugin.activePicker?.close();
    try {
      const leaf = this.app.workspace.getLeaf(openInNewWindow ? "window" : openInNewTab ? "tab" : false);
      await leaf.openFile(file);
      if (keepPickerOpen) this.plugin.activePicker?.search.focus();
    } catch (error) {
      new Notice(`Could not open file: ${error.message}`);
    }
  }
}

const RECENT_COMMAND_LIMIT = 5;
const RECENT_FILE_LIMIT = 5;
const RECENT_COMMAND_HISTORY_LIMIT = 100;

class CommandPalette {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.recentCommandCount = 0;
  }

  open() {
    try {
      this.plugin.activePicker?.close();
      const activeLeaf = this.app.workspace.activeLeaf;
      const originView = activeLeaf?.view;
      const targetDocument = activeLeaf?.containerEl?.ownerDocument || document;
      let picker;
      picker = new SearchPicker({
        document: targetDocument,
        classPrefix: "we-search-picker",
        rootClass: "we-search-picker",
        placeholder: "Search commands",
        ariaLabel: "Search commands",
        getResults: (query) => this.searchCommands(query),
        emptyMessage: (query) => query ? "No matching commands" : "No commands available",
        renderItem: (command, index, document) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "we-search-picker-result";
          if (this.recentCommandCount > 0 && index === this.recentCommandCount) {
            item.classList.add("we-search-picker-section-start");
          }
          const title = document.createElement("span");
          title.className = "we-search-picker-title";
          title.textContent = command.name;
          const metadata = document.createElement("span");
          metadata.className = "we-search-picker-metadata";
          metadata.textContent = command.id;
          item.append(title, metadata);
          return item;
        },
        onChoose: (command) => {
          this.plugin.activePicker?.close(true);
          if (!this.app.commands.executeCommandById(command.id)) {
            new Notice(`Could not run command: ${command.name}`);
          } else {
            this.plugin.rememberCommand(command.id);
          }
        },
        onClose: (closedPicker, restoreFocus) => {
          if (this.plugin.activePicker === closedPicker) this.plugin.activePicker = null;
          if (restoreFocus && originView?.containerEl?.isConnected) originView.editor?.focus();
        },
        position: (root) => {
          const targetWindow = targetDocument.defaultView || window;
          root.style.left = `${Math.max(12, (targetWindow.innerWidth - 560) / 2)}px`;
          root.style.top = `${Math.max(12, Math.round(targetWindow.innerHeight * 0.18))}px`;
        }
      });
      this.plugin.activePicker = picker;
    } catch (error) {
      console.error("UX Enhancements command palette failed to open", error);
      new Notice(`Could not open command palette: ${error.message || error}`);
    }
  }

  searchCommands(query) {
    const commands = (this.app.commands.listCommands?.() || [])
      .filter((command) => command.name && command.id !== "command-palette:open");
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      const sorted = commands.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
      const commandsById = new Map(sorted.map((command) => [command.id, command]));
      const recent = this.plugin.settings.recentCommands
        .slice(0, this.plugin.settings.recentCommandLimit)
        .map((id) => commandsById.get(id))
        .filter(Boolean);
      const recentIds = new Set(recent.map((command) => command.id));
      this.recentCommandCount = recent.length;
      return [...recent, ...sorted.filter((command) => !recentIds.has(command.id))].slice(0, 100);
    }

    this.recentCommandCount = 0;
    const fuzzySearch = prepareFuzzySearch(normalizedQuery);
    return commands.map((command) => {
      const nameMatch = fuzzySearch(command.name);
      const idMatch = fuzzySearch(command.id);
      const match = !nameMatch ? idMatch : !idMatch ? nameMatch : nameMatch.score >= idMatch.score ? nameMatch : idMatch;
      return match ? { command, score: match.score } : null;
    }).filter(Boolean)
      .sort((left, right) => right.score - left.score || left.command.name.localeCompare(right.command.name))
      .slice(0, 100)
      .map((result) => result.command);
  }
}

class TemplatePicker {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.documents = new Set();
    this.onWindowOpen = (workspaceWindow) => this.registerDocument(workspaceWindow.doc);
    this.onWindowClose = (workspaceWindow) => this.unregisterDocument(workspaceWindow.doc);
    this.onRibbonClick = (event) => this.handleRibbonClick(event);
  }

  start() {
    this.registerDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl?.ownerDocument));
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
  }

  stop() {
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    for (const targetDocument of this.documents) this.unregisterDocument(targetDocument);
  }

  registerDocument(targetDocument) {
    if (!targetDocument?.addEventListener || this.documents.has(targetDocument)) return;
    targetDocument.addEventListener("click", this.onRibbonClick, true);
    this.documents.add(targetDocument);
  }

  unregisterDocument(targetDocument) {
    if (!this.documents.delete(targetDocument)) return;
    targetDocument.removeEventListener("click", this.onRibbonClick, true);
  }

  handleRibbonClick(event) {
    const ribbonAction = event.target?.closest?.(".side-dock-ribbon-action");
    if (!ribbonAction) return;
    const label = [
      ribbonAction.getAttribute("aria-label"),
      ribbonAction.getAttribute("title"),
      ribbonAction.getAttribute("data-tooltip")
    ].filter(Boolean).join(" ").toLowerCase();
    if (!label.includes("insert template")) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.open();
  }

  async open() {
    try {
      this.plugin.activePicker?.close();
      const leaf = this.app.workspace.activeLeaf;
      if (!leaf?.view?.editor) {
        new Notice("Open a note before inserting a template.");
        return;
      }
      const configDir = this.app.vault.configDir || ".obsidian";
      const config = JSON.parse(await this.app.vault.adapter.read(`${configDir}/templates.json`));
      const folder = (config.folder || "").replace(/^\/+|\/+$/g, "");
      const templates = this.app.vault.getMarkdownFiles()
        .filter((file) => folder && file.path.startsWith(`${folder}/`))
        .sort((left, right) => left.path.localeCompare(right.path));
      const targetDocument = leaf.containerEl?.ownerDocument || document;
      let picker;
      picker = new SearchPicker({
        document: targetDocument,
        classPrefix: "we-search-picker",
        rootClass: "we-search-picker",
        placeholder: "Search templates",
        ariaLabel: "Search templates",
        getResults: (query) => this.searchTemplates(templates, query),
        emptyMessage: (query) => query
          ? "No matching templates"
          : folder ? `No templates found in ${folder}` : "Set a template folder in Templates settings",
        renderItem: (file, _index, document) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "we-search-picker-result";
          const title = document.createElement("span");
          title.className = "we-search-picker-title";
          title.textContent = file.basename;
          const metadata = document.createElement("span");
          metadata.className = "we-search-picker-metadata";
          metadata.textContent = file.parent?.path || folder;
          item.append(title, metadata);
          return item;
        },
        onChoose: (file) => {
          this.plugin.activePicker?.close();
          void this.insertTemplate(file, leaf, config);
        },
        onClose: (closedPicker, restoreFocus) => {
          if (this.plugin.activePicker === closedPicker) this.plugin.activePicker = null;
          if (restoreFocus && leaf.containerEl?.isConnected) leaf.view.editor?.focus();
        },
        position: (root) => {
          const targetWindow = targetDocument.defaultView || window;
          root.style.left = `${Math.max(12, (targetWindow.innerWidth - 560) / 2)}px`;
          root.style.top = `${Math.max(12, Math.round(targetWindow.innerHeight * 0.18))}px`;
        }
      });
      this.plugin.activePicker = picker;
    } catch (error) {
      console.error("UX Enhancements template picker failed to open", error);
      new Notice(`Could not open template picker: ${error.message || error}`);
    }
  }

  searchTemplates(templates, query) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return templates.slice(0, 100);

    const fuzzySearch = prepareFuzzySearch(normalizedQuery);
    return templates.map((file) => {
      const pathMatch = fuzzySearch(file.path);
      const nameMatch = fuzzySearch(file.basename);
      const match = !pathMatch ? nameMatch : !nameMatch ? pathMatch : pathMatch.score >= nameMatch.score ? pathMatch : nameMatch;
      return match ? { file, score: match.score } : null;
    }).filter(Boolean)
      .sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path))
      .slice(0, 100)
      .map((result) => result.file);
  }

  async insertTemplate(templateFile, leaf, config) {
    const editor = leaf.view?.editor;
    if (!editor) return;
    try {
      let text = await this.app.vault.cachedRead(templateFile);
      const targetWindow = leaf.containerEl?.ownerDocument?.defaultView || window;
      const moment = targetWindow.moment || window.moment;
      const activeFile = leaf.view.file;
      const title = activeFile?.basename || "";
      text = text.replace(/\{\{(date|time)(?::([^}]+))?\}\}|\{\{title\}\}/g, (token, variable, format) => {
        if (token === "{{title}}") return title;
        const defaultFormat = variable === "date"
          ? config.dateFormat || "YYYY-MM-DD"
          : config.timeFormat || "HH:mm";
        if (typeof moment === "function") return moment().format(format || defaultFormat);
        return variable === "date" ? new Date().toISOString().slice(0, 10) : new Date().toTimeString().slice(0, 5);
      });

      const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (frontmatter && activeFile instanceof TFile) {
        const properties = parseYaml(frontmatter[1]);
        if (properties && typeof properties === "object" && !Array.isArray(properties)) {
          await this.app.fileManager.processFrontMatter(activeFile, (current) => Object.assign(current, properties));
          text = text.slice(frontmatter[0].length);
        }
      }
      editor.replaceSelection(text);
      editor.focus();
    } catch (error) {
      console.error("UX Enhancements template insertion failed", error);
      new Notice(`Could not insert template: ${error.message || error}`);
    }
  }
}

class InFileNavigation {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.views = new Map();
    this.lastHistoryMouseButton = null;
    this.lastHistoryMouseAt = 0;
    this.documents = new Set();
    this.onEditorMouseDown = (event) => this.handleEditorMouseDown(event);
    this.onHistoryMouseEvent = (event) => this.handleHistoryMouseEvent(event);
    this.onWindowOpen = (workspaceWindow) => this.registerDocument(workspaceWindow.doc);
    this.onWindowClose = (workspaceWindow) => this.unregisterDocument(workspaceWindow.doc);
    this.onLayoutChange = () => this.refreshViews();
  }

  start() {
    this.registerDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl?.ownerDocument));
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
    // Temporarily disabled while checking sidebar toggle behavior.
    // this.app.workspace.on("layout-change", this.onLayoutChange);
    this.refreshViews();
  }

  stop() {
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    this.app.workspace.off("layout-change", this.onLayoutChange);
    for (const doc of this.documents) this.unregisterDocument(doc);
    this.views.clear();
  }

  registerDocument(doc) {
    if (!doc?.addEventListener || this.documents.has(doc)) return;
    doc.addEventListener("mousedown", this.onEditorMouseDown, true);
    doc.defaultView?.addEventListener("mousedown", this.onHistoryMouseEvent, true);
    doc.defaultView?.addEventListener("auxclick", this.onHistoryMouseEvent, true);
    this.documents.add(doc);
  }

  unregisterDocument(doc) {
    if (!this.documents.delete(doc)) return;
    doc.removeEventListener("mousedown", this.onEditorMouseDown, true);
    doc.defaultView?.removeEventListener("mousedown", this.onHistoryMouseEvent, true);
    doc.defaultView?.removeEventListener("auxclick", this.onHistoryMouseEvent, true);
  }

  refreshViews() {
    const present = new Set();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!leaf.view?.editor) return;
      const editor = leaf.view.editor;
      const cm = editor.cm;
      if (!cm?.scrollDOM || !cm?.contentDOM) return;
      present.add(leaf);
      if (!this.views.has(leaf)) this.views.set(leaf, { leaf, editor, cm, backStack: [], forwardStack: [] });
    });
    for (const leaf of this.views.keys()) {
      if (!present.has(leaf)) this.views.delete(leaf);
    }
  }

  handleEditorMouseDown(event) {
    if (event.button !== 0 || event.target?.nodeType !== 1) return;
    const record = [...this.views.values()].find(({ cm }) => cm.contentDOM.contains(event.target));
    if (record) this.recordPosition(record.leaf);
  }

  recordPosition(leaf) {
    const record = this.views.get(leaf);
    if (!record) return;
    record.backStack.push(this.capturePosition(record));
    this.trimHistory(record.backStack);
    record.forwardStack.length = 0;
  }

  trimHistory(stack) {
    const limit = this.plugin.settings.navigation.historyLimit;
    if (stack.length > limit) stack.splice(0, stack.length - limit);
  }

  applyHistoryLimit() {
    for (const record of this.views.values()) {
      this.trimHistory(record.backStack);
      this.trimHistory(record.forwardStack);
    }
  }

  capturePosition(record) {
    return {
      path: record.leaf.view.file?.path,
      cursor: record.editor.getCursor(),
      scrollTop: record.cm.scrollDOM.scrollTop
    };
  }

  restorePosition(record, position) {
    const line = Math.max(0, Math.min(position.cursor.line, record.editor.lastLine()));
    const ch = Math.max(0, Math.min(position.cursor.ch, record.editor.getLine(line).length));
    record.editor.setCursor({ line, ch });
    record.editor.focus();
    record.cm.scrollDOM.scrollTop = position.scrollTop;
  }

  handleHistoryMouseEvent(event) {
    if (event.button !== 3 && event.button !== 4) return;
    const duplicateAuxClick = event.type === "auxclick"
      && event.button === this.lastHistoryMouseButton
      && Date.now() - this.lastHistoryMouseAt < 2000;
    if (duplicateAuxClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.lastHistoryMouseButton = null;
      return;
    }

    const doc = event.currentTarget?.document || event.target?.ownerDocument;
    const activeLeaf = this.app.workspace.activeLeaf;
    const leaf = activeLeaf?.containerEl?.ownerDocument === doc
      ? activeLeaf
      : [...this.views.keys()].find((viewLeaf) => viewLeaf.containerEl?.ownerDocument === doc
        && viewLeaf.containerEl.contains(doc?.activeElement));
    const record = this.views.get(leaf);
    const goingBack = event.button === 3;
    const source = goingBack ? record?.backStack : record?.forwardStack;
    const destination = source?.[source.length - 1];
    if (!record || !destination || destination.path !== record.leaf.view.file?.path) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "mousedown") {
      this.lastHistoryMouseButton = event.button;
      this.lastHistoryMouseAt = Date.now();
    }
    source.pop();
    (goingBack ? record.forwardStack : record.backStack).push(this.capturePosition(record));
    this.restorePosition(record, destination);
  }
}

class QuickSwitcherNewTab {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.documents = new Set();
    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onWindowOpen = (workspaceWindow) => this.registerDocument(workspaceWindow.doc);
    this.onWindowClose = (workspaceWindow) => this.unregisterDocument(workspaceWindow.doc);
  }

  start() {
    this.registerDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl?.ownerDocument));
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
  }

  stop() {
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    for (const doc of this.documents) this.unregisterDocument(doc);
  }

  registerDocument(doc) {
    if (!doc?.addEventListener || this.documents.has(doc)) return;
    doc.addEventListener("keydown", this.onKeyDown, true);
    this.documents.add(doc);
  }

  unregisterDocument(doc) {
    if (!this.documents.delete(doc)) return;
    doc.removeEventListener("keydown", this.onKeyDown, true);
  }

  handleKeyDown(event) {
    if (event.key !== "ArrowRight" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const input = event.target;
    if (!input?.matches?.("input.prompt-input")) return;
    const prompt = input.closest(".prompt");
    const selected = prompt?.querySelector(".suggestion-item.is-selected");
    if (!selected) return;

    const file = this.findSelectedFile(selected);
    if (!file) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void this.openInNewTab(file, input);
  }

  findSelectedFile(suggestion) {
    const files = this.app.vault.getFiles();
    const title = suggestion.querySelector(".suggestion-title")?.textContent?.trim();
    if (!title) return null;

    const dataPath = suggestion.dataset?.path || suggestion.getAttribute("data-path");
    const normalizedDataPath = this.normalizePath(dataPath);
    if (normalizedDataPath) {
      const exactMatch = files.find((file) => this.getFilePathVariants(file).includes(normalizedDataPath));
      if (exactMatch) return exactMatch;
    }

    const normalizedTitle = this.normalizePath(title);
    const candidates = files.filter((file) => {
      const paths = this.getFilePathVariants(file);
      return file.name === title
        || file.basename === title
        || paths.some((path) => path === normalizedTitle || path.endsWith(`/${normalizedTitle}`));
    });
    if (candidates.length <= 1) return candidates[0] || null;

    const note = this.normalizePath(suggestion.querySelector(".suggestion-note")?.textContent);
    if (!note) return null;
    const narrowed = candidates.filter((file) => {
      const parentPath = this.normalizePath(file.parent?.path);
      const fullPath = this.normalizePath(file.path);
      return parentPath === note
        || parentPath.endsWith(`/${note}`)
        || note.endsWith(`/${parentPath}`)
        || fullPath === note
        || fullPath.endsWith(`/${note}`);
    });
    return narrowed.length === 1 ? narrowed[0] : null;
  }

  getFilePathVariants(file) {
    const path = this.normalizePath(file.path);
    const extension = typeof file.extension === "string" ? file.extension : "";
    const suffix = extension ? `.${extension}` : "";
    const extensionlessPath = suffix && path.toLowerCase().endsWith(suffix.toLowerCase())
      ? path.slice(0, -suffix.length)
      : path;
    return [path, extensionlessPath];
  }

  normalizePath(value) {
    if (typeof value !== "string") return "";
    let path = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    try {
      path = decodeURIComponent(path);
    } catch {}
    return path;
  }

  async openInNewTab(file, input) {
    try {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      const promptInputs = input.ownerDocument.querySelectorAll(".prompt input.prompt-input");
      const currentInput = promptInputs[promptInputs.length - 1] || input;
      currentInput.focus();
      const end = currentInput.value.length;
      currentInput.setSelectionRange(end, end);
    } catch (error) {
      console.error("UX Enhancements: could not open the Quick Switcher selection", error);
    }
  }
}

class FindInSplitOnRepeat {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.documents = new Map();
    this.pendingLeaves = new Set();
    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onWindowOpen = (workspaceWindow) => this.registerDocument(workspaceWindow.doc);
    this.onWindowClose = (workspaceWindow) => this.unregisterDocument(workspaceWindow.doc);
  }

  start() {
    this.registerDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl?.ownerDocument));
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
  }

  stop() {
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    for (const [doc, record] of this.documents) {
      record.observer?.disconnect();
      for (const panel of record.panels) panel.removeEventListener("keydown", this.onKeyDown, true);
    }
    this.documents.clear();
    this.pendingLeaves.clear();
  }

  registerDocument(doc) {
    if (!doc?.querySelectorAll || this.documents.has(doc)) return;
    const record = { panels: new Set(), observer: null };
    this.documents.set(doc, record);
    const MutationObserverClass = doc.defaultView?.MutationObserver;
    if (MutationObserverClass) {
      record.observer = new MutationObserverClass(() => this.refreshDocument(doc));
      record.observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    }
    this.refreshDocument(doc);
  }

  unregisterDocument(doc) {
    const record = this.documents.get(doc);
    if (!record) return;
    record.observer?.disconnect();
    for (const panel of record.panels) panel.removeEventListener("keydown", this.onKeyDown, true);
    this.documents.delete(doc);
  }

  refreshDocument(doc) {
    const record = this.documents.get(doc);
    if (!record) return;
    const panels = new Set(doc.querySelectorAll(".cm-search"));
    for (const panel of record.panels) {
      if (!panels.has(panel)) {
        panel.removeEventListener("keydown", this.onKeyDown, true);
        record.panels.delete(panel);
      }
    }
    for (const panel of panels) {
      if (record.panels.has(panel)) continue;
      panel.addEventListener("keydown", this.onKeyDown, true);
      record.panels.add(panel);
    }
  }

  handleKeyDown(event) {
    if (event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)
      || (event.key?.toLowerCase() !== "f" && event.code !== "KeyF")) return;
    const target = event.target || event.currentTarget?.document?.activeElement;
    const searchPanel = target?.closest?.(".cm-search");
    if (!searchPanel) return;
    const input = searchPanel.querySelector('input[name="search"]')
      || searchPanel.querySelector('input[aria-label="Find"], input[placeholder="Find"]')
      || searchPanel.querySelector("input");
    if (!input || (target !== input && target?.closest?.("input") !== input)) return;

    const workspaceLeafEl = input.closest?.(".workspace-leaf");
    let sourceLeaf = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!sourceLeaf && leaf.containerEl?.ownerDocument === input.ownerDocument
        && (leaf.containerEl === workspaceLeafEl || leaf.containerEl?.contains(input)
          || leaf.view?.editor?.cm?.dom?.contains(input))
        && leaf.view?.editor) sourceLeaf = leaf;
    });
    if (!sourceLeaf) {
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf?.containerEl?.ownerDocument === input.ownerDocument && activeLeaf.view?.editor) {
        sourceLeaf = activeLeaf;
      }
    }
    if (!sourceLeaf || this.pendingLeaves.has(sourceLeaf)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void this.openSearchInSplit(sourceLeaf, input);
  }

  async openSearchInSplit(sourceLeaf, sourceInput) {
    this.pendingLeaves.add(sourceLeaf);
    const workspace = this.app.workspace;
    let splitLeaf = null;
    try {
      const sourceEditor = sourceLeaf.view.editor;
      const cursor = sourceEditor.getCursor();
      const scrollTop = sourceEditor.cm?.scrollDOM?.scrollTop ?? 0;
      const query = sourceInput.value;
      const selectionStart = sourceInput.selectionStart ?? query.length;
      const selectionEnd = sourceInput.selectionEnd ?? selectionStart;
      const viewState = sourceLeaf.getViewState();
      const ephemeralState = sourceLeaf.getEphemeralState();

      splitLeaf = workspace.createLeafBySplit(sourceLeaf, "vertical", false);
      await splitLeaf.setViewState(viewState, ephemeralState);
      const splitEditor = splitLeaf.view?.editor;
      splitEditor?.setCursor(cursor);
      const splitScrollDOM = splitEditor?.cm?.scrollDOM;
      if (splitScrollDOM) splitScrollDOM.scrollTop = scrollTop;
      workspace.setActiveLeaf(sourceLeaf, false, true);
      if (sourceInput.isConnected) {
        sourceInput.focus();
        sourceInput.setSelectionRange(selectionStart, selectionEnd);
      }
    } catch (error) {
      splitLeaf?.detach();
      workspace.setActiveLeaf(sourceLeaf, false, true);
      console.error("UX Enhancements: could not open Find in a split", error);
      new Notice("Could not duplicate this note for search. Your original search is unchanged.");
    } finally {
      this.pendingLeaves.delete(sourceLeaf);
    }
  }
}

function readHeading(line) {
  const match = line.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)\s*$/);
  if (!match) return null;
  return { level: match[1].length, text: match[2].replace(/[ \t]+#+[ \t]*$/, "").trim() };
}

function collectHeadingPath(record, beforeLine) {
  const { editor, cm } = record;
  const doc = cm.state.doc;
  if (!record.headingIndex || record.headingIndex.doc !== doc) {
    record.headingIndex = {
      doc,
      scannedThrough: 0,
      stack: [],
      fenceCharacter: "",
      fenceLength: 0,
      headings: []
    };
  }

  const index = record.headingIndex;
  const targetLine = Math.min(Math.max(0, beforeLine - 1), doc.lines);
  for (let lineNumber = index.scannedThrough + 1; lineNumber <= targetLine; lineNumber++) {
    const line = editor.getLine(lineNumber - 1);
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      if (!index.fenceCharacter) {
        index.fenceCharacter = marker;
        index.fenceLength = fence[1].length;
      } else if (marker === index.fenceCharacter && fence[1].length >= index.fenceLength) {
        index.fenceCharacter = "";
        index.fenceLength = 0;
      }
      continue;
    }
    if (index.fenceCharacter) continue;

    let heading = readHeading(line);
    if (!heading && line.trim() && lineNumber < doc.lines) {
      const underline = editor.getLine(lineNumber).match(/^ {0,3}(=+|-+)[ \t]*$/);
      if (underline) heading = { level: underline[1][0] === "=" ? 1 : 2, text: line.trim() };
    }
    if (!heading) continue;

    while (index.stack.length && index.stack[index.stack.length - 1].level >= heading.level) index.stack.pop();
    index.stack.push({ ...heading, line: lineNumber });
    index.headings.push({
      line: lineNumber,
      path: index.stack.map((item) => ({ ...item }))
    });
  }
  index.scannedThrough = Math.max(index.scannedThrough, targetLine);

  let low = 0;
  let high = index.headings.length - 1;
  let current = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (index.headings[middle].line <= targetLine) {
      current = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return current < 0 ? [] : index.headings[current].path;
}

class StickyHeadings {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.views = new Map();
    this.onLayoutChange = () => this.refreshViews();
    this.onWindowOpen = () => this.refreshViews();
    this.onWindowClose = () => this.refreshViews();
    this.onEditorChange = (editor) => this.refreshEditor(editor);
  }

  start() {
    this.app.workspace.on("layout-change", this.onLayoutChange);
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
    this.app.workspace.on("editor-change", this.onEditorChange);
    this.refreshViews();
  }

  stop() {
    this.app.workspace.off("layout-change", this.onLayoutChange);
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    this.app.workspace.off("editor-change", this.onEditorChange);
    for (const record of this.views.values()) this.detachView(record);
    this.views.clear();
  }

  refreshViews() {
    const present = new Set();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!leaf.view?.editor) return;
      const cm = leaf.view.editor.cm;
      if (!cm?.scrollDOM || !cm?.lineBlockAtHeight) return;
      present.add(leaf);
      if (!this.views.has(leaf)) this.attachView(leaf, cm);
    });
    for (const [leaf, record] of this.views) {
      if (!present.has(leaf)) {
        this.detachView(record);
        this.views.delete(leaf);
      }
    }
    this.refreshAll();
  }

  attachView(leaf, cm) {
    const doc = cm.dom.ownerDocument;
    const panel = doc.createElement("div");
    panel.className = "sh-ribbon";
    panel.setAttribute("aria-label", "Current heading hierarchy");
    cm.dom.classList.add("sh-editor-host");
    cm.scrollDOM.classList.add("sh-scroll-area");
    cm.dom.insertBefore(panel, cm.scrollDOM);
    const record = { leaf, editor: leaf.view.editor, cm, panel, window: doc.defaultView, frame: 0 };
    record.onScroll = () => this.queueRefresh(record);
    cm.scrollDOM.addEventListener("scroll", record.onScroll, { passive: true });
    this.views.set(leaf, record);
  }

  detachView(record) {
    record.cm.scrollDOM.removeEventListener("scroll", record.onScroll);
    if (record.frame) {
      if (record.window?.cancelAnimationFrame) record.window.cancelAnimationFrame(record.frame);
      else cancelAnimationFrame(record.frame);
    }
    record.panel.remove();
    record.cm.dom.classList.remove("sh-editor-host");
    record.cm.scrollDOM.classList.remove("sh-scroll-area");
  }

  queueRefresh(record) {
    if (record.frame) return;
    const requestFrame = record.window?.requestAnimationFrame || requestAnimationFrame;
    record.frame = requestFrame.call(record.window, () => {
      record.frame = 0;
      this.refreshView(record);
    });
  }

  refreshAll() {
    for (const record of this.views.values()) this.queueRefresh(record);
  }

  refreshEditor(editor) {
    if (!editor) {
      this.refreshAll();
      return;
    }
    for (const record of this.views.values()) {
      if (record.editor === editor) this.queueRefresh(record);
    }
  }

  refreshView(record) {
    const { cm, editor, panel } = record;
    const topBlock = cm.lineBlockAtHeight(cm.scrollDOM.scrollTop);
    const firstVisibleLine = cm.state.doc.lineAt(topBlock.from).number;
    const path = collectHeadingPath(record, firstVisibleLine);
    const settings = this.plugin.settings.sticky;
    const headings = settings.stickyType === "prev" ? path.slice(-1) : path;
    const renderSignature = JSON.stringify([
      headings.map(({ level, text, line }) => [level, text, line]),
      settings.verticalGap,
      settings.headingFontSizes,
      settings.headingOffsets,
      settings.showHeadingLevels,
      settings.clickToJump
    ]);
    if (record.renderSignature === renderSignature) return;
    record.renderSignature = renderSignature;

    const doc = cm.dom.ownerDocument;
    const fragment = doc.createDocumentFragment();

    for (const heading of headings) {
      const row = doc.createElement("div");
      row.className = `sh-ribbon-row sh-level-${heading.level}`;
      row.style.setProperty("--sh-size", `${settings.headingFontSizes[heading.level - 1]}em`);
      row.style.setProperty("--sh-indent", `${settings.headingOffsets[heading.level - 1]}em`);
      if (settings.showHeadingLevels) {
        const badge = doc.createElement("span");
        badge.className = "sh-level-marker";
        badge.textContent = `H${heading.level}`;
        row.appendChild(badge);
      }
      const label = doc.createElement("span");
      label.className = `sh-heading-label cm-header cm-header-${heading.level}`;
      label.textContent = heading.text;
      row.appendChild(label);
      if (settings.clickToJump) {
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `Go to ${heading.text}`);
        row.addEventListener("click", () => this.jumpTo(record, heading.line));
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.jumpTo(record, heading.line);
          }
        });
      }
      fragment.appendChild(row);
    }

    panel.replaceChildren(fragment);
    panel.classList.toggle("sh-ribbon-visible", headings.length > 0);
    panel.style.setProperty("--sh-row-gap", `${settings.verticalGap}px`);
  }

  jumpTo(record, line) {
    const settings = this.plugin.settings.sticky;
    if (settings.useInFileNavigation) this.plugin.navigation?.recordPosition(record.leaf);
    const position = { line: line - 1, ch: 0 };
    record.editor.setCursor(position);
    record.editor.scrollIntoView({ from: position, to: position }, true);
    record.editor.focus();
  }
}

function getFileIdentity(viewState) {
  const file = viewState?.state?.file;
  return typeof file === "string" ? `${viewState.type}:${file}` : null;
}

class MoveTabBetweenGroups {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  registerCommands() {
    for (const [direction, name, id] of [
      [-1, "Move current tab to previous group", "move-current-tab-to-previous-group"],
      [1, "Move current tab to next group", "move-current-tab-to-next-group"]
    ]) {
      this.plugin.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          if (!this.plugin.settings.features.moveTabBetweenGroups) return false;
          if (!checking) void this.moveActiveTab(direction);
          return true;
        }
      });
    }
  }

  async moveActiveTab(direction) {
    const workspace = this.app.workspace;
    const sourceLeaf = workspace.activeLeaf;
    if (!sourceLeaf || !(sourceLeaf.parent instanceof WorkspaceTabs)) {
      new Notice("The active tab is not in a main workspace group.");
      return;
    }

    const sourceDocument = sourceLeaf.containerEl?.ownerDocument;
    const sidebarLeaves = new Set();
    for (const dock of [workspace.leftSplit, workspace.rightSplit]) {
      if (dock) workspace.iterateLeaves(dock, (leaf) => sidebarLeaves.add(leaf));
    }
    const secondarySideGroups = this.plugin.popoutSidebars?.documents.get(sourceDocument)?.sideGroups;
    for (const sideGroup of Object.values(secondarySideGroups || {})) {
      for (const leaf of sideGroup?.leaves || []) sidebarLeaves.add(leaf);
    }

    const groups = [];
    workspace.iterateAllLeaves((leaf) => {
      if (leaf.containerEl?.ownerDocument !== sourceDocument || sidebarLeaves.has(leaf)) return;
      const group = leaf.parent;
      if (!(group instanceof WorkspaceTabs)) return;
      let entry = groups.find((candidate) => candidate.group === group);
      if (!entry) {
        entry = { group, representative: leaf, leaves: [] };
        groups.push(entry);
      }
      entry.leaves.push(leaf);
    });

    const sourceGroupIndex = groups.findIndex((entry) => entry.group === sourceLeaf.parent);
    const sourceGroup = groups[sourceGroupIndex];
    const destination = groups.length > 1
      ? groups[(sourceGroupIndex + direction + groups.length) % groups.length]
      : null;
    const createAdjacentGroup = groups.length === 1;
    if (sourceGroupIndex < 0 || (!destination && !createAdjacentGroup)) {
      new Notice("There is no other tab group in this window.");
      return;
    }

    let destinationLeaf;
    let createdDestinationLeaf = false;
    const keepSourceLeaf = createAdjacentGroup && sourceGroup.leaves.length === 1;
    try {
      const viewState = sourceLeaf.getViewState();
      const ephemeralState = sourceLeaf.getEphemeralState();
      const sourceIdentity = getFileIdentity(viewState);
      if (createAdjacentGroup) {
        destinationLeaf = workspace.createLeafBySplit(sourceLeaf, "vertical", direction < 0);
        createdDestinationLeaf = true;
      } else {
        destinationLeaf = sourceIdentity
          ? destination.leaves.find((leaf) => getFileIdentity(leaf.getViewState()) === sourceIdentity)
          : null;
        if (!destinationLeaf) {
          workspace.setActiveLeaf(destination.representative, false, false);
          destinationLeaf = workspace.getLeaf("tab");
          createdDestinationLeaf = true;
        } else if (typeof destinationLeaf.setEphemeralState === "function") {
          destinationLeaf.setEphemeralState(ephemeralState);
        }
      }
      if (createdDestinationLeaf) await destinationLeaf.setViewState(viewState, ephemeralState);
      if (sourceLeaf.pinned && typeof destinationLeaf.setPinned === "function") destinationLeaf.setPinned(true);
    } catch (error) {
      if (createdDestinationLeaf) destinationLeaf?.detach();
      workspace.setActiveLeaf(sourceLeaf, false, true);
      console.error("UX Enhancements: could not restore the moved tab", error);
      new Notice("Could not move this tab. The original tab was left in place.");
      return;
    }

    if (!keepSourceLeaf) sourceLeaf.detach();
    workspace.setActiveLeaf(destinationLeaf, false, true);
  }
}

class NotePeekPanel {
  constructor(plugin, view, currentFile, backlinks = []) {
    this.plugin = plugin;
    this.view = view;
    this.document = view.containerEl.ownerDocument;
    this.window = this.document.defaultView;
    this.positionHost = view.contentEl || view.containerEl;
    this.currentFile = currentFile;
    this.backlinks = backlinks;
    this.selectedIndex = 0;
    this.renderVersion = 0;
    this.previewComponent = null;
    this.mount();
  }

  mount() {
    this.root = this.document.createElement("section");
    this.root.className = "we-note-peek-panel";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", `Backlinks to ${this.currentFile.basename}`);
    this.header = this.document.createElement("div");
    this.header.className = "we-note-peek-header";
    this.titleEl = this.document.createElement("div");
    this.titleEl.className = "we-note-peek-title";
    this.titleEl.textContent = `Backlinks to ${this.currentFile.basename}`;
    this.openTabButton = this.document.createElement("button");
    this.openTabButton.type = "button";
    this.openTabButton.className = "we-note-peek-action";
    this.openTabButton.textContent = "Open as tab";
    this.openTabButton.disabled = !this.backlinks.length;
    this.openTabButton.addEventListener("click", () => void this.openAsTab());
    this.closeButton = this.document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "we-note-peek-action";
    this.closeButton.textContent = "Close";
    this.closeButton.setAttribute("aria-label", "Close Note Peek");
    this.closeButton.addEventListener("click", () => this.close());
    this.header.append(this.titleEl, this.openTabButton, this.closeButton);

    this.contentEl = this.document.createElement("div");
    this.contentEl.className = "we-note-peek-content";
    this.contentEl.tabIndex = 0;
    this.listEl = this.document.createElement("div");
    this.listEl.className = "we-note-peek-list";
    this.previewEl = this.document.createElement("div");
    this.previewEl.className = "we-note-peek-preview";
    this.contentEl.append(this.listEl, this.previewEl);
    this.root.append(this.header, this.contentEl);
    this.positionHost.appendChild(this.root);
    this.onPositionChange = () => this.positionPanel();
    this.window?.addEventListener("resize", this.onPositionChange);
    this.plugin.app.workspace.on("layout-change", this.onPositionChange);
    this.positionObserver = this.window?.ResizeObserver
      ? new this.window.ResizeObserver(this.onPositionChange)
      : null;
    this.positionObserver?.observe(this.positionHost);
    this.positionPanel();

    this.onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
        return;
      }
      if (!this.backlinks.length || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.selectBacklink((this.selectedIndex + direction + this.backlinks.length) % this.backlinks.length);
    };
    this.contentEl.addEventListener("keydown", this.onKeyDown);
    this.contentEl.focus();

    this.backlinks.forEach((backlink, index) => {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "we-note-peek-backlink";
      button.setAttribute("aria-selected", index === 0 ? "true" : "false");
      const title = this.document.createElement("span");
      title.className = "we-note-peek-backlink-title";
      title.textContent = backlink.file.basename;
      const location = this.document.createElement("span");
      location.className = "we-note-peek-backlink-location";
      location.textContent = `${backlink.file.parent?.path || "Vault root"} · line ${backlink.line + 1}`;
      button.append(title, location);
      button.addEventListener("click", () => this.selectBacklink(index));
      this.listEl.appendChild(button);
    });

    if (!this.backlinks.length) {
      const empty = this.document.createElement("div");
      empty.className = "we-note-peek-empty";
      empty.textContent = "No notes link to this note.";
      this.listEl.appendChild(empty);
      this.previewEl.classList.add("is-empty");
      return;
    }
    void this.renderPreview(this.backlinks[0].file, this.backlinks[0].line);
  }

  positionPanel() {
    if (!this.root?.isConnected || !this.positionHost?.isConnected) return;
    const bounds = this.positionHost.getBoundingClientRect();
    const viewportHeight = this.window?.innerHeight || bounds.bottom;
    const width = Math.max(0, Math.min(900, bounds.width - 16));
    const height = Math.max(0, Math.min(520, bounds.height * 0.48, bounds.height - 16));
    this.root.style.left = `${bounds.left + (bounds.width - width) / 2}px`;
    this.root.style.bottom = `${Math.max(8, viewportHeight - bounds.bottom + 8)}px`;
    this.root.style.width = `${width}px`;
    this.root.style.height = `${height}px`;
  }

  async renderPreview(file, line) {
    const version = ++this.renderVersion;
    this.previewFile = file;
    try {
      const source = await this.plugin.app.vault.cachedRead(file);
      const lines = source.split(/\r?\n/);
      const start = line === null ? 0 : Math.max(0, line - 3);
      const end = line === null ? Math.min(lines.length, 80) : Math.min(lines.length, line + 4);
      const excerpt = lines.slice(start, end).join("\n");
      const location = this.document.createElement("div");
      location.className = "we-note-peek-location";
      location.textContent = line === null ? file.path : `${file.path} · line ${line + 1}`;
      const rendered = this.document.createElement("div");
      rendered.className = "we-note-peek-markdown markdown-rendered";
      const component = new Component();
      component.load();
      await MarkdownRenderer.render(this.plugin.app, excerpt, rendered, file.path, component);
      if (version !== this.renderVersion) {
        component.unload();
        return;
      }
      this.previewComponent?.unload();
      this.previewComponent = component;
      this.previewEl.replaceChildren(location, rendered);
    } catch (error) {
      if (version !== this.renderVersion) return;
      this.previewEl.textContent = `Could not load preview: ${error.message}`;
    }
  }

  async openAsTab() {
    if (!this.previewFile) return;
    const workspace = this.plugin.app.workspace;
    try {
      const leaf = workspace.getLeaf("tab");
      await leaf.openFile(this.previewFile);
      this.close(false);
      workspace.setActiveLeaf(leaf, false, true);
    } catch (error) {
      new Notice(`Could not open preview as a tab: ${error.message}`);
    }
  }

  close(restoreFocus = true) {
    this.renderVersion += 1;
    this.window?.removeEventListener("resize", this.onPositionChange);
    this.plugin.app.workspace.off("layout-change", this.onPositionChange);
    this.positionObserver?.disconnect();
    this.contentEl.removeEventListener("keydown", this.onKeyDown);
    this.previewComponent?.unload();
    this.root.remove();
    if (this.plugin.notePeekPanel === this) this.plugin.notePeekPanel = null;
    if (restoreFocus && this.view.containerEl.isConnected) this.view.editor.focus();
  }
}

class NotePeekHotkeyPrompt extends Modal {
  constructor(app) {
    super(app);
    this.answer = null;
    this.choice = new Promise((resolve) => { this.resolveChoice = resolve; });
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: "Set Note Peek's default hotkey?" });
    this.contentEl.createEl("p", { text: "Would you like to use F12 to open Note Peek? You can change it anytime in Settings → Hotkeys." });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Use F12").setCta().onClick(() => {
        this.answer = true;
        this.close();
      }))
      .addButton((button) => button.setButtonText("Not now").onClick(() => {
        this.answer = false;
        this.close();
      }));
  }

  onClose() {
    this.contentEl.empty();
    this.resolveChoice?.(this.answer === true);
  }

  ask() {
    this.open();
    return this.choice;
  }
}

class NotePeek {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.splitAnchors = new Map();
  }

  async registerCommand() {
    if (typeof this.plugin.settings.notePeekF12Accepted !== "boolean") {
      this.plugin.settings.notePeekF12Accepted = await new NotePeekHotkeyPrompt(this.app).ask();
      await this.plugin.saveData(this.plugin.settings);
    }
    const command = {
      id: "peek-note-or-backlinks",
      name: "Peek at linked note or backlinks",
      editorCheckCallback: (checking, editor, view) => {
        if (!this.plugin.settings.features.notePeek) return false;
        if (checking) return true;
        void this.open(editor, view);
        return true;
      }
    };
    if (this.plugin.settings.notePeekF12Accepted) command.hotkeys = [{ modifiers: [], key: "F12" }];
    this.plugin.addCommand(command);
    this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
      const panel = this.plugin.notePeekPanel;
      if (panel && !panel.view.containerEl.isConnected) panel.close(false);
      this.restoreClosedSplits();
    }));
  }

  captureCenteredLine(editor) {
    const cm = editor.cm;
    const centerY = cm.scrollDOM.scrollTop + cm.scrollDOM.clientHeight / 2;
    return cm.state.doc.lineAt(cm.lineBlockAtHeight(centerY).from).number - 1;
  }

  trackSplit(sourceLeaf, targetLeaf, editor, line) {
    const record = { sourceLeaf, targetLeaf, editor, line };
    record.onScroll = () => {
      if (this.isLeafPresent(targetLeaf)) record.line = this.captureCenteredLine(editor);
    };
    editor.cm.scrollDOM.addEventListener("scroll", record.onScroll, { passive: true });
    this.splitAnchors.set(targetLeaf, record);
  }

  isLeafPresent(targetLeaf) {
    let present = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf === targetLeaf) present = true;
    });
    return present;
  }

  restoreClosedSplits() {
    for (const [targetLeaf, record] of this.splitAnchors) {
      if (this.isLeafPresent(targetLeaf)) continue;
      record.editor.cm.scrollDOM.removeEventListener("scroll", record.onScroll);
      this.splitAnchors.delete(targetLeaf);
      if (!record.sourceLeaf.containerEl.isConnected || record.sourceLeaf.view?.editor !== record.editor) continue;
      const sourceWindow = record.sourceLeaf.containerEl.ownerDocument.defaultView;
      const restore = () => {
        if (!record.sourceLeaf.containerEl.isConnected || record.sourceLeaf.view?.editor !== record.editor) return;
        const line = Math.max(0, Math.min(record.line, record.editor.lastLine()));
        const position = { line, ch: 0 };
        record.editor.scrollIntoView({ from: position, to: position }, true);
      };
      if (sourceWindow?.requestAnimationFrame) sourceWindow.requestAnimationFrame(restore);
      else requestAnimationFrame(restore);
    }
  }

  async open(editor, view) {
    const currentFile = view.file;
    if (!(currentFile instanceof TFile)) return new Notice("Open a saved note to use Note Peek.");
    this.plugin.notePeekPanel?.close(false);
    const cursor = editor.getCursor();
    const links = this.app.metadataCache.getFileCache(currentFile)?.links || [];
    const link = links.find((candidate) => {
      const { start, end } = candidate.position;
      if (cursor.line < start.line || cursor.line > end.line) return false;
      if (cursor.line === start.line && cursor.ch < start.col) return false;
      return cursor.line !== end.line || cursor.ch <= end.col;
    });

    if (link) {
      const targetPath = link.link.split("#", 1)[0].trim();
      const targetFile = targetPath
        ? this.app.metadataCache.getFirstLinkpathDest(targetPath, currentFile.path)
        : currentFile;
      if (targetFile instanceof TFile) {
        try {
          const workspace = this.app.workspace;
          const centeredLine = this.captureCenteredLine(editor);
          const leaf = workspace.createLeafBySplit(view.leaf, "horizontal", false);
          await leaf.openFile(targetFile);
          this.trackSplit(view.leaf, leaf, editor, centeredLine);
          workspace.setActiveLeaf(leaf, false, true);
          view.containerEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
            if (view.containerEl.isConnected) editor.scrollIntoView({ from: cursor, to: cursor }, true);
          });
        } catch (error) {
          new Notice(`Could not open linked note in a horizontal split: ${error.message}`);
        }
        return;
      }
    }

    const backlinkData = this.app.metadataCache.getBacklinksForFile(currentFile)?.data || {};
    const backlinks = [];
    for (const [sourcePath, sourceLinks] of Object.entries(backlinkData)) {
      if (sourcePath === currentFile.path) continue;
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) continue;
      for (const sourceLink of sourceLinks) {
        const line = sourceLink.position?.start?.line;
        if (typeof line === "number") backlinks.push({ file, line });
      }
    }
    backlinks.sort((left, right) => left.file.path.localeCompare(right.file.path) || left.line - right.line);
    this.plugin.notePeekPanel = new NotePeekPanel(this.plugin, view, currentFile, backlinks);
  }
}

class PopoutSidebars {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.mainDocument = this.app.workspace.containerEl?.ownerDocument || document;
    this.documents = new Map();
    this.activeDocument = null;
    this.originalSidebarCommands = new Map();
    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onLayoutChange = () => this.scheduleEmptyWindowCleanup();
    this.onWindowOpen = (workspaceWindow) => this.registerDocument(workspaceWindow.doc, workspaceWindow);
    this.onWindowClose = (workspaceWindow) => this.unregisterDocument(workspaceWindow.doc);
  }

  start() {
    this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl?.ownerDocument));
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
    this.app.workspace.on("layout-change", this.onLayoutChange);
    this.replaceSidebarCommands();
  }

  stop() {
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    this.app.workspace.off("layout-change", this.onLayoutChange);
    this.restoreSidebarCommands();
    for (const doc of this.documents.keys()) {
      const windowRecord = this.documents.get(doc);
      for (const side of ["left", "right"]) {
        const sideGroup = windowRecord.sideGroups[side];
        if (!sideGroup) continue;
        windowRecord.sideGroups[side] = null;
        for (const leaf of sideGroup.leaves) leaf.detach();
      }
      this.resizeSideGroups(windowRecord);
      this.unregisterDocument(doc);
    }
  }

  registerDocument(doc, workspaceWindow = null) {
    if (!doc || doc === this.mainDocument || this.documents.has(doc)) return;
    const window = workspaceWindow?.win || doc.defaultView || doc;
    const eventTarget = window?.addEventListener ? window : doc;
    if (!doc.addEventListener || !eventTarget?.addEventListener) return;
    doc.addEventListener("keydown", this.onKeyDown, true);
    const onFocus = () => { this.activeDocument = doc; };
    eventTarget.addEventListener("focus", onFocus, true);
    this.documents.set(doc, {
      document: doc,
      document: doc,
      eventTarget,
      window,
      onFocus,
      cleanupFrame: 0,
      sideGroups: { left: null, right: null },
      originalCenterDimensions: null
    });
    if (doc.hasFocus?.()) this.activeDocument = doc;
  }

  unregisterDocument(doc) {
    const windowRecord = this.documents.get(doc);
    if (!windowRecord) return;
    this.documents.delete(doc);
    if (windowRecord.cleanupFrame) doc.defaultView?.cancelAnimationFrame?.(windowRecord.cleanupFrame);
    doc.removeEventListener("keydown", this.onKeyDown, true);
    windowRecord.eventTarget.removeEventListener("focus", windowRecord.onFocus, true);
    if (this.activeDocument === doc) this.activeDocument = null;
  }

  scheduleEmptyWindowCleanup() {
    for (const [doc, windowRecord] of this.documents) {
      if ((!windowRecord.sideGroups.left && !windowRecord.sideGroups.right) || windowRecord.cleanupFrame) continue;
      const targetWindow = doc.defaultView;
      if (!targetWindow?.requestAnimationFrame) {
        this.closeSidebarsWithoutNotes(doc);
        continue;
      }
      windowRecord.cleanupFrame = targetWindow.requestAnimationFrame(() => {
        windowRecord.cleanupFrame = 0;
        this.closeSidebarsWithoutNotes(doc);
      });
    }
  }

  closeSidebarsWithoutNotes(doc) {
    const windowRecord = this.documents.get(doc);
    if (!windowRecord) return;
    const sidebarLeaves = new Set();
    const sourceLeaves = new Set();
    for (const sideGroup of Object.values(windowRecord.sideGroups)) {
      if (!sideGroup) continue;
      sourceLeaves.add(sideGroup.sourceLeaf);
      for (const leaf of sideGroup.leaves) sidebarLeaves.add(leaf);
    }

    let hasNoteLeaf = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.containerEl?.ownerDocument === doc && !sidebarLeaves.has(leaf)
        && (leaf.view?.editor || leaf.view?.file || sourceLeaves.has(leaf))) {
        hasNoteLeaf = true;
      }
    });
    if (hasNoteLeaf) return;

    for (const side of ["left", "right"]) {
      const sideGroup = windowRecord.sideGroups[side];
      if (!sideGroup) continue;
      windowRecord.sideGroups[side] = null;
      for (const leaf of sideGroup.leaves) leaf.detach();
    }
    this.resizeSideGroups(windowRecord);
  }

  handleKeyDown(event) {
    const sourceDocument = event.currentTarget?.document
      || (event.currentTarget?.nodeType === 9 ? event.currentTarget : null)
      || event.target?.ownerDocument;
    if (this.documents.has(sourceDocument)) this.activeDocument = sourceDocument;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const toggledSide = key === "b" && (event.shiftKey || event.altKey)
      ? "right"
      : key === "b" ? "left" : null;
    const openSearch = key === "f" && event.shiftKey && !event.altKey;
    if (!toggledSide && !openSearch) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (openSearch) void this.openSidebarView("left", "search", sourceDocument);
    else void this.toggleSide(toggledSide, sourceDocument);
  }

  replaceSidebarCommands() {
    const routes = {
      "app:toggle-left-sidebar": (sourceDocument) => this.toggleSide("left", sourceDocument),
      "app:toggle-right-sidebar": (sourceDocument) => this.toggleSide("right", sourceDocument),
      "file-explorer:open": (sourceDocument) => this.openSidebarView("left", "file-explorer", sourceDocument),
      "global-search:open": (sourceDocument) => this.openSidebarView("left", "search", sourceDocument),
      "outline:open": (sourceDocument) => this.openSidebarView("right", "outline", sourceDocument),
      "outgoing-link:open": (sourceDocument) => this.openSidebarView("right", "outgoing-link", sourceDocument),
      "backlink:open": (sourceDocument) => this.openSidebarView("right", "backlink", sourceDocument),
      "tag-pane:open": (sourceDocument) => this.openSidebarView("left", "tag", sourceDocument),
      "bookmarks:open": (sourceDocument) => this.openSidebarView("left", "bookmarks", sourceDocument),
      "properties:open": (sourceDocument) => this.openSidebarView("right", "properties", sourceDocument)
    };
    const nameRoutes = new Map([
      ["show outline", (sourceDocument) => this.openSidebarView("right", "outline", sourceDocument)],
      ["open outline", (sourceDocument) => this.openSidebarView("right", "outline", sourceDocument)],
      ["show backlinks", (sourceDocument) => this.openSidebarView("right", "backlink", sourceDocument)],
      ["open backlinks", (sourceDocument) => this.openSidebarView("right", "backlink", sourceDocument)],
      ["show forward links", (sourceDocument) => this.openSidebarView("right", "outgoing-link", sourceDocument)],
      ["show outgoing links", (sourceDocument) => this.openSidebarView("right", "outgoing-link", sourceDocument)],
      ["open outgoing links", (sourceDocument) => this.openSidebarView("right", "outgoing-link", sourceDocument)]
    ]);
    for (const [id, command] of Object.entries(this.app.commands?.commands || {})) {
      const namedRoute = nameRoutes.get(command.name?.trim().toLowerCase());
      if (namedRoute && !routes[id]) routes[id] = namedRoute;
    }
    for (const [id, route] of Object.entries(routes)) {
      const command = this.app.commands?.commands?.[id];
      if (!command || this.originalSidebarCommands.has(id)) continue;
      const original = {
        command,
        callback: command.callback,
        checkCallback: command.checkCallback,
        editorCallback: command.editorCallback
      };
      if (![original.callback, original.checkCallback, original.editorCallback].some((handler) => typeof handler === "function")) continue;
      this.originalSidebarCommands.set(id, original);
      const execute = () => {
        const sourceDocument = this.getFocusedSecondaryDocument();
        if (!sourceDocument) return null;
        void Promise.resolve(route(sourceDocument)).catch((error) => {
          console.error(`UX Enhancements: could not route sidebar command ${id}`, error);
          new Notice(`Could not open this sidebar view: ${error.message || error}`);
        });
        return true;
      };
      if (typeof original.callback === "function") {
        command.callback = (...args) => execute() ?? original.callback.apply(command, args);
      }
      if (typeof original.checkCallback === "function") {
        command.checkCallback = (checking, ...args) => {
          if (!this.getFocusedSecondaryDocument()) return original.checkCallback.call(command, checking, ...args);
          return checking ? true : execute();
        };
      }
      if (typeof original.editorCallback === "function") {
        command.editorCallback = (...args) => execute() ?? original.editorCallback.apply(command, args);
      }
    }
  }

  restoreSidebarCommands() {
    for (const { command, callback, checkCallback, editorCallback } of this.originalSidebarCommands.values()) {
      command.callback = callback;
      command.checkCallback = checkCallback;
      command.editorCallback = editorCallback;
    }
    this.originalSidebarCommands.clear();
  }

  getFocusedSecondaryDocument() {
    if (this.mainDocument.hasFocus?.()) return null;
    for (const [doc, windowRecord] of this.documents) {
      if (doc.hasFocus?.() || windowRecord.window?.document?.hasFocus?.()) return doc;
    }
    return this.documents.has(this.activeDocument) ? this.activeDocument : null;
  }

  getWindowRecord(sourceDocument) {
    return this.documents.get(sourceDocument) || null;
  }

  getActiveLeaf(sourceDocument) {
    let activeLeaf = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!activeLeaf && leaf.containerEl?.ownerDocument === sourceDocument
        && leaf.containerEl.classList.contains("mod-active")) activeLeaf = leaf;
    });
    return activeLeaf;
  }

  getSourceLeaf(sourceDocument) {
    const activeLeaf = this.getActiveLeaf(sourceDocument);
    let firstLeaf = null;
    let activeEditorLeaf = null;
    let firstEditorLeaf = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.containerEl?.ownerDocument !== sourceDocument || !leaf.view) return;
      firstLeaf ||= leaf;
      if (leaf.view.editor) {
        firstEditorLeaf ||= leaf;
        if (leaf === activeLeaf) activeEditorLeaf = leaf;
      }
    });
    return activeEditorLeaf || firstEditorLeaf || activeLeaf || firstLeaf;
  }

  getWindowEdgeLeaf(sourceDocument, side, windowRecord) {
    const sidebarLeaves = new Set();
    for (const sideGroup of Object.values(windowRecord.sideGroups)) {
      for (const leaf of sideGroup?.leaves || []) sidebarLeaves.add(leaf);
    }

    let edgeLeaf = null;
    let edgePosition = side === "left" ? Infinity : -Infinity;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.containerEl?.ownerDocument !== sourceDocument || !leaf.view?.editor || sidebarLeaves.has(leaf)) return;
      const bounds = leaf.containerEl.getBoundingClientRect?.();
      if (!bounds) return;
      const position = side === "left" ? bounds.left : bounds.right;
      if ((side === "left" && position < edgePosition) || (side === "right" && position > edgePosition)) {
        edgeLeaf = leaf;
        edgePosition = position;
      }
    });
    return edgeLeaf;
  }

  getSidebarStates(side) {
    const dock = side === "left" ? this.app.workspace.leftSplit : this.app.workspace.rightSplit;
    const states = [];
    if (!dock) return states;
    this.app.workspace.iterateLeaves(dock, (leaf) => {
      if (leaf.view) {
        states.push({ viewState: leaf.getViewState(), ephemeralState: leaf.getEphemeralState() });
      }
    });
    return states;
  }

  compactTabHeader(leaf, viewState) {
    if (leaf.tabHeaderInnerTitleEl) leaf.tabHeaderInnerTitleEl.style.display = "none";
    const label = viewState.title || viewState.type;
    leaf.tabHeaderEl?.setAttribute("aria-label", label);
    leaf.tabHeaderEl?.setAttribute("title", label);
  }

  resizeSideGroups(windowRecord) {
    const leftGroup = windowRecord.sideGroups.left?.leaves[0]?.parent;
    const rightGroup = windowRecord.sideGroups.right?.leaves[0]?.parent;
    const activeSideCount = Number(Boolean(leftGroup)) + Number(Boolean(rightGroup));
    const centerGroups = this.getCenterGroups(windowRecord);
    if (!activeSideCount && windowRecord.originalCenterDimensions) {
      for (const [group, dimension] of windowRecord.originalCenterDimensions) {
        if (centerGroups.has(group)) group.setDimension?.(dimension);
      }
      windowRecord.originalCenterDimensions = null;
      return;
    }
    if (!centerGroups.size) return;

    const centerShare = 100 - activeSideCount * 20;
    const totalCenterWeight = [...centerGroups.values()].reduce((total, weight) => total + weight, 0);
    for (const [group, weight] of centerGroups) {
      group.setDimension?.(centerShare * weight / totalCenterWeight);
    }
    leftGroup?.setDimension?.(20);
    rightGroup?.setDimension?.(20);
  }

  getCenterGroups(windowRecord) {
    const sideLeaves = new Set([
      ...(windowRecord.sideGroups.left?.leaves || []),
      ...(windowRecord.sideGroups.right?.leaves || [])
    ]);
    const centerGroups = new Map();
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.containerEl?.ownerDocument !== windowRecord.document || sideLeaves.has(leaf)) return;
      if (!(leaf.parent instanceof WorkspaceTabs)) return;
      centerGroups.set(leaf.parent, leaf.parent.dimension > 0 ? leaf.parent.dimension : 1);
    });
    return centerGroups;
  }

  async showSide(side, sourceDocument = null) {
    const windowRecord = this.getWindowRecord(sourceDocument);
    if (!windowRecord) {
      new Notice("Sidebar views can only be opened from a secondary window.");
      return;
    }
    const existing = windowRecord.sideGroups[side];
    if (existing) {
      const activeLeaf = existing.leaves[0];
      if (activeLeaf) this.app.workspace.setActiveLeaf(activeLeaf, false, true);
      return;
    }

    const states = this.getSidebarStates(side);
    if (!states.length) {
      states.push({
        viewState: { type: side === "left" ? "file-explorer" : "outline" },
        ephemeralState: undefined
      });
    }

    const sourceLeaf = this.getSourceLeaf(sourceDocument);
    if (!sourceLeaf) {
      new Notice("Could not find a note pane in this secondary window.");
      return;
    }

    if (!windowRecord.sideGroups.left && !windowRecord.sideGroups.right) {
      windowRecord.originalCenterDimensions = new Map(
        [...this.getCenterGroups(windowRecord).keys()].map((group) => [group, group.dimension ?? null])
      );
    }
    const workspace = this.app.workspace;
    const sideGroup = { sourceLeaf, leaves: [] };
    windowRecord.sideGroups[side] = sideGroup;
    try {
      const edgeLeaf = this.getWindowEdgeLeaf(sourceDocument, side, windowRecord) || sourceLeaf;
      const firstLeaf = workspace.createLeafBySplit(edgeLeaf, "vertical", side === "left");
      sideGroup.leaves.push(firstLeaf);
      await firstLeaf.setViewState(states[0].viewState, states[0].ephemeralState);
      this.compactTabHeader(firstLeaf, states[0].viewState);
      for (const state of states.slice(1)) {
        const leaf = workspace.createLeafInTabGroup(firstLeaf.parent);
        sideGroup.leaves.push(leaf);
        await leaf.setViewState(state.viewState, state.ephemeralState);
        this.compactTabHeader(leaf, state.viewState);
      }
      this.resizeSideGroups(windowRecord);
      workspace.setActiveLeaf(firstLeaf, false, true);
    } catch (error) {
      windowRecord.sideGroups[side] = null;
      for (const leaf of sideGroup.leaves) leaf.detach();
      this.resizeSideGroups(windowRecord);
      workspace.setActiveLeaf(sourceLeaf, false, true);
      console.error(`UX Enhancements: could not open the ${side} sidebar pane`, error);
      new Notice(`Could not open the ${side} sidebar pane: ${error.message || error}`);
    }
  }

  async openFileExplorer(sourceDocument) {
    await this.openSidebarView("left", "file-explorer", sourceDocument);
  }

  async openSidebarView(side, viewType, sourceDocument) {
    const windowRecord = this.getWindowRecord(sourceDocument);
    if (!windowRecord) return;
    if (!windowRecord.sideGroups[side]) await this.showSide(side, sourceDocument);
    const sideGroup = windowRecord.sideGroups[side];
    if (!sideGroup) return;

    let targetLeaf = sideGroup.leaves.find((leaf) => leaf.getViewState().type === viewType);
    if (!targetLeaf) {
      const state = this.getSidebarStates(side).find(({ viewState }) => viewState.type === viewType)
        || { viewState: { type: viewType }, ephemeralState: undefined };
      targetLeaf = this.app.workspace.createLeafInTabGroup(sideGroup.leaves[0].parent);
      sideGroup.leaves.push(targetLeaf);
      await targetLeaf.setViewState(state.viewState, state.ephemeralState);
      this.compactTabHeader(targetLeaf, state.viewState);
    }
    this.app.workspace.setActiveLeaf(targetLeaf, false, true);
    if (viewType === "search") targetLeaf.view?.containerEl?.querySelector("input")?.focus();
  }

  async toggleSide(side, sourceDocument = null) {
    const windowRecord = this.getWindowRecord(sourceDocument);
    if (!windowRecord) {
      new Notice("Sidebar views can only be toggled from a secondary window.");
      return;
    }
    const existing = windowRecord.sideGroups[side];
    if (!existing) {
      await this.showSide(side, sourceDocument);
      return;
    }
    const activeLeaf = this.getActiveLeaf(sourceDocument);
    if (!activeLeaf || existing.leaves.includes(activeLeaf)) {
      this.app.workspace.setActiveLeaf(existing.sourceLeaf, false, true);
    }
    windowRecord.sideGroups[side] = null;
    for (const leaf of existing.leaves) leaf.detach();
    this.resizeSideGroups(windowRecord);
  }
}

class PopoutWordCount {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.windows = new Map();
    this.onWindowOpen = (workspaceWindow) => {
      this.registerDocument(workspaceWindow.doc);
      this.refreshDocument(workspaceWindow.doc);
    };
    this.onWindowClose = (workspaceWindow) => this.unregisterDocument(workspaceWindow.doc);
    this.onEditorChange = (editor, info) => this.refreshEditor(editor, info);
    this.onActiveLeafChange = (leaf) => this.refreshLeaf(leaf);
    this.onLayoutChange = () => this.refreshAll();
  }

  start() {
    this.app.workspace.on("window-open", this.onWindowOpen);
    this.app.workspace.on("window-close", this.onWindowClose);
    this.app.workspace.on("editor-change", this.onEditorChange);
    this.app.workspace.on("active-leaf-change", this.onActiveLeafChange);
    this.app.workspace.on("layout-change", this.onLayoutChange);
    this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl?.ownerDocument));
    this.refreshAll();
  }

  stop() {
    this.app.workspace.off("window-open", this.onWindowOpen);
    this.app.workspace.off("window-close", this.onWindowClose);
    this.app.workspace.off("editor-change", this.onEditorChange);
    this.app.workspace.off("active-leaf-change", this.onActiveLeafChange);
    this.app.workspace.off("layout-change", this.onLayoutChange);
    for (const doc of this.windows.keys()) this.unregisterDocument(doc);
  }

  registerDocument(doc) {
    if (!doc?.body || doc === document || this.windows.has(doc)) return;
    const element = doc.createElement("div");
    element.className = "we-popout-word-count";
    element.setAttribute("aria-live", "polite");
    const statusBar = doc.querySelector(".status-bar");
    if (statusBar) {
      statusBar.append(element);
    } else {
      element.classList.add("is-floating");
      doc.body.append(element);
    }
    this.windows.set(doc, { element, timer: null });
  }

  unregisterDocument(doc) {
    const entry = this.windows.get(doc);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.element.remove();
    this.windows.delete(doc);
  }

  refreshEditor(editor, info) {
    let matchingLeaf = info?.leaf?.view?.editor === editor ? info.leaf : null;
    if (!matchingLeaf) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (!matchingLeaf && leaf.view?.editor === editor) matchingLeaf = leaf;
      });
    }
    if (matchingLeaf) this.refreshLeaf(matchingLeaf);
  }

  refreshLeaf(leaf) {
    const doc = leaf?.containerEl?.ownerDocument;
    const entry = this.windows.get(doc);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.renderLeaf(leaf, entry), 120);
  }

  renderLeaf(leaf, entry) {
    const editor = leaf?.view?.editor;
    if (!editor) {
      entry.element.hidden = true;
      return;
    }
    const text = editor.getValue();
    const words = text.match(/\S+/g)?.length || 0;
    entry.element.textContent = `Words: ${words} | Characters: ${text.length}`;
    entry.element.hidden = false;
  }

  refreshDocument(doc) {
    const entry = this.windows.get(doc);
    if (!entry) return;
    let activeLeaf = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.containerEl?.ownerDocument !== doc) return;
      if (leaf.containerEl.classList.contains("mod-active")) activeLeaf = leaf;
      if (!activeLeaf && doc.activeElement && leaf.containerEl.contains(doc.activeElement)) activeLeaf = leaf;
    });
    if (activeLeaf) this.refreshLeaf(activeLeaf);
    else entry.element.hidden = true;
  }

  refreshAll() {
    for (const doc of this.windows.keys()) this.refreshDocument(doc);
  }
}

const DEFAULT_SETTINGS = {
  features: {
    stickyHeadings: true,
    inFileNavigation: true,
    moveTabBetweenGroups: true,
    quickSwitcherNewTab: true,
    findInSplitOnRepeat: false,
    notePeek: true,
    popoutWordCount: true,
    popoutSidebars: true,
    replaceQuickSwitcher: false,
    replaceCommandPalette: true,
    replaceTemplatePicker: true
  },
  sticky: {
    stickyType: "prevToH1",
    verticalGap: 0,
    headingFontSizes: [1, 1, 1, 1, 1, 1],
    headingOffsets: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5],
    showHeadingLevels: false,
    clickToJump: true,
    useInFileNavigation: true
  },
  navigation: {
    historyLimit: 10
  },
  recentCommandLimit: RECENT_COMMAND_LIMIT,
  recentFileLimit: RECENT_FILE_LIMIT,
  recentCommands: [],
  migrationComplete: false
};

function mergeSettings(saved = {}, legacySticky = {}) {
  const sticky = { ...DEFAULT_SETTINGS.sticky, ...legacySticky, ...(saved.sticky || {}) };
  if (!Array.isArray(sticky.headingFontSizes) || sticky.headingFontSizes.length !== 6) {
    sticky.headingFontSizes = [...DEFAULT_SETTINGS.sticky.headingFontSizes];
  }
  if (!Array.isArray(sticky.headingOffsets) || sticky.headingOffsets.length !== 6) {
    sticky.headingOffsets = [...DEFAULT_SETTINGS.sticky.headingOffsets];
  }
  const navigation = { ...DEFAULT_SETTINGS.navigation, ...(saved.navigation || {}) };
  const historyLimit = Number(navigation.historyLimit);
  navigation.historyLimit = Number.isInteger(historyLimit)
    ? Math.max(1, Math.min(100, historyLimit))
    : DEFAULT_SETTINGS.navigation.historyLimit;
  const recentCommandLimit = Number(saved.recentCommandLimit);
  const recentFileLimit = Number(saved.recentFileLimit);
  const normalizedRecentCommandLimit = Number.isInteger(recentCommandLimit)
    ? Math.max(0, Math.min(20, recentCommandLimit))
    : RECENT_COMMAND_LIMIT;
  const normalizedRecentFileLimit = Number.isInteger(recentFileLimit)
    ? Math.max(0, Math.min(20, recentFileLimit))
    : RECENT_FILE_LIMIT;
  const recentCommands = Array.isArray(saved.recentCommands)
    ? [...new Set(saved.recentCommands.filter((id) => typeof id === "string"))].slice(0, RECENT_COMMAND_HISTORY_LIMIT)
    : [];

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    features: { ...DEFAULT_SETTINGS.features, ...(saved.features || {}) },
    sticky,
    navigation,
    recentCommandLimit: normalizedRecentCommandLimit,
    recentFileLimit: normalizedRecentFileLimit,
    recentCommands
  };
}

class WorkspaceEnhancementsSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const { settings } = this.plugin;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Workspace Enhancements" });

    containerEl.createEl("h3", { text: "Features" });
    this.addFeatureToggle(containerEl, "Sticky Headings", "Show the active heading hierarchy while editing.", "stickyHeadings");
    this.addFeatureToggle(containerEl, "In-File Navigation", "Use mouse back and forward buttons to revisit positions in a note.", "inFileNavigation");
    this.addFeatureToggle(containerEl, "Quick Switcher: open in new tab", "Press Right Arrow on a selected file to open it in a new tab and keep the selector open.", "quickSwitcherNewTab");
    this.addFeatureToggle(containerEl, "Find in split on repeated Ctrl/Cmd+F", "When the Find field is focused, press Ctrl/Cmd+F again to preserve the current note position in a right split and continue searching in the original pane.", "findInSplitOnRepeat");
    this.addFeatureToggle(containerEl, "Replace file finder", "Use the UX Enhancements fuzzy picker for Obsidian's Quick Switcher command.", "replaceQuickSwitcher");
    this.addFeatureToggle(containerEl, "Replace command palette", "Use the lightweight search picker to find and run commands.", "replaceCommandPalette");
    this.addFeatureToggle(containerEl, "Replace template picker", "Use the lightweight search picker when inserting a template.", "replaceTemplatePicker");
    this.addFeatureToggle(containerEl, "Note Peek", "Preview a linked note or browse backlinks without navigating away.", "notePeek");
    this.addFeatureToggle(containerEl, "Word and character count in pop-out windows", "Show counts for the active note in secondary windows.", "popoutWordCount");
    if (Platform.isDesktop) {
      this.addFeatureToggle(containerEl, "Sidebar panes in secondary windows", "Sidebar commands open their views in the focused secondary window. Use Ctrl/Cmd+B to toggle the left pane, Ctrl/Cmd+Shift+B or Ctrl/Cmd+Alt+B to toggle the right pane, Ctrl/Cmd+Shift+F to open Search there, and Ctrl/Cmd+Shift+E to open File Explorer.", "popoutSidebars");
    }
    new Setting(containerEl)
      .setName("Recent commands shown")
      .setDesc("Number of recently run commands to show before alphabetical results. Set to 0 to hide the recent section.")
      .addSlider((slider) => slider
        .setLimits(0, 20, 1)
        .setValue(settings.recentCommandLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.recentCommandLimit = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Recent files shown")
      .setDesc("Number of recently opened files to show before alphabetical results. Set to 0 to hide the recent section.")
      .addSlider((slider) => slider
        .setLimits(0, 20, 1)
        .setValue(settings.recentFileLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.recentFileLimit = value;
          await this.plugin.saveSettings();
        }));
    const notePeekHotkeyDescription = settings.notePeekF12Accepted === true
      ? "F12 is the default. Change it in Settings → Hotkeys."
      : settings.notePeekF12Accepted === false
        ? "No default hotkey was applied. Assign one in Settings → Hotkeys."
        : "You'll be asked once whether to use F12. You can change the shortcut in Settings → Hotkeys.";
    new Setting(containerEl).setName("Note Peek hotkey").setDesc(notePeekHotkeyDescription);
    if (Platform.isDesktop) {
      this.addFeatureToggle(containerEl, "Move Tab Between Groups", "Move the active tab to the previous or next group in this window, wrapping at either end.", "moveTabBetweenGroups");
    } else {
      new Setting(containerEl)
        .setName("Move Tab Between Groups")
        .setDesc("Available on desktop only.");
    }

    containerEl.createEl("h3", { text: "In-File Navigation" });
    new Setting(containerEl)
      .setName("History length")
      .setDesc("Maximum number of positions to keep in each direction.")
      .addSlider((slider) => slider
        .setLimits(1, 100, 1)
        .setValue(settings.navigation.historyLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.navigation.historyLimit = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("h3", { text: "Sticky Headings" });
    new Setting(containerEl)
      .setName("Heading trail")
      .setDesc("Show the nearest heading or its hierarchy.")
      .addDropdown((dropdown) => dropdown
        .addOption("prev", "Nearest heading")
        .addOption("prevToH1", "Hierarchy to H1")
        .setValue(settings.sticky.stickyType)
        .onChange(async (value) => {
          settings.sticky.stickyType = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Space between rows")
      .addSlider((slider) => slider
        .setLimits(0, 24, 1)
        .setValue(settings.sticky.verticalGap)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.sticky.verticalGap = value;
          await this.plugin.saveSettings();
        }));

    for (let level = 1; level <= 6; level++) {
      const index = level - 1;
      new Setting(containerEl)
        .setName(`H${level} text size`)
        .addSlider((slider) => slider
          .setLimits(0.5, 2, 0.05)
          .setValue(settings.sticky.headingFontSizes[index])
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.sticky.headingFontSizes[index] = value;
            await this.plugin.saveSettings();
          }));
      new Setting(containerEl)
        .setName(`H${level} indentation`)
        .addSlider((slider) => slider
          .setLimits(0, 8, 0.25)
          .setValue(settings.sticky.headingOffsets[index])
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.sticky.headingOffsets[index] = value;
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName("Show heading level")
      .addToggle((toggle) => toggle
        .setValue(settings.sticky.showHeadingLevels)
        .onChange(async (value) => {
          settings.sticky.showHeadingLevels = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Click to navigate")
      .addToggle((toggle) => toggle
        .setValue(settings.sticky.clickToJump)
        .onChange(async (value) => {
          settings.sticky.clickToJump = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Record heading jumps in In-File Navigation")
      .setDesc("Include sticky-heading clicks in the mouse back/forward history.")
      .addToggle((toggle) => toggle
        .setValue(settings.sticky.useInFileNavigation)
        .onChange(async (value) => {
          settings.sticky.useInFileNavigation = value;
          await this.plugin.saveSettings();
        }));
  }

  addFeatureToggle(containerEl, name, description, key) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.features[key])
        .onChange(async (value) => {
          this.plugin.settings.features[key] = value;
          await this.plugin.saveSettings();
        }));
  }
}

module.exports = class WorkspaceEnhancementsPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData();
    let legacySticky = {};
    if (!saved?.migrationComplete) legacySticky = await this.loadLegacyStickySettings();
    this.settings = mergeSettings(saved || {}, legacySticky);
    this.navigation = null;
    this.stickyHeadings = null;
    this.popoutWordCount = null;
    this.popoutSidebars = null;
    this.quickSwitcher = null;
    this.findInSplitOnRepeat = null;
    this.fileFinder = new FileFinder(this);
    this.commandPalette = new CommandPalette(this);
    this.templatePicker = new TemplatePicker(this);
    this.activePicker = null;
    this.originalCommands = new Map();
    this.addCommand({ id: "open-file-finder", name: "Open file finder", callback: () => this.fileFinder.open() });
    this.addSettingTab(new WorkspaceEnhancementsSettings(this.app, this));
    this.tabMover = new MoveTabBetweenGroups(this);
    if (Platform.isDesktop) this.tabMover.registerCommands();
    this.syncFeatures();

    if (!saved?.migrationComplete) {
      this.settings.migrationComplete = true;
      await this.saveData(this.settings);
    }
    void new NotePeek(this).registerCommand().catch((error) => {
      console.error("UX Enhancements: could not register Note Peek", error);
    });
  }

  onunload() {
    this.restoreCommandReplacements();
    this.templatePicker?.stop();
    this.activePicker?.close();
    this.stickyHeadings?.stop();
    this.navigation?.stop();
    this.quickSwitcher?.stop();
    this.findInSplitOnRepeat?.stop();
    this.popoutWordCount?.stop();
    this.popoutSidebars?.stop();
    this.notePeekPanel?.close(false);
  }

  async loadLegacyStickySettings() {
    try {
      const configDir = this.app.vault.configDir || ".obsidian";
      const path = `${configDir}/plugins/personal-sticky-headings/data.json`;
      return JSON.parse(await this.app.vault.adapter.read(path));
    } catch {
      return {};
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.syncFeatures();
  }

  rememberCommand(commandId) {
    this.settings.recentCommands = [
      commandId,
      ...this.settings.recentCommands.filter((id) => id !== commandId)
    ].slice(0, RECENT_COMMAND_HISTORY_LIMIT);
    void this.saveData(this.settings);
  }

  createSearchPicker(options) {
    return new SearchPicker(options);
  }

  syncQuickSwitcherReplacement() {
    this.syncCommandReplacement("replaceQuickSwitcher", "switcher:open", "Open file finder", () => this.fileFinder.open());
  }

  syncCommandPaletteReplacement() {
    this.syncCommandReplacement("replaceCommandPalette", "command-palette:open", "Open command palette", () => this.commandPalette.open());
  }

  syncTemplatePickerReplacement() {
    if (this.settings.features.replaceTemplatePicker) this.templatePicker.start();
    else this.templatePicker.stop();
    this.syncCommandReplacement("replaceTemplatePicker", "insert-template", "Insert template", () => this.templatePicker.open());
  }

  syncCommandReplacement(feature, id, name, open) {
    if (!this.settings.features[feature]) {
      this.restoreCommand(id);
      return;
    }
    if (this.originalCommands.has(id)) return;
    const command = this.app.commands?.commands?.[id];
    if (!command) {
      new Notice(`Obsidian command "${id}" was not found.`);
      return;
    }
    this.originalCommands.set(id, {
      command,
      callback: command.callback,
      checkCallback: command.checkCallback,
      editorCallback: command.editorCallback,
      name: command.name
    });
    const openPicker = () => {
      open();
      return true;
    };
    if (typeof command.callback === "function") command.callback = openPicker;
    if (typeof command.editorCallback === "function") command.editorCallback = openPicker;
    if (typeof command.checkCallback === "function") {
      command.checkCallback = (checking) => checking ? true : openPicker();
    }
    command.name = name;
  }

  restoreCommand(id) {
    const original = this.originalCommands.get(id);
    if (!original) return;
    const { command, callback, checkCallback, editorCallback, name } = original;
    command.callback = callback;
    command.checkCallback = checkCallback;
    command.editorCallback = editorCallback;
    command.name = name;
    this.originalCommands.delete(id);
  }

  restoreCommandReplacements() {
    for (const id of this.originalCommands.keys()) this.restoreCommand(id);
  }

  syncFeatures() {
    const { features } = this.settings;
    this.syncQuickSwitcherReplacement();
    this.syncCommandPaletteReplacement();
    this.syncTemplatePickerReplacement();
    if (Platform.isDesktop && features.popoutSidebars && !this.popoutSidebars) {
      const popoutSidebars = new PopoutSidebars(this);
      try {
        popoutSidebars.start();
        this.popoutSidebars = popoutSidebars;
      } catch (error) {
        try {
          popoutSidebars.stop();
        } catch (cleanupError) {
          console.error("UX Enhancements: could not clean up sidebar popouts", cleanupError);
        }
        features.popoutSidebars = false;
        void this.saveData(this.settings).catch((saveError) => {
          console.error("UX Enhancements: could not disable sidebar popouts after startup failure", saveError);
        });
        console.error("UX Enhancements: could not start sidebar popouts", error);
        new Notice(`Sidebar popouts were disabled: ${error.message || error}`);
      }
    } else if ((!Platform.isDesktop || !features.popoutSidebars) && this.popoutSidebars) {
      this.popoutSidebars.stop();
      this.popoutSidebars = null;
    }
    if (features.popoutWordCount && !this.popoutWordCount) {
      this.popoutWordCount = new PopoutWordCount(this);
      this.popoutWordCount.start();
    } else if (!features.popoutWordCount && this.popoutWordCount) {
      this.popoutWordCount.stop();
      this.popoutWordCount = null;
    }
    if (features.inFileNavigation && !this.navigation) {
      this.navigation = new InFileNavigation(this);
      this.navigation.start();
    } else if (!features.inFileNavigation && this.navigation) {
      this.navigation.stop();
      this.navigation = null;
    }

    if (features.quickSwitcherNewTab && !this.quickSwitcher) {
      this.quickSwitcher = new QuickSwitcherNewTab(this);
      this.quickSwitcher.start();
    } else if (!features.quickSwitcherNewTab && this.quickSwitcher) {
      this.quickSwitcher.stop();
      this.quickSwitcher = null;
    }

    if (features.findInSplitOnRepeat && !this.findInSplitOnRepeat) {
      this.findInSplitOnRepeat = new FindInSplitOnRepeat(this);
      this.findInSplitOnRepeat.start();
    } else if (!features.findInSplitOnRepeat && this.findInSplitOnRepeat) {
      this.findInSplitOnRepeat.stop();
      this.findInSplitOnRepeat = null;
    }

    if (features.stickyHeadings && !this.stickyHeadings) {
      this.stickyHeadings = new StickyHeadings(this);
      this.stickyHeadings.start();
    } else if (!features.stickyHeadings && this.stickyHeadings) {
      this.stickyHeadings.stop();
      this.stickyHeadings = null;
    }
    this.stickyHeadings?.refreshAll();
    this.navigation?.applyHistoryLimit();
  }
};
