<template>
  <div class="queue-toolbar">
    <div class="toolbar-left">
      <div class="heading-group">
        <h3 class="queue-heading">任务队列</h3>
        <span class="queue-pill" :class="queuePillClass">{{ queuePillText }}</span>
      </div>

      <!-- 双轨制环境选择器 (测试沙箱 / 生产线上 / 未配置) -->
      <AppleSelect 
        prefix-label="环境"
        :model-value="activeTargetId"
        :options="targetOptions"
        :disabled="isUploading || !isCosConfigured"
        @change="(val) => handleTargetChange(val as any)"
      />

      <!-- 目标上传目录微面板 -->
      <!-- 模式 0：未配置外部 targets 目标预设 -->
      <div 
        v-if="!currentCosTarget" 
        class="dir-capsule unconfigured" 
        title="尚未在 app-config.js 中配置有效存储桶，请先完善配置"
      >
        <span class="dir-icon">⚠️</span>
        <span class="dir-path">未配置目录</span>
      </div>

      <!-- 模式 A：测试沙箱 (锁定在 dsxcx/temp 隔离目录，不可污染线上) -->
      <div 
        v-else-if="currentCosTarget.env === 'test'" 
        class="dir-capsule readonly" 
        title="测试临时沙箱模式，切图统一上传至 dsxcx/temp/ 目录，后续由管理员批量清理"
      >
        <span class="dir-icon">📁</span>
        <span class="dir-path">dsxcx/temp/</span>
        <span class="dir-badge test">沙箱隔离</span>
      </div>

      <!-- 模式 B：生产线上 (支持常用业务文件夹快捷下拉与自定义子目录键入) -->
      <div 
        v-else 
        ref="dirCapsuleRef"
        class="dir-capsule editable"
        :class="{ active: isDirMenuOpen }"
        @click="toggleDirMenu"
        title="点击切换团队常用文件夹或输入自定义业务子目录"
      >
        <span class="dir-icon">📁</span>
        <span class="dir-label">COS目录:</span>
        <span class="dir-path" :title="prodUploadDir">{{ prodUploadDir }}</span>
        <svg class="chevron-arrow" :class="{ rotated: isDirMenuOpen }" viewBox="0 0 12 12" width="12" height="12">
          <path d="M2.5 4.5L6 8L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>

        <!-- 生产常用文件夹下拉与自由输入面板 -->
        <transition name="popover-fade">
          <div v-if="isDirMenuOpen" class="dir-dropdown-panel" @click.stop>
            <div class="dir-panel-header">
              <span>团队生产目标目录</span>
            </div>
            <!-- 自定义路径输入框 -->
            <div class="dir-input-row">
              <input 
                ref="dirInputRef"
                v-model="tempInputText" 
                type="text" 
                placeholder="输入或修改路径，如 dsxcx/images/member"
                class="dir-custom-input"
                @keydown.enter="handleApplyCustomDir"
              />
              <button class="dir-apply-btn" @click="handleApplyCustomDir">
                应用
              </button>
            </div>

            <!-- 常用预设快捷选项 -->
            <div class="dir-section-title">常用业务文件夹</div>
            <div class="dir-preset-list">
              <div 
                v-for="folder in PROD_DIR_PRESETS" 
                :key="folder" 
                class="dir-preset-item"
                :class="{ selected: folder === prodUploadDir }"
                @click="handleSelectFolder(folder)"
              >
                <span class="folder-name">{{ folder }}</span>
                <span v-if="folder === prodUploadDir" class="check-mark">✓</span>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- 2. 右侧：高能行动区与压缩偏好微面板 (降噪收拢，主次分明) -->
    <div class="toolbar-right">
      <!-- 偏好设置气泡微胶囊 (将画质与超时收拢于此，降低界面杂乱度) -->
      <div ref="prefCapsuleRef" class="pref-popover-container">
        <button 
          class="pref-trigger-btn" 
          :class="{ active: isPrefMenuOpen, disabled: isUploading }"
          :disabled="isUploading"
          @click="togglePrefMenu"
          title="点击调整压缩画质与超时熔断偏好"
        >
          <!-- 精致标准矢量调节齿轮图标 (绝对同心严格对称) -->
          <svg class="pref-gear-icon" viewBox="0 0 24 24" width="13.5" height="13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span class="pref-summary">
            <span class="pref-quality-tag">{{ currentQualityText }}</span>
            <span class="pref-dot-divider">·</span>
            <span class="pref-timeout-tag">{{ timeoutSeconds }}s</span>
          </span>
          <svg class="chevron-arrow" :class="{ rotated: isPrefMenuOpen }" viewBox="0 0 12 12" width="11" height="11">
            <path d="M2.5 4.5L6 8L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <!-- 偏好设置悬浮气泡面板 -->
        <transition name="popover-fade">
          <div v-if="isPrefMenuOpen" class="pref-dropdown-panel" @click.stop>
            <div class="pref-panel-section">
              <div class="pref-section-header">
                <span>压缩画质模式</span>
              </div>
              <div class="pref-option-pills">
                <button 
                  v-for="opt in qualityOptions" 
                  :key="opt.value"
                  class="pref-pill-btn"
                  :class="{ active: opt.value === quality }"
                  @click="handleSelectQuality(Number(opt.value))"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div class="pref-panel-divider"></div>

            <div class="pref-panel-section">
              <div class="pref-section-header">
                <span>单图超时熔断时长</span>
              </div>
              <div class="pref-option-pills">
                <button 
                  v-for="opt in timeoutOptions" 
                  :key="opt.value"
                  class="pref-pill-btn"
                  :class="{ active: opt.value === timeoutSeconds }"
                  @click="handleSelectTimeout(Number(opt.value))"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- 免上传离线下载按钮 -->
      <button 
        class="apple-btn apple-btn-secondary" 
        :disabled="totalCount === 0 || isUploading"
        @click="$emit('download-all')"
        title="直接批量下载当前队列中已测算压缩的切图文件（无需上传 COS）"
      >
        <span>下载全部</span>
      </button>

      <!-- 清空队列按钮 -->
      <button 
        class="apple-btn apple-btn-secondary" 
        :disabled="totalCount === 0 || isUploading"
        @click="$emit('clear-queue')"
      >
        <span>清空队列</span>
      </button>

      <!-- 开始上传主要操作按钮 (柔和暮山黛) -->
      <button 
        class="apple-btn apple-btn-primary" 
        :disabled="isUploading || totalCount === 0 || isAllSuccess || !isCosConfigured"
        :title="!isCosConfigured ? '未检测到存储桶配置，请在 app-config.js 中配置 targets' : ''"
        @click="$emit('start-upload')"
      >
        <span v-if="!isCosConfigured">未配置环境</span>
        <span v-else-if="isUploading">正在上传...</span>
        <span v-else-if="isAllSuccess">已全部上传</span>
        <span v-else>开始上传</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AppleSelect, { type ISelectOption } from './AppleSelect.vue'
