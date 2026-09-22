# 需求与设计文档：前端配置外置化与零重新编译交付方案 (PRD)

> 文档编号：PRD-20260921-029  
> 归属工程：`e:\source\plugin\cosUpload` (AssetHub 前端工作台)  
> 核心目标：根除前端项目中由于写死目标预设、存储桶参数、接口网关与环境变量内联导致的交付困难，实现“一次构建打包、现场任意配置、零二次编译、零修改源码”的工业级交付。

---

## 一、问题背景与现状诊断

在当前工程的交付评估中，发现存在多处“必须修改 TypeScript 源码或重新执行 `vite build` 才能更改配置”的缺陷，集中体现在以 `src/config/cosTargets.ts:L45-L78` 为代表的静态硬编码。

### 1. 核心硬编码清单剖析

| 序号 | 所在文件及位置 | 现存硬编码内容 | 交付阻碍与负面影响 |
| :--- | :--- | :--- | :--- |
| **1** | `src/config/cosTargets.ts` L50-63 | 生产预设 `prod-wxapp` 的 `authUrl`、`bffBaseUrl`、`bucket`、`region`、`defaultDir` 全部写死 | 生产环境换域名、改网关、换存储桶时，**完全没有任何环境变量可配**，必须改写 TS 源码 |
| **2** | `src/config/cosTargets.ts` L55 | 生产预设的 `bffBaseUrl` 误填为测试域名 `test.com.cn` | 逻辑矛盾且不可在外部修正，若生产 BFF 上线将无法外部调优 |
| **3** | `src/config/cosTargets.ts` L8 | 预设 ID 类型写死为联合类型 `'test-dskhd' \| 'prod-wxapp'` | **环境扩展锁死**：无法交付给需要多环境（如预发环境 staging、海外专属桶、多租户私有桶）的团队 |
| **4** | `src/config/cosTargets.ts` L40-44 | 常用文件夹写死为 `['dsxcx/images', 'dsxcx/evaluation', 'dsxcx/feedback']` | 强绑定百果园小程序业务路径，交付给其他业务团队或客户时无法适用 |
| **5** | 全工程 `.env` 与 `import.meta.env` | 依赖 Vite 编译期注入（如 `VITE_COS_AUTH_URL`、`VITE_BFF_BASE_URL`） | **编译期内联陷阱**：`npm run build` 后变量被直接编译为静态字符串写入 JS Bundle，**交付产物无法现场修改配置**，改配置必重新源码打包 |
| **6** | `src/config/apiConfig.ts` 与 `cosTargets.ts` | 配置孤岛与多源割裂，`assetBff.ts` 死绑定 `API_CONFIG.BFF_BASE_URL` | 用户在界面上切换了生产/测试预设，但 BFF 查重与入库接口仍然固定打向单一写死地址，环境联动脱节 |
| **7** | `src/utils/format.ts` L60 | 代码模版生成中的兜底路径依赖 `API_CONFIG` 的写死域名与目录 | 复制交付代码片段时可能产出错误的旧占位符 |
| **8** | `src/utils/compressor.ts` & `gifCompressor.ts` | Wasm 资源加载路径写死为根路径 `/wasm/*.wasm` | 当部署在非根子路径（如 `/assethub/` 或微前端子目录）时会导致 Wasm 404 加载失败 |

---

## 二、架构目标与交付原则

为了达到“完美交付”的标准，本次改造必须达成以下 4 项核心原则：

1. **零代码修改（Zero Code Changes）**：交付各方使用或私有化部署时，无需触碰一行前端 TypeScript/Vue 源码。
2. **零重新编译（Zero Re-build）**：打出的 `dist` 产物具备“一次构建，到处运行”（Build Once, Run Anywhere）的特性。运维人员现场修改文本文件即可变更环境配置，无需 Node.js 环境，无需 `vite build`。
3. **无限环境拓展（Infinite Environment Presets）**：预设配置采用声明式契约，运维或交付人员可在配置文件中配置 1 个、2 个、乃至 N 个环境（如：本地测试、集成测试、预发灰度、生产线上、灾备桶等）。
4. **四级级联覆盖（Layered Cascade Configuration）**：
   - **L1 运行时外部配置（Runtime External Config）**：最高优先级，部署现场修改即生效；
   - **L2 构建期环境变量（Build-time Env）**：本地联调与 CI/CD 自动化流水线默认值；
   - **L3 代码内置默认兜底（Fallback Defaults）**：配置缺失时的容错保底；
   - **L4 用户界面交互状态（UI Session Storage）**：用户当前选择的目录和选项，记住上次操作。

