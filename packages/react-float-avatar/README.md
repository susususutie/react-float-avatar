# react-float-avatar

A draggable floating AI assistant avatar for React — **edge anchoring + four-corner snapping + message bubble + red-dot badge**, styled with [antd](https://ant.design) design tokens.

- Drag anywhere; release snaps to the nearest corner with a persistent edge anchor
- Position survives reloads (localStorage) and window resizes (clamped to viewport)
- Message bubbles (`avatarMessage`) and badge dots (`avatarBadge`) driven by a tiny singleton store — no extra state wiring in your pages
- Built-in accessibility: `role="button"`, keyboard activation (Enter / Space), focus ring
- SSR-safe: renders on the server without `window`, hydrates without mismatches
- Escape hatch for custom avatars: pass `children` (any node — images, videos, animated characters)

```bash
pnpm add react-float-avatar
# peer deps: react ^18 || ^19, antd ^6
```

## Quick start

```tsx
import { FloatingAvatar, avatarMessage, avatarBadge } from "react-float-avatar";
import avatarImg from "./avatar.png";

export default function App() {
  return (
    <FloatingAvatar avatarSrc={avatarImg} onClick={() => avatarMessage.show("How can I help?")} />
  );
}
```

Show a confirm with actions (antd `Modal.confirm` semantics):

```ts
const confirm = avatarMessage.confirm({
  title: "Build finished",
  content: "All checks passed.",
  okText: "View log",
  onOk: async () => openLog(), // pending Promise → OK loading; reject keeps it open
  cancelText: "Dismiss",
  onCancel: () => {},
});

confirm.update({ content: "Opening…" }); // controller returned by show / confirm
confirm.destroy(); // programmatic close; X / Esc take the cancel path
avatarBadge.show(); // red dot is fully manual
avatarBadge.hide();
```

## Props

| Prop                          | Type                                            | Default                     | Description                                                                                                           |
| ----------------------------- | ----------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `avatarSrc`                   | `string`                                        | —                           | Image source. Mutually exclusive with `children` (enforced by types; if neither is given an empty circle renders).    |
| `children`                    | `ReactNode`                                     | —                           | Escape hatch for custom avatars (animated characters, video, …). See **Extension points**.                            |
| `size`                        | `number`                                        | `56`                        | Avatar diameter in px; threaded through anchor, snapping, mask and bubble geometry.                                   |
| `storageKey`                  | `string`                                        | `"ai-assistant-position"`   | localStorage key for position persistence. **Isolates position only** — see design assumptions.                       |
| `alt`                         | `string`                                        | `"AI 助手"`                 | Accessible name: image `alt` + container `aria-label`.                                                                |
| `closeLabel`                  | `string`                                        | `"关闭消息"`                | Accessible name of the bubble close button (defaults to Chinese on purpose — override for other locales).             |
| `zIndex`                      | `number`                                        | `9999`                      | Avatar & bubble layer; the debug mask renders at `zIndex - 1`.                                                        |
| `defaultAnchor`               | `EdgeAnchor`                                    | right/bottom `24`           | First-visit position (used when no persisted record exists); takes effect on mount only.                              |
| `onAnchorChange`              | `(anchor: EdgeAnchor) => void`                  | —                           | Fires after a drop or viewport clamp when the value actually changes. **Not** fired by the initial persisted restore. |
| `onImgError`                  | `(e: SyntheticEvent<HTMLImageElement>) => void` | —                           | Image load failure (belongs to the `avatarSrc` branch only).                                                          |
| `onClick`                     | `() => void`                                    | —                           | Fired on release when the pointer moved less than 5px, or on Enter / Space.                                           |
| `snapToCorner`                | `boolean`                                       | `true`                      | Snap to the nearest of the four corners on release.                                                                   |
| `mask`                        | `"off" \| "drag" \| "always"`                   | `"off"`                     | Debug overlay for the anchoring rules (snap zones, anchor edges, drop preview).                                       |
| `maskOptions`                 | `AnchorMaskOptions`                             | all on, `debug` in dev only | Fine-grained mask switches.                                                                                           |
| `maskClassName` / `maskStyle` | `string` / `CSSProperties`                      | —                           | Mask styling escape hatch. Don't override `pointerEvents` — it would block avatar hit-testing.                        |

Exported types: `FloatingAvatarProps`, `EdgeAnchor`, `XY`, `AnchorMaskMode`, `AnchorMaskOptions`, plus the message/badge types below.

## Message & badge API

```ts
import { avatarMessage, avatarBadge, useAvatarState } from "react-float-avatar";

const msg = avatarMessage.show("plain text");       // simple message (string)
const confirm = avatarMessage.confirm({              // OK/Cancel always rendered
  key?, title?, content, avatar?,                    // content required (use show("text") for one-liners)
  okText?, okDanger?, onOk?, cancelText?, onCancel?, // async / Promise-returning actions supported
  footer?,                                           // full custom override
  duration?, replaceable?, hiddenTimer?, hiddenMessage?, onClose?,
});
msg.update("patch");                                 // controller from show / confirm (string patch OK)
msg.destroy();                                       // programmatic close
avatarMessage.destroy(id);                           // id-based, for cross-module use
avatarMessage.destroyAll();
avatarBadge.show(); avatarBadge.hide(); avatarBadge.getState();
const { message, queue, badgeVisible } = useAvatarState(); // subscribe if you need UI coupling
```

Behavior worth knowing (all tested): later messages replace the current one unless `replaceable: false` (then they queue, limit 3); dropped messages never call `onClose` (they were never shown); `duration` defaults to `0` (never auto-close); `onOk` / `onCancel` may return a Promise — the button shows loading only while it is pending, resolve closes (`ok` / `cancel`), reject keeps the bubble open; X / Esc call `onCancel` and close as `cancel`. The badge never toggles by itself — wire it in your `onClose` / button callbacks.

## Relationship with antd

- `antd` is a **peer dependency** (`^6.0.0`); it is not bundled.
- Bubble and focus-ring visuals are read from `theme.useToken()` (`colorBgElevated`, `colorPrimary`, `borderRadiusLG`, …), so your `ConfigProvider` theme (including `darkAlgorithm`) applies automatically. No hard-coded colors.
- Button / Modal semantics inside the bubble mirror antd Modal: `okText`/`cancelText`/`footer`, async `onOk`/`onCancel` with loading, and a `{ update, destroy }` controller from `avatarMessage.show` / `avatarMessage.confirm`.

## Design assumptions (intentional, not gaps)

1. **One assistant per page.** Messages and badge live in a module-level singleton: two `<FloatingAvatar>`s on the same page show the _same_ bubble and dot. `storageKey` isolates **position only**.
2. **Anchor is not a controlled value.** No `anchor` prop + `onChange` loop; use `defaultAnchor` + `onAnchorChange` (an effect loop on a floating overlay buys nothing).
3. **Feel-defining constants stay hardcoded:** edge padding `24`, snap radius `80`, click threshold `5`, circular avatar, badge offset `[-4, 4]`. These are product signature, not configuration.
4. **Defaults are Chinese** (`alt`, `closeLabel`); override the props for other locales — no i18n layer ships in the library.

## Extension points

- **The avatar slot is the formal extension point.** The container owns geometry / drag / badge / a11y and does _not_ clip; an inner slot layer (`overflow: hidden` + circle, marked `data-avatar-slot`) wraps only the content; the badge dot sits outside the clip layer. `objectFit: cover` and `draggable={false}` belong to the `avatarSrc` image branch only. Anything animated — sprite sheets, Lottie, video, a future frame-animated "pet" — goes in `children` and inherits geometry, dragging, badge and focus behavior for free.
- **The message store is extensible by addition.** `AvatarMessageState` is public; future fields (e.g. an avatar status for animation triggers) will be added to the same singleton — `message` / `queue` / `badgeVisible` names and semantics are frozen.

## SSR / hydration

- Viewport starts at `{0,0}` and is measured in a layout effect before first paint; anchors are restored from localStorage in a layout effect — no flash of the default corner, no hydration mismatch.
- Server-rendered markup keeps avatar and bubble `visibility: hidden` until the viewport is known (safe for no-JS renders).
- `useAvatarState` ships a `getServerSnapshot`; the server always renders an empty store (messages never leak across requests).

## Known limitations

- No keyboard _dragging_ (keyboard can activate the click only).
- No controlled anchor (see `defaultAnchor` / `onAnchorChange`).
- Message/badge are a singleton: multiple avatars on one page share one bubble; `storageKey` isolates position only.
- Default copy is Chinese — override `alt` / `closeLabel` / message-level `okText` / `cancelText`.
- antd peer range is v6 (v5 untested); React support is `^18.0.0 || ^19.0.0` (verified against React 18 at release time).
- `prefers-reduced-motion` currently covers bubble animations only.

## Publishing (maintainers)

**Releases are tag-driven:** pushing a `v*` tag runs `.github/workflows/publish.yml`, which verifies the tag against `package.json`, runs `vp check` / `vp test` / `vp run -r build`, packs, and publishes.

The split is deliberate — **pack with pnpm, upload with npm**:

- **Pack with pnpm** (`vp pm pack`): npm does not apply `publishConfig.exports`, so an npm-packed tarball would ship `exports: "./src/index.ts"` with only `dist` in `files` — a broken package. Verification lives in inspecting the tarball's `package.json` (`exports` must point at `./dist/index.mjs`).
- **Upload with `npm publish <tarball>`**: npm refuses to run inside this repo (`devEngines` requires pnpm), so the workflow publishes the pnpm-packed tarball from outside the checkout. npm also provides OIDC **trusted publishing** (no long-lived token) with **provenance attestations generated automatically** — no `--provenance` flag needed.

One-time setup on npmjs.com → package Settings → Trusted publishing: GitHub Actions, owner `susususutie`, repo `react-float-avatar`, workflow filename `publish.yml`, and **allow `npm publish`** (configs created after Sep 2026 default to stage-only). The config must complete its first publish within 2 days or it expires.

To release: bump `version` in `package.json`, commit, tag `v<version>`, push the tag. The workflow fails if the tag and `package.json` version disagree.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

## 中文摘要

可拖拽的浮动 AI 头像（React 18/19 + antd 6 peer）：**边缘锚定 + 四角吸附 + 消息气泡 + 红点角标**。

- **安装**：`pnpm add react-float-avatar`
- **用法**：`<FloatingAvatar avatarSrc={图片} onClick={…} />`；消息走 `avatarMessage.show/update/close`，红点走 `avatarBadge.show/hide`（组件不自动联动，写在回调里）
- **props**：`size` / `storageKey` / `alt` / `closeLabel` / `zIndex` / `defaultAnchor` / `onAnchorChange` / `onImgError` / `avatarSrc`⇄`children` 二选一 / `mask*`，全表见上
- **设计假设**（刻意如此，不是缺口）：一个页面一个助手——消息与角标是模块级单例，`storageKey` 只隔离位置；锚点非受控；手感常量（24 / 80 / 5、圆形、角标偏移）写死；默认文案中文，`alt`/`closeLabel` 覆盖即可，不做 i18n
- **扩展点**：`children` 槽位是自定义形象（含未来帧动画形象）的正式接口——容器管几何/拖拽/角标/可聚焦且不裁剪，裁剪只在槽位层，红点永不被裁；单例 store 只做字段加法
- **SSR**：服务端可渲染无 `window` 不崩；视口与持久化位置都在绘制前的 layout effect 里确定，无 hydration mismatch、无「先右下角再跳走」
- **已知限制**：拖拽无键盘替代、无受控锚点、多实例共享气泡、antd 仅 v6 实测、reduced-motion 只覆盖气泡
- **发布**：打 `v*` tag 触发 GitHub Actions 自动发布——pnpm 打包（npm 不应用 `publishConfig.exports`，会打出坏包）+ npm 上传（OIDC trusted publishing，免 token，自动生成 provenance）
- **License**：Apache-2.0
