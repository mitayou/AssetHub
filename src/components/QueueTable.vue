<template>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th style="width: 76px; text-align: center;">缩略图</th>
          <th>切图基本信息</th>
          <th style="width: 200px;">体积与预估</th>
          <th style="width: 110px;">操作属性</th>
          <th style="width: 90px;">处理状态</th>
          <th style="width: 200px; text-align: right;">交付操作</th>
        </tr>
      </thead>
      <tbody>
        <!-- 队列空状态占位提示 -->
        <tr v-if="!list || list.length === 0">
          <td colspan="6" class="empty-cell">
            <div class="empty-state">
              <div class="empty-icon-box">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <p class="empty-title">队列暂无待处理切图</p>
              <p class="empty-desc">支持拖拽、剪贴板粘贴 (Ctrl+V) 或点击上方区域添加切图</p>
            </div>
          </td>
        </tr>

        <!-- 任务列表行 -->
        <tr v-for="(item, idx) in list" :key="item.id">
          <td>
            <div class="thumb-cell checker-board" @click="$emit('open-comparator', item)" title="点击打开画质对比">
              <img :src="item.previewUrl" class="thumb-img" alt="thumb" />
            </div>
          </td>
          <td>
            <div class="file-meta-col">
              <!-- 第一行：本地切图文件名 + 倍率 + 尺寸 -->
              <div class="file-name-line">
                <span class="file-name-text" :title="item.fileName">{{ item.fileName }}</span>
                <span v-if="item.scaleBadge" class="scale-pill">{{ item.scaleBadge }}</span>
                <span class="file-dim-text">
                  {{ formatDimensions(item.dimensions?.width, item.dimensions?.height) }}
                </span>
              </div>

              <!-- 第二行：云端目标文件名展示 (默认MD5，支持点击编辑) -->
              <div v-if="editingItemId !== item.id" class="target-key-line" :class="{ 'is-custom': item.isCustomName }">
                <span class="cloud-icon" title="最终上传至云端的访问路径文件名">☁️</span>
                <span 
                  class="target-key-text" 
                  :class="{ 'custom-text': item.isCustomName, 'readonly': item.status === 'SUCCESS' }"
                  :title="item.status === 'SUCCESS' ? '已上传就绪，不可修改文件名' : (item.isCustomName ? '已指定自定义文件名，点击可重新编辑' : '默认使用文件 MD5 哈希命名，点击可指定覆盖线上旧图')"
                  @click="startEditKey(item)"
                >
                  {{ item.customFileName || (item.rawMd5 ? `${item.rawMd5}.${getFileExt(item.fileName)}` : '计算MD5中...') }}
                </span>

                <!-- 覆盖状态胶囊标签 -->
                <span v-if="item.isCustomName" class="override-pill" title="已开启指定名称覆盖模式">
                  指定覆盖
                </span>

                <!-- 微型编辑按钮 (已就绪状态下自动隐藏) -->
                <button 
                  v-if="item.status !== 'SUCCESS'"
                  class="key-action-btn edit" 
                  :title="item.isCustomName ? '重新编辑自定义名称' : '指定文件名替换线上旧图'" 
                  @click.stop="startEditKey(item)"
                >
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>

                <!-- 恢复默认 MD5 按钮 (已就绪状态下自动隐藏) -->
                <button 
                  v-if="item.isCustomName && item.status !== 'SUCCESS'" 
                  class="key-action-btn reset" 
                  title="恢复为默认 MD5 哈希命名" 
                  @click.stop="resetKeyToDefault(item)"
                >
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <span>恢复MD5</span>
                </button>
              </div>

              <!-- 行内编辑面板 -->
              <div v-else class="key-edit-panel" @click.stop>
                <div class="edit-input-bar">
                  <input 
                    ref="keyInputRef"
                    v-model="editingBaseName"
                    type="text"
                    class="key-edit-input"
                    placeholder="输入指定文件名"
                    @keydown.enter="saveKeyEdit(item)"
                    @keydown.esc="cancelKeyEdit"
                  />
                  <span class="locked-suffix">.{{ getFileExt(item.fileName) }}</span>
                  <div class="edit-btn-group">
                    <button class="edit-btn confirm" title="确认使用 (Enter)" @click="saveKeyEdit(item)">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button class="edit-btn cancel" title="取消 (Esc)" @click="cancelKeyEdit">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
                <!-- 覆盖警示文案 -->
                <div class="edit-warning-tip">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#d97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>覆盖警示：若线上已有同名切图将直接被覆盖，且受 CDN 缓存影响生效可能有延迟</span>
                </div>
              </div>
            </div>
          </td>
          <td>
            <div class="size-flow">
              <span class="raw-size">{{ formatFileSize(item.fileSize) }}</span>
              <!-- 存在真实压缩测量产物且产生了体积缩减 -->
              <template v-if="!getEstimatedSavings(item).isMeasuring && !getEstimatedSavings(item).isFailed && getEstimatedSavings(item).savedPercent > 0">
                <span class="arrow">→</span>
                <span class="comp-size">{{ formatFileSize(getEstimatedSavings(item).optSize) }}</span>
                <span class="save-badge">-{{ getEstimatedSavings(item).savedPercent }}%</span>
              </template>
              <!-- 客户端真实压缩处理中 (阶段化管道进度，带独立倒计时与微动效) -->
              <template v-else-if="getEstimatedSavings(item).isMeasuring">
                <span class="measuring-pill active" :class="item.compressStage?.toLowerCase()">
                  <span class="pill-spinner"></span>
                  <span>{{ getStageLabel(item) }}</span>
                </span>
              </template>
              <!-- 排队等待中 (并发槽位已满，等待调度器唤醒) -->
              <template v-else-if="getEstimatedSavings(item).isWaiting">
                <span class="waiting-pill" title="正在排队等待空闲计算核心">
                  <span class="waiting-dot"></span>
                  <span>排队中</span>
                </span>
              </template>
              <!-- 异常或超时保底原图 (支持用户一键重试) -->
              <template v-else-if="getEstimatedSavings(item).isFailed">
                <span class="optimal-badge fallback" :title="item.compressError || '超时或异常已保底原图'">已保底</span>
                <button 
                  class="retry-measure-btn" 
                  title="点击重新测算压缩" 
                  @click.stop="$emit('retry-compress', item)"
                >
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>重试</span>
                </button>
              </template>
              <!-- 无压缩或已最优 -->
              <template v-else>
                <span class="optimal-badge" title="该切图已处于极致尺寸，保持原图直传">已最优</span>
              </template>
            </div>
          </td>
          <td>
            <!-- 优雅实体微圆点状态指示 -->
            <span v-if="item.operationType === 'CREATE'" class="status-badge create">
              <span class="state-dot green"></span>新增资源
            </span>
            <span v-else-if="item.isSuspectedDuplicate" class="status-badge duplicate" title="疑似重复原图">
              <span class="state-dot amber"></span>疑似重复
            </span>
            <span v-else class="status-badge replace" title="覆盖现有旧图">
              <span class="state-dot rose"></span>覆盖线上
            </span>
          </td>
          <td>
            <!-- 上传中状态：展示专属极光绿高透微磨砂进度条 -->
            <div v-if="item.status === 'UPLOADING'" class="progress-box">
              <div class="progress-track">
                <div 
                  class="progress-bar" 
                  :style="{ width: `${Math.max(5, item.progress || 0)}%` }"
                ></div>
              </div>
              <div class="progress-info">
                <span class="progress-sub">上传中</span>
                <span class="progress-num">{{ item.progress || 0 }}%</span>
              </div>
            </div>

            <!-- 上传成功状态 -->
            <div v-else-if="item.status === 'SUCCESS'" class="status-cell">
              <div class="status-dot success"></div>
              <div class="status-meta">
                <span class="status-text-success">已就绪</span>
              </div>
            </div>

            <!-- 上传失败状态 -->
            <div v-else-if="item.status === 'FAIL'" class="status-cell" :title="item.errorMessage || '上传发生异常'">
              <div class="status-dot fail"></div>
              <div class="status-meta">
                <span class="status-text-fail">上传失败</span>
              </div>
            </div>

            <!-- 默认待上传就绪状态 -->
            <div v-else class="status-cell">
              <div class="status-dot idle"></div>
              <div class="status-meta">
                <span>待上传</span>
              </div>
            </div>
          </td>
          <td style="text-align: right;">
            <!-- 高端极简微按钮组 -->
            <div class="action-group">
              <template v-if="item.status === 'SUCCESS'">
                <button class="table-action-btn" @click="$emit('download-item', item)" title="直接下载本地切图文件">
                  <span>下载</span>
                </button>
                <button class="table-action-btn primary" @click="$emit('copy-url', item.onlineUrl || '')">
                  <span>复制链接</span>
                </button>
                <button class="table-action-btn" @click="$emit('open-code', item)">
                  <span>代码</span>
                </button>
              </template>
              <template v-else>
                <button 
                  class="table-action-btn download-btn" 
                  :disabled="item.compressStatus === 'COMPRESSING'"
                  @click="$emit('download-item', item)" 
                  title="直接下载本地压缩成果（免上传）"
                >
                  <span>下载</span>
                </button>
                <button class="table-action-btn" @click="$emit('open-comparator', item)">
                  <span>对比</span>
                </button>
                <button class="table-action-btn delete" @click="$emit('remove-item', idx)">
                  <span>移除</span>
                </button>
              </template>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { IQueueItem } from '../types/asset'
