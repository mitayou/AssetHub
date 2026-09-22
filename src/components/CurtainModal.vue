<template>
  <!-- 弹窗: 画质对比与高清大图双模查看器 -->
  <div v-if="visible" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <!-- 弹窗顶部栏 -->
      <div class="modal-header">
        <div class="modal-title-wrap">
          <h4>{{ isCompareMode ? '1:1 像素级画质比对' : '高清切图大图预览' }}</h4>
          <span v-if="item" class="modal-file-badge">{{ item.fileName }}</span>
          <!-- 非对比模式（大图模式）下的状态保障标签 -->
          <span 
            v-if="!isCompareMode && viewerStatusBadge" 
            class="status-pill"
            :class="viewerStatusBadge.type"
          >
            {{ viewerStatusBadge.label }}
          </span>
        </div>
        <button class="close-btn" title="关闭 (Esc)" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <!-- 弹窗快捷操作提示条 -->
        <div class="modal-toolbar">
          <p class="modal-tip">
            <template v-if="isCompareMode">
              左右拖拽中线对比原图与量化，滚轮缩放（10%~800%）与拖拽平移探索微观像素细节：
            </template>
            <template v-else>
              支持鼠标滚轮无级缩放（10%~800%）与按住拖拽平移，双击可快速切换 1:1 像素对齐：
            </template>
          </p>

          <!-- 仅在卷帘对比模式下展示快速切换 Tab -->
          <div v-if="isCompareMode" class="quick-split-tabs">
            <button 
              :class="['split-tab', { active: curtainPercent === 0 }]" 
              @click="curtainPercent = 0"
            >
              纯优化后
            </button>
            <button 
              :class="['split-tab', { active: curtainPercent === 50 }]" 
              @click="curtainPercent = 50"
            >
              50:50 比对
            </button>
            <button 
              :class="['split-tab', { active: curtainPercent === 100 }]" 
              @click="curtainPercent = 100"
            >
              纯原图
            </button>
          </div>
        </div>

        <!-- 主视口容器 (支持滚轮缩放、拖拽平移、双击复位) -->
        <div 
          class="curtain-container checker-board"
          ref="viewportRef"
          :class="{ 'is-panning': isPanning, 'is-dividing': isDividing }"
          @wheel.prevent="handleWheel"
          @mousedown="handleMouseDown"
          @dblclick="handleDoubleClick"
        >
          <!-- 受 transform 驱动的舞台画布 (原图与压缩图在此 1:1 严格对齐) -->
          <div 
            class="stage-canvas"
            :style="stageStyle"
          >
            <!-- 模式 A: 卷帘对比模式 (包含原图层、压缩图层与卷帘中线) -->
            <template v-if="isCompareMode">
              <!-- 左侧图层: 原始切图 (仅在 [0, curtainPercent%] 区域裁剪可见) -->
              <div 
                class="stage-layer original-layer"
                :style="{ clipPath: `polygon(0 0, ${curtainPercent}% 0, ${curtainPercent}% 100%, 0 100%)` }"
              >
                <img 
                  :src="item?.previewUrl" 
                  alt="Original" 
                  class="stage-img" 
                  draggable="false" 
                  @load="handleImageLoad" 
                />
              </div>

              <!-- 右侧图层: 压缩量化图 (仅在 [curtainPercent%, 100%] 区域裁剪可见，互斥裁剪杜绝透明叠加) -->
              <div 
                class="stage-layer compressed-layer"
                :style="{ clipPath: `polygon(${curtainPercent}% 0, 100% 0, 100% 100%, ${curtainPercent}% 100%)` }"
              >
                <img 
                  :src="item?.compressedPreviewUrl || item?.previewUrl" 
                  alt="Compressed" 
                  class="stage-img" 
                  draggable="false" 
                />
              </div>

              <!-- 卷帘分割中线 (固定在图片舞台范围内，随舞台一同平移，但通过反向缩放保持物理尺寸与线宽恒定) -->
              <div 
                class="stage-divider" 
                :class="{ 'is-dragging': isDividing }"
                :style="{ 
                  left: curtainPercent + '%',
                  '--inv-scale': invScale
                }"
                @mousedown.stop="handleStartDivideDrag"
              >
                <!-- 恒定 1.5px 锐利高亮分割中线 -->
                <div class="stage-divider-line"></div>
                <!-- 恒定物理尺寸的极简通透手柄 (左右拖拽全线响应，拖拽时幽灵避让) -->
                <div class="stage-handle-knob" title="左右拖动调整比对范围（整条线均可直接按住拖拽）">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="8 17 3 12 8 7" />
                    <polyline points="16 7 21 12 16 17" />
                  </svg>
                </div>
              </div>
            </template>

            <!-- 模式 B: 纯净高清大图预览模式 (无中线干扰，专注大图全画幅视效) -->
            <template v-else>
              <div class="stage-layer single-layer">
                <img 
                  :src="item?.previewUrl" 
                  alt="High-Res Preview" 
                  class="stage-img" 
                  draggable="false" 
                  @load="handleImageLoad" 
                />
              </div>
            </template>
          </div>

          <!-- 动态数据徽章: 左侧原图 (仅在对比模式显示) -->
          <div v-if="isCompareMode" class="curtain-floating-badge badge-left">
            <span class="badge-title">原始切图</span>
            <span class="badge-val">{{ formatFileSize(item?.fileSize || 0) }}</span>
          </div>

          <!-- 动态数据徽章: 右侧优化产物 (仅在对比模式显示) -->
          <div v-if="isCompareMode" class="curtain-floating-badge badge-right">
            <span class="badge-title">量化优化</span>
            <span v-if="!compInfo.isMeasuring" class="badge-val">
              {{ formatFileSize(compInfo.optSize) }}
              <span v-if="compInfo.savedPercent > 0" class="badge-ratio">(-{{ compInfo.savedPercent }}%)</span>
            </span>
            <span v-else class="badge-val">优化测算中...</span>
          </div>

          <!-- Apple 高透毛玻璃悬浮缩放控制器 -->
          <div class="zoom-toolbar" @mousedown.stop>
            <button class="zoom-btn" title="缩小画面" @click="handleZoomStep(-0.25)">−</button>
            <span class="zoom-text" title="点击重置为 1:1 原生分辨率" @click="resetTo100">
              {{ Math.round(scale * 100) }}%
            </span>
            <button class="zoom-btn" title="放大画面" @click="handleZoomStep(0.25)">+</button>
            <div class="zoom-divider"></div>
            <button 
              class="zoom-action-btn" 
              :class="{ active: isFitActive }" 
              title="适应视口大小" 
              @click="fitToScreen"
            >
              适应窗口
            </button>
            <button 
              class="zoom-action-btn" 
              :class="{ active: Math.round(scale * 100) === 100 }" 
              title="以 100% 原始物理分辨率查看" 
              @click="resetTo100"
            >
              1:1
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { IQueueItem } from '../types/asset'
import { formatFileSize } from '../utils/format'

