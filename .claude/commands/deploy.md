Deploy the application to production. Argument: $ARGUMENTS (backend, frontend, or both/all/empty for everything).

## Steps

### Backend (if $ARGUMENTS contains "backend", "back", "all", "both", or is empty)

1. `cd backend && eb deploy dropcal-prod`
2. Wait for completion and verify the deploy succeeded

### Frontend (if $ARGUMENTS contains "frontend", "front", "all", "both", or is empty)

1. `cd frontend && npm run build`
2. `cd frontend && aws s3 sync dist/ s3://dropcal-frontend --delete`
3. `aws cloudfront create-invalidation --distribution-id EULFJVVYHCA7 --paths "/*"`
4. Verify the sync and invalidation completed successfully

Report the result of each deployment step.
