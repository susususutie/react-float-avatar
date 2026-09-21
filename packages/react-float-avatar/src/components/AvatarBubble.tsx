/**
 * AvatarBubble — 头像消息气泡
 *
 * 呈现上贴着头像、像 Tooltip 一样从头顶冒出来：
 *   - 定位来自锚点（resolveBubblePlacement）：默认头顶、箭头指向头像，空间不足才翻面
 *   - 先测量后显示：useLayoutEffect 量出自然尺寸后再定位，避免看到气泡"滑"到位置
 *   - 进出场是 scale + opacity，transform-origin 落在箭头一侧，看起来是从头像长出来
 *   - 退场先播动画再通知 store 关闭，因此组件不需要"保留已消失消息"的显示态
 *   - 倒计时只在气泡真正可见时推进：悬停、聚焦、拖拽中、页面不可见（可配置）都会暂停
 *
 * 视觉全部取自 antd token（colorBgElevated / boxShadowSecondary / borderRadiusLG…），
 * 与页面其他浮层保持同一套设计语言。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button, theme } from "antd";
import CloseIcon from "./CloseIcon";
import { anchorToXY } from "../hooks/useEdgeAnchor";
import type { EdgeAnchor } from "../hooks/useEdgeAnchor";
import { resolveBubblePlacement } from "../hooks/resolveBubblePlacement";
import type { AvatarMessageItem } from "../hooks/avatarMessage";
import type { ViewportSize } from "../hooks/useViewportSize";

/** 与 antd zoom 动效同一族曲线 */
const MOTION_MS = 180;
const MOTION_EASE = "cubic-bezier(0.08, 0.82, 0.17, 1)";
const ARROW_SIZE = 12;
/** 尾巴是方块旋转 45°，中心落在卡片边上，所以尖端伸出卡片这么多 */
const ARROW_REACH = (ARROW_SIZE * Math.SQRT2) / 2;
/** 原型量测：图标 42px、图标与文字列间距 16px */
const AVATAR_SLOT = 42;
const ICON_GAP = 16;
/** 尾巴尖端到头像的间距（不是卡片边缘到头像） */
const DEFAULT_GAP = 16;
const DEFAULT_MARGIN = 12;
/** 原型卡片宽 400px（与 antd notification 的 384 同一量级） */
const DEFAULT_MAX_WIDTH = 400;
/** 纯文字消息的宽度上限，贴近 tooltip 的量感 */
const COMPACT_MAX_WIDTH = 320;
/** 正文行高；紧凑形态下关闭图标与这一行垂直居中 */
const LINE_HEIGHT = 20;
/** 关闭图标装在按钮里居中，差值用于把「图标内缩」换算成「按钮内缩」 */
const CLOSE_ICON_SIZE = 12;
const CLOSE_BUTTON_SIZE = 24;
const CLOSE_CENTER_OFFSET = (CLOSE_BUTTON_SIZE - CLOSE_ICON_SIZE) / 2;
/** 原型量测：全尺寸下图标距上 17（= 24 - 7）、距右 20（= 24 - 4） */
const CLOSE_INSET_Y = 7;
const CLOSE_INSET_X = 4;

interface AvatarBubbleProps {
  /** 当前消息；null 表示没有消息（组件直接卸载） */
  message: AvatarMessageItem | null;
  /** 拖拽中隐藏：头像在位移过程中气泡不跟随，松手后按新锚点重新出现 */
  hidden?: boolean;
  anchor: EdgeAnchor;
  viewport: ViewportSize;
  /** 头像边长 */
  elementSize: number;
  /** 请求关闭（关闭按钮、Esc、超时、操作按钮都会走这里，动画结束后才真正关闭） */
  onClose: (id: string) => void;
  /** 尾巴尖端到头像的间距 */
  gap?: number;
  margin?: number;
  maxWidth?: number;
}

/**
 * 倒计时：只在可见时推进，暂停时把已用时间结算进 remaining。
 * resetKey 变化（换了一条消息）或 duration 显式变化时才重新计时。
 */
function useAutoClose({
  durationMs,
  resetKey,
  paused,
  onElapsed,
}: {
  durationMs: number;
  resetKey: string | null;
  paused: boolean;
  onElapsed: () => void;
}) {
  const remainingRef = useRef(durationMs);
  const startedAtRef = useRef(0);
  const onElapsedRef = useRef(onElapsed);

  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    remainingRef.current = durationMs;
  }, [durationMs, resetKey]);

  useEffect(() => {
    if (durationMs <= 0 || paused) return;
    startedAtRef.current = performance.now();
    const timer = window.setTimeout(() => onElapsedRef.current(), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (performance.now() - startedAtRef.current),
      );
    };
  }, [durationMs, paused, resetKey]);
}

