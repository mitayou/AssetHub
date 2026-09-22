# 需求文档：画质与超时美化、毛玻璃表格与倍率徽标精准化PRD

> **文档版本**：v1.0  
> **归档日期**：2026-09-21  
> **所属项目**：AssetHub 企业级前端静态资源效能工作台 (`e:\source\plugin\cosUpload`)  
> **核心目标**：
> 1. 美化画质下拉框：剔除原生操作系统丑陋的直角 `<select>` 弹出层，打造 Apple 晶透液态毛玻璃圆角定制下拉组件；
> 2. 在画质右侧新增“压缩超时时间”配置器（支持 30s 默认、1m、2m），全链路联动调度器超时熔断与倒计时；
> 3. 将任务队列表格卡片 (`.table-card`) 的背景样式与顶部导航栏 (`.navbar`) 统一，实现高奢通透水润毛玻璃质感；
> 4. 优化文件名长连续字符折行与倍率徽标机制：解答 `@2x` 滥现疑问，实现精准文件名正则提取（非包含不展示），并为 `.scale-pill` 锁定 `flex-shrink: 0` 防变形。

---

## 一、问题根因剖析与用户疑问解答

### 1. 疑问解答：为什么文件名没有 `@2x` 却被强制显示了 `@2x` 标签？
* **代码历史溯源**：在历史代码中存在强制兜底写法：
  ```typescript
  // 历史问题代码
  scaleBadge: (file.name.includes('@3x') ? '@3x' : '@2x')
  ```
  并且在 `QueueTable.vue` 模板中写了 `{{ item.scaleBadge || '@2x' }}`。
  导致只要切图名字里不带 `@3x`，系统就会“武断”地把它当做 `@2x` 切图打上徽标，即使是像 `ChatGPT Image 2026年6月2日 15_25_10.png` 这样普通的图片也会被误判。
* **修正方案**：建立严格的正则匹配 `detectScaleBadge`：
  - 匹配 `/@3x/i` 则输出 `@3x`；
  - 匹配 `/@2x/i` 则输出 `@2x`；
  - 匹配 `/@1x/i` 则输出 `@1x`；
  - 若均不匹配，返回 `undefined`，模板通过 `v-if="item.scaleBadge"` 完全不展示该标签，杜绝误导！

### 2. 长连续英文/数字文件名排版撑爆问题
* **原因**：浏览器排版引擎在遇到很长的连续英文字符串（如时间戳、无空格的英文文件名）时，默认不会在词内换行，导致外层宽度被撑大，将旁边的 `.scale-pill` 压缩并折成了多行垂直文本。
* **修正方案**：
  - `.file-name-text` 添加 `word-break: break-all; overflow-wrap: anywhere; line-height: 1.4;`；
  - `.scale-pill` 添加 `flex-shrink: 0; white-space: nowrap; line-height: 1;`，确保徽标形态恒定、永不形变。

### 3. 下拉框直角排版与原生 Select 视觉粗糙问题
* **原因**：`<select>` 的 `<option>` 下拉列表由操作系统宿主原生绘制，Windows 下为无圆角的硬边缘纯白直角菜单，破坏了整体 Apple 液态毛玻璃设计语言。
* **修正方案**：打造全新的 `AppleSelect.vue`（或在组件内实现自定义毛玻璃 Dropdown），具备：
  - 触发器：晶透冷白圆角外框、小微标、Chevron 展开顺滑旋转微动效；
  - 浮层：`backdrop-filter: blur(20px)` 高透光磨砂、`border-radius: 12px`、柔和微漫反射投影；
  - 选项条目：悬浮翠绿微高亮、已选状态对勾反馈、点击外部自动关闭（Click Outside）。

