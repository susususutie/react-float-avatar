/**
 * snapToCorner — 四角吸附（纯函数）
 *
 * cornerTargets() 是四角目标位置与锚点的唯一来源：吸附判定和拖拽遮罩都从它取几何，
 * 避免「画出来的吸附范围」与「真实触发范围」出现分歧。
 */

import type { EdgeAnchor, XY } from "./useEdgeAnchor";

export interface CornerTargetOptions {
  viewportWidth: number;
  viewportHeight: number;
  elementWidth: number;
  elementHeight: number;
  /** 吸附后元素距视口边缘的间距（px） */
  padding: number;
}

export interface CornerTarget {
  /** 角落目标位置：元素左上角坐标 */
  position: XY;
  anchor: EdgeAnchor;
}

export interface SnapToCornerOptions extends CornerTargetOptions {
  /** 落点：元素左上角绝对坐标 */
  left: number;
  top: number;
  /** 触发吸附的最大距离（px） */
  threshold: number;
}

/** 四个角落的目标位置与锚点（左上、右上、左下、右下） */
export function cornerTargets({
  viewportWidth,
  viewportHeight,
  elementWidth,
  elementHeight,
  padding,
}: CornerTargetOptions): CornerTarget[] {
  const right = viewportWidth - elementWidth - padding;
  const bottom = viewportHeight - elementHeight - padding;
  return [
    {
      position: { left: padding, top: padding },
      anchor: {
        horizontal: { edge: "left", offset: padding },
        vertical: { edge: "top", offset: padding },
      },
    },
    {
      position: { left: right, top: padding },
      anchor: {
        horizontal: { edge: "right", offset: padding },
        vertical: { edge: "top", offset: padding },
      },
    },
    {
      position: { left: padding, top: bottom },
      anchor: {
        horizontal: { edge: "left", offset: padding },
        vertical: { edge: "bottom", offset: padding },
      },
    },
    {
      position: { left: right, top: bottom },
      anchor: {
        horizontal: { edge: "right", offset: padding },
        vertical: { edge: "bottom", offset: padding },
      },
    },
  ];
}

/** 落点距某个角落目标点不超过 threshold 时返回该角锚点，否则返回 null（保持自由落点） */
export function snapToCorner(options: SnapToCornerOptions): EdgeAnchor | null {
  const { left, top, threshold } = options;

  let closest: CornerTarget | null = null;
  let closestDistance = Infinity;
  for (const target of cornerTargets(options)) {
    const distance = Math.hypot(target.position.left - left, target.position.top - top);
    if (distance < closestDistance) {
      closest = target;
      closestDistance = distance;
    }
  }

  return closest && closestDistance <= threshold ? closest.anchor : null;
}
