#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import CDP from "chrome-remote-interface";
import WebSocket from "ws";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERLAY_PATH = join(__dirname, "overlay.js");

// ─── Chrome Port Discovery ───────────────────────────────────
const CHROME_PROFILE_PATHS = [
  join(homedir(), "Library", "Application Support", "Google", "Chrome", "DevToolsActivePort"),
  join(homedir(), "Library", "Application Support", "Google", "Chrome Canary", "DevToolsActivePort"),
  join(homedir(), ".config", "google-chrome", "DevToolsActivePort"),
  join(homedir(), ".config", "chromium", "DevToolsActivePort"),
  join(homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "DevToolsActivePort"),
];

function discoverChrome() {
  for (const filePath of CHROME_PROFILE_PATHS) {
    try {
      if (existsSync(filePath)) {
        const lines = readFileSync(filePath, "utf-8").trim().split("\n");
        const port = parseInt(lines[0], 10);
        const wsPath = lines[1];
        if (port > 0 && port < 65536) return { port, wsPath };
      }
    } catch {}
  }
  return null;
}

// ─── Raw WebSocket CDP Client ────────────────────────────────
// For chrome://inspect connections where HTTP /json endpoints
// aren't available and direct page WebSocket gets 403.
// Uses Target.attachToTarget with flatten:true for session-based access.

class RawCDPClient {
  constructor(ws, sessionId) {
    this._ws = ws;
    this._sessionId = sessionId;
    this._nextId = 1;
    this._pending = new Map();

    this._ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && this._pending.has(msg.id)) {
          const { resolve, reject } = this._pending.get(msg.id);
          this._pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result || {});
        }
      } catch {
        // ignore parse errors
      }
    });
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 15000);
      this._pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      const msg = { id, method, params };
      if (this._sessionId) msg.sessionId = this._sessionId;
      this._ws.send(JSON.stringify(msg));
    });
  }

  // Provide the same interface as chrome-remote-interface
  get Runtime() {
    return {
      enable: () => this._send("Runtime.enable"),
      evaluate: (params) => this._send("Runtime.evaluate", params),
    };
  }
  get Page() {
    return {
      enable: () => this._send("Page.enable"),
      navigate: (params) => this._send("Page.navigate", params),
      loadEventFired: () =>
        new Promise((resolve) => {
          const handler = (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.method === "Page.loadEventFired") {
                this._ws.removeListener("message", handler);
                resolve();
              }
            } catch {}
          };
          this._ws.on("message", handler);
          setTimeout(() => {
            this._ws.removeListener("message", handler);
            resolve();
          }, 30000);
        }),
      captureScreenshot: (params) =>
        this._send("Page.captureScreenshot", params),
    };
  }
  get Emulation() {
    return {
      setDeviceMetricsOverride: (params) =>
        this._send("Emulation.setDeviceMetricsOverride", params),
      clearDeviceMetricsOverride: () =>
        this._send("Emulation.clearDeviceMetricsOverride"),
    };
  }
  get Target() {
    return {
      getTargets: () => this._send("Target.getTargets"),
      attachToTarget: (params) =>
        this._send("Target.attachToTarget", params),
    };
  }

  close() {
    try {
      this._ws.close();
    } catch {}
  }
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("WebSocket timeout")), 5000);
  });
}

async function connectViaAttach(port, wsPath) {
  // Connect to browser-level WebSocket
  const wsUrl = `ws://127.0.0.1:${port}${wsPath}`;
  const ws = await connectWebSocket(wsUrl);
  const browser = new RawCDPClient(ws, null);

  // Find a page target
  const { targetInfos } = await browser.Target.getTargets();
  const page = targetInfos.find(
    (t) =>
      t.type === "page" &&
      !t.url.startsWith("chrome") &&
      !t.url.startsWith("devtools") &&
      !t.url.startsWith("about:blank")
  );

  if (!page) {
    browser.close();
    throw new Error("No suitable page target found");
  }

  // Attach to the page with flatten:true for session-based messaging
  const { sessionId } = await browser.Target.attachToTarget({
    targetId: page.targetId,
    flatten: true,
  });

  // Create a session-scoped client
  const pageClient = new RawCDPClient(ws, sessionId);
  await pageClient.Runtime.enable();
  await pageClient.Page.enable();
  return pageClient;
}

// ─── State ────────────────────────────────────────────────────
let client = null;
let isActivated = false;

