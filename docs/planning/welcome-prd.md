# DropCal Landing Page — Design & Content Specification

This document describes the DropCal landing page in full detail. It covers every section's layout, written content, visual behavior, and interactive elements. It is meant to be handed directly to a developer who will produce the finished page. There is no code here — only descriptions of what should exist and what it should look like.

Colors, fonts, and specific brand tokens should be pulled from the existing DropCal codebase. Where this document says "accent color" or "muted text color," use whatever the codebase already defines. The overall tone is dark and refined — not the typical bright SaaS look. Think confident, clean, a little editorial.

---

## Global Design Language

### Spacing Philosophy

Generous. Sections breathe. There is never a feeling of crowding. Each section has roughly 120–140px of vertical padding on desktop, scaling down to about 80px on mobile. Within sections, the gap between a headline and its subtext is about 20–24px. The gap between subtext and the main visual/interactive element below it is about 48–64px. Let things float in space.

### Typography Hierarchy

The page uses two type treatments. Headlines are in a serif or display serif font — something with character, not a generic sans-serif. Think Instrument Serif, Playfair Display, or whatever the codebase already uses for display type. Body text and UI elements use the codebase's sans-serif.

Size hierarchy on desktop:
- Hero headline: very large, roughly 64–72px, tight letter-spacing (about -0.03em), tight line-height (about 1.05)
- Section headlines: 44–52px, same serif font, same tight spacing
- Section subtext: 17–19px, muted color, line-height around 1.6, max-width around 480px, centered under the headline
- UI/card text: 13–15px
- Labels and tiny text: 11–13px, uppercase, letterspaced (0.04–0.06em)

Everything scales proportionally on mobile using clamp() or equivalent responsive sizing.

### Border Radius

Consistent across the page. Cards and large containers: 16–20px radius. Buttons: 10–12px. Small pills/chips: fully rounded (border-radius: 9999px). The page should feel softly rounded everywhere, never sharp-cornered.

### Borders

Thin, subtle. 1px, using a border color that's just barely visible — a dark grey that's a couple shades lighter than the surface it sits on. Never heavy or prominent. Borders define edges, they don't demand attention.

### Shadows

Minimal. Used sparingly on elevated elements like the DropCal icon in the hero animation or CTA buttons. When present, they're soft and diffuse — large blur radius, low opacity. No hard drop shadows anywhere.

### Transitions

Everything that changes state (hover, scroll-triggered entrance, cycling animation) transitions smoothly. Default easing: cubic-bezier(0.4, 0, 0.2, 1). Default duration: 300–500ms. Nothing should snap or feel jarring. The page should feel liquid.

---

## Top Bar

A thin, full-width announcement bar sits at the very top of the page, above the nav. It has a subtle background — either a very slightly lighter shade than the page background, or a thin accent-colored strip.

**Content:** "Join the beta — early access to one-click scheduling." with a small inline link/arrow: "Join now ›"

The text is small (13–14px), centered. The entire bar is about 40px tall. Clicking it scrolls to the beta signup or opens the signup flow.

---

## Section 1: Navigation Bar

### Layout

Sticky on scroll. Full viewport width, with content centered in a max-width container (roughly 1200px). Height: about 64px. Background: the page's base background color with a subtle backdrop-blur if the page scrolls behind it. Bottom border: 1px, very subtle.

### Content (left to right)

**Left:** DropCal logo. The wordmark/icon from the codebase. No tagline next to it.

**Center-ish / right of logo:** Nav links. Keep it minimal — probably just "Product", "Pricing", "Beta". Text is 14–15px, regular weight, muted color, with a hover state that brightens to full text color. No dropdowns needed yet.

**Right:** A single primary CTA button: "Join the Beta". This button uses the accent color background, white text, the standard 10–12px border radius, padding roughly 10px vertical by 24px horizontal. Subtle glow/shadow on hover.

**Mobile:** The nav collapses. Logo on left, hamburger or a single "Join the Beta" button on right.

---

## Section 2: Hero

This is the largest and most important section. It occupies roughly the full viewport height on load.

### Layout

Centered, single-column on the content level. The visual animation sits below the text. Everything is horizontally centered.

### Background

The page's base dark background. A large, soft, blurred gradient orb (the accent color at maybe 15–20% opacity, blurred to about 80–100px radius) floats behind the headline area, positioned roughly centered and above the text. This gives the headline area a subtle warm glow without being a literal gradient background. It's ambient, not decorative.

