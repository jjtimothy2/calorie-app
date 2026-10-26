// v1.5.2 screenshots (WebKit, iPhone emulation) at 390x844 and 375x667:
// screenshots/v152-log-camera-*.png (Log bar, camera right of Quick add) and v152-photo-note-*.png (note focused and typed,
// keyboard simulated by a shorter viewport). Runs the v1.5.2 iOS test with SHOTS=1; needs the preview server.
import { spawnSync } from 'node:child_process'
const r = spawnSync(process.execPath, [new URL('../tests/v152-ios.mjs', import.meta.url).pathname], { stdio: 'inherit', env: { ...process.env, SHOTS: '1' } })
process.exit(r.status ?? 1)
