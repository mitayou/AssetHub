/**
 * 资产治理 BFF 客户端服务封装
 * @description 统一基于 API_CONFIG 标准接口地址与后端 BFF 通信，处理查重预检、元数据入库、时间轴看板及用户同步
 */
import { API_CONFIG } from '../config/apiConfig'

/**
 * 预检命中的历史资产类型
 */
export interface ExistAssetItem {
  /** 原图MD5指纹 */
  rawMd5: string
  /** 优化后MD5指纹 */
  optMd5: string
  /** 历史文件名 */
  fileName: string
  /** 文件格式 */
  fileType: string
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 原图大小 */
  rawSize: number
  /** 优化后大小 */
  optSize: number
  /** 压缩比率 */
  ratio: number
  /** 线上访问URL */
  url: string
  /** 上传人工号/ID */
  uploaderId?: string
  /** 上传人姓名 */
  uploaderName?: string
  /** 上传人企微头像 (服务端动态匹配，切图表零冗余) */
  uploaderAvatar?: string
  /** 兼容字段 */
  uploader?: string
  /** 上传归档日期 (YYYY-MM-DD) */
  uploadDate?: string
  /** 上传时间 */
  createTime: string
}

/**
 * 资产入库参数类型
 */
export interface AssetRecordPayload {
  /** 原图MD5指纹 */
  rawMd5: string
  /** 优化后文件MD5指纹 */
  optMd5?: string
  /** 切图文件名 */
  fileName: string
  /** 文件格式类型 */
  fileType?: string
  /** 图片宽度 */
  width?: number
  /** 图片高度 */
  height?: number
  /** 原图文件大小(字节) */
  rawSize?: number
  /** 优化后文件大小(字节) */
  optSize?: number
  /** 压缩比率 */
  ratio?: number
  /** COS存储桶标识 */
  cosKey?: string
  /** 线上CDN访问URL */
  url: string
  /** 上传人员工号/ID */
  uploaderId?: string
  /** 上传人员姓名 */
  uploaderName?: string
  /** 兼容上传人字段 */
  uploader?: string
}

/**
 * 资产宏观统计指标
 */
export interface AssetStats {
  /** 累计收录切图总数 */
  totalCount: number
  /** 累计原始总字节数 */
  totalRawSize: number
  /** 累计优化后总字节数 */
  totalOptSize: number
  /** 累计节省流量字节数 */
  savedBytes: number
}

/**
 * 团队时间轴返回结构
 */
export interface TimelineResult {
  /** 资产列表 */
  list: ExistAssetItem[]
  /** 满足条件的总数 */
  total: number
  /** 当前页码 */
  page: number
  /** 每页数量 */
  pageSize: number
  /** 总体统计指标 */
  stats: AssetStats
}

/**
 * 资产中心BFF客户端类
 */
