# 22_清理环境变量冗余Key与可选注释规范PRD

## 一、背景与需求概述

在引入双轨制预设管理体系（测试沙箱 `test-dskhd` / 生产线上 `prod-wxapp`）并完成上传路径隔离（测试环境锁定 `dsxcx/temp/`，生产环境支持界面选择 3 个常用业务目录或自定义输入）后，系统原先在 `.env` 和 `.env.example` 中静态配置的部分环境变量已经彻底失去作用，存在冗余与潜在的配置误导。

### 本次目标：
1. **清理不再使用的废弃 Key**：
   - 彻底移除 `VITE_COS_KEY`（已在界面选择环境时自动匹配 `DSKHD` 或 `COS_WXAPP`）；
   - 彻底移除 `VITE_UPLOAD_DIR`（测试环境锁定 `dsxcx/temp/`，生产环境已交由界面目录选择器动态控制）。
2. **重构保留的覆写 Key 并增加详尽的中文可选注释**：
   - 保留 `VITE_COS_AUTH_URL`、`VITE_BFF_BASE_URL`、`VITE_CDN_PREFIX`、`VITE_COS_BUCKET`、`VITE_COS_REGION` 为可选覆写变量（Optional Overrides）；
   - 逐项明确其说明、默认值以及适用的联调场景；
   - 保证 `.env` 与 `.env.example` 风格统一，规范清晰。

---

## 二、配置项清理与保留矩阵

| 环境变量 Key | 状态 | 默认值 | 清理/保留原因及使用场景 |
| :--- | :--- | :--- | :--- |
| `VITE_COS_KEY` | **已废弃清理** | - | 预设体系根据环境自动绑定，不再需要静态环境变量指定 |
| `VITE_UPLOAD_DIR` | **已废弃清理** | - | 测试锁定 `dsxcx/temp/`，生产由前端界面选择常用目录或输入 |
| `VITE_COS_AUTH_URL` | **保留 (可选)** | 生产/测试预设接口 | 本地代理联调或自建网关代理时可指定覆写 |
| `VITE_BFF_BASE_URL` | **保留 (可选)** | 生产/测试预设接口 | 本地启动独立 BFF 资产治理服务时联调覆写 |
| `VITE_CDN_PREFIX` | **保留 (可选)** | `https://resource.example.com.cn` | 仅生产环境生效，若使用自建 CDN 或变更加速域名时覆写 |
| `VITE_COS_BUCKET` | **保留 (可选)** | `bucket-prod-name` | 仅测试沙箱生效，若临时切换其他测试沙箱存储桶时覆写 |
| `VITE_COS_REGION` | **保留 (可选)** | `ap-guangzhou` | 腾讯云存储桶地域园区，特殊跨区域部署时覆写 |

---

## 三、文件改动计划

1. `e:\source\plugin\cosUpload\.env`：按分层结构重构，删除废弃 key，增加详尽中文使用说明。
2. `e:\source\plugin\cosUpload\.env.example`：与 `.env` 结构对齐，作为标准模板供团队参考。
