import { useEffect } from "react";
import { Card, Typography } from "antd";
import { avatarMessage } from "react-float-avatar";

const { Title, Paragraph } = Typography;

export default function About() {
  // 最简单的页面级提示：单条文字 + 5 秒后自动关闭。
  // key 让 StrictMode 下重复执行的 effect 视为同一条消息，不会闪两次。
  useEffect(() => {
    avatarMessage.show({ key: "about-intro", content: "进入关于页面", duration: 5000 });
  }, []);

  return (
    <Card>
      <Title level={3}>关于</Title>
      <Paragraph>本项目基于 React + TypeScript + Vite+ + Ant Design 构建。</Paragraph>
      <Paragraph>技术栈：react-router-dom v7、antd v6、@ant-design/icons v6。</Paragraph>
    </Card>
  );
}
