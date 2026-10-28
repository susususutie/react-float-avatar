/**
 * FloatingAvatar — 浮动头像
 *
 * 交互链路：
 *   useDraggable 报告指针增量 → 拖拽中用 transform 位移（不动 CSS 定位，走 GPU 合成）
 *   → 松手时用 resolveDrop 算出锚点，并在同一次提交里把 transform 清零。
 *
 * 位置策略：
 *   - 锚点语义、持久化恢复、缩放校验由 useEdgeAnchor 负责（SSR/hydration 安全，
 *     渲染期不读 localStorage）
 *   - 落点决策（夹紧 + 四角吸附 + 反算锚点）统一走 resolveDrop，预览与真实落锚共用
 *   - 位移小于 CLICK_THRESHOLD 视为点击：不落锚点，元素回到拖拽前的位置
 *   - 规则本身不可见，可用 mask 打开可视化遮罩（见 AnchorMask）
 *   - 消息气泡与角标来自 avatarMessage 单例（见 AvatarBubble）：气泡贴着头像展示，
 *     拖拽中隐藏、松手后按新锚点重新出现；角标只由业务手动控制
 *
 * 结构（槽位契约，见方案 §3 / §14）：
 *   容器 div（几何 / 拖拽 / a11y / 焦点环，**不裁剪**）
 *     └ Badge（角标红点，位于裁剪层之外，永不被裁）
 *          └ 槽位裁剪层 span（overflow hidden + 圆角，只包内容）
 *               └ avatarSrc 图片 或 children（任意形象，含未来帧动画）
 *
 * 常量语义：DEFAULT_SIZE 头像默认边长、EDGE_PADDING 默认锚定间距兼吸附间距、
 * SNAP_THRESHOLD 吸附触发半径、CLICK_THRESHOLD 点击/拖拽分界、
 * DEFAULT_STORAGE_KEY 默认持久化键名（多实例用 storageKey prop 隔离）。
 */