import type { IQueueItem } from '../types/asset'
import { 
  activeTargetId, 
  setCosTarget, 
  COS_TARGET_PRESETS, 
  currentCosTarget,
  prodUploadDir,
  setProdUploadDir,
  PROD_DIR_PRESETS,
  isCosConfigured,
} from '../config/cosTargets'

const props = withDefaults(
  defineProps<{
    /** 队列中待处理的文件数 */
    count: number
    /** 完整的任务队列列表 (用于精准统计动态生命周期) */
    items?: IQueueItem[]
    /** 是否正在直传中 */
    isUploading: boolean
    /** 当前全局压缩画质 (0.1 ~ 1.0，默认 0.85) */
    quality?: number
    /** 当前单图超时熔断秒数 (默认 30 秒) */
    timeoutSeconds?: number
  }>(),
  {
    count: 0,
    items: () => [],
    quality: 0.85,
    timeoutSeconds: 30,
  }
)

/** 队列总数（优先取 items 长度，若未传 items 则回退 props.count） */
const totalCount = computed(() => {
  if (props.items && props.items.length > 0) {
    return props.items.length
  }
  return props.count
})

/** 上传成功的切图数 */
const successCount = computed(() => {
  if (!props.items) return 0
  return props.items.filter((i) => i.status === 'SUCCESS').length
})

/** 上传失败的切图数 */
const failCount = computed(() => {
  if (!props.items) return 0
  return props.items.filter((i) => i.status === 'FAIL').length
})

/** 是否队列全部上传成功 */
const isAllSuccess = computed(() => {
  return totalCount.value > 0 && successCount.value === totalCount.value
})

/**
 * 动态计算任务队列胶囊展示文本 (方案 A)
 */
