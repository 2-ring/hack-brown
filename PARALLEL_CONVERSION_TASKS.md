# DropCal: Parallelizable React Native Conversion Tasks

**Tasks organized for simultaneous execution by multiple agents**

---

## Quick Start: Task Selection Guide

**Can start immediately (no dependencies):**
- Group A: Setup & Configuration (Tasks 1-6)
- Group B: Theme System (Tasks 7-10)
- Group C: Simple Component Conversions (Tasks 11-18)
- Group D: Utility Functions (Tasks 19-23)

**Requires setup completion:**
- Group E: Complex Components (Tasks 24-31)
- Group F: Navigation (Tasks 32-35)
- Group G: Integration (Tasks 36-40)

---

## GROUP A: Setup & Configuration (Start Immediately)

### Task 1: Initialize Expo Project
**Agent Type**: Bash
**Duration**: 15 min
**Dependencies**: None

```bash
# Create new Expo project with TypeScript
npx create-expo-app dropcal-mobile --template expo-template-blank-typescript

# Navigate to project
cd dropcal-mobile

# Install core dependencies
npx expo install react-native-web react-dom
```

**Deliverable**: Fresh Expo project in `/mobile` directory

---

### Task 2: Install Navigation Dependencies
**Agent Type**: Bash
**Duration**: 10 min
**Dependencies**: Task 1

```bash
cd dropcal-mobile

# Install React Navigation
npm install @react-navigation/native @react-navigation/stack @react-navigation/drawer @react-navigation/bottom-tabs

# Install required dependencies
npx expo install react-native-screens react-native-safe-area-context react-native-gesture-handler
```

**Deliverable**: Navigation packages installed

---

### Task 3: Install UI & Animation Dependencies
**Agent Type**: Bash
**Duration**: 10 min
**Dependencies**: Task 1

```bash
cd dropcal-mobile

# Animation libraries
npm install moti react-native-reanimated

# UI libraries
npm install react-native-vector-icons @react-native-community/blur
npx expo install react-native-linear-gradient react-native-svg

# Configure reanimated plugin in babel.config.js
```

**Deliverable**: Animation & UI packages installed

---

### Task 4: Install File & Media Dependencies
**Agent Type**: Bash
**Duration**: 10 min
**Dependencies**: Task 1

```bash
cd dropcal-mobile

# File pickers
npx expo install expo-image-picker expo-document-picker

# Audio
npx expo install expo-av

# Storage & clipboard
npm install @react-native-async-storage/async-storage
npx expo install expo-clipboard expo-file-system
```

**Deliverable**: Media handling packages installed

---

### Task 5: Configure app.json with Permissions
**Agent Type**: Edit
**Duration**: 15 min
**Dependencies**: Task 1

**File**: `/mobile/app.json`

Add iOS/Android permissions, configure plugins, set bundle identifiers.

**Deliverable**: Complete app.json with all permissions configured

---

### Task 6: Set Up NativeWind (Tailwind for RN)
**Agent Type**: Bash + Edit
**Duration**: 20 min
**Dependencies**: Task 1

```bash
cd dropcal-mobile
npm install nativewind tailwindcss
npx tailwindcss init
```

Configure tailwind.config.js and babel.config.js.

**Deliverable**: NativeWind configured and ready to use

---

## GROUP B: Theme System (Start Immediately - Read-Only Operations)

### Task 7: Extract CSS Color Variables
**Agent Type**: Explore + Write
**Duration**: 30 min
**Dependencies**: None

**Input**: Read `/frontend/src/App.css` and all CSS files
**Output**: Create `/mobile/src/theme/colors.ts`

Extract all `--color-*` variables and convert to TypeScript object:

```typescript
export const colors = {
  primary: '#1170C5',
  primaryHover: '#0D5BA3',
  // ... all color variables
}
```

**Deliverable**: `colors.ts` file

---

### Task 8: Extract CSS Spacing Variables
**Agent Type**: Explore + Write
**Duration**: 20 min
**Dependencies**: None

