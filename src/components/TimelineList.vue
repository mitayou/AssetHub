<template>
  <div class="history-section">
    <div class="queue-toolbar" style="margin-top: 0;">
      <div class="toolbar-left">
        <h3 class="queue-heading">团队资产库</h3>
        <span class="queue-pill">{{ timelineData.total }} 项归档</span>
        <span v-if="savedText" class="queue-saved-pill">已省 {{ savedText }}</span>
      </div>
      <div class="toolbar-right">
        <!-- 1. 团队资产多字段联合搜索输入框 -->
        <div class="search-input-wrapper">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            v-model="searchKeyword"
            type="text"
            class="timeline-search-input"
            placeholder="搜索文件名 / URL / 上传人..."
            @input="handleSearchInput"
            @keydown.enter="handleSearchSubmit"
          />
          <button
            v-if="searchKeyword"
            class="clear-search-btn"
            title="清空搜索"
            @click="clearSearch"
          >
            ✕
          </button>
        </div>

        <!-- 2. 日期范围选择器 (高奢 Apple 毛玻璃微光日历) -->
        <CalendarRangePicker
          v-model="dateRange"
          @change="handleDateRangeChange"
        />

        <!-- 3. 文件格式筛选下拉胶囊 -->
        <div class="format-filter-wrapper" ref="formatWrapperRef">
          <button 
            class="format-trigger-btn"
            :class="{ 'is-active': selectedFormat !== 'all', 'is-open': isFormatOpen }"
            @click="isFormatOpen = !isFormatOpen"
            title="按切图文件格式筛选"
          >
            <span class="format-trigger-text">{{ currentFormatLabel }}</span>
            <span v-if="selectedFormat !== 'all'" class="clear-format-btn" title="清除格式筛选" @click.stop="clearFormat">
              ✕
            </span>
            <svg v-else class="trigger-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <!-- 格式下拉菜单浮层 -->
          <div v-if="isFormatOpen" class="format-dropdown-menu" @click.stop>
            <button 
              v-for="fmt in formatOptions" 
              :key="fmt.key"
              class="format-menu-item"
              :class="{ 'is-selected': selectedFormat === fmt.key }"
              @click="selectFormat(fmt.key)"
            >
              <span class="fmt-name">{{ fmt.label }}</span>
              <span v-if="fmt.desc" class="fmt-desc">{{ fmt.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 4. 现代化分段滑动选择器 (全员/我的) -->
        <div class="segmented-control">
          <button 
            :class="['segmented-btn', { active: filterScope === 'all' }]"
            @click="changeScope('all')"
          >
            全员资产
          </button>
          <button 
            :class="['segmented-btn', { active: filterScope === 'my' }]"
            @click="changeScope('my')"
          >
            我的上传
          </button>
        </div>

        <!-- 5. 一键重置全部筛选条件 (存在活跃条件时显现) -->
        <button 
          v-if="hasActiveFilters" 
          class="reset-filters-btn" 
          title="一键重置所有搜索和筛选条件"
          @click="resetAllFilters"
        >
          重置
        </button>
      </div>
    </div>

    <div class="table-card" style="padding: 26px;">
      <!-- 加载中动画占位 -->
      <div v-if="loading" class="timeline-loading">
        <div class="loading-spinner"></div>
        <span>正在同步云端切图资产看板...</span>
      </div>

      <!-- 时间轴内容区域 (有数据时) -->
      <div v-else-if="groupedTimelineList.length > 0" class="timeline-container">
        <!-- 多日期时间轴分组 -->
        <div 
          v-for="group in groupedTimelineList" 
          :key="group.dateKey" 
          class="timeline-group"
        >
          <!-- 仪式感时间轴节点与日期分组头部 -->
          <div class="timeline-header">
            <div class="timeline-dot-wrapper">
              <div class="timeline-dot-core"></div>
            </div>
            <div class="timeline-badge-group">
              <span 
                class="timeline-tag-pill" 
                :class="{ 
                  'is-today': group.isToday,
                  'is-yesterday': group.tagText === '昨天',
                  'is-history': group.tagText === '历史' 
                }"
              >
                {{ group.tagText }}
              </span>
              <span class="timeline-date-text">{{ group.dateText }}</span>
            </div>
            <span class="timeline-count-pill">共 {{ group.items.length }} 项切图</span>
          </div>

          <div class="history-grid">
            <div 
              v-for="item in group.items" 
              :key="item.rawMd5 || item.url" 
              :class="['gallery-card', { 'is-broken': isAssetBroken(item.url) }]"
            >
              <!-- 1. 柔光透明舞台 (摒弃刺眼深色棋盘格，改用微透光极浅网格与中心聚焦) -->
              <div 
                class="card-preview-stage" 
                :title="isAssetBroken(item.url) ? '该切图云端资源已不存在 (404)' : '点击查看全画幅高清大图与尺寸'"
                @click="handleCardPreviewClick(item)"
              >
                <!-- 状态 A: 切图资源 404 失效占位态 (彻底从 DOM 中卸载 img 标签杜绝重发死循环) -->
                <div v-if="isAssetBroken(item.url)" class="stage-broken-pod">
                  <div class="broken-icon-box">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 3"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                    </svg>
                  </div>
                  <span class="broken-title">资源已失效</span>
                  <span class="broken-code">404 Not Found</span>
                </div>

                <!-- 状态 B: 正常切图展示 (居中柔光底托) -->
                <div v-else class="stage-center-pod">
                  <img 
                    :src="getThumbnailUrl(item.url)" 
                    :alt="item.fileName" 
                    class="card-img"
                    loading="lazy"
                    @error="(e) => handleImageError(e, item)"
                  />
                </div>

                <!-- 左上角切图格式徽标 (晶莹高透磨砂徽章) -->
                <span :class="['format-badge', `format-${getFileExt(item.fileName).toLowerCase()}`]">
                  {{ getFileExt(item.fileName) }}
                </span>
                
                <!-- 悬浮微光放大提示遮罩 (仅未失效时呈现) -->
                <div v-if="!isAssetBroken(item.url)" class="stage-hover-overlay">
                  <span class="hover-view-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <span>查看大图</span>
                  </span>
                </div>

                <!-- 右上角智能优化比例徽章 -->
                <span v-if="item.ratio < 1" class="ratio-badge">
                  -{{ Math.round((1 - item.ratio) * 100) }}%
                </span>
              </div>

              <!-- 2. 下半部分：层次清晰的元数据区 -->
              <div class="card-body">
                <!-- 卡片文件名与行内修改铅笔按钮 (支持直接更新数据库索引) -->
                <div class="card-name-wrapper">
                  <!-- 常态展示：文件名与悬浮铅笔 -->
                  <div v-if="editingRawMd5 !== (item.rawMd5 || item.url)" class="card-name-row">
                    <span class="card-name" :title="item.fileName">
                      {{ item.fileName }}
                    </span>
                    <button 
                      class="card-rename-btn" 
                      title="修改切图文件名 (同步更新云端数据库索引)" 
                      @click.stop="startRename(item)"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  </div>

                  <!-- 编辑态：行内微编辑输入框与保存/取消按钮 -->
                  <div v-else class="card-name-edit-bar" @click.stop>
                    <div class="edit-input-wrap">
                      <input 
                        v-model="editingBaseName"
                        type="text" 
                        class="card-rename-input"
                        :placeholder="item.fileName"
                        :disabled="isRenaming"
                        @keydown.enter="saveRename(item)"
                        @keydown.esc="cancelRename"
                        ref="renameInputRef"
                      />
                      <span class="edit-ext-suffix">.{{ getFileExt(item.fileName).toLowerCase() }}</span>
                    </div>
                    <div class="edit-action-btns">
                      <button 
                        class="edit-action-btn confirm" 
                        :disabled="isRenaming || !editingBaseName.trim()" 
                        title="保存并更新云端索引 (Enter)"
                        @click="saveRename(item)"
                      >
                        <span v-if="isRenaming" class="mini-spinner"></span>
                        <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                      <button 
                        class="edit-action-btn cancel" 
                        :disabled="isRenaming" 
                        title="取消 (Esc)"
                        @click="cancelRename"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>

                <div class="card-meta-line">
                  <div class="card-size-group">
                    <span class="size-text">{{ formatSize(item.optSize || item.rawSize) }}</span>
                    <span v-if="item.width && item.height" class="dimen-text">
                      {{ item.width }}×{{ item.height }}
                    </span>
                  </div>

                  <!-- 上传人微型胶囊 (区分真人与系统) -->
                  <div class="uploader-tag" :title="`上传人: ${item.uploaderName || 'SYSTEM'}`">
                    <img 
                      v-if="item.uploaderAvatar" 
                      :src="item.uploaderAvatar" 
                      class="uploader-avatar-mini" 
                      alt="Avatar" 
                    />
                    <span v-else class="uploader-system-dot"></span>
                    <span class="uploader-name-text">{{ item.uploaderName || 'SYSTEM' }}</span>
                  </div>
                </div>

                <!-- 底部轻奢质感复制链接按钮 (复制原始纯净原图 URL) -->
                <button 
                  class="card-copy-btn" 
                  @click.stop="$emit('copy-url', item.url)"
                  title="复制原始公网 CDN 访问链接"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  <span>复制链接</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 触底状态与哨兵元素 -->
        <div class="timeline-footer">
          <!-- 正在加载下一页中指示器 -->
          <div v-if="loadingMore" class="loading-more-pill">
            <div class="loading-spinner-mini"></div>
            <span>正在加载历史切图资产...</span>
          </div>

          <!-- 全部加载完毕指示徽章 -->
          <div v-else-if="!hasMore" class="no-more-pill">
            <span>— 已加载全部 {{ timelineData.total }} 项切图资产 —</span>
          </div>

          <!-- 触底交叉监听哨兵元素 (用于 IntersectionObserver 检测) -->
          <div ref="sentinelRef" class="scroll-sentinel"></div>
        </div>
      </div>

      <!-- 时间轴空数据状态 -->
      <div v-else class="timeline-empty">
        <div class="empty-icon-tray">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <!-- 区分搜索无结果与常规暂无切图资产 -->
        <template v-if="searchKeyword">
          <p class="empty-text">未搜索到相关切图资产</p>
          <span class="empty-sub">没有找到与 “{{ searchKeyword }}” 匹配的文件名、URL 或上传人</span>
          <button class="empty-reset-btn" @click="clearSearch">清空搜索词</button>
        </template>
        <template v-else>
          <p class="empty-text">当前暂无切图资产归档</p>
          <span class="empty-sub">可通过“资源上传”模块录入并直传切图至云端</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { assetBff, TimelineResult, type ExistAssetItem } from '../services/assetBff'
import { formatBytes } from '../utils/format'
import { getCurrentUser } from '../utils/user'
import CalendarRangePicker, { type DateRangeValue } from './CalendarRangePicker.vue'

/**
 * 时间轴分组数据接口
 */
export interface TimelineGroup {
  /** 归档日期唯一键 (如 "2026-09-22") */
  dateKey: string
  /** 界面友好化显示标签 (如 "今天 (2026-09-22)") */
  displayDate: string
  /** 标签文本 (如 "今天" / "昨天" / "归档") */
  tagText: string
  /** 格式化日期文本 (如 "2026-09-22") */
  dateText: string
  /** 是否为今天 */
  isToday: boolean
  /** 当前日期分组下的切图资产列表 */
  items: ExistAssetItem[]
}

const emit = defineEmits<{
  /** 复制资产 URL */
  (e: 'copy-url', url: string): void
  /** 弹出轻提示 */
  (e: 'show-toast', msg: string): void
  /** 查看高清大图预览 */
  (e: 'open-preview', item: ExistAssetItem): void
}>()

/** 筛选范围 */
const filterScope = ref<'my' | 'all'>('all')
/** 初始首屏加载状态 */
const loading = ref(false)
/** 触底加载下一页状态 */
const loadingMore = ref(false)
/** 触底哨兵元素引用 */
const sentinelRef = ref<HTMLElement | null>(null)
/** 交叉观察器实例 */
let observer: IntersectionObserver | null = null
/** 模糊搜索关键词 (匹配文件名 / URL / 上传人) */
const searchKeyword = ref('')
/** 搜索输入防抖定时器 */
let searchTimer: ReturnType<typeof setTimeout> | null = null

/** 日历起止范围状态 */
const dateRange = ref<DateRangeValue>({ startDate: '', endDate: '' })

/** 选中的文件格式代号 (all/png/svg/webp/jpg/gif) */
const selectedFormat = ref<string>('all')
/** 是否展开格式筛选下拉菜单 */
const isFormatOpen = ref(false)
/** 格式下拉包装器引用 */
const formatWrapperRef = ref<HTMLElement | null>(null)

/** 格式筛选选项定义 */
const formatOptions = [
  { key: 'all', label: '全部格式', desc: '' },
  { key: 'png', label: 'PNG', desc: '透明切图' },
  { key: 'svg', label: 'SVG', desc: '矢量图形' },
  { key: 'webp', label: 'WebP', desc: '高压缩' },
  { key: 'jpg', label: 'JPG', desc: '摄影位图' },
  { key: 'gif', label: 'GIF', desc: '动态切图' },
]

/** 当前激活格式展示文案 */
const currentFormatLabel = computed(() => {
  const opt = formatOptions.find((o) => o.key === selectedFormat.value)
  return opt ? opt.label : '全部格式'
})

/** 是否存在任一处于激活状态的过滤条件 */
const hasActiveFilters = computed(() => {
  return Boolean(
    searchKeyword.value.trim() ||
    dateRange.value.startDate ||
    dateRange.value.endDate ||
    selectedFormat.value !== 'all' ||
    filterScope.value !== 'all'
  )
})

/** 当前正在行内重命名编辑的切图标识 (rawMd5 或 url) */
const editingRawMd5 = ref<string | null>(null)
/** 正在编辑中的基础文件名 (不带文件后缀) */
const editingBaseName = ref<string>('')
/** 正在提交改库更名的异步 loading 状态 */
const isRenaming = ref<boolean>(false)
/** 行内重命名输入框元素引用 */
const renameInputRef = ref<HTMLInputElement | null>(null)

/** 记录已降级尝试回退原图的资产 URL 映射表 (仅允许降级 1 次，防重试死循环) */
const retriedMap = ref<Record<string, boolean>>({})

/** 记录已不可逆熔断的 404 失效资产 URL 映射表 (驱动 DOM 卸载与缺省占位) */
const brokenMap = ref<Record<string, boolean>>({})

/**
 * 判断指定资产 URL 是否已确认在云端失效 (404)
 * @param {string} url - 资产公网地址
 * @returns {boolean} 是否已确定失效
 */
function isAssetBroken(url: string): boolean {
  // 检查是否在失效映射表中
  return Boolean(url && brokenMap.value[url])
}

/** 时间轴聚合数据 */
const timelineData = ref<TimelineResult>({
  list: [],
  total: 0,
  page: 1,
  pageSize: 24,
  stats: {
    totalCount: 0,
    totalRawSize: 0,
    totalOptSize: 0,
    savedBytes: 0,
  },
})

/** 业务切图展示列表 (写端已严格阻断测试沙箱切图入库，此处如实呈现云端返回的业务资产) */
const displayList = computed(() => {
  return timelineData.value.list || []
})

/** 是否还有更多历史资产可加载 */
const hasMore = computed(() => {
  // 当已有列表项数量小于后端记录总数时判定还有下一页
  return displayList.value.length < timelineData.value.total
})

/**
 * 将 Date 对象格式化为 YYYY-MM-DD 本地日期字符串
 * @param {Date} date - 目标日期对象
 * @returns {string} 格式化日期字符串
 */
function formatDateToStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 从资产对象提取归档日期标识
 * 核心逻辑：以 uploadDate 为主，若缺失则从 createTime 截取/解析本地日期
 * @param {ExistAssetItem} item - 资产对象
 * @returns {string} 归档日期字符串 (如 "2026-09-22")
 */
function getItemDateKey(item: ExistAssetItem): string {
  // 1. 优先提取服务端 uploadDate 字段 (标准 YYYY-MM-DD 格式)
  if (item.uploadDate && typeof item.uploadDate === 'string' && item.uploadDate.trim()) {
    return item.uploadDate.trim()
  }

  // 2. 兜底从 createTime 解析日期
  if (item.createTime) {
    // 若符合 YYYY-MM-DD 格式的前缀直接提取
    if (typeof item.createTime === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.createTime)) {
      return item.createTime.slice(0, 10)
    }
    try {
      const parsedDate = new Date(item.createTime)
      // 判断日期转换是否合法
      if (!isNaN(parsedDate.getTime())) {
        return formatDateToStr(parsedDate)
      }
    } catch {
      // 容错处理
    }
  }

  // 3. 极值兜底为未知归档
  return '未知日期'
}

