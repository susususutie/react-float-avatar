/**
 * AnchorMask — 拖拽期的锚定可视化遮罩
 *
 * 「边锚定 + 四角吸附」的规则本身是隐式的，容易被误判成拖动定位不准，这一层负责把它画出来：
 *   - 虚线圆   四角吸附范围（半径 = threshold，圆心是角落目标点，元素中心落在圆内即命中）
 *   - 虚线中线 锚定边翻面位置：元素中心越过视口中线后 left / right（top / bottom）互换
 *   - 边缘高亮 + 标尺  待定锚定边与它到元素的距离（offset）
 *   - 幽灵圈   松手后元素真正会落到的位置，吸附命中时跳到角落，并用引线连回元素
 *   - 调试面板 视口 / 指针增量 / 落点 / 锚点（默认仅 dev 环境打开）
 *
 * 约束：这里只负责画，所有几何都取自 useEdgeAnchor / snapToCorner / resolveDrop 的同一套纯函数，
 * 不要再写第二套判断，否则遮罩会与真实落点分歧。
 *
 * 挂载与层级：由 mode + dragging 决定是否渲染（"drag" 模式松手即卸载）；整层 pointer-events: none、
 * z-index 低于头像，因此不会抢走头像的命中区域。根节点带 data-anchor-mask 属性，便于在 devtools
 * 或自动化里定位这一层。
 */

import { theme } from "antd";
import type { CSSProperties } from "react";
import { anchorToXY, isSameAnchor } from "../hooks/useEdgeAnchor";
import type { EdgeAnchor, XY } from "../hooks/useEdgeAnchor";
import { cornerTargets } from "../hooks/snapToCorner";
import type { ViewportSize } from "../hooks/useViewportSize";

export type AnchorMaskMode = "off" | "drag" | "always";

export interface AnchorMaskOptions {
  /** 四角吸附范围，以及命中时的高亮 */
  snapZone?: boolean;
  /** 待定锚定边高亮 + offset 标尺 */
  anchorEdges?: boolean;
  /** 锚定边翻面的中线 */
  flipLine?: boolean;
  /** 松手落点预览（幽灵圈） */
  releasePreview?: boolean;
  /** 调试面板，默认仅在 dev 环境打开 */
  debug?: boolean;
}

const DEFAULT_MASK_OPTIONS: Required<AnchorMaskOptions> = {
  snapZone: true,
  anchorEdges: true,
  flipLine: true,
  releasePreview: true,
  debug: import.meta.env.DEV,
};

/** 拖拽中的落点预览 */
export interface DragPreview {
  /** 元素当前视觉位置（跟随指针） */
  current: XY;
  /** 松手后元素落到的位置（吸附命中时与 current 不同） */
  landing: XY;
  /** 松手后将采用的锚点 */
  anchor: EdgeAnchor;
  snapped: boolean;
  /** 指针相对按下点的增量 */
  delta: { x: number; y: number };
}

interface AnchorMaskProps {
  /** 显示模式：off 不渲染、drag 仅拖拽中、always 常驻 */
  mode: AnchorMaskMode;
  /** 是否正在拖拽，决定 drag 模式下是否可见 */
  dragging: boolean;
  /** 当前视口尺寸，用于绘制吸附范围与翻面中线 */
  viewport: ViewportSize;
  /** 已提交的锚点，非拖拽时展示它 */
  anchor: EdgeAnchor;
  /** 拖拽中的落点预览，非拖拽时为 null */
  preview: DragPreview | null;
  /** 头像边长，用于绘制幽灵圈与标尺端点 */
  elementSize: number;
  /** 吸附间距，同时也是默认锚点 offset */
  padding: number;
  /** 吸附触发半径 */
  threshold: number;
  /** snapToCorner 关闭时不画吸附范围，避免画出一个不会生效的规则 */
  snapEnabled: boolean;
  /** 细粒度开关，省略的项取默认值 */
  options?: AnchorMaskOptions;
  /** 根节点类名 */
  className?: string;
  /** 根节点内联样式，不要覆盖 pointerEvents */
  style?: CSSProperties;
}

