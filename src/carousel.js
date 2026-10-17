// ============================================================
// Carousel — 卡片轮播布局模块
//
// 通用、零依赖：只负责把一组「卡片元素」排成轮播并管理激活层级
//（亮度 dimming / z-index / 缩放由卡片自身决定，这里只发信号）。
// 它不关心卡片内部是什么效果——光栅画、普通图片、任意 DOM 均可插入。
//
// 与动效模块（LenticularCard）的契约仅此而已：
//   - add(element)        接收一个普通 HTMLElement
//   - onChange(index)     激活项变化时回调，由调用方决定如何同步卡片状态
// 任何一方都可以被单独替换而不影响另一方。
// ============================================================

export class Carousel {
  /**
   * @param {object} options
   * @param {HTMLElement} options.track           卡片轨道容器
   * @param {HTMLElement} [options.dots]          分页点容器
   * @param {HTMLElement} [options.prevButton]    上一张按钮
   * @param {HTMLElement} [options.nextButton]    下一张按钮
   * @param {boolean} [options.keyboard=true]     键盘左右方向键切换
   * @param {number} [options.inactiveDim=0.55]   非激活卡片亮度系数
   * @param {(index: number) => void} [options.onChange] 激活项变化回调
   */
  constructor({
    track,
    dots,
    prevButton,
    nextButton,
    keyboard = true,
    inactiveDim = 0.55,
    onChange,
  } = {}) {
    this._track = track;
    this._dotsBox = dots;
    this._inactiveDim = inactiveDim;
    this._onChange = onChange;
    this._cards = [];
    this._active = 0;

    prevButton?.addEventListener('click', () => this.prev());
    nextButton?.addEventListener('click', () => this.next());

    this._onKeyDown = (e) => {
      if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === 'ArrowRight') this.next();
    };
    if (keyboard) window.addEventListener('keydown', this._onKeyDown);
  }

  /** 注册一张卡片（元素由调用方创建，模块不关心其内部实现） */
  add(element) {
    const index = this._cards.length;
    this._cards.push(element);
    this._track.appendChild(element);

    if (this._dotsBox) {
      const dot = document.createElement('button');
      dot.className = 'dot-btn h-1.5 rounded-full transition-all duration-300 w-1.5 bg-neutral-700 hover:bg-neutral-500';
      dot.ariaLabel = `卡片 ${index + 1}`;
      dot.addEventListener('click', () => this.setActive(index));
      this._dotsBox.appendChild(dot);
    }

    this._applyHierarchy();
    return index;
  }

  /** 激活指定卡片（支持越界回绕） */
  setActive(index) {
    const len = this._cards.length;
    if (!len) return;
    const next = ((index % len) + len) % len;
    const changed = next !== this._active;
    this._active = next;
    this._applyHierarchy();
    if (changed) this._onChange?.(next);
  }

  next() {
    this.setActive(this._active + 1);
  }

  prev() {
    this.setActive(this._active - 1);
  }

  /** 当前激活索引 */
  get index() {
    return this._active;
  }

  /** 非激活卡片亮度系数（0~1，布局层参数） */
  setInactiveDim(value) {
    this._inactiveDim = value;
    this._applyHierarchy();
  }

  /** 激活层级：焦点卡片全亮 + 置顶，两侧卡片压暗 + 下沉 */
  _applyHierarchy() {
    this._cards.forEach((el, i) => {
      const active = i === this._active;
      el.style.filter = active ? 'brightness(1.0)' : `brightness(${this._inactiveDim})`;
      el.style.opacity = active ? '1.0' : '0.85';
      el.style.zIndex = active ? '10' : '1';
    });

    if (this._dotsBox) {
      this._dotsBox.querySelectorAll('.dot-btn').forEach((dot, i) => {
        dot.className = i === this._active
          ? 'dot-btn h-1.5 w-6 rounded-full bg-purple-400 transition-all duration-300'
          : 'dot-btn h-1.5 w-1.5 rounded-full bg-neutral-700 hover:bg-neutral-500 transition-all duration-300';
      });
    }
  }

  /** 销毁：解绑全局事件并清空轨道 */
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    this._cards.forEach((el) => el.remove());
    this._cards = [];
    if (this._dotsBox) this._dotsBox.innerHTML = '';
  }
}