const queuePillText = computed(() => {
  // 队列为空
  if (totalCount.value === 0) {
    return '0 项'
  }

  // 1. 正在上传中
  if (props.isUploading) {
    if (successCount.value > 0) {
      return `上传中 ${successCount.value}/${totalCount.value}`
    }
    return '正在上传...'
  }

  // 2. 存在上传失败异常
  if (failCount.value > 0) {
    if (successCount.value > 0) {
      return `${failCount.value} 项失败 · ${successCount.value} 项完成`
    }
    return `${failCount.value} 项失败`
  }

  // 3. 全部上传成功
  if (isAllSuccess.value) {
    return `✓ 全部已完成 (${totalCount.value})`
  }

  // 4. 部分完成（混合状态）
  if (successCount.value > 0) {
    return `已完成 ${successCount.value}/${totalCount.value}`
  }

  // 5. 待上传就绪态
  return `共 ${totalCount.value} 项`
})

/**
 * 动态计算任务队列胶囊的微样式类名
 */
const queuePillClass = computed(() => {
  if (totalCount.value === 0) return ''
  if (props.isUploading) return 'uploading'
  if (failCount.value > 0) return 'fail'
  if (isAllSuccess.value) return 'success'
  return ''
})

const emit = defineEmits<{
  /** 清空当前任务队列 */
  (e: 'clear-queue'): void
  /** 开始上传 */
  (e: 'start-upload'): void
  /** 切换全局压缩画质 */
  (e: 'change-quality', quality: number): void
  /** 切换单图压缩超时秒数 */
  (e: 'change-timeout', seconds: number): void
  /** 批量下载队列切图 */
  (e: 'download-all'): void
}>()

/** 存储桶环境预设选项集合 (动态感知外部配置的所有环境) */
const targetOptions = computed<ISelectOption[]>(() => {
  // 如果未配置任何目标预设，展示未配置提示选项
  if (!isCosConfigured.value || COS_TARGET_PRESETS.length === 0) {
    return [{ label: '未配置环境', value: '' }]
  }

  return COS_TARGET_PRESETS.map((p) => {
    // 优先提取简短友好的展示标签
    let shortLabel = p.label
    // 如果标签形如 "🚀 【生产线上】微信小程序主图床"，提取简写 "🚀 生产线上" 保持下拉美观
    const match = p.label.match(/^(.*?)(?:【(.*?)】)?(.*)$/)
    if (match && match[2]) {
      const emoji = (match[1] || '').trim()
      shortLabel = emoji ? `${emoji} ${match[2]}` : match[2]
    }
    return {
      label: shortLabel || p.label || p.id,
      value: p.id,
    }
  })
})

/**
 * 处理环境切换动作
 * @param {string} targetId - 目标预设标识
 */
function handleTargetChange(targetId: string) {
  setCosTarget(targetId)
  // 切换环境后自动关闭目录面板
  isDirMenuOpen.value = false
}

// ----------------------------------------------------
// 生产环境目录选择与自定义输入控制器
// ----------------------------------------------------
const dirCapsuleRef = ref<HTMLElement | null>(null)
const isDirMenuOpen = ref(false)
const tempInputText = ref(prodUploadDir.value)

/** 切换目录面板展开状态 */
function toggleDirMenu() {
  if (props.isUploading) return
  isDirMenuOpen.value = !isDirMenuOpen.value
  if (isDirMenuOpen.value) {
    tempInputText.value = prodUploadDir.value
  }
}

/** 选择常用文件夹 */
function handleSelectFolder(folder: string) {
  setProdUploadDir(folder)
  tempInputText.value = folder
  isDirMenuOpen.value = false
}

/** 应用手动键入的自定义子路径 */
function handleApplyCustomDir() {
  if (tempInputText.value.trim()) {
    setProdUploadDir(tempInputText.value)
    isDirMenuOpen.value = false
  }
}

// ----------------------------------------------------
// 偏好设置 (画质与超时收拢) Popover 控制器
// ----------------------------------------------------
const prefCapsuleRef = ref<HTMLElement | null>(null)
const isPrefMenuOpen = ref(false)

/** 画质选项集合 */
const qualityOptions: ISelectOption[] = [
  { label: '💎 原画 (1.0)', value: 1.0 },
  { label: '⚡ 均衡 (85%)', value: 0.85 },
  { label: '📦 极小 (70%)', value: 0.70 },
]

/** 超时熔断时长选项集合 */
const timeoutOptions: ISelectOption[] = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
]

/** 切换偏好气泡面板 */
function togglePrefMenu() {
  if (props.isUploading) return
  isPrefMenuOpen.value = !isPrefMenuOpen.value
}

/** 选择画质模式 */
function handleSelectQuality(val: number) {
  emit('change-quality', val)
}

/** 选择超时熔断时间 */
function handleSelectTimeout(val: number) {
  emit('change-timeout', val)
}

