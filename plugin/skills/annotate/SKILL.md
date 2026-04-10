---
name: annotate
description: "Process and apply user annotations from Design Mode. Use when the user says 'apply annotations', 'process my design comments', 'fix those', 'apply my changes', 'do what I noted', 'apply design feedback', or when the auto-read hook detects pending annotations."
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash
  - ToolSearch
  - mcp__design-mode__read_annotations
  - mcp__design-mode__read_element
  - mcp__design-mode__apply_style
  - mcp__design-mode__screenshot
  - mcp__design-mode__eval_js
  - mcp__plugin_design-mode_design-mode__read_annotations
  - mcp__plugin_design-mode_design-mode__read_element
  - mcp__plugin_design-mode_design-mode__apply_style
  - mcp__plugin_design-mode_design-mode__screenshot
  - mcp__plugin_design-mode_design-mode__eval_js
  - mcp__Claude_Preview__preview_eval
  - mcp__Claude_Preview__preview_screenshot
  - mcp__Claude_in_Chrome__javascript_tool
  - mcp__Control_Chrome__execute_javascript
---

# Annotate — Process and Apply Design Annotations

Read all annotations from the Design Mode overlay, interpret the user's intent for each one, and apply the changes to the actual source code.

## Read Annotations

Use `mcp__design-mode__read_annotations` to get all annotations with full element data (styles, box model, source info, comments).

Present a summary: how many annotations, brief list of each.

## Process Each Annotation

### 1. Locate the Source File

Follow the priority order in `../references/source-lookup.md` to find the element's source file.

### 2. Interpret the Comment

Parse annotations into actionable changes:
- Style changes: "bigger", "red", "more padding" → CSS modifications
- Content changes: "change text to X" → HTML/JSX text changes
- Structural: "move above", "wrap in container" → DOM restructuring
- Removal: "remove this", "hide" → remove or display:none
- Questions: "why is this here?" → explain, don't modify

### 3. Apply the Change

- Use Edit tool to modify the source file
- Follow `../references/commit-to-source.md` to match the project's styling approach
- For each change, explain what was done and why

### 4. Verify

- Take a screenshot with `mcp__design-mode__screenshot` to show results
- Compare with the annotations — do the changes match intent?
- Report which annotations were applied and which need clarification

## Batch Processing

Group annotations by source file and apply all changes in a single pass per file.
