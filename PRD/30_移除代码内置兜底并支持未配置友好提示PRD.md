# 需求文档 (PRD 30)：移除代码内置兜底并支持未配置友好提示

## 一、需求背景

在之前的版本迭代中，为了防止由于外部未引入 `app-config.js` 导致的前端页面白屏，代码中在 `src/config/cosTargets.ts` 中维护了一份静态保底预设集 `DEFAULT_TARGET_PRESETS`（包含百果园生产图床与测试沙箱桶等配置），并在 `src/config/apiConfig.ts` 中定义了兜底的 API 地址。

然而，在生产交付与私有化部署场景中，这种“代码内置优雅保底”存在潜在风险与困扰：
1. **运维排障困惑**：当外部配置文件写错或路径失效时，系统默默降级并使用代码内部写死的兜底桶，导致用户和实施人员无法直观发现“配置未生效”的问题；
2. **企业数据隔离安全**：避免在任何情况下误往代码硬编码的存储桶上传数据；
3. **真实反映配置状态**：用户明确要求“不希望代码中兜底，直接读config就行，如果没有配置config，界面提示未配置”。

---

## 二、目标与原则

1. **彻底移除代码内置兜底**：
   - 彻底删除 `DEFAULT_TARGET_PRESETS`；
   - 移除 `apiConfig.ts` 中的生产与测试地址写死兜底；
   - 存储桶目标（`targets`）与业务目录（`prodDirPresets`）100% 仅从 `window.__ASSET_HUB_CONFIG__` 获取，若未声明则视为空集合。
2. **多层级防空与状态感知**：
   - 导出全局响应式计算属性 `isCosConfigured`；
   - `currentCosTarget` 在无配置时优雅返回 `null`；
   - 所有依赖存储桶目标的服务、工具函数均做好 `null` 校验与防空保护。
3. **高质感多维度的界面“未配置”提示**：
   - **全局警示横幅（Banner）**：在主内容区顶部展示美观精致的毛玻璃警示卡片，明确告知未配置并提供配置指引；
   - **导航栏状态胶囊**：右上角呈现“⚠️ 未配置环境”中性态指示；
   - **环境选择器**：下拉框显示“未配置环境”并置灰；
   - **上传目录胶囊**：展示“⚠️ 未配置目录”；
   - **主操作按钮**：上传按钮禁用，展示“未配置环境”；
   - **全链路拦截**：拦截未配置状态下的查重预检与上传操作，并通过 Toast 弹出友好提示。

---

## 三、系统架构与接口设计

### 1. 配置读取与状态定义 (`cosTargets.ts`)

```typescript
// 安全读取外部单一可信源
const runtimeConfig = (typeof window !== 'undefined' && window.__ASSET_HUB_CONFIG__) ? window.__ASSET_HUB_CONFIG__ : {}

// 仅从外部配置获取，无兜底
export const COS_TARGET_PRESETS: ICosTargetPreset[] = (
  Array.isArray(runtimeConfig.targets) && runtimeConfig.targets.length > 0
) ? runtimeConfig.targets : []

// 仅从外部配置获取常用目录，无兜底
export const PROD_DIR_PRESETS: string[] = (
  Array.isArray(runtimeConfig.prodDirPresets) && runtimeConfig.prodDirPresets.length > 0
) ? runtimeConfig.prodDirPresets : []

// 全局响应式计算属性：判断是否已成功配置有效的存储桶目标
export const isCosConfigured = computed<boolean>(() => COS_TARGET_PRESETS.length > 0)

// 当前激活的目标预设 (当未配置时为 null)
export const currentCosTarget = computed<ICosTargetPreset | null>(() => {
  if (COS_TARGET_PRESETS.length === 0) {
    return null
  }
  const match = COS_TARGET_PRESETS.find((p) => p.id === activeTargetId.value)
  return match || COS_TARGET_PRESETS[0] || null
})
```

---

## 四、界面展示规范

### 1. 全局警示横幅
- **样式**：柔和琥珀色/中性微光毛玻璃卡片（`border: 1px solid rgba(245, 158, 11, 0.25); background: rgba(254, 243, 199, 0.5)`）；
- **图标**：`⚠️`
- **标题**：“未检测到存储桶配置”
- **说明**：“系统未读取到有效的 COS 目标配置。请在 `app-config.js` 的 `targets` 数组中配置存储桶与接口参数，保存并刷新网页即可生效。”

### 2. 状态胶囊与操作按钮
- **导航栏**：展示 `未配置环境` 胶囊（灰色脉冲微点）；
- **工具栏**：环境选择器置灰并展示 `未配置环境`；目录展示 `⚠️ 未配置目录`；上传按钮置灰并显示 `未配置环境`。

---

## 五、验收标准

1. 代码内完全不存在写死的存储桶（如 `fastdfs-prod-1251596386`、`test--dskhd--cos-1317204308`）与接口网关兜底；
2. 当 `app-config.js` 正常配置时，工作台功能正常无缝运作；
3. 当 `app-config.js` 未配置或 targets 为空时：
   - 界面无任何 JavaScript 报错或白屏；
   - 顶部出现醒目的未配置提示横幅；
   - 导航栏、工具栏各组件准确呈现“未配置”态；
   - 尝试上传时被友好拦截并提示。