### 4. 动态超时时间配置（30s 默认 / 1m / 2m）
* **诉求**：对于超高清复杂大图（例如 20MB 以上或分辨率高达 8000x8000 的大图），30 秒可能仍略显紧张；而普通切图 30 秒刚好。用户需要可在工具栏快速选择：`30s` (30秒，默认)、`1m` (60秒)、`2m` (120秒)。
* **联动链路**：
  - 更改超时时间后，调度器 `compressScheduler` 立即应用新的全局超时时间；
  - 任务入队时的 `compressCountdown` 倒计时初始值与 `setTimeout` 熔断时长同步为所选秒数；
  - 浏览器端主入口 `compressor.ts` 的熔断时间同步由 30s 动态调整为用户设定的时长。

### 5. `.table-card` 毛玻璃质感升级
* **与 `Navbar.vue` 视觉对齐**：
  - 背景：`background: var(--glass-nav);`（42% 超低不透明度，通透水润）；
  - 滤镜：`backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);`；
  - 边框与投影：高光内阴影 + 微漫反射轻投影；
  - 表头 `th`：调整为 `background: rgba(255, 255, 255, 0.35);`，保持全幅透光。

---

## 二、详细技术实现设计

### 1. 新建 `src/components/AppleSelect.vue` 通用毛玻璃下拉组件
```vue
<template>
  <div class="apple-select-container" ref="containerRef">
    <div class="apple-select-trigger" :class="{ active: isOpen, disabled }" @click="toggleOpen">
      <span v-if="prefixLabel" class="prefix-label">{{ prefixLabel }}</span>
      <span class="selected-text">{{ selectedLabel }}</span>
      <svg class="chevron-icon" :class="{ rotated: isOpen }" viewBox="0 0 12 12">...</svg>
    </div>
    <transition name="dropdown-pop">
      <div v-if="isOpen" class="apple-select-dropdown">
        <div 
          v-for="opt in options" 
          :key="opt.value" 
          class="dropdown-item" 
          :class="{ selected: opt.value === modelValue }"
          @click="selectOption(opt.value)"
        >
          <span>{{ opt.label }}</span>
          <span v-if="opt.value === modelValue" class="check-mark">✓</span>
        </div>
      </div>
    </transition>
  </div>
</template>
```

### 2. 超时时间全局状态与调度链路改造
* **`compressScheduler.ts`**：
  - 增加 `globalTimeoutSeconds: number = 30`；
  - 暴露 `setGlobalTimeout(sec: number)`；
  - `startTask` 时 `item.compressCountdown = this.globalTimeoutSeconds`，定时器设置为 `this.globalTimeoutSeconds * 1000`；
* **`compressor.ts`**：
  - `compressImageInBrowser` 增加 `timeoutSeconds: number = 30` 参数，动态设置 Promise 超时。

### 3. 表格与文件名样式改造
* **`QueueTable.vue`**：
  - `.table-card` 应用 Navbar 同款参数；
  - `.file-name-text` 添加 `word-break: break-all; overflow-wrap: anywhere;`；
  - `.scale-pill` 增加 `flex-shrink: 0; white-space: nowrap;`；
  - 仅在 `item.scaleBadge` 存在时渲染 pill。
* **`App.vue`**：
  - 引入倍率解析函数，取消 `@2x` 盲目兜底。

---

## 三、文件修改清单

1. `src/components/AppleSelect.vue` [新建]：Apple 高奢毛玻璃定制圆角下拉组件；
2. `src/utils/file.ts` [新建]：切图倍率精准正则识别工具函数；
3. `src/components/QueueToolbar.vue` [修改]：接入 `AppleSelect`，画质与超时时间双选择器并排美化；
4. `src/components/QueueTable.vue` [修改]：`.table-card` 升级毛玻璃、文件名与倍率 pill 样式优化、`v-if` 条件渲染；
5. `src/utils/compressScheduler.ts` [修改]：增加超时时间动态管理与联动；
6. `src/utils/compressor.ts` [修改]：接收动态超时秒数；
7. `src/App.vue` [修改]：接入超时时间状态、调用正则识别倍率；
8. `contexts/context.md` [修改]：同步更新 PRD 索引与架构记录。
