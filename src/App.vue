<template>
  <div class="app-root">
    <!-- 动态弥散光斑容器与点阵网格 (专为导航栏透光穿透设计) -->
    <div class="bg-orbs-layer">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <!-- 顶部极致高透光导航栏组件 -->
    <Navbar 
      v-model="currentTab" 
      :userInfo="userInfo" 
      :cosAuthStatus="cosAuthStatus" 
    />

    <!-- 主体区域 -->
    <main class="main-content">
      <!-- 全局未配置外部存储桶配置时的醒目提示卡片 (Banner) -->
      <div v-if="!isCosConfigured" class="unconfigured-banner">
        <div class="banner-icon-box">⚠️</div>
        <div class="banner-body">
          <div class="banner-title">未检测到存储桶目标配置 (targets)</div>
          <div class="banner-desc">
            代码内置兜底预设已彻底停用。请在 <code>public/app-config.js</code>（若为已打包产物则在 <code>dist/app-config.js</code>）中的 <code>targets</code> 数组中配置存储桶与接口参数，保存后刷新页面即可恢复切图直传。
          </div>
        </div>
        <div class="banner-badge">未配置</div>
      </div>

      <!-- TAB 1: 录入与上传视图 -->
      <section v-if="currentTab === 'upload'">
        <!-- 拖拽 & 剪贴板录入组件 -->
        <Dropzone @files-added="handleFilesAdded" />

        <!-- 任务队列工具栏组件 (全新柔和暮山黛主按钮 + 画质切换 + 超时设置 + 离线下载) -->
        <QueueToolbar 
          :count="queueList.length" 
          :items="queueList"
          :isUploading="isUploadingAll"
          :quality="currentQuality"
          :timeout-seconds="currentTimeoutSeconds"
          @clear-queue="clearQueue"
          @start-upload="startBatchUpload"
          @change-quality="handleChangeQuality"
          @change-timeout="handleChangeTimeout"
          @download-all="handleBatchDownload"
        />

        <!-- 任务队列表格卡片组件 -->
        <QueueTable 
          :list="queueList"
          @open-comparator="openComparator"
          @open-code="openCodeGenerator"
          @copy-url="handleCopyText"
          @remove-item="removeQueueItem"
          @retry-compress="handleRetryCompress"
          @download-item="handleDownloadItem"
        />
      </section>

      <!-- TAB 2: 团队资产库 & 时间轴看板 -->
      <TimelineList 
        v-else 
        @copy-url="handleCopyText" 
        @show-toast="showToast" 
        @open-preview="handleTimelinePreview"
      />
    </main>

    <!-- 弹窗 1: 1:1 卷帘画质对比器 -->
    <CurtainModal 
      :visible="showComparator" 
      :item="activeCompareItem" 
      @close="showComparator = false" 
    />

    <!-- 弹窗 2: 交付代码生成器 -->
    <CodeModal 
      :visible="showCodeModal" 
      :item="activeCodeItem" 
      @close="showCodeModal = false"
      @copy="handleCodeCopied"
    />

    <!-- iOS 风格悬浮轻提示 -->
    <Toast :visible="toastVisible" :message="toastMessage" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { IUserInfo, IQueueItem } from './types/asset'

// 组合式函数与公共方法
import { useToast } from './composables/useToast'
import { useAssetQueue } from './composables/useAssetQueue'
import { copyText } from './utils/clipboard'
import { extractZipImages } from './utils/zip'
import { computeFileMd5 } from './utils/md5'
import { detectScaleBadge } from './utils/file'
import { compressScheduler } from './utils/compressScheduler'
import { downloadQueueItem, batchDownloadQueue } from './utils/download'
import { getCurrentUser, initAndSyncUser } from './utils/user'
import { cosUploader, cosAuthStatus } from './services/cosUploader'
import { isCosConfigured } from './config/cosTargets'
import { syncPageTitle } from './utils/title'
import type { ExistAssetItem } from './services/assetBff'

