/**
 * useEdgeAnchor — 边缘锚定
 *
 * 锚点语义（全项目唯一约定）：
 *   offset = 元素边缘到所锚定视口边缘的距离（px）。
 *   因此 anchorToXY() 与 xyToAnchor() 必须严格互逆，否则拖拽松手后元素会整体
 *   偏移半个自身尺寸（项目里曾出现的「松手后位移一段」问题）。
 *
 * 数据结构 EdgeAnchor：
 *   { horizontal: { edge, offset }, vertical: { edge, offset } }
 *
 * CSS 定位策略：
 *   CSS 属性名镜像锚定边（锚定 right 就用 style.right），窗口缩放时浏览器自动跟随。
 *
 * 持久化（SSR / hydration 安全）：
 *   - 渲染期不读 localStorage：首帧只由 props 派生（defaultAnchor 或右下默认），
 *     服务端与客户端 hydration 首帧因此完全一致，不会 mismatch；
 *   - 恢复放在同构 useLayoutEffect，绘制前完成——纯 CSR 没有「先画右下角再跳走」的一帧；
 *   - 恢复（含结构校验、夹紧）不触发 onAnchorChange：它不是用户动作；
 *   - 视口缩放后的夹紧、拖拽落锚走 setAnchor：值变化才回调 onAnchorChange。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsoLayoutEffect } from "./useIsoLayoutEffect";

export interface EdgeAnchor {
  horizontal: { edge: "left" | "right"; offset: number };
  vertical: { edge: "top" | "bottom"; offset: number };
}

export interface XY {
  left: number;
  top: number;
}

export interface EdgeAnchorOptions {
  /** localStorage 键名 */
  storageKey: string;
  elementWidth: number;
  elementHeight: number;
  /** 默认锚点距边缘的间距，同时作为四角吸附的间距 */
  padding: number;
  /** 首次访问（无持久化记录）时的默认锚点；省略则为右下 padding。只在挂载时生效（初始值语义） */
  defaultAnchor?: EdgeAnchor;
  /** 锚点提交且值变化时回调；挂载时的持久化恢复不触发 */
  onAnchorChange?: (anchor: EdgeAnchor) => void;
}

/** 锚点 → 绝对坐标（元素左上角） */
export function anchorToXY(
  anchor: EdgeAnchor,
  viewportWidth: number,
  viewportHeight: number,
  elementWidth: number,
  elementHeight: number,
): XY {
  return {
    left:
      anchor.horizontal.edge === "right"
        ? viewportWidth - elementWidth - anchor.horizontal.offset
        : anchor.horizontal.offset,
    top:
      anchor.vertical.edge === "bottom"
        ? viewportHeight - elementHeight - anchor.vertical.offset
        : anchor.vertical.offset,
  };
}

/** 绝对坐标（元素左上角）→ 锚点：anchorToXY() 的逆运算 */
export function xyToAnchor(
  left: number,
  top: number,
  viewportWidth: number,
  viewportHeight: number,
  elementWidth: number,
  elementHeight: number,
): EdgeAnchor {
  const rightOffset = viewportWidth - elementWidth - left;
  const bottomOffset = viewportHeight - elementHeight - top;
  return {
    horizontal:
      left <= rightOffset ? { edge: "left", offset: left } : { edge: "right", offset: rightOffset },
    vertical:
      top <= bottomOffset ? { edge: "top", offset: top } : { edge: "bottom", offset: bottomOffset },
  };
}

/** 锚点 → CSS 定位属性（属性名与锚定边一致） */
export function anchorToCSS(anchor: EdgeAnchor): {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
} {
  const horizontal =
    anchor.horizontal.edge === "left"
      ? { left: anchor.horizontal.offset }
      : { right: anchor.horizontal.offset };
  const vertical =
    anchor.vertical.edge === "top"
      ? { top: anchor.vertical.offset }
      : { bottom: anchor.vertical.offset };
  return { ...horizontal, ...vertical };
}

/** 夹紧 offset：元素必须完整落在视口内 */
export function validateAnchor(
  anchor: EdgeAnchor,
  viewportWidth: number,
  viewportHeight: number,
  elementWidth: number,
  elementHeight: number,
): EdgeAnchor {
  const clamp = (offset: number, max: number) => Math.max(0, Math.min(offset, Math.max(0, max)));
  return {
    horizontal: {
      edge: anchor.horizontal.edge,
      offset: clamp(anchor.horizontal.offset, viewportWidth - elementWidth),
    },
    vertical: {
      edge: anchor.vertical.edge,
      offset: clamp(anchor.vertical.offset, viewportHeight - elementHeight),
    },
  };
}

/** 把元素左上角夹紧到视口内：拖拽跟随与落点结算共用同一套边界 */
export function clampToViewport(
  left: number,
  top: number,
  viewportWidth: number,
  viewportHeight: number,
  elementWidth: number,
  elementHeight: number,
): XY {
  return {
    left: Math.max(0, Math.min(left, viewportWidth - elementWidth)),
    top: Math.max(0, Math.min(top, viewportHeight - elementHeight)),
  };
}

/** 初始锚点：消费方 defaultAnchor 优先，否则右下 padding */
function initialAnchor(padding: number, explicit?: EdgeAnchor): EdgeAnchor {
  return (
    explicit ?? {
      horizontal: { edge: "right", offset: padding },
      vertical: { edge: "bottom", offset: padding },
    }
  );
}