async function getClient() {
  // Check if existing connection still works
  if (client) {
    try {
      await client.Runtime.evaluate({ expression: "1" });
      return client;
    } catch {
      client = null;
      isActivated = false; // page likely changed — overlay is gone
    }
  }

  const discovered = discoverChrome();

  // Strategy 1: Raw WebSocket + Target.attachToTarget (chrome://inspect method)
  let lastError;
  if (discovered?.wsPath) {
    try {
      client = await connectViaAttach(discovered.port, discovered.wsPath);
      return client;
    } catch (err) {
      lastError = err;
    }
  }

  // Strategy 2: Standard CDP HTTP (--remote-debugging-port method)
  const ports = [];
  if (process.env.CDP_PORT) ports.push(parseInt(process.env.CDP_PORT, 10));
  if (discovered) ports.push(discovered.port);
  ports.push(9222, 9229, 9333);

  for (const port of [...new Set(ports)]) {
    try {
      const c = await CDP({ port });
      await c.Runtime.enable();
      await c.Page.enable();
      client = c;
      return client;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    "Cannot connect to Chrome.\n" +
      "1. Enable remote debugging at chrome://inspect/#remote-debugging\n" +
      "2. Or launch Chrome with: chrome --remote-debugging-port=9222\n" +
      (lastError ? "Last error: " + lastError.message : "")
  );
}

async function evalInBrowser(expression) {
  const c = await getClient();
  const result = await c.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description || "Eval error"
    );
  }
  return result.result.value;
}

// ─── MCP Server ───────────────────────────────────────────────
const server = new McpServer({
  name: "design-mode",
  version: "1.0.0",
});