import { formatFileSize, formatDimensions } from '../utils/format'

/** 当前正在进行行内编辑的目标项 ID */
const editingItemId = ref<string | null>(null)
/** 编辑中的文件名主体（不含扩展名） */
const editingBaseName = ref<string>('')
/** 编辑输入框引用 */
const keyInputRef = ref<HTMLInputElement | null>(null)

/**
 * 获取文件纯扩展名（不含点号，小写）
 * @param {string} fileName - 完整文件名
 * @returns {string} 扩展名
 */
function getFileExt(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'png'
}

/**
 * 开启指定项的云端文件名行内编辑
 * @param {IQueueItem} item - 目标切图项
 */
function startEditKey(item: IQueueItem) {
  // 若切图已上传就绪或正在上传中，禁止开启行内编辑
  if (item.status === 'SUCCESS' || item.status === 'UPLOADING') {
    return
  }
  editingItemId.value = item.id
  const ext = getFileExt(item.fileName)
  if (item.customFileName) {
    // 若已自定义过，提取除去扩展名的主体
    editingBaseName.value = item.customFileName.replace(new RegExp(`\\.${ext}$`, 'i'), '')
  } else if (item.rawMd5) {
    // 默认回填当前 rawMd5
    editingBaseName.value = item.rawMd5
  } else {
    // 若 MD5 尚未计算完成，回填去掉后缀的原图名
    editingBaseName.value = item.fileName.replace(new RegExp(`\\.${ext}$`, 'i'), '')
  }

  nextTick(() => {
    if (keyInputRef.value) {
      keyInputRef.value.focus()
      keyInputRef.value.select()
    }
  })
}