/**
 * 格式化分组日期标题展示文案
 * @param {string} dateKey - 归档日期字符串 (如 "2026-09-22")
 * @returns {string} 友好化展示文本 (如 "今天 (2026-09-22)"、"昨天 (2026-09-21)")
 */
function formatGroupDate(dateKey: string): string {
  // 检查是否为未知日期
  if (!dateKey || dateKey === '未知日期') {
    return '历史归档'
  }

  const now = new Date()
  const todayKey = formatDateToStr(now)

  // 判断是否属于今天
  if (dateKey === todayKey) {
    return `今天 (${dateKey})`
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = formatDateToStr(yesterday)

  // 判断是否属于昨天
  if (dateKey === yesterdayKey) {
    return `昨天 (${dateKey})`
  }

  // 其余日期直接返回日期字符串
  return dateKey
}

/**
 * 提取切图文件名的大写扩展名格式
 * @param {string} fileName - 切图文件名
 * @returns {string} 格式大写文本 (如 PNG, WEBP, SVG)
 */
function getFileExt(fileName: string): string {
  // 检查文件名有效性
  if (!fileName) return 'IMG'
  const parts = fileName.split('.')
  // 若包含后缀则截取大写形式
  if (parts.length > 1) {
    return parts.pop()!.toUpperCase().slice(0, 4)
  }
  return 'IMG'
}

/**
 * 按日期时间轴收纳聚合的分组资产列表
 * 保持时间倒序排列，每个分组包含专属日期标题与资产列表
 */
const groupedTimelineList = computed<TimelineGroup[]>(() => {
  const groups: TimelineGroup[] = []
  const groupMap = new Map<string, TimelineGroup>()

  const now = new Date()
  const todayKey = formatDateToStr(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = formatDateToStr(yesterday)

  // 遍历展示列表按归档日期逐项收纳
  for (const item of displayList.value) {
    const dateKey = getItemDateKey(item)
    let group = groupMap.get(dateKey)
    // 如果该日期的分组尚未创建，则初始化该分组并按顺序推入
    if (!group) {
      const isToday = dateKey === todayKey
      const isYesterday = dateKey === yesterdayKey
      const tagText = isToday ? '今天' : isYesterday ? '昨天' : '历史'

      group = {
        dateKey,
        displayDate: formatGroupDate(dateKey),
        tagText,
        dateText: dateKey,
        isToday,
        items: [],
      }
      groupMap.set(dateKey, group)
      groups.push(group)
    }
    // 将资产存入对应日期分组中
    group.items.push(item)
  }

  return groups
})

/** 节省带宽流量文本 (基于纯净业务资产动态统计) */
const savedText = computed(() => {
  const saved = displayList.value.reduce((acc, item) => {
    const raw = item.rawSize || 0
    const opt = item.optSize || raw
    return acc + Math.max(0, raw - opt)
  }, 0)
  // 仅在存在节省字节时展示，不存在时隐藏徽章
  if (saved > 0) {
    return formatBytes(saved)
  }
  return ''
})

/**
 * 格式化字节尺寸
 * @param {number} bytes - 字节数
 * @returns {string} 格式化尺寸
 */
function formatSize(bytes: number): string {
  return formatBytes(bytes)
}

/**
 * 为切图公网地址智能追加腾讯云数据万象 (CI) 快速缩略图参数
 * @description 长边等比缩放至 320px，q85 质量，自动转为高压缩率 WebP，保留完整轮廓不切边，节约 95% 预览流量
 * @param {string} rawUrl - 原始图片公网地址
 * @returns {string} 优化后的缩略图地址
 */
function getThumbnailUrl(rawUrl: string): string {
  // 检查 URL 有效性
  if (!rawUrl) return ''
  const clean = rawUrl.toLowerCase().split('?')[0]
  // 排除 SVG 矢量图与 GIF 动图 (原样加载保持清晰与动效)
  if (clean.endsWith('.svg') || clean.endsWith('.gif')) {
    return rawUrl
  }
  // 若原 URL 已包含图片处理参数则不再重复追加
  if (rawUrl.includes('imageView2') || rawUrl.includes('imageMogr2')) {
    return rawUrl
  }
  const separator = rawUrl.includes('?') ? '&' : '?'
  return `${rawUrl}${separator}imageView2/2/w/320/h/320/format/webp/q/85`
}

/**
 * 缩略图加载失败时的单次降级与彻底熔断防死循环机制
 * @description 缩略图 404 时仅允许单次降级尝试原图；若原图亦 404 或无缩略图，立即不可逆熔断，清空并卸载 img 标签，杜绝浏览器无限死循环卡死
 * @param {Event} e - 图片加载错误事件
 * @param {ExistAssetItem} item - 当前资产条目对象
 */
function handleImageError(e: Event, item: ExistAssetItem) {
  const target = e.target as HTMLImageElement
  // 检查目标 DOM 节点有效性
  if (!target || !item || !item.url) {
    return
  }

  const rawUrl = item.url
  const hasRetried = Boolean(retriedMap.value[rawUrl])
  const currentSrc = target.src || ''

  // 判定当前请求是否为腾讯云数据万象缩略图处理路径 (带 imageView2 或 imageMogr2)
  const isThumbnailUrl = currentSrc.includes('imageView2') || currentSrc.includes('imageMogr2')

  // 若为缩略图且从未尝试过降级回退，则执行单次原图降级
  if (isThumbnailUrl && !hasRetried) {
    // 标记已回退过 1 次
    retriedMap.value[rawUrl] = true
    // 将图片地址指向原图
    target.src = rawUrl
    return
  }

  // 触发终极熔断：终止后续可能产生的一切网络重发
  target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  // 标记为彻底失效条目，Vue 响应式将直接销毁 img DOM 节点并切换为失效占位态
  brokenMap.value[rawUrl] = true
}

/**
 * 点击卡片舞台触发全屏大图预览
 * @param {ExistAssetItem} item - 当前资产条目
 */
function handleCardPreviewClick(item: ExistAssetItem) {
  // 若切图已失效则拦截大图预览并弹出友好提示
  if (isAssetBroken(item.url)) {
    emit('show-toast', '该切图云端资源已不存在 (404)，无法查看大图')
    return
  }
  // 正常发射打开预览事件
  emit('open-preview', item)
}

/**
 * 切换筛选范围
 * @param {'my' | 'all'} scope - 筛选范围
 */
/**
 * 响应日期范围组件值更新并重新拉取列表
 * @param {DateRangeValue} val - 最新的日期范围
 */
function handleDateRangeChange(val: DateRangeValue) {
  dateRange.value = val
  loadTimeline()
}

/**
 * 选中特定切图格式并触发重新拉取
 * @param {string} fmtKey - 格式键名
 */
function selectFormat(fmtKey: string) {
  selectedFormat.value = fmtKey
  isFormatOpen.value = false
  loadTimeline()
}

/**
 * 清除文件格式筛选条件
 */
function clearFormat() {
  selectedFormat.value = 'all'
  isFormatOpen.value = false
  loadTimeline()
}

/**
 * 一键重置全部多维筛选条件至默认状态
 */
function resetAllFilters() {
  searchKeyword.value = ''
  dateRange.value = { startDate: '', endDate: '' }
  selectedFormat.value = 'all'
  filterScope.value = 'all'
  isFormatOpen.value = false
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  loadTimeline()
}

/**
 * 启动卡片切图行内更名编辑
 * @param {ExistAssetItem} item - 目标切图对象
 */
function startRename(item: ExistAssetItem) {
  editingRawMd5.value = item.rawMd5 || item.url
  const ext = getFileExt(item.fileName).toLowerCase()
  const regex = new RegExp(`\\.${ext}$`, 'i')
  editingBaseName.value = item.fileName.replace(regex, '')
  nextTick(() => {
    if (renameInputRef.value) {
      renameInputRef.value.focus()
      renameInputRef.value.select()
    }
  })
}

/**
 * 取消当前正在进行的更名编辑
 */
function cancelRename() {
  editingRawMd5.value = null
  editingBaseName.value = ''
  isRenaming.value = false
}

/**
 * 保存修改后的文件名并原子更新云端数据库索引
 * @param {ExistAssetItem} item - 目标切图对象
 */
async function saveRename(item: ExistAssetItem) {
  const trimmed = editingBaseName.value.trim()
  // 内容为空时取消退出
  if (!trimmed) {
    cancelRename()
    return
  }

  const ext = getFileExt(item.fileName).toLowerCase()
  const newFileName = `${trimmed}.${ext}`

  // 未做任何修改直接退出
  if (newFileName === item.fileName) {
    cancelRename()
    return
  }

  isRenaming.value = true
  try {
    const key = item.rawMd5 || item.url
    const success = await assetBff.renameAsset(key, newFileName)
    if (success) {
      // 本地响应式同步更新该卡片显示的文件名
      item.fileName = newFileName
      emit('show-toast', '切图文件名已更新，已同步至云端索引')
      cancelRename()
    } else {
      emit('show-toast', '更名失败，请稍后重试')
    }
  } catch (error) {
    console.error('[TimelineList] 更名处理失败:', error)
    emit('show-toast', '更名异常')
  } finally {
    isRenaming.value = false
  }
}

/**
 * 监听搜索框输入，执行 300ms 防抖查询
 */
function handleSearchInput() {
  // 清理前置未触发的定时器
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    loadTimeline()
  }, 300)
}

