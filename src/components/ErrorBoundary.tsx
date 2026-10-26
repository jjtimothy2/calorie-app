// v1.10.2: a render crash on one screen shows this card instead of unmounting the whole app (a blank screen).
// Keyed by the route in App, so moving to another tab clears it.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Card } from './ui'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('Screen crashed:', error?.message, info.componentStack?.split('\n')[1]?.trim() ?? '') }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="flex flex-1 flex-col justify-center px-5 pb-5" data-testid="error-boundary">
        <Card className="p-5 text-center">
          <div aria-hidden="true" className="text-[34px]">🥴</div>
          <h1 className="title mt-1 text-[26px] leading-tight" role="alert">Something went wrong</h1>
          <p className="mt-2 text-[15px] text-mute">This screen hit a snag. Your logs are safe on this device. Reload to try again.</p>
          <Button className="mt-4 min-h-11" onClick={() => window.location.reload()} data-testid="error-reload">Reload</Button>
          <a href={`${import.meta.env.BASE_URL}`} className="tap mt-2 flex min-h-11 items-center justify-center text-[15px] font-semibold text-g-ink">Go to Today</a>
        </Card>
      </main>
    )
  }
}
