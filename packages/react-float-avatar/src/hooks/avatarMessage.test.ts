import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { avatarBadge, avatarMessage } from "./avatarMessage";
import type { AvatarMessageCloseReason } from "./avatarMessage";

beforeEach(() => {
  avatarMessage.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avatarMessage 队列与顶掉规则", () => {
  it("第一条消息直接成为当前消息", () => {
    const msg = avatarMessage.show({ content: "你好" });

    expect(avatarMessage.getState().message?.id).toBe(msg.id);
    expect(avatarMessage.getState().message?.content).toBe("你好");
    expect(avatarMessage.getState().queue).toEqual([]);
  });

  it("默认后来的消息顶掉前一条，并回调 replaced", () => {
    const reasons: AvatarMessageCloseReason[] = [];
    avatarMessage.show({ content: "第一条", onClose: (reason) => reasons.push(reason) });

    const second = avatarMessage.show({ content: "第二条" });

    expect(avatarMessage.getState().message?.id).toBe(second.id);
    expect(reasons).toEqual(["replaced"]);
  });

  it("当前消息 replaceable: false 时新消息排队，关闭后晋升", () => {
    const first = avatarMessage.show({ content: "重要消息", replaceable: false });
    const second = avatarMessage.show({ content: "次要消息" });

    expect(avatarMessage.getState().message?.id).toBe(first.id);
    expect(avatarMessage.getState().queue.map((item) => item.id)).toEqual([second.id]);

    avatarMessage.destroy();

    expect(avatarMessage.getState().message?.id).toBe(second.id);
    expect(avatarMessage.getState().queue).toEqual([]);
  });

  it("队列上限为 3，溢出静默丢弃最旧的消息（从未展示，不回调 onClose）", () => {
    avatarMessage.show({ content: "第 0 条", replaceable: false });
    const dropped = vi.fn();
    const queued = ["第 1 条", "第 2 条", "第 3 条", "第 4 条"].map((content, index) =>
      avatarMessage.show({
        content,
        onClose: index === 0 ? dropped : undefined,
      }),
    );

    expect(avatarMessage.getState().queue.map((item) => item.id)).toEqual(
      queued.slice(1).map((item) => item.id),
    );
    expect(dropped).not.toHaveBeenCalled();
  });

  it("同一个 key 重复 show 仍是同一条消息", () => {
    const msg = avatarMessage.show({ key: "sync", content: "同步中" });

    expect(msg.id).toBe("sync");
    avatarMessage.show({ key: "sync", content: "同步完成" });

    expect(avatarMessage.getState().message?.id).toBe("sync");
    expect(avatarMessage.getState().message?.content).toBe("同步完成");
  });

  it("同 key 在当前消息里即使 replaceable: false 也原地替换", () => {
    const reasons: AvatarMessageCloseReason[] = [];
    avatarMessage.show({
      key: "sync",
      content: "旧",
      replaceable: false,
      onClose: (reason) => reasons.push(reason),
    });

    avatarMessage.show({ key: "sync", content: "新", replaceable: false });

    expect(avatarMessage.getState().message?.content).toBe("新");
    expect(avatarMessage.getState().queue).toEqual([]);
    expect(reasons).toEqual(["replaced"]);
  });

  it("排队中的同 key 原地替换，不产生重复条目", () => {
    avatarMessage.show({ content: "占位", replaceable: false });
    const queued = avatarMessage.show({ key: "queued", content: "旧" });

    avatarMessage.show({ key: "queued", content: "新" });

    const queue = avatarMessage.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(queued.id);
    expect(queue[0].content).toBe("新");
  });
});