/**
 * 用户按回车立即触发搜索
 */
function handleSearchSubmit() {
  // 立即清除防抖定时器并直接发起请求
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  loadTimeline()
}

/**
 * 一键清空搜索关键词并重置列表
 */
function clearSearch() {
  // 检查是否已有输入内容
  if (!searchKeyword.value) {
    return
  }
  searchKeyword.value = ''
  // 清除防抖定时器
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  loadTimeline()
}

/**
 * 切换筛选范围
 * @param {'my' | 'all'} scope - 筛选范围
 */
async function changeScope(scope: 'my' | 'all') {
  // 判断若切换至个人资产且未登录，提示用户并保持在全员资产
  if (scope === 'my' && !getCurrentUser()?.userId) {
    emit('show-toast', '当前处于未登录状态，无法筛选个人资产')
    filterScope.value = 'all'
    return
  }
  filterScope.value = scope
  await loadTimeline()
}

/**
 * 触底加载下一页历史资产
 */
async function loadMore() {
  // 如果处于初始加载中、触底加载中或已没有更多数据，则拦截退出
  if (loading.value || loadingMore.value || !hasMore.value) {
    return
  }

  loadingMore.value = true
  const nextPage = timelineData.value.page + 1

  try {
    const res = await assetBff.getTimeline({
      page: nextPage,
      pageSize: timelineData.value.pageSize,
      // 透传模糊检索关键词
      keyword: searchKeyword.value.trim() || undefined,
      // 透传日期范围筛选
      startDate: dateRange.value.startDate || undefined,
      endDate: dateRange.value.endDate || undefined,
      // 透传格式筛选
      fileType: selectedFormat.value !== 'all' ? selectedFormat.value : undefined,
      // 安全读取当前登录用户工号进行权限隔离
      uploaderId: filterScope.value === 'my' ? (getCurrentUser()?.userId || undefined) : undefined,
    })

    // 判断若返回列表且包含条目
    if (res && res.list && res.list.length > 0) {
      // 提取已有项唯一特征进行防重过滤
      const existingKeys = new Set(timelineData.value.list.map((i) => i.rawMd5 || i.url))
      const newItems = res.list.filter((i) => !existingKeys.has(i.rawMd5 || i.url))

      // 追加新条目
      timelineData.value.list.push(...newItems)
      timelineData.value.page = nextPage
      timelineData.value.total = res.total
      // 更新统计指标
      if (res.stats) {
        timelineData.value.stats = res.stats
      }
    } else {
      // 若后端返回空列表，修正当前总数以关闭 hasMore
      timelineData.value.total = timelineData.value.list.length
    }
  } catch (error) {
    console.warn('[TimelineList] 加载下一页时间轴异常:', error)
  } finally {
    loadingMore.value = false
  }
}

