/**
 * isFocusVisible — 焦点是否由键盘触发（:focus-visible）
 *
 * 单独成文件是为了可注入测试：
 *   - 支持该选择器的环境（浏览器、jsdom）：按选择器真实结果返回。
 *     注意 jsdom（nwsapi）**支持** `:focus-visible` 语法，已 focus 的元素上返回
 *     false（不计算 focus-visible 状态），不会抛错——别假设它走 catch 分支。
 *   - 不支持的环境（老浏览器 / 实现差异）：回退为 true，宁可多亮焦点环。
 *
 * 「键盘亮环 / 鼠标不亮环」的真实行为 jsdom 断言不了，验收见 visual-check。
 */

export function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}
