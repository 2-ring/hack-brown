-- Add plan and Stripe billing columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Index for webhook lookups by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id
  ON public.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Validate plan values
ALTER TABLE public.users
  ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'pro'));
