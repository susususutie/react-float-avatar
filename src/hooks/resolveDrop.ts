/**
 * resolveDrop — 落点决策（纯函数）
 *
 * 把「元素左上角落点」翻译成「元素最终位置 + 锚点」，是拖拽预览与真实落锚**唯一**
 * 共用的决策：遮罩上的幽灵框就是这里算出的 position，所以预览不会与实际结果分歧。
 */

import { anchorToXY, clampToViewport, xyToAnchor } from "./useEdgeAnchor";
import type { EdgeAnchor, XY } from "./useEdgeAnchor";
import { snapToCorner } from "./snapToCorner";

export interface ResolveDropOptions {
  /** 元素左上角落点（未经夹紧） */
  left: number;
  top: number;
  viewportWidth: number;
  viewportHeight: number;
  elementWidth: number;
  elementHeight: number;
  /** 省略或 enabled=false 时不吸附，落点即最终位置 */
  snap?: {
    enabled: boolean;
    threshold: number;
    padding: number;
  };
}

export interface DropResolution {
  /** 最终位置：元素左上角坐标（吸附命中时与输入落点不同） */
  position: XY;
  /** 最终锚点 */
  anchor: EdgeAnchor;
  /** 是否命中四角吸附 */
  snapped: boolean;
}

export function resolveDrop(options: ResolveDropOptions): DropResolution {
  const { left, top, viewportWidth, viewportHeight, elementWidth, elementHeight, snap } = options;
  const released = clampToViewport(
    left,
    top,
    viewportWidth,
    viewportHeight,
    elementWidth,
    elementHeight,
  );

  const snappedAnchor = snap?.enabled
    ? snapToCorner({
        ...released,
        viewportWidth,
        viewportHeight,
        elementWidth,
        elementHeight,
        threshold: snap.threshold,
        padding: snap.padding,
      })
    : null;

  const anchor =
    snappedAnchor ??
    xyToAnchor(
      released.left,
      released.top,
      viewportWidth,
      viewportHeight,
      elementWidth,
      elementHeight,
    );

  return {
    anchor,
    position: anchorToXY(anchor, viewportWidth, viewportHeight, elementWidth, elementHeight),
    snapped: snappedAnchor !== null,
  };
}
