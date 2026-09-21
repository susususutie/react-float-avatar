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
    const id = avatarMessage.show({ content: "你好" });

    expect(avatarMessage.getState().message?.id).toBe(id);
    expect(avatarMessage.getState().message?.content).toBe("你好");
    expect(avatarMessage.getState().queue).toEqual([]);
  });

  it("默认后来的消息顶掉前一条，并回调 replaced", () => {
    const reasons: AvatarMessageCloseReason[] = [];
    avatarMessage.show({ content: "第一条", onClose: (reason) => reasons.push(reason) });

    const second = avatarMessage.show({ content: "第二条" });

    expect(avatarMessage.getState().message?.id).toBe(second);
    expect(reasons).toEqual(["replaced"]);
  });

  it("当前消息 replaceable: false 时新消息排队，关闭后晋升", () => {
    const first = avatarMessage.show({ content: "重要消息", replaceable: false });
    const second = avatarMessage.show({ content: "次要消息" });

    expect(avatarMessage.getState().message?.id).toBe(first);
    expect(avatarMessage.getState().queue.map((item) => item.id)).toEqual([second]);

    avatarMessage.close();

    expect(avatarMessage.getState().message?.id).toBe(second);
    expect(avatarMessage.getState().queue).toEqual([]);
  });

  it("队列上限为 3，超出的丢最旧并回调 queue-drop", () => {
    avatarMessage.show({ content: "第 0 条", replaceable: false });
    const dropped: string[] = [];
    const queued = ["第 1 条", "第 2 条", "第 3 条", "第 4 条"].map((content) =>
      avatarMessage.show({
        content,
        onClose: (reason) => {
          if (reason === "queue-drop") dropped.push(content);
        },
      }),
    );

    expect(avatarMessage.getState().queue.map((item) => item.id)).toEqual(queued.slice(1));
    expect(dropped).toEqual(["第 1 条"]);
  });

  it("同一个 key 重复 show 仍是同一条消息", () => {
    const id = avatarMessage.show({ key: "sync", content: "同步中" });

    expect(id).toBe("sync");
    avatarMessage.show({ key: "sync", content: "同步完成" });

    expect(avatarMessage.getState().message?.id).toBe("sync");
    expect(avatarMessage.getState().message?.content).toBe("同步完成");
  });
});

describe("avatarMessage 消息形状（对齐 antd）", () => {
  it("直接传字符串等价于只有 content 的消息", () => {
    const id = avatarMessage.show("一条简单消息");

    expect(avatarMessage.getState().message?.id).toBe(id);
    expect(avatarMessage.getState().message?.content).toBe("一条简单消息");
    expect(avatarMessage.getState().message?.title).toBeUndefined();
  });

  it("update 也接受字符串（只改 content）", () => {
    const id = avatarMessage.show({ title: "标题", content: "正文" });

    expect(avatarMessage.update(id, "改过的正文")).toBe(true);
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
    expect(item?.okType).toBe("primary");
    expect(item?.onOk).toBe(onOk);
    expect(item?.cancelText).toBe("稍后再说");
    expect(item?.onCancel).toBe(onCancel);
    expect(item?.footer).toBeUndefined();
  });
});

describe("avatarMessage 按 id 更新", () => {
  it("更新当前消息内容，身份不变", () => {
    const id = avatarMessage.show({ content: "正在加载" });

    expect(avatarMessage.update(id, { content: "加载完成" })).toBe(true);
    expect(avatarMessage.getState().message?.id).toBe(id);
    expect(avatarMessage.getState().message?.content).toBe("加载完成");
  });

  it("队列中的消息也能更新，已关闭的 id 返回 false", () => {
    avatarMessage.show({ content: "重要消息", replaceable: false });
    const queued = avatarMessage.show({ content: "排队中" });

    expect(avatarMessage.update(queued, { content: "排队中（已更新）" })).toBe(true);
    expect(avatarMessage.getState().queue[0].content).toBe("排队中（已更新）");

    avatarMessage.close(queued);

    expect(avatarMessage.update(queued, { content: "不该生效" })).toBe(false);
    expect(avatarMessage.getState().queue).toEqual([]);
  });
});

describe("avatarMessage 可见性与红点", () => {
  it("页面不可见时默认丢弃消息，hiddenMessage: hold 则正常接收", () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const reasons: AvatarMessageCloseReason[] = [];

    const droppedId = avatarMessage.show({
      content: "隐藏期间到达",
      onClose: (reason) => reasons.push(reason),
    });

    expect(droppedId).toBe("avatar-msg-1");
    expect(reasons).toEqual(["hidden-drop"]);
    expect(avatarMessage.getState().message).toBeNull();

    const heldId = avatarMessage.show({ content: "要求保留", hiddenMessage: "hold" });

    expect(avatarMessage.getState().message?.id).toBe(heldId);
  });

  it("红点完全手动控制，不和消息联动", () => {
    expect(avatarBadge.getState().visible).toBe(false);

    avatarBadge.show();
    expect(avatarBadge.getState().visible).toBe(true);

    avatarMessage.show({ content: "有消息" });
    expect(avatarBadge.getState().visible).toBe(true);

    avatarBadge.hide();
    expect(avatarBadge.getState().visible).toBe(false);

    avatarMessage.close();
    expect(avatarBadge.getState().visible).toBe(false);
  });
});
