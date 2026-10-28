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
  it("消息由 avatarMessage 单例驱动：show 出现、destroy 卸载", async () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    expect(bubbleElement()).toBeNull();

    act(() => {
      avatarMessage.show("你好");
    });
    expect(bubbleElement()?.textContent).toContain("你好");

    await act(async () => {
      avatarMessage.destroy();
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

describe("可配置性（size / storageKey / defaultAnchor / onAnchorChange / zIndex）", () => {
  it("size 透传到渲染与落锚几何（snap 关闭时落点按 size 反算锚点）", () => {
    const size = 80;
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} size={size} snapToCorner={false} />);
    const root = container.querySelector<HTMLElement>("[data-avatar-root]");
    expect(root?.style.width).toBe(`${size}px`);
    expect(root?.style.height).toBe(`${size}px`);
    expect(container.querySelector<HTMLElement>("[data-avatar-slot]")?.style.width).toBe(
      `${size}px`,
    );

    // 默认位（右下 padding 24）左上角 = (1440-80-24, 813-80-24) = (1336, 709)
    const origin = { left: VIEWPORT.width - size - 24, top: VIEWPORT.height - size - 24 };
    const fromX = origin.left + size / 2;
    const fromY = origin.top + size / 2;
    act(() => {
      root?.dispatchEvent(pointer("pointerdown", fromX, fromY, 1));
      document.dispatchEvent(pointer("pointermove", fromX - 200, fromY - 300, 1));
      document.dispatchEvent(pointer("pointerup", fromX - 200, fromY - 300));
    });

    // 落点 (1136, 409) → right = 1440-80-1136 = 224、bottom = 813-80-409 = 324；
    // 若 size 没透传进 resolveDrop（仍按 56），会算出 248/348 —— 此断言抓的就是它
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      horizontal: { edge: "right", offset: 224 },
      vertical: { edge: "bottom", offset: 324 },
    });
    expect(root?.style.right).toBe("224px");
  });

  it("storageKey 隔离位置：只写自己的键，不碰默认键", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} storageKey="custom-avatar-pos" />);

    dragBy(-300, -180);

    expect(JSON.parse(localStorage.getItem("custom-avatar-pos") ?? "null")).toEqual({
      horizontal: { edge: "right", offset: 324 },
      vertical: { edge: "bottom", offset: 204 },
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("defaultAnchor：无持久化记录时用它定位（非默认的左上锚点）", () => {
    renderAvatar(
      <FloatingAvatar
        avatarSrc={AVATAR_SRC}
        defaultAnchor={{
          horizontal: { edge: "left", offset: 10 },
          vertical: { edge: "top", offset: 12 },
        }}
      />,
    );
    const root = container.querySelector<HTMLElement>("[data-avatar-root]");

    expect(root?.style.left).toBe("10px");
    expect(root?.style.top).toBe("12px");
    expect(root?.style.right).toBe("");
    expect(root?.style.bottom).toBe("");
  });

  it("有持久化记录时优先于 defaultAnchor（恢复 + 夹紧）", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        horizontal: { edge: "right", offset: 50 },
        vertical: { edge: "bottom", offset: 60 },
      }),
    );
    renderAvatar(
      <FloatingAvatar
        avatarSrc={AVATAR_SRC}
        defaultAnchor={{
          horizontal: { edge: "left", offset: 10 },
          vertical: { edge: "top", offset: 12 },
        }}
      />,
    );
    const root = container.querySelector<HTMLElement>("[data-avatar-root]");

    expect(root?.style.right).toBe("50px");
    expect(root?.style.bottom).toBe("60px");
    expect(root?.style.left).toBe("");
  });

  it("onAnchorChange：挂载恢复不触发，落锚触发一次且值正确", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        horizontal: { edge: "right", offset: 50 },
        vertical: { edge: "bottom", offset: 60 },
      }),
    );
    const onAnchorChange = vi.fn();
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} onAnchorChange={onAnchorChange} />);

    // 恢复发生在 layout effect，不视为用户动作
    expect(onAnchorChange).not.toHaveBeenCalled();
    const root = container.querySelector<HTMLElement>("[data-avatar-root]");
    expect(root?.style.right).toBe("50px");

    // 恢复位置 (1440-56-50, 813-56-60) = (1334, 697)，位移 (-300, -180) → 落点 (1034, 517)
    dragBy(-300, -180);

    expect(onAnchorChange).toHaveBeenCalledTimes(1);
    expect(onAnchorChange).toHaveBeenCalledWith({
      horizontal: { edge: "right", offset: 350 },
      vertical: { edge: "bottom", offset: 240 },
    });
  });

  it("点击（位移小于阈值）不触发 onAnchorChange", () => {
    const onAnchorChange = vi.fn();
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} onAnchorChange={onAnchorChange} />);

    dragBy(3, 1);

    expect(onAnchorChange).not.toHaveBeenCalled();
  });

  it("zIndex 透传：头像与气泡同层，遮罩取 zIndex - 1", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} zIndex={5000} mask="always" />);

    const root = container.querySelector<HTMLElement>("[data-avatar-root]");
    expect(root?.style.zIndex).toBe("5000");
    expect(container.querySelector<HTMLElement>("[data-anchor-mask]")?.style.zIndex).toBe("4999");

    act(() => {
      avatarMessage.show("层级验证");
    });
    expect(bubbleElement()?.style.zIndex).toBe("5000");
  });

  it("closeLabel 覆盖气泡关闭按钮无障碍名（不做 i18n，文案走 prop）", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} closeLabel="Dismiss" />);
    act(() => {
      avatarMessage.show("带关闭按钮的消息");
    });

    expect(container.querySelector('button[aria-label="Dismiss"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="关闭消息"]')).toBeNull();
  });

  it("alt 同时作用于图片与容器 aria-label", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} alt="Assistant" />);

    expect(container.querySelector('img[alt="Assistant"]')).not.toBeNull();
    expect(container.querySelector("[data-avatar-root]")?.getAttribute("aria-label")).toBe(
      "Assistant",
    );
  });
});

