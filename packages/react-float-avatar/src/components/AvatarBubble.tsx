/**
 * AvatarBubble — 头像消息气泡
 *
 * 呈现上贴着头像、像 Tooltip 一样从头顶冒出来：
 *   - 定位来自锚点（resolveBubblePlacement）：默认头顶、箭头指向头像，空间不足才翻面
 *   - 先测量后显示：useLayoutEffect 量出自然尺寸后再定位，避免看到气泡"滑"到位置
 *   - 进出场是 scale + opacity，transform-origin 落在箭头一侧，看起来是从头像长出来
 *   - 退场先播动画再通知 store 关闭，因此组件不需要"保留已消失消息"的显示态
 *   - 倒计时只在气泡真正可见时推进：悬停、聚焦、拖拽中、异步动作进行中、页面不可见（可配置）都会暂停
 *
 * 结构对齐 antd Modal.confirm：
 *   card
 *     ├ body（avatar 图标槽 + paragraph[title, content]）
 *     ├ actions（footer 或 取消/确定，右对齐）
 *     └ close
 *
 * 视觉全部取自 antd token（colorBgElevated / boxShadowSecondary / borderRadiusLG…），
 * 与页面其他浮层保持同一套设计语言。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button, theme } from "antd";
import CloseIcon from "./CloseIcon";
import { anchorToXY } from "../hooks/useEdgeAnchor";
import type { EdgeAnchor } from "../hooks/useEdgeAnchor";
import { resolveBubblePlacement } from "../hooks/resolveBubblePlacement";
import { useIsoLayoutEffect } from "../hooks/useIsoLayoutEffect";
import type {
  AvatarMessageAction,
  AvatarMessageCloseReason,
  AvatarMessageItem,
} from "../hooks/avatarMessage";
import type { ViewportSize } from "../hooks/useViewportSize";

/** 与 antd zoom 动效同一族曲线 */
const MOTION_MS = 180;
const MOTION_EASE = "cubic-bezier(0.08, 0.82, 0.17, 1)";
const ARROW_SIZE = 12;
/** 尾巴是方块旋转 45°，中心落在卡片边上，所以尖端伸出卡片这么多 */
const ARROW_REACH = (ARROW_SIZE * Math.SQRT2) / 2;
/** 原型量测：图标 42px、图标与文字列间距 16px */
const AVATAR_SLOT = 42;
const ICON_GAP = 12;
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

type ActionKind = "ok" | "cancel";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null | undefined)?.then === "function";
}

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
  onClose: (id: string, reason: AvatarMessageCloseReason) => void;
  /** 尾巴尖端到头像的间距 */
  gap?: number;
  margin?: number;
  maxWidth?: number;
  /** 关闭按钮无障碍名，默认「关闭消息」（非中文站由 FloatingAvatar 的 closeLabel 覆盖） */
  closeLabel?: string;
  /** 气泡与头像同层，默认 9999 */
  zIndex?: number;
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

