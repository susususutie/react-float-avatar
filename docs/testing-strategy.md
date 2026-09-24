# Vite+ 项目测试方案（通用指导）

> 适用范围：使用 Vite+（`vp test`，底层为 Vitest）的 React/Web 项目。
> 划分原则：**按断言依赖什么划分测试边界，而不是按测试重要性**。

## 一、三层边界定义

| 层                | 环境                                       | 允许的断言                                                                             | 明确禁止                                          | 目标耗时                  |
| ----------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------- |
| **L0 纯逻辑**     | `node`（默认，零 DOM）                     | 输入→输出、状态机、算法、数据转换                                                      | 出现 `window` / `document` / 任何 React 渲染      | 全层 < 5s                 |
| **L1 组件/DOM**   | `happy-dom` 或 `jsdom`（见第三节决策闸门） | DOM 结构、**内联样式**、属性、事件接线后的 state 变化、hook 生命周期                   | 计算样式、像素、真实几何、依赖真实布局的断言      | 全层 < 15s                |
| **L2 真实浏览器** | Vitest Browser Mode（playwright provider） | `getBoundingClientRect` 几何、`getComputedStyle`、真实输入（拖拽/焦点/键盘）、动效终态 | 业务多页流程（属于 e2e / Playwright Test 的职责） | 独立 CI job，不设秒级 SLA |

**入层规则（一句话）**：断言不需要布局引擎 → L0；需要 DOM 但不需要布局引擎 → L1；需要布局引擎 / 真实输入 → L2。

### 各层职责说明

- **L0**：速度的真正来源。纯逻辑必须与 DOM 层彻底分离，这一层切得越干净，CI 快环越快。
- **L1**：验证"数据/事件 → DOM 结构与行为"的绑定关系。DOM 模拟环境**没有布局引擎**（`offsetWidth` / `getBoundingClientRect` 恒为 0）、**没有绘制**、事件是合成的——因此这一层从根上就不该断言渲染细节。缺失的浏览器 API（`matchMedia` / `ResizeObserver` / `Element.animate` / `PointerEvent`）用统一的 setup 文件补最小替身，布局尺寸用显式 stub 写入。
- **L2**：唯一有渲染保真的层。jsdom / happy-dom 在这一层都是 0 分，没有谁比谁强；要真实保真只有真实浏览器一条路。

## 二、文件约定 + 配置模板（用 projects 路由，不用逐文件 docblock）

逐文件 `// @vitest-environment xxx` 标注在文件数增多后会漏标。用 `test.projects` 按路径路由：

```ts
// vite.config.ts
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      // L0：纯逻辑，node 环境
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.dom.test.ts", "src/**/*.browser.test.tsx"],
        },
      },
      // L1：组件测试，DOM 环境（happy-dom / jsdom 按闸门结果二选一）
      {
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/**/*.dom.test.tsx"],
          setupFiles: ["./src/test/domEnvironment.ts"],
        },
      },
      // L2：浏览器测试
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: { reporter: ["text", "html"] }, // 覆盖率只统计 L0 + L1
  },
});
```

**命名约定（落地即规范）**：

- `src/**/*.test.ts` → L0（`src/**/*.dom.test.ts` 显式升 L1，除外）
- `src/**/*.dom.test.tsx` → L1
- `src/**/*.browser.test.tsx` → L2

**结构约束不靠自觉**：L0 文件 import React / antd 应由 lint 规则直接拦住（`no-restricted-imports` 按目录配置），这是保证 L0 速度的机制。

> Vite+ 约定：测试配置写在 `vite.config.ts` 的 `test` 块，不使用单独的 `vitest.config.ts`。

## 三、happy-dom vs jsdom：数据驱动的决策闸门

**不预设答案，项目启动时跑一次一次性验证**：

```bash
vp test --environment=jsdom      # 全量 L1，记录耗时与结果
vp test --environment=happy-dom  # 同上
```

**采纳 happy-dom 的充要条件（三条全满足）**：

1. 全量绿，无跳过、无兼容性 workaround（第三方组件库内部 API 报错算不满足）
2. L1 耗时比 jsdom 快 ≥ 30%
3. 连跑 3 次无偶发失败

**任一不满足 → 选 jsdom，并把原因记入项目 `AGENTS.md`**（例如"某组件库依赖 jsdom 的 `getComputedStyle` 行为"），避免重复踩坑。

**复评触发条件（满足任一即重跑闸门）**：

- L1 用例数增长 10 倍，或 L1 CI 耗时超过 15s
- DOM 相关依赖（组件库 / React）大版本升级
- CI 因 DOM 层超时 / 变慢成为瓶颈

