# Lenticular Carousel

3D 光栅画（Lenticular）交互动效 —— 微透镜竖纹折射 + 全息彩虹渐变高光 + 鼠标跟随 3D 倾斜。
**零依赖 vanilla JS（ES Module）**，卡片动效与轮播布局完全解耦，可整体使用，也可单独拆出使用。

> 复刻自 React Bits Pro 的 Lenticular Carousel 组件，并以原生 JS 重新架构。

**👉 在线预览：https://smartaly.github.io/lenticular-carousel/** （GitHub Pages，打开即玩，无需安装）

## 效果预览

- 鼠标在卡片上**由左至右平移**：竖纹光栅条随视角压缩 / 展开，彩虹光柱跟随游走，底部文字随透光孔径打开而显现
- 底部文字**三行各自独立 Z 纵深**（角标 / 标题 / 描述），卡片左右倾斜时产生真实的透视视差分层
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

![Lenticular Carousel 模块架构：动效模块与布局模块完全解耦](./docs/architecture.svg)

*架构图源码：[docs/architecture.svg](./docs/architecture.svg)（亮 / 暗色主题自适应）*

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

### 3D 实现要点（CSS 3D 扁平化坑位）

这套效果的全部纵深都依赖一条完整的 `preserve-3d` 链路，以下是实测（Chrome 131+ / Safari 17+ 行为一致）总结的坑：

- **透视必须用 `perspective()` 函数**写在被旋转元素自身的 `transform` 里。写在祖先元素上的 `perspective` **属性**不会传递给孙层——孙层的 `translateZ` 会完全失效。
- **3D 链路上的祖先不能有 `opacity < 1` / `filter` / `will-change: opacity`**——这些都是分组属性，会强制该元素 `transform-style: flat`，子树里所有 `translateZ` 统统失效。所以文字揭示透明度写在**每一行自身**（实测元素自身的 `opacity` 不影响它自己的 `translateZ`）。
- **文字阴影用 `text-shadow` 而非 `drop-shadow`**：`filter` 同样触发扁平化。
- 旋转容器上**不要用 `overflow: hidden`**（WebKit 下会扁平化）；圆角裁剪由各图层自身的 `rounded-[14px]` 完成，行为全引擎一致。

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

Live demo: https://smartaly.github.io/lenticular-carousel/
