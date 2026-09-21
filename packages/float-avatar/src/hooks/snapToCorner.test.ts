import { describe, expect, it } from "vite-plus/test";
import { cornerTargets, snapToCorner } from "./snapToCorner";
import { anchorToXY } from "./useEdgeAnchor";

const BASE = {
  viewportWidth: 1440,
  viewportHeight: 900,
  elementWidth: 56,
  elementHeight: 56,
  threshold: 80,
  padding: 24,
};

const BOTTOM_RIGHT = { left: 1440 - 56 - 24, top: 900 - 56 - 24 };

describe("cornerTargets", () => {
  it("四个角落的目标点与锚点一一对应，且与 anchorToXY 一致", () => {
    const targets = cornerTargets({ ...BASE });

    expect(targets.map((target) => target.anchor)).toEqual([
      { horizontal: { edge: "left", offset: 24 }, vertical: { edge: "top", offset: 24 } },
      { horizontal: { edge: "right", offset: 24 }, vertical: { edge: "top", offset: 24 } },
      { horizontal: { edge: "left", offset: 24 }, vertical: { edge: "bottom", offset: 24 } },
      { horizontal: { edge: "right", offset: 24 }, vertical: { edge: "bottom", offset: 24 } },
    ]);
    for (const target of targets) {
      expect(anchorToXY(target.anchor, 1440, 900, 56, 56)).toEqual(target.position);
    }
    expect(targets[3].position).toEqual(BOTTOM_RIGHT);
  });
});

describe("snapToCorner", () => {
  it("远离四角时保持自由落点", () => {
    expect(snapToCorner({ ...BASE, left: 700, top: 400 })).toBeNull();
  });

  it("靠近角落时吸附到该角的锚点", () => {
    const anchor = snapToCorner({ ...BASE, left: 1300, top: 800 });
    if (!anchor) throw new Error("该落点应吸附到右下角");
    expect(anchor).toEqual({
      horizontal: { edge: "right", offset: 24 },
      vertical: { edge: "bottom", offset: 24 },
    });
    expect(anchorToXY(anchor, 1440, 900, 56, 56)).toEqual(BOTTOM_RIGHT);
  });

  it("阈值边界（含）吸附，超出阈值不吸附", () => {
    expect(
      snapToCorner({ ...BASE, left: BOTTOM_RIGHT.left - 80, top: BOTTOM_RIGHT.top }),
    ).not.toBeNull();
    expect(
      snapToCorner({ ...BASE, left: BOTTOM_RIGHT.left - 81, top: BOTTOM_RIGHT.top }),
    ).toBeNull();
  });
});