/** 当前画质简短显示文本 */
const currentQualityText = computed(() => {
  if (props.quality >= 0.98) return '原画无损'
  if (props.quality >= 0.80) return '极致均衡'
  return '极限体积'
})

// ----------------------------------------------------
// 全局点击外部自动收起 Popover
// ----------------------------------------------------
function handleDocumentClick(e: MouseEvent) {
  const target = e.target as Node
  // 点击目录面板外部时收起
  if (dirCapsuleRef.value && !dirCapsuleRef.value.contains(target)) {
    isDirMenuOpen.value = false
  }
  // 点击偏好设置外部时收起
  if (prefCapsuleRef.value && !prefCapsuleRef.value.contains(target)) {
    isPrefMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped>
.queue-toolbar {
  position: relative;
  z-index: 50;
  margin-top: 36px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

/* ================= 左侧上下文区 ================= */
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.heading-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.queue-heading {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-main);
  margin: 0;
}

.queue-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
  padding: 2px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 上传中：柔和科技蓝 */
.queue-pill.uploading {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.18);
  color: #2563eb;
  font-weight: 600;
}

/* 全部已完成：柔和翡翠绿 */
.queue-pill.success {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.2);
  color: #047857;
  font-weight: 600;
}

/* 异常失败：柔和警告红 */
.queue-pill.fail {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
  color: #dc2626;
  font-weight: 600;
}

/* 目录展示与控制器胶囊 */
.dir-capsule {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dir-capsule.unconfigured {
  background: rgba(245, 158, 11, 0.08);
  border: 1px dashed rgba(245, 158, 11, 0.35);
  color: #b45309;
  cursor: not-allowed;
}

.dir-capsule.readonly {
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.18);
  color: #047857;
  cursor: default;
}

.dir-capsule.readonly .dir-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
}

.dir-capsule.readonly .dir-badge {
  font-size: 10px;
  background: rgba(16, 185, 129, 0.15);
  padding: 1px 6px;
  border-radius: 6px;
  font-weight: 600;
}

.dir-capsule.editable {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  color: var(--text-main);
  cursor: pointer;
  z-index: 10;
}

.dir-capsule.editable:hover {
  background: #ffffff;
  border-color: rgba(15, 118, 110, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.dir-capsule.editable.active {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
  z-index: 500; /* 激活时大幅提升层叠上下文，绝对凌驾于表格之上 */
}

.dir-label {
  color: var(--text-muted);
  font-size: 11px;
}

.dir-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-main);
}

.chevron-arrow {
  color: var(--text-muted);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.chevron-arrow.rotated {
  transform: rotate(180deg);
}

/* 生产目录下拉悬浮面板 */
.dir-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 320px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.06);
  padding: 14px;
  z-index: 600; /* 高层级确保绝对不被下方遮挡 */
  cursor: default;
}

.dir-panel-header {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}

.dir-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.dir-custom-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  outline: none;
  color: var(--text-main);
  transition: border-color 0.2s;
}

.dir-custom-input:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
}

.dir-apply-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--btn-primary-bg, #111827);
  color: #fff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.dir-apply-btn:hover {
  opacity: 0.9;
}

.dir-section-title {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
  font-weight: 600;
}

.dir-preset-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.dir-preset-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: var(--text-main);
  cursor: pointer;
  transition: background 0.15s;
}

.dir-preset-item:hover {
  background: rgba(15, 118, 110, 0.08);
}

.dir-preset-item.selected {
  background: rgba(15, 118, 110, 0.12);
  color: #0f766e;
  font-weight: 700;
}

.check-mark {
  font-weight: bold;
  color: #0f766e;
}

/* ================= 右侧高能行动区 ================= */
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 偏好设置气泡容器 */
.pref-popover-container {
  position: relative;
  z-index: 10;
}