export class AssetBffService {
  /**
   * 批量查重预检
   * @param rawMd5List 待检测的未压缩原图MD5数组
   * @returns 匹配到的线上已存在资产列表
   */
  async precheck(rawMd5List: string[]): Promise<ExistAssetItem[]> {
    // 如果无入参则直接返回空数组
    if (!rawMd5List || rawMd5List.length === 0) {
      return []
    }

    try {
      // 检查接口 URL 是否有效就绪
      if (!API_CONFIG.BFF_PRECHECK_URL) {
        return []
      }

      // 发送POST请求至预检接口
      const response = await fetch(API_CONFIG.BFF_PRECHECK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rawMd5List }),
      })

      // 解析响应内容
      if (!response.ok) {
        console.warn(`[AssetBff] 查重预检请求响应异常: HTTP ${response.status}`)
        return []
      }

      const resJson = await response.json()
      // 提取接口命中列表
      return resJson?.data?.existsList || []
    } catch (error) {
      // 网络离线或环境未就绪时容错降级，避免阻断前端本地切图压缩流程
      console.warn('[AssetBff] 预检接口调用失败，降级跳过查重拦截:', error)
      return []
    }
  }

  /**
   * 批量上传成功后持久化元数据
   * @param assets 待入库的切图元数据列表
   * @returns 成功入库与更新的记录条数
   */
  async recordAssets(assets: AssetRecordPayload[]): Promise<number> {
    // 列表为空直接返回0
    if (!assets || assets.length === 0) {
      return 0
    }

    try {
      // 检查入库接口 URL 是否就绪
      if (!API_CONFIG.BFF_RECORD_URL) {
        return 0
      }

      // 调用批量入库接口
      const response = await fetch(API_CONFIG.BFF_RECORD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assets }),
      })

      if (!response.ok) {
        console.warn(`[AssetBff] 资产入库请求响应异常: HTTP ${response.status}`)
        return 0
      }

      const resJson = await response.json()
      return resJson?.data?.successCount || 0
    } catch (error) {
      console.error('[AssetBff] 资产持久化入库失败:', error)
      return 0
    }
  }

  /**
   * 分页拉取团队时间轴与统计看板
   * @param params 查询过滤参数
   * @returns 时间轴列表与宏观节省指标
   */
  async getTimeline(params: {
    page?: number
    pageSize?: number
    keyword?: string
    fileType?: string
    date?: string
    startDate?: string
    endDate?: string
    uploader?: string
    uploaderId?: string
  } = {}): Promise<TimelineResult> {
    try {
      // 拼装查询参数
      const query = new URLSearchParams()
      if (params.page) query.append('page', String(params.page))
      if (params.pageSize) query.append('pageSize', String(params.pageSize))
      if (params.keyword) query.append('keyword', params.keyword)
      if (params.fileType) query.append('fileType', params.fileType)
      if (params.date) query.append('date', params.date)
      if (params.startDate) query.append('startDate', params.startDate)
      if (params.endDate) query.append('endDate', params.endDate)
      if (params.uploader) query.append('uploader', params.uploader)
      if (params.uploaderId) query.append('uploaderId', params.uploaderId)

      // 检查时间轴接口 URL 是否有效
      const baseUrl = API_CONFIG.BFF_TIMELINE_URL
      if (!baseUrl) {
        return {
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
          stats: {
            totalCount: 0,
            totalRawSize: 0,
            totalOptSize: 0,
            savedBytes: 0,
          },
        }
      }

      const queryString = query.toString()
      const url = queryString ? `${baseUrl}?${queryString}` : baseUrl

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const resJson = await response.json()
      return (
        resJson?.data || {
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
          stats: {
            totalCount: 0,
            totalRawSize: 0,
            totalOptSize: 0,
            savedBytes: 0,
          },
        }
      )
    } catch (error) {
      console.warn('[AssetBff] 时间轴拉取失败，降级返回空状态:', error)
      return {
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        stats: {
          totalCount: 0,
          totalRawSize: 0,
          totalOptSize: 0,
          savedBytes: 0,
        },
      }
    }
  }

  /**
   * 静默同步用户信息与企微头像至BFF花名册镜像库
   * @param user 用户基础信息
   * @returns 是否同步成功
   */
  async syncUser(user: {
    userId: string
    username?: string
    name?: string
    avatar?: string
    email?: string
  }): Promise<boolean> {
    if (!user || !user.userId) return false
    // 检查同步接口 URL 是否就绪
    if (!API_CONFIG.BFF_SYNC_USER_URL) return false

    try {
      const response = await fetch(API_CONFIG.BFF_SYNC_USER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      })
      return response.ok
    } catch (error) {
      console.warn('[AssetBff] 静默同步用户信息降级:', error)
      return false
    }
  }

  /**
   * 修改云端切图资产文件名 (改库索引)
   * @param {string} rawMd5 - 原图MD5指纹或资产URL
   * @param {string} newFileName - 用户修改后的新文件名
   * @returns {Promise<boolean>} 是否修改成功
   */
  async renameAsset(rawMd5: string, newFileName: string): Promise<boolean> {
    // 检查必填入参
    if (!rawMd5 || !newFileName) {
      return false
    }
    // 检查更名接口 URL 是否就绪
    if (!API_CONFIG.BFF_RENAME_URL) {
      console.warn('[AssetBff] rename 接口地址未配置')
      return false
    }

    try {
      const response = await fetch(API_CONFIG.BFF_RENAME_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawMd5,
          newFileName,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const resJson = await response.json()
      // 判断接口返回业务状态码
      return resJson?.code === 0 || resJson?.status === 'success' || Boolean(resJson?.data)
    } catch (error) {
      console.error('[AssetBff] 切图重命名失败:', error)
      return false
    }
  }
}

/**
 * 导出全局单例BFF客户端服务
 */
export const assetBff = new AssetBffService()