function AvatarBubble({
  message,
  hidden = false,
  anchor,
  viewport,
  elementSize,
  onClose,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  maxWidth = DEFAULT_MAX_WIDTH,
  closeLabel = "关闭消息",
  zIndex = 9999,
}: AvatarBubbleProps) {
  const { token } = theme.useToken();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<{ instanceId: number; animation: Animation } | null>(null);
  /** 进行中的动作：seq 递增，迟到的 Promise 结果或旧动作不再生效 */
  const busyRef = useRef<{ instanceId: number; kind: ActionKind; seq: number } | null>(null);
  const actionSeqRef = useRef(0);
  const [pending, setPending] = useState<{ instanceId: number; kind: ActionKind } | null>(null);
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
  const pendingKind =
    pending && message && pending.instanceId === message.instanceId ? pending.kind : null;

  /** 退场动画播完再真正关闭；被新消息打断时取消动画、直接展示新内容 */
  const requestClose = useCallback(
    (target: AvatarMessageItem, reason: AvatarMessageCloseReason) => {
      // 消息可能已被顶掉或被同 key 的新消息替换：按 instanceId 比对，避免误关新气泡
      if (wrapperRef.current?.dataset.bubbleInstance !== String(target.instanceId)) return;
      // 已在退场：重复点击或迟到的回调不叠加动画
      if (exitRef.current?.instanceId === target.instanceId) return;
      const element = wrapperRef.current;
      if (!element || motionMs === 0) {
        onClose(target.id, reason);
        return;
      }
      const animation = element.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.92)" },
        ],
        { duration: motionMs, easing: MOTION_EASE, fill: "forwards" },
      );
      exitRef.current = { instanceId: target.instanceId, animation };
      void animation.finished
        .then(() => {
          if (exitRef.current?.instanceId !== target.instanceId) return;
          // 这里不清 exitRef：fill:forwards 的残留要留到换消息时由下方 instanceId effect cancel，
          // 否则复用同一 DOM 节点的下一条消息播完进场动画后会重新继承 opacity:0 / scale(0.92)
          onClose(target.id, reason);
        })
        .catch(() => {
          /* 退场被取消（来了新消息）时忽略 */
        });
    },
    [motionMs, onClose],
  );

  /**
   * 执行确定/取消动作：同步返回就立即走退场；返回 Promise 时先挂回调，
   * 下一个宏任务才点亮 loading —— 已 resolve 的 Promise 不闪 loading，直接按结果关闭。
   * OK 等待中仍允许取消（对齐 Modal.confirm 的可取消性），后发动作会让先前的 Promise 失效。
   */
  const runAction = (kind: ActionKind, action: AvatarMessageAction | undefined) => {
    if (!message) return;
    const current = busyRef.current;
    if (
      current?.instanceId === message.instanceId &&
      !(kind === "cancel" && current.kind === "ok")
    ) {
      return;
    }
    const target = message;
    const ticket = { instanceId: target.instanceId, kind, seq: ++actionSeqRef.current };
    busyRef.current = ticket;

    let result: void | Promise<unknown>;
    try {
      result = action?.();
    } catch (error) {
      if (busyRef.current?.seq === ticket.seq) busyRef.current = null;
      throw error;
    }
    if (!isThenable(result)) {
      requestClose(target, kind);
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (
        !settled &&
        busyRef.current?.seq === ticket.seq &&
        wrapperRef.current?.dataset.bubbleInstance === String(target.instanceId)
      ) {
        setPending({ instanceId: target.instanceId, kind });
      }
    }, 0);

    Promise.resolve(result).then(
      () => {
        settled = true;
        window.clearTimeout(timer);
        // 已被 X / 取消按钮或后来的动作接管：迟到的结果不再关闭
        if (busyRef.current?.seq !== ticket.seq) return;
        requestClose(target, kind);
      },
      () => {
        // reject 只表示保持打开；错误在业务回调内处理，这里不制造 unhandled rejection
        settled = true;
        window.clearTimeout(timer);
        if (busyRef.current?.seq === ticket.seq) busyRef.current = null;
        setPending((current) =>
          current?.instanceId === target.instanceId && current.kind === kind ? null : current,
        );
      },
    );
  };

  /** X / Esc：同步调用 onCancel（不等待 Promise），然后总是关闭；不会因为取消回调而关不掉 */
  const dismiss = useCallback(() => {
    if (!message) return;
    const target = message;
    const current = busyRef.current;
    const cancelPending = current?.instanceId === target.instanceId && current.kind === "cancel";
    if (message.onCancel && !cancelPending) {
      try {
        const result = message.onCancel();
        if (isThenable(result)) void Promise.resolve(result).catch(() => {});
      } catch {
        /* 关闭行为不受 onCancel 抛错影响 */
      }
    }
    // 抢占 ticket：进行中的动作即使随后 resolve，也不再触发第二次关闭
    busyRef.current = {
      instanceId: target.instanceId,
      kind: "cancel",
      seq: ++actionSeqRef.current,
    };
    requestClose(target, "cancel");
  }, [message, requestClose]);

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /**
   * 换消息或气泡卸载时按真实 DOM 重新对齐「是否在悬停/聚焦」。
   * 节点被移除时浏览器不会补发 mouseleave / blur，hovered 会永久卡在 true，
   * 于是 paused 永远为真、倒计时再也不启动（自动关闭失效）。
   */
  useEffect(() => {
    const element = wrapperRef.current;
    setHovered(
      !!element && (element.matches(":hover") || element.contains(document.activeElement)),
    );
  }, [message]);

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
  // 同构版：服务端退化为 useEffect，消除 renderToString 的 useLayoutEffect 警告（react@18 实测）。
  useIsoLayoutEffect(() => {
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
  const paused =
    hidden ||
    hovered ||
    pendingKind !== null ||
    (message?.hiddenTimer === "pause" && !documentVisible);

  useAutoClose({
    durationMs: message?.duration ?? 0,
    resetKey: message ? `${message.id}:${message.instanceId}` : null,
    paused,
    onElapsed: () => {
      if (message) requestClose(message, "duration");
    },
  });

  useEffect(() => {
    if (!messageId || hidden) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [messageId, hidden, dismiss]);

  if (!message) return null;

  /**
   * 底部按钮：footer 自定义优先（Modal 的 footer 语义，完全替换），
   * 其次是「取消 / 确定」——confirm 模式总是渲染，普通消息只有给了回调才渲染。
   */
  const showOk = message.mode === "confirm" || message.onOk !== undefined;
  const showCancel = message.mode === "confirm" || message.onCancel !== undefined;
  const hasActions = message.footer !== undefined ? message.footer !== null : showOk || showCancel;
  /**
   * 纯消息（没有头像/标题/底部，正文是纯文本）走紧凑留白；其余（复杂消息）用原型那套完整留白。
   */
  const plainContent = typeof message.content === "string" || typeof message.content === "number";
  /** 正文（必填）；这里防御 patch 把 content 清空的情况，没有正文就不再留标题的 8px 下间距 */
  const hasBody = message.content !== undefined && message.content !== null;
  const compact = !message.avatar && !message.title && !hasActions && plainContent;
  const paddingY = compact ? token.paddingSM : token.paddingMD;
  const paddingX = compact ? token.padding : token.paddingLG;
  // 关闭图标的目标内缩：全尺寸按原型贴右上角，紧凑形态与文字行垂直居中
  const closeIconInsetY = compact
    ? paddingY + (LINE_HEIGHT - CLOSE_ICON_SIZE) / 2
    : paddingY - CLOSE_INSET_Y;
  const closeIconInsetX = paddingX - CLOSE_INSET_X;
  // 右上角关闭按钮的让位：只在标题（或没有标题时的正文）上留，body 不再整体缩进
  const closeClearance = message.closable ? (compact ? 20 : token.paddingLG) : 0;
  const contentClearance = compact || !message.title ? closeClearance : 0;
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
      data-bubble-instance={message.instanceId}
      role={hasActions ? "dialog" : "status"}
      aria-label={
        hasActions ? (typeof message.title === "string" ? message.title : "AI 助手消息") : undefined
      }
      aria-live={hasActions ? undefined : "polite"}
      aria-hidden={hidden ? true : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: "fixed",
        left: placement.left,
        ...bubbleOffset,
        zIndex,
        // 视口未知（SSR 首帧 / 无 JS 的服务端 HTML）与测量完成前都先隐藏
        visibility: viewport.width > 0 && metrics.width > 0 ? "visible" : "hidden",
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
        {/* body：图标槽 + 标题/正文，结构与 Modal.confirm 的 body 一致 */}
        <div
          data-bubble-body=""
          style={{
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          {message.avatar ? (
            <div
              style={{
                flex: "0 0 auto",
                width: AVATAR_SLOT,
                height: AVATAR_SLOT,
                marginRight: ICON_GAP,
                borderRadius: "50%",
                overflow: "hidden",
              }}
            >
              {message.avatar}
            </div>
          ) : null}

          <div data-bubble-paragraph="" style={{ flex: "1 1 auto", minWidth: 0 }}>
            {message.title ? (
              <div
                data-bubble-title=""
                style={{
                  color: token.colorTextHeading,
                  fontWeight: token.fontWeightStrong,
                  // 原型规格：标题 14px / 行高 20px
                  fontSize: token.fontSize,
                  lineHeight: `${LINE_HEIGHT}px`,
                  marginBottom: hasBody ? token.marginXS : 0,
                  paddingRight: closeClearance,
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
                  paddingRight: contentClearance,
                }}
              >
                {message.content}
              </div>
            )}
          </div>
        </div>

        {/* actions：Modal.confirm 的按钮行（footer 覆盖默认按钮），右对齐、次按钮在前 */}
        {hasActions ? (
          <div
            data-bubble-actions=""
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: token.marginXS,
              marginTop: token.marginSM,
            }}
          >
            {message.footer !== undefined ? (
              message.footer
            ) : (
              <>
                {showCancel ? (
                  <Button
                    loading={pendingKind === "cancel"}
                    onClick={() => runAction("cancel", message.onCancel)}
                  >
                    {message.cancelText ?? "取消"}
                  </Button>
                ) : null}
                {showOk ? (
                  <Button
                    type="primary"
                    danger={message.okDanger}
                    loading={pendingKind === "ok"}
                    onClick={() => runAction("ok", message.onOk)}
                  >
                    {message.okText ?? "确定"}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {message.closable ? (
          <button
            type="button"
            aria-label={closeLabel}
            onClick={dismiss}
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

/**
 * 拖拽逐帧只更新父层 transform：memo 让气泡内容不跟着重渲染，
 * 显隐仍由 hidden 两次状态切换完成（内容始终挂载，不重播进场、不重置动作）。
 */
export default memo(AvatarBubble);