// 细粒度子组件
import Navbar from './components/Navbar.vue'
import Dropzone from './components/Dropzone.vue'
import QueueToolbar from './components/QueueToolbar.vue'
import QueueTable from './components/QueueTable.vue'
import TimelineList from './components/TimelineList.vue'
import CurtainModal from './components/CurtainModal.vue'
import CodeModal from './components/CodeModal.vue'
import Toast from './components/Toast.vue'

/** 当前激活的顶部标签页 */
const currentTab = ref<'upload' | 'history'>('upload')

/** 全局轻提示 */
const { toastVisible, toastMessage, showToast } = useToast()

/** 全局压缩画质比值 (0.1 ~ 1.0，默认 0.85 极致均衡，1.0 为原画无损) */
const currentQuality = ref<number>(0.85)

/** 全局单图超时熔断秒数 (默认 30s，支持 60s 或 120s) */
const currentTimeoutSeconds = ref<number>(30)

/** 队列状态与弹窗调度 */
const {
  queueList,
  isUploadingAll,
  showComparator,
  activeCompareItem,
  showCodeModal,
  activeCodeItem,
  removeQueueItem,
  clearQueue,
  startBatchUpload,
  openComparator,
  openCodeGenerator,
  runPrecheck,
} = useAssetQueue()

/** 当前登录用户 (优先从 URL Token 解析还原，未登录时为 null) */
const userInfo = ref<IUserInfo | null>(getCurrentUser())

/**
 * 复制指定文本并弹出反馈轻提示
 * @param {string} text - 目标文本
 */
async function handleCopyText(text: string) {
  const success = await copyText(text)
  if (success) {
    showToast('已复制到剪贴板')
  }
}

/**
 * 交付代码完成复制回调
 * @param {string} code - 代码片段
 */
async function handleCodeCopied(code: string) {
  const success = await copyText(code)
  if (success) {
    showToast('交付代码已复制')
  }
}

/**
 * 处理用户拖拽或选择的多个切图文件 (支持文件、文件夹递归与 ZIP 平铺)
 * @param {FileList | File[]} files - 文件对象列表
 */
async function handleFilesAdded(files: FileList | File[]) {
  const fileArray = Array.from(files)
  let addedImageCount = 0
  
  // 遍历处理每个文件，若为 ZIP 则自动内存解压平铺
  for (const file of fileArray) {
    if (file.name.endsWith('.zip')) {
      showToast('正在解压切图压缩包...')
      try {
        const extracted = await extractZipImages(file)
        extracted.forEach((img) => addImageToQueue(img))
        showToast(`已解压平铺入队 ${extracted.length} 项切图`)
      } catch (err) {
        console.error('ZIP 解压异常:', err)
        showToast('ZIP 切图包解压失败')
      }
    } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) {
      addImageToQueue(file)
      addedImageCount++
    }
  }

  // 统一聚合给出反馈提示，杜绝批量拖入文件夹时的 toast 刷屏
  if (addedImageCount > 0) {
    showToast(addedImageCount === 1 ? '切图已加入队列' : `已成功导入 ${addedImageCount} 项切图`)
  }
}

/**
 * 触发指定切图条目的本地压缩测算（交付多核心并发调度器统筹排队与倒计时）
 * @param {IQueueItem} item - 目标切图条目
 */
function triggerCompressForItem(item: IQueueItem) {
  // 查找 Proxy 响应式对象确保精准更新界面
  const target = queueList.value.find((i) => i.id === item.id) || item
  // 提交给并发调度器（自适应 4~8 核心极速并发，超出排队）
  compressScheduler.enqueue(target)
}

/**
 * 用户手动触发单项压缩测算重试
 * @param {IQueueItem} item - 目标队列项
 */