import { useCallback, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { Badge, theme } from "antd";
import AnchorMask from "./AnchorMask";
import type { AnchorMaskMode, AnchorMaskOptions, DragPreview } from "./AnchorMask";
import AvatarBubble from "./AvatarBubble";
import { avatarMessage, useAvatarState } from "../hooks/avatarMessage";
import type { AvatarMessageCloseReason } from "../hooks/avatarMessage";
import { useDraggable } from "../hooks/useDraggable";
import { anchorToXY, clampToViewport, useEdgeAnchor } from "../hooks/useEdgeAnchor";
import type { EdgeAnchor } from "../hooks/useEdgeAnchor";
import { isFocusVisible } from "../hooks/isFocusVisible";
import { resolveDrop } from "../hooks/resolveDrop";
import { useViewportSize } from "../hooks/useViewportSize";

const DEFAULT_SIZE = 56;
const EDGE_PADDING = 24;
const SNAP_THRESHOLD = 80;
const CLICK_THRESHOLD = 5;
const DEFAULT_STORAGE_KEY = "ai-assistant-position";
const DEFAULT_Z_INDEX = 9999;
const DEFAULT_ALT = "AI 助手";
/** 头像静置阴影；焦点环在其上叠加一圈主题色外描边 */
const BASE_SHADOW = "0 4px 12px rgba(0,0,0,0.25)";

/** 拖拽位移；零偏移复用同一个对象，让 React 直接跳过重渲染 */
const NO_OFFSET = { x: 0, y: 0 };

interface FloatingAvatarBaseProps {
  /** 头像边长，默认 56；透传到锚点 / 吸附 / 遮罩 / 气泡全套几何 */
  size?: number;
  /** 位置持久化键名，默认 "ai-assistant-position"。
   *  只隔离头像位置——气泡与角标是模块级单例，同页多实例共享同一条消息（见 README） */
  storageKey?: string;
  /** 头像无障碍名，默认 "AI 助手"；用于 alt 与容器 aria-label */
  alt?: string;
  /** 气泡关闭按钮无障碍名，默认「关闭消息」 */
  closeLabel?: string;
  /** 头像与气泡层级，默认 9999；遮罩取 zIndex - 1 */
  zIndex?: number;
  /** 首次访问（无持久化记录）时的默认锚点，默认右下 padding；只在挂载时生效 */
  defaultAnchor?: EdgeAnchor;
  /** 拖拽落锚 / 视口夹紧后回调（值变化才触发；挂载时的持久化恢复不触发） */
  onAnchorChange?: (anchor: EdgeAnchor) => void;
  /** avatarSrc 图片加载失败回调（children 形象由消费方自行兜底） */
  onImgError?: (event: SyntheticEvent<HTMLImageElement>) => void;
  /** 位移小于 CLICK_THRESHOLD 的松手算点击，回调在这里触发 */
  onClick?: () => void;
  /** 松手时是否吸附到最近的四角 */
  snapToCorner?: boolean;
  /** 锚定可视化遮罩："off" 关闭（默认）/ "drag" 仅拖拽中 / "always" 常驻 */
  mask?: AnchorMaskMode;
  /** 遮罩的细粒度开关，省略的项都默认打开（其中 debug 默认仅 dev 打开） */
  maskOptions?: AnchorMaskOptions;
  /** 遮罩根节点类名，便于外部覆盖样式 */
  maskClassName?: string;
  /** 遮罩根节点内联样式；不要覆盖 pointerEvents，否则会挡住头像的命中区域 */
  maskStyle?: CSSProperties;
}

/**
 * 头像内容二选一（编译期挡绝大多数，运行时兜底）：
 *   - avatarSrc：图片快捷路径（objectFit cover / draggable false / onImgError 只属于它）
 *   - children：任意节点逃生口（Lottie / video / 未来的帧动画形象）
 * 注意 ReactNode 本身包含 undefined，显式传 children={undefined} 仍能通过编译；
 * 运行时两者全缺省时渲染空圆形兜底，不崩。
 */
export type FloatingAvatarProps = FloatingAvatarBaseProps &
  ({ avatarSrc: string; children?: undefined } | { avatarSrc?: undefined; children: ReactNode });

export default function FloatingAvatar({
  avatarSrc,
  children,
  size = DEFAULT_SIZE,
  storageKey = DEFAULT_STORAGE_KEY,
  alt = DEFAULT_ALT,
  closeLabel,
  zIndex = DEFAULT_Z_INDEX,
  defaultAnchor,
  onAnchorChange,
  onImgError,
  onClick,
  snapToCorner: snapEnabled = true,
  mask = "off",
  maskOptions,
  maskClassName,
  maskStyle,
}: FloatingAvatarProps) {
  const { token } = theme.useToken();
  const ref = useRef<HTMLDivElement>(null);
  const viewport = useViewportSize();
  const { message, badgeVisible } = useAvatarState();
  const [focusVisible, setFocusVisible] = useState(false);
  const destroyMessage = useCallback((id: string, reason: AvatarMessageCloseReason) => {
    avatarMessage.destroy(id, reason);
  }, []);
  const {
    anchor,
    style: anchorStyle,
    setAnchor,
  } = useEdgeAnchor({
    storageKey,
    elementWidth: size,
    elementHeight: size,
    padding: EDGE_PADDING,
    defaultAnchor,
    onAnchorChange,
  });

  const [dragOffset, setDragOffset] = useState(NO_OFFSET);
  const [dragging, setDragging] = useState(false);
  // 拖拽中的落点预览：只在遮罩开启时维护，供幽灵圈 / 锚定边 / 调试面板使用
  const [preview, setPreview] = useState<DragPreview | null>(null);
  // 按下瞬间的位置与视口快照：整段拖拽都用它换算，避免中途重渲染导致基准漂移
  const dragOriginRef = useRef({ left: 0, top: 0, viewportWidth: 0, viewportHeight: 0 });

  // 关掉遮罩时不必计算预览，拖拽路径保持最小开销
  const maskEnabled = mask !== "off";

  /** 落点决策：拖拽预览与真实落锚共用同一个函数，保证幽灵圈位置就是松手后的位置 */
  const resolveAt = (left: number, top: number, viewportWidth: number, viewportHeight: number) =>
    resolveDrop({
      left,
      top,
      viewportWidth,
      viewportHeight,
      elementWidth: size,
      elementHeight: size,
      snap: { enabled: snapEnabled, threshold: SNAP_THRESHOLD, padding: EDGE_PADDING },
    });

  useDraggable(ref, {
    onDragStart: () => {
      const { width: viewportWidth, height: viewportHeight } = viewport;
      // 拖拽起点取当前渲染出的锚点位置，与屏幕上的位置保持一致
      const origin = anchorToXY(anchor, viewportWidth, viewportHeight, size, size);
      dragOriginRef.current = { ...origin, viewportWidth, viewportHeight };
      setDragging(true);

      if (!maskEnabled) return;
      const resolution = resolveAt(origin.left, origin.top, viewportWidth, viewportHeight);
      setPreview({
        current: origin,
        landing: resolution.position,
        anchor: resolution.anchor,
        snapped: resolution.snapped,
        delta: { x: 0, y: 0 },
      });
    },
    onDragMove: (deltaX, deltaY) => {
      const { left, top, viewportWidth, viewportHeight } = dragOriginRef.current;
      const current = clampToViewport(
        left + deltaX,
        top + deltaY,
        viewportWidth,
        viewportHeight,
        size,
        size,
      );
      setDragOffset({ x: current.left - left, y: current.top - top });

      if (!maskEnabled) return;
      const resolution = resolveAt(left + deltaX, top + deltaY, viewportWidth, viewportHeight);
      setPreview({
        current,
        landing: resolution.position,
        anchor: resolution.anchor,
        snapped: resolution.snapped,
        delta: { x: deltaX, y: deltaY },
      });
    },
    onDragEnd: (deltaX, deltaY) => {
      setDragging(false);
      setPreview(null);
      const { left, top, viewportWidth, viewportHeight } = dragOriginRef.current;

      if (Math.abs(deltaX) < CLICK_THRESHOLD && Math.abs(deltaY) < CLICK_THRESHOLD) {
        setDragOffset(NO_OFFSET);
        onClick?.();
        return;
      }

      // 锚点能精确还原落点，因此与 setDragOffset 同批提交不会产生视觉跳变
      const resolution = resolveAt(left + deltaX, top + deltaY, viewportWidth, viewportHeight);
      setAnchor(resolution.anchor);
      setDragOffset(NO_OFFSET);
    },
    onDragCancel: () => {
      setDragging(false);
      setPreview(null);
      setDragOffset(NO_OFFSET);
    },
  });

  /** a11y：role="button" 的 div 不会自发 click，Enter / Space 在这里补上激活语义 */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space 在可聚焦元素上默认会滚动页面
    event.preventDefault();
    onClick?.();
  };

  // 内联样式写不了 :focus-visible，用可注入的纯函数判断焦点模态（鼠标点击不亮环）
  const onFocus = (event: FocusEvent<HTMLDivElement>) =>
    setFocusVisible(isFocusVisible(event.currentTarget));
  const onBlur = () => setFocusVisible(false);

  // 视口未知（SSR 首帧 / 无 JS 的服务端 HTML）先隐藏，layout effect 测出真实视口后绘制
  const viewportUnknown = viewport.width === 0;

  return (
    <>
      {/* 遮罩挂在头像之前：fixed 层级不受头像 transform 影响，z-index 低于头像，只做解释不参与交互 */}
      <AnchorMask
        mode={mask}
        dragging={dragging}
        viewport={viewport}
        anchor={anchor}
        preview={preview}
        elementSize={size}
        padding={EDGE_PADDING}
        threshold={SNAP_THRESHOLD}
        snapEnabled={snapEnabled}
        options={maskOptions}
        className={maskClassName}
        style={maskStyle}
        zIndex={zIndex - 1}
      />
      {/* 气泡在头像之前渲染：两者同层，气泡本身不会盖住头像 */}
      <AvatarBubble
        message={message}
        hidden={dragging}
        anchor={anchor}
        viewport={viewport}
        elementSize={size}
        onClose={destroyMessage}
        closeLabel={closeLabel}
        zIndex={zIndex}
      />
      {/* 容器层：几何 / 拖拽 / a11y / 焦点环，自身不裁剪（角标红点靠它不被切掉） */}
      <div
        ref={ref}
        data-avatar-root=""
        role="button"
        tabIndex={0}
        aria-label={alt}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        style={{
          position: "fixed",
          ...anchorStyle,
          transform:
            dragOffset.x === 0 && dragOffset.y === 0
              ? undefined
              : `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
          width: size,
          height: size,
          borderRadius: "50%",
          cursor: dragging ? "grabbing" : "grab",
          boxShadow: focusVisible ? `0 0 0 2px ${token.colorPrimary}, ${BASE_SHADOW}` : BASE_SHADOW,
          zIndex,
          userSelect: "none",
          touchAction: "none",
          visibility: viewportUnknown ? "hidden" : undefined,
        }}
      >
        {/* 角标由 avatarBadge 手动控制；红点落在圆周右上，必须在裁剪层之外才不会被切 */}
        <Badge dot={badgeVisible} offset={[-4, 4]}>
          {/* 槽位裁剪层：只包内容，方形内容进去也是圆形；未来帧动画形象从 children 接入 */}
          <span
            data-avatar-slot=""
            style={{
              display: "block",
              width: size,
              height: size,
              borderRadius: "50%",
              overflow: "hidden",
            }}
          >
            {children ??
              (avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={alt}
                  draggable={false}
                  onError={onImgError}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : null)}
          </span>
        </Badge>
      </div>
    </>
  );
}
