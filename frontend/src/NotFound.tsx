import { useNavigate } from 'react-router-dom'
import { Drop, Lifebuoy, Link } from '@phosphor-icons/react'
import wordImageLight from './assets/brand/light/word.png'
import './NotFound.css'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="not-found">
      <div className="not-found-content">
        <div className="not-found-logo">
          <Drop size={32} weight="fill" color="#1170C5" />
          <img src={wordImageLight} alt="DropCal" className="not-found-word" />
        </div>
        <h1 className="not-found-title">404</h1>
        <button onClick={() => navigate('/')} className="not-found-button">
          <Lifebuoy size={22} weight="duotone" />
          Back to safety
          <Link size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}
