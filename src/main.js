// ============================================================
// main.js — 演示装配层（唯一知道「所有模块」的地方）
//
// 职责只有三件事：
//   1. 用数据 + 动效模块（LenticularCard）造出卡片
//   2. 把卡片元素注册进布局模块（Carousel），并同步激活状态
//   3. 绑定演示 chrome：调参滑杆、预设、分解视图、原理弹窗
//
// 注意依赖方向：main -> {lenticular-card, carousel}，
// 而动效模块与布局模块之间互不依赖。
// ============================================================

import { LenticularCard, DEFAULT_PARAMS } from './lenticular-card.js';
import { Carousel } from './carousel.js';
import { PRESETS } from './presets.js';
import { CAROUSEL_ITEMS } from './data.js';

const $ = (id) => document.getElementById(id);

/** 全局参数（滑杆 / 预设的唯一事实源） */
const params = { ...DEFAULT_PARAMS, inactiveDim: 0.55 };

// ------------------------------------------------------------
// 1 + 2. 装配：动效模块 × 布局模块
// ------------------------------------------------------------
const cards = CAROUSEL_ITEMS.map((item, i) => new LenticularCard({
  ...item,
  index: i,
  params,
  // 悬停即激活：交互语义由效果模块汇报，布局决策交给轮播
  onHover: (hovered) => {
    if (hovered) carousel.setActive(i);
  },
  onActivate: () => carousel.setActive(i),
}));

const carousel = new Carousel({
  track: $('carousel-track'),
  dots: $('pagination-dots'),
  prevButton: $('prev-card-btn'),
  nextButton: $('next-card-btn'),
  inactiveDim: params.inactiveDim,
  // 轮播只广播「谁被激活了」，具体怎么响应由这里决定
  onChange: (i) => cards.forEach((c, j) => c.setActive(j === i)),
});

cards.forEach((c) => carousel.add(c.element));
cards[0].setActive(true);

// ------------------------------------------------------------
// 3a. 调参滑杆（效果参数 -> 广播给所有卡片；布局参数 -> 轮播）
// ------------------------------------------------------------
const SLIDERS = [
  { key: 'strips', id: 'strips', format: (v) => Math.round(v) },
  { key: 'foil', id: 'foil', format: (v) => v.toFixed(2) },
  { key: 'blur', id: 'blur', format: (v) => `${Math.round(v)}px` },
  { key: 'ridge', id: 'ridge', format: (v) => v.toFixed(2) },
  { key: 'refraction', id: 'refraction', format: (v) => v.toFixed(2) },
  { key: 'tilt', id: 'tilt', format: (v) => `${Math.round(v)}\u00B0` },
  { key: 'lift', id: 'lift', format: (v) => `${Math.round(v)}px` },
  { key: 'warping', id: 'warping', format: (v) => v.toFixed(2) },
  { key: 'inactiveDim', id: 'dim', format: (v) => v.toFixed(2) },
];

function applyParams(patch) {
  Object.assign(params, patch);
  cards.forEach((c) => c.setParams(patch));
  if ('inactiveDim' in patch) carousel.setInactiveDim(patch.inactiveDim);
  syncSliders();
}

function syncSliders() {
  SLIDERS.forEach(({ key, id, format }) => {
    $(`param-${id}`).value = params[key];
    $(`val-${id}`).textContent = format(params[key]);
  });
}

SLIDERS.forEach(({ key, id }) => {
  $(`param-${id}`).addEventListener('input', (e) => {
    applyParams({ [key]: parseFloat(e.target.value) });
  });
});

// ------------------------------------------------------------
// 3b. 预设
// ------------------------------------------------------------
const PRESET_BUTTONS = {
  'preset-default': 'default',
  'preset-foil': 'foil',
  'preset-dense': 'dense',
  'preset-subtle': 'subtle',
};
Object.entries(PRESET_BUTTONS).forEach(([btnId, presetKey]) => {
  $(btnId).addEventListener('click', () => applyParams(PRESETS[presetKey]));
});

// ------------------------------------------------------------
// 3c. 图层分解视图
// ------------------------------------------------------------
const toggleLayerBtn = $('toggle-layer-btn');
const layerBtnText = $('layer-btn-text');
let exploded = false;

toggleLayerBtn.addEventListener('click', () => {
  exploded = !exploded;
  cards.forEach((c) => c.setExploded(exploded));
  layerBtnText.textContent = exploded ? '恢复正常视图' : '图层分解视图';
  toggleLayerBtn.classList.toggle('bg-purple-600', exploded);
  toggleLayerBtn.classList.toggle('text-white', exploded);
  toggleLayerBtn.classList.toggle('border-purple-500', exploded);
});

// ------------------------------------------------------------
// 3d. 代码与原理弹窗
// ------------------------------------------------------------
const codeModal = $('code-modal');

$('open-code-btn').addEventListener('click', () => codeModal.classList.remove('hidden'));
$('close-code-btn').addEventListener('click', () => codeModal.classList.add('hidden'));
codeModal.addEventListener('click', (e) => {
  if (e.target === codeModal) codeModal.classList.add('hidden');
});

function switchTab(showPrinciple) {
  const on = 'py-3 px-3 border-b-2 border-purple-500 text-purple-400 font-medium';
  const off = 'py-3 px-3 border-b-2 border-transparent text-neutral-400 hover:text-neutral-200 font-medium';
  $('tab-principle-btn').className = showPrinciple ? on : off;
  $('tab-react-btn').className = showPrinciple ? off : on;
  $('tab-principle-content').classList.toggle('hidden', !showPrinciple);
  $('tab-react-content').classList.toggle('hidden', showPrinciple);
}
$('tab-principle-btn').addEventListener('click', () => switchTab(true));
$('tab-react-btn').addEventListener('click', () => switchTab(false));

// ------------------------------------------------------------
// 3e. 复制代码
// ------------------------------------------------------------
const copyCodeBtn = $('copy-code-btn');
copyCodeBtn.addEventListener('click', async () => {
  const code = $('code-snippet').innerText;
  try {
    await navigator.clipboard.writeText(code);
    flashCopyButton('已复制！');
  } catch {
    fallbackCopy(code);
  }
});

function flashCopyButton(text) {
  copyCodeBtn.textContent = text;
  setTimeout(() => { copyCodeBtn.textContent = '复制代码'; }, 2000);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    flashCopyButton('已复制！');
  } catch {
    flashCopyButton('复制失败');
  }
  document.body.removeChild(ta);
}

// ------------------------------------------------------------
// 初始化：模块脚本默认 defer，DOM 已就绪，直接同步滑杆即可
// ------------------------------------------------------------
syncSliders();
