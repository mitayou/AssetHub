import { ref } from 'vue'
import type { IQueueItem } from '../types/asset'
import { useToast } from './useToast'
import { cosUploader } from '../services/cosUploader'
import { assetBff, AssetRecordPayload } from '../services/assetBff'
import { getCurrentUser } from '../utils/user'
import { currentCosTarget, resolveOnlineUrl, currentUploadDir, isCosConfigured } from '../config/cosTargets'
import { compressScheduler } from '../utils/compressScheduler'

/**
 * 资产任务队列状态与操作 Composable
 * @description 统筹切图导入、MD5秒传查重预检、COS直传执行以及BFF元数据批量持久化
 */
export function useAssetQueue() {
  const { showToast } = useToast()

  /** 任务队列列表 (初始为空，通过外部拖拽/选择/粘贴切图动态录入) */
  const queueList = ref<IQueueItem[]>([])

  /** 是否正在批量上传中 */
  const isUploadingAll = ref(false)

  /** 弹窗状态：1:1 卷帘对比 */
  const showComparator = ref(false)
  const activeCompareItem = ref<IQueueItem | null>(null)

  /** 弹窗状态：交付代码生成器 */
  const showCodeModal = ref(false)
  const activeCodeItem = ref<IQueueItem | null>(null)

  /**
   * 移除指定索引的切图队列项
   * @param {number} index - 队列索引
   */
  function removeQueueItem(index: number) {
    const item = queueList.value[index]
    // 检查并释放该项占用的预览 ObjectURL 与调度器任务
    if (item) {
      // 从压缩调度器中安全移除
      compressScheduler.removeItem(item.id)

      // 释放原图预览 ObjectURL
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl)
      }
      // 释放压缩产物预览 ObjectURL
      if (item.compressedPreviewUrl && item.compressedPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.compressedPreviewUrl)
      }
    }
    queueList.value.splice(index, 1)
  }

  /**
   * 执行队列资产查重预检
   * @description 收集待上传文件的MD5指纹，向BFF查询是否已存在历史切图
   */
  async function runPrecheck() {
    // 检查是否未配置存储桶目标或当前环境为测试沙箱：均无需查询正式资产库
    if (!currentCosTarget.value || currentCosTarget.value.env === 'test') {
      return
    }

    // 筛选有MD5指纹且未完成上传的项目
    const pendingItems = queueList.value.filter(
      (item) => item.rawMd5 && item.status !== 'SUCCESS'
    )
    // 检查是否有待预检条目
    if (pendingItems.length === 0) return

    const md5List = pendingItems.map((item) => item.rawMd5)
    const exists = await assetBff.precheck(md5List)
    // 检查查重响应结果
    if (exists && exists.length > 0) {
      const existMap = new Map(exists.map((e) => [e.rawMd5, e]))
      pendingItems.forEach((item) => {
        // 匹配已存在的切图条目
        if (existMap.has(item.rawMd5)) {
          item.isSuspectedDuplicate = true
          item.onlineUrl = existMap.get(item.rawMd5)?.url || item.onlineUrl
        }
      })
      showToast(`查重检测到 ${exists.length} 项已有切图资产`)
    }
  }

  /**
   * 清空当前所有待处理切图队列
   * @returns {void}
   */
  function clearQueue(): void {
    // 检查当前队列是否已为空
    if (queueList.value.length === 0) {
      return
    }

    // 检查是否正在批量直传中，上传中拦截清空
    if (isUploadingAll.value) {
      showToast('正在上传切图中，暂不可清空队列')
      return
    }

    // 遍历释放队列条目占用的 Blob 预览内存
    queueList.value.forEach((item) => {
      // 释放原图预览链接
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl)
      }
      // 释放压缩产物预览链接
      if (item.compressedPreviewUrl && item.compressedPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.compressedPreviewUrl)
      }
    })

    /** 清空切图总数 */
    const count = queueList.value.length
    // 同步清空压缩调度器中所有活跃与等待任务
    compressScheduler.clearAll()
    // 重置队列列表
    queueList.value = []
    showToast(`已清空 ${count} 项待处理切图`)
  }

  /**
   * 开始批量直传队列中的切图至腾讯云 COS 并录入 BFF
   */
  async function startBatchUpload() {
    // 前置鉴权校验：未登录用户不允许上传数据
    const currentUser = getCurrentUser()
    if (!currentUser || !currentUser.userId) {
      showToast('当前处于未登录状态，暂无切图上传权限')
      return
    }

    // 前置存储桶配置校验：未配置 targets 时拦截上传
    if (!isCosConfigured.value || !currentCosTarget.value) {
      showToast('未检测到存储桶配置，请先在 app-config.js 中配置 targets')
      return
    }

    isUploadingAll.value = true

    // 筛选待上传的条目
    const pendingItems = queueList.value.filter((item) => item.status !== 'SUCCESS')
    // 判断是否有待上传条目
    if (pendingItems.length === 0) {
      isUploadingAll.value = false
      showToast('队列中没有待上传的切图')
      return
    }

    showToast('开始批量上传及资产入库...')

    // 针对每个条目执行上传
    for (const item of pendingItems) {
      item.status = 'UPLOADING'
      item.progress = 10

      try {
        // 如果具有真实的二进制实体则调用官方 COS 直传 SDK
        if (item.file && item.file.size > 0) {
          // 若存在体积更小的压缩产物，则直接直传压缩后的切图
          const uploadBody = (item.compressedFile && item.compressedSize && item.compressedSize < item.fileSize)
            ? item.compressedFile
            : item.file

          // 优先使用用户手动指定的替换文件名，未指定时遵循默认 MD5 散列命名
          const targetKey = item.customFileName || `${item.rawMd5}.${item.fileName.split('.').pop() || 'png'}`

          const res = await cosUploader.uploadFile({
            file: uploadBody,
            key: targetKey,
            onProgress: (p) => {
              item.progress = p
            },
          })
          item.onlineUrl = res.url
          item.onlineKey = res.key
          item.status = 'SUCCESS'
          item.progress = 100
        } else {
          // 无真实文件实体的模拟条目
          item.progress = 100
          item.status = 'SUCCESS'
          // 若无在线链接则根据当前预设自动计算
          if (!item.onlineUrl) {
            const fallbackKey = item.customFileName || `${item.rawMd5}.png`
            const fullKey = currentUploadDir.value ? `${currentUploadDir.value}/${fallbackKey}` : fallbackKey
            item.onlineUrl = resolveOnlineUrl(currentCosTarget.value, fullKey)
          }
        }
      } catch (uploadError: any) {
        console.error('[useAssetQueue] 直传过程异常:', uploadError)
        item.status = 'FAIL'
        item.progress = 0
        showToast(`"${item.fileName}" 直传失败: ${uploadError?.message || '网络或凭证异常'}`)
      }
    }

    // 仅针对真实上传成功的条目进行后续处理
    const successItems = pendingItems.filter((item) => item.status === 'SUCCESS' && item.onlineUrl)
    // 若没有成功的条目，直接结束流程并提醒
    if (successItems.length === 0) {
      showToast('切图直传未成功')
      isUploadingAll.value = false
      return
    }

    // 检查是否为测试沙箱环境：测试环境免入库归档，防止脏数据污染查重库与资产看板
    if (currentCosTarget.value?.env === 'test') {
      showToast(`直传成功！已存入 dsxcx/temp/ 沙箱目录（测试模式免入库）`)
      isUploadingAll.value = false
      return
    }

    // 生产环境：批量上报元数据到 BFF 进行持久化归档
    const recordPayloads: AssetRecordPayload[] = successItems.map((item) => {
      // 提取真实测量后的优化体积
      const optSize = (typeof item.compressedSize === 'number' && item.compressedSize > 0)
        ? item.compressedSize
        : item.fileSize
      // 计算真实压缩比率
      const ratio = item.fileSize > 0 ? Number((optSize / item.fileSize).toFixed(2)) : 1

      return {
        rawMd5: item.rawMd5,
        optMd5: item.rawMd5,
        fileName: item.fileName,
        fileType: item.fileName.split('.').pop() || 'png',
        // 安全读取图片尺寸并设置兜底
        width: item.dimensions?.width ?? 0,
        height: item.dimensions?.height ?? 0,
        rawSize: item.fileSize,
        optSize,
        ratio,
        url: item.onlineUrl || '',
        uploaderId: currentUser.userId,
        uploaderName: currentUser.name,
        uploader: currentUser.userId,
      }
    })

    try {
      const count = await assetBff.recordAssets(recordPayloads)
      showToast(`直传完毕！已成功将 ${count || successItems.length} 项切图归档入库`)
    } catch (recordError) {
      console.warn('[useAssetQueue] BFF 批量入库异常:', recordError)
      showToast('切图已直传至 COS，但元数据记录异常')
    } finally {
      isUploadingAll.value = false
    }
  }

  /**
   * 打开 1:1 画质卷帘比对器
   * @param {IQueueItem} item - 待比对的切图项
   */
  function openComparator(item: IQueueItem) {
    activeCompareItem.value = item
    showComparator.value = true
  }

  /**
   * 打开代码生成弹窗
   * @param {IQueueItem} item - 目标切图项
   */
  function openCodeGenerator(item: IQueueItem) {
    activeCodeItem.value = item
    showCodeModal.value = true
  }

  return {
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
  }
}
