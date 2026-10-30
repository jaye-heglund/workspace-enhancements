# UX Enhancements

Optional navigation and editing tools for Obsidian. Enable features individually in the plugin settings and assign commands hotkeys in **Settings → Hotkeys**.

## File & Workspace Navigation

- **File Finder:** Run **Open file finder** to fuzzy-search file names and paths. It respects Obsidian's ignored paths and shows recently opened files first when the search is empty. Enable **Replace file finder** to make Obsidian's Quick Switcher command open it instead. Press Ctrl/Cmd+Enter to open a result in a new tab, or Ctrl/Cmd+Shift+Enter to open it in a new window (desktop only).
- **Command Palette:** Enable **Replace command palette** to find and run registered commands with the lightweight picker.
- **Template Picker:** Enable **Replace template picker** to search the configured template folder and insert templates with `{{date}}`, `{{time}}`, and `{{title}}` expansion and frontmatter merging.
- **Quick Switcher: open in new tab:** In Obsidian's Quick Switcher, Right Arrow opens the selected file in a new tab and leaves the switcher open. This setting also controls Right Arrow behavior in File Finder.
- **In-File Navigation:** Use the mouse back and forward buttons to revisit recent cursor and scroll positions in the current note. The history length is configurable.
- **Move Tab Between Groups (desktop):** Commands move the active tab to the previous or next group in the same window, wrapping from either end to the opposite group.
- **Sidebar panes in secondary windows (desktop):** In a secondary window, Ctrl/Cmd+B toggles a left split pane with the main window's left sidebar views; Ctrl/Cmd+Alt+B toggles a right split pane with its right sidebar views; sidebar commands such as Search, File Explorer, Outline, and Backlinks open their views in that window. Ctrl/Cmd+Shift+E opens File Explorer there. Each pane keeps its views in tabs, and the main sidebar views remain in place.

## In-Note Toolsb

- **Pop-out word and character count:** Show the active note's word and character totals in secondary windows.
- **Sticky Headings:** Show the current heading or its hierarchy while scrolling. Click a heading to jump to it; hierarchy, spacing, text size, and indentation are configurable.
- **Note Peek:** Run **Peek at linked note or backlinks** with the cursor on a link to open its target in a horizontal split. On first launch, choose whether to use F12 as the default; the shortcut can be changed in **Settings → Hotkeys**.

