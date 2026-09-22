<template>
  <!-- 弹窗 2: 代码生成器 -->
  <div v-if="visible" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card" style="max-width: 650px;">
      <div class="modal-header">
        <h4>交付代码生成器</h4>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="code-nav-tabs">
          <button 
            :class="['code-tab-pill', { active: codeFormat === 'const' }]" 
            @click="codeFormat = 'const'"
          >
            小程序常量
          </button>
          <button 
            :class="['code-tab-pill', { active: codeFormat === 'wxml' }]" 
            @click="codeFormat = 'wxml'"
          >
            WXML 组件
          </button>
          <button 
            :class="['code-tab-pill', { active: codeFormat === 'css' }]" 
            @click="codeFormat = 'css'"
          >
            CSS 背景
          </button>
          <button 
            :class="['code-tab-pill', { active: codeFormat === 'url' }]" 
            @click="codeFormat = 'url'"
          >
            纯链接
          </button>
        </div>

        <pre class="code-display-block">{{ currentCode }}</pre>

        <!-- 弹窗底部操作区 (新版柔和暮山黛主按钮) -->
        <div style="margin-top: 22px; display: flex; justify-content: flex-end; gap: 10px;">
          <button class="apple-btn apple-btn-secondary" @click="$emit('close')">
            取消
          </button>
          <button class="apple-btn apple-btn-primary" @click="handleCopy">
            <span>复制配置</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { IQueueItem } from '../types/asset'
import { generateCodeSnippet } from '../utils/format'

const props = defineProps<{
  /** 弹窗显隐 */
  visible: boolean
  /** 当前切图项 */
  item: IQueueItem | null
}>()

const emit = defineEmits<{
  /** 关闭弹窗 */
  (e: 'close'): void
  /** 复制完成事件 */
  (e: 'copy', text: string): void
}>()

/** 代码格式选择 */
const codeFormat = ref<'const' | 'wxml' | 'css' | 'url'>('const')

/** 当前实时生成的代码片段 */
const currentCode = computed(() => {
  if (!props.item) return ''
  return generateCodeSnippet(props.item, codeFormat.value)
})

/** 复制当前代码 */
function handleCopy() {
  emit('copy', currentCode.value)
  emit('close')
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(9, 13, 22, 0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-xl);
  width: 100%;
  box-shadow: 0 24px 60px -15px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  padding: 18px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h4 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.modal-body {
  padding: 24px;
}

.code-nav-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.04);
  padding: 3px;
  border-radius: 9px;
  gap: 3px;
  margin-bottom: 14px;
}

.code-tab-pill {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.code-tab-pill.active {
  background: #ffffff;
  color: var(--text-main);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.code-display-block {
  background: #1e293b;
  border-radius: 12px;
  padding: 16px;
  font-family: var(--font-code);
  font-size: 12px;
  color: #f1f5f9;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.apple-btn {
  padding: 9px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--ease-spring);
}

.apple-btn:active {
  transform: scale(0.98);
}

.apple-btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: var(--btn-primary-inner-light), var(--btn-primary-shadow);
}

.apple-btn-primary:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--btn-primary-inner-light), var(--btn-primary-hover-shadow);
  transform: translateY(-1px);
}

.apple-btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  border: var(--btn-secondary-border);
  box-shadow: var(--btn-secondary-shadow);
}

.apple-btn-secondary:hover {
  background: var(--btn-secondary-hover);
  border-color: var(--btn-secondary-border-hover);
  box-shadow: 0 3px 8px rgba(15, 118, 110, 0.08);
  transform: translateY(-1px);
}
</style>
