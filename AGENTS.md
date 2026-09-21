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
    AvatarBubble.tsx   头像消息气泡（定位 / 动效 / 倒计时 / 插槽，视觉取 antd token）
    FloatingAvatar.tsx 核心功能：拖拽 + 边缘锚定 + 吸附 + 持久化
    avatar.png         AI 助手头像图片
  hooks/
    avatarMessage.ts   消息与角标单例：状态 + 队列策略 + useAvatarState（含同名 .test.ts）
    resolveBubblePlacement.ts 气泡定位：头顶优先 / 翻面 / 夹紧（纯函数，含同名 .test.ts）
    useDraggable.ts    pointer events，只报告拖拽增量（含 pointercancel 取消）
    useEdgeAnchor.ts   锚点语义：换算 / 校验 / 持久化 + useEdgeAnchor（含同名 .test.ts）
    snapToCorner.ts    四角目标点 + 吸附判定（纯函数，含同名 .test.ts）
    resolveDrop.ts     落点决策：夹紧 + 吸附 + 反算锚点（纯函数，含同名 .test.ts）
    useViewportSize.ts 视口尺寸（窗口缩放时更新）
  pages/               Home、About、Dashboard（简单内容页）
  test/
    domEnvironment.ts  UI 测试的 jsdom 补齐（matchMedia / ResizeObserver / animate / PointerEvent + 布局尺寸 stub）
scripts/
  visual-check.mjs     浏览器几何验收：在真实浏览器量取几何并比对预期表，漂移即非零退出
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

### 头像消息与角标

消息与红点都走 `src/hooks/avatarMessage.ts` 的单例，**不要在业务组件里另存一份消息状态**：

```ts
avatarMessage.show("一行简单消息");          // 纯消息：直接传字符串（等价 { content: 字符串 }）
// 复杂消息才需要对象形式
const id = avatarMessage.show({
  key?, title?, content?, avatar?,
  okText?, okType?, onOk?,     // 等价 antd Modal 的主按钮
  cancelText?, onCancel?,      // 等价 Modal 的次按钮
  footer?,                     // 完全自定义底部（等价 Modal 的 footer）
  duration?,
});
avatarMessage.update(id, "加载完成");                // patch 也可以只给字符串
avatarMessage.close(id);                            // 不传 id 关当前；队列头部会自动晋升
avatarBadge.show(); avatarBadge.hide(); avatarBadge.getState();
```

- **只有两种形状**：纯消息（`show("文本")`，≈ antd `message`：紧凑留白 + 正常字重）与复杂消息（带 `title` / `avatar` / `footer` / 自定义正文，≈ `notification`：完整留白）。`content` 是必填项，不要用「只有 title」表达一行文案；`title` 只在复杂消息里当加粗标题用。
- **底部按钮用 Modal 的语义**：`okText/okType/onOk` 与 `cancelText/onCancel`，只有给了对应回调才渲染按钮（避免出现点了没反应的「确定」）；`footer` 是逃生口，可完全自定义底部。默认顺序与原型一致：主按钮在左、次按钮在右（antd Modal 是反的，要对齐就用 `footer` 自己排）。
- **id 即身份**：`show()` 返回的 id 就是 key（不传则自动生成 `avatar-msg-N`），后续都用它操作；同一个 key 重复 `show` 视为替换同一条（antd `message` 的 key 心智）。
- **顶掉规则全部显式**：默认 `replaceable: true`，后来的消息直接顶掉当前这条（当前消息收到 `onClose("replaced")`）；当前消息 `replaceable: false` 时新消息排队（`QUEUE_LIMIT = 3`，超出丢最旧并回调 `queue-drop`）。刻意不做「带操作按钮就不能被顶掉」这类隐式判断。
- **`duration` 默认 0 = 只能手动关闭**，避免消息悄悄消失；要自动关闭就显式传毫秒数。带操作的消息建议不传。
- **页面不可见**：`hiddenTimer` 默认 `"pause"`（倒计时只在可见时推进，靠 `remaining` 累计而不是暂停定时器）；`hiddenMessage` 默认 `"drop"`（不可见期间到达的消息直接丢弃并回调 `hidden-drop`），需要保留时传 `"hold"`。
- **红点纯手动**：组件不会因为「有消息」自动点亮、也不会因为「消息关闭」自动清除；要联动就自己写在 `onClose` 或操作按钮里（页面示例 Home 就是这么做的）。
- **触发点写在业务侧**：页面进入类提示直接在页面组件里 `useEffect` 调 `show()`（三个页面都有示例），组件不提供路由规则表。