const props = defineProps<{
  /** 弹窗显隐 */
  visible: boolean
  /** 当前选中的切图项 */
  item: IQueueItem | null
}>()

defineEmits<{
  /** 关闭弹窗 */
  (e: 'close'): void
}>()

/** 卷帘滑块位置百分比 (0 - 100) */
const curtainPercent = ref(50)

/** 视口容器 DOM 引用 */
const viewportRef = ref<HTMLElement | null>(null)

/** 切图原始物理像素宽度 */
const naturalWidth = ref(0)
/** 切图原始物理像素高度 */
const naturalHeight = ref(0)

/** 当前画面缩放比例 (0.1 ~ 8.0) */
const scale = ref(1.0)
/** 画面平移 X 坐标 (px) */
const panX = ref(0)
/** 画面平移 Y 坐标 (px) */
const panY = ref(0)

/** 记录自适应视口的缩放比例，便于高亮状态判定 */
const fitScale = ref(1.0)

/** 是否正在拖拽平移画布 */
const isPanning = ref(false)
/** 是否正在拖拽调整卷帘中线 */
const isDividing = ref(false)

/** 鼠标按下时的初始屏幕坐标 */
const startMousePos = { x: 0, y: 0 }
/** 鼠标按下时的初始平移坐标 */
const startPanPos = { x: 0, y: 0 }

/**
 * 判断当前是否为卷帘比对模式
 * 规则：仅当切图开启了压缩、未发生超时保底、且产生了实际体积减少时才显示对比卷帘
 */
const isCompareMode = computed(() => {
  const item = props.item
  if (!item) return false
  // 未启用压缩
  if (!item.enableCompress) return false
  // 超时熔断或异常保底原图
  if (item.isFallback || item.compressStatus === 'FAIL') return false
  // 存在真实的优化产物，且体积切实减少
  if (typeof item.compressedSize === 'number' && item.compressedSize > 0 && item.compressedSize < item.fileSize) {
    return true
  }
  return false
})

/**
 * 大图预览模式下的状态保障徽章
 */
