import { describe, expect, it } from "vite-plus/test";
import { resolveBubblePlacement } from "./resolveBubblePlacement";

const VIEWPORT = { width: 1440, height: 900 };
const AVATAR_SIZE = 56;
const GAP = 12;
const MARGIN = 12;

describe("resolveBubblePlacement", () => {
  it("默认开在头顶，右对齐锚定边，箭头指向头像中心", () => {
    const placement = resolveBubblePlacement({
      anchor: {
        horizontal: { edge: "right", offset: 24 },
        vertical: { edge: "bottom", offset: 24 },
      },
      avatarPosition: { left: 1360, top: 820 },
      avatarSize: AVATAR_SIZE,
      bubble: { width: 240, naturalHeight: 120, chromeHeight: 0 },
      viewport: VIEWPORT,
      gap: GAP,
      margin: MARGIN,
    });

    expect(placement.placement).toBe("top");
    // 用 bottom 定位：卡片下边缘离视口底部 = 视口高 - 头像 top + 间距
    expect(placement.edgeOffset).toBe(900 - 820 + GAP);
    expect(placement.left).toBe(1360 + AVATAR_SIZE - 240);
    expect(placement.arrowLeft).toBe(212);
    expect(placement.contentMaxHeight).toBe(0);
  });

  it("头像在上半屏且上方放不下时翻到下方", () => {
    const placement = resolveBubblePlacement({
      anchor: { horizontal: { edge: "left", offset: 100 }, vertical: { edge: "top", offset: 20 } },
      avatarPosition: { left: 100, top: 20 },
      avatarSize: AVATAR_SIZE,
      bubble: { width: 240, naturalHeight: 400, chromeHeight: 0 },
      viewport: VIEWPORT,
      gap: GAP,
      margin: MARGIN,
    });

    expect(placement.placement).toBe("bottom");
    expect(placement.edgeOffset).toBe(20 + AVATAR_SIZE + GAP);
    expect(placement.left).toBe(100);
    expect(placement.arrowLeft).toBe(28);
  });

  it("头像在下半屏且上下都放不下时留在上方，并限制正文区高度", () => {
    const placement = resolveBubblePlacement({
      anchor: {
        horizontal: { edge: "right", offset: 24 },
        vertical: { edge: "bottom", offset: 24 },
      },
      avatarPosition: { left: 1360, top: 700 },
      avatarSize: AVATAR_SIZE,
      bubble: { width: 240, naturalHeight: 700, chromeHeight: 60 },
      viewport: VIEWPORT,
      gap: GAP,
      margin: MARGIN,
    });

    expect(placement.placement).toBe("top");
    // 高度预算 = 上方可用(688) - 间距(12) = 676，减去 chrome 60 → 正文限高 616
    expect(placement.contentMaxHeight).toBe(616);
    // 定位不依赖高度：卡片下边缘固定在头像上方 12px
    expect(placement.edgeOffset).toBe(900 - 700 + GAP);
  });

  it("贴边时水平夹紧，箭头跟着夹紧结果走", () => {
    const placement = resolveBubblePlacement({
      anchor: {
        horizontal: { edge: "right", offset: 0 },
        vertical: { edge: "bottom", offset: 24 },
      },
      avatarPosition: { left: 1384, top: 820 },
      avatarSize: AVATAR_SIZE,
      bubble: { width: 240, naturalHeight: 120, chromeHeight: 0 },
      viewport: VIEWPORT,
      gap: GAP,
      margin: MARGIN,
    });

    expect(placement.left).toBe(VIEWPORT.width - 240 - MARGIN);
    expect(placement.arrowLeft).toBe(240 - 20);
    // 贴边时箭头被夹在圆角内，允许偏离头像中心约一个箭头半宽
    expect(
      Math.abs(placement.left + placement.arrowLeft - (1384 + AVATAR_SIZE / 2)),
    ).toBeLessThanOrEqual(8);
  });

  it("窄视口下气泡仍完整落在视口内", () => {
    const placement = resolveBubblePlacement({
      anchor: { horizontal: { edge: "left", offset: 0 }, vertical: { edge: "top", offset: 0 } },
      avatarPosition: { left: 0, top: 400 },
      avatarSize: AVATAR_SIZE,
      bubble: { width: 376, naturalHeight: 120, chromeHeight: 0 },
      viewport: { width: 400, height: 800 },
      gap: GAP,
      margin: MARGIN,
    });

    expect(placement.left).toBe(MARGIN);
    expect(placement.left + 376).toBeLessThanOrEqual(400 - MARGIN);
    expect(placement.arrowLeft).toBe(20);
  });

  it("气泡永远不会盖住头像（间距不小于 gap）", () => {
    const cases = [
      { left: 1360, top: 820 },
      { left: 100, top: 20 },
      { left: 700, top: 450 },
    ];

    for (const avatarPosition of cases) {
      const placement = resolveBubblePlacement({
        anchor: {
          horizontal: { edge: "left", offset: avatarPosition.left },
          vertical: { edge: "bottom", offset: 24 },
        },
        avatarPosition,
        avatarSize: AVATAR_SIZE,
        bubble: { width: 240, naturalHeight: 120, chromeHeight: 40 },
        viewport: VIEWPORT,
        gap: GAP,
        margin: MARGIN,
      });

      if (placement.placement === "top") {
        // 卡片下边缘 = 视口高 - edgeOffset，必须不高于头像 top - gap
        expect(VIEWPORT.height - placement.edgeOffset).toBeLessThanOrEqual(
          avatarPosition.top - GAP,
        );
      } else {
        expect(placement.edgeOffset).toBeGreaterThanOrEqual(avatarPosition.top + AVATAR_SIZE + GAP);
      }
    }
  });
});
