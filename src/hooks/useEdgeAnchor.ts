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
 * 持久化：
 *   锚点写入 localStorage；读取时校验结构并夹紧到当前视口范围内。
 */

import { useEffect, useMemo, useState } from "react";

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

function defaultAnchor(padding: number): EdgeAnchor {
  return {
    horizontal: { edge: "right", offset: padding },
    vertical: { edge: "bottom", offset: padding },
  };
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

/** 读取并校验锚点；结构非法或读取失败时回退到默认锚点 */
export function loadAnchor(options: EdgeAnchorOptions): EdgeAnchor {
  try {
    const stored = localStorage.getItem(options.storageKey);
    if (!stored) return defaultAnchor(options.padding);
    const parsed: unknown = JSON.parse(stored);
    if (!isEdgeAnchor(parsed)) return defaultAnchor(options.padding);
    return validateAnchor(
      parsed,
      window.innerWidth,
      window.innerHeight,
      options.elementWidth,
      options.elementHeight,
    );
  } catch {
    // JSON 解析失败或 localStorage 不可用
    return defaultAnchor(options.padding);
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

function isSameAnchor(a: EdgeAnchor, b: EdgeAnchor): boolean {
  return (
    a.horizontal.edge === b.horizontal.edge &&
    a.horizontal.offset === b.horizontal.offset &&
    a.vertical.edge === b.vertical.edge &&
    a.vertical.offset === b.vertical.offset
  );
}

/**
 * 锚点状态 + 持久化 + 视口缩放校验。
 *
 * state 是唯一事实来源：渲染用返回的 style（由 state 派生），事件回调直接用渲染期的
 * anchor，持久化由 effect 跟随 state 完成，因此不存在状态与存储不一致的路径。
 */
export function useEdgeAnchor({
  storageKey,
  elementWidth,
  elementHeight,
  padding,
}: EdgeAnchorOptions) {
  const [anchor, setAnchor] = useState<EdgeAnchor>(() =>
    loadAnchor({ storageKey, elementWidth, elementHeight, padding }),
  );

  // 锚点一旦变化就写回存储；首次渲染会把默认值或夹紧后的值写回，保证两边一致
  useEffect(() => {
    saveAnchor(storageKey, anchor);
  }, [storageKey, anchor]);

  // 视口缩小后 offset 可能超出范围，需要夹回合法区间
  useEffect(() => {
    const onResize = () => {
      setAnchor((current) => {
        const validated = validateAnchor(
          current,
          window.innerWidth,
          window.innerHeight,
          elementWidth,
          elementHeight,
        );
        return isSameAnchor(validated, current) ? current : validated;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [elementWidth, elementHeight]);

  const style = useMemo(() => anchorToCSS(anchor), [anchor]);

  return { anchor, style, setAnchor };
}
