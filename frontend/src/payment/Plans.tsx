import { useNavigate } from 'react-router-dom'
import { CaretLeft, RocketLaunch, Lightning, Check } from '@phosphor-icons/react'
import './Plans.css'

interface PlanFeature {
  text: string
  included: boolean
}

interface Plan {
  name: string
  tagline: string
  price: string
  priceSubtext: string
  ctaText: string
  ctaVariant: 'primary' | 'secondary'
  features: PlanFeature[]
  popular?: boolean
  icon: JSX.Element
}

export function Plans() {
  const navigate = useNavigate()

  const plans: Plan[] = [
    {
      name: 'Free',
      tagline: 'Try DropCal essentials',
      price: '$0',
      priceSubtext: 'forever',
      ctaText: 'Get started',
      ctaVariant: 'secondary',
      icon: <RocketLaunch size={40} weight="duotone" />,
      features: [
        { text: 'Up to 10 events per month', included: true },
        { text: 'Text and image input', included: true },
        { text: 'Basic event extraction', included: true },
        { text: 'Calendar integration', included: true },
        { text: 'Conflict detection', included: false },
        { text: 'Advanced AI parsing', included: false },
        { text: 'Priority processing', included: false },
      ],
    },
    {
      name: 'Pro',
      tagline: 'Schedule without limits',
      price: '$12',
      priceSubtext: '/month billed annually',
      ctaText: 'Get Pro plan',
      ctaVariant: 'primary',
      icon: <Lightning size={40} weight="duotone" />,
      popular: true,
      features: [
        { text: 'Everything in Free, plus:', included: true },
        { text: 'Unlimited events', included: true },
        { text: 'Audio and document support', included: true },
        { text: 'Advanced AI parsing with context', included: true },
        { text: 'Smart conflict detection', included: true },
        { text: 'Multi-calendar support', included: true },
        { text: 'Priority support', included: true },
      ],
    },
  ]

  return (
    <div className="plans-page">
      <button className="back-button" onClick={() => navigate('/')}>
        <CaretLeft size={24} weight="regular" />
      </button>

      <div className="plans-container">
        <div className="plans-grid">
          {plans.map((plan) => (
            <div key={plan.name} className={`plan-card ${plan.popular ? 'popular' : ''}`}>
              {plan.popular && <div className="popular-badge">Most Popular</div>}

              <div className="plan-icon">{plan.icon}</div>

              <div className="plan-header">
                <h2 className="plan-name">{plan.name}</h2>
                <p className="plan-tagline">{plan.tagline}</p>
              </div>

              <div className="plan-pricing">
                <div className="plan-price">{plan.price}</div>
                <div className="plan-price-subtext">{plan.priceSubtext}</div>
              </div>

              <button className={`plan-cta ${plan.ctaVariant}`}>
                {plan.ctaText}
              </button>

              <div className="plan-features">
                {plan.features.map((feature, index) => (
                  <div key={index} className={`feature-item ${!feature.included ? 'disabled' : ''}`}>
                    <Check
                      size={18}
                      weight="bold"
                      className={`feature-check ${!feature.included ? 'disabled' : ''}`}
                    />
                    <span className="feature-text">{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="plans-disclaimer">
          *All prices shown are in USD. Features and limits subject to change.
        </p>
      </div>
    </div>
  )
}