describe("可访问性", () => {
  it("容器可聚焦并带按钮语义（默认 alt 作无障碍名）", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    const root = avatarElement();

    expect(root.getAttribute("role")).toBe("button");
    expect(root.getAttribute("tabindex")).toBe("0");
    expect(root.getAttribute("aria-label")).toBe("AI 助手");
  });

  it("Enter / Space 触发 onClick，Space 阻止默认滚动", () => {
    const onClick = vi.fn();
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} onClick={onClick} />);
    const root = avatarElement();

    act(() => {
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(space);
    });
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(space.defaultPrevented).toBe(true);
  });

  it("焦点环走 isFocusVisible：jsdom 下 :focus-visible 为 false 时不叠加焦点环", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);
    const root = avatarElement();
    const restingShadow = root.style.boxShadow;

    act(() => {
      root.focus();
    });
    // 实测 jsdom 对已 focus 的元素 matches(":focus-visible") 返回 false → 不亮环
    expect(root.style.boxShadow).toBe(restingShadow);

    act(() => {
      root.blur();
    });
    expect(root.style.boxShadow).toBe(restingShadow);
  });

  it("CSR 挂载后（layout effect 已测出视口）头像不残留隐藏", () => {
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} />);

    expect(avatarElement().style.visibility).not.toBe("hidden");
  });
});

describe("槽位契约（children / 分层裁剪 / §14 护栏）", () => {
  it("children 进槽位裁剪层；容器保留几何与 a11y；角标红点在裁剪层之外", () => {
    renderAvatar(
      <FloatingAvatar size={56}>
        <div data-frame="idle-1">动画帧</div>
      </FloatingAvatar>,
    );
    const root = container.querySelector<HTMLElement>("[data-avatar-root]");
    const slot = container.querySelector<HTMLElement>("[data-avatar-slot]");

    // 裁剪层只包内容
    expect(slot?.style.overflow).toBe("hidden");
    expect(slot?.style.borderRadius).toBe("50%");
    expect(slot?.querySelector("[data-frame]")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();

    // 容器独占几何与 a11y，自身不裁剪
    expect(root?.style.width).toBe("56px");
    expect(root?.style.overflow).toBe("");
    expect(root?.getAttribute("role")).toBe("button");
    expect(root?.getAttribute("tabindex")).toBe("0");

    // 角标红点在裁剪层之外，永不被裁
    act(() => {
      avatarBadge.show();
    });
    const dot = container.querySelector<HTMLElement>(".ant-badge-dot");
    expect(dot).not.toBeNull();
    expect(slot?.contains(dot)).toBe(false);
    expect(root?.contains(dot)).toBe(true);
  });

  it("onImgError 在图片加载失败时触发（children 形象由消费方自行兜底）", () => {
    const onImgError = vi.fn();
    renderAvatar(<FloatingAvatar avatarSrc={AVATAR_SRC} onImgError={onImgError} />);
    const image = container.querySelector("img") as HTMLImageElement;

    act(() => {
      image.dispatchEvent(new Event("error"));
    });

    expect(onImgError).toHaveBeenCalledTimes(1);
  });
});
