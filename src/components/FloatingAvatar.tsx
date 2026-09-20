import { useState, useRef, useCallback } from "react";
import { RobotOutlined } from "@ant-design/icons";

interface FloatingAvatarProps {
  onClick?: () => void;
}

export default function FloatingAvatar({ onClick }: FloatingAvatarProps) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startMouse = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      startPos.current = { x: pos.x, y: pos.y };
      startMouse.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startMouse.current.x;
    const dy = e.clientY - startMouse.current.y;
    const newX = Math.max(0, Math.min(window.innerWidth - 56, startPos.current.x - dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 56, startPos.current.y - dy));
    setPos({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const dx = Math.abs(e.clientX - startMouse.current.x);
      const dy = Math.abs(e.clientY - startMouse.current.y);
      if (dx < 5 && dy < 5) {
        onClick?.();
      }
    },
    [onClick],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #1677ff, #4096ff)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
        cursor: "grab",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        zIndex: 9999,
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <RobotOutlined />
    </div>
  );
}
