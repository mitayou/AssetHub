<template>
  <!-- 专为导航栏透光穿透设计的高位极光底衬 -->
  <div class="nav-aurora-backdrop"></div>

  <!-- 顶部极致高透光导航栏 (Apple Liquid Glass Navigation) -->
  <header class="navbar">
    <div class="brand-box">
      <!-- 品牌 Logo：支持配置图片 URL (自动自适应显示) 或单字 (生机绿微压印方圆) -->
      <img 
        v-if="isImageLogo(brandLogo) && !isLogoLoadFailed" 
        class="logo-image" 
        :src="brandLogo" 
        :alt="brandTitle"
        @error="isLogoLoadFailed = true"
      />
      <div v-else class="logo-squircle">
        {{ brandLogoText }}
      </div>
      <div class="brand-text">
        <h1>{{ brandTitle }}</h1>
        <p>{{ brandSubtitle }}</p>
      </div>
    </div>

    <!-- 苹果原生极简分段控制器 (纯文字，无任何多余图标) -->
    <div class="segmented-control">
      <button 
        :class="['segment-btn', { active: modelValue === 'upload' }]"
        @click="$emit('update:modelValue', 'upload')"
      >
        <span>资源上传</span>
      </button>
      <button 
        :class="['segment-btn', { active: modelValue === 'history' }]"
        @click="$emit('update:modelValue', 'history')"
      >
        <span>团队资产库</span>
      </button>
    </div>

    <!-- 右侧状态胶囊与用户信息 -->
    <div class="header-right">
      <!-- 动态 COS 授权状态指示胶囊 -->
      <!-- 状态 0：未配置外部 targets 预设 -->
      <div 
        v-if="!isCosConfigured" 
        class="status-capsule unconfigured" 
        title="尚未在 app-config.js 中配置有效的目标存储桶 (targets)"
      >
        <span class="pulse-dot warning"></span>
        <span>未配置环境</span>
      </div>
      <div 
        v-else-if="cosAuthStatus === 'READY'" 
        class="status-capsule ready" 
        title="STS 临时凭据已获取并在有效期内"
      >
        <span class="pulse-dot green"></span>
        <span>COS 授权就绪</span>
      </div>
      <div 
        v-else-if="cosAuthStatus === 'EXPIRED'" 
        class="status-capsule expired" 
        title="STS 临时凭据已超出有效时长"
      >
        <span class="pulse-dot amber"></span>
        <span>COS 凭证过期</span>
      </div>
      <div 
        v-else 
        class="status-capsule unauthorized" 
        title="尚未获取 COS 临时访问凭证"
      >
        <span class="pulse-dot gray"></span>
        <span>COS 未授权</span>
      </div>

      <!-- 用户信息展示区 (区分登录与未登录) -->
      <div 
        v-if="userInfo && userInfo.userId" 
        class="user-pill" 
        :title="`已登录 | 工号: ${userInfo.userId || userInfo.workNo || ''}`"
      >
        <img 
          class="user-avatar" 
          :src="userInfo.avatar || DEFAULT_AVATAR" 
          alt="Avatar"
          @error="onAvatarError"
        />
        <div class="user-meta">
          <span class="user-name">{{ userInfo.name || '已登录用户' }}</span>
          <span class="user-code">{{ userInfo.userId || userInfo.workNo || '' }}</span>
        </div>
      </div>

      <!-- 未登录状态轻量卡片 -->
      <div 
        v-else 
        class="user-pill unlogin" 
        title="当前处于未登录状态，仅开放看板查看与画质比对，暂无法直接上传切图"
      >
        <img 
          class="user-avatar unlogin-avatar" 
          :src="ANONYMOUS_AVATAR" 
          alt="未登录"
        />
        <div class="user-meta">
          <span class="user-name unlogin-title">未登录</span>
          <span class="user-code unlogin-hint">只读模式</span>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { IUserInfo } from '../types/asset'
import type { CosAuthStatus } from '../services/cosUploader'
import { isCosConfigured } from '../config/cosTargets'
import { brandTitle, brandSubtitle, brandLogo, isImageLogo } from '../config/appBrand'

/** 自定义图片 Logo 加载是否失败标志 (若加载失败自动回退为微压印文字 Logo) */
const isLogoLoadFailed = ref(false)

/**
 * 提取微压印方圆 Logo 显示字符 (大写单字或短词)
 */
const brandLogoText = computed(() => {
  if (isLogoLoadFailed.value) {
    return (brandTitle.value.trim().charAt(0) || 'A').toUpperCase()
  }
  const raw = brandLogo.value.trim()
  if (raw.length <= 2) {
    return raw.toUpperCase()
  }
  return raw.charAt(0).toUpperCase()
})

