// v1.6.3: live rear-camera preview inside the AI sheet. The stream only lives while the big frame is showing; every
// track is stopped as soon as it isn't (text first, photo taken, results, sheet closed, app hidden).
// A refusal or failure is remembered for this app session, so the sheet never re-prompts in a loop.

let blocked = false

/** False once the camera was refused, missing or failed in this session (or getUserMedia doesn't exist). */
export const cameraAvailable = () => !blocked && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export async function startCamera(): Promise<MediaStream> {
  if (!cameraAvailable()) throw new Error('unavailable')
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } })
  } catch (e) {
    blocked = true
    throw e
  }
}

export function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop())
}

/** The current video frame as a JPEG blob (full camera size; the photo pipeline downscales it to 1024 px). */
export function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth, h = video.videoHeight
  if (!w || !h) return Promise.reject(new Error('no frame'))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return Promise.reject(new Error('canvas'))
  ctx.drawImage(video, 0, 0, w, h)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.92))
}

