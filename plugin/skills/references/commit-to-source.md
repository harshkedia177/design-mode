# Commit Styles to Source Code

Apply browser-previewed CSS changes to the actual source files, matching the project's existing styling approach.

## Detect the Styling Approach

Before making changes, identify the project's styling pattern:

| Indicator | Approach | Where to Edit |
|-----------|----------|---------------|
| `tailwind.config.*` exists | Tailwind CSS | Modify `className` on the element |
| `*.module.css` imports in components | CSS Modules | Edit the corresponding `.module.css` file |
| `styled-components` or `@emotion` imports | CSS-in-JS | Edit the styled definition or `css` call |
| `*.css` or `*.scss` files linked from HTML/components | Traditional CSS | Edit the stylesheet, match by selector |
| None of the above | Inline styles | Modify the `style` prop (last resort) |

## Apply Changes by Approach

### Tailwind CSS

1. Map the CSS property to Tailwind utility classes (e.g., `font-size: 20px` -> `text-xl`)
2. Add/replace classes in the element's `className`
3. Preserve existing non-conflicting classes

### CSS Modules

1. Find the imported module file (e.g., `import styles from './Button.module.css'`)
2. Locate the class definition in the module file
3. Add or modify the CSS properties there

### CSS-in-JS (styled-components / Emotion)

1. Find the styled definition (e.g., `const Button = styled.button`...)
2. Add or modify properties within the template literal or object

### Traditional CSS / SCSS

1. Find the stylesheet referenced by the component
2. Locate the rule matching the element's selector
3. Add or modify properties in the rule

### Inline Styles

1. Modify the `style` prop on the JSX/HTML element
2. Use camelCase property names for JSX (e.g., `fontSize` not `font-size`)

## Guidelines

- Match the existing code style (spacing, quotes, semicolons)
- Avoid mixing approaches within a single component
- Prefer the project's dominant approach over inline styles
- When adding Tailwind classes, use the project's configured theme values
