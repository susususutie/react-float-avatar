/**
 * snapToCorner — 四角吸附判定（纯函数）
 *
 * 落点距某个角落的目标位置不超过 threshold 时，返回该角的锚点（offset = padding）；
 * 否则返回 null，表示保持自由落点。
 */

import type { EdgeAnchor } from "./useEdgeAnchor";

export interface SnapToCornerOptions {
  /** 落点：元素左上角绝对坐标 */
  left: number;
  top: number;
  viewportWidth: number;
  viewportHeight: number;
  elementWidth: number;
  elementHeight: number;
  /** 触发吸附的最大距离（px） */
  threshold: number;
  /** 吸附后元素距视口边缘的间距（px） */
  padding: number;
}

interface Corner {
  left: number;
  top: number;
  anchor: EdgeAnchor;
}

export function snapToCorner({
  left,
  top,
  viewportWidth,
  viewportHeight,
  elementWidth,
  elementHeight,
  threshold,
  padding,
}: SnapToCornerOptions): EdgeAnchor | null {
  const leftOffset = padding;
  const rightOffset = viewportWidth - elementWidth - padding;
  const topOffset = padding;
  const bottomOffset = viewportHeight - elementHeight - padding;

  const corners: Corner[] = [
    {
      left: leftOffset,
      top: topOffset,
      anchor: {
        horizontal: { edge: "left", offset: padding },
        vertical: { edge: "top", offset: padding },
      },
    },
    {
      left: rightOffset,
      top: topOffset,
      anchor: {
        horizontal: { edge: "right", offset: padding },
        vertical: { edge: "top", offset: padding },
      },
    },
    {
      left: leftOffset,
      top: bottomOffset,
      anchor: {
        horizontal: { edge: "left", offset: padding },
        vertical: { edge: "bottom", offset: padding },
      },
    },
    {
      left: rightOffset,
      top: bottomOffset,
      anchor: {
        horizontal: { edge: "right", offset: padding },
        vertical: { edge: "bottom", offset: padding },
      },
    },
  ];

  let closest = corners[0];
  let closestDistance = Infinity;
  for (const corner of corners) {
    const distance = Math.hypot(corner.left - left, corner.top - top);
    if (distance < closestDistance) {
      closest = corner;
      closestDistance = distance;
    }
  }

  return closestDistance <= threshold ? closest.anchor : null;
}
