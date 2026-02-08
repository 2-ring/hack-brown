import { useNavigate } from 'react-router-dom'
import { ShootingStar, Link } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { FunnelAnimation } from './FunnelAnimation'
import './Welcome.css'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <div className="welcome">
      <PageHeader />

      <main className="welcome-main">
        <div className="welcome-content">
          <h1 className="display-text welcome-hero">
            Drop anything in.
            <br />
            Get events out.
          </h1>
          <FunnelAnimation />
          <button onClick={() => navigate('/')} className="welcome-cta">
            <ShootingStar size={22} weight="duotone" />
            See the magic
            <Link size={18} weight="bold" />
          </button>
        </div>
      </main>
    </div>
  )
}