function handleRetryCompress(item: IQueueItem) {
  // 查找对应的响应式项
  const target = queueList.value.find((i) => i.id === item.id) || item
  // 重置压缩测算数据
  target.compressedSize = undefined
  target.compressedFile = undefined
  target.compressedPreviewUrl = undefined
  showToast(`正在重新测算 "${target.fileName}"...`)
  // 提交重试至调度器
  compressScheduler.retry(target)
}

/**
 * 切换全局压缩画质比值并重新对队列全量测算
 * @param {number} quality - 目标画质比值 (0.1 ~ 1.0)
 */
function handleChangeQuality(quality: number) {
  currentQuality.value = quality
  compressScheduler.setGlobalQuality(quality)
  const label = quality >= 0.98 ? '原画无损 (毛玻璃推荐)' : quality >= 0.8 ? '极致均衡 (85%)' : '极限体积 (70%)'
  // 检查当前任务队列中是否存在待上传状态的切图数据
  const hasIdleItems = queueList.value.some((item) => item.status === 'IDLE')
  if (hasIdleItems) {
    showToast(`已切换至 ${label}，正在重新测算...`)
    compressScheduler.recompressAll(queueList.value)
  } else {
    showToast(`已切换至 ${label}`)
  }
}

/**
 * 切换全局单图压缩超时熔断秒数
 * @param {number} seconds - 目标超时秒数 (30, 60, 120)
 */