export default function AvatarBubble({
  message,
  hidden = false,
  anchor,
  viewport,
  elementSize,
  onClose,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  maxWidth = DEFAULT_MAX_WIDTH,
}: AvatarBubbleProps) {
  const { token } = theme.useToken();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<{ id: string; animation: Animation } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [metrics, setMetrics] = useState({ width: 0, naturalHeight: 0, chromeHeight: 0 });
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const motionMs = reducedMotion ? 0 : MOTION_MS;
  const instanceId = message?.instanceId ?? null;

  /** 退场动画播完再真正关闭；被新消息打断时取消动画、直接展示新内容 */
  const requestClose = useCallback(
    (id: string) => {
      const element = wrapperRef.current;
      if (!element || motionMs === 0) {
        onClose(id);
        return;
      }
      const animation = element.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.92)" },
        ],
        { duration: motionMs, easing: MOTION_EASE, fill: "forwards" },
      );
      exitRef.current = { id, animation };
      void animation.finished
        .then(() => {
          if (exitRef.current?.id !== id) return;
          exitRef.current = null;
          onClose(id);
        })
        .catch(() => {
          /* 退场被取消（来了新消息）时忽略 */
        });
    },
    [motionMs, onClose],
  );

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // 新消息替换当前的气泡内容：取消正在进行的退场动画，直接原地展示
  useEffect(() => {
    exitRef.current?.animation.cancel();
    exitRef.current = null;
  }, [instanceId]);

  // 进场动画：挂载与每条新消息都播一次（内容原地更新不播，保持 update 不重播）
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || motionMs === 0) return;
    const animation = element.animate(
      [
        { opacity: 0, transform: "scale(0.92)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: motionMs, easing: MOTION_EASE },
    );
    return () => animation.cancel();
  }, [instanceId, motionMs]);

  // 量出「自然高度」：正文滚动时 card 会变矮，用 scrollHeight 才能拿到未限高的高度，
  // 否则会出现「限高 → 变矮 → 又判定放得下 → 取消限高」的来回抖动。
  useLayoutEffect(() => {
    const card = cardRef.current;
    // 注意：只有 title 的消息没有正文节点，不能因此跳过测量，否则会沿用上一条消息的尺寸
    if (!card) return;

    const measure = () => {
      // 必须用 offsetWidth/offsetHeight 这类「布局尺寸」，不能用 getBoundingClientRect：
      // 进出场动画给外层加了 scale，rect 会把缩放算进去（卡片 138px 会量成 127px），
      // 定位就按错误宽度算水平对齐；而 transform 不改变布局尺寸，ResizeObserver 也不会纠正。
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      if (width === 0) return;
      const content = contentRef.current;
      // 被限高时正文会滚动，用 scrollHeight 的溢出量补回「未限高的自然高度」；
      const overflow = content ? Math.max(0, content.scrollHeight - content.clientHeight) : 0;
      // 没有正文时，整张卡都是「非正文」部分
      const chromeHeight = content ? Math.max(0, height - content.clientHeight) : height;
      const next = {
        width,
        naturalHeight: height + overflow,
        chromeHeight,
      };
      setMetrics((current) =>
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.naturalHeight - next.naturalHeight) < 0.5 &&
        Math.abs(current.chromeHeight - next.chromeHeight) < 0.5
          ? current
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [instanceId]);

  const placement = resolveBubblePlacement({
    anchor,
    avatarPosition: anchorToXY(anchor, viewport.width, viewport.height, elementSize, elementSize),
    avatarSize: elementSize,
    bubble: metrics,
    viewport,
    // 定位用的是「卡片边缘」间距，这里把尾巴伸出的部分补上
    gap: gap + ARROW_REACH,
    margin,
  });
  const messageId = message?.id ?? null;
  const paused = hidden || hovered || (message?.hiddenTimer === "pause" && !documentVisible);

  useAutoClose({
    durationMs: message?.duration ?? 0,
    resetKey: message ? `${message.id}:${message.instanceId}` : null,
    paused,
    onElapsed: () => {
      if (messageId) requestClose(messageId);
    },
  });

  useEffect(() => {
    if (!messageId || hidden) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose(messageId);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [messageId, hidden, requestClose]);

  if (!message) return null;

  /**
   * 底部按钮：footer 自定义优先，其次是 antd Modal 那套「确定/取消」（只有给了回调才渲染）。
   * 顺序按原型：主按钮在左、次按钮在右。
   */
  const hasFooter =
    message.footer !== undefined || message.onOk !== undefined || message.onCancel !== undefined;
  /**
   * 纯消息（没有头像/标题/底部，正文是纯文本）走紧凑留白；其余（复杂消息）用原型那套完整留白。
   */
  const plainContent = typeof message.content === "string" || typeof message.content === "number";
  /** 正文（必填）；这里防御 patch 把 content 清空的情况，没有正文就不再留标题的 8px 下间距 */
  const hasBody = message.content !== undefined && message.content !== null;
  const compact = !message.avatar && !message.title && !hasFooter && plainContent;
  const paddingY = compact ? token.paddingSM : token.paddingLG;
  const paddingX = compact ? token.padding : token.paddingLG;
  // 关闭图标的目标内缩：全尺寸按原型贴右上角，紧凑形态与文字行垂直居中
  const closeIconInsetY = compact
    ? paddingY + (LINE_HEIGHT - CLOSE_ICON_SIZE) / 2
    : paddingY - CLOSE_INSET_Y;
  const closeIconInsetX = paddingX - CLOSE_INSET_X;
  const cardMaxWidth = Math.min(
    compact ? COMPACT_MAX_WIDTH : maxWidth,
    Math.max(160, viewport.width - margin * 2),
  );
  const arrowPlacement: CSSProperties =
    placement.placement === "top" ? { bottom: -ARROW_SIZE / 2 } : { top: -ARROW_SIZE / 2 };
  // 贴头像的一侧固定，气泡高度变化时朝远离头像的方向生长
  const bubbleOffset: CSSProperties =
    placement.placement === "top"
      ? { bottom: placement.edgeOffset }
      : { top: placement.edgeOffset };
  const arrowBorder: CSSProperties =
    placement.placement === "top"
      ? {
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }
      : {
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        };

  return (
    <div
      ref={wrapperRef}
      role={hasFooter ? "dialog" : "status"}
      aria-label={
        hasFooter ? (typeof message.title === "string" ? message.title : "AI 助手消息") : undefined
      }
      aria-live={hasFooter ? undefined : "polite"}
      aria-hidden={hidden ? true : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: "fixed",
        left: placement.left,
        ...bubbleOffset,
        zIndex: 9999,
        visibility: metrics.width > 0 ? "visible" : "hidden",
        opacity: hidden ? 0 : 1,
        transform: hidden ? "scale(0.92)" : "scale(1)",
        transformOrigin:
          placement.placement === "top"
            ? `bottom ${placement.arrowLeft}px`
            : `top ${placement.arrowLeft}px`,
        transition:
          motionMs > 0
            ? `opacity ${motionMs}ms ${MOTION_EASE}, transform ${motionMs}ms ${MOTION_EASE}`
            : undefined,
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      <div
        ref={cardRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          gap: compact ? 0 : ICON_GAP,
          width: "fit-content",
          maxWidth: cardMaxWidth,
          padding: `${paddingY}px ${paddingX}px`,
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          boxShadow: token.boxShadowSecondary,
          color: token.colorText,
          fontFamily: token.fontFamily,
          fontSize: token.fontSize,
          lineHeight: token.lineHeight,
        }}
      >
        {message.avatar ? (
          <div
            style={{
              flex: "0 0 auto",
              width: AVATAR_SLOT,
              height: AVATAR_SLOT,
              borderRadius: "50%",
              overflow: "hidden",
            }}
          >
            {message.avatar}
          </div>
        ) : null}

        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            paddingRight: message.closable ? (compact ? 20 : 24) : 0,
          }}
        >
          {message.title ? (
            <div
              data-bubble-title=""
              style={{
                color: token.colorTextHeading,
                fontWeight: token.fontWeightStrong,
                // 原型规格：标题 14px / 行高 20px
                fontSize: token.fontSize,
                lineHeight: `${LINE_HEIGHT}px`,
                marginBottom: hasBody || hasFooter ? token.marginXS : 0,
              }}
            >
              {message.title}
            </div>
          ) : null}

          {message.content === undefined || message.content === null ? null : (
            <div
              ref={contentRef}
              data-bubble-content=""
              style={{
                maxHeight: placement.contentMaxHeight || undefined,
                overflowY: placement.contentMaxHeight ? "auto" : "visible",
                color: message.title ? token.colorTextSecondary : token.colorText,
                fontSize: token.fontSize,
                lineHeight: `${LINE_HEIGHT}px`,
                overflowWrap: "anywhere",
              }}
            >
              {message.content}
            </div>
          )}

          {hasFooter ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                gap: token.marginXS,
                marginTop: token.margin,
              }}
            >
              {message.footer}
              {message.onOk ? (
                <Button
                  type={message.okType}
                  onClick={() => {
                    message.onOk?.();
                    requestClose(message.id);
                  }}
                >
                  {message.okText ?? "确定"}
                </Button>
              ) : null}
              {message.onCancel ? (
                <Button
                  onClick={() => {
                    message.onCancel?.();
                    requestClose(message.id);
                  }}
                >
                  {message.cancelText ?? "取消"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {message.closable ? (
          <button
            type="button"
            aria-label="关闭消息"
            onClick={() => requestClose(message.id)}
            style={{
              position: "absolute",
              top: closeIconInsetY - CLOSE_CENTER_OFFSET,
              right: closeIconInsetX - CLOSE_CENTER_OFFSET,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: CLOSE_BUTTON_SIZE,
              height: CLOSE_BUTTON_SIZE,
              padding: 0,
              border: "none",
              borderRadius: token.borderRadiusSM,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <CloseIcon size={CLOSE_ICON_SIZE} />
          </button>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          left: placement.arrowLeft - ARROW_SIZE / 2,
          width: ARROW_SIZE,
          height: ARROW_SIZE,
          background: token.colorBgElevated,
          transform: "rotate(45deg)",
          ...arrowPlacement,
          ...arrowBorder,
        }}
      />
    </div>
  );
}