/**
 * 重新关联哨兵元素至交叉观察器
 */
function reobserveSentinel() {
  // 检查观察器与哨兵元素是否存在
  if (observer && sentinelRef.value) {
    observer.disconnect()
    observer.observe(sentinelRef.value)
  }
}

/**
 * 初始化触底交叉观察器
 */
function initIntersectionObserver() {
  // 检查运行环境是否支持 IntersectionObserver
  if (typeof IntersectionObserver === 'undefined') {
    return
  }

  // 销毁可能存在的旧实例
  if (observer) {
    observer.disconnect()
  }

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      // 当触底哨兵元素进入视口且存在未加载数据时触发
      if (entry && entry.isIntersecting) {
        loadMore()
      }
    },
    {
      root: null,
      // 提前 200px 预触发，实现无缝平滑滚动
      rootMargin: '200px 0px',
      threshold: 0,
    }
  )

  // 观察哨兵元素
  if (sentinelRef.value) {
    observer.observe(sentinelRef.value)
  }
}

/**
 * 从 BFF 拉取时间轴看板首屏数据
 */
async function loadTimeline() {
  loading.value = true
  try {
    const res = await assetBff.getTimeline({
      page: 1,
      pageSize: 24,
      // 透传模糊检索关键词
      keyword: searchKeyword.value.trim() || undefined,
      // 透传日期范围筛选
      startDate: dateRange.value.startDate || undefined,
      endDate: dateRange.value.endDate || undefined,
      // 透传格式筛选
      fileType: selectedFormat.value !== 'all' ? selectedFormat.value : undefined,
      // 安全读取当前登录用户的工号
      uploaderId: filterScope.value === 'my' ? (getCurrentUser()?.userId || undefined) : undefined,
    })
    // 检查响应有效性
    if (res && res.list) {
      timelineData.value = res
    }
  } catch (error) {
    console.warn('[TimelineList] 加载时间轴失败，使用默认展示:', error)
  } finally {
    loading.value = false
    // 界面更新后重新关联哨兵观察
    nextTick(() => {
      reobserveSentinel()
    })
  }
}