/* 偏好设置触发胶囊按钮：采用晶透温润白晶底与品牌生机绿悬停/激活态 */
.pref-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-md, 10px);
  background: var(--btn-secondary-bg, rgba(255, 255, 255, 0.75));
  border: var(--btn-secondary-border, 1px solid rgba(0, 0, 0, 0.08));
  box-shadow: var(--btn-secondary-shadow, 0 1px 3px rgba(0, 0, 0, 0.04));
  font-size: 12px;
  font-weight: 500;
  color: var(--text-main, #222222);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 悬停态：边框泛起品牌生机绿微晕 */
.pref-trigger-btn:hover:not(:disabled) {
  background: #ffffff;
  border-color: rgba(0, 163, 79, 0.35);
  box-shadow: 0 2px 8px rgba(0, 163, 79, 0.08);
}

/* 展开激活态：品牌主色聚焦光环 */
.pref-trigger-btn.active {
  background: #ffffff;
  border-color: var(--brand-primary, #00A34F);
  box-shadow: 0 0 0 3px rgba(0, 163, 79, 0.12);
  z-index: 500;
}

/* 禁用态 */
.pref-trigger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 精致矢量齿轮图标微动效 (绝对同心几何居中) */
.pref-gear-icon {
  display: block;
  color: var(--text-muted, #666666);
  flex-shrink: 0;
  transform-origin: center;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s ease;
}

.pref-trigger-btn:hover:not(:disabled) .pref-gear-icon {
  color: var(--brand-primary, #00A34F);
}

.pref-trigger-btn.active .pref-gear-icon {
  color: var(--brand-primary, #00A34F);
  transform: rotate(45deg);
}

/* 激活态箭头着色 */
.pref-trigger-btn.active .chevron-arrow {
  color: var(--brand-primary, #00A34F);
}

/* 按钮文字排版 */
.pref-summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  letter-spacing: -0.2px;
}

.pref-quality-tag {
  color: var(--text-main, #222222);
  font-weight: 600;
}

.pref-dot-divider {
  color: var(--text-light, #999999);
  font-weight: 300;
  user-select: none;
}

.pref-timeout-tag {
  color: var(--text-muted, #666666);
  font-family: var(--font-code, monospace);
  font-size: 11.5px;
  font-weight: 500;
}

.pref-trigger-btn.active .pref-timeout-tag {
  color: var(--brand-hover, #008C3C);
}

/* 偏好设置展开悬浮卡片：Apple 级通透液态微晶毛玻璃 */
.pref-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(24px) saturate(190%) contrast(102%);
  -webkit-backdrop-filter: blur(24px) saturate(190%) contrast(102%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 
    0 16px 36px -4px rgba(0, 0, 0, 0.14),
    0 4px 12px -2px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.8);
  padding: 14px;
  z-index: 600;
}

.pref-panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 分区标题：纯净左边缘对齐 */
.pref-section-header {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted, #666666);
  letter-spacing: 0.2px;
}

/* 分段控件底槽：防溢出 minmax 约束 */
.pref-option-pills {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  background: rgba(0, 0, 0, 0.04);
  padding: 3px;
  border-radius: 9px;
  box-sizing: border-box;
}

/* 分段选项按钮：Apple 级悬浮滑块质感 */
.pref-pill-btn {
  min-width: 0;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-regular, #4b5563);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

/* 选项悬停态 */
.pref-pill-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-main, #222222);
}

/* 选项激活态：纯白微浮雕卡片 + 品牌深绿字，无冲突多余描边，边缘极度纯净利落 */
.pref-pill-btn.active {
  background: #ffffff;
  color: var(--brand-hover, #008C3C);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.08);
}

/* 点击按压反馈 */
.pref-pill-btn:active {
  transform: scale(0.96);
}

/* 柔和渐隐分割线 */
.pref-panel-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.06) 15%, rgba(0, 0, 0, 0.06) 85%, transparent);
  margin: 12px 0;
}

/* ================= 按钮基类 ================= */
.apple-btn {
  height: 34px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.2px;
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.apple-btn:active {
  transform: scale(0.98);
}

.apple-btn-primary {
  background: var(--btn-primary-bg, #111827);
  color: var(--btn-primary-text, #fff);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: var(--btn-primary-shadow, 0 4px 12px rgba(0, 0, 0, 0.1));
}

.apple-btn-primary:hover:not(:disabled) {
  background: var(--btn-primary-hover, #1f2937);
  transform: translateY(-1px);
}

.apple-btn-primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.apple-btn-secondary {
  background: var(--btn-secondary-bg, rgba(255, 255, 255, 0.8));
  color: var(--btn-secondary-text, #374151);
  border: var(--btn-secondary-border, 1px solid rgba(0, 0, 0, 0.08));
  box-shadow: var(--btn-secondary-shadow, 0 1px 3px rgba(0, 0, 0, 0.04));
}

.apple-btn-secondary:hover:not(:disabled) {
  background: var(--btn-secondary-hover, rgba(255, 255, 255, 0.95));
  border-color: rgba(15, 118, 110, 0.2);
  transform: translateY(-1px);
}

.apple-btn-secondary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 动效 */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
</style>
