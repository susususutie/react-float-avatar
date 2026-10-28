/**
 * avatarMessage — 头像消息与角标（单例）
 *
 * 用法（命令式，任何 React 事件回调里直接 import 即可，无需 Provider）：
 *   avatarMessage.show("进入关于页面");                   // 普通消息：直接传字符串
 *   const msg = avatarMessage.show({ title: "标题", content: "正文", duration: 5000 });
 *   msg.update("加载完成");                                // 实例控制器，不重播进场动画
 *   msg.destroy();                                        // 关闭这一条
 *
 *   const confirm = avatarMessage.confirm({                // 对标 Modal.confirm
 *     title: "删除这条记录？",
 *     content: "删除后不可恢复。",
 *     okText: "删除",
 *     onOk: () => remove(),                               // 返回 Promise 时按钮 loading，reject 保持打开
 *   });
 *   confirm.update({ content: "正在删除…" });
 *   confirm.destroy();
 *
 *   avatarBadge.show(); avatarBadge.hide(); avatarBadge.getState();
 *
 * 只有两种形状：
 *   - 纯消息：show("文本")（等价 { content: "文本" }）——紧凑留白 + 正常字重
 *   - 复杂消息：带 title / avatar / footer / 自定义正文——完整留白
 *
 * 底部按钮沿用 antd Modal 的语义：okText / okDanger / onOk、cancelText / onCancel，
 * 需要完全自定义时用 footer 覆盖（等价 Modal 的 footer）。
 * confirm 与 show 的唯一默认差异：确定/取消两个按钮总是渲染。
 *
 * 分层：本文件的纯函数只决定「当前显示哪条 + 队列怎么排」，不碰 DOM 与计时；
 * 测量、定位、动效、倒计时与异步动作由 AvatarBubble 负责。
 *
 * 顶掉规则（全部显式配置，不做隐式判断）：
 *   - 消息默认 replaceable：后来的消息直接顶掉当前这条（当前消息收到 onClose("replaced")）
 *   - 当前消息 replaceable === false 时，新消息进入队列（上限 QUEUE_LIMIT）
 *   - 队列溢出、页面不可见时丢弃的消息从未展示过，不触发 onClose
 *   - 当前消息关闭后，队列头部自动晋升为当前消息
 */

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

export type AvatarMessageCloseReason = "ok" | "cancel" | "destroy" | "duration" | "replaced";

/** 按钮动作：同步返回、async 函数或返回 Promise 都可以 */
export type AvatarMessageAction = () => void | Promise<unknown>;

export type AvatarMessageMode = "message" | "confirm";

