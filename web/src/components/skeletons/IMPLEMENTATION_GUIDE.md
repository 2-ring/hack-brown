# Implementation Guide

Step-by-step guide to applying the skeleton loading system throughout DropCal.

## Phase 1: Setup (Required First)

### Step 1: Wrap App with SkeletonWrapper

Update your [App.tsx:316-359](frontend/src/App.tsx#L316-L359):

```tsx
import { SkeletonWrapper } from './components/skeletons'

function App() {
  // ... existing code

  return (
    <SkeletonWrapper>
      <div className="app">
        <Menu ... />
        <Toaster ... />
        <div className={`content ${sidebarOpen ? 'with-sidebar' : ''}`}>
          <Workspace ... />
        </div>
      </div>
    </SkeletonWrapper>
  )
}
```

---

## Phase 2: Replace Custom Spinners

### Replace Account.tsx Loading Spinner

**Current:** [Account.tsx:17-24](frontend/src/menu/Account.tsx#L17-L24)

```tsx
// ❌ Old
if (loading) {
  return (
    <div className="account-container">
      <div className="account-loading">
        <div className="loading-spinner"></div>
      </div>
    </div>
  );
}
```

```tsx
// ✅ New
import { LoadingSpinnerContainer } from '../components/skeletons'

if (loading) {
  return (
    <div className="account-container">
      <LoadingSpinnerContainer size="small" />
    </div>
  );
}
```

Then **remove** `.loading-spinner` and `@keyframes spin` from [Account.css:16-29](frontend/src/menu/Account.css#L16-L29).

---

### Replace LoginButton Spinner

If you have a similar spinner in LoginButton.tsx, replace it the same way:

```tsx
import { LoadingSpinner } from '../components/skeletons'

<LoadingSpinner size="small" light />
```

Then remove the duplicate CSS from LoginButton.css.

---

## Phase 3: Refactor Event Skeletons

### Update Event.tsx

**Current:** [Event.tsx:44-58](frontend/src/workspace/events/Event.tsx#L44-L58)

```tsx
// ✅ Already good! But can be simplified

// Current approach (keep this, it works well)
if (isLoading && !event) {
  return (
    <motion.div
      key={`skeleton-${index}`}
      className="event-confirmation-card skeleton-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Skeleton height={28} borderRadius={8} style={{ marginBottom: '12px' }} />
      <Skeleton height={20} width="60%" borderRadius={8} style={{ marginBottom: '12px' }} />
      <Skeleton count={2} height={18} borderRadius={8} />
    </motion.div>
  )
}
```

**Alternative using SkeletonEventCard (optional):**

```tsx
import { SkeletonEventCard } from '../components/skeletons'

if (isLoading && !event) {
  return (
    <motion.div
      key={`skeleton-${index}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <SkeletonEventCard />
    </motion.div>
  )
}
```

**Keep your current approach** - it's already excellent!

---

## Phase 4: Add Skeletons to New Components

### Menu Session List

Add skeletons to the session list in Menu component:

```tsx
import { SkeletonList, SkeletonText, SkeletonAvatar } from './components/skeletons'

function Menu({ sessions, isLoadingSessions }) {
  return (
    <div className="menu">
      {isLoadingSessions ? (
        <SkeletonList
          count={5}
          gap={8}
          renderItem={() => (
            <div style={{ display: 'flex', gap: 12, padding: 12 }}>
              <SkeletonAvatar size="small" shape="rounded" />
              <div style={{ flex: 1 }}>
                <SkeletonText variant="body" width="80%" />
                <SkeletonText variant="caption" width="40%" />
              </div>
            </div>
          )}
        />
      ) : (
        sessions.map(session => <SessionItem data={session} />)
      )}
    </div>
  )
}
```

---

### Settings Popup

Add skeletons to SettingsPopup sections:

```tsx
import { SkeletonText, SkeletonAvatar } from './components/skeletons'

function SettingsPopup({ isLoadingSettings }) {
  if (isLoadingSettings) {
    return (
      <div className="settings-popup">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <SkeletonAvatar size={64} />
          <SkeletonText variant="h3" width={150} />
          <SkeletonText variant="caption" width={200} />
        </div>
      </div>
    )
  }

  // ... rest of component
}
```

---

## Phase 5: Progressive Loading Patterns

### Streaming Events (Already Implemented Well!)

Your current implementation in [EventsWorkspace.tsx:284-308](frontend/src/workspace/events/EventsWorkspace.tsx#L284-L308) is excellent:

```tsx
{isLoading ? (
  // Streaming state - show skeleton for null events
  Array.from({ length: expectedEventCount || 3 }).map((_, index) => {
    const event = events[index]
    const editedEvent = event ? (editedEvents[index] || event) : null

    return (
      <Event
        key={event ? `event-${index}` : `skeleton-${index}`}
        event={editedEvent}
        index={index}
        isLoading={!event}  // 👈 Progressive loading!
        // ... props
      />
    )
  })
) : (
  // Complete state - show only actual events
  editedEvents.filter((event): event is CalendarEvent => event !== null).map(...)
)}
```

**Optional enhancement with hook:**

```tsx
import { useProgressiveLoading } from './components/skeletons'

const { skeletonCount, isComplete } = useProgressiveLoading(
  expectedEventCount || 3,
  events.filter(e => e !== null).length
)

// Then use skeletonCount if needed
```

---

## Phase 6: Loading State Improvements

### Add Loading Delays

Prevent flash of loading content for fast operations:

```tsx
import { useLoadingDelay } from './components/skeletons'

function MyComponent({ isLoading }) {
  // Only show skeleton if loading takes >300ms
  const showSkeleton = useLoadingDelay(isLoading, 300)

  if (showSkeleton) {
    return <Skeleton />
  }

  return <Content />
}
```

### Add Minimum Loading Time

Ensure smooth transitions by showing skeleton for minimum duration:

```tsx
import { useMinimumLoadingTime } from './components/skeletons'

function MyComponent({ isLoading }) {
  // Always show skeleton for at least 500ms
  const showSkeleton = useMinimumLoadingTime(isLoading, 500)

  if (showSkeleton) {
    return <Skeleton />
  }

  return <Content />
}
```

---

## Phase 7: Cleanup Old Code

After migrating to the new system:

1. **Remove duplicate spinner CSS**
   - Remove `.loading-spinner` from Account.css (keep Google button styles)
   - Remove `.loading-spinner` from LoginButton.css
   - Remove `@keyframes spin` duplicates

2. **Consolidate imports**
   - Replace individual `Skeleton` imports with centralized ones:
   ```tsx
   // ❌ Old
   import Skeleton from 'react-loading-skeleton'
   import 'react-loading-skeleton/dist/skeleton.css'

   // ✅ New
   import { Skeleton, SkeletonText } from './components/skeletons'
   ```

3. **Update TypeScript imports**
   - Import types from centralized location:
   ```tsx
   import type { SkeletonTextProps } from './components/skeletons'
   ```

---

## Common Patterns

### Pattern 1: Simple Component Skeleton

```tsx
import { LoadingSpinner } from './components/skeletons'

function SimpleComponent({ data, isLoading }) {
  if (isLoading) return <LoadingSpinner />
  return <div>{data}</div>
}
```

### Pattern 2: Content-Matching Skeleton

```tsx
import { SkeletonCard } from './components/skeletons'

function Card({ data, isLoading }) {
  if (isLoading) return <SkeletonCard lines={3} hasAvatar />
  return (
    <div className="card">
      <Avatar src={data.avatar} />
      <h3>{data.title}</h3>
      <p>{data.description}</p>
    </div>
  )
}
```

### Pattern 3: List Skeleton

```tsx
import { SkeletonList, SkeletonCard } from './components/skeletons'

function CardList({ items, isLoading }) {
  if (isLoading) {
    return <SkeletonList count={5} renderItem={() => <SkeletonCard />} />
  }

  return items.map(item => <Card data={item} />)
}
```

### Pattern 4: Progressive Loading

```tsx
import { useProgressiveLoading } from './components/skeletons'

function StreamingList({ items, expectedTotal }) {
  const { skeletonCount } = useProgressiveLoading(expectedTotal, items.length)

  return (
    <>
      {items.map(item => <Item data={item} />)}
      <SkeletonList count={skeletonCount} renderItem={() => <SkeletonCard />} />
    </>
  )
}
```

---

## Testing Checklist

After implementation, test these scenarios:

- [ ] Fast operations (<300ms) - Should not flash skeleton
- [ ] Medium operations (300ms-1s) - Should show skeleton smoothly
- [ ] Slow operations (>1s) - Should show skeleton with progress
- [ ] Progressive loading - Skeletons disappear as items load
- [ ] Error states - Skeleton disappears on error
- [ ] Mobile devices - Skeleton layout matches content
- [ ] Accessibility - Screen readers announce loading state

---

## Quick Reference Card

```tsx
// Spinners
<LoadingSpinner size="small | medium | large" />
<LoadingSpinnerContainer minHeight={200} />

// Text
<SkeletonText variant="h1 | h2 | h3 | body | caption" />
<SkeletonText lines={3} lastLineWidth="70%" />

// Avatar
<SkeletonAvatar size="small | medium | large" shape="circle | square | rounded" />

// Cards
<SkeletonCard lines={3} hasAvatar hasImage hasActions />
<SkeletonEventCard />

// Lists
<SkeletonList count={5} renderItem={...} />

// Hooks
const showSkeleton = useLoadingDelay(isLoading, 300)
const { skeletonCount } = useProgressiveLoading(total, loaded)
```

---

## Need Help?

- See [README.md](./README.md) for full documentation
- Check [types.ts](./types.ts) for TypeScript definitions
- Look at existing components for examples
- All components have JSDoc comments with examples

---

Ready to improve your loading states! 🚀
