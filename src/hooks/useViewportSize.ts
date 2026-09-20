/**
 * useViewportSize — 视口尺寸（窗口缩放时更新）
 *
 * 遮罩需要按当前视口绘制吸附范围与中线；拖拽开始时会快照一次，保证整段拖拽用同一套边界。
 */

import { useEffect, useState } from "react";

export interface ViewportSize {
  width: number;
  height: number;
}

export function useViewportSize(): ViewportSize {
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewport;
}