气泡（`AvatarBubble.tsx`）的几个实现约束：

- 位置来自锚点 + `resolveBubblePlacement()`：默认头顶、箭头指向头像中心；上方放不下且头像在上半屏才翻到下方；水平按锚定边对齐后夹紧，箭头随夹紧结果重算。改定位规则只改这个纯函数，并补 `resolveBubblePlacement.test.ts`。
- 判定用**自然高度**（`chrome + content.scrollHeight`），不要用限高后的实际高度，否则会出现「限高 → 变矮 → 又判定放得下 → 取消限高」的抖动；超出可用空间时只压缩正文区并内部滚动，标题与操作区始终可见。
- 动效走 Web Animations：进场在挂载/新消息时播放；**退场先播完动画再调 `onClose`**，因此组件不需要「保留已消失消息」的显示态；退场途中来新消息会取消动画、原地换内容。
- 拖拽中气泡隐藏（`hidden`）且倒计时暂停：头像靠 transform 位移，气泡按锚点算会与头像脱钩，松手后再按新锚点重新出现。
- 视觉全部取 antd token（`colorBgElevated` / `boxShadowSecondary` / `borderRadiusLG` / `colorBorderSecondary`…），不要硬编码颜色，保持和页面浮层同一套设计语言。
- **尺寸与排版规格（改样式前先按此表核对，`AvatarBubble.test.tsx` 已把这些值锁成断言）**：卡片圆角 `borderRadiusLG`(8)、图标槽 42、图标与文字列间距 16、标题 14px/行高 20px/600 且与内容间距 8、正文 14px/行高 20px、操作按钮左对齐且 32px 高、关闭图标用 `close.svg` 原尺寸 12×12 装在 24×24 按钮里居中、尾巴 12px 方块旋转 45°。留白与宽度上限按形状分档：复杂消息内边距 24 / 上限 400；纯消息内边距 `12px 16px` / 上限 320。关闭按钮位置由内边距推出（复杂：距上 11 / 距右 14 的按钮盒；纯消息：距上 10 / 距右 6，与文字行居中）。注意卡片有 1px 边框，所以实测内边距会比原型多 1px（25 而非 24）。按钮颜色跟随 antd 主题主色（原型里的青绿是对方品牌色，要换就改 `ConfigProvider` 的 `colorPrimary`）。
- **间距按尾巴尖端算，且定位用贴头像那一侧**：尾巴方块旋转 45° 后尖端伸出卡片约 `12×√2/2 ≈ 8.5px`，所以传给 `resolveBubblePlacement()` 的 `gap` 是 `gap + ARROW_REACH`（默认视觉间距 16px）；返回的 `edgeOffset` 作用于「贴头像那一侧」（top 放置时给 `bottom`），这样间距不依赖气泡高度——内容变高时气泡朝远离头像的方向长，间距始终精确。历史上的 bug：只按卡片边缘算间距、又用 `top` 定位，实测只剩 ~1.9px，看着像贴住甚至重合。
- **测量气泡尺寸必须用布局尺寸**（`offsetWidth/offsetHeight` + `clientHeight/scrollHeight`），**不要用 `getBoundingClientRect()`**：进出场动画给外层加了 `scale`，rect 会把缩放算进去（实测卡片 138px 量成 127px），水平对齐就按错误宽度算；而 transform 不改变布局尺寸、`ResizeObserver` 不会触发，错位会一直持续到下一次渲染。历史上「进入『关于』页右对齐超过头像、只有 `update` 后才对齐」就是这个原因。
- 关闭按钮的图标是 `close.svg`（原型里的「缩小」图形，`fill-opacity 0.447` 正好等于 `colorIcon`）。它当前语义是关闭消息；若将来要做「收起（消息保留、可再展开）」需要额外加折叠态，另外它是 `<img>`，hover 不会变色。
- **业务内容的块不进组件**：进度条、状态条这类自定义内容属于业务，直接写在页面里（示例见 `src/pages/Home.tsx` 的 `DemoProgress` / `DemoNote`），组件只提供插槽。原型里这两个块的量感作为页面侧参考：进度条高 6（**该行高度也锁 6**，否则 12px 百分比文字的 20px 行高会把卡片撑高 14px）、提示条高 32（上下 6px 内边距 + 3px 左强调条 + 只圆右侧两角 + 宽度按内容收缩）。
- **紧凑形态只看消息结构**：没有头像、没有标题、没有底部、正文是纯文本（字符串/数字）时走紧凑留白（`show("文本")` 就是这一档）；其余一律完整留白。不要引入「按内容长度」之类的隐式规则，也不要用「只有 title」表达一行文案。

