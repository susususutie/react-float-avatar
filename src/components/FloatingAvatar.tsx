/**
 * FloatingAvatar — 浮动头像
 *
 * 交互链路：
 *   useDraggable 报告指针增量 → 拖拽中用 transform 位移（不动 CSS 定位，走 GPU 合成）
 *   → 松手时用 resolveDrop 算出锚点，并在同一次提交里把 transform 清零。
 *
 * 位置策略：
 *   - 锚点语义、持久化、缩放校验由 useEdgeAnchor 负责
 *   - 落点决策（夹紧 + 四角吸附 + 反算锚点）统一走 resolveDrop，预览与真实落锚共用
 *   - 位移小于 CLICK_THRESHOLD 视为点击：不落锚点，元素回到拖拽前的位置
 *   - 规则本身不可见，可用 mask 打开可视化遮罩（见 AnchorMask）
 *
 * 常量语义：ELEMENT_SIZE 头像边长（正方形）、EDGE_PADDING 默认锚定间距兼吸附间距、
 * SNAP_THRESHOLD 吸附触发半径、CLICK_THRESHOLD 点击/拖拽分界、STORAGE_KEY 持久化键名。
 */

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import avatarImg from "./avatar.png";
import AnchorMask from "./AnchorMask";
import type { AnchorMaskMode, AnchorMaskOptions, DragPreview } from "./AnchorMask";
import { useDraggable } from "../hooks/useDraggable";
import { anchorToXY, clampToViewport, useEdgeAnchor } from "../hooks/useEdgeAnchor";
import { resolveDrop } from "../hooks/resolveDrop";
import { useViewportSize } from "../hooks/useViewportSize";

const ELEMENT_SIZE = 56;
const EDGE_PADDING = 24;
const SNAP_THRESHOLD = 80;
const CLICK_THRESHOLD = 5;
const STORAGE_KEY = "ai-assistant-position";

/** 拖拽位移；零偏移复用同一个对象，让 React 直接跳过重渲染 */
const NO_OFFSET = { x: 0, y: 0 };

interface FloatingAvatarProps {
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

export default function FloatingAvatar({
  onClick,
  snapToCorner: snapEnabled = true,
  mask = "off",
  maskOptions,
  maskClassName,
  maskStyle,
}: FloatingAvatarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const viewport = useViewportSize();
  const {
    anchor,
    style: anchorStyle,
    setAnchor,
  } = useEdgeAnchor({
    storageKey: STORAGE_KEY,
    elementWidth: ELEMENT_SIZE,
    elementHeight: ELEMENT_SIZE,
    padding: EDGE_PADDING,
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
      elementWidth: ELEMENT_SIZE,
      elementHeight: ELEMENT_SIZE,
      snap: { enabled: snapEnabled, threshold: SNAP_THRESHOLD, padding: EDGE_PADDING },
    });

  useDraggable(ref, {
    onDragStart: () => {
      const { width: viewportWidth, height: viewportHeight } = viewport;
      // 拖拽起点取当前渲染出的锚点位置，与屏幕上的位置保持一致
      const origin = anchorToXY(anchor, viewportWidth, viewportHeight, ELEMENT_SIZE, ELEMENT_SIZE);
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
        ELEMENT_SIZE,
        ELEMENT_SIZE,
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

  return (
    <>
      {/* 遮罩挂在头像之前：fixed 层级不受头像 transform 影响，z-index 低于头像，只做解释不参与交互 */}
      <AnchorMask
        mode={mask}
        dragging={dragging}
        viewport={viewport}
        anchor={anchor}
        preview={preview}
        elementSize={ELEMENT_SIZE}
        padding={EDGE_PADDING}
        threshold={SNAP_THRESHOLD}
        snapEnabled={snapEnabled}
        options={maskOptions}
        className={maskClassName}
        style={maskStyle}
      />
      <div
        ref={ref}
        style={{
          position: "fixed",
          ...anchorStyle,
          transform:
            dragOffset.x === 0 && dragOffset.y === 0
              ? undefined
              : `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
          width: ELEMENT_SIZE,
          height: ELEMENT_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          cursor: dragging ? "grabbing" : "grab",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          zIndex: 9999,
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <img
          src={avatarImg}
          alt="AI 助手"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    </>
  );
}