const LABEL_FONT_SIZE = 11;

function anchorText(anchor: EdgeAnchor): string {
  return `${anchor.horizontal.edge} ${anchor.horizontal.offset} / ${anchor.vertical.edge} ${anchor.vertical.offset}`;
}

function round(value: number): number {
  return Math.round(value);
}

export default function AnchorMask({
  mode,
  dragging,
  viewport,
  anchor,
  preview,
  elementSize,
  padding,
  threshold,
  snapEnabled,
  options: optionOverrides,
  className,
  style,
}: AnchorMaskProps) {
  const { token } = theme.useToken();
  const options: Required<AnchorMaskOptions> = { ...DEFAULT_MASK_OPTIONS, ...optionOverrides };

  const visible = mode === "always" || (mode === "drag" && dragging);
  if (!visible) return null;

  const { width: viewportWidth, height: viewportHeight } = viewport;
  // 头像渲染成圆形，半径用于把「元素左上角」坐标换算成圆心坐标
  const radius = elementSize / 2;
  // 待定锚点：拖拽中用松手后的锚点，其余情况用已提交的锚点
  const activeAnchor = preview?.anchor ?? anchor;
  const activePosition = anchorToXY(
    activeAnchor,
    viewportWidth,
    viewportHeight,
    elementSize,
    elementSize,
  );
  const cornerHit = (targetAnchor: EdgeAnchor) => isSameAnchor(targetAnchor, activeAnchor);

  const zoneStroke = token.colorPrimaryBorder;
  const accent = token.colorPrimary;
  const muted = token.colorSplit;

  const horizontalRuler =
    activeAnchor.horizontal.edge === "right"
      ? { from: activePosition.left + elementSize, to: viewportWidth }
      : { from: 0, to: activePosition.left };
  const verticalRuler =
    activeAnchor.vertical.edge === "bottom"
      ? { from: activePosition.top + elementSize, to: viewportHeight }
      : { from: 0, to: activePosition.top };

  const debugLines: string[] = [
    `viewport   ${viewportWidth} × ${viewportHeight}`,
    `element    (${round(activePosition.left)}, ${round(activePosition.top)})`,
    `anchor     ${anchorText(activeAnchor)}`,
    `committed  ${anchorText(anchor)}`,
    `snap       ${snapEnabled ? `r=${threshold}, padding=${padding}` : "已关闭"}`,
  ];
  if (preview) {
    // 拖拽期才有的两行插在 anchor 之前，保持面板顺序稳定
    debugLines.splice(
      3,
      0,
      `pointer Δ  (${round(preview.delta.x)}, ${round(preview.delta.y)})`,
      `landing    (${round(preview.landing.left)}, ${round(preview.landing.top)})${
        preview.snapped ? "  ← 吸附命中" : ""
      }`,
    );
  }

  return (
    <div
      className={className}
      aria-hidden="true"
      data-anchor-mask=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: "none",
        overflow: "hidden",
        ...style,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
        style={{ position: "absolute", inset: 0 }}
      >
        {options.flipLine && (
          <g stroke={muted} strokeWidth={1} strokeDasharray="2 10">
            <line x1={viewportWidth / 2} y1={0} x2={viewportWidth / 2} y2={viewportHeight} />
            <line x1={0} y1={viewportHeight / 2} x2={viewportWidth} y2={viewportHeight / 2} />
          </g>
        )}

        {snapEnabled &&
          options.snapZone &&
          cornerTargets({
            viewportWidth,
            viewportHeight,
            elementWidth: elementSize,
            elementHeight: elementSize,
            padding,
          }).map((target) => {
            const hit = cornerHit(target.anchor);
            // 圆心取角落目标点 + 半径：与「元素左上角距目标点 ≤ threshold」等价，
            // 这样圆和幽灵圈（都按元素中心绘制）在视觉上是一套坐标。
            const centerX = target.position.left + radius;
            const centerY = target.position.top + radius;
            return (
              <g key={`${target.anchor.horizontal.edge}-${target.anchor.vertical.edge}`}>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={threshold}
                  fill={hit ? token.colorPrimaryBg : "none"}
                  fillOpacity={0.6}
                  stroke={hit ? accent : zoneStroke}
                  strokeWidth={hit ? 2 : 1}
                  strokeDasharray="6 8"
                />
                <circle cx={centerX} cy={centerY} r={2.5} fill={zoneStroke} />
              </g>
            );
          })}

        {options.anchorEdges && (
          <g>
            <rect
              x={activeAnchor.horizontal.edge === "right" ? viewportWidth - 3 : 0}
              y={0}
              width={3}
              height={viewportHeight}
              fill={accent}
              opacity={0.45}
            />
            <rect
              x={0}
              y={activeAnchor.vertical.edge === "bottom" ? viewportHeight - 3 : 0}
              width={viewportWidth}
              height={3}
              fill={accent}
              opacity={0.45}
            />

            <g stroke={accent} strokeWidth={1}>
              <line
                x1={horizontalRuler.from}
                y1={activePosition.top + radius}
                x2={horizontalRuler.to}
                y2={activePosition.top + radius}
              />
              <line
                x1={horizontalRuler.from}
                y1={activePosition.top + radius - 4}
                x2={horizontalRuler.from}
                y2={activePosition.top + radius + 4}
              />
              <line
                x1={horizontalRuler.to}
                y1={activePosition.top + radius - 4}
                x2={horizontalRuler.to}
                y2={activePosition.top + radius + 4}
              />
              <line
                x1={activePosition.left + radius}
                y1={verticalRuler.from}
                x2={activePosition.left + radius}
                y2={verticalRuler.to}
              />
              <line
                x1={activePosition.left + radius - 4}
                y1={verticalRuler.from}
                x2={activePosition.left + radius + 4}
                y2={verticalRuler.from}
              />
              <line
                x1={activePosition.left + radius - 4}
                y1={verticalRuler.to}
                x2={activePosition.left + radius + 4}
                y2={verticalRuler.to}
              />
            </g>

            <g
              fill={accent}
              fontSize={LABEL_FONT_SIZE}
              fontFamily={token.fontFamily}
              stroke={token.colorBgElevated}
              strokeWidth={3}
              style={{ paintOrder: "stroke" }}
            >
              <text
                x={(horizontalRuler.from + horizontalRuler.to) / 2}
                y={activePosition.top + radius - 6}
                textAnchor="middle"
              >
                {round(activeAnchor.horizontal.offset)}px
              </text>
              <text
                x={activePosition.left + radius + 8}
                y={(verticalRuler.from + verticalRuler.to) / 2}
                dominantBaseline="middle"
              >
                {round(activeAnchor.vertical.offset)}px
              </text>
            </g>
          </g>
        )}

        {options.releasePreview && preview && (
          <g>
            {preview.snapped && (
              <line
                x1={preview.current.left + radius}
                y1={preview.current.top + radius}
                x2={preview.landing.left + radius}
                y2={preview.landing.top + radius}
                stroke={muted}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}
            <circle
              cx={preview.landing.left + radius}
              cy={preview.landing.top + radius}
              r={radius}
              fill={preview.snapped ? token.colorPrimaryBg : "none"}
              fillOpacity={0.5}
              stroke={accent}
              strokeWidth={2}
              strokeDasharray={preview.snapped ? "6 4" : "4 6"}
            />
          </g>
        )}
      </svg>

      {options.debug && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            maxWidth: "70vw",
            padding: "8px 10px",
            borderRadius: 6,
            border: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgElevated,
            color: token.colorText,
            boxShadow: token.boxShadowTertiary,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: LABEL_FONT_SIZE,
            lineHeight: 1.6,
            whiteSpace: "pre",
          }}
        >
          {debugLines.join("\n")}
        </div>
      )}
    </div>
  );
}