### 测试与视觉回归（改渲染相关代码必看）

三层防线，改样式/定位/动效前先看第二层：

1. **纯函数层**（`*.test.ts`，node 环境）：锚点互逆、落点决策、吸附几何、气泡定位、队列与顶掉规则、可见性与红点状态。
2. **UI 渲染层**（`AvatarBubble.test.tsx` / `FloatingAvatar.test.tsx`，`// @vitest-environment jsdom`）：把渲染规格锁成断言——内边距、宽度上限、圆角、图标槽尺寸、标题/正文字号行高字重、关闭图标尺寸与位置、尾巴尺寸与位置、定位值、进出场动效参数、按钮语义、拖拽落锚写入的 anchor、拖拽期气泡隐藏、红点显隐。**这些断言是渲染规格的事实来源**：故意改样式时同步改断言，非故意改动时它们会失败，这正是要的效果。
3. **浏览器几何验收**（`node scripts/visual-check.mjs`，需要 Chrome + `vp dev` 跑在 5174）：在真实浏览器里量取卡片矩形、字号字重、按钮、关闭图标、右对齐、尾巴间距等几何值并与预期表比对，任一项漂移就非零退出。像素/字体/antd CSS 这类 jsdom 测不到的东西靠这一层。

jsdom 环境的补齐在 `src/test/domEnvironment.ts`（`jsdom` 是 devDependency，只在测试环境使用）：`matchMedia` / `ResizeObserver` / `Element.animate` / `PointerEvent` 的最小替身，以及 `stubLayout()`（写入假的 offsetWidth/offsetHeight/scrollHeight）和 `triggerResize()`（手动触发重新测量）。jsdom 不做真实布局，所以 UI 断言只断内联样式与结构，不断像素。

组件里给 DOM 自动化留了两个稳定钩子：标题 `data-bubble-title`、正文 `data-bubble-content`（`AvatarBubble.test.tsx` 与 `scripts/visual-check.mjs` 都靠它们定位，不要随手删）。

## 注意事项

- `vp check` 会报 `useDraggable` 中 `callbacksRef.current = options` 的 ref 警告——这是刻意的「最新回调」模式（消费方不必 memo 回调），可以忽略
- antd v6 Header 深色主题用 `theme.getDesignToken({ algorithm: theme.darkAlgorithm })`，不要硬编码颜色
- 锚点持久化只走 `useEdgeAnchor`，不要再引入第二套 localStorage hook
- 消息与角标只通过 `avatarMessage` / `avatarBadge` 单例操作；层级约定仍是遮罩 9998 < 气泡与头像 9999
- `useDraggable` 用原生 DOM 事件（document 捕获阶段）；`onDragEnd(deltaX, deltaY)` 总会触发，点击判定由 `FloatingAvatar` 负责
- 图片导入（如 `avatar.png`）由 Vite 处理，无需特殊配置
