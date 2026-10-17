// ============================================================
// LenticularCard — 3D 光栅画（Lenticular）动效模块
//
// 微透镜竖纹光栅 + 全息彩虹渐变高光 + 鼠标跟随 3D 倾斜 + 文字揭示编排。
// 零依赖 vanilla JS（ES Module）。
//
// 设计边界（与卡片 / 轮播模块解耦的关键）：
//   本模块只关心「一张卡片自身的效果渲染与交互」——DOM 组装、Canvas 绘制、
//   指针追踪、3D 变换全部自闭在这一个文件里。它不关心轮播布局、分页、
//   导航按钮，也不关心旁边还有没有别的卡片。
//
//   对外只暴露最小接口：
//     element            卡片根元素（布局层唯一需要接触的东西）
//     setParams(patch)   实时调参
//     setActive(bool)    激活态（由布局层驱动，仅影响缩放层级）
//     setExploded(bool)  图层分解视图
//     onHover / onMove / onActivate  交互回调
//     destroy()          销毁并退出共享 ticker
//
// 内部两层：
//     LenticularRenderer  纯渲染层：不持有 DOM / 事件 / 动画状态，
//                         (ctx, w, h, state, params) -> 一帧画面，可独立测试。
//     LenticularCard      交互外壳：DOM + 事件 + rAF 插值 + 3D 变换。
// ============================================================

/** 效果参数默认值（9 个可实时调试参数，调参面板直接广播） */
export const DEFAULT_PARAMS = {
  strips: 56,        // 微透镜光栅竖条数量
  foil: 0.50,        // 彩虹全息强度
  blur: 36,          // 彩虹高光高斯模糊半径（px）
  foilTilt: 30,      // 彩虹光束倾斜角度（deg）：0=水平，90=竖直，可调调试
  ridge: 0.50,       // 棱镜边缘反光强度
  refraction: 0.32,  // 底层照片折射视差位移
  tilt: 14,          // 跟随鼠标的最大 3D 旋转倾角（deg）
  lift: 40,          // 激活卡片 Z 轴悬浮抬升（px）
  warping: 0.45,     // 鼠标平移时光栅条纹宽度拉伸
};

/** 卡片固定尺寸（CSS px） */
const CARD_WIDTH = 260;
const CARD_HEIGHT = 370;

/** Canvas 内部分辨率（2x，保证 retina 下竖条锐利） */
const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 740;

/** 插值系数（决定交互手感，勿随意改） */
const LERP_POINTER = 0.12; // 指针位置跟随
const LERP_HOVER = 0.14;   // 悬停量跟随

/** 静止判定阈值：指针与悬停量均收敛且无参数变更时跳过重绘 */
const IDLE_EPSILON = 0.001;

/** 竖条指针照亮半径（归一化卡片宽）：正对指针的竖条最亮，两侧按此半径 smooth 衰减 */
const SLAT_POINTER_FALLOFF = 0.25;

/**
 * 文字三行的 Z 纵深（px），顺序为 [tag, title, desc]。
 * 三行统一同一 Z：卡片左右倾斜时，三行作为整体获得一致的 3D 纵深倾斜，
 * 不会出现某一行有纵深感、某一行被遗漏的情况。
 */
const TEXT_LAYER_Z = [64, 64, 64];

/** 文字三行透明度系数（三行统一，保证 3D 倾斜表现完全一致） */
const TEXT_LAYER_OPACITY = [1, 1, 1];

/** 分解视图下文字整体额外抬升的 Z 基准（与原版 content z=60 的意图一致） */
const EXPLODED_TEXT_Z = 40;

// ------------------------------------------------------------
// LenticularRenderer — 纯渲染层
// ------------------------------------------------------------
export class LenticularRenderer {

  /**
   * 光栅竖条位置扭曲。
   * 鼠标在左侧时左半屏条纹压缩变窄（透镜闭合），鼠标右移时右侧条纹放宽展开（透光孔径打开）。
   * @param {number} i     条纹索引
   * @param {number} N     条纹总数
   * @param {number} mx    归一化指针 X（0~1）
   * @param {number} warp  扭曲系数（params.warping）
   * @param {number} hover 悬停量（0~1）
   * @returns {number} 扭曲后的归一化位置（0~1）
   */
  static slatU(i, N, mx, warp, hover) {
    const u = i / N;
    if (hover <= 0.001) return u; // 静止态：均匀排布
    const leftCompression = (1 - mx) * (1 - u) * Math.sin(u * Math.PI) * 0.16 * warp;
    const rightExpansion = (mx * 0.5) * Math.sin(u * Math.PI) * 0.12 * warp;
    return Math.max(0, Math.min(1, u - leftCompression + rightExpansion));
  }