**Input**: Read CSS files for spacing/sizing variables
**Output**: Create `/mobile/src/theme/spacing.ts`

```typescript
export const spacing = {
  buttonSmall: 48,
  buttonMedium: 48,
  // ... all spacing variables
}
```

**Deliverable**: `spacing.ts` file

---

### Task 9: Create Typography System
**Agent Type**: Explore + Write
**Duration**: 30 min
**Dependencies**: None

**Input**: Analyze CSS font-size, font-weight, line-height
**Output**: Create `/mobile/src/theme/typography.ts`

```typescript
export const typography = {
  h1: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  // ... all text styles
}
```

**Deliverable**: `typography.ts` file

---

### Task 10: Create Theme Provider Component
**Agent Type**: Write
**Duration**: 45 min
**Dependencies**: Tasks 7-9

**Output**: Create `/mobile/src/theme/ThemeProvider.tsx`

Theme context with light/dark mode switching, using colors/spacing/typography from Tasks 7-9.

**Deliverable**: `ThemeProvider.tsx` with context hooks

---

## GROUP C: Simple Component Conversions (Start Immediately)

### Task 11: Convert Logo Component
**Agent Type**: Edit + Write
**Duration**: 30 min
**Dependencies**: None (can read web version)

**Input**: `/frontend/src/components/Logo.tsx`
**Output**: `/mobile/src/components/Logo.tsx`

Convert SVG logo to react-native-svg.

**Deliverable**: React Native Logo component

---

### Task 12: Convert Button Component
**Agent Type**: Write
**Duration**: 45 min
**Dependencies**: Task 10 (theme)

**Input**: Analyze button patterns in web app
**Output**: `/mobile/src/components/Button.tsx`

Create reusable Button with Pressable, theme support, variants.

**Deliverable**: Button component with props interface

---

### Task 13: Convert Text Input Component
**Agent Type**: Write
**Duration**: 30 min
**Dependencies**: Task 10 (theme)

**Output**: `/mobile/src/components/TextInput.tsx`

Styled TextInput wrapper with theme support.

**Deliverable**: TextInput component

---

### Task 14: Create Icon Component Wrapper
**Agent Type**: Write
**Duration**: 1 hour
**Dependencies**: Task 3 (vector-icons)

**Output**: `/mobile/src/components/Icon.tsx`

Map Phosphor icon names to react-native-vector-icons equivalents.

```typescript
<Icon name="Calendar" size={24} />
// Maps to correct Feather or Ionicons icon
```

**Deliverable**: Icon component with 57 icon mappings

---

### Task 15: Convert Toast Notifications
**Agent Type**: Write
**Duration**: 45 min
**Dependencies**: None

**Input**: Current sonner toast usage
**Output**: `/mobile/src/components/Toast.tsx`

Replace sonner with react-native-toast-message.

**Deliverable**: Toast utility and component

---

### Task 16: Convert Loading Skeleton
**Agent Type**: Write
**Duration**: 30 min
**Dependencies**: Task 10 (theme)

**Output**: `/mobile/src/components/Skeleton.tsx`

Replace react-loading-skeleton with custom Animated skeleton.

**Deliverable**: Skeleton component

---

### Task 17: Create Modal Component
**Agent Type**: Write
**Duration**: 45 min
**Dependencies**: Task 10 (theme)

**Output**: `/mobile/src/components/Modal.tsx`

Reusable modal with backdrop, animations.

**Deliverable**: Modal component

---

### Task 18: Create Card Component
**Agent Type**: Write
**Duration**: 30 min
**Dependencies**: Task 10 (theme)

**Output**: `/mobile/src/components/Card.tsx`

Base card component with shadows, borders.

**Deliverable**: Card component

---

## GROUP D: Utility Functions (Start Immediately)

### Task 19: Create File Upload Utilities
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 4 (file pickers installed)

**Output**: `/mobile/src/utils/fileUpload.ts`

