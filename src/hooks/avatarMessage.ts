/**
 * avatarMessage — 头像消息与角标（单例）
 *
 * 用法（命令式，任何 React 事件回调里直接 import 即可，无需 Provider）：
 *   avatarMessage.show("进入关于页面");                   // 简单消息：直接传字符串
 *   const id = avatarMessage.show({ title: "标题", content: "正文", duration: 5000 });
 *   avatarMessage.update(id, "加载完成");                // 用 id 改内容，不重播进场动画
 *   avatarMessage.close(id);                             // 不传 id 则关当前
 *   avatarBadge.show(); avatarBadge.hide(); avatarBadge.getState();
 *
 * 只有两种形状：
 *   - 纯消息：show("文本")（等价 { content: "文本" }）——紧凑留白 + 正常字重，对应 antd message 的一行文字
 *   - 复杂消息：带 title / avatar / footer / 自定义正文——完整留白，对应 notification / Modal 的完整形态
 *
 * 底部按钮沿用 antd Modal 的语义：okText / okType / onOk、cancelText / onCancel，
 * 需要完全自定义时用 footer 覆盖（等价 Modal 的 footer）。
 *
 * 分层：本文件的纯函数只决定「当前显示哪条 + 队列怎么排」，不碰 DOM 与计时；
 * 测量、定位、动效、倒计时由 AvatarBubble 负责。
 *
 * 顶掉规则（全部显式配置，不做隐式判断）：
 *   - 消息默认 replaceable：后来的消息直接顶掉当前这条（当前消息收到 onClose("replaced")）
 *   - 当前消息 replaceable === false 时，新消息进入队列（上限 QUEUE_LIMIT，超出丢最旧的）
 *   - 当前消息关闭后，队列头部自动晋升为当前消息
 */

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type AvatarMessageCloseReason = "manual" | "replaced" | "queue-drop" | "hidden-drop";

export type AvatarMessageButtonType = "primary" | "default" | "text" | "link" | "dashed";

interface AvatarMessageBase {
  /** 消息身份：同 key 再次 show 视为更新同一条；省略则自动生成 */
  key?: string;
  /** 加粗标题；只在复杂消息里用，纯消息不要用它表达一行文案 */
  title?: ReactNode;
  /** 头部左侧槽位，通常放小头像/图标 */
  avatar?: ReactNode;
  /** 完全自定义底部区域（等价 antd Modal 的 footer）；给了它就不再渲染默认按钮 */
  footer?: ReactNode;
  /** 主按钮文案，默认「确定」；只有同时给了 onOk 才渲染这个按钮 */
  okText?: ReactNode;
  /** 主按钮类型，默认 primary */
  okType?: AvatarMessageButtonType;
  /** 主按钮回调；点击后关闭当前消息 */
  onOk?: () => void;
  /** 次按钮文案，默认「取消」；只有同时给了 onCancel 才渲染这个按钮 */
  cancelText?: ReactNode;
  /** 次按钮回调；点击后关闭当前消息 */
  onCancel?: () => void;
  /** 自动关闭毫秒数；0 / 省略 = 只能手动关闭（默认，避免消息悄悄消失） */
  duration?: number;
  /** 是否显示关闭按钮，默认 true */
  closable?: boolean;
  /** 是否允许被后来的消息顶掉，默认 true */
  replaceable?: boolean;
  /** 页面不可见时倒计时是否推进，默认 "pause" */
  hiddenTimer?: "pause" | "ignore";
  /** 消息到达时页面不可见：默认 "drop"（直接丢弃），"hold" 则正常接收 */
  hiddenMessage?: "drop" | "hold";
  onClose?: (reason: AvatarMessageCloseReason) => void;
}

export interface AvatarMessageConfig extends AvatarMessageBase {
  /** 正文；纯消息直接传字符串（也可以只用 show("文本") 简写） */
  content: ReactNode;
}

/** 简单消息可以直接传字符串，等价于 `{ content: 字符串 }` */
export type AvatarMessageInput = string | AvatarMessageConfig;