// ─── Tool: activate ───────────────────────────────────────────
server.tool(
  "activate",
  "Inject the Design Mode overlay into the current browser page. Shows hover highlights, click-to-select, annotation panels, and a toolbar.",
  {
    url: z
      .string()
      .optional()
      .describe(
        "Optional URL to navigate to before injecting. If omitted, injects on current page."
      ),
  },
  async ({ url }) => {
    try {
      const c = await getClient();

      if (url) {
        await c.Page.navigate({ url });
        await c.Page.loadEventFired();
      }

      if (!existsSync(OVERLAY_PATH)) {
        return {
          content: [{ type: "text", text: `Overlay script not found at: ${OVERLAY_PATH}` }],
          isError: true,
        };
      }
      const overlayCode = readFileSync(OVERLAY_PATH, "utf-8");
      await c.Runtime.evaluate({
        expression: overlayCode,
        returnByValue: true,
      });

      isActivated = true;

      const elementCount = await evalInBrowser(
        "window.__designMode ? window.__designMode.elements.size : 0"
      );

      return {
        content: [
          {
            type: "text",
            text: `Design Mode activated. ${elementCount} elements detected.\n\nControls:\n- Hover to highlight elements with box model visualization\n- Click to select and annotate\n- Shift+click for multi-select\n- Ctrl+Shift+D to toggle visibility\n- Use "Copy to Claude" button to export annotations`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to activate: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: deactivate ─────────────────────────────────────────
server.tool(
  "deactivate",
  "Remove the Design Mode overlay from the page.",
  {},
  async () => {
    try {
      await evalInBrowser(
        "window.__designMode && window.__designMode._destroy()"
      );
      isActivated = false;
      return {
        content: [{ type: "text", text: "Design Mode deactivated." }],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to deactivate: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: read_annotations ───────────────────────────────────
server.tool(
  "read_annotations",
  "Read all user annotations from the Design Mode overlay. Returns element selectors, styles, source file info, user comments, AND a cropped screenshot of each annotated element for visual context.",
  {
    include_screenshots: z
      .boolean()
      .optional()
      .describe(
        "Include a cropped screenshot of each annotated element (default: true)"
      ),
  },
  async ({ include_screenshots }) => {
    const withScreenshots = include_screenshots !== false;
    try {
      const data = await evalInBrowser(
        "JSON.stringify(window.__designMode ? window.__designMode._dump() : { error: 'Design Mode not active' })"
      );
      const parsed = JSON.parse(data);

      if (parsed.error) {
        return {
          content: [{ type: "text", text: JSON.stringify(parsed) }],
          isError: true,
        };
      }

      const content = [{ type: "text", text: data }];

      if (withScreenshots && parsed.annotations?.length > 0) {
        const c = await getClient();
        for (const annotation of parsed.annotations) {
          try {
            const rectJson = await evalInBrowser(`
              JSON.stringify((() => {
                const el = document.querySelector(${JSON.stringify(annotation.selector)});
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16, scale: window.devicePixelRatio || 1 };
              })())
            `);
            const clip = JSON.parse(rectJson);
            if (clip && clip.width > 0 && clip.height > 0) {
              const { data: imgData } = await c.Page.captureScreenshot({
                format: "png",
                clip: { ...clip, scale: clip.scale },
              });
              content.push({
                type: "text",
                text: `\n--- Screenshot: ${annotation.selector} (comment: "${annotation.comment}") ---`,
              });
              content.push({
                type: "image",
                data: imgData,
                mimeType: "image/png",
              });
            }
          } catch {
            // Skip screenshot for this element if it fails
          }
        }
      }

      return { content };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to read annotations: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: read_element ───────────────────────────────────────
server.tool(
  "read_element",
  "Read detailed info about a specific element by CSS selector. Returns computed styles, box model, source file mapping, and text content.",
  {
    selector: z.string().describe("CSS selector of the element to inspect"),
  },
  async ({ selector }) => {
    try {
      const data = await evalInBrowser(`
        JSON.stringify((() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'Element not found: ${selector}' };
          const cs = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const sourceInfo = window.__designMode?._getSourceInfo?.(el) || null;
          return {
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: el.className && typeof el.className === 'string' ? el.className.trim().split(/\\s+/) : [],
            text: (el.textContent || '').trim().slice(0, 200),
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            styles: {
              display: cs.display, position: cs.position,
              width: cs.width, height: cs.height,
              margin: cs.margin, padding: cs.padding,
              color: cs.color, background: cs.backgroundColor,
              fontSize: cs.fontSize, fontWeight: cs.fontWeight,
              borderRadius: cs.borderRadius, gap: cs.gap,
              flexDirection: cs.flexDirection, justifyContent: cs.justifyContent,
              alignItems: cs.alignItems,
            },
            sourceFile: sourceInfo?.fileName || null,
            componentName: sourceInfo?.componentName || null,
            framework: sourceInfo?.framework || null,
          };
        })())
      `);
      return { content: [{ type: "text", text: data }] };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to read element: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: apply_style ────────────────────────────────────────
server.tool(
  "apply_style",
  "Apply temporary CSS styles to an element in the browser for visual previewing. Styles are inline and not persisted to source code.",
  {
    selector: z.string().describe("CSS selector of the element"),
    styles: z
      .record(z.string())
      .describe(
        'Object of CSS property-value pairs, e.g. {"fontSize": "20px", "color": "red"}'
      ),
    revert: z
      .boolean()
      .optional()
      .describe("If true, revert to original styles instead of applying new ones"),
  },
  async ({ selector, styles, revert }) => {
    try {
      if (revert) {
        const result = await evalInBrowser(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return 'Element not found';
            if (el.__dmOriginalStyle !== undefined) {
              el.setAttribute('style', el.__dmOriginalStyle);
              delete el.__dmOriginalStyle;
              return 'Reverted to original styles';
            }
            return 'No original styles stored';
          })()
        `);
        return { content: [{ type: "text", text: result }] };
      }

      const result = await evalInBrowser(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return 'Element not found';
          if (!el.__dmOriginalStyle) el.__dmOriginalStyle = el.getAttribute('style') || '';
          Object.assign(el.style, ${JSON.stringify(styles)});
          return 'Styles applied: ' + JSON.stringify(${JSON.stringify(styles)});
        })()
      `);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to apply styles: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: screenshot ─────────────────────────────────────────
server.tool(
  "screenshot",
  "Take a screenshot of the current page or a specific element. Returns base64-encoded PNG.",
  {
    selector: z
      .string()
      .optional()
      .describe(
        "CSS selector to screenshot a specific element. Omit for full page."
      ),
  },
  async ({ selector }) => {
    try {
      const c = await getClient();

      let clip;
      if (selector) {
        const rect = await evalInBrowser(`
          JSON.stringify((() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.left, y: r.top, width: r.width, height: r.height, scale: window.devicePixelRatio || 1 };
          })())
        `);
        clip = JSON.parse(rect);
        if (!clip) {
          return {
            content: [{ type: "text", text: `Element not found: ${selector}` }],
            isError: true,
          };
        }
      }

      const { data } = await c.Page.captureScreenshot({
        format: "png",
        ...(clip ? { clip } : {}),
      });

      return {
        content: [{ type: "image", data, mimeType: "image/png" }],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to screenshot: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: resize_viewport ────────────────────────────────────
server.tool(
  "resize_viewport",
  "Resize the browser viewport to test responsive layouts.",
  {
    width: z.number().describe("Viewport width in pixels"),
    height: z
      .number()
      .optional()
      .describe("Viewport height in pixels (default: 900)"),
  },
  async ({ width, height = 900 }) => {
    try {
      const c = await getClient();
      await c.Emulation.setDeviceMetricsOverride({
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });

      if (isActivated) {
        await evalInBrowser(
          "window.__designMode && window.__designMode._refresh()"
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Viewport resized to ${width}x${height}${width < 768 ? " (mobile mode)" : ""}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to resize: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: reset_viewport ─────────────────────────────────────
server.tool(
  "reset_viewport",
  "Reset the viewport to the browser's default size.",
  {},
  async () => {
    try {
      const c = await getClient();
      await c.Emulation.clearDeviceMetricsOverride();
      return {
        content: [{ type: "text", text: "Viewport reset to default." }],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to reset viewport: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: eval_js ────────────────────────────────────────────
server.tool(
  "eval_js",
  "Execute JavaScript in the browser page context. WARNING: Code runs with full page privileges (cookies, localStorage, DOM, network). Use only for debugging or Design Mode interactions — never with untrusted input.",
  {
    code: z.string().describe("JavaScript code to execute in the browser"),
  },
  async ({ code }) => {
    try {
      const result = await evalInBrowser(code);
      return {
        content: [
          {
            type: "text",
            text:
              result !== undefined ? String(result) : "(no return value)",
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Eval error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Start ────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
