# 需求文档：双轨制 COS 预设管理与测试资产清理闭环

## 1. 业务背景与问题分析
在目前的图片直传体系中，存在以下核心痛点：
1. **配置割裂且易失配**：前端通过 `.env` 管理 `VITE_COS_KEY`、`VITE_COS_BUCKET` 等零散配置，切换环境必须手动修改文件并重启开发服务器，且极易因两端配置不一致导致 `403 AccessDenied`。
2. **CDN 映射 404 隐患**：线上专有 CDN 域名（`https://resource.example.com.cn`）仅绑定了生产环境特定桶，测试桶未做映射，强行拼接该前缀会导致图片预览 404。
3. **测试资产堆积与权限边界**：管理员仅开放了 `test--dskhd--cos-1317204308` 桶的删除权限，其他测试桶（如 `serverless-cdn-test` 无写入权限、`fastdfs-test` 无删除权限）不适合作为测试沙箱。

## 2. 方案目标
- **双轨制管理**：将零散的配置收拢为“测试沙箱”与“生产线上”两套高内聚套餐，支持 UI 动态一键下拉切换；
- **智能降级防 404**：生产桶走专用 CDN 加速，测试桶自动走 COS 原生源站链接，保证无论在哪个环境都能正常预览与打开；
- **测试资产删除闭环**：服务端开放 `DeleteObject` 权限，前端在测试桶场景下提供“云端删除”能力，及时清理测试垃圾切图。

## 3. 详细设计

### 3.1 服务端改造（dskhd-serverless）
- 在 `src/const/objectStorage/enum.ts` 中，为 `ALLOW_ACTIONS_MAP[COS_KEY.DSKHD]` 补充 `'name/cos:DeleteObject'` 权限。

### 3.2 预设套餐模型（cosUpload）
创建 `src/config/cosTargets.ts`：
- **套餐 A（测试沙箱）**：
  - 标识：`test-dskhd`
  - 存储桶：`test--dskhd--cos-1317204308` (Region: `ap-guangzhou`)
  - 授权地址：测试服 `test_exc` 路由
  - 允许删除：`true`
  - CDN 前缀：`undefined`（自动回退为腾讯云原生源站访问链接）
- **套餐 B（生产线上）**：
  - 标识：`prod-wxapp`
  - 存储桶：`fastdfs-prod-1251596386` (Region: `ap-guangzhou`)
  - 授权地址：生产服 `exc` 路由
  - 允许删除：`false`（严格保护线上资产）
  - CDN 前缀：`https://resource.example.com.cn`

### 3.3 UI 与交互集成
- **QueueToolbar**：增加精致的 Target Preset 下拉切换器，记忆上次的选择，并在生产环境高亮安全警示；
- **QueueTable**：当当前激活桶允许删除（`allowDelete: true`）且条目已上传成功时，在操作列提供“删除云端”按钮，支持一键物理删除云端文件。
