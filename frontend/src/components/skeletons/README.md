# Skeleton Loading System

A comprehensive, centralized skeleton loading system for DropCal built on `react-loading-skeleton` v3.5.0.

## 📁 Structure

```
skeletons/
├── index.ts                 # Central exports
├── types.ts                 # TypeScript definitions
├── skeleton.css            # Shared styles
├── SkeletonWrapper.tsx     # Theme provider
├── LoadingSpinner.tsx      # Unified spinner
├── SkeletonText.tsx        # Text skeletons
├── SkeletonAvatar.tsx      # Avatar skeletons
├── SkeletonCard.tsx        # Card skeletons
├── SkeletonList.tsx        # List/grid skeletons
├── hooks.ts                # Loading state hooks
└── README.md               # This file
```

## 🚀 Quick Start

### 1. Wrap Your App with SkeletonWrapper

In your `App.tsx` or `main.tsx`:

```tsx
import { SkeletonWrapper } from './components/skeletons'

function App() {
  return (
    <SkeletonWrapper>
      {/* Your app content */}
    </SkeletonWrapper>
  )
}
```

### 2. Use Skeleton Components

```tsx
import { SkeletonText, SkeletonCard, LoadingSpinner } from './components/skeletons'

function MyComponent({ isLoading, data }) {
  if (isLoading) {
    return <SkeletonCard lines={3} />
  }

  return <div>{data}</div>
}
```

## 🧩 Components

### LoadingSpinner

Unified loading spinner that replaces all custom CSS spinners.

```tsx
// Basic usage
<LoadingSpinner />

// Custom size and color
<LoadingSpinner size="large" color="#4285f4" />

// Light background variant
<LoadingSpinner light />

// Custom size (number = pixels)
<LoadingSpinner size={40} />

// With container
<LoadingSpinnerContainer minHeight={200} />
```

**Props:**
- `size`: `'small' | 'medium' | 'large' | number` (default: `'medium'`)
- `color`: Custom color (default: `#333333` or `#ffffff` if `light`)
- `light`: Boolean for light backgrounds
- `label`: Accessible label (default: "Loading...")

---

### SkeletonText

Text skeleton with predefined variants.

```tsx
// Heading variants
<SkeletonText variant="h1" />
<SkeletonText variant="h2" />
<SkeletonText variant="h3" />

// Body text
<SkeletonText variant="body" />

// Multi-line paragraph
<SkeletonText variant="body" lines={3} lastLineWidth="70%" />

// Shortcuts
<SkeletonHeading level={1} />
<SkeletonParagraph lines={4} />

// Custom dimensions
<SkeletonText width={200} height={24} />
```

**Variants:**
- `h1`: 36px height, 60% width
- `h2`: 32px height, 70% width
- `h3`: 28px height, 80% width
- `body`: 20px height, 100% width
- `caption`: 16px height, 90% width
- `label`: 14px height, 40% width

---

### SkeletonAvatar

Avatar skeleton with predefined sizes and shapes.

```tsx
// Default circle avatar
<SkeletonAvatar />

// Size variants
<SkeletonAvatar size="small" />   // 24px
<SkeletonAvatar size="medium" />  // 32px
<SkeletonAvatar size="large" />   // 48px
<SkeletonAvatar size={64} />      // Custom size

// Shapes
<SkeletonAvatar shape="circle" />
<SkeletonAvatar shape="square" />
<SkeletonAvatar shape="rounded" />

// Avatar group (overlapping)
<SkeletonAvatarGroup count={3} overlap={8} />
```

---

### SkeletonCard

Pre-built card skeleton for common layouts.

```tsx
// Basic card
<SkeletonCard lines={3} />

// Card with avatar
<SkeletonCard hasAvatar lines={2} />

// Card with image thumbnail
<SkeletonCard hasImage lines={2} />

// Card with action buttons
<SkeletonCard hasActions lines={2} />

// Specialized variants
<SkeletonEventCard />     // Matches your Event component
<SkeletonProfileCard />   // User profile cards
```

---

### SkeletonList

List skeleton with flexible rendering.

```tsx
// Simple list
<SkeletonList
  count={5}
  renderItem={() => <SkeletonText />}
/>

// List of cards
<SkeletonList
  count={3}
  gap={16}
  renderItem={() => <SkeletonCard lines={2} />}
/>

// Different items based on index
<SkeletonList
  count={5}
  renderItem={(index) => (
    <div>
      <SkeletonAvatar size="small" />
      <SkeletonText width={`${80 - index * 10}%`} />
    </div>
  )}
/>

// Table skeleton
<SkeletonTable rows={5} columns={4} hasHeader />

// Grid skeleton
<SkeletonGrid count={6} columns={3} gap={16} />
```

---

## 🪝 Hooks

### useLoadingState

Simple loading state management.

```tsx
const { isLoading, startLoading, stopLoading } = useLoadingState()

// Usage
startLoading()
// ... async operation
stopLoading()
```

---

### useLoadingDelay

Prevents flash of loading content for fast operations (<300ms). Follows Material Design guidelines.

```tsx
const showSkeleton = useLoadingDelay(isLoading, 300)

return showSkeleton ? <Skeleton /> : <Content />
```

---

### useMinimumLoadingTime

Ensures loading state is shown for minimum duration to prevent jarring flashes.

```tsx
const showSkeleton = useMinimumLoadingTime(isLoading, 500)

// Even if isLoading becomes false after 100ms,
// skeleton will show for at least 500ms
```

