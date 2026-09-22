<template>
  <!-- 拖拽 & 剪贴板热区 (支持文件与文件夹任意混选拖入，多级目录自动递归展开) -->
  <div 
    :class="['dropzone-card', { 'drag-active': isDragging }]"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="onDrop"
    @click="onCardClick"
  >
    <!-- 1. 常规文件多选输入框 (支持图片、ZIP压缩包) -->
    <input 
      id="cos-dropzone-file-input"
      ref="fileInputRef" 
      type="file" 
      multiple 
      accept="image/*,.zip" 
      style="position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; z-index: -1;" 
      @click.stop
      @change="onFileInputChange" 
    />

    <!-- 2. 文件夹递归选择输入框 (系统级选择整个目录) -->
    <input 
      id="cos-dropzone-folder-input"
      type="file" 
      webkitdirectory 
      directory 
      multiple 
      style="position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; z-index: -1;" 
      @click.stop
      @change="onFolderInputChange" 
    />
    
    <!-- 极简工业感矢量托盘线条 -->
    <div class="dropzone-tray">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    </div>

    <h2 class="dropzone-title">拖拽切图文件、目录或 ZIP 压缩包至此处</h2>
    <p class="dropzone-sub">支持从文件管理器中<strong>同时选中文件与文件夹</strong>拖入，或直接点击下方按钮选取</p>

    <!-- 点击上传双模操作按钮组 (采用原生 label 关联 input，具备绝对的原生 User Activation，彻底杜绝浏览器安全拦截) -->
    <div class="dropzone-actions" @click.stop>
      <label class="action-btn file-btn" for="cos-dropzone-file-input" @click.stop title="打开系统对话框选择单张或多张切图">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>选取切图文件</span>
      </label>

      <label class="action-btn folder-btn" for="cos-dropzone-folder-input" @click.stop title="打开系统对话框选择一个文件夹，自动递归抓取内部全部切图">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span>选取整个文件夹</span>
      </label>
    </div>

    <div class="quick-badges">
      <span class="pill-badge">剪贴板直传: <kbd>Ctrl + V</kbd></span>
      <span class="pill-badge">格式: <strong>PNG、JPG、WebP、SVG</strong></span>
      <span class="pill-badge">解压: <strong>ZIP 内存平铺</strong></span>
      <span class="pill-badge">穿透: <strong>目录递归自动扫描</strong></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  /** 接收到外部切图文件列表 */
  (e: 'files-added', files: FileList | File[]): void
}>()

/** 是否处于拖拽悬停中 */
const isDragging = ref(false)

/** 隐藏的文件输入框引用 */
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 大卡片空白区域点击唤起默认文件选择 */
function onCardClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  // 严格防御：若点击源是 input 本身、操作容器或按钮内元素，坚决不重复唤起
  if (
    target.tagName === 'INPUT' || 
    target.closest('.dropzone-actions') || 
    target.closest('.action-btn')
  ) {
    return
  }
  fileInputRef.value?.click()
}

/** 文件输入改变事件处理 */
function onFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    emit('files-added', target.files)
    target.value = ''
  }
}

/** 文件夹选择完成事件处理 */
function onFolderInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    emit('files-added', target.files)
    target.value = ''
  }
}

/**
 * 递归遍历 DataTransferItemList 提取其中的全部子文件与深层嵌套目录
 * @param {DataTransferItemList} items - 拖拽项列表
 * @returns {Promise<File[]>} 提取出的所有真实文件对象
 */
async function extractFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const result: File[] = []

  /**
   * 递归遍历某个目录 entry
   * @param {any} dirEntry - FileSystemDirectoryEntry
   */
  async function traverseDirectory(dirEntry: any): Promise<void> {
    const reader = dirEntry.createReader()
    // Chromium 标准规范：readEntries 会分批返回，必须循环读取直至返回空数组
    const entries = await new Promise<any[]>((resolve) => {
      const allEntries: any[] = []
      function readBatch() {
        reader.readEntries(
          (batch: any[]) => {
            if (!batch || batch.length === 0) {
              resolve(allEntries)
            } else {
              allEntries.push(...batch)
              readBatch()
            }
          },
          () => resolve(allEntries)
        )
      }
      readBatch()
    })

    for (const entry of entries) {
      if (entry.isFile) {
        const file = await new Promise<File | null>((res) => entry.file(res, () => res(null)))
        if (file) result.push(file)
      } else if (entry.isDirectory) {
        await traverseDirectory(entry)
      }
    }
  }

  const tasks: Promise<void>[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind !== 'file') continue

    // 使用非阻塞标准的 webkitGetAsEntry()
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) {
      if (entry.isFile) {
        const file = item.getAsFile()
        if (file) result.push(file)
      } else if (entry.isDirectory) {
        tasks.push(traverseDirectory(entry))
      }
    } else {
      const file = item.getAsFile()
      if (file) result.push(file)
    }
  }

  await Promise.all(tasks)
  return result
}

/** 拖拽释放处理 */
async function onDrop(e: DragEvent) {
  isDragging.value = false
  if (!e.dataTransfer) return

  // 1. 优先使用 DataTransferItemList 递归解构目录与混选文件
  if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
    try {
      const files = await extractFilesFromDataTransfer(e.dataTransfer.items)
      if (files.length > 0) {
        emit('files-added', files)
        return
      }
    } catch (err) {
      console.warn('[Dropzone] 递归解析拖拽目录失败，尝试降级读取 files:', err)
    }
  }

  // 2. 传统降级读取
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    emit('files-added', e.dataTransfer.files)
  }
}
</script>

<style scoped>
.dropzone-card {
  background: var(--glass-surface);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: 1.5px dashed rgba(15, 23, 42, 0.15);
  border-radius: 8px;
  padding: 40px 24px 36px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 10px 30px -10px rgba(15, 23, 42, 0.04);
  transition: all 0.25s var(--ease-spring);
}

.dropzone-card:hover, .dropzone-card.drag-active {
  background: var(--glass-surface-hover);
  border-color: var(--brand-primary);
  box-shadow: 0 20px 45px -12px rgba(0, 163, 79, 0.15), 0 0 0 3px rgba(0, 163, 79, 0.1);
  transform: translateY(-2px);
}

.dropzone-tray {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  color: var(--brand-primary);
  box-shadow: 0 4px 14px rgba(0, 163, 79, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.dropzone-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-title);
  margin-bottom: 6px;
}

.dropzone-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 18px;
}

.dropzone-sub strong {
  color: var(--text-title);
}

/* 快捷操作按钮组 */
.dropzone-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: var(--text-title);
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s var(--ease-spring);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.action-btn:hover {
  background: var(--brand-primary);
  color: #ffffff;
  border-color: var(--brand-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 163, 79, 0.25);
}

.action-btn:active {
  transform: translateY(0);
}

.action-btn.folder-btn {
  background: rgba(14, 165, 233, 0.06);
  border-color: rgba(14, 165, 233, 0.25);
  color: #0284c7;
}

.action-btn.folder-btn:hover {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
}

.quick-badges {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-badge {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-regular);
  font-weight: 500;
}

.pill-badge kbd {
  background: var(--state-green-bg);
  border: 1px solid var(--state-green-border);
  border-radius: 5px;
  padding: 1px 6px;
  font-family: var(--font-code);
  color: var(--brand-primary);
  font-weight: 600;
}
</style>