  /**
   * 绘制一帧光栅画面。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w Canvas 宽（设备像素）
   * @param {number} h Canvas 高（设备像素）
   * @param {{mx: number, my: number, hover: number}} state 归一化指针位置 + 悬停量
   * @param {object} params 效果参数（DEFAULT_PARAMS 形状）
   */
  static paint(ctx, w, h, state, params) {
    const { mx, my, hover } = state;
    const dx = (mx - 0.5) * 2; // -1 ~ 1
    // 两侧自然隐匿：鼠标游移到卡片左右边缘时，衍射光线脱离观察窗口，彩虹平滑衰减至近乎不可见
    const edgeFade = Math.pow(Math.sin(Math.max(0, Math.min(1, mx)) * Math.PI), 2.2);

    ctx.clearRect(0, 0, w, h);
    this._paintFoilBeam(ctx, w, h, mx, my, hover, edgeFade, params);
    this._paintFlutedSlats(ctx, w, h, mx, dx, hover, edgeFade, params);
  }

  /**
   * 1. 全息彩虹光柱（三 Pass）。
   *    Pass 1 外围广域柔光扩散晕：大半径高斯模糊，消除硬边，形成极光般的氤氲扩散；
   *    Pass 2 核心柔化光谱柱：紫→蓝→青→绿→黄→橙→品红 的薄膜干涉色谱；
   *    Pass 3 光源聚集处柔和径向高光。
   */
  static _paintFoilBeam(ctx, w, h, mx, my, hover, edgeFade, params) {
    const beamCenterX = w * (0.10 + mx * 0.80);
    const halfSpan = w * (0.42 + 0.22 * params.foil) * 0.5;
    const tiltRad = params.foilTilt * (Math.PI / 180); // 彩虹光束倾斜角度：由 foilTilt 参数控制（默认 30deg）
    const cosT = Math.cos(tiltRad);
    const sinT = Math.sin(tiltRad);
    const cy = h * 0.5;
    const foil = params.foil * hover * edgeFade;
    if (foil <= 0.003) return;

    const setBlur = (px) => { if ('filter' in ctx) ctx.filter = `blur(${Math.round(px)}px)`; };
    const blur = Math.max(10, params.blur || 36);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Pass 1 — 外围广域柔光扩散晕
    const wide = halfSpan * 1.5;
    const wideBloom = ctx.createLinearGradient(
      beamCenterX - wide * cosT, cy - wide * sinT,
      beamCenterX + wide * cosT, cy + wide * sinT,
    );
    wideBloom.addColorStop(0.00, 'rgba(150, 0, 255, 0)');
    wideBloom.addColorStop(0.20, `rgba(90, 40, 255, ${foil * 0.22})`);
    wideBloom.addColorStop(0.38, `rgba(0, 160, 255, ${foil * 0.35})`);
    wideBloom.addColorStop(0.50, `rgba(0, 240, 160, ${foil * 0.40})`);
    wideBloom.addColorStop(0.65, `rgba(255, 210, 30, ${foil * 0.35})`);
    wideBloom.addColorStop(0.82, `rgba(255, 70, 80, ${foil * 0.22})`);
    wideBloom.addColorStop(1.00, 'rgba(200, 0, 160, 0)');
    setBlur(blur * 1.4);
    ctx.fillStyle = wideBloom;
    ctx.fillRect(-60, -60, w + 120, h + 120);

    // Pass 2 — 核心柔化光谱柱
    const core = ctx.createLinearGradient(
      beamCenterX - halfSpan * cosT, cy - halfSpan * sinT,
      beamCenterX + halfSpan * cosT, cy + halfSpan * sinT,
    );
    core.addColorStop(0.00, 'rgba(160, 0, 255, 0)');
    core.addColorStop(0.12, `rgba(130, 0, 255, ${foil * 0.45})`);   // Violet
    core.addColorStop(0.25, `rgba(40, 100, 255, ${foil * 0.70})`);  // Royal Blue
    core.addColorStop(0.38, `rgba(0, 210, 255, ${foil * 0.85})`);   // Cyan
    core.addColorStop(0.50, `rgba(0, 255, 130, ${foil * 0.80})`);   // Green
    core.addColorStop(0.63, `rgba(255, 230, 20, ${foil * 0.85})`);  // Gold
    core.addColorStop(0.77, `rgba(255, 90, 10, ${foil * 0.70})`);   // Orange
    core.addColorStop(0.89, `rgba(255, 10, 130, ${foil * 0.50})`);  // Magenta
    core.addColorStop(1.00, 'rgba(180, 0, 220, 0)');
    setBlur(blur);
    ctx.fillStyle = core;
    ctx.fillRect(-60, -60, w + 120, h + 120);

    // Pass 3 — 光源聚集处柔和径向高光
    setBlur(blur * 0.8);
    const halo = ctx.createRadialGradient(mx * w, my * h, 10, mx * w, my * h, w * 0.55);
    halo.addColorStop(0.00, `rgba(255, 255, 255, ${foil * 0.32})`);
    halo.addColorStop(0.35, `rgba(180, 220, 255, ${foil * 0.16})`);
    halo.addColorStop(0.70, `rgba(220, 180, 255, ${foil * 0.05})`);
    halo.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-40, -40, w + 80, h + 80);