function handleChangeTimeout(seconds: number) {
  currentTimeoutSeconds.value = seconds
  compressScheduler.setGlobalTimeoutSeconds(seconds)
  const label = seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`
  showToast(`单图超时熔断上限已调整为 ${label}`)
}

/**
 * 直接下载指定队列项的切图文件（免上传纯本地导出）
 * @param {IQueueItem} item - 目标切图条目
 */
function handleDownloadItem(item: IQueueItem) {
  const target = queueList.value.find((i) => i.id === item.id) || item
  const success = downloadQueueItem(target)
  if (success) {
    showToast(`正在下载 "${target.fileName}"...`)
  } else {
    showToast(`下载失败，切图文件无效`)
  }
}

/**
 * 批量下载当前队列中已测算的全部切图（免上传纯本地导出）
 */
function handleBatchDownload() {
  if (queueList.value.length === 0) {
    showToast('当前任务队列为空')
    return
  }

  showToast(`已触发批量下载 ${queueList.value.length} 项切图...`)
  batchDownloadQueue(queueList.value, (count) => {
    showToast(`已完成 ${count} 项切图本地导出`)
  })
}

/**
 * 从时间轴看板点击资产缩略图打开全画幅高清大图预览
 * @param {ExistAssetItem} item - 云端资产条目
 */
function handleTimelinePreview(item: ExistAssetItem) {
  // 组装符合 CurtainModal 规范的虚拟切图对象，以纯净高清大图模式呈现
  activeCompareItem.value = {
    id: item.rawMd5 || item.url,
    file: null as any,
    fileName: item.fileName,
    rawMd5: item.rawMd5,
    fileSize: item.optSize || item.rawSize,
    previewUrl: item.url,
    dimensions: { width: item.width || 0, height: item.height || 0 },
    enableCompress: false,
    status: 'SUCCESS',
    progress: 100,
    operationType: 'CREATE',
    isSuspectedDuplicate: false,
  }
  showComparator.value = true
}

/**
 * 将单个图片文件规整并推入队列首部
 * @param {File} file - 图片文件对象
 */
async function addImageToQueue(file: File) {
  const preview = URL.createObjectURL(file)
  
  // 创建临时队列条目
  const item: IQueueItem = {
    id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
    file,
    fileName: file.name,
    rawMd5: '',
    fileSize: file.size,
    compressedSize: undefined,
    compressedFile: undefined,
    compressedPreviewUrl: undefined,
    compressStatus: 'WAITING',
    previewUrl: preview,
    dimensions: { width: 0, height: 0 },
    // 精准识别倍率：只有文件名实际包含 @1x/@2x/@3x 才标记，杜绝默认无脑兜底 @2x
    scaleBadge: detectScaleBadge(file.name),
    enableCompress: true,
    status: 'IDLE',
    progress: 0,
    operationType: 'CREATE',
    isSuspectedDuplicate: false,
  }
  queueList.value.unshift(item)

  // 1. 立即异步执行客户端本地图片压缩测算（纯本地极速计算，零网络依赖）
  triggerCompressForItem(item)

  // 2. 独立异步加载图片获取真实尺寸
  const img = new Image()
  img.onload = () => {
    const target = queueList.value.find((i) => i.id === item.id) || item
    target.dimensions = { width: img.naturalWidth, height: img.naturalHeight }
  }
  img.src = preview

  // 3. 独立异步计算原图 MD5 并触发服务端查重检测
  ;(async () => {
    try {
      const md5 = await computeFileMd5(file)
      const target = queueList.value.find((i) => i.id === item.id) || item
      target.rawMd5 = md5
      // 触发 BFF 查重检测
      await runPrecheck()
    } catch (err) {
      console.warn('计算文件 MD5 异常:', err)
    }
  })()
}

/**
 * 全局监听剪贴板粘贴事件 (Ctrl + V / Cmd + V)
 * @param {ClipboardEvent} e - 剪贴板事件
 */
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.includes('image')) {
      const file = item.getAsFile()
      if (file) {
        addImageToQueue(file)
        showToast('已捕获剪贴板切图')
      }
    }
  }
}

onMounted(async () => {
  window.addEventListener('paste', handlePaste)

  // 同步网页标题至当前窗口及父级宿主 iframe
  syncPageTitle()

  // 挂载时尝试探活与获取 COS 临时凭据，以在有效窗口期点亮状态标识
  cosUploader.checkCosAuth()

  // 若存在合法登录态，则静默同步当前企微用户信息至花名册
  try {
    const user = await initAndSyncUser()
    // 判断是否成功获取到用户
    if (user) {
      userInfo.value = user
    }
  } catch (err) {
    console.warn('同步用户信息异常:', err)
  }
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
})
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  position: relative;
  background-color: var(--bg-base);
}

/* 弥散光斑容器与点阵背景 */
.bg-orbs-layer {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  background-image: radial-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px);
  background-size: 28px 28px;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(85px);
  opacity: 0.75;
}
/* 高位光斑贯穿顶部导航栏，形成极强透光折射感 (契合企业品牌绿色系) */
.orb-1 { width: 520px; height: 520px; background: rgba(0, 163, 79, 0.15); top: -140px; left: 12%; }
.orb-2 { width: 560px; height: 560px; background: rgba(0, 140, 60, 0.10); top: -110px; right: 10%; }
.orb-3 { width: 460px; height: 460px; background: rgba(16, 185, 129, 0.10); bottom: -100px; left: 28%; }

.main-content {
  position: relative;
  z-index: 10;
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 24px) 70px;
}

/* 未配置外部环境目标全局警示卡片 */
.unconfigured-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(254, 243, 199, 0.65);
  border: 1px solid rgba(245, 158, 11, 0.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 14px;
  padding: 14px 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.08);
}

.banner-icon-box {
  font-size: 24px;
  flex-shrink: 0;
}

.banner-body {
  flex: 1;
}

.banner-title {
  font-size: 14px;
  font-weight: 700;
  color: #92400e;
  margin-bottom: 4px;
  letter-spacing: -0.2px;
}

.banner-desc {
  font-size: 12px;
  color: #b45309;
  line-height: 1.5;
}

.banner-desc code {
  background: rgba(245, 158, 11, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  color: #78350f;
}

.banner-badge {
  flex-shrink: 0;
  background: #f59e0b;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 12px;
  letter-spacing: 0.2px;
}
</style>