### Content, top to bottom

**Headline (large serif):**

Line 1: "Drop it in."
Line 2: "It's on your calendar."

Line 2 has a gradient text treatment — the text itself is filled with a gradient from the accent color to a lighter/complementary shade. Line 1 is the standard bright text color. The two lines together create a visual rhythm: plain statement, then the payoff in color.

The overall headline should feel like a declaration — confident, not loud. The serif font and tight spacing give it an editorial quality. Reference: Flow's "Don't type, just speak" — that exact scale and weight and spacing. Two phrases, one serif, one italic serif bold. DropCal's version: both lines serif, second line gradient-colored.

**Subtext (below headline, ~24px gap):**

"Photos, PDFs, emails, voice notes, text — DropCal turns any input into perfectly formatted calendar events. One click."

This is centered, max-width about 520px, muted text color, 17–19px. Two to three short lines at most.

**CTA buttons (below subtext, ~36px gap):**

Two buttons, side by side, horizontally centered, gap of 12px between them.

Button 1 (primary): "Join the Beta" — accent color background, white text, subtle glow shadow, 14px vertical padding, 32px horizontal padding, 12px border radius.

Button 2 (secondary): "See how it works" — transparent background, 1px border in the subtle border color, standard text color, same dimensions. On hover, the border brightens slightly.

### Hero Animation (below CTAs, ~80px gap)

This is the centerpiece visual. It communicates the core product: inputs go in, calendar events come out.

**Concept:**

A single flowing visual path that goes from left to right across the screen. On the left side, various input types are represented. They feed into a central DropCal icon. On the right side, clean calendar events emerge. The whole thing is animated — inputs cycle/pulse in from the left, the center icon pulses gently, events appear on the right.

**Reference:** Flow's hero has a single flowing ribbon/line that curves from messy speech text on the left, through a waveform/icon in the center, to clean polished text on the right. That exact spatial concept — left-to-right transformation — is what DropCal's hero should feel like. The curve, the sense of flow and transformation through a central point.

**Detailed description of the animation:**

The visual occupies roughly 900px wide (max) and about 300–350px tall.

**Left side — "Inputs":**

A vertical stack of 5–6 small input cards, arranged in a column. Each card is a compact row: an icon/emoji on the left, a label and type on the right. Cards are approximately 200–220px wide, with about 8px gap between them. Examples:

1. 📄 "Course Syllabus" / PDF
2. 📸 "Event Flyer" / Photo
3. ✉️ "Email Confirmation" / Email
4. 🎤 "Voice Note" / Voice
5. 💬 "Text Message" / SMS
6. 📋 "Meeting Notes" / Doc

At any given moment, one of these cards is "active" — it's slightly brighter, has a faint colored left border (matching its type color), and is nudged a few pixels to the right. The others are dimmed to about 40% opacity. The active card cycles every 2 seconds, moving down the list and looping. The transitions are smooth — opacity and position animate together.

**Center — "DropCal":**

Between the input column and the output column, there's a connecting visual. This is NOT just an arrow. It should feel like Flow's central transformation point.

Idea: A flowing curved path (SVG line, animated) connects from the active input card to the center icon, and another curved path connects from the center icon to the active output card. The paths have animated dashes or dots that travel along them, showing the direction of flow. The paths are thin (1–2px), in the accent color at maybe 50% opacity, with the animated dots/dashes at full accent color.

The center element is the DropCal app icon — a rounded square (18–20px border-radius), about 72px, with a gradient background (accent to a lighter shade). Inside it, a calendar emoji or a simple calendar glyph. It has a soft pulsing glow around it — a ring that expands outward and fades, repeating every 2–3 seconds. It also has a soft shadow beneath it.

**Right side — "Events":**

A vertical stack of 5–6 output event cards, mirroring the input column's structure. Each card is a compact row: a vertical color bar on the left (4px wide, 32px tall, rounded, in the event's category color), then the event title and time/calendar on the right. A small green checkmark circle sits at the far right of each card.

Same animation as the input side: one card is active at a time, slightly brighter and nudged a few pixels to the left, cycling every 2 seconds. The active output card should be synchronized with the active input card — when input 1 lights up, output 1 lights up simultaneously, implying "this input produced this event."

Examples:

