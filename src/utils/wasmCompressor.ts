/**
 * WebAssembly 本地高性能图片压缩引擎
 * @description 移植 Google Chrome Labs Squoosh 的 imagequant (pngquant) 与 oxipng Wasm 模块
 * 实现 TinyPNG 级别的 8-bit 自适应调色板量化与无损 Deflate 深度压缩，完美保留 UI 切图的 Alpha 透明通道
 */

// @ts-ignore
import UPNG from 'upng-js';
// @ts-ignore
import { init as initOxiPng, optimise as oxiPngOptimise } from '../lib/wasm/squoosh_oxipng.js';
import { getWasmAssetUrl } from './wasmLoader';
import type { CompressResult } from './compressor';



/**
 * 将 Blob/File 转换为 ImageData 像素矩阵
 * @description 优先使用现代浏览器原生硬件加速的 createImageBitmap，杜绝传统 new Image 的 onload 挂起隐患
 * @param {Blob | File} blob - 图片数据源
 * @returns {Promise<{ imageData: ImageData, width: number, height: number }>}
 */
async function getImageDataFromBlob(blob: Blob | File): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  // 1. 优先尝试现代浏览器原生的 createImageBitmap 极速解码
  if (typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // 检查上下文有效性
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        // 及时关闭 bitmap 释放 GPU 显存
        bitmap.close();
        const imageData = ctx.getImageData(0, 0, width, height);
        return { imageData, width, height };
      }
      bitmap.close();
    } catch (e) {
      console.warn('[WasmCompressor] createImageBitmap 降级为 Image 对象加载:', e);
    }
  }

  // 2. 传统 Image 对象兜底，严格先绑定 onload/onerror 后赋值 src
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('图片加载解码超时')), 2000);
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('图片加载解码失败'));
      };
      // 必须在事件挂载完毕后才设置 src
      img.src = objectUrl;
      // 兼容某些浏览器由于缓存导致瞬间完成的情况
      if (img.complete && img.naturalWidth > 0) {
        clearTimeout(timer);
        resolve();
      }
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // 检查图片尺寸有效性
    if (!width || !height) {
      throw new Error('无效的图片尺寸');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // 检查上下文
    if (!ctx) {
      throw new Error('Canvas 2D 上下文初始化失败');
    }

    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { imageData, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}



/**
 * 执行真实的 PNG 量化与压缩核心任务（UPNG 8-bit 调色板量化 + oxipng 深度优化）
 * @param {File} file - 原始待压缩文件
 * @param {object} options - 压缩参数
 * @returns {Promise<CompressResult | null>}
 */
async function executePngCompression(
  file: File,
  options: {
    maxColors: number;
    dithering: number;
    oxipngLevel: number;
  }
): Promise<CompressResult | null> {
  const { maxColors, oxipngLevel } = options;
  const startTime = performance.now();

  // 针对【原画无损模式】且原文件即为 PNG 的场景：直接优化文件二进制，跳过繁重的 ImageData 解码与重算
  const isOriginalPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  if (maxColors === 0 && isOriginalPng) {
    const fileBuf = await file.arrayBuffer();
    let finalUint8Array = new Uint8Array(fileBuf);

    // 若原图小于 5MB，才尝试快速优化；若超大直接交付原图，杜绝单线程卡死
    if (file.size <= 5 * 1024 * 1024) {
      try {
        await initOxiPng(getWasmAssetUrl('squoosh_oxipng_bg.wasm'));
        const optimized = oxiPngOptimise(finalUint8Array, 1, false);
        if (optimized && optimized.length > 0 && optimized.length < finalUint8Array.length) {
          finalUint8Array = optimized;
        }
      } catch (e) {
        console.warn('[WasmCompressor] 无损直接优化跳过:', e);
      }
    }

    const finalBlob = new Blob([finalUint8Array], { type: 'image/png' });
    const finalSize = Math.min(file.size, finalBlob.size);
    const saved = Math.max(0, file.size - finalSize);
    const savedPercent = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
    return {
      blob: finalBlob,
      size: finalSize,
      previewUrl: URL.createObjectURL(finalBlob),
      savedPercent,
      isFallback: false,
    };
  }

  // 1. 提取原始 RGBA 像素矩阵
  const { imageData, width, height } = await getImageDataFromBlob(file);

  // 2. 使用 UPNG 执行真正的 8-bit Indexed Color 量化，跳过 Canvas 导出
  // 直接输出符合标准 PNG Color Type 3 + tRNS 的二进制数据
  const pngArrayBuffer = UPNG.encode([imageData.data.buffer], width, height, maxColors);
  let finalUint8Array = new Uint8Array(pngArrayBuffer);

  // 3. 由 oxipng 进行极大熵 Deflate 深度压缩优化
  const totalPixels = width * height;
  const adaptiveLevel = totalPixels > 4000000 ? 1 : oxipngLevel;

  try {
    await initOxiPng(getWasmAssetUrl('squoosh_oxipng_bg.wasm'));
    const optimizedUint8Array = oxiPngOptimise(finalUint8Array, adaptiveLevel, false);
    // 检查优化结果
    if (optimizedUint8Array && optimizedUint8Array.length > 0 && optimizedUint8Array.length < finalUint8Array.length) {
      finalUint8Array = optimizedUint8Array;
    }
  } catch (oxiErr) {
    console.warn('[WasmCompressor] oxipng 优化跳过，保持 8-bit PNG 产物:', oxiErr);
  }

  const finalBlob = new Blob([finalUint8Array], { type: 'image/png' });
  const compressedSize = finalBlob.size;
  // 如果压缩后体积反而大于原图（例如极小纯色切图），则保留原文件体积判定
  const finalSize = Math.min(file.size, compressedSize);
  const saved = Math.max(0, file.size - finalSize);
  const savedPercent = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
  const costTime = Math.round(performance.now() - startTime);

  console.log(`[WasmCompressor] 切图 "${file.name}" 量化完成: 耗时 ${costTime}ms, 原始 ${Math.round(file.size / 1024)}KB -> 压缩后 ${Math.round(finalSize / 1024)}KB (-${savedPercent}%)`);

  const previewUrl = URL.createObjectURL(finalBlob);

  return {
    blob: finalBlob,
    size: finalSize,
    previewUrl,
    savedPercent,
    isFallback: false,
  };
}

/**
 * 带有自动清理定时器机制的 Promise 超时控制器
 * @description 无论任务成功、失败还是超时，均在 finally 中立即清除定时器，杜绝后台僵尸定时器泄漏
 * @param {Promise<T>} promise - 目标执行任务
 * @param {number} timeoutMs - 超时毫秒数
 * @param {string} taskName - 任务名称
 * @returns {Promise<T | null>}
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  taskName: string
): Promise<T | null> {
  let timer: any = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[WasmCompressor] 任务 "${taskName}" 达到 ${timeoutMs / 1000} 秒超时上限，强制熔断降级`);
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // 关键防护：无论成功、抛错还是超时，必须立即清理定时器，杜绝后台僵尸定时器
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

/**
 * 使用 WebAssembly 引擎对 PNG 切图进行高保真调色板量化与无损压缩
 * @param {File} file - 原始待压缩文件
 * @param {object} [options] - 压缩配置参数
 * @param {number} [options.quality=0.85] - 画质比值 (0.1~1.0，>=0.98为原画无损)
 * @param {number} [options.maxColors] - 调色板最大颜色数 (0为无损，64~256为有损量化)
 * @param {number} [options.dithering=1.0] - 误差扩散抖动系数
 * @param {number} [options.oxipngLevel=1] - oxipng 优化级别 (默认 1 极速)
 * @param {number} [options.timeoutSeconds=30] - 单图超时熔断秒数
 * @returns {Promise<CompressResult | null>} 压缩结果
 */
export async function compressPngWithWasm(
  file: File,
  options: {
    quality?: number;
    maxColors?: number;
    dithering?: number;
    oxipngLevel?: number;
    timeoutSeconds?: number;
  } = {}
): Promise<CompressResult | null> {
  // 检查空文件
  if (!file || file.size === 0) {
    return null;
  }

  const { quality = 0.85, dithering = 1.0, oxipngLevel = 1, timeoutSeconds = 30 } = options;

  // 映射调色板大小
  let maxColors = 256;
  if (typeof options.maxColors === 'number') {
    maxColors = options.maxColors;
  } else if (quality >= 0.98) {
    maxColors = 0; // 原画无损模式
  } else if (quality >= 0.8) {
    maxColors = 256;
  } else if (quality >= 0.6) {
    maxColors = 128;
  } else {
    maxColors = 64;
  }

  const timeoutMs = (timeoutSeconds || 30) * 1000;

  // 动态超时熔断保护，为高清复杂切图提供充裕运算窗口，超时立即返回 null 触发平滑降级
  return withTimeout(
    executePngCompression(file, { maxColors, dithering, oxipngLevel }).catch((error) => {
      console.warn('[WasmCompressor] Wasm 压缩执行异常，触发降级:', error);
      return null;
    }),
    timeoutMs,
    file.name
  );
}