    ctx.restore();
    if ('filter' in ctx) ctx.filter = 'none';
  }

  /**
   * 2. 竖纹玻璃微透镜光栅蒙层（静止态保持微弱玻璃质感，悬停态动态展开）。
   *    每条竖条由三部分组成：半透明玻璃身体 + 左缘棱镜高光 + 右缘凹槽阴影。
   *    鼠标正对的竖条被「局部照亮」——离指针越近越亮，向两侧平滑衰减。
   */
  static _paintFlutedSlats(ctx, w, h, mx, dx, hover, edgeFade, params) {
    const N = params.strips;
    const ridge = params.ridge * hover;
    const beamCenterX = w * (0.10 + mx * 0.80);
    const pointerX = mx * w;

    ctx.save();
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p0 = this.slatU(i, N, mx, params.warping, hover);
      const p1 = this.slatU(i + 1, N, mx, params.warping, hover);
      const sx = p0 * w;
      const sw = Math.max(1.0, (p1 - p0) * w);

      // 指针局部照亮系数：竖条贯穿全高，最近点即指针所在高度，
      // 故只按水平距离衰减——正对指针的竖条最亮，两侧 smooth 衰减至 0。
      const distToPointer = Math.abs(sx + sw * 0.5 - pointerX) / w;
      const t = Math.min(1, distToPointer / SLAT_POINTER_FALLOFF);
      const proximity = Math.pow(1 - t, 1.6) * hover;

      // 条纹与移动彩虹光柱的距离 -> 光束影响（两侧边缘同步淡出）
      const distToBeam = Math.abs(sx - beamCenterX) / (w * 0.35);
      const beamInfluence = Math.max(0, 1 - distToBeam) * edgeFade;

      // A. 半透明玻璃 slat 身体：全卡保持可见的玻璃基底（远处 ~0.10），
      //    指针照亮处显著增亮（近处 ~0.26）——近亮远弱，但不消失
      ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + (0.10 + 0.14 * proximity) * hover})`;
      ctx.fillRect(sx, 0, sw, h);

      // 高光条方向跟随 foilTilt（与彩虹光谱流向一致）：90°=竖直，0°=水平，30°=斜
      // 注意：只有「高光条(B)」跟随彩虹倾斜；薯条本身（身体 A + 凹槽阴影 C）保持竖直，
      // 这样竖直薯条结构清晰，高光条 subtle 地叠在上面跟随彩虹角度。
      const tiltRad = params.foilTilt * (Math.PI / 180);
      const cosT = Math.cos(tiltRad), sinT = Math.sin(tiltRad);
      const cy = h * 0.5;
      const halfLen = (w + h) * 0.75;

      // B. 棱镜高光条：与彩虹光带平行（「薯条上的高光条」），subtle 不喧宾夺主；
      //    关键：彩虹渐变沿 (cosT,sinT)，其等色线（光带走向）垂直该轴 = (-sinT,cosT)，
      //    故高光条必须沿 (-sinT,cosT)，才能与彩虹重叠而非垂直。
      const ridgeSpec = 0.07 + (0.28 + 0.85 * beamInfluence + 0.9 * proximity) * ridge;
      const tint = Math.max(beamInfluence, proximity) * hover;
      const r = Math.min(255, Math.floor(225 + 30 * Math.sin(u * 12 + dx * 2) * tint));
      const g = Math.min(255, Math.floor(230 + 25 * Math.sin(u * 12 + 2 + dx * 2) * tint));
      ctx.strokeStyle = `rgba(${r}, ${g}, 255, ${ridgeSpec * 0.65})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx + halfLen * sinT, cy - halfLen * cosT);
      ctx.lineTo(sx - halfLen * sinT, cy + halfLen * cosT);
      ctx.stroke();

      // C. 右缘凹槽阴影：保持竖直（薯条边界竖直，勾勒竖直薯条结构）；
      //    指针照亮处凹槽变浅（光直射下棱镜边缘阴影弱化）
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.05 + 0.16 * hover) * (1 - 0.5 * proximity)})`;
      ctx.fillRect(sx + sw - 1.2, 0, 1.2, h);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------
// LenticularCard — 交互外壳
// ------------------------------------------------------------

/** 共享 ticker：所有存活卡片共用一个 requestAnimationFrame 循环 */
const liveCards = new Set();
let tickerId = 0;

function tick() {
  for (const card of liveCards) card._frame();
  tickerId = liveCards.size > 0 ? requestAnimationFrame(tick) : 0;
}

function ensureTicker() {
  if (!tickerId) tickerId = requestAnimationFrame(tick);
}

export class LenticularCard {
  /**
   * @param {object} options
   * @param {string} options.image            图片地址
   * @param {string} [options.tag]            角标文字（如 REPETITION）
   * @param {string} [options.title]          标题
   * @param {string} [options.description]    描述 / 地点
   * @param {number} [options.index]          序号（用于分解视图徽标 Card #N）
   * @param {object} [options.params]         效果参数（DEFAULT_PARAMS 形状）
   * @param {(hovered: boolean) => void} [options.onHover]
   * @param {(mx: number, my: number) => void} [options.onMove]
   * @param {() => void} [options.onActivate] 点击回调
   */
  constructor(options = {}) {
    this.params = { ...DEFAULT_PARAMS, ...(options.params || {}) };
    this.onHover = options.onHover;
    this.onMove = options.onMove;
    this.onActivate = options.onActivate;

    this._active = false;
    this._exploded = false;
    this._dirty = true; // 首帧必须绘制

    // 交互状态（内部可变，外部只透出最小接口）
    this._hovered = false;
    this._target = { x: 0.5, y: 0.5 };
    this._curr = { x: 0.5, y: 0.5 };
    this._hoverAmount = 0;

    this._buildDom(options);
    this._bindEvents();
    liveCards.add(this);
    ensureTicker();
  }

  /** 卡片根元素（布局层唯一需要接触的东西） */
  get element() {
    return this._root;
  }

  _buildDom({ image, tag = '', title = '', description = '', index = 0 }) {
    const root = document.createElement('div');
    root.className = 'card-container relative transition-all duration-300 ease-out cursor-pointer select-none';
    root.style.width = `${CARD_WIDTH}px`;
    root.style.height = `${CARD_HEIGHT}px`;

    // 注意：card-inner 上不能用 overflow-hidden——该属性会强制
    // transform-style 扁平化，子层的 translateZ 纵深将全部失效。
    // 裁剪改由照片 / Canvas 自身的 clip-path 完成，行为全引擎一致。
    const inner = document.createElement('div');
    inner.className = 'card-inner relative w-full h-full rounded-[14px] preserve-3d transition-transform duration-75';
    inner.style.boxShadow = '0 20px 40px -15px rgba(0,0,0,0.7)';

    // 1. 底层照片（背景图方案）
    //    折射视差用 background-size(106~108%) + background-position 实现：
    //    背景绘制永不溢出元素盒，从根上保证照片与蒙层尺寸一致。
    //    （曾经的 <img> + transform:scale 方案：scale 会把 clip-path 裁好的
    //    圆角矩形一并放大， hover 态照片视觉尺寸 281x400 vs 蒙层 260x370，
    //    四边各露出 10-15px 无蒙层照片——即「蒙层四周有 padding」的根因。）
    const photo = document.createElement('div');
    photo.className = 'card-photo absolute inset-0 rounded-[14px] transition-transform duration-100 ease-out';
    photo.style.backgroundImage = `url("${image}")`;
    photo.style.backgroundSize = '106%';
    photo.style.backgroundPosition = 'center';
    photo.style.backgroundRepeat = 'no-repeat';

    // 2. 渐变遮罩（Scrim）
    const scrim = document.createElement('div');
    scrim.className = 'card-scrim absolute inset-0 rounded-[14px] bg-gradient-to-t from-black/90 via-black/35 to-black/5 pointer-events-none transition-opacity duration-300';

    // 3. 竖纹玻璃光栅与全息彩虹光束 Canvas 蒙层
    //    clip-path 同照片：光柱绘制溢出四角，需裁回圆角内；
    //    border-radius 在 mix-blend-screen 下不总可靠，双保险。
    const canvas = document.createElement('canvas');
    canvas.className = 'card-canvas absolute inset-0 w-full h-full rounded-[14px] pointer-events-none mix-blend-screen';
    canvas.style.clipPath = 'inset(0 round 14px)';
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // 4. 底部文字（位于灰色蒙层下方，随光栅展开自然显现）
    //    preserve-3d：让三行文字各自的 translateZ 融入卡片的 3D 渲染上下文。
    //    注意：容器上不能有 opacity<1（会强制扁平化，行内 translateZ 全部失效），
    //    因此揭示透明度下沉到每一行自身（实测不影响行自身的 Z 定位）。
    const content = document.createElement('div');
    content.className = 'card-content preserve-3d absolute bottom-0 left-0 right-0 p-5 z-20 pointer-events-none';
    // 阴影一律用 text-shadow：drop-shadow(filter) 虽不影响元素自身 Z，
    // 但会扁平化其子树，且与 3D 合成路径下行为不一致，统一避免。
    content.innerHTML = `
      <div class="card-tag text-[10px] font-bold tracking-widest text-neutral-300 uppercase mb-1" style="opacity: 0; text-shadow: 0 4px 3px rgba(0,0,0,0.07), 0 2px 2px rgba(0,0,0,0.06)">${tag}</div>
      <h3 class="card-title text-xl font-bold tracking-tight text-white leading-tight" style="opacity: 0; text-shadow: 0 4px 3px rgba(0,0,0,0.07), 0 2px 2px rgba(0,0,0,0.06)">${title}</h3>
      <p class="card-desc text-[11px] font-bold tracking-normal text-neutral-300 mt-1" style="opacity: 0; text-shadow: 0 4px 3px rgba(0,0,0,0.07), 0 2px 2px rgba(0,0,0,0.06)">${description}</p>`;

    // 5. 分解视图徽标
    const badge = document.createElement('div');
    badge.className = 'exploded-badge hidden absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/80 text-white z-30 shadow';
    badge.textContent = `Card #${index + 1}`;

    inner.append(photo, scrim, canvas, content, badge);
    root.appendChild(inner);

    this._root = root;
    this._inner = inner;
    this._photo = photo;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._content = content;
    this._badge = badge;
    // 三行文字引用，顺序与 TEXT_LAYER_Z 一一对应：[tag, title, desc]
    this._textLayers = [
      content.querySelector('.card-tag'),
      content.querySelector('.card-title'),
      content.querySelector('.card-desc'),
    ];
  }

  _bindEvents() {
    const root = this._root;
    root.addEventListener('mouseenter', () => {
      this._hovered = true;
      this._dirty = true;
      this.onHover?.(true);
    });
    root.addEventListener('mouseleave', () => {
      this._hovered = false;
      this._target.x = 0.5;
      this._target.y = 0.5;
      this._dirty = true;
      this.onHover?.(false);
    });
    root.addEventListener('mousemove', (e) => {
      const rect = root.getBoundingClientRect();
      this._target.x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this._target.y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this._dirty = true;
      this.onMove?.(this._target.x, this._target.y);
    });
    root.addEventListener('click', () => this.onActivate?.());
  }

  /** 实时更新效果参数（调参面板用） */
  setParams(partial = {}) {
    Object.assign(this.params, partial);
    this._dirty = true;
  }

  /** 激活态由布局层（Carousel）驱动：仅影响缩放层级 */
  setActive(active) {
    if (this._active !== active) {
      this._active = active;
      this._dirty = true;
    }
  }

  /** 图层分解视图：照片 / 光栅 Canvas / 文字 沿 Z 轴分离展示 */
  setExploded(exploded) {
    if (this._exploded !== exploded) {
      this._exploded = exploded;
      this._badge.classList.toggle('hidden', !exploded);
      this._dirty = true;
    }
  }

  /** 每帧：插值 -> 静止判定 -> 3D 变换 -> 文字编排 -> Canvas 绘制 */
  _frame() {
    this._curr.x += (this._target.x - this._curr.x) * LERP_POINTER;
    this._curr.y += (this._target.y - this._curr.y) * LERP_POINTER;
    const targetHover = this._hovered ? 1 : 0;
    this._hoverAmount += (targetHover - this._hoverAmount) * LERP_HOVER;

    const settled =
      Math.abs(this._target.x - this._curr.x) < IDLE_EPSILON &&
      Math.abs(this._target.y - this._curr.y) < IDLE_EPSILON &&
      Math.abs(targetHover - this._hoverAmount) < IDLE_EPSILON;
    if (settled && !this._dirty) return; // 收敛且无变更：跳过本帧绘制
    this._dirty = false;

    this._applyTransform();
    this._applyText();
    LenticularRenderer.paint(
      this._ctx,
      this._canvas.width,
      this._canvas.height,
      { mx: this._curr.x, my: this._curr.y, hover: this._hoverAmount },
      this.params,
    );
  }

  /** 3D 变换：倾斜 + Z 轴抬升 + 激活缩放 + 底层照片折射视差 */
  _applyTransform() {
    const { x: mx, y: my } = this._curr;
    const dx = (mx - 0.5) * 2;
    const dy = (my - 0.5) * 2;
    const h = this._hoverAmount;
    const rotX = -dy * this.params.tilt * h;
    const rotY = dx * this.params.tilt * h;
    const scale = this._active ? 1 + 0.02 * h : 0.90;

    if (this._exploded) {
      this._inner.style.transform =
        `perspective(1200px) rotateX(${rotX - 10}deg) rotateY(${rotY + 25}deg) scale(${scale})`;
      this._photo.style.transform = 'translateZ(-30px)';
      this._photo.style.backgroundSize = '105%';
      this._photo.style.backgroundPosition = 'center';
      this._canvas.style.transform = 'translateZ(25px)';
    } else {
      this._inner.style.transform =
        `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(${this.params.lift * h}px) scale(${scale})`;
      // 微透镜下的底层照片折射视差：background-position 平移 + 背景放大，
      // 照片始终被裁剪在自身元素盒内，与蒙层尺寸永远一致
      const parallaxX = -dx * this.params.refraction * 10;
      const parallaxY = -dy * this.params.refraction * 8;
      this._photo.style.transform = 'none';
      this._photo.style.backgroundSize = h > 0.001 ? '108%' : '106%';
      this._photo.style.backgroundPosition =
        `calc(50% + ${parallaxX.toFixed(1)}px) calc(50% + ${parallaxY.toFixed(1)}px)`;
      this._canvas.style.transform = 'translateZ(0px)';
    }
  }

  /**
   * 文字揭示编排：与光栅开合同步。
   * 鼠标在左侧时竖条压缩、文字被遮蔽（低透明度 + 负字距）；
   * 鼠标右移时竖条展开、文字完全清晰呈现。
   *
   * 三行文字携带统一的 translateZ（TEXT_LAYER_Z）：卡片左右倾斜时，
   * 三行作为整体获得一致的 3D 纵深倾斜，无一行遗漏。
   * 透明度必须写在每一行上——容器上的 opacity<1 会强制扁平化，
   * 行内 translateZ 将全部失效（实测结论）。
   */
  _applyText() {
    const { x: mx } = this._curr;
    const h = this._hoverAmount;
    const opacity = Math.max(0, Math.min(1, h * (0.05 + mx * 1.15)));
    const tracking = mx < 0.45 ? `${((mx - 0.45) * 4).toFixed(1)}px` : '0px';
    const textX = ((1 - mx) * -12 * h).toFixed(1);
    const textY = ((1 - h) * 12).toFixed(1);
    const zBase = this._exploded ? EXPLODED_TEXT_Z : 0;

    this._content.style.letterSpacing = tracking;

    this._textLayers.forEach((el, i) => {
      el.style.opacity = (opacity * TEXT_LAYER_OPACITY[i]).toFixed(3);
      el.style.transform = `translate3d(${textX}px, ${textY}px, ${TEXT_LAYER_Z[i] + zBase}px)`;
    });
  }

  /** 销毁：退出共享 ticker 并移除 DOM */
  destroy() {
    liveCards.delete(this);
    this._root.remove();
  }
}
