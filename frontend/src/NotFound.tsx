import { useNavigate } from 'react-router-dom'
import { Lifebuoy, Link } from '@phosphor-icons/react'
import { WordMark } from './components/WordMark'
import './NotFound.css'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="not-found">
      <div className="not-found-content">
        <WordMark size={48} />
        <h1 className="display-text not-found-title">404</h1>
        <button onClick={() => navigate('/')} className="not-found-button">
          <Lifebuoy size={22} weight="duotone" />
          Back to safety
          <Link size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}