1. [purple bar] "CS 200 Lecture" / Mon 10:30 AM · Classes ✓
2. [red bar] "Midterm Exam" / Mar 14, 2:00 PM · Exams ✓
3. [orange bar] "Battle of the Bands" / Fri 8:30 PM · Events ✓
4. [purple bar] "Office Hours" / Wed 3:00 PM · Classes ✓
5. [blue bar] "Team Standup" / Thu 9:00 AM · Work ✓
6. [green bar] "Dentist" / Mar 20, 11:00 AM · Personal ✓

**Below the animation:**

Two small labels, left-aligned and right-aligned under the animation, in tiny uppercase letterspaced text (11px, muted color):

Left: "ANY INPUT"
Right: "YOUR CALENDAR"

---

## Section 3: Personalization

This section communicates the key differentiator — DropCal doesn't just extract events, it creates them *the way you would have*.

### Background

Same dark background as the rest of the page. A subtle blurred accent orb floats off to the right side, roughly behind the interactive card.

### Layout

Centered text at the top, then a large interactive card below, then feature pills below that. Single column, everything centered.

### Content, top to bottom

**Section label (small pill/chip):**

A small pill sits above the headline. It has a 1px border in the subtle border color, the surface background color fill, fully rounded corners. Inside: the text "PERSONALIZATION" in 12–13px, uppercase, letterspaced (0.04em), muted color. About 6px vertical padding, 14px horizontal.

Reference: This is like a quieter version of a badge. Not flashy, just a categorical marker.

**Headline (serif):**

"It already knows
how *you* do things"

Two lines. The word "you" is styled differently — either in italic, or in the accent color, or both. This creates emphasis on the personalization concept. Same size and style as the hero section headlines but slightly smaller (44–52px).

**Subtext:**

"DropCal reads your existing calendar and learns your conventions. Every event feels like one you made yourself — because the system already knows how you make them."

Centered, muted color, 17–18px, max-width 480px.

**Interactive event card (below subtext, ~56px gap):**

This is a mock calendar event creation card that animates to show personalization in action. It's about 520px wide (max), with the surface background color, 1px border, 16px border radius.

**Card header:** A top bar inside the card, separated from the body by a 1px border. Left side: a small colored dot (accent color, 10px diameter) and the text "New Event Preview" in 14px semibold. Right side: a status indicator — starts as "Personalizing..." in muted text, changes to "✓ Personalized" in green when the animation completes.

**Card body:** 5 rows, one for each personalizable field. Each row spans the full width of the card and contains:

- A label column on the left (about 72px wide): "TITLE", "DURATION", "CALENDAR", "LOCATION", "REMINDER" — in 11px, uppercase, letterspaced, muted color.
- A value column filling the rest of the width.

**The animation:** When this section scrolls into view (intersection observer, fires once), the fields animate one by one from top to bottom, with about 1.2 seconds between each.

For each field, the sequence is:
1. The row starts showing the "generic" value in normal text
2. The row gets highlighted — a faint accent-color tint on the background, and a 3px left border in the accent color appears
3. A small annotation appears on the right side of the row in accent-colored text explaining what DropCal learned
4. After a beat, the generic value gets struck through and dims, and the personalized value fades in (semibold, bright text color)
5. The highlight moves to the next row, the left border changes to green, and the annotation fades out

The field data:

| Field | Generic Value | Personalized Value | Annotation |
|-------|--------------|-------------------|------------|
| Title | Introduction to Computer Science Lecture | CS 200 Lecture | Learns your naming conventions |
| Duration | 60 min | 80 min | Knows your actual class lengths |
| Calendar | Default | Classes | Assigns to the right calendar |
| Location | CIT Building Room 368 | CIT 368 | Matches how you write locations |
| Reminder | 30 min before | None | Knows you skip reminders for classes |

After all 5 have animated, the header status changes to "✓ Personalized" in green.

**Reference for the feel of this card:** Flow's "AI Auto Edits" section — a large visual element on the left showing a before/after transformation, with annotated callouts (the orange "Removed filler", "Fixed spelling" labels). DropCal's version is more structured (a card with rows) but the same principle: showing the transformation from generic to personalized with visible annotations explaining what happened.

**Feature pills (below card, ~40px gap):**

A row of small pills, wrapping if needed, horizontally centered. Each pill is similar in style to the section label: 1px border, surface background, fully rounded, 8px vertical / 16px horizontal padding, 13px text, muted color.

