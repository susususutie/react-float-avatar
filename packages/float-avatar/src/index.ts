/**
 * float-avatar — 对外出口
 *
 * 只导出公共 API + 类型；内部文件（hooks/components 下的实现）不直接对外，
 * 消费方一律从 "float-avatar" 引入，方便后续重构内部结构。
 */

export { default as FloatingAvatar } from "./components/FloatingAvatar";
export type { FloatingAvatarProps } from "./components/FloatingAvatar";

export { default as AvatarBubble } from "./components/AvatarBubble";
export type { AnchorMaskMode, AnchorMaskOptions, DragPreview } from "./components/AnchorMask";

export { avatarBadge, avatarMessage, useAvatarState } from "./hooks/avatarMessage";
export type {
  AvatarMessageButtonType,
  AvatarMessageCloseReason,
  AvatarMessageConfig,
  AvatarMessageInput,
  AvatarMessageItem,
  AvatarMessagePatch,
  AvatarMessageState,
} from "./hooks/avatarMessage";