这样"选哪个"永远有客观答案，且与主观偏好脱钩：**规模小时闸门自然偏向 jsdom（兼容性保险），规模大时数据自然偏向 happy-dom（速度）**，规则本身稳定。

### 背景事实（供决策时参考）

- Vitest 的默认环境是 `node`；`jsdom` / `happy-dom` 都不是内置实现，而是**可选 peer 依赖**——用哪个环境就必须装哪个包。
- jsdom：规范覆盖最全、历史最久（Jest 默认），兼容性保险；较慢。
- happy-dom：聚焦组件测试常用 API、快 5~10 倍；覆盖较薄，边角行为（表单提交、焦点、URL/cookie、事件细节）可能与 jsdom 有差异。
- **能力差异暴露与否不由"测试意图"决定，而由依赖库替你决定**（组件库内部可能悄悄调用某个 API），所以必须靠实际跑闸门验证，不能靠推理排除。

## 四、CI 结构：两个 job，快环先行

```yaml
test-fast: # 必须过，阻塞合并
  script:
    - vp check # 格式 + lint + 类型
    - vp test # L0 + L1：vp test --project=unit --project=dom

test-browser: # L2，独立 job
  script:
    - npx playwright install --with-deps chromium # 用 lockfile 固定版本
    - vp test --project=browser
```

- **快环目标**：`vp check` + L0 + L1 全部 < 60s，这是开发反馈的主通道。
- **L2 独立 job**：不阻塞本地开发循环；稳定后设为 required check。
- **flakiness 纪律**：L2 禁止 sleep 等待，只允许 `await expect(...).toPass()` / locator 等待；出现偶发失败先隔离 quarantine，不许带病合并。
- 浏览器安装注意：CI 中用项目 lockfile 固定的 Playwright 版本安装浏览器，避免 `vpx playwright install` 拉到 latest 导致版本漂移（Vite+ 的 Docker 文档有专门说明）。

## 五、L2 的演进路径（承接手写验收脚本）

手写的几何/像素验收脚本（启动服务 → 量取 → 比对预期表）是 L2 的**过渡形态**。迁移触发条件：

- 断言数 > 30 项，或脚本 > 200 行、开始需要维护"预期表"这类第二数据源 → 迁到 Vitest Browser Mode（断言即代码，预期值就地可读，不再有双份数据）
- 需要多页业务流程 / 多浏览器矩阵 → 已越界，用 Playwright Test 单独做 e2e，不要在 Browser Mode 里硬写

### Browser Mode 供应器选型

| Provider                      | 状态                             | 适用                                                            |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `@vitest/browser-preview`     | Vite+ 内置、零安装               | 真浏览器渲染，但不能做真实鼠标/键盘驱动；适合"渲染出来断言几何" |
| `@vitest/browser-playwright`  | 需自行安装（+ playwright peer）  | **主流推荐**：真浏览器 + 真实输入驱动，能力最全                 |
| `@vitest/browser-webdriverio` | 需自行安装（+ webdriverio peer） | 需要跨多浏览器矩阵时                                            |

Vite+ 内置基础运行时 `@vitest/browser` 与 preview provider；Playwright / WebdriverIO provider 为可选，导入路径用 `vite-plus/test/browser-playwright`。

## 六、启动新项目的 Checklist

1. 三层目录 / 命名约定写进 `AGENTS.md`，lint 规则拦住 L0 引 React。
2. `vite.config.ts` 配好 `test.projects`（L0 / L1 / L2 各一个）。
3. 跑第三节闸门，选定 happy-dom 或 jsdom，**结果与理由记入 `AGENTS.md`**。
4. 配 CI 两个 job（fast / browser），fast 环挂 required。
5. **每季度或依赖大版本升级时复评闸门。**

## 七、常见误区

- ❌ 按"重要程度"分层 → 会切错：断言了真实几何的"基础"测试放 DOM 模拟层就是假绿；只断内联样式的"细节"测试上浏览器就是浪费。
- ❌ 为了速度把 L1 换 happy-dom 而不跑闸门 → 兼容风险由依赖库决定，不是由测试意图决定。
- ❌ 指望换 DOM 实现解决速度问题 → 速度大头在 L0，先把纯逻辑切干净；DOM 层换实现是套件涨一个数量级后才值得做的优化。
- ❌ 把真实浏览器层当"更全的 L1"全量搬入 → 浏览器层成本在基础设施与稳定性，应断言少而关键（几何规格、关键交互路径）、独立 job、后出结果。
