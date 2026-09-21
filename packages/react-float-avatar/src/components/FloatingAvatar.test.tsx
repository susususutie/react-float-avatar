// @vitest-environment jsdom
/**
 * FloatingAvatar 集成测试
 *
 * 锁住"头像 + 拖拽 + 锚点持久化 + 消息气泡 + 红点"之间的行为契约，
 * 避免后续改动把落锚语义、拖拽期隐藏、store 驱动关系改坏。
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import FloatingAvatar from "./FloatingAvatar";
import { avatarBadge, avatarMessage } from "../hooks/avatarMessage";
import { installDomShims, resetDomEnvironment } from "../test/domEnvironment";

installDomShims();

const STORAGE_KEY = "ai-assistant-position";
const VIEWPORT = { width: 1440, height: 813 };
const AVATAR_SRC = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
/** 默认锚点 right/bottom 24 → 头像左上角 */
const AVATAR_ORIGIN = { left: VIEWPORT.width - 56 - 24, top: VIEWPORT.height - 56 - 24 };

let container: HTMLDivElement;
let root: Root;

function renderAvatar(element: ReactElement) {
  act(() => {
    root.render(element);
  });
}

function avatarElement(): HTMLElement {
  const image = container.querySelector<HTMLImageElement>('img[alt="AI 助手"]');
  if (!image) throw new Error("头像未渲染");
  return image.closest("div") as HTMLElement;
}

function bubbleElement(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"], [role="status"]');
}

/** antd Badge 在隐藏时会保留节点播离场动效，因此按 data-show 判断"是否可见" */
function visibleBadgeDot(): HTMLElement | null {
  const dot = container.querySelector<HTMLElement>(".ant-badge-dot");
  return dot && dot.getAttribute("data-show") !== "false" ? dot : null;
}

function pointer(type: string, x: number, y: number, buttons = 0): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
}

/** 从头像中心按下、移动、松手 */
function dragBy(deltaX: number, deltaY: number) {
  const avatar = avatarElement();
  const fromX = AVATAR_ORIGIN.left + 28;
  const fromY = AVATAR_ORIGIN.top + 28;

  act(() => {
    avatar.dispatchEvent(pointer("pointerdown", fromX, fromY, 1));
    document.dispatchEvent(pointer("pointermove", fromX + deltaX, fromY + deltaY, 1));
    document.dispatchEvent(pointer("pointerup", fromX + deltaX, fromY + deltaY));
  });
}

beforeEach(() => {
  resetDomEnvironment();
  avatarMessage.reset();
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: VIEWPORT.width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEWPORT.height });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("拖拽与锚点持久化", () => {
  it("松手后按锚点语义写入 localStorage（右/下边距）", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);

    dragBy(-300, -180);

    // 落点 (1060, 553) → right 1440-56-1060=324、bottom 813-56-553=204
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      horizontal: { edge: "right", offset: 324 },
      vertical: { edge: "bottom", offset: 204 },
    });
  });

  it("落点靠近角落时吸附到角落（snapToCorner 默认开启）", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);

    // 从默认位置往上拖 700px 后落在 (1360, 33)，距右上角目标(1360,24)很近 → 吸附
    dragBy(0, -700);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      horizontal: { edge: "right", offset: 24 },
      vertical: { edge: "top", offset: 24 },
    });
  });

  it("位移小于点击阈值算点击：位置不变且触发 onClick", () => {
    const onClick = vi.fn();
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} onClick={onClick} />);
    const before = localStorage.getItem(STORAGE_KEY);

    dragBy(3, 1);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});

describe("消息气泡与红点", () => {
  it("消息由 avatarMessage 单例驱动：show 出现、close 卸载", async () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    expect(bubbleElement()).toBeNull();

    act(() => {
      avatarMessage.show("你好");
    });
    expect(bubbleElement()?.textContent).toContain("你好");

    await act(async () => {
      avatarMessage.close();
    });
    expect(bubbleElement()).toBeNull();
  });

  it("拖拽中隐藏气泡、松手后恢复", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    act(() => {
      avatarMessage.show("拖拽中要隐藏");
    });
    const avatar = avatarElement();
    const fromX = AVATAR_ORIGIN.left + 28;
    const fromY = AVATAR_ORIGIN.top + 28;

    act(() => {
      avatar.dispatchEvent(pointer("pointerdown", fromX, fromY, 1));
      document.dispatchEvent(pointer("pointermove", fromX - 100, fromY - 100, 1));
    });
    expect(bubbleElement()?.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      document.dispatchEvent(pointer("pointerup", fromX - 100, fromY - 100));
    });
    expect(bubbleElement()?.getAttribute("aria-hidden")).toBeNull();
  });

  it("红点由 avatarBadge 手动控制", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    expect(visibleBadgeDot()).toBeNull();

    act(() => {
      avatarBadge.show();
    });
    expect(visibleBadgeDot()).not.toBeNull();

    act(() => {
      avatarBadge.hide();
    });
    expect(visibleBadgeDot()).toBeNull();
  });

  it('遮罩默认关闭，mask="always" 时才渲染', () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    expect(container.querySelector("[data-anchor-mask]")).toBeNull();

    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} mask="always" />);
    expect(container.querySelector("[data-anchor-mask]")).not.toBeNull();
  });
});
