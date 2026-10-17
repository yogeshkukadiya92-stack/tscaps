---
version: alpha
name: ReelStudio
colors:
  primary: '#2f4dc7'
  background: '#f5f7fc'
  surface: '#ffffff'
  text: '#172239'
  muted: '#53637d'
  darkBackground: '#0d121d'
typography:
  sans:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
  display:
    fontFamily: 'Manrope Variable, system-ui, sans-serif'
  mono:
    fontFamily: 'JetBrains Mono Variable, monospace'
rounded:
  DEFAULT: '8px'
  card: '12px'
spacing:
  page: '32px'
  section: '24px'
---

# ReelStudio design

## Overview
A creator's editing desk: a cool slate canvas, white work surfaces and a cobalt caption frame as the signature. Product screens prioritize completing a reel over promotional messaging. Audience: short-video creators, including the Gujarati-speaking owner. UI labels remain English; the existing bilingual beginner guide remains available.

Canonical runtime values live in apps/studio/src/styles/tokens.css; Tailwind consumes those RGB variables. This document mirrors that source. No parallel theme system. Existing docs/DESIGN_IDENTITY.md references in code point to an absent file; this is the maintained replacement.

## Colors
Light surfaces separate the canvas from controls. Dark mode uses navy depths with the existing brighter accent and light text. Danger retains its existing semantic red. Focus uses the accent outline, never color alone.

## Typography
Inter for controls and paragraphs; Manrope for project/admin headings; JetBrains Mono for time and code. Subtitle fonts are user content and are not changed by UI typography.

## Layout
Projects: compact starting action above the library, persistent workspace rail on desktop. Editor: task tabs with short explanations, labeled caption tools across the top of the settings panel. Admin: summary, search, bounded table, selected-account settings with direct section links. Preserve document scrolling for forms and internal scrolling for editing panels. Mobile collapses rails and explanatory tab subtitles, not features.

## Elevation & Depth
Soft existing theme shadows on cards and selected controls. No decorative gradients on work surfaces. The cobalt caption frame provides the visual accent.

## Shapes
Shared action buttons use 8px corners; content panels 12–14px. Avoid pill shapes except existing status badges.

## Components
Reuse buttons.ts, Radix AppDialog, shared Select and Toast. Native selects remain acceptable for project sorting and admin filter/access choices; platform popup geometry is intentional. Global scrollbar baseline lives in globals.css. ProjectsWorkspace.css, EditorWorkspace.css and AdminPanel.css own only their screen layout.

## Do's and Don'ts
Use clear verbs, named sections, visible focus and restrained motion. Never change caption styling, paid entitlements, permission checks or export behavior for aesthetics. Preserve the distinction between saving a project and exporting a video.
