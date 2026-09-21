import { useEffect } from "react";
import { Card, Typography } from "antd";
import { avatarMessage } from "float-avatar";

const { Title, Paragraph } = Typography;

export default function Dashboard() {
  // 用 id 引用同一条消息：先展示"加载中"，1.2 秒后原地改文案并开始倒计时。
  // update 不重播进场动画，也不会重置倒计时（除非显式传 duration）。
  useEffect(() => {
    const id = avatarMessage.show({ key: "dashboard-loading", content: "正在加载仪表盘数据…" });
    const timer = window.setTimeout(() => {
      avatarMessage.update(id, { content: "仪表盘数据已加载完成", duration: 4000 });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Card>
      <Title level={3}>仪表盘</Title>
      <Paragraph>这里是仪表盘页面，用于展示一些模拟数据。</Paragraph>
      <Paragraph>AI 助手头像支持拖拽移动位置，点击触发事件（后续接入 AI 对话面板）。</Paragraph>
    </Card>
  );
}
