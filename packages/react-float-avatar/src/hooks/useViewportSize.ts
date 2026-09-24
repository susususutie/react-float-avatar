/**
 * useViewportSize — 视口尺寸（窗口缩放时更新）
 *
 * SSR / hydration 安全：
 *   首帧固定 {0,0}——服务端渲染与客户端 hydration 首帧因此完全一致，不会 mismatch；
 *   真实视口由同构 layout effect 在首帧绘制前测出，所以浏览器不会画出「视口未知」的
 *   那一帧（消费方看到的第一次绘制就是正确位置）。视口未知期间由调用方
 *   （FloatingAvatar / AvatarBubble）以 visibility:hidden 兜底无 JS 的服务端 HTML。
 *
 * 遮罩按当前视口绘制吸附范围与中线；拖拽开始时会快照一次，保证整段拖拽用同一套边界。
 */

import { useState } from "react";
import { useIsoLayoutEffect } from "./useIsoLayoutEffect";

export interface ViewportSize {
  width: number;
  height: number;
}

export function useViewportSize(): ViewportSize {
  const [viewport, setViewport] = useState<ViewportSize>(() => ({ width: 0, height: 0 }));

  useIsoLayoutEffect(() => {
    const measure = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return viewport;
}
