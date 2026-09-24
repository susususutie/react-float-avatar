/**
 * useIsoLayoutEffect — 同构 layout effect
 *
 * 服务端（`window` 不存在，模块级判定）退化为 useEffect：
 * 服务端本就不执行任何 effect，这样写只为让 hook 调用合法，
 * 并消除 React 在 renderToString 下对 useLayoutEffect 的
 * “does nothing on the server” 警告（react@18 实测会打两条）。
 *
 * 客户端语义保持 useLayoutEffect：视口测量、锚点持久化恢复、气泡测量都在首次绘制前完成，
 * 避免「先画默认位置再跳走」的一帧（方案 §5）。
 */

import { useEffect, useLayoutEffect } from "react";

export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
