/**
 * AssetHub 运行时外部交付配置文件
 * 
 * 【运维/实施交付人员须知】：
 * 1. 本文件为生产环境独立外置配置文件，构建打包后位于 dist/app-config.js；
 * 2. 交付与私有化部署时，可直接使用文本编辑器（如记事本）修改本文件中的配置；
 * 3. 修改保存后，在浏览器中强制刷新网页 (Ctrl + F5) 即可立即生效，完全无需重新编译前端代码；
 * 4. targets 预设列表支持按需增删，可配置 1 个、2 个或任意多个环境（如测试沙箱、预发灰度、生产线上、海外业务等）。
 */
window.__ASSET_HUB_CONFIG__ = {
  /** 网页标题与工作台品牌名称 */
  title: 'AssetHub - 静态资源效能工作台',

  /**
   * 工作台品牌头部展示配置 (支持交付现场定制品牌与团队信息)
   */
  brand: {
    /** 
     * 品牌 Logo 配置：
     * - 方式 1（字母/短字）：如 'A'、'P'、'百'，渲染为生机绿微压印方圆图标；
     * - 方式 2（图片 URL）：如 'https://example.com/logo.png'、'/logo.svg' 或 base64 图片，渲染为品牌图片。
     */
    logo: 'A',
    /** 顶部主标题 (留空默认使用 'AssetHub') */
    title: 'AssetHub',
    /** 顶部副标题描述 (留空默认使用 '小程序团队·静态资源效能工作台') */
    subtitle: '小程序团队·静态资源效能工作台',
  },

  /**
   * 生产环境常用业务文件夹快捷预设列表
   * 交付方可根据各业务团队的真实目录规范进行自由增减与调整
   */
  prodDirPresets: [
    'dsxcx/images',
    'dsxcx/evaluation',
    'dsxcx/feedback',
  ],

  /**
   * 双轨制/多轨制环境与 COS 存储桶目标预设集合
   * 支持现场随意替换存储桶、网关域名、园区地域与 CDN 域名
   * 接口统一内网访问，外网暴露风险极高
   */
  targets: [
    {
      /** 预设唯一标识 (由字母、数字、中划线组成) */
      id: 'prod-wxapp',
      /** 界面展示的标识名称与 Emoji 图标 */
      label: '🚀 【生产线上】微信小程序主图床',
      /** 环境标识：prod (生产模式，支持业务子目录) 或 test (沙箱隔离模式) */
      env: 'prod',
      /** 获取腾讯云 COS STS 临时凭据的授权接口地址 */
      authUrl: 'http://example.com.cn/api/getCosAuthorization',
      /** 内部 BFF 服务端基准接口地址 (查重预检、批量入库、花名册同步等) */
      bffBaseUrl: 'http://example.com.cn/api/assetHub/v1',
      /** 服务端获取临时凭证时所使用的存储桶标识 Key */
      cosKey: 'COS_KEY_NAME',
      /** 腾讯云 COS 存储桶 Bucket 全名 (含 AppId 后缀) */
      bucket: 'bucket-prod-name',
      /** 存储桶所在地域园区 (如 ap-guangzhou, ap-shanghai, ap-beijing) */
      region: 'ap-guangzhou',
      /** 生产环境默认上传目标目录 */
      defaultDir: 'cos/images',
      /** 线上专有 CDN 加速访问域名前缀 (若留空则自动回退直连腾讯云 COS 源站域名) */
      cdnPrefix: 'https://resource.example.com.cn',
      /** 界面操作安全说明提示 */
      description: '线上正式业务图床，支持指定业务文件夹，具备专有 CDN 加速',
    },
    {
      /** 预设唯一标识 */
      id: 'test-wxapp',
      /** 界面展示的标识名称 */
      label: '🧪 【测试沙箱】DSKHD 业务桶',
      /** 环境标识 */
      env: 'test',
      /** 测试沙箱 STS 临时凭据获取接口地址 */
      authUrl: 'http://example.com.cn/api/getCosAuthorization',
      /** 测试沙箱 BFF 接口基准地址 */
      bffBaseUrl: 'http://example.com.cn/api/assetHub/v1',
      /** 存储桶标识 Key */
      cosKey: 'COS_KEY_NAME',
      /** 测试沙箱存储桶 Bucket 名称 */
      bucket: 'bucket-prod-name',
      /** 园区地域 */
      region: 'ap-guangzhou',
      /** 默认上传目标目录 */
      defaultDir: 'cos/images',
      /** CDN 域名前缀 (测试沙箱无专用 CDN，留空自动回退为源站直连域名) */
      cdnPrefix: '',
      /** 界面操作安全说明提示 */
      description: '测试沙箱模式，切图统一上传至 dsxcx/temp/ 临时目录，后续由管理员批量清理',
    },
  ],
}