The pills: "Title conventions" · "Calendar assignments" · "Default durations" · "Location formatting" · "Reminder preferences" · "Color coding"

These are not interactive — they're just a visual summary of the personalization capabilities. On hover they could subtly brighten (border color or text color shifts slightly).

---

## Section 4: Omnipresence / "From Anywhere"

This section communicates that DropCal meets you wherever you are. It should have a different visual feel from the sections above — a background color change to create contrast and rhythm.

### Background

This section switches to a contrasting background. If the rest of the page is dark, this section could be a very slightly lighter dark (like the "surface" shade), or it could use the opposite treatment: a light/cream background with dark text, similar to how Flow alternates between its cream sections and dark sections. The key is a clear visual break.

Reference: Flow's "Write faster in all your apps, on any device" section uses a full-width dark background with a dramatically different feel from the cream sections above and below it. DropCal should create a similar moment of contrast.

### Layout

Split layout: text content on the left (roughly 45% width), visual/imagery on the right (roughly 55% width). On mobile, this stacks to single-column with text first, visual below.

### Content — Left side

**Platform chips (top, above headline):**

Three small chips in a horizontal row, touching each other (zero gap, or 1px gap). Each chip has a 1px border, rounded corners on the outer edges (the leftmost chip has left-rounded, the rightmost has right-rounded, the middle has square corners — creating a connected segmented-control look). Each chip contains a small platform icon and text:

1. [Google icon] "Google Calendar"
2. [Apple icon] "Apple Calendar"  
3. [Microsoft icon] "Outlook"

These are about 36–40px tall, text is 13–14px. The border is the standard subtle border color. Background is slightly elevated from the section background. They look like a single connected unit, not three separate buttons.

Reference: Flow's "iOS / Mac / Windows" triple chip. That exact component — three connected chips that share borders and form one visual unit. The borders are thin, the corners are gently rounded only on the outer ends, and the chips sit quietly at the top of the section without being loud.

**Headline (serif, left-aligned):**

"Schedule from anywhere,
on any device"

Same serif font, 44–52px. Left-aligned (not centered like the previous sections).

Reference: Flow's "Write faster in all your apps, on any device" — that same scale, serif style, and left-alignment.

**Subtext (below headline):**

"DropCal lives wherever scheduling information exists. Share a screenshot, forward an email, text a photo, paste a link. Your preferences sync across every surface."

Left-aligned, muted color, 17px, max-width about 460px.

**CTA button:**

"See how it works" — secondary style (border, no fill), left-aligned. Same style as the hero's secondary button.

### Content — Right side

A visual composition showing DropCal's multi-channel presence. This should feel dynamic and layered, not like a static grid.

**Concept:** A phone mockup in the center-right area showing the DropCal app/share sheet. Around it, scattered at slight angles and various depths, are floating app and channel icons — representing the different places DropCal lives. Icons cascade/arc from the bottom-left upward and to the right, creating a sweeping trail that converges toward the phone.

**Reference:** Flow's equivalent section has a phone mockup showing a Messages conversation, surrounded by floating app icons (Snapchat, Slack, Figma, Notion, Gmail, etc.) that arc in a sweeping trail from the lower-left up to the phone. That exact composition and spatial arrangement is what DropCal should follow — the cascading trail of icons, the phone as the anchor, the sense of convergence.

**The phone mockup:** A simplified phone frame (rounded rectangle, about 280px wide and 500px tall, with thick rounded corners like a real phone, thin border). Inside: a simplified DropCal interface — maybe showing the share sheet with a syllabus being shared, or the app's main screen with a few recently created events. Keep it clean and schematic, not pixel-perfect screenshots.

**The floating icons around it:** Channel/surface icons at various sizes and slight rotations. They should include:

- SMS/Messages icon
- Gmail/Email icon
- Browser/Chrome icon
- A generic "share" icon (the iOS share sheet square-with-arrow)
- Camera icon (for photo input)
- A microphone icon (for voice)
- A document/PDF icon
- WhatsApp icon

The icons arc from the lower-left toward the phone, getting larger as they get closer to the phone (perspective/depth effect). Some overlap slightly. They have subtle shadows. The overall shape of the trail is a gentle curve — like a river of input channels flowing into the device.

On the opposite side of the phone (upper-right), a few calendar provider icons float out — Google Calendar, Apple Calendar, Outlook — representing the output. Smaller, subtler, indicating where events end up.

---

## Section 5: Feature Detail Cards (Personalization Sub-Features)

