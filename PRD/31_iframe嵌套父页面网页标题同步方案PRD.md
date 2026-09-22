# 需求文档 (PRD 31)：iframe 嵌套父页面网页标题同步方案

## 一、需求背景

在大型企业中台或综合研发效能门户中，AssetHub 静态资源效能工作台经常被作为微前端或子模块系统，通过 `<iframe>` 的形式嵌入到宿主门户系统（如研发效能平台、协同工作台、低代码设计器等）中运行。

在 iframe 嵌入模式下，浏览器外层主窗口标签页所展示的 `document.title` 默认由父页面控制。如果子系统加载后未向父级同步标题，用户在浏览器 Tab 标签栏中只能看到外部门户的通用标题，无法直观识别当前正在使用的具体微应用（如“AssetHub - 静态资源效能工作台”），损害了多标签页切换时的工效学体验。

因此，用户明确提出：
> “本项目可能被嵌套在其他页面，以iframe的形式打开，需要同步修改父页面的网页title，与当前项目一致”

---

## 二、目标与原则

1. **标题可信源动态感知**：
   - 网页标题优先从单一外部交付配置 `window.__ASSET_HUB_CONFIG__.title` 中读取，支持运维和实施团队在 `app-config.js` 中随时定制；
   - 外部未声明时，安全回退到当前页面已有的 `document.title` 或默认品牌名称 `AssetHub - 静态资源效能工作台`。
2. **iframe 拓扑智能自适应**：
   - **同源嵌套场景**：直接安全穿透修改顶层 `window.top.document.title` 与父级 `window.parent.document.title`，实时生效；
   - **跨域嵌套场景**：利用标准化 `postMessage` 向父级/顶层派发结构化消息 `{ type: 'SET_PAGE_TITLE', action: 'UPDATE_TITLE', title, source: 'ASSET_HUB' }`，供具备跨域安全通信机制的宿主页面自动监听并赋值；
   - **全链路 try-catch 防护**：跨域安全策略拦截（`SecurityError`）时静默容错降级，严禁因跨域权限问题阻断子系统的任何正常渲染与业务逻辑。
3. **极早生命周期注入**：
   - 在应用入口 `src/main.ts` 执行的第一时间即完成标题同步，杜绝白屏阶段的标题闪烁；
   - 在主视图组件 `src/App.vue` 挂载 `onMounted` 阶段执行二次确认，确保标题状态恒定对齐。

---

## 三、架构设计与核心实现

### 1. 标题提取与跨文档同步工具 (`src/utils/title.ts`)

```typescript
export interface ITitleSyncMessage {
  type: string
  action: string
  title: string
  source: string
}

export function getAppTitle(): string {
  const runtimeTitle = (typeof window !== 'undefined' && window.__ASSET_HUB_CONFIG__?.title)
    ? window.__ASSET_HUB_CONFIG__.title.trim()
    : ''
  if (runtimeTitle) return runtimeTitle
  if (typeof document !== 'undefined' && document.title && document.title.trim()) {
    return document.title.trim()
  }
  return 'AssetHub - 静态资源效能工作台'
}

export function syncPageTitle(customTitle?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const targetTitle = customTitle?.trim() || getAppTitle()
  document.title = targetTitle

  // 判断是否在 iframe 中
  const isNestedInIframe = window.self !== window.top || window.parent !== window
  if (!isNestedInIframe) return

  // 同源穿透
  let syncDirectSuccess = false
  try {
    if (window.top && window.top.document) {
      window.top.document.title = targetTitle
      syncDirectSuccess = true
    }
  } catch (err) {}

  if (!syncDirectSuccess) {
    try {
      if (window.parent && window.parent.document) {
        window.parent.document.title = targetTitle
        syncDirectSuccess = true
      }
    } catch (err) {}
  }

  // 跨域 postMessage 派发
  try {
    const messagePayload: ITitleSyncMessage = {
      type: 'SET_PAGE_TITLE',
      action: 'UPDATE_TITLE',
      title: targetTitle,
      source: 'ASSET_HUB',
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(messagePayload, '*')
    }
    if (window.top && window.top !== window.parent && window.top !== window) {
      window.top.postMessage(messagePayload, '*')
    }
  } catch (err) {}
}
```

---

## 四、验收标准

1. **独立访问模式**：直接通过浏览器打开项目，`document.title` 正确显示为 `window.__ASSET_HUB_CONFIG__.title` 或默认标题；
2. **同源 iframe 嵌套模式**：在宿主页面通过 `<iframe src="..."></iframe>` 引入本项目，页面加载完成后宿主页面的 `document.title` 自动同步变为子页面的标题；
3. **跨域 iframe 嵌套模式**：在不同域名的宿主页面中嵌入，控制台零安全报错，且能收到包含当前标题的 `postMessage` 事件。
