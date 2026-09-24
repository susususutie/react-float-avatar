# react-float-avatar 独立 npm 包发布改造方案

> 状态：已定稿（2026-09-24，含审核修订）。本文档是实施的唯一依据，实施过程中如需偏离，先更新本文档再改代码。
>
> 目标：把 `packages/react-float-avatar` 从「工作区内的库」改造为可独立发布、可被任意宿主应用接入的 npm 包。
>
> **审核修订记录（2026-09-24）**：发布机制章节按实测重写（`npm pack` 跑不起来、`publishConfig.exports` 只有 pnpm 认、`prepublishOnly` 覆盖不到 pack、SSR 漏 `getServerSnapshot` 与模块级 `import.meta.env` 崩溃）；`types` 导出条件撤销；`renderAvatar` 收敛为 `children`；localStorage 恢复改绘制前执行；多实例语义澄清；React 18 验证项补入；删除死 API `DragPreview`；新增发布流程与校验方式章节。实测证据来自 npm 11.19.0 / pnpm 12.4.1 fixture、dist 的 Node import、`renderToString`、消费方 tsc。
>
> **规划补充（2026-09-24）**：新增 §14「未来帧动画 / codex 宠物兼容性约束」——未来头像将支持特定时机的帧动画形象与互动（类 codex 宠物），本次不实现，但立四条设计护栏（槽位结构 / 状态通路 / 动效原则 / 明确不做的范围），保证日后接入是纯加法、无破坏性变更。
>
> **复审修订（2026-09-24，4 阻断 + 5 小问题全部接受）**：槽位裁剪改分层契约（容器不裁 / Badge 在裁剪层外 / 裁剪层只包内容——现状容器无 `overflow: hidden`，按原文实施会裁掉红点）；`:focus-visible` 判定抽 `isFocusVisible` 纯函数（实测 jsdom 30 支持该选择器返回 false，原文「不支持走回退」是错的）；§8 校验顺序改为 build → dist import → pack 且 tarball 用 `--pack-destination` 落临时目录（原文测的是旧 dist）；§11 补「git status 干净再 publish」+ `.gitignore` 忽略 `*.tgz`（pnpm git 检查含未跟踪文件）；视口测量改同构 layout effect；React 18 验证改 /tmp fixture；联合类型口径修正（ReactNode 含 undefined）；§8 补 `vp run -r build`；§14.2 状态现状澄清（头像容器无 hover state，hovered 在气泡侧）。
>
> **实施记录（2026-09-24，§9 六步全部完成）**：81 测试 + `vp check` 0 errors + `visual-check` 26/26 + dist Node import + React19 双 resolution tsc + React18（tsc + renderToString）fixture 全过；真机帧级采样证实锚点恢复在首帧绘制前完成（115 挂载帧全部在持久位置，0 跳帧，§13 时序项闭环）。实施中两处与原文的补充：(a) **视口首帧口径修订**——客户端初始化也不读 window（否则 hydration 首帧 ≠ 服务端），统一 {0,0} + layout effect 绘制前测量，断言口径同步改 §5/§7；(b) **React 18 fixture 实测发现 `AvatarBubble` 裸 `useLayoutEffect`（气泡测量）打 SSR 警告**，抽公共 `hooks/useIsoLayoutEffect` 三处统一（发现于代码落地后的 fixture 复验，本文档随后同步，顺序倒置在此如实记录）。另实测：pnpm 12.4.1 会把 `prepack` 从 tarball 的 `scripts` 剥掉（§8）。发布未执行——按 §11 需用户显式授权。

## 1. 决策总览

### 1.1 用户已决断项

| #   | 议题                        | 决断                                                                                             |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | react peerDependencies 范围 | 放宽以覆盖 18；最终写法见 §2（含验证项，不能只改声明不验证）                                     |
| 2   | 默认文案国际化              | **不做 i18n**。`okText`/`cancelText` 走已有消息字段；只把 `alt`、关闭按钮 `aria-label` 做成 prop |
| 3   | AvatarBubble 导出           | **不对外导出**。气泡是 FloatingAvatar 的内部功能，对外只暴露「一个头像组件」+ 消息/角标单例 API  |
| 4   | License                     | **Apache-2.0**（`license` 字段 + LICENSE 文件）                                                  |

### 1.2 自主决策项（写死即产品特点 vs 必须开放）

