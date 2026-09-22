import JSZip from 'jszip'

/**
 * 客户端内存平铺解压 ZIP 切图压缩包，过滤并提取出所有的图像文件
 * @param {File} zipFile - 上传的 ZIP 文件对象
 * @returns {Promise<File[]>} 解包后的纯图像文件列表
 */
export async function extractZipImages(zipFile: File): Promise<File[]> {
  // 加载 zip 实例
  const zip = new JSZip()
  const loadedZip = await zip.loadAsync(zipFile)
  const imageFiles: File[] = []

  // 支持的图像扩展名正则
  const imageRegex = /\.(png|jpe?g|webp|svg)$/i

  // 遍历 ZIP 包内的每个文件条目
  const promises: Promise<void>[] = []
  loadedZip.forEach((relativePath, entry) => {
    // 忽略目录与 MacOS __MACOSX 隐藏文件
    if (entry.dir || relativePath.includes('__MACOSX') || relativePath.startsWith('.')) {
      return
    }

    // 判断是否为支持的切图格式
    if (imageRegex.test(relativePath)) {
      const p = entry.async('blob').then((blob) => {
        // 截取文件名，去除子目录前缀实现平铺
        const simpleName = relativePath.split('/').pop() || entry.name
        const ext = simpleName.split('.').pop()?.toLowerCase() || ''
        let mime = blob.type
        // 若 zip 实体未携带 MIME，根据后缀自动推断补全
        if (!mime) {
          if (ext === 'png') mime = 'image/png'
          else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
          else if (ext === 'webp') mime = 'image/webp'
          else if (ext === 'svg') mime = 'image/svg+xml'
        }
        const file = new File([blob], simpleName, { type: mime })
        imageFiles.push(file)
      })
      promises.push(p)
    }
  })

  // 等待所有图像文件 blob 转换完成
  await Promise.all(promises)
  return imageFiles
}
