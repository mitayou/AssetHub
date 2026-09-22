# AssetHub BFF 服务端轻量资产治理与接口方案 PRD

## 一、方案定位与架构边界

在前端完成直连生产 COS 授权直传闭环后，BFF（`e:\project\dskhd-serverless\src`）专注于承担**轻量级团队资产治理中枢**：
1. **完全解耦上传带宽**：前端客户端完成直传 COS，BFF 无需中继转存文件二进制流，零带宽压力；
2. **切图防重与复用（Precheck）**：上传前比对原图 MD5，若存在同款切图则提示复用，前置减少 COS 重复冗余；
3. **资产元数据入库（Record）**：上传完成后回传切图尺寸、体积、线上 URL、操作人工号姓名进行审计持久化；
4. **团队资产库沉淀（Timeline）**：提供时间轴维度的全员/个人切图看板，实现跨人员、跨业务线图片资产互通复用；
5. **环境与目录隔离**：严格收拢在 `src/api/assetHub/v1/` 与 `src/mongodb/models/assetHub/` 目录中，不污染原有业务模块。

---

## 二、数据模型设计 (Mongoose)

- **集合名称**：`asset_hub_cos`
- **模型文件**：`src/mongodb/models/assetHub/CosAsset.ts`

| 字段名 | 类型 | 说明 | 索引 |
| :--- | :--- | :--- | :--- |
| `rawMd5` | String | 原始切图原图 MD5 指纹 (防重基准) | 唯一索引 / 稀疏索引 |
| `fileName` | String | 切图文件名 (如 `cart_empty@2x.png`) | 普通索引 (支持模糊搜) |
| `fileSize` | Number | 原始文件字节大小 | - |
| `compressedSize` | Number | 量化压缩后大小 (字节) | - |
| `compressRatio` | String | 节约比率 (如 `-67%`) | - |
| `scaleBadge` | String | 切图倍率 (`@2x` / `@3x`) | - |
| `width` | Number | 像素宽 | - |
| `height` | Number | 像素高 | - |
| `cosKey` | String | 对应 COS 存储桶标识 (默认 `COS_WXAPP`) | - |
| `cosPath` | String | COS 存储路径 (如 `dsxcx/images/c7defee...png`) | - |
| `onlineUrl` | String | 线上可访问的 CDN 绝对地址 | - |
| `operatorCode` | String | 上传人工号 (如 `10892`) | 普通索引 |
| `operatorName` | String | 上传人姓名 (如 `李明`) | - |
| `avatar` | String | 上传人头像 | - |
| `operationType` | String | 操作类型 (`CREATE` 新增 / `REPLACE` 覆盖) | - |
| `tags` | [String] | 语义标签数组 (如 `['购物车', '空状态']`) | - |
| `createTime` | String | 创建时间 (`YYYY-MM-DD HH:mm:ss`) | 倒序索引 |
| `updateTime` | String | 更新时间 | - |

---

## 三、接口设计规范与入参定义

### 1. 切图预检查重接口
- **路径**：`POST /api/assetHub/v1/precheck`
- **文件**：`src/api/assetHub/v1/precheck.post.ts`
- **入参**：
  ```ts
  class ReqBody {
    @IsArray()
    rawMd5List: string[] // 待检测的原图 MD5 列表
  }
  ```
- **出参**：
  ```ts
  {
    code: 0,
    data: {
      duplicates: [
        {
          rawMd5: 'c7defee...',
          fileName: 'cart_empty@2x.png',
          onlineUrl: 'https://example.com/cdn/cart_empty@2x.png',
          operatorName: '张三',
          operatorCode: '10086',
          createTime: '2026-09-19 14:20:00'
        }
      ]
    }
  }
  ```

### 2. 切图资产入库持久化接口
- **路径**：`POST /api/assetHub/v1/record`
- **文件**：`src/api/assetHub/v1/record.post.ts`
- **入参**：
  ```ts
  class ReqBody {
    rawMd5: string
    fileName: string
    fileSize: number
    compressedSize: number
    scaleBadge?: string
    width: number
    height: number
    cosKey: string
    cosPath: string
    onlineUrl: string
    operatorCode: string
    operatorName: string
    avatar?: string
    operationType: 'CREATE' | 'REPLACE'
    tags?: string[]
  }
  ```
- **出参**：`{ code: 0, data: { id: string, onlineUrl: string } }`

### 3. 团队资产库时间轴查询接口
- **路径**：`GET /api/assetHub/v1/timeline`
- **文件**：`src/api/assetHub/v1/timeline.get.ts`
- **入参 (Query)**：
  ```ts
  class ReqQuery {
    operatorCode?: string // 为空表示全员，传入表示个人
    keyword?: string      // 文件名搜索
    page?: number         // 默认 1
    pageSize?: number     // 默认 20
  }
  ```
- **出参**：按日期分组归纳的资产时间轴列表及总数。

---

## 四、免鉴权白名单配置

在 `src/const/api/unAuthApi.ts` 的 `unAuthAccessTokenApiList` 与 `unAuthUserTokenApiList` 中追加：
- `/api/assetHub/v1/precheck`
- `/api/assetHub/v1/record`
- `/api/assetHub/v1/timeline`
确保内网前端工作台直连测试环境 BFF 时免受复杂移动端签名拦截阻断。