Functions for:
- `pickImage()` - expo-image-picker
- `pickDocument()` - expo-document-picker
- `pickAudio()` - document picker with audio types
- `uriToBlob()` - Convert file URI to Blob
- `createFormData()` - Create upload FormData

**Deliverable**: Complete file upload utilities

---

### Task 20: Create Storage Utilities
**Agent Type**: Write
**Duration**: 45 min
**Dependencies**: Task 4 (AsyncStorage installed)

**Output**: `/mobile/src/utils/storage.ts`

Replace localStorage with AsyncStorage:
```typescript
export const storage = {
  getItem: async (key: string) => {...},
  setItem: async (key: string, value: string) => {...},
  removeItem: async (key: string) => {...},
}
```

**Deliverable**: Storage utility functions

---

### Task 21: Create Clipboard Utilities
**Agent Type**: Write
**Duration**: 20 min
**Dependencies**: Task 4 (expo-clipboard installed)

**Output**: `/mobile/src/utils/clipboard.ts`

Replace navigator.clipboard with expo-clipboard.

**Deliverable**: Clipboard utility functions

---

### Task 22: Create Platform Detection Utilities
**Agent Type**: Write
**Duration**: 30 min
**Dependencies**: None

**Output**: `/mobile/src/utils/platform.ts`

```typescript
export const isIOS = Platform.OS === 'ios'
export const isAndroid = Platform.OS === 'android'
export const isWeb = Platform.OS === 'web'
```

**Deliverable**: Platform utility functions

---

### Task 23: Create Date/Time Formatting Utilities
**Agent Type**: Write
**Duration**: 45 min
**Dependencies**: None

**Output**: `/mobile/src/utils/dateTime.ts`

Reusable date/time formatting functions.

**Deliverable**: Date utility functions

---

## GROUP E: Complex Components (Requires Setup)

### Task 24: Convert EventCard Component
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Tasks 10, 12, 14, 18 (theme, Button, Icon, Card)

**Input**: `/frontend/src/workspace/events/Event.tsx`
**Output**: `/mobile/src/components/EventCard.tsx`

Convert event card with:
- Pressable interactions
- Icon display
- Date/time formatting
- Styled with theme

**Deliverable**: EventCard component

---

### Task 25: Convert DateHeader Component
**Agent Type**: Write
**Duration**: 1 hour
**Dependencies**: Task 10 (theme)

**Input**: `/frontend/src/workspace/events/DateHeader.tsx`
**Output**: `/mobile/src/components/DateHeader.tsx`

Convert circular date header.

**Deliverable**: DateHeader component

---

### Task 26: Create Native Date Picker
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 3 (@react-native-community/datetimepicker)

**Input**: `/frontend/src/workspace/events/inputs/DateInput.tsx`
**Output**: `/mobile/src/components/DatePicker.tsx`

Use native date picker:
```typescript
<DatePicker
  value={date}
  onChange={setDate}
  mode="date"
/>
```

**Deliverable**: DatePicker component

---

### Task 27: Create Native Time Picker
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 3 (datetimepicker)

**Input**: `/frontend/src/workspace/events/inputs/TimeInput.tsx`
**Output**: `/mobile/src/components/TimePicker.tsx`

Native time picker with 15-min intervals.

**Deliverable**: TimePicker component

---

### Task 28: Convert Text Input Screen
**Agent Type**: Write
**Duration**: 1.5 hours
**Dependencies**: Tasks 13, 21 (TextInput, clipboard)

**Input**: `/frontend/src/workspace/input/droparea/content/Text.tsx`
**Output**: `/mobile/src/screens/input/TextInput.tsx`

Text input with paste button using expo-clipboard.

**Deliverable**: TextInput screen

---

### Task 29: Convert Link Input Screen
**Agent Type**: Write
**Duration**: 1.5 hours
**Dependencies**: Task 13 (TextInput)

**Input**: `/frontend/src/workspace/input/droparea/content/Link.tsx`
**Output**: `/mobile/src/screens/input/LinkInput.tsx`

URL input with validation.

**Deliverable**: LinkInput screen

---

