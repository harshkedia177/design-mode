# Source File Lookup

Locate the source file for a browser element using its overlay data. Try each strategy in priority order, stopping at the first match.

## Priority Order

### 1. Framework Source Mapping

If the element data includes `sourceFile` (and optionally `lineNumber`) from the framework fiber (React, Vue, Svelte):

1. Verify the file exists with Glob: `**/<filename>`
2. If found, open it directly at the indicated line number
3. Use Grep to confirm the component definition if needed

### 2. Component Name

If `componentName` is present:

```
Grep for: function|const|class <ComponentName>
In: **/*.{tsx,jsx,ts,js,vue,svelte}
```

### 3. CSS Class Names

If the element has class names:

1. Pick the most specific/unique class (avoid generic names like `container`, `wrapper`)
2. Grep for that class name across stylesheets and component files
3. Cross-reference with the element's tag and text content to confirm

### 4. Element ID

If the selector includes an ID:

```
Grep for: id="<element-id>" or #<element-id>
```

### 5. Text Content (Last Resort)

Search for the element's visible text content:

```
Grep for: "<text content snippet>"
In: **/*.{tsx,jsx,ts,js,vue,svelte,html}
```

Use short, distinctive phrases. Avoid searching for generic text like "Submit" or "Loading".

## Verification

After locating the file, confirm the match by checking:
- The component/element renders the expected tag type
- Class names or IDs match
- Surrounding structure is consistent with the DOM context
