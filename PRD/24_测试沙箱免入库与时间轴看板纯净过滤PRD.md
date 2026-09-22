# 24_测试沙箱免入库与时间轴看板纯净过滤PRD

## 一、需求背景与目标

当前系统已支持“生产线上（`prod-wxapp`）”与“测试沙箱（`test-dskhd`）”双轨制目标预设：
- 测试沙箱切图统一上传至 `dsxcx/temp/` 临时目录，其业务定位为“临时调试、联调、管理员后续在云端批量物理清理”；
- 生产线上切图上传至 `dsxcx/images` 等正规业务目录，具备正式 CDN 加速。

### 存在隐患：
1. **测试切图入库污染查重库（致命死链风险）**：
   若测试切图调用 BFF `record` 入库，其 MD5 与 URL 将沉淀至数据库。后续当管理员在云端清空 `dsxcx/temp/` 后，若其他业务在生产环境上传相同切图，查重系统（`precheck`）会命中已删除的历史测试记录，引导用户复用已 404 的死链；
2. **时间轴资产看板污染**：
   时间轴看板作为团队“正式资产库与时间轴画廊”，若展示测试阶段随手拖入的废图、草稿图，会破坏资产库的纯净性与检索价值。

### 本次改造目标：
1. **源头拦截**：在 `useAssetQueue.ts` 中，当环境为测试沙箱（`currentCosTarget.value.env === 'test'`）时，直传成功后直接跳过 BFF 资产入库，并给出明确反馈；
2. **展示层过滤**：在 `TimelineList.vue` 中对云端返回的资产进行纯净化过滤，彻底剔除包含 `/temp/` 或测试桶的脏数据；
3. **查重预检联动优化**：测试模式下切图不污染库，保障生产资产库 100% 纯净可用。

---

## 二、详细改动设计

### 1. `useAssetQueue.ts` 上传完成处理改造
- 成功上传后，判断当前预设目标环境：
  - 若 `currentCosTarget.value.env === 'test'`：
    - 不调用 `assetBff.recordAssets(recordPayloads)`；
    - 界面提示：`直传成功！已存入 dsxcx/temp/ 沙箱目录（测试模式免入库归档）`；
    - 结束上传流程，释放 loading。
  - 若 `currentCosTarget.value.env === 'prod'`：
    - 正常构建 payload 并调用 `assetBff.recordAssets`；
    - 界面提示：`直传完毕！已成功将 X 项切图归档入库`。

### 2. `TimelineList.vue` 时间轴看板纯净化过滤
- 在 `displayList` 计算属性中增加过滤逻辑：
  - 过滤掉 URL 中含有 `/temp/` 的临时资产；
  - 过滤掉属于测试沙箱桶名（如 `test--dskhd--cos`）的记录；
  - 确保时间轴展现的 100% 均为正式可用的业务切图资产。

---

## 三、涉及文件列表

1. `e:\source\plugin\cosUpload\src\composables\useAssetQueue.ts`
2. `e:\source\plugin\cosUpload\src\components\TimelineList.vue`
