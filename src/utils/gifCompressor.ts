/**
 * WebAssembly Gifsicle 多帧动图量化压缩引擎
 * @description 基于开源 Gifsicle 引擎移植，利用独立 Web Worker 进行后台帧间差分与调色板优化，
 * 完美保留所有动画帧序列、帧时序（Frame Delay）与透明通道，杜绝 HTML5 Canvas 导致的静态死图缺陷。
 */

// @ts-ignore
import gifsicle from '../lib/wasm/gifsicle.js';
import type { CompressResult } from './compressor';

/** 动图最大体积阈值 (15MB)：超过此阈值为了防止浏览器端 Web Worker 内存溢出，直接跳过并保持原图直传 */
const MAX_GIF_SIZE_FOR_WASM = 15 * 1024 * 1024;

/**
 * 内部执行真实的 Gifsicle Wasm 动图压缩核心
 * @param {File} file - 原始 GIF 动图文件
 * @param {object} options - 压缩参数选项
 * @param {number} options.lossy - 有损量化强度 (1~200，默认 40 兼顾极佳画质与 30%~50% 体积缩减)
 * @param {number} options.optLevel - 优化级别 (1~3，默认 2 平衡速度与压缩比)
 * @returns {Promise<CompressResult>}
 */
async function executeGifCompression(
  file: File,
  options: {
    lossy: number;
    optLevel: number;
  }
): Promise<CompressResult> {
  const { lossy, optLevel } = options;

  // 1. 读取原图二进制数据
  const arrayBuffer = await file.arrayBuffer();

  // 2. 构造 Gifsicle 命令参数
  // -O2: 优化透明度与帧间相同区域合并
  // --lossy=xx: 调色板聚类有损优化，极大提升 LZW 编码压缩率
  // 杜绝 -O3，避免超长耗时
  const virtualInputName = 'input.gif';
  const virtualOutputName = 'out.gif';
  const commandStr = `-O${optLevel} --lossy=${lossy} ${virtualInputName} -o /out/${virtualOutputName}`;

  // 3. 在独立 Web Worker 中执行 Gifsicle 运算，绝不卡顿主线程 UI
  const outputFiles = await gifsicle.run({
    input: [
      {
        file: arrayBuffer,
        name: virtualInputName,
      },
    ],
    command: [commandStr],
  });

  // 检查产物有效性
  if (!outputFiles || outputFiles.length === 0 || !outputFiles[0]) {
    throw new Error('Gifsicle 动图压缩未能生成有效产物');
  }

  const compressedFile = outputFiles[0];
  const compressedBlob = new Blob([await compressedFile.arrayBuffer()], { type: 'image/gif' });

  // 4. 体积与节省比例判定
  const compressedSize = compressedBlob.size;
  // 若优化后体积反而大于原文件，则保底取原文件大小
  const finalSize = Math.min(file.size, compressedSize);
  const finalBlob = compressedSize <= file.size ? compressedBlob : file;
  const saved = Math.max(0, file.size - finalSize);
  const savedPercent = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
  const previewUrl = URL.createObjectURL(finalBlob);

  return {
    blob: finalBlob,
    size: finalSize,
    previewUrl,
    savedPercent,
  };
}

/**
 * 使用 WebAssembly (Gifsicle) 对 GIF 动图进行多帧无损/有损智能压缩
 * @description 绝不使用 Canvas，严格保障每一帧动画完好无损；内置单图 10 秒超时熔断机制与原图安全保底
 * @param {File} file - 待压缩的原始 GIF 文件
 * @param {object} [options] - 压缩配置参数
 * @param {number} [options.lossy=40] - 调色板量化系数 (1~200，默认 40 兼顾平滑画质与 35% 瘦身)
 * @param {number} [options.optLevel=2] - 优化等级 (1~3，默认 2)
 * @returns {Promise<CompressResult | null>} 压缩产物与体积预估
 */
export async function compressGifWithWasm(
  file: File,
  options: {
    lossy?: number;
    optLevel?: number;
  } = {}
): Promise<CompressResult | null> {
  // 检查空文件
  if (!file || file.size === 0) {
    return null;
  }

  // 大图过滤保护：超大动图直接保底原图透传，防止浏览器 Web Worker 发生 OOM 崩溃
  if (file.size > MAX_GIF_SIZE_FOR_WASM) {
    console.warn(`[GifsicleCompressor] 文件 "${file.name}" 体积超过 15MB，跳过 Wasm 压缩以保护内存`);
    return {
      blob: file,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      savedPercent: 0,
    };
  }

  const { lossy = 40, optLevel = 2 } = options;

  // 严格设置 10 秒单图超时熔断保护，为复杂多帧计算提供充裕时间
  return Promise.race([
    executeGifCompression(file, { lossy, optLevel }).catch((error) => {
      console.warn('[GifsicleCompressor] Wasm 动图压缩执行异常，安全降级为原动态图:', error);
      // 核心红线：严禁降级为 Canvas！必须回退为原图动态 Blob 保底
      return {
        blob: file,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        savedPercent: 0,
      };
    }),
    new Promise<CompressResult>((resolve) =>
      setTimeout(() => {
        console.warn(`[GifsicleCompressor] 文件 "${file.name}" 动图压缩达到 10 秒超时上限，强制熔断`);
        // 超时保底为原动图
        resolve({
          blob: file,
          size: file.size,
          previewUrl: URL.createObjectURL(file),
          savedPercent: 0,
        });
      }, 10000)
    ),
  ]);
}
