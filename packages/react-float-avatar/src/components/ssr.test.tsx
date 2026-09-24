// @vitest-environment node
/**
 * SSR 守卫 — renderToString 在没有 window / document / localStorage 的 node 环境跑
 *
 * 锁三件事（都对应方案 §5 的实测阻断项）：
 *   1. useAvatarState 必须带 getServerSnapshot，否则直接抛 Missing getServerSnapshot
 *   2. 渲染期不得触碰 window / localStorage（viewport 首帧 {0,0}、锚点首帧只由 props 派生）
 *   3. 视口未知期间头像与气泡 visibility:hidden（无 JS 的服务端 HTML 也不暴露错误位置）
 */

import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import FloatingAvatar from "./FloatingAvatar";
import { avatarMessage } from "../hooks/avatarMessage";

beforeEach(() => {
  avatarMessage.reset();
});

describe("SSR（renderToString，无 window/document/localStorage）", () => {
  it("渲染不抛错；视口未知时头像隐藏", () => {
    const html = renderToString(<FloatingAvatar avatarSrc="avatar.png" />);

    expect(html).toContain("data-avatar-root");
    expect(html).toContain("visibility:hidden");
  });

  it("useAvatarState 走 getServerSnapshot（useSyncExternalStore 不抛 Missing getServerSnapshot）", () => {
    // 不带第三个参数时本用例会在 renderToString 里直接抛错
    const html = renderToString(<FloatingAvatar avatarSrc="avatar.png" />);

    expect(html).toContain("data-avatar-root");
  });

  it("服务端快照固定为空：单例里的消息不会串进服务端输出", () => {
    avatarMessage.show("不该出现在服务端输出");

    const html = renderToString(<FloatingAvatar avatarSrc="avatar.png" />);

    expect(html).not.toContain("不该出现在服务端输出");
    expect(html).toContain("visibility:hidden");
  });

  it("同构 effect：renderToString 不触发 useLayoutEffect 的服务端警告", () => {
    // 裸 useLayoutEffect（如历史上的气泡测量）会在 react@18 下打出
    // “Warning: useLayoutEffect does nothing on the server”——三处调用点已统一走 useIsoLayoutEffect
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    renderToString(<FloatingAvatar avatarSrc="avatar.png" />);

    const layoutWarning = error.mock.calls.some((args) =>
      String(args[0]).includes("useLayoutEffect"),
    );
    error.mockRestore();
    expect(layoutWarning).toBe(false);
  });
});