function normalizeInput(input: AvatarMessageInput): AvatarMessageConfig {
  return typeof input === "string" ? { content: input } : input;
}

export interface AvatarMessageItem {
  id: string;
  /** 每次 show 递增：用于区分「同一个 key 重新展示」与「同一条消息更新」，倒计时据此重置 */
  instanceId: number;
  title?: ReactNode;
  content: ReactNode;
  avatar?: ReactNode;
  footer?: ReactNode;
  okText?: ReactNode;
  okType: AvatarMessageButtonType;
  onOk?: () => void;
  cancelText?: ReactNode;
  onCancel?: () => void;
  duration: number;
  closable: boolean;
  replaceable: boolean;
  hiddenTimer: "pause" | "ignore";
  hiddenMessage: "drop" | "hold";
  onClose?: (reason: AvatarMessageCloseReason) => void;
}

export type AvatarMessagePatch = Partial<Omit<AvatarMessageItem, "id" | "instanceId">>;

export interface AvatarMessageState {
  /** 当前消息；队列头部会在它关闭后晋升 */
  message: AvatarMessageItem | null;
  queue: AvatarMessageItem[];
  /** 头像角上的红点（完全由业务手动控制，不跟消息联动） */
  badgeVisible: boolean;
}

const QUEUE_LIMIT = 3;

export interface ClosedEntry {
  item: AvatarMessageItem;
  reason: AvatarMessageCloseReason;
}

function createItem(
  config: AvatarMessageConfig,
  id: string,
  instanceId: number,
): AvatarMessageItem {
  return {
    id,
    instanceId,
    title: config.title,
    content: config.content,
    avatar: config.avatar,
    footer: config.footer,
    okText: config.okText,
    okType: config.okType ?? "primary",
    onOk: config.onOk,
    cancelText: config.cancelText,
    onCancel: config.onCancel,
    duration: config.duration ?? 0,
    closable: config.closable ?? true,
    replaceable: config.replaceable ?? true,
    hiddenTimer: config.hiddenTimer ?? "pause",
    hiddenMessage: config.hiddenMessage ?? "drop",
    onClose: config.onClose,
  };
}

/** 入列：默认顶掉当前消息；当前消息不可顶掉时排队 */
export function showMessage(
  state: AvatarMessageState,
  item: AvatarMessageItem,
): { state: AvatarMessageState; closed: ClosedEntry[] } {
  if (state.message === null) {
    return { state: { ...state, message: item }, closed: [] };
  }
  if (state.message.replaceable) {
    return {
      state: { ...state, message: item },
      closed: [{ item: state.message, reason: "replaced" }],
    };
  }

  const queue = [...state.queue, item];
  const closed: ClosedEntry[] = [];
  while (queue.length > QUEUE_LIMIT) {
    const dropped = queue.shift();
    if (!dropped) break;
    closed.push({ item: dropped, reason: "queue-drop" });
  }
  return { state: { ...state, queue }, closed };
}

/** 按 id 更新：当前消息与队列中的消息都可更新，已关闭的 id 是 no-op */
export function updateMessage(
  state: AvatarMessageState,
  id: string,
  patch: AvatarMessagePatch,
): AvatarMessageState {
  if (state.message?.id === id) {
    return { ...state, message: { ...state.message, ...patch } };
  }
  if (state.queue.some((item) => item.id === id)) {
    return {
      ...state,
      queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    };
  }
  return state;
}

/** 关闭：不传 id 关当前（队列头部晋升），传 id 可关队列中尚未展示的消息 */
export function closeMessage(
  state: AvatarMessageState,
  id?: string,
): { state: AvatarMessageState; closed: ClosedEntry[] } {
  if (id === undefined || state.message?.id === id) {
    if (!state.message) return { state, closed: [] };
    const [next, ...rest] = state.queue;
    return {
      state: { ...state, message: next ?? null, queue: rest },
      closed: [{ item: state.message, reason: "manual" }],
    };
  }

  const index = state.queue.findIndex((item) => item.id === id);
  if (index < 0) return { state, closed: [] };
  return {
    state: { ...state, queue: state.queue.filter((_, position) => position !== index) },
    closed: [{ item: state.queue[index], reason: "manual" }],
  };
}

