// Minimal Chrome DevTools Protocol driver for headless Edge/Chrome. No
// dependencies: Node 22's built-in WebSocket and fetch are enough.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSERS = [
  process.env.GRAPHENE_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1600, height = 1000, headless = true, port = 9333 } = {}) {
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error("No Edge/Chrome found. Set GRAPHENE_BROWSER to a Chromium-based browser executable.");
  const profile = mkdtempSync(join(tmpdir(), "graphene-e2e-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-features=msEdgeSidebarV2,LocalNetworkAccessChecks",
    "--force-device-scale-factor=1",
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const proc = spawn(exe, args, { stdio: "ignore" });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(150);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      // browser still starting
    }
  }
  if (!target) throw new Error("Browser did not expose a DevTools target.");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message} ${data.error.data ?? ""}`));
      else resolve(data.result);
    } else if (data.method) {
      for (const fn of listeners.get(data.method) ?? []) fn(data.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method).delete(fn);
  };
  const once = (method, timeout = 30000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      const off = on(method, (p) => {
        clearTimeout(t);
        off();
        resolve(p);
      });
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const consoleErrors = [];
  on("Runtime.exceptionThrown", (p) => consoleErrors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
  on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(" "));
  });

  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`Evaluate failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n  in: ${expression.slice(0, 200)}`);
    return r.result.value;
  }

  async function waitFor(expression, { timeout = 30000, interval = 100, label } = {}) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
      try {
        last = await evaluate(expression);
        if (last) return last;
      } catch (e) {
        last = e.message;
      }
      await sleep(interval);
    }
    throw new Error(`Timed out waiting for ${label ?? expression} (last: ${JSON.stringify(last)})`);
  }

  const mouse = (type, x, y, opts = {}) =>
    send("Input.dispatchMouseEvent", { type, x, y, button: opts.button ?? "left", buttons: opts.buttons ?? (type === "mouseReleased" ? 0 : 1), clickCount: opts.clickCount ?? 1, modifiers: opts.modifiers ?? 0 });

  async function click(x, y, opts = {}) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0, modifiers: opts.modifiers ?? 0 });
    await mouse("mousePressed", x, y, opts);
    await mouse("mouseReleased", x, y, opts);
  }

  async function dblclick(x, y) {
    await click(x, y, { clickCount: 1 });
    await mouse("mousePressed", x, y, { clickCount: 2 });
    await mouse("mouseReleased", x, y, { clickCount: 2 });
  }

  async function drag(x1, y1, x2, y2, { steps = 12, modifiers = 0 } = {}) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1, buttons: 0, modifiers });
    await mouse("mousePressed", x1, y1, { modifiers });
    for (let i = 1; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 1, button: "left", modifiers });
      await sleep(10);
    }
    await mouse("mouseReleased", x2, y2, { modifiers });
    await sleep(50);
  }

  const KEYS = {
    Escape: 27, Enter: 13, Delete: 46, Backspace: 8, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  };
  // modifiers: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift
  async function key(k, modifiers = 0) {
    const isChar = k.length === 1;
    const code = KEYS[k] ?? (isChar ? k.toUpperCase().charCodeAt(0) : 0);
    const base = { key: k, code: isChar ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
    await send("Input.dispatchKeyEvent", { type: isChar && !(modifiers & 2) ? "keyDown" : "rawKeyDown", ...base, text: isChar && !(modifiers & 2) ? k : undefined });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(30);
  }

  const type = (text) => send("Input.insertText", { text });

  async function screenshot(path) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(r.data, "base64"));
  }

  async function setFiles(selector, files) {
    const { root } = await send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`No element for ${selector}`);
    await send("DOM.setFileInputFiles", { nodeId, files });
  }

  /** Run `trigger` (which opens a native file chooser) and answer the chooser with `files`. */
  async function chooseFiles(trigger, files) {
    await send("Page.setInterceptFileChooserDialog", { enabled: true });
    const opened = once("Page.fileChooserOpened");
    await trigger();
    const { backendNodeId } = await opened;
    await send("DOM.setFileInputFiles", { backendNodeId, files });
    await send("Page.setInterceptFileChooserDialog", { enabled: false });
  }

  async function navigate(url) {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url });
    await loaded;
  }

  async function close() {
    try {
      await send("Browser.close");
    } catch {
      proc.kill();
    }
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Edge may still hold a lock on the profile for a moment
    }
  }

  return { send, on, once, evaluate, waitFor, click, dblclick, drag, key, type, screenshot, setFiles, chooseFiles, navigate, close, consoleErrors, mouse };
}

export { sleep };