### Task 30: Convert Email Input Screen
**Agent Type**: Write
**Duration**: 1 hour
**Dependencies**: Task 12 (Button)

**Input**: `/frontend/src/workspace/input/droparea/content/Email.tsx`
**Output**: `/mobile/src/screens/input/EmailInput.tsx`

Email display with mailto link (use Linking.openURL).

**Deliverable**: EmailInput screen

---

### Task 31: Create Audio Recording Screen
**Agent Type**: Write
**Duration**: 3 hours
**Dependencies**: Task 4 (expo-av)

**Input**: `/frontend/src/workspace/input/droparea/content/Audio.tsx`
**Output**: `/mobile/src/screens/input/AudioRecorder.tsx`

Audio recording with expo-av + decorative visualization.

**Deliverable**: AudioRecorder screen

---

## GROUP F: Navigation Structure (Requires Setup + Theme)

### Task 32: Create Root Navigator
**Agent Type**: Write
**Duration**: 1 hour
**Dependencies**: Task 2 (navigation installed)

**Output**: `/mobile/src/navigation/RootNavigator.tsx`

Stack navigator with:
- Main tab navigator
- Modal screens (settings, plans)
- Authentication flow

**Deliverable**: RootNavigator component

---

### Task 33: Create Main Tab Navigator
**Agent Type**: Write
**Duration**: 1.5 hours
**Dependencies**: Tasks 32, 14 (Root navigator, Icons)

**Output**: `/mobile/src/navigation/TabNavigator.tsx`

Bottom tab navigation:
- Home (workspace)
- Sessions (history)
- Settings

**Deliverable**: TabNavigator component

---

### Task 34: Create Drawer Navigator (Optional)
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 32

**Output**: `/mobile/src/navigation/DrawerNavigator.tsx`

Side drawer for session history (alternative to bottom tabs).

**Deliverable**: DrawerNavigator component

---

### Task 35: Configure Deep Linking
**Agent Type**: Edit
**Duration**: 1 hour
**Dependencies**: Task 32

**Files**: `/mobile/app.json`, `/mobile/src/navigation/linking.ts`

Configure URL scheme for session sharing:
```
dropcal://session/:sessionId
```

**Deliverable**: Deep linking configuration

---

## GROUP G: Screen Components (Requires Navigation)

### Task 36: Create Home Screen
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Tasks 32, 19 (navigation, file upload)

**Output**: `/mobile/src/screens/HomeScreen.tsx`

Main screen with input options:
- Text input button
- Link input button
- Email input button
- Image picker button
- Document picker button
- Audio recorder button

**Deliverable**: HomeScreen component

---

### Task 37: Create EventEditView Screen
**Agent Type**: Write
**Duration**: 4 hours
**Dependencies**: Tasks 24, 26, 27 (EventCard, DatePicker, TimePicker)

**Input**: `/frontend/src/workspace/events/EventEditView.tsx`
**Output**: `/mobile/src/screens/EventEditScreen.tsx`

Event editing with:
- KeyboardAvoidingView
- Native pickers
- Save/cancel buttons
- Form validation

**Deliverable**: EventEditScreen component

---

### Task 38: Create EventsList Screen
**Agent Type**: Write
**Duration**: 3 hours
**Dependencies**: Tasks 24, 25 (EventCard, DateHeader)

**Input**: `/frontend/src/workspace/events/EventsWorkspace.tsx`
**Output**: `/mobile/src/screens/EventsListScreen.tsx`

Event list with:
- FlatList (performance)
- Grouped by date
- Pull-to-refresh
- Loading states

**Deliverable**: EventsListScreen component

---

### Task 39: Create SessionHistory Screen
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 24 (EventCard)

**Input**: `/frontend/src/menu/Menu.tsx` (session list)
**Output**: `/mobile/src/screens/SessionHistoryScreen.tsx`

Session history with grouped lists (Today, Yesterday, etc.).

**Deliverable**: SessionHistoryScreen component

---

### Task 40: Create Settings Screen
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Tasks 10, 12 (theme, Button)