**写死，不开放（产品特点 / 手感签名）：**

- `EDGE_PADDING = 24`（默认锚定间距 + 吸附间距）
- `SNAP_THRESHOLD = 80`（吸附触发半径）
- `CLICK_THRESHOLD = 5`（点击/拖拽分界）
- 圆形头像作为**默认形态**（`borderRadius: 50%`）；裁剪与填充的归属见 §14 护栏——`objectFit: cover` 只属于 `avatarSrc` 默认图片分支，不下沉到槽位容器
- 角标红点形态与偏移 `[-4, 4]`
- 拖拽中气泡隐藏、点击回弹等交互语义
- 消息单例模型（一个页面一个助手，README 写明设计假设与多实例边界，见 §6）
- 受控锚点模式（不做；用 `defaultAnchor` + `onAnchorChange` 覆盖）
- debug 遮罩面板文案（dev 工具，可英文化，不做 i18n）

**必须开放 / 必须修复（发布阻断）：** 见 §2、§3、§4、§5。

## 2. 包元数据与文档（不碰实现，先落）

| 项                                 | 值 / 要求                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                          | `0.1.0`                                                                                                                                                                                                                                                                                                                           |
| `license`                          | `Apache-2.0` + 新增 LICENSE 文件（Apache-2.0 全文）                                                                                                                                                                                                                                                                               |
| `repository` / `homepage` / `bugs` | **留空**。当前 git remote 是内网地址（`git@192.168.110.246:…`），填入会暴露内网主机名且对外是死链，npm 还期望 `git+ssh://` 形式；待有公开仓库/镜像后再补                                                                                                                                                                          |
| 包名                               | `react-float-avatar` 已联网核实 npmjs.com 未占用（404），当前可用                                                                                                                                                                                                                                                                 |
| `keywords`                         | `react`、`antd`、`avatar`、`floating`、`draggable`、`assistant`、`bubble`、`badge`                                                                                                                                                                                                                                                |
| README（包目录）                   | **英文为主 + 中文摘要**（公开包发现率考虑）：安装 / 快速上手 / FloatingAvatar props 表 / `avatarMessage`+`avatarBadge` API / 与 antd 的关系（peer 依赖、token 取色）/ 设计假设（消息单例、非受控锚点、storageKey 只隔离位置）/ **Extension points（children 槽位是为自定义形象含动画形象预留的正式扩展点）** / 已知限制（见 §10） |
| `peerDependencies.react`           | `">=18 <20"` → 最终写法 **`^18.0.0 \|\| ^19.0.0`**（惯例写法、更可读）；**必须配套 §7 的 react@18 验证项**，只改声明不验证不算完成                                                                                                                                                                                                |
| `peerDependencies.antd`            | 维持 `^6.0.0`（已核实 antd 6.6.4 的 peer 为 `react >=18.0.0`；若实测兼容 v5 再放宽，不在本次范围）                                                                                                                                                                                                                                |
| exports `types` 条件               | **撤销，不加**（审核意见 5）。理由：(a) 手写容易写成语义错误的子路径；(b) `vp pack` 每次会整体重写 `publishConfig.exports`，手写条件下次 pack 即被覆盖；(c) 实测当前「字符串 exports + 相邻 `index.d.mts`」在 TS node16 与 bundler 下均正常解析。替代保障：§8 校验清单加「装 tarball 后消费方 tsc」                               |

### 2.1 发布机制（按实测重写，本节每条都有本机证据）

**包管理器约束（审核阻断项 1、2）：**

- `npm pack` / `npm publish` 在本仓库**不可用**：根 `devEngines.packageManager` 声明 pnpm 12.4.1，npm 11 直接报 `EBADDEVENGINES` 拒绝执行。
- 即使绕过 devEngines，**也绝不能用 npm 发布**：npm 的 `publish` 只把 `publishConfig` 当 npm config 扁平化，**不应用 `publishConfig.exports` 做 manifest 覆盖**。实测 `npm pack` 出的 tarball 里 `exports` 仍是 `{".": "./src/index.ts"}`，而 `files` 只含 `dist` → 发出去的是「manifest 指向不存在文件」的坏包（消费方 tsc `TS2307`）。pnpm pack/publish 才会重写 `exports`。
- **tarball 判据（复审补充的实测细节）**：pnpm 会从 tarball 里**剥掉整个 `publishConfig`**（只留 `access`）；npm 则**原样保留 `publishConfig` 且不应用它**。「tarball 的 manifest 里 `publishConfig` 是否还在」就是「用没用 pnpm 打包」的判据，§8 的 `tar -xOf` 校验按此核对。
- **结论：本包只能用 `pnpm pack` / `pnpm publish`。此约束写进 README 发布章节。**

