import { Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function Dashboard() {
  return (
    <Card>
      <Title level={3}>仪表盘</Title>
      <Paragraph>这里是仪表盘页面，用于展示一些模拟数据。</Paragraph>
      <Paragraph>AI 助手头像支持拖拽移动位置，点击触发事件（后续接入 AI 对话面板）。</Paragraph>
    </Card>
  );
}