**Input**: `/frontend/src/menu/SettingsPopup.tsx`
**Output**: `/mobile/src/screens/SettingsScreen.tsx`

Settings with:
- Theme toggle (light/dark)
- Calendar selection
- Account info
- Sign out

**Deliverable**: SettingsScreen component

---

## GROUP H: Authentication (Requires Backend Integration)

### Task 41: Port AuthContext
**Agent Type**: Edit + Write
**Duration**: 2 hours
**Dependencies**: Task 20 (storage utilities)

**Input**: `/frontend/src/auth/AuthContext.tsx`
**Output**: `/mobile/src/contexts/AuthContext.tsx`

Replace localStorage with AsyncStorage.

**Deliverable**: AuthContext for mobile

---

### Task 42: Create Sign In Screen
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 41 (AuthContext)

**Output**: `/mobile/src/screens/SignInScreen.tsx`

Google OAuth sign-in (use expo-auth-session).

**Deliverable**: SignInScreen component

---

### Task 43: Port Backend Client
**Agent Type**: Edit
**Duration**: 1 hour
**Dependencies**: None

**Input**: `/frontend/src/backend-client.ts`
**Output**: `/mobile/src/api/backend-client.ts`

Copy as-is (fetch works in React Native).

**Deliverable**: Backend client for mobile

---

## GROUP I: Animations (Requires Moti)

### Task 44: Create Animation Variants
**Agent Type**: Write
**Duration**: 2 hours
**Dependencies**: Task 3 (moti installed)

**Input**: `/frontend/src/workspace/events/animations.ts`
**Output**: `/mobile/src/animations/variants.ts`

Convert Framer Motion variants to Moti configuration.

**Deliverable**: Animation variants file

---

### Task 45: Add List Animations
**Agent Type**: Edit
**Duration**: 1.5 hours
**Dependencies**: Tasks 38, 44 (EventsList, variants)

Add stagger animations to EventsList using Moti.

**Deliverable**: Animated EventsList

---

### Task 46: Add Screen Transition Animations
**Agent Type**: Edit
**Duration**: 1 hour
**Dependencies**: Task 32 (navigation)

Configure screen transition animations in Stack Navigator.

**Deliverable**: Smooth screen transitions

---

## GROUP J: Integration & Testing

### Task 47: Wire Up File Upload Flow
**Agent Type**: Edit
**Duration**: 2 hours
**Dependencies**: Tasks 19, 36, 43 (file utils, HomeScreen, backend)

Connect file pickers to upload API.

**Deliverable**: Working file upload flow

---

### Task 48: Wire Up Event Creation Flow
**Agent Type**: Edit
**Duration**: 2 hours
**Dependencies**: Tasks 37, 38, 43 (EventEdit, EventsList, backend)

Connect event editing to backend API.

**Deliverable**: Working event creation

---

### Task 49: Add Error Handling
**Agent Type**: Edit
**Duration**: 2 hours
**Dependencies**: Task 15 (Toast)

Add try/catch blocks and toast notifications.

**Deliverable**: Error handling throughout app

---

### Task 50: Configure iOS Build
**Agent Type**: Bash
**Duration**: 1 hour
**Dependencies**: All core tasks complete

```bash
eas build --platform ios --profile preview
```

**Deliverable**: iOS build configuration

---

### Task 51: Configure Android Build
**Agent Type**: Bash
**Duration**: 1 hour
**Dependencies**: All core tasks complete

```bash
eas build --platform android --profile preview
```

**Deliverable**: Android build configuration

---

## Execution Strategy

### Phase 1: Foundation (Week 1)
**Run in parallel**: Tasks 1-10 (setup + theme)
**Blocking**: Tasks 1-6 must complete before others can test
**Output**: Working Expo app with theme system

### Phase 2: Core Components (Week 1-2)
**Run in parallel**: Tasks 11-23 (simple components + utilities)
**Dependencies**: Theme (Task 10)
**Output**: Reusable component library

