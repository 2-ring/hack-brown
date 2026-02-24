import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CaretLeft, RocketLaunch, Lightning, Check } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext'
import { createCheckoutSession, createPortalSession } from '../api/backend-client'
import './Plans.css'

interface PlanFeature {
  text: string
  included: boolean
}

interface PlanDef {
  id: 'free' | 'pro'
  name: string
  tagline: string
  price: string
  priceSubtext: string
  features: PlanFeature[]
  popular?: boolean
  icon: JSX.Element
}

export function Plans() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { plan: currentPlan, session } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Handle return from Stripe Checkout
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setMessage('Welcome to DropCal Pro! Your subscription is active.')
    } else if (searchParams.get('canceled') === 'true') {
      setMessage('Checkout canceled. No charges were made.')
    }
  }, [searchParams])

  const handleUpgrade = async () => {
    if (!session) {
      navigate('/')
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const { checkout_url } = await createCheckoutSession()
      window.location.href = checkout_url
    } catch (err: any) {
      setMessage(err.message || 'Failed to start checkout. Please try again.')
      setLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const { portal_url } = await createPortalSession()
      window.location.href = portal_url
    } catch (err: any) {
      setMessage(err.message || 'Failed to open subscription management.')
      setLoading(false)
    }
  }

  const plans: PlanDef[] = [
    {
      id: 'free',
      name: 'Free',
      tagline: 'Try DropCal essentials',
      price: '$0',
      priceSubtext: 'forever',
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
      id: 'pro',
      name: 'Pro',
      tagline: 'Schedule without limits',
      price: '$12',
      priceSubtext: '/month',
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

  const getCtaText = (planDef: PlanDef) => {
    if (planDef.id === currentPlan) return 'Current plan'
    if (planDef.id === 'pro') return loading ? 'Loading...' : 'Get Pro plan'
    return 'Get started'
  }

  const getCtaVariant = (planDef: PlanDef) => {
    if (planDef.id === currentPlan) return 'secondary'
    return planDef.id === 'pro' ? 'primary' : 'secondary'
  }

  const handleCtaClick = (planDef: PlanDef) => {
    if (planDef.id === currentPlan) return
    if (planDef.id === 'free') {
      navigate('/')
    } else {
      handleUpgrade()
    }
  }

  return (
    <div className="plans-page">
      <button className="back-button" onClick={() => navigate('/')}>
        <CaretLeft size={24} weight="regular" />
      </button>

      <div className="plans-container">
        {message && (
          <div className="plans-message">
            {message}
          </div>
        )}

        <div className="plans-grid">
          {plans.map((planDef) => (
            <div key={planDef.name} className={`plan-card ${planDef.popular ? 'popular' : ''}`}>
              {planDef.popular && <div className="popular-badge">Most Popular</div>}

              <div className="plan-icon">{planDef.icon}</div>

              <div className="plan-header">
                <h2 className="plan-name">{planDef.name}</h2>
                <p className="plan-tagline">{planDef.tagline}</p>
              </div>

              <div className="plan-pricing">
                <div className="plan-price">{planDef.price}</div>
                <div className="plan-price-subtext">{planDef.priceSubtext}</div>
              </div>

              <button
                className={`plan-cta ${getCtaVariant(planDef)}`}
                onClick={() => handleCtaClick(planDef)}
                disabled={planDef.id === currentPlan || loading}
              >
                {getCtaText(planDef)}
              </button>

              <div className="plan-features">
                {planDef.features.map((feature, index) => (
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

              {/* Show manage subscription for current Pro users */}
              {planDef.id === 'pro' && currentPlan === 'pro' && (
                <button
                  className="plan-manage-link"
                  onClick={handleManageSubscription}
                  disabled={loading}
                >
                  Manage subscription
                </button>
              )}
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
