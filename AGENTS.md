# AGENTS.md — web-ai-poc

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## 项目概述

React 19 + antd v6 + react-router-dom v7 的 Web AI 助手浮动头像 POC。
单包 Vite+ 项目（非 monorepo）。

## 常用命令

```bash
vp install        # 拉取代码后安装依赖
vp check          # 格式化 + lint + 类型检查（提交前必跑）
vp check --fix    # 自动修复格式和 lint 问题
vp test           # 运行单元测试（vitest，测试文件与被测模块同目录）
vp run build      # tsc -b && vp build（先类型检查再构建）
vp dev            # 启动开发服务器
```

- **构建脚本**（`package.json`）：`tsc -b && vp build`，TypeScript 检查在 Vite 构建之前执行
- **Lint 配置**（`vite.config.ts`）：插件 `react`、`typescript`、`oxc`，启用了 `typeAware: true, typeCheck: true`
- **单 tsconfig**：无 project references；target/module/lib = esnext；jsx = react-jsx

## 架构

```
src/
  App.tsx              路由配置（嵌套在 AdminLayout 下）
  main.tsx             StrictMode + BrowserRouter + index.css
  index.css            html/body/root: height 100%, overflow hidden
  components/
    AdminLayout.tsx    antd Layout（固定 100vh，深色 Header 用 darkAlgorithm）
    AnchorMask.tsx     拖拽期锚定可视化遮罩（纯展示，几何全部外部传入）
    FloatingAvatar.tsx 核心功能：拖拽 + 边缘锚定 + 吸附 + 持久化
    avatar.png         AI 助手头像图片
  hooks/
    useDraggable.ts    pointer events，只报告拖拽增量（含 pointercancel 取消）
    useEdgeAnchor.ts   锚点语义：换算 / 校验 / 持久化 + useEdgeAnchor（含同名 .test.ts）
    snapToCorner.ts    四角目标点 + 吸附判定（纯函数，含同名 .test.ts）
    resolveDrop.ts     落点决策：夹紧 + 吸附 + 反算锚点（纯函数，含同名 .test.ts）
    useViewportSize.ts 视口尺寸（窗口缩放时更新）
  pages/               Home、About、Dashboard（简单内容页）
```

## FloatingAvatar 核心设计决策

这是项目的核心功能。修改前务必先读 `src/components/FloatingAvatar.tsx` 和 `src/hooks/useEdgeAnchor.ts`。

### CSS 定位属性与锚定方向一致

CSS 属性名镜像锚定边：

- 锚定 `right` → 使用 `style.right`（不是 `style.left`）
- 锚定 `bottom` → 使用 `style.bottom`（不是 `style.top`）

这样窗口缩放时浏览器自动处理跟随，无需 JS 重算。

### 拖拽用 transform，松手一次性提交

- **拖拽中**：元素保持原有 CSS 定位不动，`transform: translate(dx, dy)` 实现视觉移动（GPU 合成，不触发 layout）
- **松手时**：用 `resolveDrop()` 把落点换算成锚点，并在**同一次提交**里把 `transform` 清零；锚点能精确还原落点，所以非吸附落点的视觉位置不会变化，不需要任何补偿 transform
- **吸附**：落点距角落目标点不超过 `SNAP_THRESHOLD` 时落到该角，这里的位移是预期行为
- **点击**：位移小于 `CLICK_THRESHOLD` 时不落锚点，元素回到拖拽前的位置

**关键**：`anchorToXY()` 与 `xyToAnchor()` 必须严格互逆（`anchorToXY(xyToAnchor(left, top)) === (left, top)`）。一旦不互逆，松手后元素会整体偏移半个自身尺寸——这正是历史上出现过的 bug，`src/hooks/useEdgeAnchor.test.ts` 覆盖了该不变量。

**关键**：落点决策只有 `resolveDrop()` 一处。拖拽预览和真实落锚必须调用它，不要在组件里另写一遍夹紧/吸附/换算，否则遮罩会画出一个元素最终不会去的位置。

### 锚点状态统一由 useEdgeAnchor 管理

`useEdgeAnchor` 持有锚点 state：渲染用返回的 `style`（由 state 派生），事件回调直接用渲染期的 `anchor`，持久化由 effect 跟随 state 完成。锚点换算、校验、持久化只在这一处实现，不要在组件里再写一份。

### 位置合法性校验

- `validateAnchor()`：加载时和窗口缩放时将偏移量夹紧到视口范围内（在 `useEdgeAnchor` 内）
- `clampToViewport()`：拖拽跟随时约束坐标不超出视口，`resolveDrop()` 落点结算也用它（在 `useEdgeAnchor` 内）

两者缺一不可，否则窗口缩放后头像可能跑到视口外。

### 锚定可视化遮罩（AnchorMask）

「边锚定 + 四角吸附」规则本身不可见，容易被误判成拖动定位不准，所以有一层可选的解释层：

- `mask`：`"off"`（默认）/ `"drag"`（仅拖拽中，`AdminLayout` 演示用这个）/ `"always"`（常驻，适合讲解）
- `maskOptions`：`snapZone`（吸附范围）、`anchorEdges`（锚定边 + offset 标尺）、`flipLine`（锚定边翻面中线）、`releasePreview`（松手落点幽灵圈）、`debug`（调试面板，默认 `import.meta.env.DEV`）
- `maskClassName` / `maskStyle`：样式逃生口；不要在 `maskStyle` 里改 `pointerEvents`，那会让遮罩挡住头像的命中区域

画出来的东西：四角吸附范围是**虚线圆**（半径 `threshold`，圆心是角落目标点，元素中心进圈即命中，见 `cornerTargets()`）；中线是锚定边翻面位置（元素中心越过视口中线后 `left`/`right` 互换）；幽灵圈是松手后的真实落点，吸附命中时会跳到角落并用引线连回元素。

`"drag"` 模式下遮罩随拖拽挂载/卸载：拖拽中的每一帧 `FloatingAvatar` 用 `resolveDrop()` 算出 pending 锚点并传给遮罩，非拖拽状态下则由已提交锚点推出来。

## 注意事项

- `vp check` 会报 `useDraggable` 中 `callbacksRef.current = options` 的 ref 警告——这是刻意的「最新回调」模式（消费方不必 memo 回调），可以忽略
- antd v6 Header 深色主题用 `theme.getDesignToken({ algorithm: theme.darkAlgorithm })`，不要硬编码颜色
- 锚点持久化只走 `useEdgeAnchor`，不要再引入第二套 localStorage hook
- `useDraggable` 用原生 DOM 事件（document 捕获阶段）；`onDragEnd(deltaX, deltaY)` 总会触发，点击判定由 `FloatingAvatar` 负责
- 图片导入（如 `avatar.png`）由 Vite 处理，无需特殊配置
