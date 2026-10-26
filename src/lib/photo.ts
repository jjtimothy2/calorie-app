// v1.5: shrink a camera photo in the browser before it goes to the AI. Longest side 1024 px, JPEG ~0.8.
// The result only lives in memory while the photo sheets are open; it is never saved.
export const MAX_SIDE = 1024

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}

/** Returns a data:image/jpeg URL. Throws if the browser can't open the image (e.g. HEIC outside Safari). */
export async function downscalePhoto(file: Blob, max = MAX_SIDE, quality = 0.8): Promise<string> {
  let src: ImageBitmap | HTMLImageElement
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { src = await loadImage(file) }
  const w0 = src.width, h0 = src.height
  if (!w0 || !h0) throw new Error('decode')
  const s = Math.min(1, max / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, 0, 0, w, h)
  if ('close' in src) src.close()
  return canvas.toDataURL('image/jpeg', quality)
}
