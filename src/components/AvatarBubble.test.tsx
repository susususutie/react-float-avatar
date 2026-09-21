// @vitest-environment jsdom
/**
 * AvatarBubble 渲染规格测试
 *
 * 目的：把"气泡长什么样、摆在哪"锁成可执行断言，避免后续重构悄悄改变渲染效果。
 * 这里断言的是组件写下的内联样式与结构（jsdom 不做真实布局），
 * 像素级验收见 AGENTS.md 里的浏览器验收步骤。
 *
 * 结构约定（测试据此定位节点，改动结构时这些断言会失败——这是刻意的）：
 *   wrapper  → 动效/定位层（style.left/bottom/visibility、role）
 *     ├ card  → 卡片（padding/maxWidth/borderRadius/gap）
 *     │   ├ [0] 头像槽（仅复杂消息）
 *     │   ├ [1] 文字列：标题 / 正文 / 底部按钮
 *     │   └ 关闭按钮（绝对定位）
 *     └ arrow → 尾巴
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import AvatarBubble from "./AvatarBubble";
import type { AvatarMessageItem } from "../hooks/avatarMessage";
import {
  getAnimationCalls,
  installDomShims,
  resetDomEnvironment,
  stubLayout,
  triggerResize,
} from "../test/domEnvironment";

installDomShims();

const VIEWPORT = { width: 1440, height: 813 };
const ELEMENT_SIZE = 56;
const ANCHOR = {
  horizontal: { edge: "right", offset: 24 },
  vertical: { edge: "bottom", offset: 24 },
} as const;

function makeMessage(overrides: Partial<AvatarMessageItem>): AvatarMessageItem {
  return {
    id: "msg-1",
    instanceId: 1,
    content: "正文",
    okType: "primary",
    duration: 0,
    closable: true,
    replaceable: true,
    hiddenTimer: "pause",
    hiddenMessage: "drop",
    ...overrides,
  };
}

const COMPLEX_MESSAGE = makeMessage({
  title: "标题",
  avatar: <img alt="小头像" src="avatar.png" />,
  okText: "立即处理",
  onOk: () => {},
  cancelText: "稍后再说",
  onCancel: () => {},
});

let container: HTMLDivElement;
let root: Root;

function renderBubble(message: AvatarMessageItem, onClose = vi.fn()) {
  act(() => {
    root.render(
      <AvatarBubble
        message={message}
        anchor={ANCHOR}
        viewport={VIEWPORT}
        elementSize={ELEMENT_SIZE}
        onClose={onClose}
      />,
    );
  });

  const wrapper = container.firstElementChild as HTMLElement;
  const card = wrapper.firstElementChild as HTMLElement;
  const arrow = wrapper.lastElementChild as HTMLElement;
  const hasAvatar = message.avatar !== undefined;
  // 卡片结构： [头像槽?] + 文字列（+ 绝对定位的关闭按钮，不计入此索引）
  const column = card.children[hasAvatar ? 1 : 0] as HTMLElement;
  const baseChildren = (message.title !== undefined ? 1 : 0) + 1; // 标题? + 正文
  const slots = {
    column,
    avatarSlot: hasAvatar ? (card.children[0] as HTMLElement) : null,
    title: card.querySelector<HTMLElement>("[data-bubble-title]"),
    content: card.querySelector<HTMLElement>("[data-bubble-content]") as HTMLElement,
    footer: column.children.length > baseChildren ? (column.lastElementChild as HTMLElement) : null,
  };
  const closeButton = card.querySelector<HTMLButtonElement>('button[aria-label="关闭消息"]');
  const actionButtons = [...card.querySelectorAll("button")].filter(
    (button) => button.getAttribute("aria-label") !== "关闭消息",
  );
  return { wrapper, card, arrow, closeButton, actionButtons, slots, onClose };
}

/** 给卡片/正文写入假的布局尺寸，再触发一次 ResizeObserver，模拟真实测量 */
function applyLayout(
  card: HTMLElement,
  content: HTMLElement | null,
  size: { width: number; height: number; contentHeight: number },
  visualRect: { width: number; height: number },
) {
  stubLayout(card, {
    offsetWidth: size.width,
    offsetHeight: size.height,
    // 故意让 rect 返回"缩放后"的视觉尺寸：定位若误用 rect 就会算错
    rect: { width: visualRect.width, height: visualRect.height, right: visualRect.width },
  });
  if (content) {
    stubLayout(content, { clientHeight: size.contentHeight, scrollHeight: size.contentHeight });
  }
  act(() => {
    triggerResize();
  });
}

