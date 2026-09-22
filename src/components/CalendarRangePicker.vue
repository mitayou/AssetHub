<template>
  <div class="calendar-range-wrapper" ref="wrapperRef">
    <!-- 1. 触发胶囊按钮 (高奢毛玻璃药丸) -->
    <button 
      class="range-trigger-btn" 
      :class="{ 'is-active': isActive, 'is-open': isOpen }" 
      @click="toggleDropdown"
      title="点击展开日期范围日历选择"
    >
      <svg class="trigger-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="trigger-text">{{ displayLabel }}</span>
      <span v-if="isActive" class="clear-range-btn" title="清空日期筛选" @click.stop="clearRange">
        ✕
      </span>
      <svg v-else class="trigger-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <!-- 2. 下拉毛玻璃日历选择弹层 -->
    <div v-if="isOpen" class="calendar-popover" @click.stop>
      <!-- 快捷时间预设胶囊区 -->
      <div class="presets-bar">
        <button 
          v-for="p in presets" 
          :key="p.key"
          class="preset-chip" 
          :class="{ 'is-selected': activePreset === p.key }"
          @click="applyPreset(p.key)"
        >
          {{ p.label }}
        </button>
      </div>

      <!-- 月历头部导航条 -->
      <div class="calendar-nav">
        <button class="nav-arrow-btn" title="上个月" @click="prevMonth">‹</button>
        <span class="current-month-label">{{ currentYear }} 年 {{ currentMonth + 1 }} 月</span>
        <button class="nav-arrow-btn" :disabled="isNextMonthDisabled" title="下个月" @click="nextMonth">›</button>
      </div>

      <!-- 星期表头 -->
      <div class="calendar-week-header">
        <span v-for="w in weekDays" :key="w" class="week-cell">{{ w }}</span>
      </div>

      <!-- 日期网格 -->
      <div class="calendar-days-grid" @mouseleave="hoverDateStr = ''">
        <div 
          v-for="(d, idx) in monthDays" 
          :key="idx" 
          class="day-cell-wrapper"
          :class="{
            'in-range': d.dateStr && isInRange(d.dateStr),
            'range-start': d.dateStr && d.dateStr === tempStart,
            'range-end': d.dateStr && d.dateStr === (tempEnd || hoverDateStr),
            'is-future': d.isFuture,
            'is-empty': !d.dateStr
          }"
          @mouseenter="onDateHover(d.dateStr)"
          @click="onDateClick(d)"
        >
          <span 
            v-if="d.dateStr" 
            class="day-number" 
            :class="{ 
              'is-today': d.isToday,
              'is-selected': d.dateStr === tempStart || d.dateStr === tempEnd
            }"
          >
            {{ d.day }}
          </span>
        </div>
      </div>

      <!-- 底部状态条与确定按钮 -->
      <div class="calendar-footer">
        <div class="footer-tip">
          <span v-if="tempStart && tempEnd">
            {{ tempStart }} ~ {{ tempEnd }}
          </span>
          <span v-else-if="tempStart">
            请点选截止日期...
          </span>
          <span v-else class="text-placeholder">
            点击日历点选起止区间
          </span>
        </div>
        <div class="footer-actions">
          <button class="footer-btn reset" @click="clearRange">清空</button>
          <button class="footer-btn confirm" :disabled="!tempStart" @click="confirmCustomRange">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

export interface DateRangeValue {
  /** 起始日期 YYYY-MM-DD */
  startDate: string
  /** 截止日期 YYYY-MM-DD */
  endDate: string
}

const props = withDefaults(
  defineProps<{
    modelValue: DateRangeValue
  }>(),
  {
    modelValue: () => ({ startDate: '', endDate: '' }),
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: DateRangeValue): void
  (e: 'change', val: DateRangeValue): void
}>()

/** 外层包裹容器元素引用 */
const wrapperRef = ref<HTMLElement | null>(null)
/** 是否展开下拉面板 */
const isOpen = ref(false)
/** 当前活跃的快捷预设标识 */
const activePreset = ref<string>('all')