---

### useProgressiveLoading

For streaming/progressive loading where items load one by one.

```tsx
const { isLoading, skeletonCount, progress } = useProgressiveLoading(
  expectedTotal,
  currentlyLoaded
)

// Show skeletons for remaining items
<SkeletonList count={skeletonCount} />

// Show loaded items
{loadedItems.map(item => <Item data={item} />)}
```

---

### useSkeletonCount

Calculate number of skeletons to show.

```tsx
const skeletonCount = useSkeletonCount(10, events.length)
// Returns: 10 - events.length (never negative)
```

---

### useLoadingTimeout

Safety timeout for hanging requests.

```tsx
const safeLoading = useLoadingTimeout(isLoading, 30000, () => {
  console.error('Request timed out')
})
```

---

### useIncrementalLoading

Skeletons appear one by one with stagger effect.

```tsx
const visibleCount = useIncrementalLoading(5, 100, isLoading)

// Renders 0, then 1, then 2... skeletons with 100ms delay
<SkeletonList count={visibleCount} />
```

---

## 🎨 Theming

Customize the global skeleton theme in `SkeletonWrapper`:

```tsx
<SkeletonWrapper
  baseColor="#f5f5f5"
  highlightColor="#e0e0e0"
  borderRadius={12}
  duration={1.5}
  enableAnimation={true}
>
  <App />
</SkeletonWrapper>
```

**Default theme:**
- `baseColor`: `#f0f0f0`
- `highlightColor`: `#e0e0e0`
- `borderRadius`: `8px`
- `duration`: `1.5s`
- `enableAnimation`: `true`

---

## ✅ Best Practices

### 1. Component-Level Skeletons

Each component should handle its own skeleton state:

```tsx
function EventCard({ event, isLoading }) {
  if (isLoading) {
    return <SkeletonEventCard />
  }

  return <div>{event.title}</div>
}
```

### 2. Match Actual Content

Skeleton layout should match actual content exactly to prevent layout shift:

```tsx
// ❌ Bad - generic skeleton
<SkeletonCard />

// ✅ Good - matches your component
<SkeletonEventCard /> // Same layout as <Event />
```

### 3. Use Semantic Variants

Use predefined variants for consistency:

```tsx
// ✅ Good
<SkeletonText variant="h1" />
<SkeletonText variant="body" />

// ❌ Avoid arbitrary values unless necessary
<SkeletonText height={37} width="64%" />
```

### 4. Accessibility

Always include proper ARIA attributes:

```tsx
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? <Skeleton /> : <Content />}
</div>
```

### 5. Loading Delays

Use delays to prevent flashing for fast operations:

```tsx
// For operations that typically complete in <300ms
const showSkeleton = useLoadingDelay(isLoading, 300)
```

---

## 🔧 Migration Guide

### Replacing Custom Spinners

**Before:**
```tsx
<div className="loading-spinner"></div>
```

**After:**
```tsx
<LoadingSpinner />
```

### Replacing Custom Skeletons

**Before:**
```tsx
<div className="skeleton-card">
  <Skeleton height={28} />
  <Skeleton height={20} width="60%" />
</div>
```

**After:**
```tsx
<SkeletonEventCard />
```

---

## 📦 Exports

```tsx
import {
  // Theme
  SkeletonWrapper,

  // Components
  LoadingSpinner,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonList,

  // Hooks
  useLoadingState,
  useLoadingDelay,
  useProgressiveLoading,

  // Raw skeleton (advanced)
  Skeleton
} from './components/skeletons'
```

---

## 🎯 Examples

### Event Cards (Current Use Case)

```tsx
import { SkeletonEventCard } from './components/skeletons'

function EventsWorkspace({ events, isLoading, expectedCount }) {
  return (
    <div>
      {isLoading ? (
        Array.from({ length: expectedCount }).map((_, i) => (
          <SkeletonEventCard key={i} />
        ))
      ) : (
        events.map(event => <Event data={event} />)
      )}
    </div>
  )
}
```

### Account Component

```tsx
import { LoadingSpinner } from './components/skeletons'

function Account() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner size="small" />
  }

  return <UserProfile user={user} />
}
```

### Progressive Loading

```tsx
import { useProgressiveLoading, SkeletonEventCard } from './components/skeletons'

function EventList({ events, expectedTotal }) {
  const { skeletonCount } = useProgressiveLoading(expectedTotal, events.length)

  return (
    <>
      {events.map(event => <Event data={event} />)}
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <SkeletonEventCard key={`skeleton-${i}`} />
      ))}
    </>
  )
}
```

---

## 🐛 Troubleshooting

**Skeletons not showing:**
- Ensure `SkeletonWrapper` is wrapping your app
- Check that `isLoading` prop is `true`

**Styles not applied:**
- Import CSS: `import 'react-loading-skeleton/dist/skeleton.css'` (done in SkeletonWrapper)
- Import component CSS: `import './skeleton.css'` (done in components)

**Layout shift:**
- Ensure skeleton dimensions match actual content
- Use the same container styles for skeleton and content

---

## 📚 Resources

- [react-loading-skeleton docs](https://github.com/dvtng/react-loading-skeleton)
- [Material Design Progress Indicators](https://material.io/components/progress-indicators)
- [Skeleton Screen Best Practices](https://www.lukew.com/ff/entry.asp?1797)

---

Built for DropCal with ❤️