/**
 * 取消当前行内编辑
 */
function cancelKeyEdit() {
  editingItemId.value = null
  editingBaseName.value = ''
}

/**
 * 保存用户输入的自定义文件名并执行防呆与状态联动
 * @param {IQueueItem} item - 目标切图项
 */
function saveKeyEdit(item: IQueueItem) {
  const trimmed = editingBaseName.value.trim()
  const ext = getFileExt(item.fileName)

  // 1. 如果为空，或用户改回了原有的 rawMd5，视为恢复默认
  if (!trimmed || (item.rawMd5 && trimmed.toLowerCase() === item.rawMd5.toLowerCase())) {
    resetKeyToDefault(item)
    cancelKeyEdit()
    return
  }

  // 2. 拼接完整的自定义文件名
  const newCustomName = `${trimmed}.${ext}`
  item.customFileName = newCustomName
  item.isCustomName = true

  // 3. 联动操作属性为“覆盖线上”
  item.operationType = 'REPLACE'
  item.targetReplaceKey = newCustomName

  cancelKeyEdit()
}

/**
 * 将切图项重置恢复为默认 MD5 哈希命名
 * @param {IQueueItem} item - 目标切图项
 */
function resetKeyToDefault(item: IQueueItem) {
  item.customFileName = undefined
  item.isCustomName = false
  item.targetReplaceKey = undefined
  // 恢复原本的操作类型判定 (根据是否查重重复)
  item.operationType = item.isSuspectedDuplicate ? 'REPLACE' : 'CREATE'
}

defineProps<{
  /** 队列表项数据 */
  list: IQueueItem[]
}>()

