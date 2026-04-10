---
name: inspect-element
description: "Read and return detailed information about selected elements from the Design Mode overlay. Use when the user says 'what did I select', 'inspect element', 'show element details', 'read element', 'what element is that', 'show me element info', or references an element from the overlay."
allowed-tools:
  - Read
  - Grep
  - Glob
  - ToolSearch
  - mcp__design-mode__read_annotations
  - mcp__design-mode__read_element
  - mcp__design-mode__screenshot
  - mcp__design-mode__eval_js
  - mcp__plugin_design-mode_design-mode__read_annotations
  - mcp__plugin_design-mode_design-mode__read_element
  - mcp__plugin_design-mode_design-mode__screenshot
  - mcp__plugin_design-mode_design-mode__eval_js
  - mcp__Claude_Preview__preview_eval
  - mcp__Claude_Preview__preview_screenshot
  - mcp__Claude_in_Chrome__javascript_tool
  - mcp__Control_Chrome__execute_javascript
---

# Inspect Element — Read Design Mode State

Read element data from the Design Mode overlay to provide detailed information about selected or specific elements.

## Read a Specific Element by Selector

Use `mcp__design-mode__read_element` with the CSS selector. Returns computed styles, box model, source file mapping, and text content.

## Read All Annotations

Use `mcp__design-mode__read_annotations`. Returns all user annotations with full element data (styles, box model, source info, comments).

## Read Selected Elements (via eval)

If you need custom queries, use `mcp__design-mode__eval_js`:
```js
JSON.stringify((() => {
  if (!window.__designMode) return { error: 'Design Mode not active' };
  const selected = [];
  window.__designMode.elements.forEach((e, id) => {
    if (e.selected) selected.push({ id, selector: e.selector, tagName: e.tagName, componentName: e.componentName, sourceFile: e.sourceFile, text: e.text.slice(0, 50), annotation: e.annotation });
  });
  return selected;
})())
```

## Source File Lookup

To locate the source file for an element, follow the priority order in `../references/source-lookup.md`.

## Tips

- Prefer the MCP tools (`read_element`, `read_annotations`) over raw eval — they handle errors and are faster.
- For custom queries beyond what the MCP tools provide, use `mcp__design-mode__eval_js`.
- If Design Mode is not active, the MCP tools return a clear error message.
- Take a screenshot with `mcp__design-mode__screenshot` to see the current state visually.
