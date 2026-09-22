# 需求文档 (PRD 32)：API 统一收拢、读端二次清洗移除与 iframe 剪贴板复制兼容重构

## 一、需求背景与目标

在最新的联调测试与代码走读中，用户提出三项关键改进：
1. **API 地址收拢统一**：`apiConfig.ts` 中定义了 `BFF_TIMELINE_URL`、`BFF_PRECHECK_URL`、`BFF_RECORD_URL`、`BFF_SYNC_USER_URL`，但各业务方法却在各自拼接 `/timeline`、`/precheck`，产生冗余和割裂，应当统一使用收拢的配置端点；
2. **去除读端二次清洗**：由于写端直传已严格拦截测试沙箱切图入库（`env === 'test'` 时不调 record 接口），数据库已具备纯净性，应去掉时间轴看板前端列表中对 `/temp/` 和测试桶域名的 filter 过滤，如实呈现数据库数据，同时保持写端阻断；
3. **彻底解决 iframe 剪贴板复制失败**：在某些父页面嵌入的 iframe 中点击“复制链接”按钮时，由于未开启 `allow="clipboard-write"` 权限策略，现代 `navigator.clipboard.writeText` 抛出 `NotAllowedError` 并导致直接复制失败。需要从底层提供健壮的自愈降级机制，保证在 iframe 权限被封锁时也能 100% 复制成功。

---

## 二、具体方案与实施

### 1. API 端点统一收拢与动态环境联动 (`src/config/apiConfig.ts` & `src/services/assetBff.ts`)
- 在 `apiConfig.ts` 中统一提供 `getActiveBffBaseUrl()` 与 `getBffApiUrl(endpoint)`；
- `API_CONFIG` 的端点属性全部改为动态 getter，实时感知当前激活存储桶预设的 `bffBaseUrl`：
  - `API_CONFIG.BFF_PRECHECK_URL`
  - `API_CONFIG.BFF_RECORD_URL`
  - `API_CONFIG.BFF_TIMELINE_URL`
  - `API_CONFIG.BFF_SYNC_USER_URL`
- 在 `src/services/assetBff.ts` 中直接消费上述端点属性，彻底消除各方法内部手工拼装 URL 字符串的遗留问题。

### 2. 移除看板读端二次过滤 (`src/components/TimelineList.vue`)
- 将 `displayList` 计算属性中的正则/字符串过滤移除，直接返回 `timelineData.value.list || []`；
- 写端在 `useAssetQueue.ts` 中针对 `currentCosTarget.value?.env === 'test'` 的免入库阻断机制继续保持。

### 3. iframe 剪贴板 Permissions Policy 阻断自愈 (`src/utils/clipboard.ts`)
- **根因分析**：现代浏览器对跨域或未授权 iframe 限制了异步 `navigator.clipboard.writeText`，抛出 `NotAllowedError`；旧代码直接将其抛出到了最外层导致降级代码没有执行；
- **自愈机制**：
  1. 将 `navigator.clipboard.writeText` 放入局部独立 `try...catch`；
  2. 一旦被浏览器权限策略拦截，静默切换至不受 Permissions Policy 约束的 `execCommandCopy` 传统选区复制（动态注入带 `readonly` 的隐蔽 `<textarea>` 并触发 `document.execCommand('copy')`）；
  3. 执行完毕立即彻底销毁 DOM 节点；
  4. 即使宿主页面未配置 `allow="clipboard-write"` 属性，也能 100% 成功写入系统剪贴板。

---

## 三、验收标准

1. `apiConfig.ts` 中所有 BFF 接口均被 `assetBff.ts` 真实引用，无未使用的死常量；
2. 时间轴看板直接如实呈现云端返回的数据，前端无多余的过滤切词拦截；
3. 测试环境直传仍保持不调用入库接口；
4. 在受到 Permissions Policy 限制的 iframe 环境中，点击表格中的“复制链接”按钮，依然能够成功将链接写入系统剪贴板并弹出成功提示。