---

## 三、完美解决方案架构设计

### 1. 核心实施方案：引入外部独立运行时配置文件 `public/app-config.js`

在 `public/` 目录下提供 `app-config.js`。由于 Vite 在构建时会将 `public/` 下的文件**原封不动拷贝到 `dist/` 根目录**，因此运维交付人员解压产物后，可以直接看到：
```
dist/
├── app-config.js      <--- 运维现场用记事本即可编辑此文件！修改后刷新浏览器立即生效！
├── index.html
├── assets/
└── wasm/
```

#### `public/app-config.js` 规范契约：
```javascript
/**
 * AssetHub 运行时外部交付配置文件
 * 【运维/交付人员注意】：
 * 1. 本文件为浏览器端直接执行的原生 JS 文件，无需重新编译项目即可生效；
 * 2. 修改此文件后，保存并强制刷新网页 (Ctrl+F5) 即可应用全新配置；
 * 3. 字段为空或注释时，系统会自动回退到系统内置默认值。
 */
window.__ASSET_HUB_CONFIG__ = {
  // 网页标题与品牌
  title: 'AssetHub - 静态资源效能工作台',
  
  // 常用业务目录快速选项 (支持交付方根据自身业务任意定制)
  prodDirPresets: [
    'dsxcx/images',
    'dsxcx/evaluation',
    'dsxcx/feedback',
  ],

  // 存储桶与环境目标预设集 (支持任意扩展 N 个环境)
  targets: [
    {
      id: 'prod-wxapp',
      label: '🚀 【生产线上】微信小程序主图床',
      env: 'prod',
      authUrl: 'http://example.com.cn/api/getCosAuthorization',
      bffBaseUrl: 'http://example.com.cn/api/assetHub/v1',
      cosKey: 'COS_KEY_NAME',
      bucket: 'bucket-prod-name',
      region: 'ap-guangzhou',
      defaultDir: 'cos/images',
      cdnPrefix: 'https://resource.example.com.cn',
      description: '线上正式业务图床，支持指定业务文件夹，具备专有 CDN 加速',
    },
    {
      id: 'test-wxapp',
      label: '🧪 【测试沙箱】DSKHD 业务桶',
      env: 'test',
      authUrl: 'http://example.com.cn/api/getCosAuthorization',
      bffBaseUrl: 'http://example.com.cn/api/assetHub/v1',
      cosKey: 'COS_KEY_NAME',
      bucket: 'bucket-prod-name',
      region: 'ap-guangzhou',
      defaultDir: 'cos/images',
      cdnPrefix: '',
      description: '测试沙箱模式，切图统一上传至 dsxcx/temp/ 临时目录，后续由管理员批量清理',
    },
  ],
}
```

### 2. 在 `index.html` 入口中先行同步加载 `app-config.js`

在 `index.html` 的 `<head>` 中引入：
```html
<head>
  ...
  <!-- 运行时外部动态配置文件：必须在 main.ts 之前加载，无缓存 -->
  <script src="/app-config.js"></script>
</head>
```

### 3. 重构配置中枢模块 `src/config/cosTargets.ts`

- 移除对预设 ID 的硬编码字面量枚举约束，改为动态 `string`；
- 从 `window.__ASSET_HUB_CONFIG__` 动态读取配置，并与 `import.meta.env` 及内部保底逻辑深度合并；
- 将 `PROD_DIR_PRESETS` 变为可配置响应式/动态列表；
- 暴露统一的 `currentCosTarget` 计算属性。

### 4. 彻底解决 BFF 接口地址割裂问题（`src/services/assetBff.ts`）

- 将 `API_CONFIG.BFF_PRECHECK_URL` 等静态字符串重构为动态读取 `currentCosTarget.value.bffBaseUrl`；
- 当用户在界面上切换“生产线上”或“测试沙箱”时，查重、入库、时间轴、花名册同步接口自动同步打向该环境配置的 BFF 地址，实现真正意义上的环境全链路联动闭环。

---

## 四、实施影响与收益评估

1. **运维交付收益**：实施/运维同学直接使用 Nginx 托管打包目录，修改 `dist/app-config.js` 即可瞬间适配不同客户、不同机房与私有化存储桶，彻底免除安装前端构建环境与二次构建成本；
2. **架构健康度提升**：废弃 `apiConfig.ts` 中的冗余死常量，全站配置收拢到单一可信源；
3. **环境拓展性提升**：支持任意扩展 3 个或更多环境预设，满足企业级多环境（Dev/Test/Staging/Prod/Overseas）交付诉求。
