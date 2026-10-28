import { useEffect, useState } from "react";
import { Button, Card, Divider, Modal, Progress, Space, Tag, theme, Typography } from "antd";
import { avatarBadge, avatarMessage } from "react-float-avatar";
import avatarImg from "../assets/avatar.png";

const { Title, Paragraph } = Typography;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export default function Home() {
  const { token } = theme.useToken();
  const [lastReason, setLastReason] = useState("—");

  // 完整形态示例：图标 + 标题 + 正文（业务自定义块）+ Modal.confirm 风格的确定/取消
  useEffect(() => {
    avatarMessage.confirm({
      key: "home-guide",
      avatar: (
        <img src={avatarImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ),
      title: "【切换演练】核心系统应用级灾备总预案",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: token.marginSM }}>
          <Progress percent={60} />
          <div>当前节点：[HIS主机]启动验证机</div>
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "100%",
              padding: `6px ${token.paddingSM}px`,
              borderLeft: `3px solid ${token.colorWarning}`,
              borderRadius: `0 ${token.borderRadiusSM}px ${token.borderRadiusSM}px 0`,
              background: token.colorFillTertiary,
            }}
          >
            需人工处理，已等待
            <strong style={{ color: token.colorWarning, fontWeight: token.fontWeightStrong }}>
              32分钟
            </strong>
          </div>
        </div>
      ),
      okText: "立即处理",
      onOk: () => avatarBadge.hide(),
      cancelText: "稍后再说",
      onCancel: () => avatarBadge.show(),
    });
  }, [token]);

  const showPlain = () => {
    avatarMessage.show("这是一条普通消息，按默认规则会顶掉当前消息");
  };

  const showAutoClose = () => {
    avatarMessage.show({
      content: "这条消息 3 秒后自动关闭（悬停、聚焦或拖拽头像会暂停倒计时）",
      duration: 3000,
      onClose: (reason) => setLastReason(reason),
    });
  };

  const showReplaced = () => {
    avatarMessage.show({
      content: "第一条：马上会被下一条顶掉",
      onClose: (reason) => setLastReason(reason),
    });
    avatarMessage.show("第二条：默认 replaceable，顶掉了上一条");
  };

  const showInstance = () => {
    const msg = avatarMessage.show({
      content: "实例示例：正在处理…",
      onClose: (reason) => setLastReason(reason),
    });
    window.setTimeout(() => msg.update("实例示例：1 秒后自动销毁"), 1000);
    window.setTimeout(() => msg.destroy(), 2000);
  };

  const showCloseReason = () => {
    avatarMessage.show({
      content: "关闭这条消息（右上角 X / Esc），页面底部会显示 onClose 收到的原因",
      onClose: (reason) => setLastReason(reason),
    });
  };

  const showAsyncOk = () => {
    avatarMessage.confirm({
      title: "异步确定",
      content: "点「开始提交」后等待 1.2 秒，按钮显示 loading；resolve 后关闭。",
      okText: "开始提交",
      onOk: async () => {
        await wait(1200);
      },
    });
  };

  const showAsyncFail = () => {
    avatarMessage.confirm({
      title: "异步失败保持打开",
      content: "点「模拟失败」后等待 1.2 秒并 reject：loading 结束，但气泡不会关闭。",
      okText: "模拟失败",
      onOk: async () => {
        await wait(1200);
        throw new Error("demo failure");
      },
    });
  };

  const showCancelVeto = () => {
    avatarMessage.confirm({
      title: "取消需要异步确认",
      content: "点「再想想」会等待 0.8 秒后拒绝取消，气泡保持打开；点确定则关闭。",
      okText: "确定",
      cancelText: "再想想",
      onCancel: async () => {
        await wait(800);
        throw new Error("cancel vetoed");
      },
    });
  };

  const showDanger = () => {
    avatarMessage.confirm({
      title: "删除这条记录？",
      content: "okDanger: true；删除后不可恢复。",
      okDanger: true,
      okText: "删除",
      onOk: async () => {
        await wait(800);
      },
    });
  };

  const showComplex = () => {
    avatarMessage.show({
      avatar: (
        <img src={avatarImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ),
      title: "复杂消息示例",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: token.marginSM }}>
          <Progress percent={80} />
          <div>当前节点：[HIS主机]启动验证机</div>
        </div>
      ),
      okText: "立即处理",
      onOk: () => avatarBadge.hide(),
      cancelText: "稍后再说",
      onCancel: () => avatarBadge.show(),
    });
  };

  const showFooter = () => {
    avatarMessage.show({
      key: "demo-footer",
      title: "自定义底部",
      content: "footer 会完全替换默认的取消/确定按钮。",
      footer: (
        <Space>
          <Button size="small" onClick={() => avatarMessage.destroy("demo-footer")}>
            知道了
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => avatarMessage.show("从自定义 footer 触发的消息")}
          >
            再发一条
          </Button>
        </Space>
      ),
    });
  };

  const showNoClose = () => {
    avatarMessage.confirm({
      content: "closable: false：没有右上角关闭按钮，只能点下面的按钮关闭。",
      closable: false,
      okText: "知道了",
    });
  };

  const showQueue = () => {
    avatarMessage.confirm({
      title: "不可顶掉的消息",
      content: "replaceable: false。关闭这条后，后面两条会按顺序出现。",
      replaceable: false,
      okText: "关闭并看下一条",
    });
    avatarMessage.show({ content: "排队消息 1（3 秒后自动关闭）", duration: 3000 });
    avatarMessage.show({ content: "排队消息 2（3 秒后自动关闭）", duration: 3000 });
  };

  const showAntdModal = () => {
    Modal.confirm({
      title: "title",
      content: (
        <>
          <Progress percent={80} />
          <div>当前节点：[HIS主机]启动验证机</div>
        </>
      ),
      // footer: "footer",
      onOk() {
        console.log("ok");
      },
      onCancel: () => {
        console.log("cancel");
        return Promise.reject();
      },
    });
  };

  return (
    <Space orientation="vertical" size={token.marginLG} style={{ width: "100%" }}>
      <Card>
        <Title level={3}>首页</Title>
        <Paragraph>欢迎使用 Web AI POC 项目。</Paragraph>
        <Paragraph>
          这是一个多页面后台项目，用于验证 AI
          助手悬浮头像功能。点击左侧导航切换页面，悬浮头像始终可见。
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          头像支持拖拽、四角吸附、边缘锚定与位置持久化，拖拽时会显示落点遮罩；下面的按钮用于测试消息气泡与角标的各种能力。
        </Paragraph>
      </Card>

      <Card title="消息气泡测试">
        <Divider titlePlacement="left">基础消息</Divider>
        <Space wrap>
          <Button onClick={showPlain}>普通消息</Button>
          <Button onClick={showAutoClose}>3 秒自动关闭</Button>
          <Button onClick={showReplaced}>默认顶掉</Button>
          <Button onClick={showInstance}>实例 update / destroy</Button>
          <Button onClick={showCloseReason}>关闭原因回调</Button>
        </Space>

        <Divider titlePlacement="left">确认与异步</Divider>
        <Space wrap>
          <Button onClick={showAsyncOk}>异步成功</Button>
          <Button onClick={showAsyncFail}>异步失败保持打开</Button>
          <Button onClick={showCancelVeto}>取消异步否决</Button>
          <Button danger onClick={showDanger}>
            危险操作（danger）
          </Button>
        </Space>

        <Divider titlePlacement="left">结构与队列</Divider>
        <Space wrap>
          <Button onClick={showComplex}>复杂消息（show）</Button>
          <Button onClick={showFooter}>自定义 footer</Button>
          <Button onClick={showNoClose}>无关闭按钮</Button>
          <Button onClick={showQueue}>不可顶掉 + 排队</Button>
          <Button onClick={showAntdModal}>Antd Modal 对照</Button>
        </Space>

        <Divider titlePlacement="left">角标</Divider>
        <Space wrap>
          <Button onClick={() => avatarBadge.show()}>显示角标</Button>
          <Button onClick={() => avatarBadge.hide()}>清除角标</Button>
        </Space>

        <Paragraph style={{ marginTop: token.marginLG, marginBottom: 0 }}>
          最近一次 onClose 原因：
          <Tag color={lastReason === "—" ? undefined : "blue"}>{lastReason}</Tag>
        </Paragraph>
      </Card>
    </Space>
  );
}
