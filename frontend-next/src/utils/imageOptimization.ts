type OptimizeImageOptions = {
  targetBytes?: number
  maxDimension?: number
  minDimension?: number
  outputType?: 'image/webp' | 'image/jpeg'
  qualitySteps?: number[]
  allowUpscale?: boolean
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to render optimized image'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Unable to read image for optimization'))
      element.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function resolveScaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
  minDimension: number,
  allowUpscale: boolean,
) {
  if (width <= 0 || height <= 0) {
    return { width: maxDimension, height: maxDimension }
  }

  const longestSide = Math.max(width, height)
  const shortestSide = Math.min(width, height)
  const downscaleFactor = longestSide > maxDimension ? maxDimension / longestSide : 1
  const upscaleFactor = allowUpscale && shortestSide > 0 && shortestSide < minDimension
    ? minDimension / shortestSide
    : 1
  const scale = allowUpscale
    ? Math.max(downscaleFactor, upscaleFactor)
    : Math.min(downscaleFactor, 1)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function optimizeImageForUpload(file: File, options: OptimizeImageOptions = {}) {
  const targetBytes = options.targetBytes ?? 350 * 1024
  const maxDimension = options.maxDimension ?? 1600
  const minDimension = options.minDimension ?? 480
  const outputType = options.outputType ?? 'image/webp'
  const qualitySteps = options.qualitySteps ?? [0.94, 0.9, 0.86, 0.82, 0.78, 0.74]
  const allowUpscale = options.allowUpscale ?? false

  if (!file.type.startsWith('image/')) {
    return file
  }

  const sourceImage = await loadImage(file)
  const { width, height } = resolveScaledDimensions(
    sourceImage.width,
    sourceImage.height,
    maxDimension,
    minDimension,
    allowUpscale,
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    return file
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(sourceImage, 0, 0, width, height)

  const preferredType = outputType === 'image/webp' ? 'image/webp' : 'image/jpeg'
  let bestBlob = await canvasToBlob(canvas, preferredType, qualitySteps[0])

  for (const quality of qualitySteps) {
    const candidateBlob = await canvasToBlob(canvas, preferredType, quality)
    bestBlob = candidateBlob
    if (candidateBlob.size <= targetBytes) {
      break
    }
  }

  if (bestBlob.size >= file.size && file.size <= targetBytes) {
    return file
  }

  const extension = preferredType === 'image/webp' ? 'webp' : 'jpg'
  const basename = file.name.replace(/\.[^.]+$/, '') || 'upload'
  return new File([bestBlob], `${basename}.${extension}`, {
    type: preferredType,
    lastModified: Date.now(),
  })
}
