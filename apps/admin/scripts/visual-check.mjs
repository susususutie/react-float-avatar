/**
 * 浏览器几何验收：在真实浏览器里量取气泡关键几何，和预期表比对，防止渲染漂移。
 *
 * 为什么需要它：jsdom 测试只能断内联样式与结构（`*.test.tsx`），
 * 而字体渲染、antd CSS、真实布局下的右对齐与尾巴间距必须在浏览器里量。
 *
 * 用法：
 *   vp run admin#dev            # 另开终端（工作区根也可用 vp run dev）
 *   node apps/admin/scripts/visual-check.mjs
 *   node apps/admin/scripts/visual-check.mjs --url http://localhost:5173/ --shots /tmp/shots
 *
 * 说明：用一次性 headless Chrome + 临时 profile，不触碰已打开的浏览器；
 * 默认按 5173 / 5174 / 5175 探测本地 dev server，也可用 --url 指定；
 * 任一项超差即非零退出，可直接挂在本地验收流程里。
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const CHROME_PATH = readArg(
  "--chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
);
const SHOTS_DIR = readArg("--shots", null);
const PORT_CANDIDATES = [5173, 5174, 5175];
const VIEWPORT = { width: 1440, height: 900 };

/** 没显式给 --url 时，按候选端口探测本地 dev server */
async function resolveAppUrl() {
  const explicit = readArg("--url", null);
  if (explicit) return explicit;
  for (const port of PORT_CANDIDATES) {
    const url = `http://localhost:${port}/`;
    try {
      await fetch(url, { method: "HEAD" });
      return url;
    } catch {
      /* 试下一个端口 */
    }
  }
  throw new Error(
    `没找到本地 dev server（试过 ${PORT_CANDIDATES.join(" / ")}），先跑 vp run admin#dev，或用 --url 指定`,
  );
}

if (!existsSync(CHROME_PATH)) {
  console.error(`找不到 Chrome：${CHROME_PATH}\n用 --chrome <path> 指定。`);
  process.exit(2);
}

let failures = 0;
let checks = 0;