function isEdge(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function isAxis(value: unknown, edges: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) return false;
  const axis = value as { edge?: unknown; offset?: unknown };
  return (
    isEdge(axis.edge, edges) && typeof axis.offset === "number" && Number.isFinite(axis.offset)
  );
}

/** 结构校验：localStorage 里的脏数据不允许进入定位计算 */
function isEdgeAnchor(value: unknown): value is EdgeAnchor {
  if (typeof value !== "object" || value === null) return false;
  const anchor = value as { horizontal?: unknown; vertical?: unknown };
  return isAxis(anchor.horizontal, ["left", "right"]) && isAxis(anchor.vertical, ["top", "bottom"]);
}

/**
 * 读取持久化锚点；无记录、结构非法或存储不可用时返回 null。
 * 渲染期不调用它（SSR / hydration 安全），恢复时机由 useEdgeAnchor 的 layout effect 决定。
 */
export function readStoredAnchor(
  options: Pick<EdgeAnchorOptions, "storageKey">,
): EdgeAnchor | null {
  try {
    const stored = localStorage.getItem(options.storageKey);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isEdgeAnchor(parsed) ? parsed : null;
  } catch {
    // JSON 解析失败、结构非法或 localStorage 不可用（隐私模式 / SSR）
    return null;
  }
}

/** 写入锚点；失败（隐私模式、配额超出）静默忽略 */
export function saveAnchor(storageKey: string, anchor: EdgeAnchor): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(anchor));
  } catch {
    /* ignore */
  }
}

/** 两个锚点是否完全一致（包含锚定边与 offset） */
export function isSameAnchor(a: EdgeAnchor, b: EdgeAnchor): boolean {
  return (
    a.horizontal.edge === b.horizontal.edge &&
    a.horizontal.offset === b.horizontal.offset &&
    a.vertical.edge === b.vertical.edge &&
    a.vertical.offset === b.vertical.offset
  );
}

/**
 * 锚点状态 + 持久化恢复 + 视口缩放校验。
 *
 * state 是唯一事实来源：渲染用返回的 style（由 state 派生）；
 * setAnchor 是「值变化才提交」的唯一入口——落锚与视口夹紧经它回调 onAnchorChange，
 * 持久化恢复直接写 state + ref，因此恢复不会触发回调。
 */
export function useEdgeAnchor({
  storageKey,
  elementWidth,
  elementHeight,
  padding,
  defaultAnchor: defaultAnchorProp,
  onAnchorChange,
}: EdgeAnchorOptions) {
  const [anchor, setAnchorState] = useState<EdgeAnchor>(() =>
    initialAnchor(padding, defaultAnchorProp),
  );

  // latest-ref：恢复效果读「最新一次渲染」的选项（defaultAnchor 是初始值语义，只在恢复时取初值用）
  const optionsRef = useRef({
    storageKey,
    elementWidth,
    elementHeight,
    padding,
    defaultAnchor: defaultAnchorProp,
  });
  optionsRef.current = {
    storageKey,
    elementWidth,
    elementHeight,
    padding,
    defaultAnchor: defaultAnchorProp,
  };
  // latest-ref：setAnchor / 恢复 / 保存都读同一份最新值，不依赖闭包里的渲染快照
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const changeRef = useRef(onAnchorChange);
  changeRef.current = onAnchorChange;
  const restoredRef = useRef(false);

  /** 提交锚点：值变化才写状态并回调（拖拽落锚与视口夹紧共用） */
  const setAnchor = useCallback((input: EdgeAnchor | ((prev: EdgeAnchor) => EdgeAnchor)) => {
    const prev = anchorRef.current;
    const next = typeof input === "function" ? input(prev) : input;
    if (isSameAnchor(next, prev)) return;
    anchorRef.current = next;
    setAnchorState(next);
    changeRef.current?.(next);
  }, []);

  // 持久化恢复：layout effect 在绘制前完成（纯 CSR 无跳动帧）；有记录用记录值（夹紧后），
  // 无记录则把初始锚点夹紧到当前视口。恢复不回调 onAnchorChange。
  useIsoLayoutEffect(() => {
    const current = optionsRef.current;
    const stored = readStoredAnchor(current);
    const candidate = stored ?? initialAnchor(current.padding, current.defaultAnchor);
    const validated = validateAnchor(
      candidate,
      window.innerWidth,
      window.innerHeight,
      current.elementWidth,
      current.elementHeight,
    );
    restoredRef.current = true;
    if (!isSameAnchor(validated, anchorRef.current)) {
      anchorRef.current = validated;
      setAnchorState(validated);
    }
  }, [storageKey, elementWidth, elementHeight, padding]);

  // 锚点一旦（恢复之后）变化就写回存储；恢复前不写，避免用初始默认值覆盖持久化记录
  useEffect(() => {
    if (!restoredRef.current) return;
    saveAnchor(storageKey, anchorRef.current);
  }, [storageKey, anchor]);

  // 视口缩小后 offset 可能超出范围，夹回合法区间（值变化时经 setAnchor 回调）
  useEffect(() => {
    const onResize = () => {
      setAnchor((current) =>
        validateAnchor(current, window.innerWidth, window.innerHeight, elementWidth, elementHeight),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [elementWidth, elementHeight, setAnchor]);

  const style = useMemo(() => anchorToCSS(anchor), [anchor]);

  return { anchor, style, setAnchor };
}