function styleNumber(element: HTMLElement, property: "left" | "bottom" | "top" | "right"): number {
  return Number.parseFloat(element.style[property]);
}

beforeEach(() => {
  resetDomEnvironment();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("复杂消息（带 title / avatar / footer）", () => {
  it("用完整留白与原型尺寸", () => {
    const { wrapper, card } = renderBubble(COMPLEX_MESSAGE);

    expect(wrapper.getAttribute("role")).toBe("dialog");
    expect(wrapper.getAttribute("aria-live")).toBeNull();
    expect(card.style.padding).toBe("24px");
    expect(card.style.maxWidth).toBe("400px");
    expect(card.style.borderRadius).toBe("8px");
    expect(card.style.gap).toBe("16px");
  });

  it("头像槽 42px、标题 14px/20px 加粗、正文 14px/20px", () => {
    const { slots } = renderBubble(COMPLEX_MESSAGE);

    expect(slots.avatarSlot?.style.width).toBe("42px");
    expect(slots.avatarSlot?.style.height).toBe("42px");
    expect(slots.title?.style.fontSize).toBe("14px");
    expect(slots.title?.style.lineHeight).toBe("20px");
    expect(slots.title?.style.fontWeight).toBe("600");
    expect(slots.title?.style.marginBottom).toBe("8px");
    expect(slots.content.style.fontSize).toBe("14px");
    expect(slots.content.style.lineHeight).toBe("20px");
    expect(slots.content.style.maxHeight).toBe("");
  });

  it("底部按钮沿用 Modal 语义：给了回调才渲染，文案可覆盖，点击先回调再关闭", async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    const onClose = vi.fn();
    const message = makeMessage({
      title: "标题",
      content: "正文",
      okText: "立即处理",
      onOk,
      cancelText: "稍后再说",
      onCancel,
    });
    const { actionButtons } = renderBubble(message, onClose);

    expect(actionButtons.map((button) => button.textContent)).toEqual(["立即处理", "稍后再说"]);

    // 点击后先播放退场动画，动画结束才回调 onClose，所以要等微任务
    await act(async () => {
      actionButtons[0].click();
    });
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("msg-1");
  });

  it("没给回调就不渲染按钮（避免点了没反应的「确定」）", () => {
    const { actionButtons } = renderBubble(makeMessage({ title: "标题" }));

    expect(actionButtons).toEqual([]);
  });

  it("关闭图标用 close.svg 原尺寸，并按内边距贴右上角（距上 11 / 距右 14 的按钮盒）", () => {
    const { closeButton } = renderBubble(COMPLEX_MESSAGE);
    const icon = closeButton?.querySelector("img") as HTMLImageElement;

    expect(closeButton?.style.top).toBe("11px");
    expect(closeButton?.style.right).toBe("14px");
    expect(icon.width).toBe(12);
    expect(icon.height).toBe(12);
    expect(icon.getAttribute("src")).toContain("svg");
  });

  it("关闭按钮点击后回调 onClose", async () => {
    const { closeButton, onClose } = renderBubble(COMPLEX_MESSAGE);

    await act(async () => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledWith("msg-1");
  });

  it("closable: false 时不渲染关闭按钮", () => {
    const { closeButton } = renderBubble(makeMessage({ closable: false }));

    expect(closeButton).toBeNull();
  });
});

describe("纯消息（字符串 content）", () => {
  const PLAIN = makeMessage({ content: "这是一条紧凑消息" });

  it("用紧凑留白、宽度上限 320、无头像槽与底部", () => {
    const { wrapper, card, slots, actionButtons } = renderBubble(PLAIN);

    expect(wrapper.getAttribute("role")).toBe("status");
    expect(wrapper.getAttribute("aria-live")).toBe("polite");
    expect(card.style.padding).toBe("12px 16px");
    expect(card.style.maxWidth).toBe("320px");
    expect(card.style.gap).toBe("0px");
    expect(slots.avatarSlot).toBeNull();
    expect(slots.title).toBeNull();
    expect(slots.footer).toBeNull();
    expect(actionButtons).toEqual([]);
    expect(card.firstElementChild).toBe(slots.column);
  });

  it("正文正常字重（不因走到 title 分支而变粗）", () => {
    const { slots } = renderBubble(PLAIN);

    expect(slots.content.textContent).toBe("这是一条紧凑消息");
    expect(slots.content.style.fontWeight).toBe("");
    expect(slots.content.style.fontSize).toBe("14px");
    expect(slots.content.style.lineHeight).toBe("20px");
  });

  it("关闭图标与文字行垂直居中（距上 10 / 距右 6 的按钮盒）", () => {
    const { closeButton } = renderBubble(PLAIN);

    expect(closeButton?.style.top).toBe("10px");
    expect(closeButton?.style.right).toBe("6px");
  });

  it("带 title 时回到完整留白（两种形状只看结构）", () => {
    const { card } = renderBubble(makeMessage({ title: "标题", content: "正文" }));

    expect(card.style.padding).toBe("24px");
    expect(card.style.maxWidth).toBe("400px");
  });
});

describe("定位与测量", () => {
  it("宽度用布局尺寸而不是 getBoundingClientRect（防止动画 scale 把对齐算错）", () => {
    const { wrapper, card, slots } = renderBubble(COMPLEX_MESSAGE);

    // 布局宽 384，但视觉 rect 是缩放后的 353（384×0.92）；定位必须用 384
    applyLayout(
      card,
      slots.content,
      { width: 384, height: 208, contentHeight: 158 },
      { width: 353, height: 191 },
    );

    expect(styleNumber(wrapper, "left")).toBe(1032); // 1416 - 384
    expect(styleNumber(wrapper, "left")).not.toBe(1063); // 用 rect 会算成 1416 - 353
    expect(wrapper.style.visibility).toBe("visible");
  });

  it("头顶定位用贴头像那一侧（bottom）算，高度不参与", () => {
    const { wrapper, card, slots } = renderBubble(COMPLEX_MESSAGE);

    applyLayout(
      card,
      slots.content,
      { width: 384, height: 208, contentHeight: 158 },
      { width: 384, height: 208 },
    );

    // edgeOffset = 视口高 813 - 头像 top 733 + (间距 16 + 尾巴伸出 8.485)
    expect(styleNumber(wrapper, "bottom")).toBeCloseTo(104.485, 2);
    expect(wrapper.style.top).toBe("");
  });

  it("尾巴贴在卡片边缘、按夹紧后的箭头位置摆放", () => {
    const { card, slots, arrow } = renderBubble(COMPLEX_MESSAGE);

    applyLayout(
      card,
      slots.content,
      { width: 384, height: 208, contentHeight: 158 },
      { width: 384, height: 208 },
    );

    expect(arrow.style.width).toBe("12px");
    expect(arrow.style.height).toBe("12px");
    // arrowLeft = clamp(头像中心 1388 - 卡片左 1032, 20, 364) = 356 → 尾巴 left = 350
    expect(styleNumber(arrow, "left")).toBe(350);
    expect(arrow.style.bottom).toBe("-6px");
  });

  it("未测量前先隐藏，测量后显示", () => {
    const { wrapper, card, slots } = renderBubble(COMPLEX_MESSAGE);

    expect(wrapper.style.visibility).toBe("hidden");

    applyLayout(
      card,
      slots.content,
      { width: 384, height: 208, contentHeight: 158 },
      { width: 384, height: 208 },
    );

    expect(wrapper.style.visibility).toBe("visible");
  });
});

describe("动效与拖拽隐藏", () => {
  it("进场播放 180ms 的缩放动画", () => {
    renderBubble(COMPLEX_MESSAGE);

    const [call] = getAnimationCalls();
    expect(call.options?.duration).toBe(180);
    expect(call.keyframes.at(-1)).toMatchObject({ opacity: 1, transform: "scale(1)" });
  });

  it("hidden 时透明且不接收指针事件（拖拽中隐藏气泡）", () => {
    act(() => {
      root.render(
        <AvatarBubble
          message={COMPLEX_MESSAGE}
          hidden
          anchor={ANCHOR}
          viewport={VIEWPORT}
          elementSize={ELEMENT_SIZE}
          onClose={vi.fn()}
        />,
      );
    });
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.style.opacity).toBe("0");
    expect(wrapper.style.pointerEvents).toBe("none");
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  });

  it("没有消息时不渲染", () => {
    act(() => {
      root.render(
        <AvatarBubble
          message={null}
          anchor={ANCHOR}
          viewport={VIEWPORT}
          elementSize={ELEMENT_SIZE}
          onClose={vi.fn()}
        />,
      );
    });

    expect(container.firstElementChild).toBeNull();
  });
});
