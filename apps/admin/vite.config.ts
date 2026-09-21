import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

// 后台应用只负责自己的 dev/build；lint / fmt / staged 由工作区根配置统一管
export default defineConfig({
  plugins: lazyPlugins(() => [react()]),
});