**构建钩子（审核阻断项 3）：**

- 实测：`npm pack`、`pnpm pack` 都只跑 `prepack`；只有 `pnpm publish` 才额外跑 `prepublishOnly` + `prepare`。
- `dist` 被 `.gitignore` 排除、`files` 只列 `dist` → 「干净克隆 → 先 pack 校验」会得到只含 package.json 的空包。
- **改法**：把 `"prepublishOnly": "vp run build"` 改为 **`"prepack": "vp run build"`**（pack 与 publish 都覆盖，且与用户级 AGENTS「files 只列 dist 时必须加 prepack」规则一致；避免同时保留两者导致 publish 时重复构建）。

## 3. FloatingAvatar 新增 / 变更 API

```ts
/** 联合约束：avatarSrc 与 children 至少给一个（两者互斥用 undefined 占位表达） */
type FloatingAvatarProps = BaseFloatingAvatarProps &
  ({ avatarSrc: string; children?: undefined } | { avatarSrc?: undefined; children: ReactNode });

interface BaseFloatingAvatarProps {
  /** 头像边长，默认 56；透传到锚点 / 吸附 / 遮罩 / 气泡全套几何 */
  size?: number;
  /** 位置持久化键名，默认 "ai-assistant-position"。
   *  注意：只隔离头像位置；气泡与角标仍是模块级单例（见 §6） */
  storageKey?: string;
  /** 头像无障碍名，默认 "AI 助手"；用于 alt 与 aria-label */
  alt?: string;
  /** 气泡关闭按钮无障碍名，默认 "关闭消息" */
  closeLabel?: string;
  /** 头像与气泡层级，默认 9999；遮罩取 zIndex - 1 */
  zIndex?: number;
  /** 首次访问（无持久化记录）时的默认锚点，默认右下 */
  defaultAnchor?: EdgeAnchor;
  /** 拖拽落锚 / 视口夹紧后回调；持久化恢复不触发（首帧恢复用 ref 标记跳过） */
  onAnchorChange?: (anchor: EdgeAnchor) => void;
  /** 默认头像图片加载失败回调（children 场景消费方自行兜底） */
  onImgError?: (event: SyntheticEvent<HTMLImageElement>) => void;

  onClick?: () => void;
  snapToCorner?: boolean;
  mask?: AnchorMaskMode;
  maskOptions?: AnchorMaskOptions;
  maskClassName?: string;
  maskStyle?: CSSProperties;
}
```

约束：

- **头像入口收敛为两个**（审核意见 6）：`avatarSrc`（图片快捷路径）与 `children`（任意节点逃生口，Lottie / video / 组件）。**不设 `renderAvatar`**——`render*` 命名配 `ReactNode` 不自洽，且三层优先级链是公开 API 心智负担。联合类型做编译期「至少给一个」（**注意口径**：`ReactNode` 本身含 `undefined`，显式传 `children={undefined}` 仍能通过编译，所以是「编译期挡绝大多数 + 运行时兜底补漏」，不是绝对保证）；运行时两者全缺省时渲染空圆形兜底（不崩即可）。
- **头像槽位契约（§14 护栏的落点；复审修订：分层裁剪）**——现状是容器只有 `borderRadius: "50%"` 而**无 `overflow: hidden`**，裁剪在 `<img>` 上，且是刻意的（红点 `offset: [-4, 4]` 靠容器不裁剪才不会被切掉）。契约按三层落：
  1. **容器层（外层 div）**：独占几何与交互——`size`、`borderRadius`、角标落点、拖拽、a11y（`role`/`tabIndex`/`aria-label`），**不裁剪**；
  2. **Badge 角标**：保持在裁剪层之外（维持现状的相对位置），红点永不被裁；
  3. **槽位裁剪层**：`overflow: hidden` + 圆角，**只包内容**（`children`/`avatarSrc`），方形内容进去也是圆形。
     `objectFit: cover`、`draggable={false}`、`onImgError` 只属于 `avatarSrc` 默认图片分支，不作用于 `children`。内容层不得反向改变容器的尺寸、裁剪与交互属性。
