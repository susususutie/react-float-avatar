import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  // 库产物：dts + 自动维护 exports（开发指向 src，发布指向 dist）
  pack: {
    deps: { resolveDepSubpath: true },
    // 用默认 dts 生成器：tsgo 需要 typescript@7 / @typescript/native-preview，本项目是 TS 6
    dts: true,
    exports: { devExports: true },
  },
  // .tsx 测试需要 JSX 转换；lint/fmt 由工作区根配置统一管
  plugins: lazyPlugins(() => [react()]),
});