/** 临时选中的起始日期 */
const tempStart = ref('')
/** 临时选中的截止日期 */
const tempEnd = ref('')
/** 鼠标悬浮滑过的临时目标日期 */
const hoverDateStr = ref('')

/** 当前月历展示年份 */
const currentYear = ref(new Date().getFullYear())
/** 当前月历展示月份 (0~11) */
const currentMonth = ref(new Date().getMonth())

/** 星期标头列表 */
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

/** 快捷预设列表定义 */
const presets = [
  { key: 'all', label: '全部时间' },
  { key: 'today', label: '今天' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'month', label: '本月' },
]

/**
 * 将 Date 对象规整为 YYYY-MM-DD 本地字符串
 * @param {Date} d - 目标日期对象
 * @returns {string} 格式化日期字符串
 */
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${date}`
}

/** 获取今天标准字符串 */
const todayStr = toDateStr(new Date())

/** 是否已应用了非全部时间的过滤 */
const isActive = computed(() => {
  return Boolean(props.modelValue.startDate || props.modelValue.endDate)
})

/** 触发胶囊展示文案 */
const displayLabel = computed(() => {
  if (!isActive.value) {
    return '全部时间'
  }
  const { startDate, endDate } = props.modelValue
  if (startDate && endDate) {
    if (startDate === endDate) {
      return startDate === todayStr ? '今天' : startDate
    }
    // 简写显示月日
    const s = startDate.slice(5)
    const e = endDate.slice(5)
    return `${s} ~ ${e}`
  }
  if (startDate) return `${startDate} 起`
  return `${endDate} 止`
})

/** 下个月按钮是否禁用 (不可跳转至未来月份) */
const isNextMonthDisabled = computed(() => {
  const now = new Date()
  return currentYear.value > now.getFullYear() || (currentYear.value === now.getFullYear() && currentMonth.value >= now.getMonth())
})

/** 月历网格单日数据结构 */
interface DayCell {
  day: number
  dateStr: string
  isToday: boolean
  isFuture: boolean
}

/** 当前月份对应的日历格子矩阵 */
const monthDays = computed<DayCell[]>(() => {
  const y = currentYear.value
  const m = currentMonth.value
  const firstDayWeek = new Date(y, m, 1).getDay()
  const lastDate = new Date(y, m + 1, 0).getDate()

  const list: DayCell[] = []

  // 前置空白格子
  for (let i = 0; i < firstDayWeek; i++) {
    list.push({ day: 0, dateStr: '', isToday: false, isFuture: false })
  }

  // 本月各天
  for (let d = 1; d <= lastDate; d++) {
    const dObj = new Date(y, m, d)
    const dateStr = toDateStr(dObj)
    list.push({
      day: d,
      dateStr,
      isToday: dateStr === todayStr,
      isFuture: dateStr > todayStr,
    })
  }

  return list
})

/**
 * 判断指定日期是否处于当前选区范围内 (高亮连线)
 * @param {string} dateStr - 待检测日期字符串
 * @returns {boolean} 是否在范围内
 */
function isInRange(dateStr: string): boolean {
  if (!tempStart.value) return false
  const end = tempEnd.value || hoverDateStr.value
  if (!end) {
    return dateStr === tempStart.value
  }
  const [minD, maxD] = tempStart.value <= end ? [tempStart.value, end] : [end, tempStart.value]
  return dateStr >= minD && dateStr <= maxD
}

/**
 * 切换下拉面板显隐
 */
function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    // 同步当前外部入参到临时选择变量
    tempStart.value = props.modelValue.startDate || ''
    tempEnd.value = props.modelValue.endDate || ''
    // 若已有起止日期，月历默认跳转至起始日期所在月份
    if (tempStart.value) {
      const p = new Date(tempStart.value)
      if (!isNaN(p.getTime())) {
        currentYear.value = p.getFullYear()
        currentMonth.value = p.getMonth()
      }
    }
  }
}

/**
 * 切换至上一个月份
 */
function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

/**
 * 切换至下一个月份
 */
function nextMonth() {
  if (isNextMonthDisabled.value) return
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

/**
 * 鼠标悬浮在某个日期上
 * @param {string} dateStr - 日期字符串
 */
function onDateHover(dateStr: string) {
  // 仅在已选中起点但未选择终点时触发悬浮预览
  if (tempStart.value && !tempEnd.value && dateStr) {
    hoverDateStr.value = dateStr
  }
}

/**
 * 点击日历上的某个日期格子
 * @param {DayCell} cell - 点击的格子
 */
function onDateClick(cell: DayCell) {
  if (!cell.dateStr || cell.isFuture) return

  // 状态 1: 尚未选起点，或已完整选定区间，则此次点击作为新的起点
  if (!tempStart.value || (tempStart.value && tempEnd.value)) {
    tempStart.value = cell.dateStr
    tempEnd.value = ''
    activePreset.value = 'custom'
    return
  }

  // 状态 2: 已有起点，点击选定终点
  if (tempStart.value && !tempEnd.value) {
    if (cell.dateStr < tempStart.value) {
      tempEnd.value = tempStart.value
      tempStart.value = cell.dateStr
    } else {
      tempEnd.value = cell.dateStr
    }
    hoverDateStr.value = ''
  }
}

/**
 * 应用快捷预设时间
 * @param {string} key - 预设代号
 */
function applyPreset(key: string) {
  activePreset.value = key
  const now = new Date()

  if (key === 'all') {
    tempStart.value = ''
    tempEnd.value = ''
    confirmSelection('', '')
    return
  }

  if (key === 'today') {
    tempStart.value = todayStr
    tempEnd.value = todayStr
    confirmSelection(todayStr, todayStr)
    return
  }

  if (key === '7d') {
    const s = new Date()
    s.setDate(now.getDate() - 6)
    const sStr = toDateStr(s)
    tempStart.value = sStr
    tempEnd.value = todayStr
    confirmSelection(sStr, todayStr)
    return
  }

  if (key === '30d') {
    const s = new Date()
    s.setDate(now.getDate() - 29)
    const sStr = toDateStr(s)
    tempStart.value = sStr
    tempEnd.value = todayStr
    confirmSelection(sStr, todayStr)
    return
  }

  if (key === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    const sStr = toDateStr(s)
    tempStart.value = sStr
    tempEnd.value = todayStr
    confirmSelection(sStr, todayStr)
    return
  }
}

/**
 * 确认自定义选择的起止区间并触发回调
 */
function confirmCustomRange() {
  if (!tempStart.value) return
  const s = tempStart.value
  const e = tempEnd.value || tempStart.value
  confirmSelection(s, e)
}

/**
 * 统一提交日期范围变更
 * @param {string} startDate - 起始日期
 * @param {string} endDate - 截止日期
 */
function confirmSelection(startDate: string, endDate: string) {
  const payload: DateRangeValue = { startDate, endDate }
  emit('update:modelValue', payload)
  emit('change', payload)
  isOpen.value = false
}

/**
 * 一键清空日期范围筛选
 */
function clearRange() {
  tempStart.value = ''
  tempEnd.value = ''
  hoverDateStr.value = ''
  activePreset.value = 'all'
  confirmSelection('', '')
}

/**
 * 点击页面任意外部区域收起日历弹层
 * @param {MouseEvent} e - 鼠标点击事件
 */
function handleDocumentClick(e: MouseEvent) {
  if (!isOpen.value) return
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})

// 监听外部 modelValue 变更同步快捷预设高亮
watch(
  () => props.modelValue,
  (val) => {
    if (!val.startDate && !val.endDate) {
      activePreset.value = 'all'
    }
  },
  { deep: true, immediate: true }
)
</script>

<style scoped>
.calendar-range-wrapper {
  position: relative;
  display: inline-block;
  user-select: none;
}

/* 1. 触发胶囊样式 (高奢 Apple 微光药丸) */
.range-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
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

.range-trigger-btn:hover {
  border-color: rgba(0, 163, 79, 0.35);
  color: var(--text-title, #1e293b);
  background: #ffffff;
}

/* 激活或展开状态微光高亮 */
.range-trigger-btn.is-active,
.range-trigger-btn.is-open {
  background: rgba(240, 253, 244, 0.95);
  border-color: rgba(0, 163, 79, 0.4);
  color: var(--brand-primary, #00a34f);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 163, 79, 0.12);
}

.trigger-icon {
  flex-shrink: 0;
  opacity: 0.85;
}

.trigger-text {
  letter-spacing: -0.1px;
}

.trigger-chevron {
  opacity: 0.6;
  transition: transform 0.2s ease;
}

.range-trigger-btn.is-open .trigger-chevron {
  transform: rotate(180deg);
}

.clear-range-btn {
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

.clear-range-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* 2. 下拉毛玻璃日历弹层面板 */
.calendar-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 100;
  width: 280px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 14px;
  box-shadow: 
    0 16px 36px -8px rgba(15, 23, 42, 0.12),
    0 4px 12px rgba(0, 0, 0, 0.04);
  animation: popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes popoverFadeIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 顶部快捷时间预设芯片行 */
.presets-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-bottom: 12px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.preset-chip {
  border: none;
  background: rgba(100, 116, 139, 0.07);
  color: #475569;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-chip:hover {
  background: rgba(0, 163, 79, 0.12);
  color: var(--brand-primary, #00a34f);
}

.preset-chip.is-selected {
  background: var(--brand-primary, #00a34f);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 163, 79, 0.25);
}

/* 月历导航条 */
.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 4px;
}

.current-month-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-title, #1e293b);
  letter-spacing: -0.2px;
}

.nav-arrow-btn {
  border: none;
  background: transparent;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 15px;
  line-height: 1;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.nav-arrow-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

.nav-arrow-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* 星期头部 */
.calendar-week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 4px;
}

.week-cell {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  padding: 4px 0;
}

/* 日期网格 */
.calendar-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 3px;
}

.day-cell-wrapper {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.day-cell-wrapper.is-empty {
  pointer-events: none;
}

.day-cell-wrapper.is-future {
  opacity: 0.28;
  cursor: not-allowed;
}

/* 范围高亮连线背景条 */
.day-cell-wrapper.in-range {
  background: rgba(0, 163, 79, 0.1);
}

.day-cell-wrapper.range-start {
  border-top-left-radius: 16px;
  border-bottom-left-radius: 16px;
}

.day-cell-wrapper.range-end {
  border-top-right-radius: 16px;
  border-bottom-right-radius: 16px;
}

.day-number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  transition: all 0.15s ease;
  position: relative;
  z-index: 1;
}

.day-cell-wrapper:hover:not(.is-future) .day-number {
  background: rgba(0, 163, 79, 0.15);
  color: var(--brand-primary, #00a34f);
}

/* 今天标记 */
.day-number.is-today::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--brand-primary, #00a34f);
}

/* 起点或终点选中核心 */
.day-number.is-selected {
  background: var(--brand-primary, #00a34f) !important;
  color: #ffffff !important;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 163, 79, 0.35);
}

/* 底部状态条与确认 */
.calendar-footer {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-tip {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  letter-spacing: -0.2px;
}

.text-placeholder {
  color: #94a3b8;
  font-weight: 400;
}

.footer-actions {
  display: flex;
  gap: 6px;
}

.footer-btn {
  border: none;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.footer-btn.reset {
  background: rgba(100, 116, 139, 0.08);
  color: #64748b;
}

.footer-btn.reset:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.footer-btn.confirm {
  background: var(--brand-primary, #00a34f);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 163, 79, 0.2);
}

.footer-btn.confirm:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.footer-btn.confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}
</style>