/**
 * 点击页面外部区域关闭格式下拉菜单
 * @param {MouseEvent} e - 鼠标点击事件
 */
function handleTimelineDocClick(e: MouseEvent) {
  if (!isFormatOpen.value) return
  if (formatWrapperRef.value && !formatWrapperRef.value.contains(e.target as Node)) {
    isFormatOpen.value = false
  }
}

onMounted(() => {
  initIntersectionObserver()
  loadTimeline()
  document.addEventListener('click', handleTimelineDocClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleTimelineDocClick)
  // 组件卸载时断开观察器，杜绝内存泄漏
  if (observer) {
    observer.disconnect()
    observer = null
  }
  // 清理未决的搜索防抖定时器
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})
</script>

<style scoped>
.queue-toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.queue-heading {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-main);
}

.queue-pill {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
  padding: 2px 10px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}

.queue-saved-pill {
  background: var(--state-green-bg);
  color: var(--state-green);
  border: 1px solid var(--state-green-border);
  padding: 2px 10px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 文件格式筛选胶囊容器 */
.format-filter-wrapper {
  position: relative;
  display: inline-block;
  user-select: none;
}

.format-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--text-muted, #64748b);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.format-trigger-btn:hover {
  border-color: rgba(0, 163, 79, 0.35);
  color: var(--text-title, #1e293b);
  background: #ffffff;
}

.format-trigger-btn.is-active,
.format-trigger-btn.is-open {
  background: rgba(240, 253, 244, 0.95);
  border-color: rgba(0, 163, 79, 0.4);
  color: var(--brand-primary, #00a34f);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 163, 79, 0.12);
}

.clear-format-btn {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 163, 79, 0.15);
  color: var(--brand-primary, #00a34f);
  font-size: 9px;
  transition: all 0.15s ease;
}

.clear-format-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.format-dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 100;
  min-width: 140px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 12px 28px -6px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.format-menu-item {
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.format-menu-item:hover {
  background: rgba(0, 163, 79, 0.08);
  color: var(--brand-primary, #00a34f);
}

.format-menu-item.is-selected {
  background: var(--brand-primary, #00a34f);
  color: #ffffff;
  font-weight: 600;
}

.format-menu-item .fmt-desc {
  font-size: 10px;
  opacity: 0.65;
}

/* 一键重置全部筛选条件按钮 */
.reset-filters-btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px dashed rgba(239, 68, 68, 0.35);
  background: rgba(254, 242, 242, 0.6);
  color: #ef4444;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.reset-filters-btn:hover {
  background: #fee2e2;
  border-color: #ef4444;
}

/* 现代化 iOS 质感分段滑动选择器 (高斯毛玻璃通透微光) */
.segmented-control {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  padding: 3px;
  border-radius: 10px;
  gap: 2px;
  height: 34px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.segmented-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 0 14px;
  height: 100%;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.segmented-btn:hover {
  color: var(--text-title);
}

.segmented-btn.active {
  background: #ffffff;
  color: var(--brand-primary);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08), 0 1px 1px rgba(0, 0, 0, 0.04);
}

.table-card {
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow: 0 10px 30px -10px rgba(15, 23, 42, 0.04);
  min-height: 180px;
}

.timeline-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid rgba(0, 163, 79, 0.15);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.timeline-container {
  position: relative;
}

.timeline-group {
  border-left: 2px solid rgba(0, 163, 79, 0.16);
  padding-left: 24px;
  position: relative;
  /* 增加分组下间距使垂直时间轴自然贯穿 */
  padding-bottom: 36px;
}

.timeline-group:last-of-type {
  padding-bottom: 16px;
}

/* 时间轴节点与日期分组头部 */
.timeline-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.timeline-dot-wrapper {
  position: absolute;
  left: -7px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(0, 163, 79, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px #ffffff;
}

.timeline-dot-core {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-primary);
}

.timeline-badge-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.timeline-tag-pill {
  padding: 2px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  transition: all 0.2s ease;
  background: rgba(100, 116, 139, 0.08);
  color: #64748b;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

/* 今天：鲜活薄荷翠绿微光 */
.timeline-tag-pill.is-today {
  background: var(--state-green-bg);
  color: var(--brand-primary);
  border: 1px solid var(--state-green-border);
  box-shadow: 0 2px 6px rgba(0, 163, 79, 0.12);
}

/* 昨天：澄澈晴空天青蓝 */
.timeline-tag-pill.is-yesterday {
  background: rgba(14, 165, 233, 0.08);
  color: #0284c7;
  border: 1px solid rgba(14, 165, 233, 0.22);
  box-shadow: 0 2px 6px rgba(14, 165, 233, 0.08);
}

/* 历史：冷石青灰微蓝高奢半透胶囊 (告别生硬死灰) */
.timeline-tag-pill.is-history {
  background: rgba(100, 116, 139, 0.09);
  color: #475569;
  border: 1px solid rgba(148, 163, 184, 0.28);
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
}

.timeline-date-text {
  font-weight: 700;
  color: var(--text-title);
  font-size: 14px;
  letter-spacing: -0.2px;
}

.timeline-count-pill {
  font-size: 12px;
  color: var(--text-light);
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 8px;
  border-radius: 12px;
}

/* 时间轴画廊响应式网格布局 */
.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 18px;
}

/* 画廊单张切图卡片 (高奢白底与悬浮呼吸感) */
.gallery-card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.gallery-card:hover {
  transform: translateY(-4px);
  border-color: rgba(0, 163, 79, 0.3);
  box-shadow: 0 12px 28px -6px rgba(0, 163, 79, 0.12), 0 4px 12px rgba(0, 0, 0, 0.03);
}

/* 404 失效切图卡片样式 (优雅微透降级，避免破坏整体网格序列) */
.gallery-card.is-broken {
  opacity: 0.78;
  border-color: rgba(226, 232, 240, 0.9);
}

.gallery-card.is-broken:hover {
  transform: translateY(-2px);
  border-color: rgba(239, 68, 68, 0.35);
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.08);
}

/* 1. 柔和微透舞台 (摒弃刺眼黑白棋盘格，改用极淡微距微网格与柔和承托) */
.card-preview-stage {
  height: 140px;
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
  cursor: pointer;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  /* 极浅透明微网格，彻底消除刺眼噪点 */
  background-color: #fbfcfd;
  background-image: 
    linear-gradient(45deg, rgba(226, 232, 240, 0.35) 25%, transparent 25%), 
    linear-gradient(-45deg, rgba(226, 232, 240, 0.35) 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, rgba(226, 232, 240, 0.35) 75%), 
    linear-gradient(-45deg, transparent 75%, rgba(226, 232, 240, 0.35) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}

/* 404 失效舞台占位容器 (微光磨砂空状态) */
.stage-broken-pod {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  user-select: none;
}

.broken-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.06);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  border: 1px solid rgba(239, 68, 68, 0.16);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.05);
}

.broken-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.2px;
}

