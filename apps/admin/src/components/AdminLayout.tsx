import { FloatingAvatar } from "float-avatar";
import { useState } from "react";
import { Layout, Menu, theme } from "antd";
import { HomeOutlined, InfoCircleOutlined, DashboardOutlined } from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import type { MenuProps } from "antd";
import avatarImg from "../assets/avatar.png";

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
  { key: "/about", icon: <InfoCircleOutlined />, label: "关于" },
];

const darkToken = theme.getDesignToken({ algorithm: theme.darkAlgorithm });

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    void navigate(key);
  };

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div
          style={{
            height: 32,
            margin: 16,
            background: "rgba(255,255,255,0.2)",
            borderRadius: borderRadiusLG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 600,
            fontSize: collapsed ? 12 : 14,
          }}
        >
          {collapsed ? "AI" : "AI POC"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={onMenuClick}
        />
      </Sider>
      <Layout style={{ overflow: "hidden" }}>
        <Header
          style={{
            padding: "0 24px",
            background: darkToken.colorBgContainer,
          }}
        >
          <h2
            style={{
              margin: 0,
              lineHeight: "64px",
              color: darkToken.colorText,
            }}
          >
            Web AI POC
          </h2>
        </Header>
        <Content
          style={{
            padding: 24,
            background: colorBgContainer,
            overflow: "auto",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
      {/* mask="drag"：拖拽中显示锚定边、吸附范围与落点预览（演示用，改成 "off" 即关闭） */}
      {/* mask="drag"：拖拽中显示锚定边、吸附范围与落点预览（演示用，改成 "off" 即关闭） */}
      <FloatingAvatar
        avatarSrc={avatarImg}
        mask="drag"
        onClick={() => console.log("AI avatar clicked")}
      />
    </Layout>
  );
}
