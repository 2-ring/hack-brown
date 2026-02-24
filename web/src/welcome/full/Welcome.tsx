import { TopBar } from './components/TopBar'
import { NavBar } from './components/NavBar'
import Hero from './components/Hero'
import { Personalization } from './components/Personalization'
import { FeatureDetails } from './components/FeatureDetails'
import { Omnipresence } from './components/Omnipresence'
import { BottomCTA } from './components/BottomCTA'
import { Footer } from './components/Footer'
import './Welcome.css'

export function Welcome() {
  return (
    <div className="welcome">
      <TopBar />
      <NavBar />
      <div className="welcome-main">
        <div className="welcome-content">
          <Hero />
          <Personalization />
          <Omnipresence />
          <FeatureDetails />
          <BottomCTA />
        </div>
      </div>
      <Footer />
    </div>
  )
}