- `size` 是几何参数：`ELEMENT_SIZE` 从模块常量改为由 `size` prop 派生，透传 `anchorToXY`/`clampToViewport`/`resolveDrop`/`resolveBubblePlacement`/`AnchorMask`/`AvatarBubble`；`EDGE_PADDING`/`SNAP_THRESHOLD` 保持常量，吸附半径如需随 size 缩放用内部纯函数派生（**默认 56 时数值与现状完全一致**，回归测试锁定）。
- `zIndex` 只改头像与气泡两处；`AnchorMask` 取 `zIndex - 1`。
- `defaultAnchor` 只在 `storageKey` 无持久化记录时生效（有记录用记录值）。
- `onAnchorChange` 在 `setAnchor` 提交处触发（落锚与 resize 夹紧两条路径），值变化才回调；**挂载时的持久化恢复不回调**。

## 4. a11y（缺失功能，直接补）

- 头像容器 `<div>` 增加：`role="button"`、`tabIndex={0}`、`aria-label={alt}`。
- `onKeyDown`：Enter / Space 触发 `onClick`（Space `preventDefault` 防滚动）。
- **焦点环（复审修订）**：内联样式写不了 `:focus-visible`，判断抽成可注入纯函数 `isFocusVisible(el)`：`try { return el.matches(":focus-visible") } catch { return true }`（不支持该选择器的环境回退为显示焦点环）。**实测 jsdom 30 + nwsapi 支持该选择器**：已 `focus()` 的元素上 `matches(":focus-visible")` 返回 `false`（不抛错、不计算 focus-visible 状态）——所以 jsdom 覆盖的是「false 不亮环」分支，「回退分支」用 stub `Element.prototype.matches` 抛错来覆盖；「键盘亮环 / 鼠标不亮环」jsdom 断不了，挪到 §8 visual-check 或手工验收。
- **气泡侧已具备** `role="status"/"dialog"`、`aria-live`、Esc 关闭、关闭按钮——本节只需把硬编码 `aria-label="关闭消息"` 换成 `closeLabel` prop。
- 拖拽不做键盘替代，记入 README「已知限制」。

## 5. SSR / 运行环境兼容

