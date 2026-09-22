import SparkMD5 from 'spark-md5'

/**
 * 客户端异步计算原生切图文件的 MD5 指纹 (作为防重查重唯一标识)
 * @param {File} file - 原生 File 对象
 * @returns {Promise<string>} 32 位小写 MD5 散列值
 */
export function computeFileMd5(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // 实例化 FileReader
    const reader = new FileReader()
    
    // 读取完成后使用 SparkMD5 计算 ArrayBuffer
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        // 计算散列值
        const spark = new SparkMD5.ArrayBuffer()
        spark.append(buffer)
        const hex = spark.end()
        resolve(hex)
      } catch (err) {
        reject(err)
      }
    }

    // 监听读取错误
    reader.onerror = (err) => {
      reject(err)
    }

    // 读取为 ArrayBuffer
    reader.readAsArrayBuffer(file)
  })
}
