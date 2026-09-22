<template>
  <div class="apple-select-container" ref="containerRef">
    <!-- 下拉触发器按钮 -->
    <div 
      class="apple-select-trigger" 
      :class="{ active: isOpen, disabled }" 
      @click="toggleDropdown"
    >
      <span v-if="prefixLabel" class="prefix-label">{{ prefixLabel }}</span>
      <span class="selected-label">{{ currentLabel }}</span>
      <!-- 顺滑旋转微箭头 -->
      <svg 
        class="chevron-arrow" 
        :class="{ rotated: isOpen }" 
        viewBox="0 0 12 12" 
        width="12" 
        height="12"
      >
        <path 
          d="M2.5 4.5L6 8L9.5 4.5" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="1.6" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <!-- 高奢液态毛玻璃下拉面板 -->
    <transition name="dropdown-pop">
      <div v-if="isOpen" class="apple-select-dropdown">
        <div 
          v-for="opt in options" 
          :key="opt.value" 
          class="dropdown-option"
          :class="{ selected: opt.value === modelValue }"
          @click="selectOption(opt.value)"
        >
          <span class="option-text">{{ opt.label }}</span>
          <span v-if="opt.value === modelValue" class="check-icon">✓</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

export interface ISelectOption {
  label: string
  value: string | number
}

const props = withDefaults(
  defineProps<{
    /** 当前选中的值 */
    modelValue: string | number
    /** 下拉选项集合 */
    options: ISelectOption[]
    /** 前置小标签文案（例如“画质”、“超时”） */
    prefixLabel?: string
    /** 是否处于禁用态 */
    disabled?: boolean
  }>(),
  {
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'change', value: string | number): void
}>()

/** 下拉菜单展开收起状态 */
const isOpen = ref(false)

/** 容器 DOM 引用用于检测外部点击 */
const containerRef = ref<HTMLElement | null>(null)

/** 当前选中项的文案 */
const currentLabel = computed(() => {
  const matched = props.options.find((o) => o.value === props.modelValue)
  return matched ? matched.label : String(props.modelValue)
})

/**
 * 切换下拉面板展开状态
 */
function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

/**
 * 用户选中某个选项
 * @param {string | number} val - 选中的值
 */
function selectOption(val: string | number) {
  isOpen.value = false
  emit('update:modelValue', val)
  emit('change', val)
}

/**
 * 全局点击外部区域自动收起下拉面板
 */
function handleDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false
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
.apple-select-container {
  position: relative;
  display: inline-block;
  user-select: none;
}

/**
 * 触发器按钮：遵循 Apple 晶透冷白设计规范
 */
.apple-select-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--btn-secondary-bg, rgba(255, 255, 255, 0.72));
  border: var(--btn-secondary-border, 1px solid rgba(255, 255, 255, 0.95));
  box-shadow: var(--btn-secondary-shadow, 0 1px 3px rgba(0, 0, 0, 0.04));
  padding: 6px 12px;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: all 0.2s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
  font-size: 13px;
  color: var(--text-main, #222222);
}

.apple-select-trigger:hover:not(.disabled) {
  background: var(--btn-secondary-hover, rgba(255, 255, 255, 0.92));
  border-color: var(--btn-secondary-border-hover, rgba(0, 163, 79, 0.3));
  box-shadow: 0 3px 10px rgba(0, 163, 79, 0.08);
}

.apple-select-trigger.active {
  border-color: var(--brand-primary, #00A34F);
  box-shadow: 0 0 0 3px rgba(0, 163, 79, 0.12);
  background: #ffffff;
}

.apple-select-trigger.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.prefix-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #666666);
}

.selected-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main, #222222);
  letter-spacing: -0.2px;
}

.chevron-arrow {
  color: var(--text-light, #999999);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.chevron-arrow.rotated {
  transform: rotate(180deg);
  color: var(--brand-primary, #00A34F);
}

/**
 * 下拉面板：Apple 晶透液态高透毛玻璃浮层
 */
.apple-select-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: 260px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(190%) contrast(102%);
  -webkit-backdrop-filter: blur(20px) saturate(190%) contrast(102%);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 
    0 12px 32px -4px rgba(0, 0, 0, 0.12),
    0 4px 12px -2px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 5px;
  z-index: 250;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/**
 * 选项条目
 */
.dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #222222);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.dropdown-option:hover {
  background: rgba(0, 163, 79, 0.08);
  color: var(--brand-primary, #00A34F);
}

.dropdown-option.selected {
  background: var(--brand-light, #E0F9E9);
  color: var(--brand-primary, #00A34F);
  font-weight: 700;
}

.check-icon {
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-primary, #00A34F);
}

/**
 * 展开/收起过渡动效
 */
.dropdown-pop-enter-active,
.dropdown-pop-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top center;
}

.dropdown-pop-enter-from,
.dropdown-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
</style>
