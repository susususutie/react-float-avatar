// @vitest-environment jsdom
/**
 * isFocusVisible 两个分支都要测到（方案 §4 / §7）：
 *   - 支持 :focus-visible 的环境（jsdom/nwsapi）走选择器真实结果——
 *     实测已 focus 的元素返回 false 且不抛错，别假设它进 catch；
 *   - 不支持的环境走 catch 回退 true（宁可多亮焦点环）。
 * 「键盘亮环 / 鼠标不亮环」的真实模态 jsdom 断言不了，验收见 visual-check。
 */

import { describe, expect, it, vi } from "vite-plus/test";
import { isFocusVisible } from "./isFocusVisible";

describe("isFocusVisible", () => {
  it("jsdom 支持选择器：已 focus 的元素返回 false（不抛错）", () => {
    const element = document.createElement("button");
    document.body.append(element);
    element.focus();

    expect(() => element.matches(":focus-visible")).not.toThrow();
    expect(element.matches(":focus-visible")).toBe(false);
    expect(isFocusVisible(element)).toBe(false);

    element.remove();
  });

  it("环境不支持该选择器时回退为 true", () => {
    const element = document.createElement("button");
    const matches = vi.spyOn(element, "matches").mockImplementation(() => {
      throw new Error(":focus-visible is not supported");
    });

    expect(isFocusVisible(element)).toBe(true);

    matches.mockRestore();
  });
});
