# 画质对比弹窗缩放平移与大图自适应双模 PRD

## 一、需求背景与业务价值

在目前的资产切图工作流中，用户点击切图缩略图时会唤起 1:1 卷帘画质对比器（`CurtainModal.vue`）。但在实际使用过程中，暴露出两大显著体验痛点：
1. **缺乏缩放与平移能力**：现有弹窗将图片强制限制在视口内居中显示（`object-fit: contain`），当切图为高分辨率（如 4K/5K）、精细矢量图标或包含细腻半透明毛玻璃噪点时，缩小后肉眼完全无法辨别边缘是否发虚、是否有伪影或色阶断层，失去了“像素级比对”的核心意义。
2. **保底与原图场景下的交互冗余**：当图片因超时熔断走保底（`isFallback: true`）、或在“原画无损”模式下直通交付原图（体积 0 变化）、或用户未开启压缩时，原图与压缩产物在字节和像素上 100% 一致。此时强行呈现左右卷帘中线与 0% 徽标，不仅给用户带来“这两边有区别吗”的困惑，也降低了产品的专业度。

---

## 二、核心需求与功能定义

### 2.1 功能一：中心锚点平移缩放系统 (Zoom & Pan)
- **以鼠标指针为锚点的平滑滚轮缩放**：支持滚轮无级缩放（10% ~ 800%），缩放时以当前鼠标指针所在的图片像素坐标为几何中心展开/收缩；
- **无限平移画布 (Pan)**：在放大状态下，鼠标在画布任意非把手区域按住拖动即可平移视野，光标呈现标准手势（`grab` / `grabbing`）；
- **像素严丝合缝联动 (Dual-Layer Sync)**：原图层与压缩图层必须放置在同一个变换矩阵（`transform: translate3d(panX, panY, 0) scale(scale)`）下，保证无论放大多少倍，两图像素绝对严格对齐；
- **悬浮缩放控制胶囊 (Zoom Control Bar)**：在弹窗右下角提供 Apple 风格高透毛玻璃控制器，包含：
  - `[ - ]` 逐级缩小
  - 当前缩放百分比标签（如 `100%`、`200%`）
  - `[ + ]` 逐级放大
  - `[ 适应窗口 (Fit) ]` 一键还原为视口自适应完整展示
  - `[ 1:1 原生分辨率 ]` 一键跳转至 100% 原始物理分辨率。

### 2.2 功能二：自适应双形态呈现 (Dual-Mode Adaptation)
根据切图的真实压缩成果，智能分流为两种展示形态：

1. **形态 A：1:1 卷帘对比模式 (Comparator Mode)**
   - **触发条件**：存在真实的体积减小（`savedPercent > 0` 且 `!item.isFallback`）；
   - **呈现要素**：保留左右卷帘分割线、拖拽把手、左右两端原图/压缩图浮动数据徽章、顶部纯原图/50:50/纯优化快捷切换。
2. **形态 B：纯净高清大图预览模式 (High-Res Viewer Mode)**
   - **触发条件**：超时熔断保底（`item.isFallback === true`）、原画直通（`savedPercent === 0`）、或未启用压缩（`enableCompress === false`）；
   - **呈现要素**：
     - 自动隐藏卷帘分割线、拖拽把手、对比快捷 Tab 与右侧减重数据；
     - 顶部标题智能切换为“高清切图大图预览”；
     - 状态栏显示清晰的保障标签（如 `🛡️ 保底原图 (测算超时，100% 保真)` 或 `💎 原画最高画质 (无需量化)`）；
     - 纯单图渲染，完整保留全套平移缩放交互，带来极致纯粹的看图体验。

---

## 三、架构设计与技术实现

### 3.1 视口平移缩放数学模型
- **状态定义**：
  - `scale = ref(1.0)`
  - `panX = ref(0)`，`panY = ref(0)`
  - `fitScale = ref(1.0)`
- **鼠标指针锚点缩放算法**：
  ```ts
  const mouseX = e.clientX - containerRect.left
  const mouseY = e.clientY - containerRect.top
  const newScale = clamp(scale.value * factor, minScale, maxScale)
  // 锚点逆推位移公式：
  panX.value = mouseX - (mouseX - panX.value) * (newScale / scale.value)
  panY.value = mouseY - (mouseY - panY.value) * (newScale / scale.value)
  scale.value = newScale
  ```

### 3.2 模式切换逻辑
```ts
const isCompareMode = computed(() => {
  const item = props.item
  if (!item) return false
  if (item.isFallback) return false
  if (!item.enableCompress) return false
  return (item.compressedSize && item.compressedSize < item.fileSize) || false
})
```

---

## 四、视觉规范
- 延续整体高透光 Apple 液态微磨砂毛玻璃质感（`backdrop-filter: blur(20px)`，极细边框）；
- 快捷缩放胶囊置于右下角，避免遮挡图片主体；
- 光标行为明确：中线把手上为 `ew-resize`，画布拖拽时为 `grab` / `grabbing`。
