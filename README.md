# Design Mode for Claude Code

Visual overlay for annotating, inspecting, and modifying UI elements directly in the browser. Click elements to annotate, hover to inspect box models, and let Claude apply your design feedback to source code.

## Features

- **Hover to inspect** — Box model visualization (margin, padding, border) on any element
- **Click to annotate** — Select elements and type what you want changed
- **Annotation pins** — Gold markers show where you've annotated, with a panel to manage all notes
- **Source file mapping** — Auto-detects React, Vue, and Svelte component files
- **Screenshots** — Cropped screenshots of each annotated element sent to Claude
- **Auto-read** — Annotations are automatically read when you type in Claude Code
- **Copy to Claude** — One-click clipboard export of all annotations
- **CSS playground** — Live style tweaking with before/after comparison
- **Responsive testing** — Quick viewport presets (375/768/1280px)
- **Keyboard shortcuts** — Ctrl+Shift+D to toggle, Escape to close panels

## Installation

### Option 1: Claude Code Plugin (full experience)

Install as a plugin to get auto-read annotations, skills, agents, and auto-install hooks.

```
/plugin marketplace add harshkedia177/design-mode-plugin
/plugin install design-mode@harshkedia177-design-mode-plugin
```

Dependencies install automatically on first launch via the SessionStart hook.

### Option 2: Standalone MCP Server (any MCP client)

Works with Claude Code, Claude Desktop, Cursor, Windsurf, or any MCP-compatible client.

```bash
# Claude Code
claude mcp add --transport stdio design-mode -- npx -y design-mode-mcp

# Or add to .mcp.json (team-wide)
```

```json
{
  "mcpServers": {
    "design-mode": {
      "command": "npx",
      "args": ["-y", "design-mode-mcp"]
    }
  }
}
```

### Local development

```bash
claude --plugin-dir /path/to/design-mode
```

## Requirements

- **Chrome** with remote debugging enabled
- **Node.js** 18+

### Enable Chrome remote debugging

**Option A (recommended):** Open `chrome://inspect/#remote-debugging` in Chrome and ensure "Discover network targets" is enabled. The plugin auto-discovers the debugging port.

**Option B:** Launch Chrome with a flag:
```bash
# macOS
open -a "Google Chrome" --args --remote-debugging-port=9222
# Linux
google-chrome --remote-debugging-port=9222
```

## Usage

### Activate the overlay

```
activate design mode
```

Or with a specific URL:
```
activate design mode on http://localhost:3000
```

### Annotate elements

1. **Hover** any element to see its box model
2. **Click** to select and open the annotation panel
3. Type your comment (e.g., "make this bigger", "change color to blue")
4. Press Enter or click Save
5. A gold pin appears on annotated elements

### Apply annotations

Just type anything in Claude Code — annotations are auto-read. Or explicitly:
```
apply my annotations
```

Claude finds the source files, interprets your comments, and edits the code.

### Manage annotations

Click **"Notes"** in the toolbar to see all annotations:
- Click to scroll to and highlight the element
- **Edit** to modify the annotation
- **Del** to remove it

### CSS playground

```
/design-mode:playground
```

Live-tweak styles in the browser, then commit to source.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+D` | Toggle overlay visibility |
| `Escape` | Close annotation panel |
| `Enter` | Save annotation |
| `Shift+Click` | Multi-select elements |

## Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `/design-mode:design-mode` | "activate design mode" | Inject/remove the overlay |
| `/design-mode:inspect-element` | "inspect element" | Read element details |
| `/design-mode:annotate` | "apply annotations" | Process and apply all annotations |
| `/design-mode:playground` | "css playground" | Live CSS tweaking |

## MCP Tools

The plugin bundles an MCP server that connects to Chrome via CDP:

| Tool | Description |
|------|-------------|
| `activate` | Inject overlay (optional `url` param) |
| `deactivate` | Remove overlay |
| `read_annotations` | Get all annotations + cropped screenshots |
| `read_element` | Inspect element by CSS selector |
| `apply_style` | Temporarily apply CSS to an element |
| `screenshot` | Full page or element screenshot |
| `resize_viewport` | Responsive viewport emulation |
| `reset_viewport` | Restore default viewport |
| `eval_js` | Execute JavaScript in the page |

## How it works

1. **SessionStart hook** auto-installs npm dependencies on first run
2. **MCP server** connects to Chrome via CDP (auto-discovers debugging port)
3. **Overlay** is injected as a self-contained IIFE script
4. **UserPromptSubmit hook** auto-reads annotations before each message
5. **Skills** orchestrate the MCP tools for common workflows

## Supported frameworks

Source file mapping works with:
- **React** (dev mode) — via `__reactFiber$` and `_debugSource`
- **Vue 2/3** — via `__vue__` and `__vueParentComponent`
- **Svelte** — via `__svelte_meta`
- **Custom** — via `data-source` attribute

## Troubleshooting

### MCP server not connecting
1. Check Chrome remote debugging: open `chrome://inspect/#remote-debugging`
2. Verify port file exists: `cat ~/Library/Application\ Support/Google/Chrome/DevToolsActivePort`
3. Check server status: `/mcp` in Claude Code

### "No suitable page target found"
Navigate to an actual web page first (not `chrome://newtab`). Or pass a URL when activating.

### Tools not appearing
Run `/mcp` to check. If not listed, restart Claude Code. Dependencies install on first launch.

### Annotations not auto-reading
Ensure Design Mode was activated via the MCP tool, not manually injected.

## Distribution

| Channel | Install command |
|---------|----------------|
| **Claude Code Plugin** | `/plugin marketplace add harshkedia177/design-mode-plugin` |
| **npm (MCP server)** | `claude mcp add --transport stdio design-mode -- npx -y design-mode-mcp` |
| **npm (global)** | `npm install -g design-mode-mcp` then add to MCP config |

### Plugin vs Standalone MCP

| Feature | Plugin | Standalone MCP |
|---------|--------|---------------|
| All 9 MCP tools | Yes | Yes |
| Hover/click/annotate overlay | Yes | Yes |
| Auto-read annotations on every message | Yes | No (manual) |
| Skills (`/design-mode:*`) | Yes | No |
| Auto-install dependencies | Yes | No (npx handles it) |

## License

MIT