This section breaks down the specific ways DropCal personalizes events. It uses a two-column card layout similar to Flow's "Personal dictionary" / "Snippet library" / "Different tones for each app" sections.

### Background

Returns to the main page background color (matching Sections 2 and 3).

### Layout

A two-column grid, alternating left/right for visual rhythm. Each row has:
- A text block (headline + subtext) on one side
- A visual/demo card on the other side

The rows alternate which side the text is on:
- Row 1: visual LEFT, text RIGHT
- Row 2: text LEFT, visual RIGHT
- Row 3: visual LEFT, text RIGHT

The visual cards are large rounded rectangles (20px radius, about 50% of the section width) with a contrasting background (either much darker or using the surface shade). Inside them: a simplified UI demo of the feature.

**Reference:** Flow's "Personal dictionary" (list of words on the left in a dark card, title + description on the right), "Snippet library" (title + description on the left, UI mockup on the right in a dark card), "Different tones for each app" (title + description on the left, visual on the right). That exact alternating pattern, card sizing, spacing between text and card, and proportions.

### Spacing detail

Each row has about 80–100px of vertical space between them. The text block and visual card within a row are separated by about 48–64px of horizontal space. On mobile, they stack vertically with the visual card above the text.

### Row 1: "Titles & Naming"

**Visual card (left):** A dark card showing a before/after. Top area: a faded-out, struck-through generic title like "Introduction to Computer Science — Tuesday Lecture Session". Below it: the personalized version in bright text, semibold: "CS 200 Lecture". Then another example: generic "Homework Assignment #4 — Abstract Algebra" struck through, personalized "MATH 540 HW 4". Maybe 3 examples stacked. Each with a small green checkmark next to the personalized version.

**Text (right):**
- Headline (serif, 36–40px): *Titles that sound like you*
- Subtext (16–17px, muted): "DropCal learns whether you say 'Math HW' or 'Math Homework,' whether you capitalize, whether you abbreviate. Every event title reads like one you wrote yourself."

### Row 2: "Calendar Assignment"

**Text (left):**
- Headline: *The right calendar, every time*
- Subtext: "Classes go to Classes. Work meetings go to Work. Deadlines go to Deadlines. DropCal learns which calendar you use for what — so you never have to pick from a dropdown again."

**Visual card (right):** A dark card showing a list of 5–6 calendars with colored dots next to them (mimicking a real Google Calendar sidebar). Next to each calendar name, a small counter or example: "Classes (47 events)" / "Work (23 events)" / "Personal (18 events)". One calendar is highlighted/selected, showing it was auto-assigned. This should look like a real calendar sidebar but simplified and stylized.

### Row 3: "Time & Duration"

**Visual card (left):** A dark card showing two event blocks side by side or stacked. One labeled "Generic" shows "60 min" in a plain block. The other labeled "Yours" shows "80 min" — stretched wider to visually represent the longer duration. Below: "DropCal learned that your CS 200 lectures are always 80 minutes." in small, muted text within the card.

**Text (right):**
- Headline: *Durations that match reality*
- Subtext: "Your 50-minute lectures, your 25-minute meetings, your all-day deadlines. DropCal learns your actual patterns — not default hour blocks."

---

## Section 6: Bottom CTA

The final section. Simple, confident, inviting.

### Background

Same as main page background. A large subtle gradient orb behind the text, similar to the hero section.

### Layout

Centered, single-column. Tight.

### Content

**Headline (serif, large — 48–56px):**

"Start dropping"

Simple, action-oriented. One line.

**Subtext:**

"One-click scheduling from photos, PDFs, emails, voice notes, and text. Join the beta and try it free."

Centered, muted, 17–18px, max-width 480px.

**CTA button:**

"Join the Beta" — primary style, centered. Larger than the nav button: 16px vertical, 40px horizontal padding. Same accent glow.

**Below button:**

Small muted text: "Available on web, iOS, and Android" — 13px, centered.

---

## Section 7: Footer

### Layout

Full width, surface background color, 1px top border. Padding about 48px vertical. Max-width container matching the nav.

### Content

**Left column:** DropCal logo (smaller than nav), and a single line: "One-click scheduling from anywhere." in muted text, 14px.

**Right columns (2–3):**
- Product: "Features", "Pricing", "Beta"
- Company: "About", "Contact"
- Legal: "Privacy", "Terms"