defineEmits<{
  /** 打开卷帘比对器 */
  (e: 'open-comparator', item: IQueueItem): void
  /** 打开代码生成器 */
  (e: 'open-code', item: IQueueItem): void
  /** 复制图片线上直传链接 */
  (e: 'copy-url', url: string): void
  /** 移除单个队列项 */
  (e: 'remove-item', index: number): void
  /** 用户手动触发单项压缩测算重试 */
  (e: 'retry-compress', item: IQueueItem): void
  /** 直接下载指定条目的切图文件 */
  (e: 'download-item', item: IQueueItem): void
}>()

/**
 * 获取切图真实的客户端量化压缩结果与节省百分比
 * @param {IQueueItem} item - 切图队列项
 * @returns {{ optSize: number; savedPercent: number; isMeasuring: boolean; isWaiting: boolean; isFailed: boolean }} 真实体积与状态
 */
function getEstimatedSavings(item: IQueueItem) {
  // 若未开启压缩开关，或切图已处于上传/成功态，直接退出测算态
  if (!item.enableCompress || item.status === 'SUCCESS' || item.status === 'UPLOADING') {
    const finalSize = typeof item.compressedSize === 'number' ? item.compressedSize : item.fileSize
    const saved = Math.max(0, item.fileSize - finalSize)
    const percent = item.fileSize > 0 ? Math.round((saved / item.fileSize) * 100) : 0
    return {
      optSize: finalSize,
      savedPercent: percent,
      isMeasuring: false,
      isWaiting: false,
      isFailed: false,
    }
  }

  // 1. 处于失败/超时保底状态，允许用户在界面上点击重试
  if (item.compressStatus === 'FAIL') {
    return {
      optSize: item.fileSize,
      savedPercent: 0,
      isMeasuring: false,
      isWaiting: false,
      isFailed: true,
    }
  }

  // 2. 处于显式排队中状态
  if (item.compressStatus === 'WAITING') {
    return {
      optSize: item.fileSize,
      savedPercent: 0,
      isMeasuring: false,
      isWaiting: true,
      isFailed: false,
    }
  }

  // 3. 处于显式测算中状态
  if (item.compressStatus === 'COMPRESSING') {
    return {
      optSize: item.fileSize,
      savedPercent: 0,
      isMeasuring: true,
      isWaiting: false,
      isFailed: false,
    }
  }

  // 4. 存在真实客户端测算产物 (杜绝固定假数据)
  if (typeof item.compressedSize === 'number') {
    const finalSize = item.compressedSize > 0 ? item.compressedSize : item.fileSize
    const saved = Math.max(0, item.fileSize - finalSize)
    const percent = item.fileSize > 0 ? Math.round((saved / item.fileSize) * 100) : 0
    return {
      optSize: finalSize,
      savedPercent: percent,
      isMeasuring: false,
      isWaiting: false,
      isFailed: false,
    }
  }

  return {
    optSize: item.fileSize,
    savedPercent: 0,
    isMeasuring: false,
    isWaiting: false,
    isFailed: false,
  }
}

/**
 * 获取当前测算任务的细分阶段化进度文案
 * @param {IQueueItem} item - 切图队列项
 * @returns {string} 阶段文案
 */
function getStageLabel(item: IQueueItem): string {
  const countdown = typeof item.compressCountdown === 'number' ? `${item.compressCountdown}s` : ''
  switch (item.compressStage) {
    case 'DECODING':
      return '解码中...'
    case 'QUANTIZING':
      return `量化中 ${countdown}`
    case 'OPTIMIZING':
      return '优化中...'
    default:
      return `测算中 ${countdown}`
  }
}
</script>

<style scoped>
.table-card {
  background: var(--glass-nav);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 
    inset 0 1px 0 0 rgba(255, 255, 255, 0.95),
    0 10px 30px -10px rgba(15, 23, 42, 0.04);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  background: rgba(255, 255, 255, 0.35);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  padding: 13px 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.4px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

td {
  padding: 10px;
  font-size: 13px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  vertical-align: middle;
  transition: background 0.18s ease;
}

/* 消除最后一行多余的底边黑线 */
tbody tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: rgba(255, 255, 255, 0.6);
}

.thumb-cell {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s var(--ease-spring);
}

