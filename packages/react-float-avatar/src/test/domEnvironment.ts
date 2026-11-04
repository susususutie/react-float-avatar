/**
 * UI 测试的 jsdom 补齐
 *
 * jsdom 缺三样东西，加上它不做真实布局：
 *   1. `matchMedia` / `ResizeObserver` / `Element.animate` / `PointerEvent` 未实现 → 这里给最小替身
 *   2. 布局尺寸（offsetWidth、clientHeight、scrollHeight、getBoundingClientRect）全是 0
 *      → 用 `stubLayout()` 写死，模拟"真实渲染出来的尺寸"
 *   3. `ResizeObserver` 的回调不会自己触发 → 用 `triggerResize()` 手动触发，模拟"布局变化后重新测量"
 *
 * 这样组件测试就能锁住"渲染规格"（内边距、字号、定位值、动效参数），
 * 而不依赖真实浏览器；像素级验收另见 AGENTS.md 的浏览器验收步骤。
 */

type ResizeCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

const observers = new Set<ResizeObserverStub>();
const animationCalls: {
  keyframes: Keyframe[];
  options?: KeyframeAnimationOptions;
  animation: { canceled: boolean };
}[] = [];

class ResizeObserverStub {
  readonly callback: ResizeCallback;

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    observers.add(this);
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {
    observers.delete(this);
  }
}

class AnimationStub {
  finished = Promise.resolve();
  canceled = false;

  cancel(): void {
    this.canceled = true;
  }
}

class PointerEventStub extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}

export function installDomShims(): void {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  if (typeof window === "undefined") return;

  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub, PointerEvent: PointerEventStub });

  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: (
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) => {
      const animation = new AnimationStub();
      animationCalls.push({
        keyframes: (keyframes ?? []) as Keyframe[],
        options: typeof options === "object" ? options : undefined,
        animation,
      });
      return animation as unknown as Animation;
    },
  });
}

/** 手动触发一次 ResizeObserver 回调（模拟布局变化后组件重新测量） */
export function triggerResize(): void {
  for (const observer of [...observers]) {
    observer.callback([], observer as unknown as ResizeObserver);
  }
}

/** 取出组件调用过的进出场动画参数（animation 可断言动画是否被 cancel） */
export function getAnimationCalls(): {
  keyframes: Keyframe[];
  options?: KeyframeAnimationOptions;
  animation: { canceled: boolean };
}[] {
  return animationCalls;
}

/** 每个用例前清空替身状态 */
export function resetDomEnvironment(): void {
  observers.clear();
  animationCalls.length = 0;
}

export interface LayoutStub {
  offsetWidth?: number;
  offsetHeight?: number;
  clientHeight?: number;
  clientWidth?: number;
  scrollHeight?: number;
  /** getBoundingClientRect 的返回值，用来模拟"带 transform 的视觉尺寸" */
  rect?: Partial<DOMRect>;
}

/** 把元素在 jsdom 里的 0 尺寸换成给定值 */
export function stubLayout(element: Element, layout: LayoutStub): void {
  const define = (key: keyof LayoutStub, value: number) => {
    Object.defineProperty(element, key, { configurable: true, value });
  };
  if (layout.offsetWidth !== undefined) define("offsetWidth", layout.offsetWidth);
  if (layout.offsetHeight !== undefined) define("offsetHeight", layout.offsetHeight);
  if (layout.clientHeight !== undefined) define("clientHeight", layout.clientHeight);
  if (layout.clientWidth !== undefined) define("clientWidth", layout.clientWidth);
  if (layout.scrollHeight !== undefined) define("scrollHeight", layout.scrollHeight);
  if (layout.rect) {
    element.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
        ...layout.rect,
      }) as DOMRect;
  }
}