interface AvatarMessageBase {
  /** 消息身份：同 key 再次 show 视为更新同一条；省略则自动生成 */
  key?: string;
  /** 加粗标题；只在复杂消息里用，纯消息不要用它表达一行文案 */
  title?: ReactNode;
  /** 头部左侧槽位，通常放小头像/图标 */
  avatar?: ReactNode;
  /** 完全自定义底部区域（等价 antd Modal 的 footer）；给了它就不再渲染默认按钮 */
  footer?: ReactNode;
  /** 主按钮文案，默认「确定」；confirm 模式下总是渲染 */
  okText?: ReactNode;
  /** 主按钮是否用危险色（删除 / 不可逆操作），默认 false */
  okDanger?: boolean;
  /** 主按钮回调；返回 Promise 时按钮 loading，resolve 后关闭，reject 保持打开 */
  onOk?: AvatarMessageAction;
  /** 次按钮文案，默认「取消」；confirm 模式下总是渲染 */
  cancelText?: ReactNode;
  /** 次按钮回调；async / Promise 行为与 onOk 一致 */
  onCancel?: AvatarMessageAction;
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

/** show / confirm 返回的控制器（对标 Modal.confirm 的 { update, destroy }） */
export interface AvatarMessageInstance {
  /** 消息 id（也是 key），需要时可用于顶层 update / destroy */
  readonly id: string;
  /** 更新当前或队列中的这条消息；已销毁返回 false */
  update: (patch: AvatarMessagePatch | string) => boolean;
  /** 关闭这条消息；已销毁返回 false */
  destroy: () => boolean;
}

function normalizeInput(input: AvatarMessageInput): AvatarMessageConfig {
  return typeof input === "string" ? { content: input } : input;
}

export interface AvatarMessageItem {
  id: string;
  /** 每次 show 递增：用于区分「同一个 key 重新展示」与「同一条消息更新」，倒计时据此重置 */
  instanceId: number;
  /** "confirm" 时确定/取消按钮总是渲染 */
  mode: AvatarMessageMode;
  title?: ReactNode;
  content: ReactNode;
  avatar?: ReactNode;
  footer?: ReactNode;
  okText?: ReactNode;
  okDanger: boolean;
  onOk?: AvatarMessageAction;
  cancelText?: ReactNode;
  onCancel?: AvatarMessageAction;
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
  mode: AvatarMessageMode,
): AvatarMessageItem {
  return {
    id,
    instanceId,
    mode,
    title: config.title,
    content: config.content,
    avatar: config.avatar,
    footer: config.footer,
    okText: config.okText,
    okDanger: config.okDanger ?? false,
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
  // 同 key 视为同一条：即使当前消息 replaceable: false 也原地替换（antd message 的 key 心智）
  if (state.message.id === item.id) {
    return {
      state: { ...state, message: item },
      closed: [{ item: state.message, reason: "replaced" }],
    };
  }
  // 排队中的同 key 也原地替换，不产生重复条目（它尚未展示，不触发 onClose）
  const queued = state.queue.findIndex((queuedItem) => queuedItem.id === item.id);
  if (queued >= 0) {
    const queue = state.queue.map((queuedItem, index) => (index === queued ? item : queuedItem));
    return { state: { ...state, queue }, closed: [] };
  }
  if (state.message.replaceable) {
    return {
      state: { ...state, message: item },
      closed: [{ item: state.message, reason: "replaced" }],
    };
  }

  // 溢出直接丢弃最旧的排队消息：它从未展示过，不触发 onClose
  const queue = [...state.queue, item].slice(-QUEUE_LIMIT);
  return { state: { ...state, queue }, closed: [] };
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
export function destroyMessage(
  state: AvatarMessageState,
  id?: string,
  reason: AvatarMessageCloseReason = "destroy",
): { state: AvatarMessageState; closed: ClosedEntry[] } {
  if (id === undefined || state.message?.id === id) {
    if (!state.message) return { state, closed: [] };
    const [next, ...rest] = state.queue;
    return {
      state: { ...state, message: next ?? null, queue: rest },
      closed: [{ item: state.message, reason }],
    };
  }

  const index = state.queue.findIndex((item) => item.id === id);
  if (index < 0) return { state, closed: [] };
  return {
    state: { ...state, queue: state.queue.filter((_, position) => position !== index) },
    closed: [{ item: state.queue[index], reason }],
  };
}

/** 清空当前消息与队列 */
export function destroyAllMessages(state: AvatarMessageState): {
  state: AvatarMessageState;
  closed: ClosedEntry[];
} {
  const closed: ClosedEntry[] = [];
  if (state.message) closed.push({ item: state.message, reason: "destroy" });
  for (const item of state.queue) closed.push({ item, reason: "destroy" });
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

function createInstance(id: string): AvatarMessageInstance {
  return {
    id,
    update: (patch) => update(id, patch),
    destroy: () => destroy(id),
  };
}

function open(input: AvatarMessageInput, mode: AvatarMessageMode): AvatarMessageInstance {
  const config = normalizeInput(input);
  sequence += 1;
  instance += 1;
  const item = createItem(config, config.key ?? `avatar-msg-${sequence}`, instance, mode);
  if (item.hiddenMessage === "drop" && isDocumentHidden()) {
    // 从未展示过的消息不触发 onClose；返回的控制器对不存在的 id 是 no-op
    return createInstance(item.id);
  }
  const result = showMessage(state, item);
  setState(result.state);
  emitClosed(result.closed);
  return createInstance(item.id);
}

/** 展示一条普通消息：直接传字符串（等价 `{ content: 字符串 }`） */
function show(input: AvatarMessageInput): AvatarMessageInstance {
  return open(input, "message");
}

/** 展示一条确认消息：确定/取消按钮总是渲染，交互语义对齐 antd Modal.confirm */
function confirm(config: AvatarMessageConfig): AvatarMessageInstance {
  return open(config, "confirm");
}

/** 更新消息内容（patch 传字符串等价于只改 content）；返回 false 表示该 id 已关闭或不存在 */
function update(id: string, patch: AvatarMessagePatch | string): boolean {
  const next = updateMessage(state, id, typeof patch === "string" ? { content: patch } : patch);
  if (next === state) return false;
  setState(next);
  return true;
}

/** 关闭当前消息（不传 id）或队列中的某条；返回 false 表示没找到 */
function destroy(id?: string, reason: AvatarMessageCloseReason = "destroy"): boolean {
  const result = destroyMessage(state, id, reason);
  if (result.state === state) return false;
  setState(result.state);
  emitClosed(result.closed);
  return true;
}

function destroyAll(): void {
  const result = destroyAllMessages(state);
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

/**
 * SSR 快照：服务端固定返回空状态。
 * useSyncExternalStore 缺第三个参数在 renderToString 下会直接抛
 * 「Missing getServerSnapshot」——服务端本就不该有消息（单例状态也不允许跨请求泄漏）。
 */
const SERVER_STATE: AvatarMessageState = Object.freeze({
  message: null,
  queue: [],
  badgeVisible: false,
});

function getServerSnapshot(): AvatarMessageState {
  return SERVER_STATE;
}

/** 测试用：清空状态与 id 序列 */
function reset(): void {
  state = { message: null, queue: [], badgeVisible: false };
  sequence = 0;
  instance = 0;
  for (const listener of listeners) listener();
}

export const avatarMessage = {
  show,
  confirm,
  update,
  destroy,
  destroyAll,
  subscribe,
  getState,
  reset,
};

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

/** 订阅整个头像状态（消息 + 红点），组件内使用；SSR 走 getServerSnapshot 空状态 */
export function useAvatarState(): AvatarMessageState {
  return useSyncExternalStore(subscribe, getState, getServerSnapshot);
}
