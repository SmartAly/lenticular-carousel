# Lenticular Carousel

3D 光栅画（Lenticular）交互动效 —— 微透镜竖纹折射 + 全息彩虹渐变高光 + 鼠标跟随 3D 倾斜。
**零依赖 vanilla JS（ES Module）**，卡片动效与轮播布局完全解耦，可整体使用，也可单独拆出使用。

> 复刻自 React Bits Pro 的 Lenticular Carousel 组件，并以原生 JS 重新架构。

## 效果预览

- 鼠标在卡片上**由左至右平移**：竖纹光栅条随视角压缩 / 展开，彩虹光柱跟随游走，底部文字随透光孔径打开而显现
- 鼠标移到卡片**左右边缘**：彩虹高光按衍射物理平滑衰减至完全隐匿，只留中性玻璃质感
- 悬停时卡片 **3D 倾斜 + Z 轴抬升**，底层照片带折射视差
- 支持**图层分解视图**（照片 / 光栅 Canvas / 文字沿 Z 轴分离）
- 内置**官方参数实时调试面板**（9 个 props 滑杆 + 4 套预设）

## 快速开始

ES Module 需要通过 HTTP 访问（`file://` 直开会被浏览器 CORS 拦截）：

```bash
npm start          # 零依赖 node 静态服务器，默认 http://localhost:5173
# 或者用任何你喜欢的静态服务器：npx serve . / python3 -m http.server
```

## 架构

```
index.html                 演示外壳（Tailwind CDN，无构建步骤）
src/
├── lenticular-card.js     【动效模块】LenticularCard + LenticularRenderer
├── carousel.js            【卡片模块】Carousel 通用轮播布局
├── presets.js             参数预设
├── data.js                演示数据
└── main.js                装配层（唯一同时认识所有模块的地方）
assets/cards/              演示图片（JPEG）
```

```
                ┌────────────────────────────┐
                │  动效模块 lenticular-card  │
                │  ┌──────────────────────┐  │
                │  │ LenticularRenderer   │  │  ← 纯 Canvas 绘制
                │  │ (ctx,w,h,state,params)│ │    无 DOM / 无事件 / 可单测
                │  └──────────┬───────────┘  │
                │  ┌──────────▼───────────┐  │
                │  │ LenticularCard       │  │  ← DOM 外壳
                │  │ 事件 + rAF 插值       │  │    指针追踪 / 3D 变换 / 文字编排
                │  │ + 3D 变换 + 文字编排  │  │
                │  └──────────┬───────────┘  │
                └─────────────┼──────────────┘
                  element     │  setActive / setParams / setExploded
                  onHover / onActivate
                              ▼
                ┌────────────────────────────┐
                │  卡片模块 carousel         │  ← 只认 HTMLElement
                │  轨道 / 导航 / 分页 /      │    不关心卡片里是什么效果
                │  激活层级 dimming          │
                └─────────────┬──────────────┘
                              │ onChange(index)
                              ▼
                ┌────────────────────────────┐
                │  装配层 main.js            │  ← 数据 + 调参面板 + 弹窗
                └────────────────────────────┘
```

### 解耦契约

两个模块**互不 import**，全部通信只经过三样东西：

| 方向 | 通道 | 内容 |
| --- | --- | --- |
| 动效 → 布局 | `onHover` / `onActivate` 回调 | 「我被悬停了 / 被点击了」 |
| 布局 → 动效 | `setActive(bool)` | 「你是焦点卡片吗」（仅影响缩放） |
| 布局 ← 动效 | `element` (HTMLElement) | 卡片根元素，布局层唯一接触的东西 |

想换掉任何一半都不影响另一半：把 `LenticularCard` 换成普通图片卡片，`Carousel` 照常工作；
把 `Carousel` 换成网格布局，`LenticularCard`` 仍是独立可用的效果组件。

### 性能设计

- 所有存活卡片**共享一个 `requestAnimationFrame`** 循环，而非每卡片各起一条
- **静止判定**：指针与悬停量收敛、且无参数变更时跳过绘制（Canvas 保留上一帧，视觉零差异）
- Canvas 内部分辨率 2x（520×740），retina 下竖条依然锐利

## 单独使用动效模块

```js
import { LenticularCard } from './src/lenticular-card.js';

const card = new LenticularCard({
  image: 'your-image.jpg',
  tag: 'REPETITION',
  title: 'Concrete Chorus',
  description: 'Austin, Texas',
  params: { strips: 56, foil: 0.5, blur: 36, ridge: 0.5, refraction: 0.32, tilt: 14, lift: 40, warping: 0.45 },
  onHover: (hovered) => {},
  onMove: (mx, my) => {},
  onActivate: () => {},
});
document.body.append(card.element);

card.setParams({ foil: 0.9 });   // 实时调参
card.setExploded(true);          // 图层分解视图
card.destroy();                  // 销毁并退出 ticker
```

## 参数说明

| 参数 | 默认 | 范围 | 含义 |
| --- | --- | --- | --- |
| `strips` | 56 | 16–96 | 柱面微透镜光栅竖条数量 |
| `foil` | 0.50 | 0–1 | 薄膜干涉彩虹光谱高光亮度 |
| `blur` | 36px | 10–64 | 彩虹高光高斯柔化半径（色谱交融度） |
| `ridge` | 0.50 | 0–1 | 光栅竖条边缘微镜面反射亮度 |
| `refraction` | 0.32 | 0–1 | 光线穿过微透镜时底层照片的折射视差 |
| `tilt` | 14° | 0–28 | 跟随鼠标的最大 3D 旋转倾角 |
| `lift` | 40px | 0–80 | 激活卡片向屏幕前方的 Z 轴抬升 |
| `warping` | 0.45 | 0–1 | 鼠标平移时光栅条纹宽度拉伸 |
| `inactiveDim` | 0.55 | 0.1–1 | 两侧未激活卡片的亮度系数（布局层参数） |

## 动效原理

1. **灰色蒙层条的物理本质：微透镜竖纹光栅玻璃。** 静止态竖条近乎隐形（仅保留微弱玻璃微反光）；文字是位于竖纹玻璃下方的独立内容，可见度由光栅开合折射控制。
2. **两侧自然隐匿 + 高斯柔化漫射。** 鼠标游移到卡片边缘时，衍射光线脱离布拉格反射窗口，彩虹按 `sin^2.2` 曲线平滑衰减至不可见；广域扩散晕 / 核心光谱柱 / 径向高光三个 Pass 叠加多层高斯模糊，消除一切硬边。
3. **鼠标平移驱动竖条宽度律动。** 鼠标在左侧时左半屏条纹被极端压缩（透镜闭合、文字被遮蔽）；右移时入射角推展，右侧条纹放宽展开（透光孔径打开、文字完全清晰）。

## 技术栈

- Vanilla JS ES Module（无框架、无构建）
- Tailwind CSS via CDN（仅演示外壳使用；两个核心模块不依赖任何 CSS 框架）
- Canvas 2D

## License

[MIT](./LICENSE)

---

### English Summary

A zero-dependency vanilla-JS reimplementation of the React Bits Pro "Lenticular Carousel": a 3D lenticular-glass card effect with microlens fluted slats, holographic rainbow foil highlights, pointer-driven 3D tilt and text reveal. The effect layer (`LenticularCard` + pure `LenticularRenderer`) and the layout layer (`Carousel`) are fully decoupled and usable independently. Run `npm start` and open http://localhost:5173.