### Phase 3: Complex Components (Week 2-3)
**Run in parallel**: Tasks 24-31 (event components, input screens)
**Dependencies**: Simple components (Tasks 11-18)
**Output**: All screen components built

### Phase 4: Navigation (Week 3)
**Run in parallel**: Tasks 32-35 (navigators)
**Dependencies**: Core components (Tasks 11-18)
**Output**: App navigation structure

### Phase 5: Screens (Week 3-4)
**Run in parallel**: Tasks 36-40 (full screens)
**Dependencies**: Navigation (Task 32) + Complex components (Tasks 24-31)
**Output**: All app screens

### Phase 6: Backend Integration (Week 4-5)
**Run in parallel**: Tasks 41-43 (auth + API)
**Dependencies**: Storage utilities (Task 20)
**Output**: Working backend integration

### Phase 7: Polish (Week 5-6)
**Run in parallel**: Tasks 44-49 (animations + wiring + errors)
**Dependencies**: All screens built
**Output**: Polished, working app

### Phase 8: Build (Week 6)
**Sequential**: Tasks 50-51 (builds)
**Dependencies**: Everything complete
**Output**: Installable iOS/Android apps

---

## Task Assignment Matrix

| Role | Primary Tasks | Backup Tasks |
|------|---------------|--------------|
| **Agent 1** (Setup) | 1-6 | 50-51 |
| **Agent 2** (Theme) | 7-10 | 44 |
| **Agent 3** (Simple Components) | 11-14 | 24-25 |
| **Agent 4** (More Components) | 15-18 | 26-27 |
| **Agent 5** (Utilities) | 19-23 | 28-30 |
| **Agent 6** (Complex Components) | 24-27 | 31 |
| **Agent 7** (Input Screens) | 28-31 | 49 |
| **Agent 8** (Navigation) | 32-35 | 46 |
| **Agent 9** (Main Screens) | 36-40 | 45 |
| **Agent 10** (Backend) | 41-43, 47-48 | - |

---

## Dependencies Graph

```
Task 1 (Expo Init)
  ├─> Task 2 (Navigation packages)
  ├─> Task 3 (UI packages)
  ├─> Task 4 (File packages)
  ├─> Task 5 (app.json)
  └─> Task 6 (NativeWind)

Tasks 7-9 (CSS extraction) → Task 10 (ThemeProvider)

Task 10 (Theme) + Task 3 (Packages)
  ├─> Tasks 11-18 (Simple components)
  └─> Tasks 19-23 (Utilities)

Tasks 11-18 (Simple) + Task 10 (Theme)
  └─> Tasks 24-31 (Complex components)

Task 2 (Navigation) + Tasks 11-18 (Simple)
  └─> Tasks 32-35 (Navigation structure)

Tasks 32-35 (Navigation) + Tasks 24-31 (Complex)
  └─> Tasks 36-40 (Screens)

Task 20 (Storage) + Task 43 (Backend)
  └─> Task 41 (AuthContext)
  └─> Task 42 (Sign In)

All components + Task 43 (Backend)
  └─> Tasks 47-48 (Integration)

Task 3 (Moti)
  └─> Task 44 (Animation variants)
  └─> Tasks 45-46 (Apply animations)
```

---

## Success Criteria

Each task is complete when:
1. ✅ Code compiles without errors
2. ✅ Component renders on iOS/Android simulators
3. ✅ No TypeScript errors
4. ✅ Basic functionality works (buttons press, inputs accept text, etc.)
5. ✅ Follows theme system (uses theme context, not hard-coded colors)

---

## Quick Start for Agents

**To begin conversion**:
1. Assign Tasks 1-10 to Agents 1-2 (foundation)
2. Wait for Task 10 completion (theme provider)
3. Assign Tasks 11-23 to Agents 3-5 (components + utilities)
4. Proceed through phases as dependencies complete

**Estimated total time with 10 agents**: 6-8 weeks

**Estimated total time with 5 agents**: 10-12 weeks

**Estimated total time solo**: 16-20 weeks
