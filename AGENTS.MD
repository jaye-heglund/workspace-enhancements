# Agent Guidance

These notes apply to the Workspace Enhancements plugin in this directory.

## Structure

- `main.js` is the CommonJS plugin entry point and contains feature classes, shared helpers, settings, and plugin lifecycle wiring. Keep additions within this established structure unless a feature clearly warrants a separate module.
- Give each substantial feature a class that receives the plugin instance and uses `this.plugin.app` and `this.plugin.settings` for shared state. Keep reusable behavior, such as `SearchPicker`, configurable rather than duplicating it.
- `WorkspaceEnhancementsPlugin.syncFeatures()` owns enable/disable transitions for optional features. Create and start a feature once when enabled; stop it and clear its reference when disabled. Ensure every `start()` has a corresponding cleanup path in `stop()` and `onunload()`.
- `DEFAULT_SETTINGS` defines defaults; `mergeSettings()` merges saved data and normalizes values. Add persisted settings there and expose them through `WorkspaceEnhancementsSettings`. Save changes through `saveSettings()` so feature synchronization also runs.

## Implementation Patterns

- Keep data transformation and lookup separate from UI and Obsidian event wiring where practical. Bound result lists and avoid repeating expensive searches or scans during rendering.
- For UI attached to a workspace leaf, use its `containerEl.ownerDocument` and that document's `defaultView`; do not assume every leaf belongs to the main window. For features spanning windows, register documents on `window-open` and unregister them on `window-close`.
- Track listeners, observers, timers, and per-leaf/per-document state in `Map` or `Set` collections. Remove listeners and disconnect observers when elements disappear, windows close, the feature stops, or the plugin unloads.
- Prefer Obsidian workspace/editor APIs for leaf and editor operations. When a feature must rely on CodeMirror or Obsidian DOM details, keep selectors and assumptions localized, verify the target leaf, and handle missing elements.
- When duplicating or moving a view, capture and restore the view state and ephemeral state as appropriate. On asynchronous failure, detach any partially created leaf and restore focus to the original leaf.
- Use `Notice` for actionable user-facing failures and `console.error` for diagnostic detail. Catch rejected asynchronous work at event and command boundaries.
- Prefix feature-owned CSS classes (`we-`, `sh-`, etc.) and keep their styling in `styles.css`.

## Validation

- Run `node --check main.js` after JavaScript changes. Exercise the affected feature in Obsidian when behavior depends on workspace layout, editor focus, native dialogs, or secondary windows; syntax checks do not verify those runtime interactions.
- Keep README feature descriptions and settings descriptions aligned with user-visible behavior.