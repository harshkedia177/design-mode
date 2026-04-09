---
name: playground
description: "Live CSS playground for tweaking element styles in real-time in the browser. Use when the user says 'open css playground', 'let me tweak styles', 'live edit CSS', 'try different styles', 'experiment with styles', or wants to visually iterate on CSS before committing to source code."
allowed-tools:
  - Read
  - Edit
  - Grep
  - Glob
  - ToolSearch
  - mcp__design-mode__apply_style
  - mcp__design-mode__read_element
  - mcp__design-mode__screenshot
  - mcp__design-mode__eval_js
  - mcp__plugin_design-mode_design-mode__apply_style
  - mcp__plugin_design-mode_design-mode__read_element
  - mcp__plugin_design-mode_design-mode__screenshot
  - mcp__plugin_design-mode_design-mode__eval_js
  - mcp__Claude_Preview__preview_eval
  - mcp__Claude_Preview__preview_screenshot
  - mcp__Claude_in_Chrome__javascript_tool
  - mcp__Control_Chrome__execute_javascript
---

# CSS Playground — Live Style Tweaking

Apply temporary CSS changes to elements in the browser for visual iteration. Changes are applied via inline styles and can be committed to source code when the user is satisfied.

## Apply Temporary Styles

Use `mcp__design-mode__apply_style` with:
- `selector`: CSS selector of the element
- `styles`: object of CSS property-value pairs (camelCase keys), e.g. `{"fontSize": "20px", "color": "red"}`

The tool automatically stores original styles for revert.

## Take Before/After Screenshots

1. Take a screenshot before: `mcp__design-mode__screenshot`
2. Apply the style change
3. Take another screenshot after
4. Ask the user if they want to keep, adjust, or revert

## Revert Styles

Use `mcp__design-mode__apply_style` with `revert: true` and the same selector.

## Commit to Source

When the user says "commit this" or "save these styles":

1. Use `mcp__design-mode__read_element` to get the element's source file info
2. Locate the source file following `../references/source-lookup.md`
3. Apply the style changes to the actual source file using Edit, following `../references/commit-to-source.md` to match the project's styling approach

## Common Style Tweaks

Interpret natural language into CSS:
- "make it bigger" → increase font-size or dimensions
- "more spacing" → increase padding, margin, or gap
- "bolder" → font-weight: 700
- "center it" → appropriate flex/grid/text-align centering
- "red" / "blue" / any color → change color or background
- "rounded" → increase border-radius
- "shadow" → add box-shadow