function check(name, actual, expected, tolerance = 0) {
  checks += 1;
  const ok =
    typeof expected === "number" && typeof actual === "number"
      ? Math.abs(actual - expected) <= tolerance
      : actual === expected;
  if (!ok) failures += 1;
  const mark = ok ? "PASS" : "FAIL";
  console.log(
    `${mark}  ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (期望 ${JSON.stringify(expected)}±${tolerance})`}`,
  );
}

const profile = mkdtempSync(join(tmpdir(), "avatar-visual-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function devToolsPort() {
  const file = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 150; i++) {
    if (existsSync(file)) return Number(readFileSync(file, "utf8").split("\n")[0]);
    await sleep(100);
  }
  throw new Error("Chrome 未生成 DevToolsActivePort");
}

const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const bubbleEl = () => document.querySelector('[role="dialog"], [role="status"]');
  const avatarEl = () =>
    [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).position === "fixed" && d.querySelector('img[alt="AI 助手"]'),
    );
  const round = (value) => +value.toFixed(2);
  const rect = (element) => {
    const r = element.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  };
  const measure = () => {
    const bubble = bubbleEl();
    const avatar = avatarEl();
    if (!bubble || !avatar) return null;
    const card = bubble.firstElementChild;
    const title = card.querySelector("[data-bubble-title]");
    const content = card.querySelector("[data-bubble-content]");
    const closeImg = card.querySelector('button[aria-label="关闭消息"] svg');
    const buttons = [...card.querySelectorAll("button")].filter(
      (button) => button.getAttribute("aria-label") !== "关闭消息",
    );
    const arrow = bubble.lastElementChild;
    const cardRect = rect(card);
    const avatarRect = rect(avatar);
    const arrowRect = rect(arrow);
    const closeRect = closeImg ? rect(closeImg) : null;
    const titleStyle = title ? getComputedStyle(title) : null;
    const contentStyle = content ? getComputedStyle(content) : null;
    return {
      role: bubble.getAttribute("role"),
      cardPadding: getComputedStyle(card).padding,
      cardMaxWidth: getComputedStyle(card).maxWidth,
      cardRadius: getComputedStyle(card).borderRadius,
      cardHeight: round(cardRect.height),
      cardRight: round(cardRect.right),
      avatarRight: round(avatarRect.right),
      title: titleStyle
        ? {
            fontSize: titleStyle.fontSize,
            lineHeight: titleStyle.lineHeight,
            fontWeight: titleStyle.fontWeight,
          }
        : null,
      content: contentStyle
        ? { fontSize: contentStyle.fontSize, lineHeight: contentStyle.lineHeight }
        : null,
      buttons: buttons.map((button) => button.textContent.trim()),
      closeIcon: closeRect
        ? { size: round(closeRect.width), topInset: round(closeRect.y - cardRect.y), rightInset: round(cardRect.right - closeRect.right) }
        : null,
      tailTipGap: round(avatarRect.top - arrowRect.bottom),
      text: bubble.textContent.trim().slice(0, 16),
    };
  };
`;

const SCRIPT = `(async () => {
${HELPERS}
  for (let i = 0; i < 100 && !(bubbleEl() && avatarEl()); i++) await sleep(100);
  const complexMessage = measure();
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "再来一条消息");
  if (!button) return JSON.stringify({ error: "找不到「再来一条消息」按钮（示例页变了？）" });
  button.click();
  await sleep(500);
  const plainMessage = measure();
  return JSON.stringify({ complexMessage, plainMessage, rects: { card: rect(bubbleEl().firstElementChild), avatar: rect(avatarEl()) } });
})()`;

let ws;
let chrome;

try {
  const APP_URL = await resolveAppUrl();
  const appPort = new URL(APP_URL).port;
  chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      APP_URL,
    ],
    { stdio: "ignore" },
  );

  const port = await devToolsPort();
  let page;
  for (let i = 0; i < 80; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((response) => response.json())
      .catch(() => []);
    page = list.find((target) => target.type === "page" && target.url.includes(appPort));
    if (page?.webSocketDebuggerUrl) break;
    await sleep(250);
  }
  if (!page) throw new Error(`打不开页面：${APP_URL}（先跑 vp run admin#dev？）`);

  ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== mid) return;
        ws.removeEventListener("message", onMessage);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      };
      ws.addEventListener("message", onMessage);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await new Promise((resolve) => ws.addEventListener("open", resolve));
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.reload", { ignoreCache: true });
  await sleep(2500);

  const result = await call("Runtime.evaluate", {
    expression: SCRIPT,
    awaitPromise: true,
    returnByValue: true,
  });
  const data = JSON.parse(result.result.value);
  if (data.error) throw new Error(data.error);

  const { complexMessage: complex, plainMessage: plain } = data;

  console.log("\n== 复杂消息（头像 + 标题 + 业务正文 + ok/cancel）==");
  check("role", complex.role, "dialog");
  check("卡片内边距", complex.cardPadding, "24px");
  check("卡片宽度上限", complex.cardMaxWidth, "400px");
  check("卡片圆角", complex.cardRadius, "8px");
  check("卡片高度", complex.cardHeight, 208, 2);
  check("标题字号", complex.title?.fontSize, "14px");
  check("标题行高", complex.title?.lineHeight, "20px");
  check("标题字重", complex.title?.fontWeight, "600");
  check("正文字号", complex.content.fontSize, "14px");
  check("正文行高", complex.content.lineHeight, "20px");
  check("底部按钮文案", complex.buttons.join("|"), "立即处理|稍后再说");
  check("关闭图标尺寸", complex.closeIcon?.size, 12, 0.5);
  check("关闭图标距上", complex.closeIcon?.topInset, 18, 1.5);
  check("关闭图标距右", complex.closeIcon?.rightInset, 21, 1.5);
  check("右对齐（卡片右边缘 = 头像右边缘）", complex.cardRight === complex.avatarRight, true);
  check("尾巴尖到头像", complex.tailTipGap, 16, 0.8);

  console.log('\n== 纯消息（show("文本")）==');
  check("role", plain.role, "status");
  check("卡片内边距", plain.cardPadding, "12px 16px");
  check("卡片宽度上限", plain.cardMaxWidth, "320px");
  check("卡片高度", plain.cardHeight, 46, 2);
  check("正文字号", plain.content.fontSize, "14px");
  check("正文行高", plain.content.lineHeight, "20px");
  check("底部按钮文案", plain.buttons.join("|"), "");
  check("关闭图标尺寸", plain.closeIcon?.size, 12, 0.5);
  check("右对齐（卡片右边缘 = 头像右边缘）", plain.cardRight === plain.avatarRight, true);
  check("尾巴尖到头像", plain.tailTipGap, 16, 0.8);

  if (SHOTS_DIR) {
    mkdirSync(SHOTS_DIR, { recursive: true });
    const { card, avatar } = data.rects;
    const shot = await call("Page.captureScreenshot", {
      format: "png",
      clip: {
        x: Math.max(0, Math.min(card.x, avatar.x) - 20),
        y: Math.max(0, card.y - 20),
        width: Math.max(card.right, avatar.right) - Math.min(card.x, avatar.x) + 40,
        height: avatar.bottom - card.y + 40,
        scale: 2,
      },
    });
    const file = join(SHOTS_DIR, "avatar-message.png");
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(`\n截图：${file}`);
  }

  console.log(`\n共 ${checks} 项检查，失败 ${failures} 项。`);
  if (failures > 0) process.exitCode = 1;
} catch (error) {
  console.error(`\n视觉验收失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
} finally {
  ws?.close();
  chrome?.kill("SIGKILL");
  await sleep(600);
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith("avatar-visual-")) continue;
    rmSync(join(tmpdir(), name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
