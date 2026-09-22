/**
 * 客户端图片压缩与真实体积测量工具
 * @description 优先采用 WebAssembly (imagequant + oxipng) 引擎进行 TinyPNG 级别的像素调色板量化与无损压缩，
 * 完美保留透明通道与边缘羽化；针对 JPEG/WebP 等格式通过原生高性能 Canvas 硬件加速编码极速测算。
 */

import { compressPngWithWasm } from './wasmCompressor';
import { compressGifWithWasm } from './gifCompressor';
import { isWorkerCompressionSupported, executePngInWorker } from './workerPool';

export interface CompressResult {
  /** 压缩后产物 Blob */
  blob: Blob;
  /** 压缩后真实字节数 */
  size: number;
  /** 压缩后本地预览 URL */
  previewUrl: string;
  /** 真实节省百分比 (0 ~ 100) */
  savedPercent: number;
  /** 是否发生超时或异常降级保底 */
  isFallback?: boolean;
}

/**
 * 原生 HTML5 Canvas 轻量高性能压缩方案
 * @description 支持 JPEG 硬件编码加速，杜绝跨格式重编码导致的耗时过长
 * @param {File} file - 原始图片文件
 * @param {number} quality - 压缩质量 (0.1 ~ 1.0)
 * @returns {Promise<CompressResult | null>} 压缩结果
 */
async function compressImageWithCanvas(
  file: File,
  quality: number = 0.82
): Promise<CompressResult | null> {
  const fileName = (file.name || '').toLowerCase();
  const isJpeg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(fileName);
  const isWebp = file.type === 'image/webp' || fileName.endsWith('.webp');

  // 遵循原始格式导出：JPEG 格式使用原生高效硬件加速，杜绝慢速软编码转 WebP
  const targetMime = isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : 'image/jpeg';

  // 1. 优先使用现代浏览器原生硬件加速的 createImageBitmap 解码
  if (typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;

      // 检查尺寸有效性
      if (!width || !height) {
        bitmap.close();
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), targetMime, quality);
      });

      if (!blob) {
        return null;
      }

      const compressedSize = blob.size;
      const finalSize = Math.min(file.size, compressedSize);
      const saved = Math.max(0, file.size - finalSize);
      const savedPercent = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
      const previewUrl = URL.createObjectURL(blob);

      return {
        blob,
        size: finalSize,
        previewUrl,
        savedPercent,
      };
    } catch (bitmapError) {
      console.warn('[compressImageWithCanvas] createImageBitmap 降级为 Image 对象:', bitmapError);
    }
  }

  // 2. 传统 Image 对象加载兜底（放宽到 10 秒超时）
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 30000);

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      clearTimeout(timer);
      resolve(null);
      return;
    }

    const img = new Image();

    img.onload = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (!width || !height) {
          resolve(null);
          return;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }

            const compressedSize = blob.size;
            const finalSize = Math.min(file.size, compressedSize);
            const saved = Math.max(0, file.size - finalSize);
            const savedPercent = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
            const previewUrl = URL.createObjectURL(blob);

            resolve({
              blob,
              size: finalSize,
              previewUrl,
              savedPercent,
            });
          },
          targetMime,
          quality
        );
      } catch (err) {
        console.warn('[compressImageWithCanvas] Canvas 压缩异常:', err);
        resolve(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.src = objectUrl;
  });
}

/**
 * 在浏览器端对图片文件执行真实量化压缩（按格式精准分流，支持动态超时秒数熔断）
 * @param {File} file - 原始图片文件
 * @param {number} quality - 压缩质量比值 (0.1 ~ 1.0，默认 0.85)
 * @param {(stage: 'DECODING' | 'QUANTIZING' | 'OPTIMIZING') => void} [onStageChange] - 阶段流转回调
 * @param {number} [timeoutSeconds=30] - 单图超时熔断秒数 (默认 30 秒，支持 60 秒或 120 秒)
 * @returns {Promise<CompressResult | null>} 压缩结果
 */
