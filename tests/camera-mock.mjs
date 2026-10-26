// v1.6.3 fake camera for Playwright (Chrome and WebKit). Use with ctx.addInitScript(CAMERA_MOCK, mode).
// mode 'ok': getUserMedia returns canvas.captureStream() of a drawn plate; 'deny': NotAllowedError (permission
// refused); 'missing': NotFoundError (no camera); 'none': no navigator.mediaDevices at all.
// window.__cam = { calls, constraints, streams }; window.__live() counts tracks still running.
export const CAMERA_MOCK = (mode) => {
  const cam = (window.__cam = { calls: 0, constraints: [], streams: [], mode })
  window.__live = () => cam.streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length
  if (mode === 'none') { try { Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => undefined }) } catch { /* ignore */ } return }
  // WebKit sometimes has no navigator.mediaDevices yet when init scripts run; give it one so the app sees the mock.
  let md = navigator.mediaDevices
  if (!md) { md = {}; try { Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => md }) } catch { return } }
  const draw = (cv, t) => {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height
    g.fillStyle = '#8a5a35'; g.fillRect(0, 0, W, H)
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#7d5130' : '#94633c'; g.fillRect(0, i * H / 9, W, H / 18) }
    const cx = W / 2 + Math.sin(t / 700) * 6, cy = H / 2 + Math.cos(t / 900) * 4
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(cx + 8, cy + 12, W * 0.36, H * 0.42, 0, 0, 7); g.fill()
    g.fillStyle = '#fbfaf6'; g.beginPath(); g.ellipse(cx, cy, W * 0.36, H * 0.42, 0, 0, 7); g.fill()
    g.fillStyle = '#f1efe8'; g.beginPath(); g.ellipse(cx, cy, W * 0.27, H * 0.32, 0, 0, 7); g.fill()
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx - 40, cy - 10, 80, 62, 0, 0, 7); g.fill()
    g.fillStyle = '#d8a13a'; g.beginPath(); g.ellipse(cx + 60, cy - 30, 46, 40, 0, 0, 7); g.fill()
    g.fillStyle = '#f6d24a'; g.beginPath(); g.arc(cx + 60, cy - 30, 18, 0, 7); g.fill()
    g.fillStyle = '#4f8a3a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(cx + 20 + i * 14, cy + 60, 16, 7, i, 0, 7); g.fill() }
    g.fillStyle = '#b9bcc0'; g.fillRect(cx + W * 0.4, cy - 90, 14, 190)
  }
  md.getUserMedia = async (c) => {
    cam.calls++; cam.constraints.push(c)
    const m = window.__cam.mode
    if (m === 'deny') throw new DOMException('Permission denied', 'NotAllowedError')
    if (m === 'missing') throw new DOMException('Requested device not found', 'NotFoundError')
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 960
    draw(cv, 0)
    const s = cv.captureStream(15)
    const id = setInterval(() => { if (s.getVideoTracks()[0]?.readyState !== 'live') clearInterval(id); else draw(cv, performance.now()) }, 66)
    cam.streams.push(s)
    return s
  }
}
