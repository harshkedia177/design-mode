---
name: design-mode
description: "Activate or deactivate the visual Design Mode overlay on a web page in the browser. Use when the user says 'activate design mode', 'turn on design mode', 'start design mode', 'inject overlay', 'enable element inspection', or 'deactivate design mode', 'turn off design mode', 'remove overlay'."
argument-hint: "activate | deactivate | toggle | refresh"
allowed-tools:
  - Read
  - Bash
  - ToolSearch
  - mcp__design-mode__activate
  - mcp__design-mode__deactivate
  - mcp__design-mode__screenshot
  - mcp__design-mode__read_annotations
  - mcp__design-mode__read_element
  - mcp__design-mode__apply_style
  - mcp__design-mode__resize_viewport
  - mcp__design-mode__reset_viewport
  - mcp__design-mode__eval_js
  - mcp__plugin_design-mode_design-mode__activate
  - mcp__plugin_design-mode_design-mode__deactivate
  - mcp__plugin_design-mode_design-mode__screenshot
  - mcp__plugin_design-mode_design-mode__read_annotations
  - mcp__plugin_design-mode_design-mode__read_element
  - mcp__plugin_design-mode_design-mode__apply_style
  - mcp__plugin_design-mode_design-mode__resize_viewport
  - mcp__plugin_design-mode_design-mode__reset_viewport
  - mcp__plugin_design-mode_design-mode__eval_js
  - mcp__Claude_Preview__preview_eval
  - mcp__Claude_Preview__preview_screenshot
  - mcp__Claude_in_Chrome__javascript_tool
  - mcp__Control_Chrome__execute_javascript
---

# Design Mode — Activate/Deactivate Overlay

Inject or remove the Design Mode visual overlay on the current browser page.

## Activation

### Step 1: Search for and call the MCP activate tool

IMPORTANT: The tool may be deferred. Use ToolSearch first to find it:
- Search for "design-mode activate" using ToolSearch
- The tool name is either `mcp__design-mode__activate` (user MCP) or `mcp__plugin_design-mode_design-mode__activate` (plugin MCP)
- Call whichever one exists with an optional `url` parameter

This connects to Chrome via CDP and injects the overlay. If it succeeds, report the element count and stop.

### Step 2: ONLY if the MCP tool doesn't exist at all

Fall back to manual injection:

1. Read the overlay script: search for `**/design-mode/scripts/overlay.js`
2. Inject via any available browser MCP: `preview_eval` → `javascript_tool` → `execute_javascript`
3. Take a screenshot to confirm

**Do NOT skip to the fallback just because Chrome has a blank tab.** The MCP `activate` tool accepts a `url` parameter to navigate first.

## After Activation

Report:
- Element count
- Ctrl+Shift+D to toggle
- Click to annotate, Shift+click for multi-select
- "Copy to Claude" copies annotations to clipboard

## Deactivation

1. Call `mcp__design-mode__deactivate` (or `mcp__plugin_design-mode_design-mode__deactivate`)
2. Fallback: execute `window.__designMode._destroy()` via browser MCP

## Viewport Resize

- `mcp__design-mode__resize_viewport` with `width` parameter
- `mcp__design-mode__reset_viewport` to restore defaults

## Connection

For Chrome connection details, see `../references/connection.md`.
