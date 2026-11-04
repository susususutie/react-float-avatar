// @vitest-environment jsdom
/**
 * AvatarBubble 渲染规格测试
 *
 * 目的：把"气泡长什么样、摆在哪、按钮怎么响应"锁成可执行断言，避免后续重构悄悄改变行为。
 * 这里断言的是组件写下的内联样式与结构（jsdom 不做真实布局），
 * 像素级验收见 AGENTS.md 里的浏览器验收步骤。
 *
 * 结构约定（测试据此定位节点，改动结构时这些断言会失败——这是刻意的）：
 *   wrapper  → 动效/定位层（style.left/bottom/visibility、role）
 *     ├ card → 卡片（padding/maxWidth/borderRadius）
 *     │   ├ body → 图标槽 + paragraph（标题/正文）
 *     │   ├ actions → 取消/确定（或 footer 覆盖）
 *     │   └ close → 绝对定位
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
    mode: "message",
    content: "正文",
    okDanger: false,
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
  const body = card.querySelector<HTMLElement>("[data-bubble-body]") as HTMLElement;
  const paragraph = card.querySelector<HTMLElement>("[data-bubble-paragraph]") as HTMLElement;
  const actions = card.querySelector<HTMLElement>("[data-bubble-actions]");
  const hasAvatar = message.avatar !== undefined;
  const slots = {
    body,
    paragraph,
    avatarSlot: hasAvatar ? (body.children[0] as HTMLElement) : null,
    title: card.querySelector<HTMLElement>("[data-bubble-title]"),
    content: card.querySelector<HTMLElement>("[data-bubble-content]") as HTMLElement,
    actions,
  };
  const closeButton = card.querySelector<HTMLButtonElement>('button[aria-label="关闭消息"]');
  const actionButtons = actions ? [...actions.querySelectorAll("button")] : [];
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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetDomEnvironment();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  container.remove();
});

describe("复杂消息（带 title / avatar / actions）", () => {
  it("用完整留白与原型尺寸，图标用 marginRight 隔开文字列", () => {
    const { wrapper, card, slots } = renderBubble(COMPLEX_MESSAGE);

    expect(wrapper.getAttribute("role")).toBe("dialog");
    expect(wrapper.getAttribute("aria-live")).toBeNull();
    expect(card.style.padding).toBe("20px 24px");
    expect(card.style.maxWidth).toBe("400px");
    expect(card.style.borderRadius).toBe("8px");
    expect(slots.body.style.gap).toBe("");
    expect(slots.body.style.paddingRight).toBe("");
    expect(slots.avatarSlot?.style.marginRight).toBe("12px");
    expect(slots.title?.style.paddingRight).toBe("24px");
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

  it("复杂消息没有标题时，由正文让开右上角关闭按钮", () => {
    const { slots } = renderBubble(
      makeMessage({ avatar: <img alt="小头像" src="avatar.png" />, content: "正文" }),
    );

    expect(slots.title).toBeNull();
    expect(slots.content.style.paddingRight).toBe("24px");
  });

  it("actions 是独立一行：右对齐、次按钮在前，点击先回调再按 ok 关闭", async () => {
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
    const { actionButtons, slots } = renderBubble(message, onClose);

    expect(slots.actions?.style.justifyContent).toBe("flex-end");
    expect(slots.actions?.style.marginTop).toBe("12px");
    expect(actionButtons.map((button) => button.textContent)).toEqual(["稍后再说", "立即处理"]);

    // 点击后先播放退场动画，动画结束才回调 onClose，所以要等微任务
    await act(async () => {
      actionButtons[1].click();
    });
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith("msg-1", "ok");
  });

  it("没给回调就不渲染按钮（避免点了没反应的「确定」）", () => {
    const { actionButtons, slots } = renderBubble(makeMessage({ title: "标题" }));

    expect(slots.actions).toBeNull();
    expect(actionButtons).toEqual([]);
  });

  it("footer 完全替换默认按钮（Modal 的 footer 语义）", () => {
    const message = makeMessage({
      content: "正文",
      footer: <button type="button">自定义操作</button>,
      okText: "确定",
      onOk: () => {},
      cancelText: "取消",
      onCancel: () => {},
    });
    const { actionButtons } = renderBubble(message);

    expect(actionButtons.map((button) => button.textContent)).toEqual(["自定义操作"]);
  });

  it("关闭图标是内联 svg（原尺寸 12），并按内边距贴右上角（距上 11 / 距右 14 的按钮盒）", () => {
    const { closeButton } = renderBubble(COMPLEX_MESSAGE);
    const icon = closeButton?.querySelector("svg") as SVGElement;

    expect(closeButton?.style.top).toBe("7px");
    expect(closeButton?.style.right).toBe("14px");
    expect(icon.getAttribute("width")).toBe("12");
    expect(icon.getAttribute("height")).toBe("12");
    expect(icon.getAttribute("viewBox")).toBe("0 0 12 12");
  });

  it("关闭按钮点击会调用 onCancel，并以 cancel 关闭", async () => {
    const onCancel = vi.fn();
    const message = makeMessage({ content: "正文", onCancel });
    const { closeButton, onClose } = renderBubble(message);

    await act(async () => {
      closeButton?.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");
  });

  it("Esc 与关闭按钮同路径：调用 onCancel 并以 cancel 关闭", async () => {
    const onCancel = vi.fn();
    const message = makeMessage({ content: "正文", onCancel });
    const { onClose } = renderBubble(message);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");
  });

  it("closable: false 时不渲染关闭按钮", () => {
    const { closeButton } = renderBubble(makeMessage({ closable: false }));

    expect(closeButton).toBeNull();
  });
});

describe("confirm 模式", () => {
  it("没有回调也渲染取消/确定两个按钮，点确定以 ok 关闭", async () => {
    const message = makeMessage({ mode: "confirm", content: "确定吗" });
    const { actionButtons, onClose } = renderBubble(message);

    // antd Button 会给两个汉字自动插空格（autoInsertSpace 默认开启）
    expect(actionButtons.map((button) => button.textContent)).toEqual(["取 消", "确 定"]);

    await act(async () => {
      actionButtons[1].click();
    });

    expect(onClose).toHaveBeenCalledWith("msg-1", "ok");
  });

  it("okDanger 渲染为红色主按钮", () => {
    const message = makeMessage({ mode: "confirm", content: "删除", okDanger: true });
    const { actionButtons } = renderBubble(message);

    expect(actionButtons[1].className).toContain("ant-btn-dangerous");
  });

  it("点取消以 cancel 关闭", async () => {
    const message = makeMessage({ mode: "confirm", content: "确定吗" });
    const { actionButtons, onClose } = renderBubble(message);

    await act(async () => {
      actionButtons[0].click();
    });

    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");
  });

  it("onOk 是进行中的 Promise 时 OK loading，resolve 后以 ok 关闭", async () => {
    const gate = deferred();
    const onOk = vi.fn(async () => {
      await gate.promise;
    });
    const message = makeMessage({ mode: "confirm", content: "提交中", onOk });
    const { actionButtons, onClose } = renderBubble(message);

    await act(async () => {
      actionButtons[1].click();
    });
    // 已结算的 Promise 不显示 loading；这里是进行中的 Promise，下一个宏任务点亮
    expect(actionButtons[1].className).not.toContain("ant-btn-loading");

    await act(async () => {
      await tick();
    });
    expect(actionButtons[1].className).toContain("ant-btn-loading");

    await act(async () => {
      gate.resolve();
    });
    expect(onClose).toHaveBeenCalledWith("msg-1", "ok");
  });

  it("onOk reject 时清掉 loading 并保持打开", async () => {
    const gate = deferred();
    const onOk = vi.fn(() => gate.promise);
    const message = makeMessage({ mode: "confirm", content: "提交中", onOk });
    const { actionButtons, onClose } = renderBubble(message);

    await act(async () => {
      actionButtons[1].click();
      await tick();
    });
    expect(actionButtons[1].className).toContain("ant-btn-loading");

    await act(async () => {
      gate.reject(new Error("save failed"));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(actionButtons[1].className).not.toContain("ant-btn-loading");
  });

  it("已 resolve 的 Promise 不经过 loading，直接关闭", async () => {
    const onOk = vi.fn(() => Promise.resolve());
    const message = makeMessage({ mode: "confirm", content: "完成", onOk });
    const { actionButtons, onClose } = renderBubble(message);

    let sawLoading = false;
    const observer = new MutationObserver(() => {
      if (container.querySelector(".ant-btn-loading")) sawLoading = true;
    });
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    await act(async () => {
      actionButtons[1].click();
    });
    observer.disconnect();

    expect(sawLoading).toBe(false);
    expect(onClose).toHaveBeenCalledWith("msg-1", "ok");
  });

  it("onCancel 是进行中的 Promise 时取消按钮 loading，resolve 后以 cancel 关闭", async () => {
    const gate = deferred();
    const onCancel = vi.fn(async () => {
      await gate.promise;
    });
    const message = makeMessage({ mode: "confirm", content: "确认", onCancel });
    const { actionButtons, onClose } = renderBubble(message);

    await act(async () => {
      actionButtons[0].click();
      await tick();
    });
    expect(actionButtons[0].className).toContain("ant-btn-loading");

    await act(async () => {
      gate.resolve();
    });

    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");
  });

  it("OK 等待中仍可取消：取消按钮立即以 cancel 关闭，迟到的 resolve 不再关闭", async () => {
    const gate = deferred();
    const onOk = vi.fn(() => gate.promise);
    const onCancel = vi.fn();
    const message = makeMessage({ mode: "confirm", content: "提交中", onOk, onCancel });
    const { actionButtons, onClose } = renderBubble(message);

    await act(async () => {
      actionButtons[1].click();
      await tick();
    });
    expect(actionButtons[1].className).toContain("ant-btn-loading");

    await act(async () => {
      actionButtons[0].click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");

    await act(async () => {
      gate.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("X / Esc 在 OK 等待中也能关闭，并调用 onCancel", async () => {
    const gate = deferred();
    const onOk = vi.fn(() => gate.promise);
    const onCancel = vi.fn();
    const message = makeMessage({ mode: "confirm", content: "提交中", onOk, onCancel });
    const { actionButtons, closeButton, onClose } = renderBubble(message);

    await act(async () => {
      actionButtons[1].click();
      await tick();
    });

    await act(async () => {
      closeButton?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");

    await act(async () => {
      gate.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
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
    expect(slots.body.style.gap).toBe("");
    expect(slots.body.style.paddingRight).toBe("");
    expect(slots.content.style.paddingRight).toBe("20px");
    expect(slots.avatarSlot).toBeNull();
    expect(slots.title).toBeNull();
    expect(slots.actions).toBeNull();
    expect(actionButtons).toEqual([]);
    expect(card.firstElementChild).toBe(slots.body);
    expect(slots.body.firstElementChild).toBe(slots.paragraph);
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

    expect(card.style.padding).toBe("20px 24px");
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

  it("换消息时取消上一条的退场动画（fill:forwards 残留会让下一条继承 opacity:0）", async () => {
    const onClose = vi.fn();
    const { closeButton } = renderBubble(makeMessage({ id: "msg-1", instanceId: 1 }), onClose);

    act(() => {
      closeButton?.click();
    });
    // 退场动画播完才回调 onClose
    await act(async () => {});
    expect(onClose).toHaveBeenCalledWith("msg-1", "cancel");

    const exit = getAnimationCalls().find((call) => call.options?.fill === "forwards");
    expect(exit).toBeDefined();
    expect(exit?.animation.canceled).toBe(false);

    renderBubble(makeMessage({ id: "msg-2", instanceId: 2 }), onClose);

    expect(exit?.animation.canceled).toBe(true);
  });

  it("气泡卸载不残留悬停/聚焦态：下一条带 duration 的消息仍会自动关闭", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const render = (message: AvatarMessageItem | null) =>
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

    render(makeMessage({ id: "msg-1", instanceId: 1, mode: "confirm", okText: "知道了" }));
    const button = container.querySelector<HTMLButtonElement>("[data-bubble-actions] button");
    act(() => {
      button?.focus();
    });
    // 关掉消息让气泡卸载：焦点随节点一起消失，浏览器不会补发 blur，hovered 会卡在 true
    render(null);
    render(makeMessage({ id: "msg-2", instanceId: 2, duration: 3000 }));

    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    expect(onClose).toHaveBeenCalledWith("msg-2", "duration");
    vi.useRealTimers();
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