| 问题                                                                                                                                                                                                 | 修法                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useViewportSize` 初始化读 `window.innerWidth`（SSR 崩 / hydration mismatch）                                                                                                                        | **实施修订（2026-09-24）**：首帧统一初始化 `{width: 0, height: 0}`（保证 hydration 首帧与服务端完全一致，客户端初始化读 window 会让 hydration 首帧 ≠ 服务端 → mismatch），真实视口由**同构 `useLayoutEffect`** 在**浏览器首次绘制前**测出（与 anchor 恢复同一时序）。因此任何场景都**不会画出**「视口未知」的一帧：SSR 静态 HTML（无 effect）保持 `visibility: hidden` 兜底，纯 CSR / hydration 的**首帧绘制即可见**（审核意见 7 的实质满足，断言口径见 §7） |
| `useSyncExternalStore(subscribe, getState)` 缺 `getServerSnapshot`（**审核阻断项 4**：SSR `renderToString` 实测抛 `Missing getServerSnapshot`）                                                      | `useAvatarState` 改为 `useSyncExternalStore(subscribe, getState, getServerSnapshot)`，`getServerSnapshot` 返回冻结的默认状态 `{ message: null, queue: [], badgeVisible: false }`。**`avatarMessage.ts` 必须进 §9 文件清单**                                                                                                                                                                                                                                  |
| `useEdgeAnchor` 的 `useState` 初始化读 localStorage（hydration mismatch / SSR）                                                                                                                      | 首帧用 `defaultAnchor`（或右下默认），localStorage 读取移到 **同构 `useLayoutEffect`**（`typeof window !== 'undefined' ? useLayoutEffect : useEffect`，模块级判定），**在绘制前恢复持久化位置**，消除「先画右下角再跳走」的一帧跳动（审核意见 7）。恢复时用 ref 标记跳过 `onAnchorChange`                                                                                                                                                                    |
| `AnchorMask` 的 `import.meta.env.DEV` 模块级求值（**审核阻断项 4**：dist 产物 `import` 期即 `TypeError: Cannot read properties of undefined (reading 'DEV')`，只要 import 就炸，与是否用 mask 无关） | 改为 `import.meta.env?.DEV ?? false`；§7 增加「node 直接 import dist 产物」断言（现有 dist 中该处实测仍存在，改完必须重新 build 验证）                                                                                                                                                                                                                                                                                                                       |
| `AvatarBubble` 的气泡测量用裸 `useLayoutEffect`（**实施中新增，React 18 fixture 实测发现**）                                                                                                         | 三处同构 effect 统一抽到公共 `hooks/useIsoLayoutEffect.ts`（服务端退化 useEffect）。裸调用在 react@18.3 `renderToString` 下打 “Warning: useLayoutEffect does nothing on the server”；React 19 已移除该警告，工作区 react@19 的 SSR 测试测不到——真正守卫是 §7 的 React 18 fixture，`ssr.test.tsx` 也加了 console.error 断言（React 18 下即有牙齿）                                                                                                            |

## 6. API 收敛与多实例语义

- `src/index.ts` **移除** `AvatarBubble` 导出（组件保留，仅内部使用）。
- **移除 `DragPreview` 类型导出**（审核意见 11）：AnchorMask 不对外、公开 props 不引用它，属于死 API；`AnchorMaskMode`/`AnchorMaskOptions` 因被 `FloatingAvatarProps` 引用而保留。
- **新增导出类型**：`EdgeAnchor`、`XY`（来自 `useEdgeAnchor`，供 `defaultAnchor` / `onAnchorChange` 使用）。
- `FloatingAvatarProps`、`avatarMessage`/`avatarBadge` 及其类型、`useAvatarState` 维持导出（`useAvatarState` 保留：消费方可能订阅状态做联动）。
- **多实例语义（审核意见 9，消除文档自相矛盾）**：`storageKey` **只隔离头像位置**；消息与角标是模块级单例——同页两个 `FloatingAvatar` 会同时显示同一条气泡。**决策：维持单例，不把气泡收口到单例宿主**（一个页面一个助手是产品假设）；README 明确写出该边界，§3 的 `storageKey` 注释同步改口径。

## 7. 测试计划

| 项                        | 层             | 断言要点                                                                                                                                                                                                                     |
| ------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size` 几何透传           | jsdom + 纯函数 | 不同 size 下落锚 / 吸附 / 气泡定位用新尺寸；默认 56 与现状数值一致（回归）                                                                                                                                                   |
| `storageKey` 隔离         | 纯函数         | 两个 key 位置互不覆盖；脏数据回退默认                                                                                                                                                                                        |
| `defaultAnchor`           | 纯函数         | 无记录时用 defaultAnchor；有记录用记录值；越界夹紧                                                                                                                                                                           |
| `onAnchorChange`          | jsdom          | 落锚触发一次、值不变不触发、**首次持久化恢复不触发**                                                                                                                                                                         |
| 持久化恢复时序            | jsdom          | 恢复在绘制前完成（layout effect），无「右下角→持久位置」跳动路径                                                                                                                                                             |
| SSR 守卫                  | node 环境      | 无 `window`/`localStorage` 下渲染不抛错；**`renderToString` 覆盖 `useAvatarState`（getServerSnapshot）**                                                                                                                     |
| hydration/首帧            | node + jsdom   | **SSR（renderToString）输出 `visibility:hidden`**（视口未知兜底）；**CSR 挂载后（layout effect 已测视口）不残留 hidden**——首帧绘制发生在 layout effect 之后，故「视口未知」帧不可见（实施修订后口径，见 §5）                 |
| 键盘激活                  | jsdom          | tabIndex、Enter/Space 触发 onClick、Space preventDefault                                                                                                                                                                     |
| 焦点环                    | jsdom          | `isFocusVisible` 纯函数两分支：jsdom 默认行为覆盖 `:focus-visible → false` 不亮环；stub `matches` 抛错覆盖回退亮环。「键盘亮 / 鼠标不亮」jsdom 断不了 → §8 visual-check 或手工验收                                           |
| `import.meta.env` 缺省    | 纯函数         | env 未定义时 debug 默认关闭不崩                                                                                                                                                                                              |
| **dist 产物 Node import** | 命令           | `node -e "await import('./dist/index.mjs')"` 不抛错（覆盖模块级 env 求值，审核阻断项 4）                                                                                                                                     |
| 二选一约束                | 类型 + 运行时  | 联合类型编译期报错；运行时缺省兜底不崩                                                                                                                                                                                       |
| **槽位契约不变量**        | jsdom          | 传 `children` 时：容器仍持有 size / 圆角 / 角标 / `role="button"`+`tabIndex`+`aria-label`；**`children` 方形内容被槽位裁剪层裁成圆形**；**角标红点未被裁**（分层裁剪契约，§3/§14 护栏锁定）                                  |
| `onImgError`              | jsdom          | 图片 error 事件回调触发                                                                                                                                                                                                      |
| **React 18 运行时**       | 命令           | **复审修订：在 `/tmp` 建 tarball fixture**（安装 tarball + `react@18` + `react-dom@18` + `@types/react@18`，跑一次渲染/测试），**不在工作区临时改 devDeps**——后者要动 lockfile、易留脏状态（支撑 §2 peer 范围，审核意见 10） |
| **消费方 tsc**            | 命令           | 装 tarball 的 fixture 用 `moduleResolution: node16` 与 `bundler` 各跑一次 tsc，0 error（替代撤销的 types 条件，审核意见 5c）                                                                                                 |

