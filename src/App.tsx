import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PhoneFrame } from './components/Layout'
import { useStore } from './lib/store'
import History from './pages/History'
import Home from './pages/Home'
import Log from './pages/Log'
import Onboarding, { afterOnboarding } from './pages/Onboarding'
import Settings from './pages/Settings'
import Verdict from './pages/Verdict'
import Nutrition from './pages/Nutrition'

export default function App() {
  const { state } = useStore()
  const { pathname } = useLocation()
  const has = !!state.profile
  const guard = (el: React.ReactElement) => (has ? el : <Navigate to="/onboarding" replace />)
  return (
    <PhoneFrame>
      <ErrorBoundary key={pathname}>
      <Routes>
        <Route path="/onboarding" element={has ? <Navigate to={afterOnboarding.to} replace /> : <Onboarding />} />
        <Route path="/" element={guard(<Home />)} />
        <Route path="/log" element={guard(<Log />)} />
        <Route path="/history" element={guard(<History />)} />
        <Route path="/settings" element={guard(<Settings />)} />
        <Route path="/day/:date" element={guard(<Verdict />)} />
        <Route path="/nutrition" element={guard(<Nutrition />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </PhoneFrame>
  )
}
