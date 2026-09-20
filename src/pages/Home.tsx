import { Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function Home() {
  return (
    <Card>
      <Title level={3}>首页</Title>
      <Paragraph>欢迎使用 Web AI POC 项目。</Paragraph>
      <Paragraph>
        这是一个多页面后台项目，用于验证 AI
        助手悬浮头像功能。点击左侧导航切换页面，悬浮头像始终可见。
      </Paragraph>
    </Card>
  );
}
