import { Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function About() {
  return (
    <Card>
      <Title level={3}>关于</Title>
      <Paragraph>本项目基于 React + TypeScript + Vite+ + Ant Design 构建。</Paragraph>
      <Paragraph>技术栈：react-router-dom v7、antd v6、@ant-design/icons v6。</Paragraph>
    </Card>
  );
}
