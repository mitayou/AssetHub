# 07_去硬编码与直传环境真实化改造 PRD

## 一、需求背景与目标

在前期开发与界面演示阶段，前端存在部分用于快速联调的 Mock 数据与写死逻辑，包括：
1. 硬编码旧 Bucket（`dsxcx-1251010183`），而服务端实际签发的是 `fastdfs-test-1251596386`，导致真实直传时触发 403 权限拒绝；
2. 切图队列与时间轴看板中存在写死的 Unsplash 图片、假归档项、固定大盘统计数值（如写死“42项归档”、“已省 5.2 MB”）；
3. 生成的代码片段模板写死了旧 CDN 域名与目录前缀；
4. 直传异常捕获后出现假成功兜底，掩盖真实网络与凭证问题。

本次改造目标：全面消除前端工程中所有硬编码配置、假数据与虚假成功，彻底完成环境解耦与真实链路打通。

---

## 二、关键技术改造项

### 2.1 COS 临时凭证（STS）数据契约对齐
服务端接口 `/api/getCosAuthorization` 返回结构：
- `systemTime`: 13 位毫秒级时间戳（服务系统时间）；
- `data.startTime`: 10 位秒级 Unix 时间戳（有效起始时间）；
- `data.expiredTime`: 10 位秒级 Unix 时间戳（到期失效时间，通常为 +1800 秒 / 30分钟）；
- `data.credentials`: 包含 `tmpSecretId`, `tmpSecretKey`, `sessionToken`。

前端适配：
- 官方 `cos-js-sdk-v5` 严格要求 `StartTime` 与 `ExpiredTime` 为 10 位秒级时间戳；
- 前端进行本地时间比对与计算定时器延迟时，使用 `Math.floor(Date.now() / 1000)` 对齐秒级；
- 服务端返回数据不包含 Bucket 与 Region，前端通过环境变量及配置层自主对齐。

### 2.2 配置层解耦（`apiConfig.ts`）
- 增加 `DEFAULT_COS_BUCKET`：优先读取 `import.meta.env.VITE_COS_BUCKET`，默认对齐测试环境 `fastdfs-test-1251596386`；
- 增加 `DEFAULT_COS_REGION`：优先读取 `import.meta.env.VITE_COS_REGION`，默认 `ap-guangzhou`；
- 补充环境变量声明（`vite-env.d.ts`、`.env`、`.env.example`）。

### 2.3 存储桶与直传服务层改造（`cosUploader.ts`）
- `cos.putObject` 的 `Bucket` 与 `Region` 动态使用 `API_CONFIG.DEFAULT_COS_BUCKET` 与 `API_CONFIG.DEFAULT_COS_REGION`，杜绝桶名写死失配；
- 全链路基于环境变量和配置解析。

### 2.4 状态流与队列任务纯化（`useAssetQueue.ts`）
- 移除默认队列假数据，队列初始为空 `[]`；
- 移除直传受阻时的假成功兜底，当 COS 直传失败时，真实标记 `item.status = 'FAIL'` 并弹出清晰的轻提示；
- 批量入库时仅针对真实直传成功（`item.status === 'SUCCESS' && item.onlineUrl`）的资产调用 BFF 批量入库；
- 占位图使用本地内联 SVG Data URI。

### 2.5 团队资产看板与交付代码纯化（`TimelineList.vue`、`format.ts`）
- 移除 `TimelineList` 中的 `fallbackList` 假切图列表；
- 时间轴大盘统计指标（归档数、总大小、节省体积）初始归零，完全依据 BFF 真实聚合响应展示；
- 增加团队资产库为空时的优雅空状态卡片 `timeline-empty`；
- 交付代码片段生成器（`generateCodeSnippet`）改用 `API_CONFIG.DEFAULT_CDN_PREFIX` 与 `API_CONFIG.DEFAULT_DIRECTORY` 动态拼装。

---

## 三、涉及改动文件清单

| 文件路径 | 改造说明 |
| --- | --- |
| `src/config/apiConfig.ts` | 增加 Bucket、Region 动态配置支持 |
| `src/vite-env.d.ts` | 扩充环境变量 TypeScript 类型定义 |
| `.env` & `.env.example` | 配置默认测试环境 Bucket 与 Region |
| `src/services/cosUploader.ts` | 将写死的桶名改造为从动态配置读取 |
| `src/composables/useAssetQueue.ts` | 移除假成功兜底，严格真实直传与入库 |
| `src/components/TimelineList.vue` | 移除假列表与写死统计，增加空状态卡片 |
| `src/utils/format.ts` | 代码生成器占位使用动态 CDN 路径 |
| `PRD/07_去硬编码与直传环境真实化改造PRD.md` | 本需求规范文档 |

---

## 四、验证结果

1. **凭证对齐**：Chrome 响应的 10 位秒级 `startTime` / `expiredTime` 与腾讯云 SDK 规范 100% 吻合，有效时长计算准确；
2. **硬编码清除**：全工程无写死旧桶 `dsxcx-`、无写死外部网络假图片、无假成功静默兜底；
3. **真实响应**：资产库为空时呈现空状态提示，直传完成并入库后实时呈现真实团队切图。
