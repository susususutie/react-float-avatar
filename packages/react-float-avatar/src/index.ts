/**
 * react-float-avatar — 对外出口
 *
 * 只导出公共 API + 类型；内部文件（hooks/components 下的实现）不直接对外，
 * 消费方一律从 "react-float-avatar" 引入，方便后续重构内部结构。
 *
 * 刻意不导出：
 *   - AvatarBubble：气泡是 FloatingAvatar 的内部功能，依赖 anchor/viewport 等内部概念，
 *     对外只暴露「一个头像组件」+ 消息/角标单例
 *   - DragPreview / AnchorMask 组件：内部调试层，无独立使用场景
 */

export { default as FloatingAvatar } from "./components/FloatingAvatar";
export type { FloatingAvatarProps } from "./components/FloatingAvatar";
export type { AnchorMaskMode, AnchorMaskOptions } from "./components/AnchorMask";

export type { EdgeAnchor, XY } from "./hooks/useEdgeAnchor";

export { avatarBadge, avatarMessage, useAvatarState } from "./hooks/avatarMessage";
export type {
  AvatarMessageAction,
  AvatarMessageCloseReason,
  AvatarMessageConfig,
  AvatarMessageInput,
  AvatarMessageInstance,
  AvatarMessageItem,
  AvatarMessageMode,
  AvatarMessagePatch,
  AvatarMessageState,
} from "./hooks/avatarMessage";
