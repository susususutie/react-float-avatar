import { describe, expect, it } from "vite-plus/test";
import { resolveDrop } from "./resolveDrop";
import { cornerTargets } from "./snapToCorner";
import { anchorToXY, xyToAnchor } from "./useEdgeAnchor";

const BASE = {
  viewportWidth: 1440,
  viewportHeight: 900,
  elementWidth: 56,
  elementHeight: 56,
};

const SNAP = { enabled: true, threshold: 80, padding: 24 };

describe("resolveDrop", () => {
  it("自由落点：位置保持不变，锚点由坐标反算", () => {
    const result = resolveDrop({ ...BASE, left: 700, top: 400, snap: SNAP });

    expect(result.snapped).toBe(false);
    expect(result.position).toEqual({ left: 700, top: 400 });
    expect(result.anchor).toEqual(xyToAnchor(700, 400, 1440, 900, 56, 56));
  });

  it("命中角落：落到四角目标点，用该角的锚点", () => {
    const bottomRight = cornerTargets({ ...BASE, padding: 24 })[3];
    const result = resolveDrop({
      ...BASE,
      left: bottomRight.position.left - 20,
      top: bottomRight.position.top - 20,
      snap: SNAP,
    });

    expect(result.snapped).toBe(true);
    expect(result.anchor).toEqual(bottomRight.anchor);
    expect(result.position).toEqual(bottomRight.position);
  });

  it("越界落点被夹回视口内", () => {
    const result = resolveDrop({
      ...BASE,
      left: 5000,
      top: 5000,
      snap: { ...SNAP, enabled: false },
    });

    expect(result.position).toEqual({ left: 1440 - 56, top: 900 - 56 });
  });

  it("关闭吸附时不落角落", () => {
    const result = resolveDrop({
      ...BASE,
      left: 1330,
      top: 800,
      snap: { ...SNAP, enabled: false },
    });

    expect(result.snapped).toBe(false);
    expect(result.position).toEqual({ left: 1330, top: 800 });
  });

  it("预览位置恒等于锚点还原出的位置（幽灵圈不会撒谎）", () => {
    const drops: [number, number][] = [
      [0, 0],
      [200, 150],
      [700, 400],
      [1360, 844],
      [1330, 800],
      [5000, 5000],
    ];

    for (const [left, top] of drops) {
      const result = resolveDrop({ ...BASE, left, top, snap: SNAP });
      expect(anchorToXY(result.anchor, 1440, 900, 56, 56)).toEqual(result.position);
    }
  });
});