/** 清空当前消息与队列 */
export function clearMessages(state: AvatarMessageState): {
  state: AvatarMessageState;
  closed: ClosedEntry[];
} {
  const closed: ClosedEntry[] = [];
  if (state.message) closed.push({ item: state.message, reason: "manual" });
  for (const item of state.queue) closed.push({ item, reason: "manual" });
  if (closed.length === 0) return { state, closed };
  return { state: { ...state, message: null, queue: [] }, closed };
}

export function setBadgeVisible(state: AvatarMessageState, visible: boolean): AvatarMessageState {
  if (state.badgeVisible === visible) return state;
  return { ...state, badgeVisible: visible };
}

// ─── 单例 store ──────────────────────────────────────────────

const listeners = new Set<() => void>();
let state: AvatarMessageState = { message: null, queue: [], badgeVisible: false };
let sequence = 0;
let instance = 0;

function setState(next: AvatarMessageState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

function emitClosed(closed: ClosedEntry[]): void {
  for (const entry of closed) entry.item.onClose?.(entry.reason);
}

/** 页面当前是否不可见（隐藏期间如何处理由消息自身的 hiddenMessage 决定） */
function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** 展示一条纯消息：直接传字符串（等价 `{ content: 字符串 }`） */
function show(message: string): string;
/** 展示一条复杂消息：标题 / 头像 / 底部按钮等用对象形式 */
function show(config: AvatarMessageConfig): string;
/** 展示一条消息，返回它的 id（即 key），后续用 update / close 操作 */
function show(input: AvatarMessageInput): string {
  const config = normalizeInput(input);
  sequence += 1;
  instance += 1;
  const item = createItem(config, config.key ?? `avatar-msg-${sequence}`, instance);
  if (item.hiddenMessage === "drop" && isDocumentHidden()) {
    item.onClose?.("hidden-drop");
    return item.id;
  }
  const result = showMessage(state, item);
  setState(result.state);
  emitClosed(result.closed);
  return item.id;
}

/** 更新消息内容（patch 传字符串等价于只改 content）；返回 false 表示该 id 已关闭或不存在 */
function update(id: string, patch: AvatarMessagePatch | string): boolean {
  const next = updateMessage(state, id, typeof patch === "string" ? { content: patch } : patch);
  if (next === state) return false;
  setState(next);
  return true;
}

/** 关闭当前消息（不传 id）或队列中的某条；返回 false 表示没找到 */
function close(id?: string): boolean {
  const result = closeMessage(state, id);
  if (result.state === state) return false;
  setState(result.state);
  emitClosed(result.closed);
  return true;
}

function closeAll(): void {
  const result = clearMessages(state);
  setState(result.state);
  emitClosed(result.closed);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): AvatarMessageState {
  return state;
}

/** 测试用：清空状态与 id 序列 */
function reset(): void {
  state = { message: null, queue: [], badgeVisible: false };
  sequence = 0;
  instance = 0;
  for (const listener of listeners) listener();
}

export const avatarMessage = { show, update, close, closeAll, subscribe, getState, reset };

/** 点亮头像角上的红点（业务自行决定何时亮、何时清，组件不做隐式联动） */
function showBadge(): void {
  setState(setBadgeVisible(state, true));
}

function hideBadge(): void {
  setState(setBadgeVisible(state, false));
}

function getBadgeState(): { visible: boolean } {
  return { visible: state.badgeVisible };
}

export const avatarBadge = { show: showBadge, hide: hideBadge, getState: getBadgeState };

/** 订阅整个头像状态（消息 + 红点），组件内使用 */
export function useAvatarState(): AvatarMessageState {
  return useSyncExternalStore(subscribe, getState);
}