const viewerStatusBadge = computed(() => {
  const item = props.item
  if (!item) return null
  // 云端已归档的正式资产 (无本地 File 对象且状态为 SUCCESS)
  if (!item.file && item.status === 'SUCCESS') {
    return {
      type: 'success',
      label: '💎 云端资产 (已正式归档)',
    }
  }
  // 超时熔断或异常保底
  if (item.isFallback || item.compressStatus === 'FAIL') {
    return {
      type: 'warning',
      label: '🛡️ 保底原图 (测算超时，100% 原画保真)',
    }
  }
  // 未启用压缩
  if (!item.enableCompress) {
    return {
      type: 'neutral',
      label: '⚪ 原始切图 (未开启压缩)',
    }
  }
  // 原画无损直通或优化后体积无差异
  return {
    type: 'success',
    label: '💎 原画最高画质 (无需量化，已为最优)',
  }
})

/**
 * 是否处于“适应窗口”比例状态
 */
const isFitActive = computed(() => {
  return Math.abs(scale.value - fitScale.value) < 0.01
})

/**
 * 舞台变换样式 (双图层绝对锁定在相同几何矩阵下)
 */
const stageStyle = computed(() => {
  // 如果尚未获取图片尺寸，使用默认宽高
  const w = naturalWidth.value > 0 ? `${naturalWidth.value}px` : 'auto'
  const h = naturalHeight.value > 0 ? `${naturalHeight.value}px` : 'auto'
  return {
    width: w,
    height: h,
    transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${scale.value})`,
    transformOrigin: '0 0',
  }
})

/**
 * 舞台缩放的几何倒数 (反向缩放比例)
 * 用于让卷帘分割线宽度与拖拽手柄尺寸在缩放时保持物理视觉恒定
 */
const invScale = computed(() => {
  return scale.value > 0 ? Number((1 / scale.value).toFixed(4)) : 1
})

/**
 * 动态计算右侧压缩大小与节省比例
 */
const compInfo = computed(() => {
  const item = props.item
  if (!item) return { optSize: 0, savedPercent: 0, isMeasuring: false }

  // 存在真实的客户端压缩产物
  if (typeof item.compressedSize === 'number') {
    const finalSize = item.compressedSize > 0 ? item.compressedSize : item.fileSize
    const saved = Math.max(0, item.fileSize - finalSize)
    const savedPercent = item.fileSize > 0 ? Math.round((saved / item.fileSize) * 100) : 0
    return {
      optSize: finalSize,
      savedPercent,
      isMeasuring: false,
    }
  }

  // 若关闭压缩选项
  if (!item.enableCompress) {
    return {
      optSize: item.fileSize,
      savedPercent: 0,
      isMeasuring: false,
    }
  }

  // 正在测量中
  return {
    optSize: item.fileSize,
    savedPercent: 0,
    isMeasuring: true,
  }
})

/**
 * 图片加载完成回调，提取真实物理像素并初始化自适应居中
 * @param {Event} e - 图片加载事件
 */
function handleImageLoad(e: Event) {
  const target = e.target as HTMLImageElement
  if (!target) return
  naturalWidth.value = target.naturalWidth || target.width
  naturalHeight.value = target.naturalHeight || target.height
  fitToScreen()
}

/**
 * 一键自适应视口大小居中展示
 */
function fitToScreen() {
  if (!viewportRef.value || naturalWidth.value <= 0 || naturalHeight.value <= 0) return
  const rect = viewportRef.value.getBoundingClientRect()
  // 保留边距安全区
  const padding = 32
  const availableW = Math.max(50, rect.width - padding)
  const availableH = Math.max(50, rect.height - padding)

  // 计算适合视口的最大比例（不超过 1.0）
  const scaleW = availableW / naturalWidth.value
  const scaleH = availableH / naturalHeight.value
  const targetScale = Math.min(scaleW, scaleH, 1.0)

  fitScale.value = targetScale
  scale.value = targetScale

  // 计算居中平移坐标
  panX.value = Math.round((rect.width - naturalWidth.value * targetScale) / 2)
  panY.value = Math.round((rect.height - naturalHeight.value * targetScale) / 2)
}

/**
 * 一键重置为 1:1 原始物理分辨率 (100%)
 */
function resetTo100() {
  if (!viewportRef.value || naturalWidth.value <= 0 || naturalHeight.value <= 0) return
  const rect = viewportRef.value.getBoundingClientRect()
  scale.value = 1.0
  // 1:1 居中显示
  panX.value = Math.round((rect.width - naturalWidth.value) / 2)
  panY.value = Math.round((rect.height - naturalHeight.value) / 2)
}

/**
 * 快捷步进缩放
 * @param {number} delta - 缩放增量
 */
function handleZoomStep(delta: number) {
  if (!viewportRef.value || naturalWidth.value <= 0) return
  const rect = viewportRef.value.getBoundingClientRect()
  // 以视口中心为锚点
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  applyZoomAt(centerX, centerY, scale.value + delta)
}

/**
 * 鼠标滚轮中心锚点平滑缩放
 * @param {WheelEvent} e - 滚轮事件
 */
function handleWheel(e: WheelEvent) {
  if (!viewportRef.value || naturalWidth.value <= 0) return
  const rect = viewportRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  // 缩放平滑系数
  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
  const targetScale = scale.value * zoomFactor
  applyZoomAt(mouseX, mouseY, targetScale)
}

/**
 * 以指定视口坐标为几何锚点进行缩放计算
 * @param {number} anchorX - 锚点 X
 * @param {number} anchorY - 锚点 Y
 * @param {number} targetScale - 目标缩放比例
 */
function applyZoomAt(anchorX: number, anchorY: number, targetScale: number) {
  // 限制缩放区间为 10% ~ 800%
  const clampedScale = Math.min(Math.max(targetScale, 0.1), 8.0)
  const currentScale = scale.value
  if (Math.abs(clampedScale - currentScale) < 0.001) return

  // 几何推导逆运算，保证锚点所在像素在缩放后相对鼠标位置保持不动
  const ratio = clampedScale / currentScale
  panX.value = Math.round(anchorX - (anchorX - panX.value) * ratio)
  panY.value = Math.round(anchorY - (anchorY - panY.value) * ratio)
  scale.value = clampedScale
}

/**
 * 鼠标按下画布触发平移拖拽
 * @param {MouseEvent} e - 鼠标事件
 */
function handleMouseDown(e: MouseEvent) {
  // 仅响应鼠标左键按下
  if (e.button !== 0) return
  isPanning.value = true
  startMousePos.x = e.clientX
  startMousePos.y = e.clientY
  startPanPos.x = panX.value
  startPanPos.y = panY.value
}

/**
 * 开始拖拽卷帘中线分割把手
 * @param {MouseEvent} e - 鼠标事件
 */
function handleStartDivideDrag(e: MouseEvent) {
  isDividing.value = true
  updateCurtainFromClientX(e.clientX)
}

/**
 * 根据鼠标在舞台中的相对位置计算卷帘百分比
 * @param {number} clientX - 鼠标横坐标
 */
function updateCurtainFromClientX(clientX: number) {
  if (!viewportRef.value || naturalWidth.value <= 0) return
  const rect = viewportRef.value.getBoundingClientRect()
  const mouseInViewportX = clientX - rect.left

  // 舞台在当前视口中的真实位置与宽度
  const stageRenderLeft = panX.value
  const stageRenderWidth = naturalWidth.value * scale.value
  if (stageRenderWidth <= 0) return

  const offsetInStage = mouseInViewportX - stageRenderLeft
  const percent = Math.round((offsetInStage / stageRenderWidth) * 100)
  curtainPercent.value = Math.max(0, Math.min(100, percent))
}

/**
 * 双击视口快捷切换自适应与 1:1 视图
 */
function handleDoubleClick() {
  if (isFitActive.value) {
    resetTo100()
  } else {
    fitToScreen()
  }
}

/**
 * 全局鼠标移动监听
 * @param {MouseEvent} e - 鼠标事件
 */
function handleGlobalMouseMove(e: MouseEvent) {
  // 拖动卷帘把手
  if (isDividing.value) {
    updateCurtainFromClientX(e.clientX)
    return
  }
  // 平移拖动画布
  if (isPanning.value) {
    panX.value = startPanPos.x + (e.clientX - startMousePos.x)
    panY.value = startPanPos.y + (e.clientY - startMousePos.y)
  }
}

/**
 * 全局鼠标按键释放监听
 */
function handleGlobalMouseUp() {
  isDividing.value = false
  isPanning.value = false
}

// 监听弹窗显示与切图对象切换，及时重置视图状态
watch(
  () => [props.visible, props.item?.id],
  async ([vis]) => {
    if (vis) {
      curtainPercent.value = 50
      await nextTick()
      fitToScreen()
    }
  }
)

onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', handleGlobalMouseUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
})
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(9, 13, 22, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.modal-card {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  width: calc(100vw - 16px);
  height: calc(100vh - 16px);
  max-width: none;
  box-shadow: 0 16px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 8px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-header h4 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-title);
  margin: 0;
}

.modal-file-badge {
  font-family: var(--font-code);
  font-size: 12px;
  color: var(--text-regular);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 8px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.status-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  letter-spacing: 0.2px;
}

.status-pill.warning {
  background: rgba(217, 119, 6, 0.12);
  color: #b45309;
  border: 1px solid rgba(217, 119, 6, 0.25);
}

.status-pill.success {
  background: rgba(0, 163, 79, 0.12);
  color: #008741;
  border: 1px solid rgba(0, 163, 79, 0.25);
}

.status-pill.neutral {
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  border: 1px solid rgba(100, 116, 139, 0.2);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-title);
}

.modal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px 12px;
}

.modal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.modal-tip {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.quick-split-tabs {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px;
  border-radius: 6px;
  gap: 2px;
}

.split-tab {
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s ease;
}

.split-tab.active {
  background: #ffffff;
  color: var(--text-title);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* 视口主容器 */
.curtain-container {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  user-select: none;
  border: 1px solid rgba(0, 0, 0, 0.08);
  position: relative;
  cursor: grab;
}

.curtain-container.is-panning {
  cursor: grabbing !important;
}

.curtain-container.is-dividing {
  cursor: ew-resize !important;
}

/* 舞台画布：承载变换与严格对齐的两图 */
.stage-canvas {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.stage-layer {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.stage-img {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

/* 卷帘分割中线容器 (定位在图片舞台坐标系中，0 宽不挤占舞台空间) */
.stage-divider {
  position: absolute;
  top: 0; 
  bottom: 0;
  width: 0;
  cursor: ew-resize;
  z-index: 10;
  pointer-events: auto;
}

/* 扩展全线感应拖拽区 (整条垂直线左右各 12px 均可直接按住拖拽，无需强行点击正中心手柄) */
.stage-divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -12px;
  width: 24px;
  cursor: ew-resize;
  pointer-events: auto;
}

/* 物理恒定纤细中线 (反向水平缩放保持视觉 1.5px 锐利发光线宽，绝不随大图放大变粗) */
.stage-divider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -1px;
  width: 2px;
  background: #ffffff;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.45);
  transform: scaleX(var(--inv-scale, 1));
  transform-origin: center center;
  pointer-events: none;
}

/* 卷帘手柄：恒定 24px 紧凑直径，反向等比缩放，半透通光毛玻璃质感彻底杜绝挡住小图 */
.stage-handle-knob {
  position: absolute;
  top: 50%; 
  left: 0;
  transform: translate(-50%, -50%) scale(var(--inv-scale, 1));
  transform-origin: center center;
  width: 24px; 
  height: 24px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease;
  pointer-events: auto;
  cursor: ew-resize;
}

.stage-handle-knob:hover {
  background: rgba(15, 23, 42, 0.9);
  border-color: #ffffff;
}

/* 拖拽比对时激活幽灵避让态：手柄淡出半透明，将 100% 视觉焦点还给左右切图的像素细节 */
.stage-divider.is-dragging .stage-handle-knob,
.curtain-container.is-dividing .stage-handle-knob {
  opacity: 0.18;
}

/* 浮动徽章：左右原图与压缩尺寸 */
.curtain-floating-badge {
  position: absolute;
  bottom: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  pointer-events: none;
}

.badge-left {
  left: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-title);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.badge-right {
  right: 14px;
  background: rgba(0, 163, 79, 0.92);
  color: #ffffff;
  border: 1px solid rgba(0, 163, 79, 0.3);
}

.badge-title {
  font-weight: 500;
  opacity: 0.85;
}

.badge-val {
  font-family: var(--font-code);
  font-weight: 700;
}

.badge-ratio {
  margin-left: 2px;
}

/* Apple 高透毛玻璃悬浮缩放控制器 */
.zoom-toolbar {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 15;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border-radius: 20px;
}

.zoom-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-regular);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
}

.zoom-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-title);
}

.zoom-text {
  font-family: var(--font-code);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-title);
  padding: 0 4px;
  min-width: 42px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}

.zoom-text:hover {
  color: #00a34f;
}

.zoom-divider {
  width: 1px;
  height: 14px;
  background: rgba(0, 0, 0, 0.1);
  margin: 0 2px;
}

.zoom-action-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-regular);
  padding: 3px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.zoom-action-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-title);
}

.zoom-action-btn.active {
  background: #00a34f;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 163, 79, 0.3);
}

/* 棋盘透明底纹 */
.checker-board {
  background-image: 
    linear-gradient(45deg, #f0f0f0 25%, transparent 25%), 
    linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #f0f0f0 75%), 
    linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-color: #fafafa;
}
</style>
