import { useEffect } from "react";
import type { ReactNode } from "react";
import { Button, Card, Space, theme, Typography } from "antd";
import { avatarBadge, avatarMessage } from "react-float-avatar";
import avatarImg from "../assets/avatar.png";

const { Title, Paragraph } = Typography;

/**
 * 演示用的正文块：进度条与「左侧强调条的提示块」属于业务内容，
 * 所以样式直接写在页面里（组件只负责气泡外壳与插槽）。
 */
function DemoProgress({ percent }: { percent: number }) {
  const { token } = theme.useToken();
  const value = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: token.margin, height: 6 }}>
      <div
        style={{
          flex: "1 1 auto",
          height: 6,
          borderRadius: 3,
          background: token.colorFillSecondary,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            borderRadius: 3,
            background: token.colorPrimary,
          }}
        />
      </div>
      <span
        style={{
          flex: "0 0 auto",
          color: token.colorTextTertiary,
          fontSize: token.fontSizeSM,
          lineHeight: 1,
        }}
      >
        {value}%
      </span>
    </div>
  );
}

function DemoNote({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();

  return (
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
      {children}
    </div>
  );
}

export default function Home() {
  const { token } = theme.useToken();

  // 完整形态示例：图标 + 标题 + 正文（业务自定义块）+ Modal 风格的确定/取消
  useEffect(() => {
    avatarMessage.show({
      key: "home-guide",
      avatar: (
        <img src={avatarImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ),
      title: "【切换演练】核心系统应用级灾备总预案",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: token.marginSM }}>
          <DemoProgress percent={60} />
          <div>当前节点：[HIS主机]启动验证机</div>
          <DemoNote>
            需人工处理，已等待{" "}
            <strong style={{ color: token.colorWarning, fontWeight: token.fontWeightStrong }}>
              32分钟
            </strong>
          </DemoNote>
        </div>
      ),
      okText: "立即处理",
      onOk: () => avatarBadge.hide(),
      cancelText: "稍后再说",
      onCancel: () => avatarBadge.show(),
    });
  }, [token]);

  return (
    <Card>
      <Title level={3}>首页</Title>
      <Paragraph>欢迎使用 Web AI POC 项目。</Paragraph>
      <Paragraph>
        这是一个多页面后台项目，用于验证 AI
        助手悬浮头像功能。点击左侧导航切换页面，悬浮头像始终可见。
      </Paragraph>
      <Space>
        <Button
          onClick={() => {
            // 简单消息示例：直接传字符串，紧凑留白 + 正常字重，会按顶掉规则替换当前气泡
            avatarMessage.show("这是一条紧凑消息，会顶掉当前气泡");
          }}
        >
          再来一条消息
        </Button>
        <Button onClick={() => avatarBadge.hide()}>清除角标</Button>
      </Space>
    </Card>
  );
}
