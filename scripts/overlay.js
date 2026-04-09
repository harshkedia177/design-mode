/**
 * Design Mode Overlay for Claude Code
 * Injects a visual annotation layer onto any web page.
 *
 * Features:
 * - Hover highlight with box model visualization
 * - Click to select + annotation input
 * - Shift+click for multi-select
 * - Source file mapping (React, Vue, Svelte)
 * - Annotation pins on annotated elements
 * - Annotations list panel with edit/delete
 * - Responsive viewport switcher
 * - "Copy to Claude" button
 * - Ctrl+Shift+D to toggle on/off
 *
 * All state stored in window.__designMode for Claude to read.
 */
(function () {
  'use strict';

  // Prevent double-injection
  if (window.__designMode && window.__designMode._initialized) {
    // Toggle visibility if re-injected
    window.__designMode._toggle();
    return;
  }

  // ─── Utilities ──────────────────────────────────────────────
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(str) { return String(str).replace(/[&<>"']/g, c => ESC_MAP[c]); }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function transition(val) { return prefersReducedMotion ? 'none' : val; }

  // ─── Animation Easing & Helpers ────────────────────────────
  const EASE_OUT_QUART = 'cubic-bezier(0.25, 1, 0.5, 1)';
  const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

  function animateIn(el, from, to, duration) {
    if (prefersReducedMotion) {
      Object.assign(el.style, to);
      return;
    }
    Object.assign(el.style, from);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `opacity ${duration}ms ${EASE_OUT_QUART}, transform ${duration}ms ${EASE_OUT_QUART}`;
        Object.assign(el.style, to);
        setTimeout(() => { el.style.transition = ''; }, duration);
      });
    });
  }

  function animateOut(el, to, duration, onDone) {
    if (prefersReducedMotion) {
      Object.assign(el.style, to);
      if (onDone) onDone();
      return;
    }
    el.style.transition = `opacity ${duration}ms ${EASE_OUT_QUART}, transform ${duration}ms ${EASE_OUT_QUART}`;
    Object.assign(el.style, to);
    setTimeout(() => { el.style.transition = ''; if (onDone) onDone(); }, duration);
  }

  // ─── Constants ──────────────────────────────────────────────
  const OVERLAY_Z = 2147483641;
  const TOOLBAR_Z = 2147483642;
  const PANEL_Z = 2147483643;

  const SELECTOR_FOR_ELEMENTS = [
    'a', 'button', 'input', 'select', 'textarea', 'img', 'video', 'audio',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'section',
    'article', 'nav', 'header', 'footer', 'main', 'aside', 'form',
    'table', 'ul', 'ol', 'li', 'label', 'svg', 'canvas',
    '[role]', '[data-testid]', '[class]'
  ].join(',');

  // ─── Design Tokens ──────────────────────────────────────────
  const T = {
    // Surfaces — deep blacks, layered
    bg: '#0c0c0c',
    bgElevated: '#161616',
    bgToolbar: '#141414',
    bgInset: '#0a0a0a',
    // Text
    text: '#d1d1d1',
    textMuted: '#8a8a8a',
    textBright: '#ffffff',
    // Accent — burnt vermillion, sole color
    accent: '#e8590c',
    accentHover: 'rgba(232,89,12,0.10)',
    accentSelected: 'rgba(232,89,12,0.16)',
    accentFocus: 'rgba(232,89,12,0.35)',
    accentFocusRing: '0 0 0 2px rgba(232,89,12,0.18)',
    accentGlow: '0 0 8px rgba(232,89,12,0.15), 0 0 3px rgba(232,89,12,0.25)',
    // Semantic
    danger: '#c4382a',
    success: '#2d8a4e',
    // Borders — subtle bevel system
    border: 'rgba(255,255,255,0.07)',
    borderFaint: 'rgba(255,255,255,0.04)',
    borderHighlight: 'rgba(255,255,255,0.10)',
    hoverBg: 'rgba(255,255,255,0.06)',
    hoverBgSubtle: 'rgba(255,255,255,0.03)',
    // Box model overlays
    boxMargin: 'rgba(214,133,110,0.2)',
    boxPadding: 'rgba(110,214,162,0.2)',
    boxBorder: 'rgba(214,198,110,0.3)',
    // Shadows — deep, layered
    shadowSm: '0 2px 8px rgba(0,0,0,0.5)',
    shadowMd: '0 4px 20px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.4)',
    shadowLg: '0 8px 32px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.4)',
    shadowPin: '0 1px 4px rgba(0,0,0,0.5)',
    shadowMenu: '0 8px 32px rgba(0,0,0,0.7)',
    shadowInset: 'inset 0 1px 3px rgba(0,0,0,0.5)',
    shadowDock: '0 8px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
    // Typography
    font: "-apple-system,SF Pro Display,system-ui,sans-serif",
    // Radius
    radiusSm: '2px',
    radius: '6px',
    radiusLg: '12px',
    radiusPill: '999px',
  };

  // Backwards-compat alias used by _dump and box model overlays
  const COLORS = {
    hover: T.accentHover,
    selected: T.accentSelected,
    margin: T.boxMargin,
    padding: T.boxPadding,
    border: T.boxBorder,
    toolbar: T.bg,
    toolbarText: T.text,
  };

  // Shared style fragments
  const DOCK_BTN = `padding:6px 14px;background:${T.bgInset};color:${T.textMuted};border:1px solid ${T.border};border-radius:${T.radiusPill};cursor:pointer;font-size:11px;font-weight:500;letter-spacing:0.3px;box-shadow:${T.shadowInset};`;
  const DOCK_BTN_PRIMARY = `padding:6px 14px;background:${T.accent};color:${T.textBright};border:none;border-radius:${T.radiusPill};cursor:pointer;font-size:11px;font-weight:600;letter-spacing:0.3px;box-shadow:${T.accentGlow};`;
  const MENU_ITEM = `display:block;width:100%;text-align:left;padding:7px 14px;background:none;color:${T.text};border:none;cursor:pointer;font-size:11px;font-family:inherit;`;
  const PANEL_BASE = `border:1px solid ${T.border};border-radius:${T.radiusLg};box-shadow:${T.shadowLg};font-family:${T.font};`;

  // ─── State ──────────────────────────────────────────────────
  let elementCounter = 0;
  let hoveredEl = null;

  const state = {
    _initialized: true,
    active: true,
    elements: new Map(),
    annotations: [],
    viewport: { width: window.innerWidth, height: window.innerHeight },
    _toggle: null,
    _destroy: null,
    _refresh: null,
  };
  window.__designMode = state;

  // ─── DOM Containers ─────────────────────────────────────────
  const root = document.createElement('div');
  root.id = '__design-mode-root';
  root.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:' + OVERLAY_Z + ';pointer-events:none;';
  document.body.appendChild(root);

  // Hover overlay
  const hoverOverlay = document.createElement('div');
  hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid ' + T.accent + ';background:' + COLORS.hover + ';transition:' + transition('all 0.1s ease') + ';display:none;z-index:' + OVERLAY_Z + ';';
  root.appendChild(hoverOverlay);

  // Box model overlays
  const marginOverlay = document.createElement('div');
  marginOverlay.style.cssText = 'position:fixed;pointer-events:none;background:' + COLORS.margin + ';display:none;z-index:' + (OVERLAY_Z - 2) + ';';
  root.appendChild(marginOverlay);

  const paddingOverlay = document.createElement('div');
  paddingOverlay.style.cssText = 'position:fixed;pointer-events:none;background:' + COLORS.padding + ';display:none;z-index:' + (OVERLAY_Z - 1) + ';';
  root.appendChild(paddingOverlay);

  // Element info tooltip
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:fixed;pointer-events:none;background:' + T.bgElevated + ';color:' + T.text + ';font:11px/1.4 ' + T.font + ';padding:5px 12px;border-radius:' + T.radiusPill + ';border:1px solid ' + T.border + ';display:none;z-index:' + PANEL_Z + ';white-space:nowrap;max-width:400px;overflow:hidden;text-overflow:ellipsis;box-shadow:' + T.shadowMd + ';';
  root.appendChild(tooltip);

  // Annotation input panel
  const annotationPanel = document.createElement('div');
  annotationPanel.setAttribute('role', 'dialog');
  annotationPanel.setAttribute('aria-label', 'Annotate element');
  annotationPanel.setAttribute('aria-modal', 'false');
  annotationPanel.style.cssText = 'position:fixed;display:none;z-index:' + PANEL_Z + ';pointer-events:auto;background:' + T.bgElevated + ';' + PANEL_BASE + 'padding:16px;width:300px;';
  annotationPanel.innerHTML = `
    <div style="color:${T.text};font-size:13px;margin-bottom:10px;font-weight:600;letter-spacing:0.3px;" id="__dm-annotation-title">Annotate Element #0</div>
    <textarea id="__dm-annotation-input" placeholder="Describe what to change..." aria-label="Annotation comment" style="width:100%;box-sizing:border-box;height:60px;background:${T.bgInset};color:${T.text};border:1px solid ${T.border};border-radius:${T.radius};padding:8px;font-size:13px;resize:vertical;font-family:inherit;outline:none;box-shadow:${T.shadowInset};"></textarea>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button id="__dm-annotation-save" style="${DOCK_BTN_PRIMARY}flex:1;">Save</button>
      <button id="__dm-annotation-cancel" style="${DOCK_BTN}flex:1;">Cancel</button>
    </div>
  `;
  root.appendChild(annotationPanel);

  // Cache annotation panel elements (avoid repeated querySelector)
  const annotationTitle = annotationPanel.querySelector('#__dm-annotation-title');
  const annotationInput = annotationPanel.querySelector('#__dm-annotation-input');
  const annotationSaveBtn = annotationPanel.querySelector('#__dm-annotation-save');
  const annotationCancelBtn = annotationPanel.querySelector('#__dm-annotation-cancel');
  let annotationTriggerEl = null; // element that opened the panel, for focus return

  // Textarea focus glow
  if (!prefersReducedMotion) {
    annotationInput.style.transition = `border-color 200ms ${EASE_OUT_QUART}, box-shadow 200ms ${EASE_OUT_QUART}`;
    annotationInput.addEventListener('focus', () => {
      annotationInput.style.borderColor = T.accentFocus;
      annotationInput.style.boxShadow = T.accentFocusRing;
    });
    annotationInput.addEventListener('blur', () => {
      annotationInput.style.borderColor = T.border;
      annotationInput.style.boxShadow = 'none';
    });
  }

  // Focus trap: Tab cycles within textarea → Save → Cancel
  const panelFocusables = [annotationInput, annotationSaveBtn, annotationCancelBtn];
  annotationPanel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const idx = panelFocusables.indexOf(document.activeElement);
    if (idx < 0) return;
    if (e.shiftKey) {
      if (idx === 0) { e.preventDefault(); panelFocusables[panelFocusables.length - 1].focus(); }
    } else {
      if (idx === panelFocusables.length - 1) { e.preventDefault(); panelFocusables[0].focus(); }
    }
  });

  // ─── Toolbar ────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Design Mode controls');
  toolbar.style.cssText = `
    position:fixed;top:14px;right:14px;z-index:${TOOLBAR_Z};
    pointer-events:auto;background:${T.bgToolbar};
    border:1px solid ${T.borderHighlight};border-radius:${T.radiusPill};
    padding:6px 8px;display:flex;gap:5px;align-items:center;
    box-shadow:${T.shadowDock};
    font-family:${T.font};font-size:11px;color:${T.text};
    opacity:0;transform:translateY(-12px);user-select:none;
  `;
  toolbar.innerHTML = `
    <span id="__dm-drag-handle" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${T.bgInset};border:1px solid ${T.border};box-shadow:${T.shadowInset}, ${T.accentGlow};cursor:grab;flex-shrink:0;" title="Drag to reposition">
      <span style="display:block;width:8px;height:8px;border-radius:50%;background:${T.accent};box-shadow:${T.accentGlow};"></span>
    </span>
    <div style="position:relative;">
      <button id="__dm-btn-tools" title="Tools" aria-label="Tools menu" aria-expanded="false" style="${DOCK_BTN}">Tools ▾</button>
      <div id="__dm-tools-menu" style="display:none;position:absolute;top:calc(100% + 8px);right:0;background:${T.bgElevated};border:1px solid ${T.borderHighlight};border-radius:${T.radiusLg};padding:4px 0;min-width:160px;box-shadow:${T.shadowMenu};z-index:1;">
        <button id="__dm-btn-refresh" style="${MENU_ITEM}" title="Re-scan elements">Refresh elements</button>
        <div style="height:1px;background:${T.borderFaint};margin:4px 0;"></div>
        <button id="__dm-btn-375" style="${MENU_ITEM}" title="Mobile 375px">Mobile — 375px</button>
        <button id="__dm-btn-768" style="${MENU_ITEM}" title="Tablet 768px">Tablet — 768px</button>
        <button id="__dm-btn-1280" style="${MENU_ITEM}" title="Desktop 1280px">Desktop — 1280px</button>
        <button id="__dm-btn-reset" style="${MENU_ITEM}" title="Reset viewport">Reset viewport</button>
      </div>
    </div>
    <button id="__dm-btn-list" title="Show annotations list" aria-label="Show annotations list" style="${DOCK_BTN}">Notes <span id="__dm-count" aria-label="annotation count" style="color:${T.accent};">0</span></button>
    <button id="__dm-btn-copy" title="Copy annotations to clipboard" aria-label="Copy annotations to clipboard" style="${DOCK_BTN_PRIMARY}">Copy to Claude</button>
    <button id="__dm-btn-toggle" title="Toggle Design Mode (Ctrl+Shift+D)" aria-label="Toggle Design Mode" style="${DOCK_BTN}color:${T.textMuted};">Hide</button>
  `;
  root.appendChild(toolbar);

  // ─── Toolbar Drag ──────────────────────────────────────────
  {
    const handle = toolbar.querySelector('#__dm-drag-handle');
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      handle.style.cursor = 'grabbing';
      const rect = toolbar.getBoundingClientRect();
      // Switch from right-anchored to left-anchored positioning
      toolbar.style.left = rect.left + 'px';
      toolbar.style.top = rect.top + 'px';
      toolbar.style.right = 'auto';
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - toolbar.offsetWidth, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - toolbar.offsetHeight, startTop + dy));
      toolbar.style.left = newLeft + 'px';
      toolbar.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = 'grab';
    });
  }

  // ─── Pin Container (for annotation markers) ─────────────────
  const pinContainer = document.createElement('div');
  pinContainer.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:' + (OVERLAY_Z + 1) + ';';
  root.appendChild(pinContainer);

  // ─── Annotations List Panel ─────────────────────────────────
  const listPanel = document.createElement('div');
  listPanel.setAttribute('role', 'region');
  listPanel.setAttribute('aria-label', 'Annotations list');
  listPanel.style.cssText = `
    position:fixed;top:60px;right:14px;z-index:${PANEL_Z};
    pointer-events:auto;background:${T.bgElevated};${PANEL_BASE}
    width:320px;max-height:60vh;overflow-y:auto;display:none;
  `;
  listPanel.innerHTML = `
    <div style="padding:10px 14px;border-bottom:1px solid ${T.border};display:flex;justify-content:space-between;align-items:center;">
      <span style="color:${T.text};font-size:13px;font-weight:600;letter-spacing:0.3px;">Annotations</span>
      <button id="__dm-list-close" aria-label="Close annotations list" style="background:none;border:none;color:${T.textMuted};cursor:pointer;font-size:16px;line-height:1;">&times;</button>
    </div>
    <div id="__dm-list-body" style="padding:0;"></div>
    <div id="__dm-list-empty" style="padding:20px;text-align:center;color:${T.textMuted};font-size:12px;">No annotations yet. Click an element to annotate it.</div>
  `;
  root.appendChild(listPanel);

  const listBody = listPanel.querySelector('#__dm-list-body');
  const listEmpty = listPanel.querySelector('#__dm-list-empty');
  const countBadge = toolbar.querySelector('#__dm-count');

  // ─── Source File Mapping ────────────────────────────────────
  function getSourceInfo(el) {
    // React (dev mode)
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (fiberKey) {
      let fiber = el[fiberKey];
      // Walk up to find a named component
      while (fiber) {
        if (fiber.type && typeof fiber.type === 'function') {
          const name = fiber.type.displayName || fiber.type.name || null;
          // Check for _debugSource (React 16+)
          const source = fiber._debugSource || null;
          return {
            framework: 'react',
            componentName: name,
            fileName: source ? source.fileName : null,
            lineNumber: source ? source.lineNumber : null,
          };
        }
        // Also check for forwardRef/memo wrappers
        if (fiber.type && fiber.type.render) {
          const name = fiber.type.render.displayName || fiber.type.render.name || null;
          return {
            framework: 'react',
            componentName: name,
            fileName: null,
            lineNumber: null,
          };
        }
        fiber = fiber.return;
      }
    }

    // Vue 2/3
    if (el.__vue__) {
      const vm = el.__vue__;
      return {
        framework: 'vue',
        componentName: vm.$options.name || vm.$options._componentTag || null,
        fileName: vm.$options.__file || null,
        lineNumber: null,
      };
    }
    if (el.__vueParentComponent) {
      const c = el.__vueParentComponent;
      return {
        framework: 'vue',
        componentName: c.type?.name || c.type?.__name || null,
        fileName: c.type?.__file || null,
        lineNumber: null,
      };
    }

    // Svelte
    if (el.__svelte_meta) {
      return {
        framework: 'svelte',
        componentName: el.__svelte_meta.component || null,
        fileName: el.__svelte_meta.loc?.file || null,
        lineNumber: el.__svelte_meta.loc?.line || null,
      };
    }

    // data-source attribute (custom)
    if (el.dataset && el.dataset.source) {
      const parts = el.dataset.source.split(':');
      return {
        framework: 'custom',
        componentName: null,
        fileName: parts[0] || null,
        lineNumber: parts[1] ? parseInt(parts[1]) : null,
      };
    }

    return null;
  }

  // ─── Selector Generation ────────────────────────────────────
  function getUniqueSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        parts.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => !c.startsWith('__dm-')).slice(0, 2);
        if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
      // Add nth-child if needed for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // ─── Computed Style Extraction (single getComputedStyle call) ─
  function getElementStyles(el, cs) {
    return {
      styles: {
        display: cs.display,
        position: cs.position,
        width: cs.width,
        height: cs.height,
        margin: cs.margin,
        padding: cs.padding,
        border: cs.border,
        background: cs.backgroundColor,
        color: cs.color,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily,
        lineHeight: cs.lineHeight,
        textAlign: cs.textAlign,
        flexDirection: cs.flexDirection,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        gap: cs.gap,
        overflow: cs.overflow,
        opacity: cs.opacity,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        zIndex: cs.zIndex,
      },
      boxModel: {
        margin: {
          top: parseFloat(cs.marginTop),
          right: parseFloat(cs.marginRight),
          bottom: parseFloat(cs.marginBottom),
          left: parseFloat(cs.marginLeft),
        },
        padding: {
          top: parseFloat(cs.paddingTop),
          right: parseFloat(cs.paddingRight),
          bottom: parseFloat(cs.paddingBottom),
          left: parseFloat(cs.paddingLeft),
        },
        border: {
          top: parseFloat(cs.borderTopWidth),
          right: parseFloat(cs.borderRightWidth),
          bottom: parseFloat(cs.borderBottomWidth),
          left: parseFloat(cs.borderLeftWidth),
        },
        content: {
          width: el.offsetWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
          height: el.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth),
        },
      },
    };
  }

  // ─── Element Scanning ──────────────────────────────────────
  function isInteresting(el, rect) {
    const tag = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'select', 'textarea', 'img', 'video', 'audio', 'canvas', 'svg'].includes(tag)) return true;
    if (/^h[1-6]$/.test(tag)) return true;
    if (el.getAttribute('role')) return true;
    if (el.dataset && el.dataset.testid) return true;
    if (el.children.length === 0 && el.textContent.trim().length > 0 && el.textContent.trim().length < 200) return true;
    if (el.onclick || el.getAttribute('tabindex')) return true;
    if (['nav', 'header', 'footer', 'main', 'aside', 'article', 'section', 'form'].includes(tag)) return true;
    if ((tag === 'div' || tag === 'span') && el.className && typeof el.className === 'string' && el.className.trim().length > 0) {
      if (rect.width > 50 && rect.height > 20) return true;
    }
    return false;
  }

  // Shared dump helper for skills/agents to call instead of duplicating JS snippets
  state._dump = function () {
    const result = { annotations: [], viewport: state.viewport };
    state.annotations.forEach(function (a) {
      var el = state.elements.get(a.elementId);
      result.annotations.push(Object.assign({}, a, {
        styles: el ? el.styles : null,
        boxModel: el ? el.boxModel : null,
        classes: el ? el.classes : null,
        text: el ? (el.text || '').slice(0, 100) : null,
      }));
    });
    return result;
  };

  function scanElements() {
    state.elements.clear();
    elementCounter = 0;

    const allEls = document.querySelectorAll(SELECTOR_FOR_ELEMENTS);
    const seen = new Set();

    // Pass 1: fast filter — only getBoundingClientRect + basic checks
    // getComputedStyle is deferred to pass 2 for elements that pass geometry checks
    const candidates = [];
    allEls.forEach(el => {
      if (seen.has(el)) return;
      if (el.closest('#__design-mode-root')) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (!isInteresting(el, rect)) return;
      seen.add(el);
      candidates.push({ el, rect });
    });

    // Pass 2: expensive style reads only on candidates
    candidates.forEach(({ el, rect }) => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;

      elementCounter++;
      const id = elementCounter;

      const sourceInfo = getSourceInfo(el);
      const { styles, boxModel } = getElementStyles(el, cs);
      state.elements.set(id, {
        _el: el,
        selector: getUniqueSelector(el),
        tagName: el.tagName.toLowerCase(),
        classes: el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/) : [],
        id: el.id || null,
        text: (el.textContent || '').trim().slice(0, 100),
        styles: styles,
        boxModel: boxModel,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        sourceFile: sourceInfo?.fileName || null,
        componentName: sourceInfo?.componentName || null,
        framework: sourceInfo?.framework || null,
        sourceLineNumber: sourceInfo?.lineNumber || null,
        annotation: null,
        selected: false,
      });

      el.__dmId = id;
    });

    state.viewport = { width: window.innerWidth, height: window.innerHeight };
  }

  // ─── Hover Handling ─────────────────────────────────────────
  let hoverRafPending = false;
  let hoverTarget = null;
  function handleMouseMove(e) {
    if (!state.active) return;
    // Ignore our own UI — hide immediately, no rAF needed
    if (e.target.closest('#__design-mode-root')) {
      hoverOverlay.style.display = 'none';
      marginOverlay.style.display = 'none';
      paddingOverlay.style.display = 'none';
      tooltip.style.display = 'none';
      hoveredEl = null;
      hoverTarget = null;
      return;
    }

    const el = e.target;
    if (el === hoveredEl) return;
    hoveredEl = el;
    hoverTarget = el;

    // Defer expensive style reads to next animation frame
    if (hoverRafPending) return;
    hoverRafPending = true;
    requestAnimationFrame(updateHoverOverlay);
  }

  function updateHoverOverlay() {
    hoverRafPending = false;
    const el = hoverTarget;
    if (!el || !el.isConnected) return;

    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);

    // Position hover overlay
    hoverOverlay.style.display = 'block';
    hoverOverlay.style.left = rect.left + 'px';
    hoverOverlay.style.top = rect.top + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';

    // Box model: margin
    const mt = parseFloat(cs.marginTop), mr = parseFloat(cs.marginRight);
    const mb = parseFloat(cs.marginBottom), ml = parseFloat(cs.marginLeft);
    marginOverlay.style.display = 'block';
    marginOverlay.style.left = (rect.left - ml) + 'px';
    marginOverlay.style.top = (rect.top - mt) + 'px';
    marginOverlay.style.width = (rect.width + ml + mr) + 'px';
    marginOverlay.style.height = (rect.height + mt + mb) + 'px';

    // Box model: padding
    const pt = parseFloat(cs.paddingTop), pr = parseFloat(cs.paddingRight);
    const pb = parseFloat(cs.paddingBottom), pl = parseFloat(cs.paddingLeft);
    const bt = parseFloat(cs.borderTopWidth), br2 = parseFloat(cs.borderRightWidth);
    const bb = parseFloat(cs.borderBottomWidth), bl = parseFloat(cs.borderLeftWidth);
    paddingOverlay.style.display = 'block';
    paddingOverlay.style.left = (rect.left + bl) + 'px';
    paddingOverlay.style.top = (rect.top + bt) + 'px';
    paddingOverlay.style.width = (rect.width - bl - br2) + 'px';
    paddingOverlay.style.height = (rect.height - bt - bb) + 'px';

    // Tooltip
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    const dmId = el.__dmId ? ` [#${el.__dmId}]` : '';
    const dims = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    tooltip.textContent = `${tag}${id}${cls}${dmId} — ${dims}`;
    tooltip.style.display = 'block';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = Math.max(0, rect.top - 28) + 'px';
  }

  // ─── Click Handling (Select + Annotate) ─────────────────────
  let currentAnnotationId = null;

  function handleClick(e) {
    if (!state.active) return;
    if (e.target.closest('#__design-mode-root')) return;

    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const dmId = el.__dmId;

    if (!dmId || !state.elements.has(dmId)) return;

    const entry = state.elements.get(dmId);

    if (e.shiftKey) {
      // Multi-select toggle
      entry.selected = !entry.selected;
    } else {
      // Single select — deselect others
      state.elements.forEach((ent, id) => {
        if (id !== dmId) ent.selected = false;
      });
      entry.selected = true;

      // Show annotation panel
      showAnnotationPanel(dmId, el);
    }
  }

  function showAnnotationPanel(dmId, el) {
    currentAnnotationId = dmId;
    annotationTriggerEl = document.activeElement; // remember what had focus
    const rect = el.getBoundingClientRect();
    const entry = state.elements.get(dmId);

    annotationTitle.textContent = entry.componentName ? `${entry.componentName}` : `<${entry.tagName}>`;
    annotationTitle.title = `Element #${dmId} — <${entry.tagName}>${entry.componentName ? ' (' + entry.componentName + ')' : ''}`;
    // textContent is already safe — no innerHTML here
    annotationInput.value = entry.annotation || '';

    // Position panel near element using actual panel dimensions
    annotationPanel.style.display = 'block';
    annotationPanel.style.opacity = '0';
    annotationPanel.style.transform = 'scale(0.95)';
    const panelW = annotationPanel.offsetWidth;
    const panelH = annotationPanel.offsetHeight;
    let left = rect.right + 12;
    let top = rect.top;
    if (left + panelW > window.innerWidth) left = rect.left - panelW - 12;
    if (left < 0) left = 12;
    if (top + panelH > window.innerHeight) top = window.innerHeight - panelH - 12;

    annotationPanel.style.left = left + 'px';
    annotationPanel.style.top = top + 'px';

    animateIn(annotationPanel, { opacity: '0', transform: 'scale(0.97)' }, { opacity: '1', transform: 'scale(1)' }, 350);
    setTimeout(() => annotationInput.focus(), 50);
  }

  function saveAnnotation() {
    if (currentAnnotationId === null) return;
    const comment = annotationInput.value.trim();
    const entry = state.elements.get(currentAnnotationId);

    if (entry && comment) {
      entry.annotation = comment;

      // Add to annotations list
      const existing = state.annotations.findIndex(a => a.elementId === currentAnnotationId);
      const annotationEntry = {
        elementId: currentAnnotationId,
        comment: comment,
        selector: entry.selector,
        tagName: entry.tagName,
        componentName: entry.componentName,
        sourceFile: entry.sourceFile,
        sourceLineNumber: entry.sourceLineNumber,
        timestamp: new Date().toISOString(),
      };
      if (existing >= 0) {
        state.annotations[existing] = annotationEntry;
      } else {
        state.annotations.push(annotationEntry);
      }

      // Create or update pin
      if (!entry._pin) createPin(currentAnnotationId);
      else entry._pin.title = comment;
    } else if (entry && !comment) {
      entry.annotation = null;
      removePin(currentAnnotationId);
      state.annotations = state.annotations.filter(a => a.elementId !== currentAnnotationId);
    }

    closeAnnotationPanel();
    renderAnnotationsList();
  }

  function closeAnnotationPanel() {
    animateOut(annotationPanel, { opacity: '0', transform: 'scale(0.97)' }, 250, () => {
      annotationPanel.style.display = 'none';
    });
    currentAnnotationId = null;
    if (annotationTriggerEl && annotationTriggerEl.focus) annotationTriggerEl.focus();
    annotationTriggerEl = null;
  }

  function cancelAnnotation() {
    closeAnnotationPanel();
  }

  // ─── Annotation Pins (visual markers on annotated elements) ──
  function createPin(elementId) {
    const entry = state.elements.get(elementId);
    if (!entry || !entry._el.isConnected) return null;
    const rect = entry._el.getBoundingClientRect();
    const pin = document.createElement('div');
    pin.className = '__dm-pin';
    pin.dataset.dmId = elementId;
    pin.setAttribute('role', 'button');
    pin.setAttribute('aria-label', 'Edit annotation for element #' + elementId);
    pin.setAttribute('tabindex', '0');
    pin.style.cssText = `
      position:fixed;left:${rect.right - 12}px;top:${rect.top - 12}px;
      width:24px;height:24px;background:${T.accent};border:2px solid ${T.bg};
      border-radius:50%;pointer-events:auto;cursor:pointer;
      box-shadow:${T.shadowPin}, ${T.accentGlow};z-index:${OVERLAY_Z + 1};
      display:flex;align-items:center;justify-content:center;
      font:bold 10px ${T.font};color:white;
      transition:${transition('transform 0.15s')};
    `;
    const pinIndex = state.annotations.findIndex(a => a.elementId === elementId);
    pin.textContent = String(pinIndex >= 0 ? pinIndex + 1 : state.annotations.length + 1);
    pin.title = entry.annotation || '';
    const activatePin = (e) => {
      e.stopPropagation();
      showAnnotationPanel(elementId, entry._el);
    };
    pin.addEventListener('click', activatePin);
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activatePin(e); }
    });
    pin.addEventListener('mouseenter', () => { pin.style.transform = 'scale(1.3)'; });
    pin.addEventListener('mouseleave', () => { pin.style.transform = 'scale(1)'; });
    pinContainer.appendChild(pin);
    // Pop-in animation
    animateIn(pin, { transform: 'scale(0)', opacity: '0' }, { transform: 'scale(1)', opacity: '1' }, 400);
    entry._pin = pin;
    return pin;
  }

  function removePin(elementId) {
    const entry = state.elements.get(elementId);
    if (entry && entry._pin) {
      entry._pin.remove();
      entry._pin = null;
    }
  }

  function updatePinPositions() {
    state.annotations.forEach((a) => {
      const entry = state.elements.get(a.elementId);
      if (entry && entry._pin && entry._el.isConnected) {
        const rect = entry._el.getBoundingClientRect();
        entry._pin.style.left = (rect.right - 12) + 'px';
        entry._pin.style.top = (rect.top - 12) + 'px';
      }
    });
  }

  // ─── Annotations List Rendering ─────────────────────────────
  function renderAnnotationsList() {
    listBody.innerHTML = '';
    countBadge.textContent = state.annotations.length;

    if (state.annotations.length === 0) {
      listEmpty.style.display = 'block';
      return;
    }
    listEmpty.style.display = 'none';

    state.annotations.forEach((a, idx) => {
      const entry = state.elements.get(a.elementId);
      const item = document.createElement('div');
      item.style.cssText = `
        padding:10px 14px;border-bottom:1px solid ${T.borderFaint};
        cursor:pointer;transition:${transition('background 0.1s')};
      `;
      item.addEventListener('mouseenter', () => { item.style.background = T.hoverBgSubtle; });
      item.addEventListener('mouseleave', () => { item.style.background = 'none'; });

      const tag = a.tagName || '?';
      const comp = a.componentName ? ` (${a.componentName})` : '';
      const text = entry ? (entry.text || '').slice(0, 40) : '';

      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="color:${T.textMuted};font-size:11px;font-weight:600;margin-bottom:3px;">
              &lt;${esc(tag)}&gt;${esc(comp)}
            </div>
            <div style="color:${T.text};font-size:12px;margin-bottom:4px;word-break:break-word;">${esc(a.comment)}</div>
            ${text ? `<div style="color:${T.textMuted};font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">"${esc(text)}"</div>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="__dm-list-edit" data-idx="${idx}" style="background:${T.bgInset};color:${T.accent};border:1px solid ${T.border};border-radius:${T.radiusPill};padding:3px 8px;cursor:pointer;font-size:10px;box-shadow:${T.shadowInset};">Edit</button>
            <button class="__dm-list-delete" data-idx="${idx}" style="background:${T.bgInset};color:${T.danger};border:1px solid ${T.border};border-radius:${T.radiusPill};padding:3px 8px;cursor:pointer;font-size:10px;box-shadow:${T.shadowInset};">Del</button>
          </div>
        </div>
      `;

      // Click item to highlight element
      item.addEventListener('click', (e) => {
        if (e.target.closest('.__dm-list-edit') || e.target.closest('.__dm-list-delete')) return;
        if (entry && entry._el.isConnected) {
          entry._el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Flash the hover overlay on it
          const rect = entry._el.getBoundingClientRect();
          hoverOverlay.style.display = 'block';
          hoverOverlay.style.left = rect.left + 'px';
          hoverOverlay.style.top = rect.top + 'px';
          hoverOverlay.style.width = rect.width + 'px';
          hoverOverlay.style.height = rect.height + 'px';
          hoverOverlay.style.borderColor = T.text;
          setTimeout(() => { hoverOverlay.style.borderColor = T.accent; }, 1500);
        }
      });

      listBody.appendChild(item);
    });

    // Wire edit/delete buttons
    listBody.querySelectorAll('.__dm-list-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const a = state.annotations[idx];
        if (a) {
          const entry = state.elements.get(a.elementId);
          if (entry && entry._el.isConnected) {
            entry._el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => showAnnotationPanel(a.elementId, entry._el), 300);
          }
        }
      });
    });

    listBody.querySelectorAll('.__dm-list-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const a = state.annotations[idx];
        if (a) {
          const entry = state.elements.get(a.elementId);
          if (entry) {
            entry.annotation = null;
            entry.selected = false;
            removePin(a.elementId);
          }
          state.annotations.splice(idx, 1);
          renderAnnotationsList();
          showToast('Annotation deleted');
        }
      });
    });
  }

  let listPanelOpen = false;
  function toggleListPanel() {
    if (!listPanelOpen) {
      listPanel.style.display = 'block';
      animateIn(listPanel, { opacity: '0', transform: 'translateX(12px)' }, { opacity: '1', transform: 'translateX(0)' }, 400);
      renderAnnotationsList();
      listPanelOpen = true;
    } else {
      animateOut(listPanel, { opacity: '0', transform: 'translateX(12px)' }, 280, () => {
        listPanel.style.display = 'none';
      });
      listPanelOpen = false;
    }
  }

  // ─── Copy to Claude ─────────────────────────────────────────
  function copyToClipboard() {
    if (state.annotations.length === 0) {
      showToast('No annotations to copy');
      return;
    }

    let text = '## Design Mode Annotations\n\n';
    text += `Viewport: ${state.viewport.width}x${state.viewport.height}\n\n`;

    state.annotations.forEach(a => {
      const entry = state.elements.get(a.elementId);
      text += `### Element #${a.elementId}\n`;
      text += `- **Tag**: \`<${a.tagName}>\`\n`;
      text += `- **Selector**: \`${a.selector}\`\n`;
      if (a.componentName) text += `- **Component**: ${a.componentName}\n`;
      if (a.sourceFile) text += `- **Source**: ${a.sourceFile}${a.sourceLineNumber ? ':' + a.sourceLineNumber : ''}\n`;
      if (entry) {
        text += `- **Current styles**: ${JSON.stringify({
          display: entry.styles.display,
          fontSize: entry.styles.fontSize,
          color: entry.styles.color,
          background: entry.styles.background,
          padding: entry.styles.padding,
          margin: entry.styles.margin,
        })}\n`;
      }
      text += `- **Comment**: ${a.comment}\n\n`;
    });

    text += '\n---\nGenerated by Design Mode plugin for Claude Code\n';

    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied ' + state.annotations.length + ' annotation(s) to clipboard!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      try {
        ta.select();
        document.execCommand('copy');
        showToast('Copied ' + state.annotations.length + ' annotation(s) to clipboard!');
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  // ─── Toast Notification ─────────────────────────────────────
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position:fixed;bottom:20px;left:50%;
      background:${T.bgElevated};color:${T.text};padding:10px 20px;border-radius:${T.radiusPill};
      border:1px solid ${T.border};
      font:12px/1.4 ${T.font};z-index:${PANEL_Z + 1};
      box-shadow:${T.shadowMd};
      pointer-events:none;opacity:0;transform:translateX(-50%) translateY(8px);
    `;
    toast.textContent = msg;
    root.appendChild(toast);
    animateIn(toast,
      { opacity: '0', transform: 'translateX(-50%) translateY(8px)' },
      { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
      450
    );
    setTimeout(() => {
      animateOut(toast, { opacity: '0', transform: 'translateX(-50%) translateY(8px)' }, 350, () => { toast.remove(); });
    }, 2500);
  }

  // ─── Viewport Resize ───────────────────────────────────────
  function resizeViewport(width) {
    // We store the requested width; Claude will use the browser MCP to actually resize
    state.viewport.requestedWidth = width;
    showToast('Viewport resize requested: ' + width + 'px — Claude will apply via browser tools');
  }

  // ─── Toggle Visibility ──────────────────────────────────────
  const toggleBtn = toolbar.querySelector('#__dm-btn-toggle');
  function toggle() {
    state.active = !state.active;
    root.style.display = state.active ? '' : 'none';
    toggleBtn.style.background = T.bgInset;
    if (state.active) {
      toggleBtn.textContent = 'Hide';
      toggleBtn.style.color = T.textMuted;
    } else {
      toggleBtn.textContent = 'Show';
      toggleBtn.style.color = T.accent;
    }
    toolbar.style.display = 'flex';
  }
  state._toggle = toggle;

  // ─── Destroy ────────────────────────────────────────────────
  function destroy() {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('scroll', scheduleUpdateRects, true);
    window.removeEventListener('resize', scheduleUpdateRects);
    root.remove();
    delete window.__designMode;
  }
  state._destroy = destroy;
  state._refresh = scanElements;
  state._getSourceInfo = getSourceInfo;

  // ─── Keyboard Element Navigation ─────────────────────────────
  let keyNavIndex = -1; // index into the sorted element IDs array

  function getElementIds() {
    return Array.from(state.elements.keys());
  }

  function highlightKeyNavElement(id) {
    const entry = state.elements.get(id);
    if (!entry || !entry._el.isConnected) return;
    entry._el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = entry._el.getBoundingClientRect();
    hoverOverlay.style.display = 'block';
    hoverOverlay.style.left = rect.left + 'px';
    hoverOverlay.style.top = rect.top + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
    hoverOverlay.style.borderColor = T.text;

    // Update tooltip
    const tag = entry.tagName;
    const elId = entry.id ? '#' + entry.id : '';
    const cls = entry.classes.length ? '.' + entry.classes.slice(0, 2).join('.') : '';
    tooltip.textContent = `${tag}${elId}${cls} [#${id}] — ${Math.round(rect.width)}x${Math.round(rect.height)} (keyboard)`;
    tooltip.style.display = 'block';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = Math.max(0, rect.top - 28) + 'px';
  }

  // ─── Keyboard Shortcuts ─────────────────────────────────────
  function handleKeyDown(e) {
    // Ctrl+Shift+D to toggle
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      toggle();
      return;
    }
    // Don't handle nav keys when focus is in annotation panel or other inputs
    const inPanel = annotationPanel.style.display !== 'none' && annotationPanel.contains(document.activeElement);

    // Escape to close annotation panel
    if (e.key === 'Escape') {
      if (annotationPanel.style.display !== 'none') {
        cancelAnnotation();
        return;
      }
      // Also clear keyboard nav highlight
      if (keyNavIndex >= 0) {
        keyNavIndex = -1;
        hoverOverlay.style.display = 'none';
        tooltip.style.display = 'none';
        hoverOverlay.style.borderColor = T.accent;
      }
    }
    // Enter in annotation saves
    if (e.key === 'Enter' && !e.shiftKey && inPanel) {
      if (document.activeElement === annotationInput) {
        e.preventDefault();
        saveAnnotation();
      }
      return;
    }
    // Arrow key navigation through elements (only when not in an input)
    if (!state.active || inPanel) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    const ids = getElementIds();
    if (ids.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      keyNavIndex = (keyNavIndex + 1) % ids.length;
      highlightKeyNavElement(ids[keyNavIndex]);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      keyNavIndex = (keyNavIndex - 1 + ids.length) % ids.length;
      highlightKeyNavElement(ids[keyNavIndex]);
    } else if (e.key === 'Enter' && keyNavIndex >= 0) {
      e.preventDefault();
      const id = ids[keyNavIndex];
      const entry = state.elements.get(id);
      if (entry && entry._el.isConnected) {
        // Select and open annotation panel
        state.elements.forEach((ent, eid) => { if (eid !== id) ent.selected = false; });
        entry.selected = true;
        showAnnotationPanel(id, entry._el);
      }
    }
  }

  // ─── Event Binding ──────────────────────────────────────────
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

  // Toolbar + panel button wiring
  function onClick(el, fn) {
    el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }

  // Tools dropdown
  const toolsBtn = toolbar.querySelector('#__dm-btn-tools');
  const toolsMenu = toolbar.querySelector('#__dm-tools-menu');
  let toolsMenuOpen = false;

  function toggleToolsMenu() {
    toolsMenuOpen = !toolsMenuOpen;
    toolsBtn.setAttribute('aria-expanded', String(toolsMenuOpen));
    if (toolsMenuOpen) {
      toolsMenu.style.display = 'block';
      animateIn(toolsMenu, { opacity: '0', transform: 'translateY(-4px)' }, { opacity: '1', transform: 'translateY(0)' }, 220);
    } else {
      animateOut(toolsMenu, { opacity: '0', transform: 'translateY(-4px)' }, 160, () => {
        toolsMenu.style.display = 'none';
      });
    }
  }
  onClick(toolsBtn, toggleToolsMenu);

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    if (toolsMenuOpen) toggleToolsMenu();
  });

  // Menu item hover styles
  toolsMenu.querySelectorAll('button').forEach(item => {
    item.addEventListener('mouseenter', () => { item.style.background = T.hoverBg; });
    item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
  });

  onClick(toolbar.querySelector('#__dm-btn-refresh'), () => {
    scanElements();
    showToast('Rescanned: ' + state.elements.size + ' elements found');
    if (toolsMenuOpen) toggleToolsMenu();
  });
  onClick(toolbar.querySelector('#__dm-btn-375'), () => { resizeViewport(375); if (toolsMenuOpen) toggleToolsMenu(); });
  onClick(toolbar.querySelector('#__dm-btn-768'), () => { resizeViewport(768); if (toolsMenuOpen) toggleToolsMenu(); });
  onClick(toolbar.querySelector('#__dm-btn-1280'), () => { resizeViewport(1280); if (toolsMenuOpen) toggleToolsMenu(); });
  onClick(toolbar.querySelector('#__dm-btn-reset'), () => {
    state.viewport.requestedWidth = null;
    showToast('Viewport reset requested');
    if (toolsMenuOpen) toggleToolsMenu();
  });
  onClick(toolbar.querySelector('#__dm-btn-list'), toggleListPanel);
  onClick(toolbar.querySelector('#__dm-btn-copy'), copyToClipboard);
  onClick(toggleBtn, toggle);
  onClick(annotationPanel.querySelector('#__dm-annotation-save'), saveAnnotation);
  onClick(annotationPanel.querySelector('#__dm-annotation-cancel'), cancelAnnotation);
  onClick(listPanel.querySelector('#__dm-list-close'), () => {
    if (listPanelOpen) {
      animateOut(listPanel, { opacity: '0', transform: 'translateX(12px)' }, 280, () => {
        listPanel.style.display = 'none';
      });
      listPanelOpen = false;
    }
  });

  // ─── Update element rects on scroll/resize (rAF-throttled) ──
  let rectRafPending = false;
  function updateElementRects() {
    state.elements.forEach((entry) => {
      const el = entry._el;
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      entry.rect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    });
    updatePinPositions();
    // Reposition hover overlay to follow the element during scroll
    if (hoverTarget && hoverTarget.isConnected) {
      updateHoverOverlay();
    } else if (hoverTarget) {
      hoverOverlay.style.display = 'none';
      marginOverlay.style.display = 'none';
      paddingOverlay.style.display = 'none';
      tooltip.style.display = 'none';
      hoverTarget = null;
      hoveredEl = null;
    }
    state.viewport = { width: window.innerWidth, height: window.innerHeight };
  }
  function scheduleUpdateRects() {
    if (rectRafPending) return;
    rectRafPending = true;
    requestAnimationFrame(() => {
      rectRafPending = false;
      updateElementRects();
    });
  }

  window.addEventListener('scroll', scheduleUpdateRects, { passive: true, capture: true });
  window.addEventListener('resize', scheduleUpdateRects, { passive: true });

  // ─── Button Hover Micro-interactions ─────────────────────────
  function addButtonHover(btn) {
    if (!btn || prefersReducedMotion) return;
    btn.style.transition = `background 150ms ${EASE_OUT_QUART}, color 150ms ${EASE_OUT_QUART}, transform 100ms ${EASE_OUT_QUART}`;
    btn.addEventListener('mouseenter', () => {
      const isPrimary = btn.id === '__dm-btn-copy';
      if (!isPrimary) btn.style.background = T.hoverBg;
      btn.style.color = T.text;
    });
    btn.addEventListener('mouseleave', () => {
      const isCopy = btn.id === '__dm-btn-copy';
      const isToggle = btn.id === '__dm-btn-toggle';
      btn.style.background = isCopy ? T.accent : T.bgInset;
      btn.style.color = isCopy ? T.textBright : (isToggle ? (state.active ? T.danger : T.success) : T.textMuted);
    });
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.96)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
  }
  // Apply hover to top-level toolbar buttons only (not dropdown menu items)
  ['#__dm-btn-tools', '#__dm-btn-list', '#__dm-btn-copy', '#__dm-btn-toggle'].forEach(sel => {
    addButtonHover(toolbar.querySelector(sel));
  });

  // ─── Initial Scan ───────────────────────────────────────────
  scanElements();
  showToast('Design Mode active — ' + state.elements.size + ' elements found. Ctrl+Shift+D to toggle.');

  // ─── Toolbar Entrance Animation ─────────────────────────────
  animateIn(toolbar, { opacity: '0', transform: 'translateY(-12px)' }, { opacity: '1', transform: 'translateY(0)' }, 700);

})();
