/**
 * wasm 模块类型声明
 */

declare module '@/lib/wasm/imagequant.js' {
  interface ImageQuantOptions {
    noInitialRun?: boolean;
    locateFile?: (path: string, scriptDirectory?: string) => string;
  }

  interface ImageQuantModule {
    quantize: (
      data: Uint8ClampedArray | Uint8Array,
      width: number,
      height: number,
      maxColors: number,
      dithering: number
    ) => Uint8Array;
  }

  function imagequant(options?: ImageQuantOptions): Promise<ImageQuantModule>;
  export default imagequant;
}

declare module '@/lib/wasm/squoosh_oxipng.js' {
  export function init(input?: string | Request | URL): Promise<any>;
  export function optimise(data: Uint8Array, level: number, interlace: boolean): Uint8Array;
}

declare module 'upng-js' {
  const UPNG: {
    encode: (
      bufs: ArrayBuffer[],
      width: number,
      height: number,
      cnum: number,
      dels?: number[]
    ) => ArrayBuffer;
    decode: (buff: ArrayBuffer) => any;
    toRGBA8: (out: any) => ArrayBuffer[];
  };
  export default UPNG;
}

declare module '@/lib/wasm/gifsicle.js' {
  export interface GifsicleInputFile {
    /** 文件二进制数据源 */
    file: File | Blob | ArrayBuffer | Uint8Array | string;
    /** 虚拟文件系统内部文件名 (如 1.gif) */
    name: string;
  }

  export interface GifsicleRunOptions {
    /** 虚拟输入文件列表 */
    input: GifsicleInputFile[];
    /** Gifsicle 命令行参数列表 */
    command: string[];
    /** 可选的虚拟文件夹 */
    folder?: string[];
    /** 是否严格模式 */
    isStrict?: boolean;
  }

  interface GifsicleEngine {
    /** 运行 Gifsicle 命令并返回生成的 File 数组 */
    run(options: GifsicleRunOptions): Promise<File[] | null>;
  }

  const gifsicle: GifsicleEngine;
  export default gifsicle;
}
