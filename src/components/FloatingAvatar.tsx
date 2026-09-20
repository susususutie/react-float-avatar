/**
 * FloatingAvatar — 浮动头像
 *
 * 交互链路：
 *   useDraggable 报告指针增量 → 拖拽中用 transform 位移（不动 CSS 定位，走 GPU 合成）
 *   → 松手时把落点换算成锚点，并在同一次提交里把 transform 清零。
 *
 * 位置策略：
 *   - 锚点语义、持久化、缩放校验统一由 useEdgeAnchor 负责
 *   - 落点距角落不超过 SNAP_THRESHOLD 时吸附到该角（距边缘 EDGE_PADDING）
 *   - 位移小于 CLICK_THRESHOLD 视为点击：不落锚点，元素回到拖拽前的位置
 */

import { useRef, useState } from "react";
import avatarImg from "./avatar.png";
import { useDraggable } from "../hooks/useDraggable";
import { anchorToXY, useEdgeAnchor, xyToAnchor } from "../hooks/useEdgeAnchor";
import type { XY } from "../hooks/useEdgeAnchor";
import { snapToCorner } from "../hooks/snapToCorner";

const ELEMENT_SIZE = 56;
const EDGE_PADDING = 24;
const SNAP_THRESHOLD = 80;
const CLICK_THRESHOLD = 5;
const STORAGE_KEY = "ai-assistant-position";

/** 拖拽位移；零偏移复用同一个对象，让 React 直接跳过重渲染 */
const NO_OFFSET = { x: 0, y: 0 };

interface FloatingAvatarProps {
  onClick?: () => void;
  /** 松手时是否吸附到最近的四角 */
  snapToCorner?: boolean;
}

/** 拖拽过程中约束坐标，保证元素完整落在视口内（元素为正方形） */
function clampToViewport(
  left: number,
  top: number,
  viewportWidth: number,
  viewportHeight: number,
): XY {
  return {
    left: Math.max(0, Math.min(left, viewportWidth - ELEMENT_SIZE)),
    top: Math.max(0, Math.min(top, viewportHeight - ELEMENT_SIZE)),
  };
}

export default function FloatingAvatar({
  onClick,
  snapToCorner: snapEnabled = true,
}: FloatingAvatarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const {
    anchor,
    style: anchorStyle,
    setAnchor,
  } = useEdgeAnchor({
    storageKey: STORAGE_KEY,
    elementWidth: ELEMENT_SIZE,
    elementHeight: ELEMENT_SIZE,
    padding: EDGE_PADDING,
  });

  const [dragOffset, setDragOffset] = useState(NO_OFFSET);
  const [dragging, setDragging] = useState(false);
  const dragOriginRef = useRef({ left: 0, top: 0, viewportWidth: 0, viewportHeight: 0 });

  useDraggable(ref, {
    onDragStart: () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      // 拖拽起点取当前渲染出的锚点位置，与屏幕上的位置保持一致
      const origin = anchorToXY(anchor, viewportWidth, viewportHeight, ELEMENT_SIZE, ELEMENT_SIZE);
      dragOriginRef.current = { ...origin, viewportWidth, viewportHeight };
      setDragging(true);
    },
    onDragMove: (deltaX, deltaY) => {
      const { left, top, viewportWidth, viewportHeight } = dragOriginRef.current;
      const next = clampToViewport(left + deltaX, top + deltaY, viewportWidth, viewportHeight);
      setDragOffset({ x: next.left - left, y: next.top - top });
    },
    onDragEnd: (deltaX, deltaY) => {
      setDragging(false);
      const { left, top, viewportWidth, viewportHeight } = dragOriginRef.current;

      if (Math.abs(deltaX) < CLICK_THRESHOLD && Math.abs(deltaY) < CLICK_THRESHOLD) {
        setDragOffset(NO_OFFSET);
        onClick?.();
        return;
      }

      const released = clampToViewport(left + deltaX, top + deltaY, viewportWidth, viewportHeight);
      const snapped = snapEnabled
        ? snapToCorner({
            ...released,
            viewportWidth,
            viewportHeight,
            elementWidth: ELEMENT_SIZE,
            elementHeight: ELEMENT_SIZE,
            threshold: SNAP_THRESHOLD,
            padding: EDGE_PADDING,
          })
        : null;

      // 锚点能精确还原落点，因此与 setDragOffset 同批提交不会产生视觉跳变
      setAnchor(
        snapped ??
          xyToAnchor(
            released.left,
            released.top,
            viewportWidth,
            viewportHeight,
            ELEMENT_SIZE,
            ELEMENT_SIZE,
          ),
      );
      setDragOffset(NO_OFFSET);
    },
    onDragCancel: () => {
      setDragging(false);
      setDragOffset(NO_OFFSET);
    },
  });

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        ...anchorStyle,
        transform:
          dragOffset.x === 0 && dragOffset.y === 0
            ? undefined
            : `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        width: ELEMENT_SIZE,
        height: ELEMENT_SIZE,
        borderRadius: "50%",
        overflow: "hidden",
        cursor: dragging ? "grabbing" : "grab",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        zIndex: 9999,
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <img
        src={avatarImg}
        alt="AI 助手"
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}