.broken-code {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: #94a3b8;
  font-weight: 500;
}

.stage-center-pod {
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.05));
}

.card-img {
  max-width: 100%;
  max-height: 116px;
  object-fit: contain;
  display: block;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.gallery-card:hover .card-img {
  transform: scale(1.06);
}

/* 切图格式标签徽标 (高奢晶莹磨砂晶体徽章) */
.format-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  letter-spacing: 0.5px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  z-index: 2;
  transition: all 0.2s ease;
  /* 基础默认高透白底微边框 */
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.95);
  color: #475569;
}

/* PNG: 典雅薄荷青绿晶体 */
.format-badge.format-png {
  background: rgba(236, 253, 245, 0.9);
  color: #059669;
  border-color: rgba(16, 185, 129, 0.25);
}

/* SVG: 灵动活力琥珀金晶体 */
.format-badge.format-svg {
  background: rgba(254, 243, 199, 0.9);
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.25);
}

/* WEBP: 科技青碧蓝晶体 */
.format-badge.format-webp {
  background: rgba(240, 253, 250, 0.9);
  color: #0d9488;
  border-color: rgba(20, 184, 166, 0.25);
}

/* JPG / JPEG: 晴空微蓝晶体 */
.format-badge.format-jpg,
.format-badge.format-jpeg {
  background: rgba(239, 246, 255, 0.9);
  color: #2563eb;
  border-color: rgba(59, 130, 246, 0.25);
}