原有测试全部保持通过；故意改样式的断言（如受 size 影响的）同步更新。

## 8. 校验方式（替换原 `npm pack --dry-run`）

发布前按序执行，**全部用 pnpm**（§2.1 理由）。**顺序是关键（复审修订）**：构建必须先于 dist import（否则测的是上一次构建的旧产物——仓库里 9-21 留下的旧 dist 正是证明）；tarball 输出到临时目录，避免 `.tgz 落进工作区让 §11 的 `pnpm publish`被`ERR_PNPM_GIT_UNCLEAN` 拒掉（pnpm 的 git 检查把**未跟踪文件**也算不干净）：

```bash
vp check                          # 格式 + lint + 类型
vp test                           # 全量测试
vp run -r build                   # 两个包都构建（顺带覆盖「移除 AvatarBubble 导出」这类靠消费方构建兜底的改动）
vp run visual-check               # 几何验收（需先起 dev server）
node -e "await import('./packages/react-float-avatar/dist/index.mjs')"  # 此时 dist 刚构建，测的是新产物
cd packages/react-float-avatar
pnpm pack --pack-destination /tmp/rfa-pack   # 触发 prepack → 再次构建；tarball 落临时目录，workspace 保持干净
tar -tzf /tmp/rfa-pack/react-float-avatar-0.1.0.tgz              # 必须含 dist/index.mjs + dist/index.d.mts
tar -xOf /tmp/rfa-pack/react-float-avatar-0.1.0.tgz package/package.json   # exports 已被 pnpm 改写为 ./dist/index.mjs；publishConfig 已被剥掉（只留 access）——若 publishConfig 原样在，说明不是 pnpm 打的包（§2.1 判据）
# 消费方 fixture：安装该 tarball，node16 + bundler 两种 resolution 各跑 tsc（§7）
```

双保险：仓库 `.gitignore` 增加 `*.tgz`（防止其他操作把 tarball 留在工作区）。**不用 `--no-git-checks` 绕过发布检查**——那是掩盖问题，正确做法是 §11 的「发布前保证 git status 干净」。

**实测补充（pnpm 12.4.1，2026-09-24）**：`pnpm pack` 会把 `prepack` 从 **tarball 的 `scripts`** 里剥掉（`--ignore-scripts` 对照证实是 pnpm 的打包行为，不是构建副作用）；`prepack` 本身仍会在 pack/publish 时从**工作区 manifest** 正常执行（输出可见 `prepack$ vp run build` → 构建产物落进 tarball）。published manifest 不含 `prepack` 是良性的（消费方不需要它），校验时不要误判为「prepack 没配」——判据是构建输出，不是 tarball scripts。

**关键认知：校验对象是 tarball 里的 manifest，不是仓库里的 package.json**——`publishConfig.exports` 覆盖问题只能靠 `tar -xOf` 查出。

## 9. 实施顺序

1. 包元数据 + LICENSE + README + `prepack` 脚本 + `.gitignore` 忽略 `*.tgz`（不碰实现）
2. props 扩展：`size` / `storageKey` / `alt` / `closeLabel` / `zIndex` + 几何透传改造
3. 头像逃生口（`avatarSrc`/`children` 联合 + `onImgError`）+ a11y 补齐（含焦点环）
4. SSR / hydration 守卫：viewport、anchor 同构 layout 恢复、`getServerSnapshot`、`import.meta.env?.DEV`
5. `defaultAnchor` / `onAnchorChange` + 类型导出收敛（移除 AvatarBubble、`DragPreview` 导出）
6. 全量验证：按 §8 清单依次执行

## 10. 涉及文件

```
packages/react-float-avatar/package.json        元数据 / peer 范围 / prepack（替换 prepublishOnly）
packages/react-float-avatar/LICENSE             新增
packages/react-float-avatar/README.md           新增（英文主 + 中文摘要 + 发布机制约束）
packages/react-float-avatar/src/index.ts        导出收敛（删 AvatarBubble/DragPreview）+ EdgeAnchor/XY
packages/react-float-avatar/src/components/FloatingAvatar.tsx   props / 几何透传 / a11y
packages/react-float-avatar/src/components/AvatarBubble.tsx     closeLabel / 首帧隐藏 / zIndex
packages/react-float-avatar/src/components/AnchorMask.tsx       env 兼容 / zIndex-1
packages/react-float-avatar/src/hooks/useEdgeAnchor.ts          同构 layout 恢复 / defaultAnchor / onAnchorChange
packages/react-float-avatar/src/hooks/useViewportSize.ts        SSR 守卫 + 同构 layout 测量
packages/react-float-avatar/src/hooks/avatarMessage.ts          useSyncExternalStore 补 getServerSnapshot（审核阻断项）
.gitignore                                增加 *.tgz（防 tarball 残留阻塞 publish）
focusVisible 工具（并入 FloatingAvatar 或独立小文件）  isFocusVisible 纯函数（可注入测试）
packages/react-float-avatar/src/hooks/useIsoLayoutEffect.ts  三处同构 layout effect 公共实现（实施中新增，React 18 fixture 发现）
对应 *.test.ts(x)                              新增断言（含 SSR / dist import / react@18 / 消费方 tsc）
```

## 11. 发布流程（新增章节）

1. 确认 §8 校验清单全部通过（tarball 在临时目录，工作区无 `.tgz` 残留）。
2. 改 `package.json` `version`（遵循 semver；本次 `0.1.0`）。
3. **提交版本改动，确认 `git status` 干净**（复审阻断项 4：pnpm 的 `ERR_PNPM_GIT_UNCLEAN` 把未跟踪文件也算不干净，未提交的改动或残留 tgz 都会卡住 publish；**不用 `--no-git-checks` 绕过**）。
4. **`pnpm publish`（必须 pnpm，见 §2.1；`publishConfig.access: public` 已配置）——发布是外部可见动作，需用户显式授权后才执行，AI 不得自行发布。**
5. 发布后打 git tag（`v0.1.0`）。
6. 记录 changelog（本次可先在 README「Changelog」小节或 GitHub Release，待公开仓库确定后固化）。

## 12. 已知限制（写入 README，本次不做）

- 拖拽无键盘替代（键盘仅可激活点击）
- 不支持受控锚点（`defaultAnchor` + `onAnchorChange` 覆盖）
- 消息/角标为模块级单例，同页多实例共享同一条气泡；`storageKey` 只隔离头像位置
- 默认文案为中文，非中文站需覆盖 `alt` / `closeLabel` / 消息级 `okText` / `cancelText`
- antd peer 范围 v6（v5 未实测）；React 18 支持范围以 §7 验证结果为准
- `prefers-reduced-motion` 目前只覆盖气泡动效，头像本身尚无动画（未来帧动画功能接入时统一，见 §14.3）

## 13. 审核未覆盖边界（实施完成后需补）

- ~~未验证 React 18 运行时行为~~ → **已验证（2026-09-24）**：/tmp/rfa-fixtures/react18 装 tarball，`@types/react@18` tsc 0 error + react@18.3.1 `renderToString` 通过（并据此修掉 useLayoutEffect SSR 警告，见 §5）
- ~~未验证 §5 改动后视觉是否跳动~~ → **已验证**：`vp run visual-check` 26/26；真机 Chrome 帧级采样（注入 rAF sampler 后 reload）115 个挂载帧全部在持久化位置、0 跳帧、首帧即 visible——恢复时序闭环
- 未真正发布 → §11 流程执行时逐项确认（发布需用户显式授权，AI 不得自行执行）

## 14. 未来帧动画 / codex 宠物兼容性约束（设计护栏，本次不实现）

> 规划：组件未来要支持「头像在特定时机以帧动画展示形象 / 互动」（类 codex 宠物）。**本次不实现任何动画功能**，但以下四条护栏必须在本次改造中成立，避免日后需要破坏性变更。

### 14.1 结构约束：头像槽位是唯一扩展点

- **容器层独占几何与交互**（§3 已落，复审修订为分层裁剪）：`size`、圆角、角标落点、拖拽、a11y 全在外层 div 且**容器不裁剪**；裁剪收在「槽位裁剪层」（`overflow: hidden` + 圆角，只包内容），Badge 红点在裁剪层之外。`children`/`avatarSrc` 只是槽位**内容**，帧动画形象作为内容接入时，几何、拖拽、角标、可聚焦性零改动继承，且天然被裁成圆形。
- **内容层不做形状绑定**：`objectFit: cover` / `draggable={false}` / `onImgError` 只属于 `avatarSrc` 图片分支。sprite sheet（背景图步进帧）、透明底角色都不适用 `cover`，因此**禁止把这些属性下沉到槽位容器或裁剪层**。
- **圆形是默认裁剪形态（产品特点），但裁剪实现收敛在「槽位裁剪层」一处**：未来角色需要非圆形轮廓（如带尾巴的像素形象）时以 additive prop（`shape?: "circle" | "none"` 之类）扩展，开关作用点即这一层，默认值不变。本次只需保证裁剪只写在一处、可被单一开关接管，不新增该 prop。
- **未来帧动画的两条接入路径都必须是加法**：
  1. 消费方自实现：用现成 `children` 槽位塞动画组件，零库改动即可跑通（本次改造后即成立）；
  2. 库内一等公民支持：以**新增 prop**（如状态驱动的帧渲染器）落地，不改 `avatarSrc`/`children` 现有签名与语义。

### 14.2 状态约束：触发源必须可订阅、store 必须可扩展

帧动画的触发时机大多已有对应状态，护栏是**不许堵死这些状态的对外通路**：

| 潜在触发源                | 现状                                                                                                                                                                                         | 护栏                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 消息到达 / 关闭、角标点亮 | 单例 store（`message`/`badgeVisible`）                                                                                                                                                       | 未来「动画状态/指令」（如 `avatarStatus`）**扩展同一个单例 store**，不另起第二套；`AvatarMessageState` 已对外导出，字段只做加法，`message`/`queue`/`badgeVisible` 的名字与语义冻结 |
| 拖拽中；悬停 / 聚焦       | 拖拽有 `dragging`（FloatingAvatar 内部 state）；**头像容器目前无悬停/聚焦状态**（悬停只体现在 cursor，焦点环是 §4 新增；`hovered` 在 **AvatarBubble** 侧、用于暂停气泡倒计时，不是头像状态） | 未来如需对外触发（如「拖拽时宠物被拎起」）走 additive 回调或订阅；**不把内部 state 结构当公共 API 承诺**，也不新造第二份拖拽状态                                                   |
| 空闲 / 定时互动           | 无                                                                                                                                                                                           | 属于未来功能自身，不预埋                                                                                                                                                           |

### 14.3 动效约束：与现有合成器原则一致

- 帧动画只允许合成器友好属性（`transform` / `opacity` / `background-position` 步进），**不得引起布局抖动**——与现有「拖拽用 transform、气泡用 scale/opacity」同一原则；头像容器尺寸由 `size` 契约固定，是这条约束的前提。
- 拖拽中头像动画是否暂停由未来功能决定，但实现**必须复用现有 `dragging` 状态**（气泡隐藏已有先例），不新造。
- `prefers-reduced-motion` 保持单一判断入口（当前内联在 AvatarBubble）；帧动画接入时走同一判断。本次不做抽取重构，只在 README 已知限制里注明「reduced-motion 目前只覆盖气泡动效」。

### 14.4 本次范围（明确不做）

- ❌ 帧动画引擎、sprite 解析、状态驱动生成器
- ❌ `avatarStatus` / `shape` 等未来 prop（只保证落点是 additive，不预埋空接口）
- ❌ 抽取 reduced-motion 公共 hook（记录为未来顺手项）
- ✅ 唯一新增工作量：§7 的「槽位契约不变量」测试 + README「Extension points」说明——锁住 14.1 的结构，其余护栏都是「不做什么」