.thumb-cell:hover {
  transform: scale(1.06);
  border-color: var(--brand-primary);
  box-shadow: 0 4px 14px rgba(0, 163, 79, 0.2);
}

.thumb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.file-meta-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 380px;
}

.file-name-text {
  font-weight: 600;
  color: var(--text-title);
  font-size: 13px;
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scale-pill {
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--text-regular);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-code);
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.file-dim-text {
  font-size: 11px;
  color: var(--text-light);
  font-family: var(--font-code);
  flex-shrink: 0;
}

/* 云端目标文件名与编辑展示 */
.target-key-line {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 380px;
  font-family: var(--font-code);
  font-size: 11px;
  color: var(--text-light);
  line-height: 1.3;
}

.target-key-line.is-custom {
  color: #b45309;
}

.cloud-icon {
  font-size: 11px;
  flex-shrink: 0;
  opacity: 0.8;
}

.target-key-text {
  max-width: 224px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
  transition: all 0.15s ease;
}

.target-key-text:hover {
  color: var(--brand-primary);
  border-bottom-color: var(--brand-primary);
}

.target-key-text.custom-text {
  color: #b45309;
  font-weight: 600;
  border-bottom-color: #b45309;
}

/* 已上传就绪只读态：禁用下划线与手型光标 */
.target-key-text.readonly {
  cursor: default;
  border-bottom: none;
}

.target-key-text.readonly:hover {
  color: inherit;
  border-bottom-color: transparent;
}

.override-pill {
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.25);
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}

.key-action-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-muted);
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.key-action-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-title);
}

.key-action-btn.edit {
  opacity: 0.6;
}

.target-key-line:hover .key-action-btn.edit {
  opacity: 1;
}

.key-action-btn.reset {
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-weight: 500;
}

.key-action-btn.reset:hover {
  background: #dc2626;
  color: #ffffff;
}

/* 行内微编辑面板与输入框 */
.key-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
  max-width: 380px;
}

.edit-input-bar {
  display: flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid var(--brand-primary);
  border-radius: 6px;
  padding: 2px 6px;
  box-shadow: 0 0 0 2px rgba(0, 163, 79, 0.12);
}

.key-edit-input {
  border: none;
  outline: none;
  font-family: var(--font-code);
  font-size: 11px;
  color: var(--text-title);
  width: 170px;
  background: transparent;
}

.locked-suffix {
  font-family: var(--font-code);
  font-size: 11px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 4px;
  border-radius: 3px;
  margin: 0 4px;
  user-select: none;
}

.edit-btn-group {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
}

.edit-btn {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
}

.edit-btn.confirm {
  background: var(--brand-primary);
  color: #ffffff;
}
.edit-btn.confirm:hover {
  background: #008842;
}

.edit-btn.cancel {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted);
}
.edit-btn.cancel:hover {
  background: rgba(0, 0, 0, 0.12);
  color: var(--text-title);
}

.edit-warning-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #b45309;
  line-height: 1.3;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 4px;
  padding: 3px 6px;
}

.size-flow {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  gap: 6px;
  font-family: var(--font-code);
  font-size: 12px;
  line-height: 1;
}

.raw-size {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
  line-height: 1;
}

.arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
  opacity: 0.7;
  user-select: none;
}

.comp-size {
  display: inline-flex;
  align-items: center;
  color: var(--state-green);
  font-weight: 600;
  line-height: 1;
}

.save-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--state-green-bg);
  color: var(--state-green);
  border: 1px solid var(--state-green-border);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  letter-spacing: -0.2px;
}

.measuring-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  line-height: 1;
}

.measuring-pill.active {
  background: rgba(14, 165, 233, 0.08);
  color: #0284c7;
  border: 1px solid rgba(14, 165, 233, 0.22);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(14, 165, 233, 0.08);
}

.measuring-pill.active.decoding {
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  border-color: rgba(99, 102, 241, 0.22);
}

.measuring-pill.active.decoding .pill-spinner {
  border-color: rgba(99, 102, 241, 0.25);
  border-top-color: #4f46e5;
}

.measuring-pill.active.optimizing {
  background: rgba(16, 185, 129, 0.08);
  color: #059669;
  border-color: rgba(16, 185, 129, 0.22);
}