/* GIF: 幻紫微粉晶体 */
.format-badge.format-gif {
  background: rgba(253, 242, 248, 0.9);
  color: #db2777;
  border-color: rgba(236, 72, 153, 0.25);
}

/* 悬浮微光放大提示遮罩 */
.stage-hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.gallery-card:hover .stage-hover-overlay {
  opacity: 1;
}

.hover-view-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transform: translateY(4px);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.gallery-card:hover .hover-view-pill {
  transform: translateY(0);
}

/* 优化节省比率徽章 */
.ratio-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(16, 185, 129, 0.9);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
  z-index: 2;
}

/* 2. 下半部分：辅助信息区 */
.card-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #ffffff;
  flex: 1;
}

/* 卡片文件名包裹区与行内铅笔编辑 */
.card-name-wrapper {
  position: relative;
  min-height: 24px;
  display: flex;
  align-items: center;
}

.card-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 4px;
}

.card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
  flex: 1;
}

.card-rename-btn {
  border: none;
  background: transparent;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.gallery-card:hover .card-rename-btn {
  opacity: 0.85;
}

.card-rename-btn:hover {
  opacity: 1 !important;
  color: var(--brand-primary, #00a34f);
  background: rgba(0, 163, 79, 0.1);
}

/* 行内微编辑面板 */
.card-name-edit-bar {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 4px;
  background: #f8fafc;
  border: 1px solid rgba(0, 163, 79, 0.4);
  border-radius: 6px;
  padding: 2px 4px;
  box-shadow: 0 0 0 2px rgba(0, 163, 79, 0.1);
  box-sizing: border-box;
}

.edit-input-wrap {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.card-rename-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: #1e293b;
  width: 100%;
  padding: 0;
}

.edit-ext-suffix {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
  padding-right: 2px;
  user-select: none;
}

.edit-action-btns {
  display: flex;
  align-items: center;
  gap: 2px;
}

.edit-action-btn {
  border: none;
  background: transparent;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-action-btn.confirm {
  background: var(--brand-primary, #00a34f);
  color: #ffffff;
}

.edit-action-btn.confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.edit-action-btn.confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.edit-action-btn.cancel {
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
}

.edit-action-btn.cancel:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.mini-spinner {
  width: 8px;
  height: 8px;
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.card-meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.card-size-group {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

.size-text {
  color: var(--state-green);
  font-weight: 600;
}

.dimen-text {
  color: var(--text-light);
  font-size: 10px;
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 5px;
  border-radius: 4px;
}

/* 上传人微型胶囊 */
.uploader-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 6px;
  border-radius: 10px;
  max-width: 90px;
}

.uploader-avatar-mini {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.uploader-system-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #94a3b8;
  display: inline-block;
  flex-shrink: 0;
}

.uploader-name-text {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 底部轻奢质感复制链接按钮 */
.card-copy-btn {
  margin-top: 4px;
  width: 100%;
  height: 30px;
  background: rgba(0, 163, 79, 0.05);
  border: 1px solid rgba(0, 163, 79, 0.12);
  border-radius: 8px;
  color: var(--brand-primary);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.card-copy-btn:hover {
  background: var(--brand-primary);
  color: #ffffff;
  border-color: var(--brand-primary);
  box-shadow: 0 3px 10px rgba(0, 163, 79, 0.25);
}

.timeline-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon-tray {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-title);
  margin: 0 0 6px 0;
}

.empty-sub {
  font-size: 12px;
  color: var(--text-muted);
}

/* 触底底部控制与加载指示区 */
.timeline-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 0 8px;
  position: relative;
}

.scroll-sentinel {
  width: 100%;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.loading-more-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 7px 18px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.loading-spinner-mini {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 163, 79, 0.2);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.no-more-pill {
  font-size: 12px;
  color: var(--text-light);
  padding: 8px 16px;
  letter-spacing: 0.3px;
}

/* 顶部工具栏搜索框 (彻底修复 z-index 放大镜遮挡) */
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 11px;
  color: #94a3b8;
  pointer-events: none;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.timeline-search-input {
  width: 240px;
  height: 34px;
  padding: 0 30px 0 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  font-size: 12px;
  color: var(--text-main);
  outline: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.85);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.timeline-search-input:hover {
  background: rgba(255, 255, 255, 0.65);
  border-color: rgba(0, 163, 79, 0.3);
}

.timeline-search-input:focus {
  width: 280px;
  border-color: var(--brand-primary);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 3px rgba(0, 163, 79, 0.15), 0 4px 16px rgba(0, 163, 79, 0.06);
}

.search-input-wrapper:focus-within .search-icon {
  color: var(--brand-primary);
}

.timeline-search-input::placeholder {
  color: var(--text-light);
  font-size: 11px;
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 2;
  transition: all 0.15s ease;
}

.clear-search-btn:hover {
  background: rgba(0, 0, 0, 0.18);
  color: var(--text-title);
}

.empty-reset-btn {
  margin-top: 12px;
  padding: 5px 14px;
  border-radius: 16px;
  border: 1px solid var(--brand-primary);
  background: rgba(0, 163, 79, 0.08);
  color: var(--brand-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.empty-reset-btn:hover {
  background: var(--brand-primary);
  color: #ffffff;
}

@media (max-width: 768px) {
  .timeline-search-input {
    width: 160px;
  }
  .timeline-search-input:focus {
    width: 200px;
  }
}
</style>
