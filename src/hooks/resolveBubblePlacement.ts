/**
 * resolveBubblePlacement — 气泡定位（纯函数）
 *
 * 规则（与 antd Tooltip 的取向一致）：
 *   1. 默认开在头顶、箭头朝下；
 *   2. 上方放不下、且头像在上半屏、下方放得下 → 翻到下方；
 *   3. 上下都放不下的极端情况 → 留在空间较大的一侧，并限制正文区高度（内部滚动）；
 *   4. 水平方向按锚定边对齐后夹紧到视口内边距，箭头位置随夹紧结果重算。
 *
 * 两个关键约定：
 *   - 贴头像那一侧用 edgeOffset 定位（top 放置时作用于 bottom，bottom 放置时作用于 top），
 *     位置不依赖气泡高度：内容变高时气泡朝远离头像的方向生长，「尾巴尖到头像的间距」始终精确。
 *   - 判定用**自然高度**（未限高时的高度），不要用限高后的实际高度，否则会出现
 *     「限高 → 变矮 → 又判定放得下 → 取消限高」的来回抖动。
 */

import type { EdgeAnchor, XY } from "./useEdgeAnchor";
import type { ViewportSize } from "./useViewportSize";

export interface BubbleMetrics {
  width: number;
  /** 未限高时的整体高度（含标题、操作区、内边距） */
  naturalHeight: number;
  /** 标题、操作区与内边距之和（= 整体高度 - 正文区可视高度） */
  chromeHeight: number;
}

export interface ResolveBubblePlacementOptions {
  anchor: EdgeAnchor;
  avatarPosition: XY;
  avatarSize: number;
  bubble: BubbleMetrics;
  viewport: ViewportSize;
  /** 气泡卡片边缘与头像之间的间距（尾巴伸出的部分由调用方补进来） */
  gap: number;
  /** 气泡距视口边缘的最小间距 */
  margin: number;
}

export interface BubblePlacement {
  placement: "top" | "bottom";
  left: number;
  /**
   * 贴头像那一侧的定位值：placement 为 top 时给 `bottom`，为 bottom 时给 `top`。
   * 用「贴头像的一侧」而不是 top 坐标，气泡间距就不受自身高度影响。
   */
  edgeOffset: number;
  /** 箭头相对气泡左端的水平位置 */
  arrowLeft: number;
  /** 正文区高度上限；0 表示不限制 */
  contentMaxHeight: number;
}

/** 箭头距气泡圆角的最小水平距离（圆角 + 箭头自身半宽） */
export const ARROW_INSET = 20;
/** 正文区被压缩时的最小高度，避免极小视口下正文完全不可见 */
export const MIN_CONTENT_HEIGHT = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function resolveBubblePlacement({
  anchor,
  avatarPosition,
  avatarSize,
  bubble,
  viewport,
  gap,
  margin,
}: ResolveBubblePlacementOptions): BubblePlacement {
  const { width: viewportWidth, height: viewportHeight } = viewport;
  const above = avatarPosition.top - margin;
  const below = viewportHeight - (avatarPosition.top + avatarSize) - margin;
  const avatarCenterY = avatarPosition.top + avatarSize / 2;

  let placement: "top" | "bottom";
  if (bubble.naturalHeight <= above - gap) {
    placement = "top";
  } else if (avatarCenterY < viewportHeight / 2 && bubble.naturalHeight <= below - gap) {
    placement = "bottom";
  } else {
    placement = above >= below ? "top" : "bottom";
  }

  // 气泡可用的高度预算：还要扣掉与头像之间的间距
  const heightBudget = Math.max(0, (placement === "top" ? above : below) - gap);
  const contentNaturalHeight = Math.max(bubble.naturalHeight - bubble.chromeHeight, 0);
  const contentMaxHeight =
    contentNaturalHeight <= heightBudget - bubble.chromeHeight
      ? 0
      : Math.max(MIN_CONTENT_HEIGHT, heightBudget - bubble.chromeHeight);

  const left =
    anchor.horizontal.edge === "right"
      ? clamp(
          avatarPosition.left + avatarSize - bubble.width,
          margin,
          viewportWidth - bubble.width - margin,
        )
      : clamp(avatarPosition.left, margin, viewportWidth - bubble.width - margin);
  const edgeOffset =
    placement === "top"
      ? viewportHeight - avatarPosition.top + gap
      : avatarPosition.top + avatarSize + gap;
  const arrowLeft = clamp(
    avatarPosition.left + avatarSize / 2 - left,
    Math.min(ARROW_INSET, bubble.width / 2),
    bubble.width - Math.min(ARROW_INSET, bubble.width / 2),
  );

  return { placement, left, edgeOffset, arrowLeft, contentMaxHeight };
}