.measuring-pill.active.optimizing .pill-spinner {
  border-color: rgba(16, 185, 129, 0.25);
  border-top-color: #059669;
}

.pill-spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(14, 165, 233, 0.25);
  border-top-color: #0284c7;
  border-radius: 50%;
  animation: pill-spin 0.8s linear infinite;
}

@keyframes pill-spin {
  to { transform: rotate(360deg); }
}

.waiting-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(139, 92, 246, 0.08);
  color: #7c3aed;
  border: 1px solid rgba(139, 92, 246, 0.2);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  line-height: 1;
}

.waiting-dot {
  width: 4px;
  height: 4px;
  background: #7c3aed;
  border-radius: 50%;
  opacity: 0.85;
}

.optimal-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-muted);
  border: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  letter-spacing: -0.2px;
}

.optimal-badge.fallback,
.fallback-pill {
  background: rgba(245, 158, 11, 0.08);
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.2);
}

.retry-measure-btn,
.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(0, 163, 79, 0.08);
  color: var(--brand-primary, #00a34f);
  border: 1px solid rgba(0, 163, 79, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  line-height: 1;
}

.retry-measure-btn:hover,
.retry-btn:hover {
  background: var(--brand-primary, #00a34f);
  color: #ffffff;
  border-color: var(--brand-primary, #00a34f);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 163, 79, 0.25);
}

.retry-measure-btn:active,
.retry-btn:active {
  transform: translateY(0);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 16px;
  font-size: 11px;
  font-weight: 600;
  text-wrap: nowrap;
}

.state-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.status-badge.create {
  background: var(--state-green-bg);
  color: var(--state-green);
  border: 1px solid var(--state-green-border);
}
.state-dot.green { background: var(--state-green); }

.status-badge.duplicate {
  background: var(--state-amber-bg);
  color: var(--state-amber);
  border: 1px solid var(--state-amber-border);
}
.state-dot.amber { background: var(--state-amber); }

.status-badge.replace {
  background: var(--state-rose-bg);
  color: var(--state-rose);
  border: 1px solid var(--state-rose-border);
}
.state-dot.rose { background: var(--state-rose); }

.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.status-dot.success {
  background: #00a34f;
  box-shadow: 0 0 6px rgba(0, 163, 79, 0.45);
}

.status-dot.fail {
  background: #e11d48;
  box-shadow: 0 0 6px rgba(225, 29, 72, 0.45);
}

.status-dot.idle {
  background: #94a3b8;
}

.status-meta {
  font-size: 12px;
  color: var(--text-regular);
  font-weight: 500;
}

.status-text-success {
  color: #00a34f;
  font-weight: 600;
}

.status-text-fail {
  color: #e11d48;
  font-weight: 600;
}

.progress-box {
  width: 130px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.progress-track {
  height: 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #00a34f, #10b981);
  border-radius: 6px;
  transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 6px rgba(0, 163, 79, 0.35);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1;
}

.progress-sub {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.progress-num {
  font-family: var(--font-code);
  font-size: 11px;
  color: #00a34f;
  font-weight: 700;
}

.action-group {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.table-action-btn {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--text-regular);
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
  text-wrap: nowrap;
}

.table-action-btn:hover:not(:disabled) {
  background: var(--brand-primary);
  color: #ffffff;
  border-color: var(--brand-primary);
  transform: translateY(-1px);
}

.table-action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.table-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
  pointer-events: none;
}

.table-action-btn.primary {
  background: var(--state-green-bg);
  border-color: var(--state-green-border);
  color: var(--state-green);
  font-weight: 600;
  text-wrap: nowrap;
}
.table-action-btn.primary:hover:not(:disabled) {
  background: var(--brand-primary);
  color: #ffffff;
  border-color: var(--brand-primary);
}

.table-action-btn.download-btn:hover:not(:disabled) {
  background: rgba(14, 165, 233, 0.08);
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.3);
}

.table-action-btn.delete {
  color: var(--text-muted);
}
.table-action-btn.delete:hover:not(:disabled) {
  background: var(--state-rose);
  color: #ffffff;
  border-color: var(--state-rose);
}

/* 空状态占位美化 */
.empty-cell {
  padding: 56px 20px;
  text-align: center;
  border-bottom: none !important;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.empty-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.025);
  border: 1px dashed rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-regular);
}

.empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-light);
}
</style>
