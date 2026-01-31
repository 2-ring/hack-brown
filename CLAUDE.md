# DropCal

**Drop anything in. Get calendar events out.**

## The Problem

Manually entering calendar events from emails, texts, flyers, and screenshots is tedious and time-consuming. The friction between "things to schedule" and "actually scheduled" kills productivity.

## The Solution

DropCal is a universal input funnel for calendar events. Paste text, upload an image, forward an email—get perfectly formatted events ready for your calendar. No manual entry, no reformatting.

## What It Does

**Handles messy inputs.** Takes unstructured text with abbreviations, typos, and informal language. Extracts event information exactly as written.

**Cleans and standardizes.** Fixes spelling, expands acronyms (mtg → Meeting), converts relative dates (tmrw → actual date), formats times consistently (2pm → 14:00).

**Detects conflicts.** Checks new events against existing calendar to flag overlaps.

**Outputs clean calendar events.** Formats everything for Google Calendar API. Ready to add with one click.

## How It Works

Multi-agent AI pipeline where each stage has one job. Extract raw event data from text. Normalize and standardize the information. Check for scheduling conflicts. Format for calendar APIs. Standard interfaces between each step.

Built with LangChain for orchestration, Claude Sonnet 4 for intelligent parsing with structured outputs, Google Calendar API for integration.

## Why It Matters

Current calendar tools require semi-structured input or manual entry. DropCal handles truly messy, real-world text—the way people actually communicate about events. Built by someone who juggles multiple calendars, course schedules, and event flyers and needed a system that just works.

---

**Built for Hack@Brown 2026 | Marshall Wace Track**