describe("avatarMessage 消息形状（对齐 antd）", () => {
  it("直接传字符串等价于只有 content 的消息", () => {
    const msg = avatarMessage.show("一条简单消息");

    expect(avatarMessage.getState().message?.id).toBe(msg.id);
    expect(avatarMessage.getState().message?.content).toBe("一条简单消息");
    expect(avatarMessage.getState().message?.title).toBeUndefined();
    expect(avatarMessage.getState().message?.mode).toBe("message");
  });

  it("confirm 模式标记在消息上（按钮由 AvatarBubble 按模式强制渲染）", () => {
    const msg = avatarMessage.confirm({ content: "确定吗" });

    expect(avatarMessage.getState().message?.id).toBe(msg.id);
    expect(avatarMessage.getState().message?.mode).toBe("confirm");
  });

  it("update 也接受字符串（只改 content）", () => {
    const msg = avatarMessage.show({ title: "标题", content: "正文" });

    expect(msg.update("改过的正文")).toBe(true);
    expect(avatarMessage.getState().message?.content).toBe("改过的正文");
    expect(avatarMessage.getState().message?.title).toBe("标题");
  });

  it("底部按钮按 Modal 的语义落成 ok/cancel 字段", () => {
    const onOk = () => {};
    const onCancel = () => {};
    avatarMessage.show({
      content: "等待处理",
      okText: "立即处理",
      onOk,
      cancelText: "稍后再说",
      onCancel,
    });

    const item = avatarMessage.getState().message;
    expect(item?.okText).toBe("立即处理");
    expect(item?.okDanger).toBe(false);
    expect(item?.onOk).toBe(onOk);
    expect(item?.cancelText).toBe("稍后再说");
    expect(item?.onCancel).toBe(onCancel);
    expect(item?.footer).toBeUndefined();
  });
});

describe("avatarMessage 实例控制器", () => {
  it("show / confirm 返回 { id, update, destroy }，可直接操作同一条消息", () => {
    const msg = avatarMessage.show({ content: "加载中" });

    expect(msg.update("加载完成")).toBe(true);
    expect(avatarMessage.getState().message?.content).toBe("加载完成");

    expect(msg.destroy()).toBe(true);
    expect(avatarMessage.getState().message).toBeNull();

    expect(msg.update("已关闭")).toBe(false);
    expect(msg.destroy()).toBe(false);
  });

  it("队列中的消息也能用实例更新与销毁", () => {
    avatarMessage.show({ content: "重要消息", replaceable: false });
    const queued = avatarMessage.show({ content: "排队中" });

    expect(queued.update({ content: "排队中（已更新）" })).toBe(true);
    expect(avatarMessage.getState().queue[0].content).toBe("排队中（已更新）");

    expect(queued.destroy()).toBe(true);
    expect(avatarMessage.getState().queue).toEqual([]);
  });
});

describe("avatarMessage 关闭原因", () => {
  it("程序销毁当前消息回调 destroy", () => {
    const reasons: AvatarMessageCloseReason[] = [];
    const msg = avatarMessage.show({
      content: "处理中",
      onClose: (reason) => reasons.push(reason),
    });

    msg.destroy();

    expect(reasons).toEqual(["destroy"]);
  });

  it("按钮动作通过 destroy(id, reason) 透传 ok / cancel / duration", () => {
    const reasons: AvatarMessageCloseReason[] = [];

    for (const reason of ["ok", "cancel", "duration"] as const) {
      const msg = avatarMessage.show({
        content: reason,
        onClose: (closedBy) => reasons.push(closedBy),
      });
      avatarMessage.destroy(msg.id, reason);
    }

    expect(reasons).toEqual(["ok", "cancel", "duration"]);
  });
});

describe("avatarMessage 可见性与红点", () => {
  it("页面不可见时默认丢弃消息（从未展示，不回调 onClose）", () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const onClose = vi.fn();

    const dropped = avatarMessage.show({ content: "隐藏期间到达", onClose });

    expect(dropped.id).toBe("avatar-msg-1");
    expect(onClose).not.toHaveBeenCalled();
    expect(avatarMessage.getState().message).toBeNull();

    const held = avatarMessage.show({ content: "要求保留", hiddenMessage: "hold" });

    expect(avatarMessage.getState().message?.id).toBe(held.id);
  });

  it("红点完全手动控制，不和消息联动", () => {
    expect(avatarBadge.getState().visible).toBe(false);

    avatarBadge.show();
    expect(avatarBadge.getState().visible).toBe(true);

    avatarMessage.show({ content: "有消息" });
    expect(avatarBadge.getState().visible).toBe(true);

    avatarBadge.hide();
    expect(avatarBadge.getState().visible).toBe(false);

    avatarMessage.destroy();
    expect(avatarBadge.getState().visible).toBe(false);
  });
});
