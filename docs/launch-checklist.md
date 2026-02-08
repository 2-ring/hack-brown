# DropCal Launch Checklist

## High Priority (before/at launch)

- [ ] **Google Search Console** — Submit site, verify ownership of dropcal.ai, monitor indexing
- [ ] **Google OAuth consent screen** — Submit for production verification (users see "unverified app" warning without this)
- [ ] **Privacy Policy / Terms of Service** — Required by Google OAuth/API policies; consent screen will be rejected without one
- [ ] **DNS email (e.g. hello@dropcal.ai)** — Needed for Google consent screen contact + support

## Medium Priority (soon after launch)

- [ ] **Analytics** (Plausible, PostHog, or GA) — Track usage and know if anyone is using it
- [ ] **Claim social handles** — @dropcal on Twitter/X, Instagram, etc. before someone else does
- [ ] **Custom 404 page** — Ensure hosting serves SPA fallback for all routes
- [ ] **Sitemap** — Helps Google index faster, especially with a landing/marketing page

## Nice to Have

- [ ] **Status page** (e.g. Betterstack) — Shows reliability if users depend on it
- [ ] **Error monitoring** (Sentry) — Know when things break in production
- [ ] **Custom domain email forwarding** — Cheap via Cloudflare or ImprovMX
