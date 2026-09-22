/**
 * 资产文件操作类型
 */
export type OperationType = 'CREATE' | 'REPLACE'

/**
 * 上传任务处理状态
 */
export type UploadStatus = 
  | 'IDLE'         // 待处理
  | 'PARSING'      // 解压/解析中
  | 'PRECHECKING'  // MD5 预检查重中
  | 'COMPRESSING'  // 压缩处理中
  | 'UPLOADING'    // 上传 COS 中
  | 'SUCCESS'      // 成功已入库
  | 'FAIL'         // 失败
  | 'CONFIRM_WAIT' // 覆盖确认等待中

/**
 * 待处理与队列中的切图项
 */
export interface IQueueItem {
  id: string                   // 前端唯一任务 ID
  file: File                   // 原始 File 对象
  fileName: string             // 原始文件名
  rawMd5: string               // 原始未压缩文件的 MD5
  fileSize: number             // 原始大小（字节）
  previewUrl: string           // 本地预览 Blob URL
  dimensions?: { width: number; height: number } // 尺寸
  scaleBadge?: '@1x' | '@2x' | '@3x'             // 智能识别倍率

  // 压缩相关
  enableCompress: boolean      // 是否开启压缩
  compressedFile?: Blob        // 压缩后的产物 Blob
  compressedSize?: number      // 压缩后大小
  compressedPreviewUrl?: string// 压缩后预览 URL
  /** 客户端本地压缩测算状态 (IDLE: 待机, WAITING: 排队中, COMPRESSING: 测算中, SUCCESS: 成功, FAIL: 失败/已保底) */
  compressStatus?: 'IDLE' | 'WAITING' | 'COMPRESSING' | 'SUCCESS' | 'FAIL'
  /** 压缩测算异常或超时提示 */
  compressError?: string
  /** 是否因超时熔断或异常触发了保底原图 */
  isFallback?: boolean
  /** 30s 测算超时独立倒计时剩余秒数 (30 -> 0) */
  compressCountdown?: number
  /** 压缩测算细分业务阶段 (DECODING: 解码像素, QUANTIZING: 调色板量化, OPTIMIZING: 无损优化) */
  compressStage?: 'DECODING' | 'QUANTIZING' | 'OPTIMIZING'

  // 状态与进度
  status: UploadStatus
  progress: number             // 0 ~ 100
  statusDesc?: string          // 状态提示文字 (如 "正在上传 65%...")
  errorMessage?: string

  // 业务防呆与判定
  operationType: OperationType // 🟢 CREATE 或 🔴 REPLACE
  isSuspectedDuplicate: boolean// 🟡 是否疑似与库中历史重复
  duplicateSourceInfo?: {
    creatorName: string
    creatorCode: string
    url: string
    createTime: string
  }
  targetReplaceKey?: string    // 若是 REPLACE，用户指定要覆盖的线上旧 Key
  /** 用户指定的自定义云端文件名（含后缀，用于原地替换同名线上资源） */
  customFileName?: string
  /** 是否为用户手动指定的自定义名称 */
  isCustomName?: boolean

  // 交付结果
  onlineKey?: string           // 最终 COS Key (如 dsxcx/images/c7defee36ccaca5e951a4d9fc4649b32.png)
  onlineUrl?: string           // 最终 CDN 访问链接
}

/**
 * 用户身份信息 (来自内网 SSO / URL Token 注入)
 */
export interface IUserInfo {
  userId: string               // 工号/唯一ID (如 20260411006)
  username?: string            // 用户名
  name: string                 // 姓名 (如 张三)
  avatar: string               // 企微头像 URL
  email?: string               // 邮箱
  workNo?: string              // 兼容历史工号别名
  rawPayload?: Record<string, any>
}

/**
 * 历史资产条目 (时间轴消费)
 */
export interface IAssetRecord {
  id: string
  key: string
  url: string
  fileName: string
  fileSize: number
  rawFileSize: number
  isCompressed: boolean
  creatorCode: string
  creatorName: string
  creatorAvatar: string
  tags: string[]
  createTime: string
}