Text is 13–14px, muted color, hover brightens. No bold headers — just slightly less muted than the links below them, or differentiated by being in uppercase letterspaced style.

**Bottom row:** "© 2026 DropCal" in tiny muted text, left-aligned.

---

## Responsive Behavior

**Desktop (>1024px):** Full layouts as described above. Split sections go side-by-side. Hero animation shows all three columns.

**Tablet (768–1024px):** Split sections stack. Hero animation scales down but keeps the three-column structure, just tighter. Feature cards stack.

**Mobile (<768px):** Everything stacks single-column. Hero animation simplifies — possibly just the center icon with input types cycling above it and output events cycling below it, in a vertical flow rather than horizontal. The phone mockup in the omnipresence section becomes full-width. Nav collapses. Feature detail cards stack (visual above text). Platform chips might stack or shrink.

---

## Animation Summary

| Element | Trigger | Behavior |
|---------|---------|----------|
| Hero input/output cards | On load | Active card cycles every 2s, smooth opacity/position transition |
| Hero center icon pulse | On load | Ring expands and fades, repeating every 2.5s |
| Hero connecting paths | On load | Dots/dashes travel along SVG paths continuously |
| Personalization card | Scroll into view | Fields animate one-by-one, 1.2s apart, strikethrough + replace |
| Feature pills | Scroll into view | Staggered fade-in, 100ms delay between each |
| Floating channel icons | On load / scroll | Subtle float/bob, slight parallax on scroll |
| All hover states | On hover | 200–300ms transitions on opacity, border color, transform |

---

## What This Page Does NOT Have

- No testimonials section (not yet — save for after beta)
- No pricing section (beta is free, pricing comes later)
- No comparison table (the landing page sells the vision, not competitive positioning)
- No feature grid with icons (avoid the generic SaaS look)
- No "How it works" step-by-step (the hero animation IS the "how it works")
- No logos marquee (no social proof yet)
- No video embed (could add later)

---

## Copy Reference (all written content in one place)

**Top bar:** "Join the beta — early access to one-click scheduling." + "Join now ›"

**Hero headline:** "Drop it in. / It's on your calendar."

**Hero subtext:** "Photos, PDFs, emails, voice notes, text — DropCal turns any input into perfectly formatted calendar events. One click."

**Hero CTAs:** "Join the Beta" / "See how it works"

**Hero labels:** "ANY INPUT" / "YOUR CALENDAR"

**Personalization label:** "PERSONALIZATION"

**Personalization headline:** "It already knows / how *you* do things"

**Personalization subtext:** "DropCal reads your existing calendar and learns your conventions. Every event feels like one you made yourself — because the system already knows how you make them."

**Personalization card header:** "New Event Preview" / "Personalizing..." → "✓ Personalized"

**Personalization pills:** "Title conventions" · "Calendar assignments" · "Default durations" · "Location formatting" · "Reminder preferences" · "Color coding"

**Omnipresence chips:** "Google Calendar" · "Apple Calendar" · "Outlook"

**Omnipresence headline:** "Schedule from anywhere, / on any device"

**Omnipresence subtext:** "DropCal lives wherever scheduling information exists. Share a screenshot, forward an email, text a photo, paste a link. Your preferences sync across every surface."

**Omnipresence CTA:** "See how it works"

**Feature row 1 headline:** "Titles that sound like you"

**Feature row 1 subtext:** "DropCal learns whether you say 'Math HW' or 'Math Homework,' whether you capitalize, whether you abbreviate. Every event title reads like one you wrote yourself."

**Feature row 2 headline:** "The right calendar, every time"

**Feature row 2 subtext:** "Classes go to Classes. Work meetings go to Work. Deadlines go to Deadlines. DropCal learns which calendar you use for what — so you never have to pick from a dropdown again."

**Feature row 3 headline:** "Durations that match reality"

**Feature row 3 subtext:** "Your 50-minute lectures, your 25-minute meetings, your all-day deadlines. DropCal learns your actual patterns — not default hour blocks."

**Bottom CTA headline:** "Start dropping"

**Bottom CTA subtext:** "One-click scheduling from photos, PDFs, emails, voice notes, and text. Join the beta and try it free."

**Bottom CTA button:** "Join the Beta"

**Bottom CTA sub-button:** "Available on web, iOS, and Android"

**Footer tagline:** "One-click scheduling from anywhere."

**Footer copyright:** "© 2026 DropCal"