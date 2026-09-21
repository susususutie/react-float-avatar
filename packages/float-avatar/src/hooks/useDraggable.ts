/**
 * useDraggable — 指针拖拽
 *
 * 只负责把指针事件翻译成拖拽增量，不决定元素位置策略：
 *   - pointerdown 绑定在元素上，pointermove / pointerup / pointercancel 绑定在 document
 *     捕获阶段，保证指针移出元素后仍能跟踪
 *   - 只跟踪触发 pointerdown 的那个 pointerId，忽略多指/其它指针
 *   - 位移是否算「点击」由消费方判断，所以 onDragEnd 总是会被调用
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export interface DraggableOptions {
  onDragStart?: () => void;
  onDragMove?: (deltaX: number, deltaY: number) => void;
  /** 松手：即使位移小于点击阈值也会调用，由消费方决定是否按点击处理 */
  onDragEnd?: (deltaX: number, deltaY: number) => void;
  /** 拖拽被系统中断（如触摸手势被浏览器接管） */
  onDragCancel?: () => void;
}

export function useDraggable<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: DraggableOptions = {},
) {
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || pointerIdRef.current !== null) return;
      e.preventDefault();
      pointerIdRef.current = e.pointerId;
      originRef.current = { x: e.clientX, y: e.clientY };
      callbacksRef.current.onDragStart?.();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      callbacksRef.current.onDragMove?.(
        e.clientX - originRef.current.x,
        e.clientY - originRef.current.y,
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      const deltaX = e.clientX - originRef.current.x;
      const deltaY = e.clientY - originRef.current.y;
      pointerIdRef.current = null;
      callbacksRef.current.onDragEnd?.(deltaX, deltaY);
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      callbacksRef.current.onDragCancel?.();
    };

    el.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, { capture: true });
    document.addEventListener("pointerup", onUp, { capture: true });
    document.addEventListener("pointercancel", onCancel, { capture: true });

    return () => {
      el.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove, { capture: true });
      document.removeEventListener("pointerup", onUp, { capture: true });
      document.removeEventListener("pointercancel", onCancel, { capture: true });
    };
  }, [ref]);
}
