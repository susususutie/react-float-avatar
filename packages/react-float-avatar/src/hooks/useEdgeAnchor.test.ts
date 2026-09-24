import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  anchorToCSS,
  anchorToXY,
  readStoredAnchor,
  validateAnchor,
  xyToAnchor,
} from "./useEdgeAnchor";
import type { EdgeAnchor } from "./useEdgeAnchor";

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const ELEMENT_SIZE = 56;

function roundTrip(left: number, top: number) {
  const anchor = xyToAnchor(left, top, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ELEMENT_SIZE, ELEMENT_SIZE);
  return {
    anchor,
    xy: anchorToXY(anchor, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ELEMENT_SIZE, ELEMENT_SIZE),
  };
}

describe("xyToAnchor / anchorToXY", () => {
  it("对任意落点严格互逆，松手后位置不会被改写", () => {
    const lefts = [0, 24, 200, 691, 692, 693, 1000, 1384];
    const tops = [0, 24, 300, 421, 422, 500, 844];
    for (const left of lefts) {
      for (const top of tops) {
        expect(roundTrip(left, top).xy).toEqual({ left, top });
      }
    }
  });

  it("锚定较近的一侧边缘", () => {
    expect(roundTrip(200, 100).anchor).toEqual({
      horizontal: { edge: "left", offset: 200 },
      vertical: { edge: "top", offset: 100 },
    });
    expect(roundTrip(1384, 844).anchor).toEqual({
      horizontal: { edge: "right", offset: 0 },
      vertical: { edge: "bottom", offset: 0 },
    });
  });

  it("两侧等距时锚定 left / top，位置依然不变", () => {
    const { anchor, xy } = roundTrip(692, 422);
    expect(anchor.horizontal.edge).toBe("left");
    expect(anchor.vertical.edge).toBe("top");
    expect(xy).toEqual({ left: 692, top: 422 });
  });
});

describe("anchorToCSS", () => {
  it("CSS 属性名与锚定边一致", () => {
    expect(
      anchorToCSS({
        horizontal: { edge: "right", offset: 24 },
        vertical: { edge: "bottom", offset: 24 },
      }),
    ).toEqual({ right: 24, bottom: 24 });
    expect(
      anchorToCSS({
        horizontal: { edge: "left", offset: 12 },
        vertical: { edge: "top", offset: 8 },
      }),
    ).toEqual({
      left: 12,
      top: 8,
    });
  });

  it("与 anchorToXY 描述同一个位置", () => {
    const anchors = [
      { horizontal: { edge: "left", offset: 24 }, vertical: { edge: "top", offset: 24 } },
      { horizontal: { edge: "left", offset: 200 }, vertical: { edge: "bottom", offset: 80 } },
      { horizontal: { edge: "right", offset: 24 }, vertical: { edge: "top", offset: 150 } },
      { horizontal: { edge: "right", offset: 300 }, vertical: { edge: "bottom", offset: 24 } },
    ] satisfies EdgeAnchor[];

    for (const anchor of anchors) {
      const css = anchorToCSS(anchor);
      // 按 CSS 语义还原：锚定 right / bottom 时从视口另一侧反推坐标
      const left = css.left ?? VIEWPORT_WIDTH - ELEMENT_SIZE - (css.right ?? 0);
      const top = css.top ?? VIEWPORT_HEIGHT - ELEMENT_SIZE - (css.bottom ?? 0);
      expect({ left, top }).toEqual(
        anchorToXY(anchor, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ELEMENT_SIZE, ELEMENT_SIZE),
      );
    }
  });
});

describe("validateAnchor", () => {
  it("把 offset 夹紧到元素完全可见的范围", () => {
    const anchor = validateAnchor(
      {
        horizontal: { edge: "left", offset: 9999 },
        vertical: { edge: "bottom", offset: -50 },
      },
      600,
      400,
      ELEMENT_SIZE,
      ELEMENT_SIZE,
    );
    expect(anchor.horizontal.offset).toBe(600 - ELEMENT_SIZE);
    expect(anchor.vertical.offset).toBe(0);
  });
});

describe("readStoredAnchor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("无记录 / 脏 JSON / 结构非法都返回 null，合法记录原样返回", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });

    // 无记录
    expect(readStoredAnchor({ storageKey: "k" })).toBeNull();

    // 脏 JSON（解析失败不许进入定位计算）
    store.set("k", "{not json");
    expect(readStoredAnchor({ storageKey: "k" })).toBeNull();

    // 结构非法（edge 枚举不对）
    store.set("k", JSON.stringify({ horizontal: { edge: "middle", offset: 1 } }));
    expect(readStoredAnchor({ storageKey: "k" })).toBeNull();

    // 合法记录
    const valid = {
      horizontal: { edge: "left", offset: 10 },
      vertical: { edge: "top", offset: 8 },
    };
    store.set("k", JSON.stringify(valid));
    expect(readStoredAnchor({ storageKey: "k" })).toEqual(valid);
  });

  it("存储不可用（读取抛错）时返回 null 而不是崩溃", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError: denied");
      },
    });

    expect(readStoredAnchor({ storageKey: "k" })).toBeNull();
  });
});