export async function compressImageInBrowser(
  file: File,
  quality: number = 0.85,
  onStageChange?: (stage: 'DECODING' | 'QUANTIZING' | 'OPTIMIZING') => void,
  timeoutSeconds: number = 30
): Promise<CompressResult | null> {
  // 检查空文件
  if (!file || file.size === 0) {
    return null;
  }

  // 格式判定：支持通过文件名后缀与 MIME 双重检测
  const fileName = (file.name || '').toLowerCase();
  const isPng = file.type === 'image/png' || fileName.endsWith('.png');
  const isGif = file.type === 'image/gif' || fileName.endsWith('.gif');
  const isRasterImage =
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);

  // 如果是非光栅图像或 SVG 矢量图，跳过压缩
  if (!isRasterImage || fileName.endsWith('.svg') || file.type.includes('svg')) {
    return null;
  }

  // 动态单图绝对熔断保护，防止极端大图或超复杂计算无限期挂起
  const timeoutMs = (timeoutSeconds || 30) * 1000;
  let timer: any = null;
  const timeoutPromise = new Promise<CompressResult>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[compressImageInBrowser] 图片 "${file.name}" 测算达到 ${timeoutSeconds} 秒时间上限，强制熔断返回保底`);
      resolve({
        blob: file,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        savedPercent: 0,
        isFallback: true,
      });
    }, timeoutMs);
  });

  const mainTask = (async () => {
    // 1. 如果是 GIF 动图，严禁走 Canvas！必须调用多帧保留的 WebAssembly Gifsicle 引擎
    if (isGif) {
      try {
        const gifResult = await compressGifWithWasm(file);
        // 检查 GIF 压缩产物
        if (gifResult) {
          return gifResult;
        }
      } catch (gifErr) {
        console.warn('[compressImageInBrowser] GIF Wasm 压缩异常，保底原图透传:', gifErr);
      }
      // GIF 动图即使 Wasm 失败也绝对禁止走 Canvas，直接返回原图动态保底
      return {
        blob: file,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        savedPercent: 0,
        isFallback: true,
      };
    }

    // 2. 如果是 PNG 格式，优先调用多 Worker 线程池后台量化压缩引擎（TinyPNG 同等质量，主线程零卡顿）
    if (isPng) {
      // 检查当前环境是否支持 Worker 线程池
      if (isWorkerCompressionSupported()) {
        try {
          const workerResult = await executePngInWorker(file, { quality }, onStageChange);
          // 检查 Worker 压缩产物
          if (workerResult) {
            return workerResult;
          }
        } catch (workerErr) {
          console.warn('[compressImageInBrowser] Worker PNG 压缩异常，尝试降级为主线程 Wasm:', workerErr);
        }
      }

      // 环境不支持 Worker 或 Worker 异常时的平滑降级通道
      try {
        const wasmResult = await compressPngWithWasm(file, { quality, timeoutSeconds });
        // 检查 Wasm 压缩结果是否有效
        if (wasmResult) {
          return wasmResult;
        }
      } catch (wasmError) {
        console.warn('[compressImageInBrowser] Wasm PNG 压缩异常，保底原图透传:', wasmError);
      }
      // PNG 格式若 Wasm 压缩熔断或失败，严禁降级为 Canvas（防止被转为 JPEG 导致透明通道变黑及格式篡改），直接保底原图透传
      return {
        blob: file,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        savedPercent: 0,
        isFallback: true,
      };
    }

    // 3. 非 GIF/PNG 格式（如 JPG/JPEG）走高性能原生 Canvas 硬件加速方案
    return compressImageWithCanvas(file, quality);
  })();

  try {
    return await Promise.race([mainTask, timeoutPromise]);
  } finally {
    // 关键清理：主任务结算后立即取消定时器，杜绝后台僵尸定时器触发虚假警告
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}