/** 本地默认兜底头像 (纯内联 SVG Data URI，免任何网络请求，保证断网零报错) */
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="%23E0F9E9"/><path d="M16 8a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm-7 14.5c0-2.8 3.1-4.5 7-4.5s7 1.7 7 4.5V24H9v-1.5z" fill="%2300A34F"/></svg>'

/** 未登录匿名头像 (纯内联中性灰 SVG Data URI) */
const ANONYMOUS_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="%23F1F5F9"/><path d="M16 8a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm-7 14.5c0-2.8 3.1-4.5 7-4.5s7 1.7 7 4.5V24H9v-1.5z" fill="%2394A3B8"/></svg>'

defineProps<{
  /** 当前选中的 Tab */
  modelValue: 'upload' | 'history'
  /** 用户信息 (允许为 null 代表未登录) */
  userInfo: IUserInfo | null
  /** COS 凭证授权状态 */
  cosAuthStatus?: CosAuthStatus
}>()

defineEmits<{
  /** 切换 Tab */
  (e: 'update:modelValue', val: 'upload' | 'history'): void
}>()

/**
 * 头像图片加载失败兜底处理
 * @param {Event} event - 图片错误事件对象
 */
function onAvatarError(event: Event) {
  const target = event.target as HTMLImageElement
  // 注销错误监听，彻底阻断无限递归重试
  target.onerror = null
  // 替换为本地内联 SVG Data URI 兜底头像
  target.src = DEFAULT_AVATAR
}
</script>

<style scoped>
/* 导航栏背后极光流光衬底 (契合企业品牌绿色调) */
.nav-aurora-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 96px;
  pointer-events: none;
  z-index: 50;
  background: radial-gradient(ellipse 75% 70px at 50% 0%, rgba(0, 163, 79, 0.15), rgba(0, 140, 60, 0.08), transparent);
}

.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--glass-nav);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid rgba(255, 255, 255, 0.85);
  padding: 0 clamp(20px, 4vw, 40px);
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 
    inset 0 1px 0 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 0 0 rgba(0, 0, 0, 0.02),
    0 4px 24px rgba(0, 0, 0, 0.025);
}

.brand-box {
  display: flex;
  align-items: center;
  gap: 12px;
  user-select: none;
}

/* 品牌专属高奢生机绿微压印 Logo (字母/短词) */
.logo-squircle {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.5px;
  box-shadow: 0 2px 8px rgba(0, 163, 79, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

/* 自定义品牌图片 Logo */
.logo-image {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  object-fit: contain;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: block;
  flex-shrink: 0;
}

.brand-text h1 {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--text-title);
  line-height: 1.2;
}

.brand-text p {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.segmented-control {
  display: flex;
  background: rgba(0, 0, 0, 0.045);
  padding: 3px;
  border-radius: 11px;
  gap: 2px;
}

.segment-btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s var(--ease-spring);
}

.segment-btn.active {
  background: #ffffff;
  color: var(--text-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.02);
}

.segment-btn:hover:not(.active) {
  color: var(--text-title);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-capsule {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.25s ease;
}

.status-capsule.unconfigured {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.28);
  color: #d97706;
}

.status-capsule.ready {
  background: var(--state-green-bg);
  border: 1px solid var(--state-green-border);
  color: var(--state-green);
}

.status-capsule.expired {
  background: var(--state-amber-bg);
  border: 1px solid var(--state-amber-border);
  color: var(--state-amber);
}

.status-capsule.unauthorized {
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #64748b;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.pulse-dot.warning {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
}

.pulse-dot.green {
  background: var(--state-green);
  box-shadow: 0 0 8px rgba(0, 140, 60, 0.6);
}

.pulse-dot.amber {
  background: var(--state-amber);
  box-shadow: 0 0 8px rgba(217, 119, 6, 0.6);
}

.pulse-dot.gray {
  background: #94a3b8;
  box-shadow: none;
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 12px 3px 3px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--glass-border-subtle);
  transition: all 0.2s ease;
}

.user-pill.unlogin {
  border: 1px dashed rgba(148, 163, 184, 0.45);
  background: rgba(248, 250, 252, 0.7);
}

.unlogin-title {
  color: var(--text-muted);
}

.unlogin-hint {
  color: var(--text-light);
  font-size: 10px;
}

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid #ffffff;
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.user-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.user-code {
  font-size: 10px;
  color: var(--text-light);
  font-family: var(--font-code);
}
</style>
