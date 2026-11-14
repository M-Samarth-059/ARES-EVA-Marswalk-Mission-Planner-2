---
name: ARES Tactical Surface Operations
colors:
  surface: '#0e131d'
  surface-dim: '#0e131d'
  surface-bright: '#343944'
  surface-container-lowest: '#090e18'
  surface-container-low: '#171c26'
  surface-container: '#1b202a'
  surface-container-high: '#252a35'
  surface-container-highest: '#303540'
  on-surface: '#dee2f1'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dee2f1'
  inverse-on-surface: '#2b303b'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#7bd0ff'
  on-secondary: '#00354a'
  secondary-container: '#00a6e0'
  on-secondary-container: '#00374d'
  tertiary: '#ddb7ff'
  on-tertiary: '#490080'
  tertiary-container: '#c487ff'
  on-tertiary-container: '#550093'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#f0dbff'
  tertiary-fixed-dim: '#ddb7ff'
  on-tertiary-fixed: '#2c0051'
  on-tertiary-fixed-variant: '#6900b3'
  background: '#0e131d'
  on-background: '#dee2f1'
  surface-variant: '#303540'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
  telemetry-lg:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.02em
  telemetry-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1rem
  margin: 0.75rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The visual narrative is engineered directly from NASA and JPL mission control architectures for planetary exploration. Built for critical operations, time-sensitive EVAs, and high-density telemetry streaming, the UI prioritizes instantaneous legibility, cognitive stamina, zero ambiguity, and zero ornamentation. 

The aesthetic is utilitarian brutalism mixed with aerospace instrument precision:
- Dark, light-absorbing obsidian foundations reduce ocular fatigue in low-light tactical environments.
- Monospaced numerical readouts provide strict columnar data alignment to prevent parallax misreads.
- Crisp, low-reflectance hairline borders compartmentalize high-frequency telemetry feeds.
- Information density is balanced by a strict hierarchical layout: mission status at a glance, granular instrumentation on demand.

## Colors

The palette is rooted in mission-critical status monitoring, tactical surface rendering, and spectrometer telemetry:

- **Primary Nominal Emerald (`#10B981`)**: Denotes optimal telemetry, sealed pressure environments, positive link status, and confirmed safe operational windows.
- **Secondary Telemetry Cyan (`#38BDF8`)**: Reserved for orbital relay feeds, navigation vectors, topological contours, and CRISM mineralogical data points.
- **Spectral Violet (`#A855F7`)**: Dedicated to scientific analysis, ultraviolet/multispectral signatures, sample provenance, and automated AI analysis models.
- **Cautionary Amber (`#F59E0B`)**: Marginal telemetry, threshold warnings, thermal drift, and terrain slope limits.
- **Critical Red (`#EF4444`)**: Life support hazards, loss of telemetry (LOS), radiation exposure alarms, and emergency override states.
- **Base Surfaces & Framing**: 
  - Deep Base: `#0B0E14`
  - Elevated Container / Instrument Cell: `#121721`
  - High Tonal Surface: `#1A2230`
  - Structural Hairline Borders: `#232B3A` and `#1E293B`

## Typography

The dual-type strategy guarantees clarity between interface command hierarchy and continuous dynamic data:

- **Inter**: Deployed exclusively for structural headings, container tags, telemetry category markers, and control triggers. Always rendered with tight kerning or precise uppercase tracking to evoke avionics panels.
- **JetBrains Mono**: Used for all streaming coordinates, sensor outputs, MET (Mission Elapsed Time), life support telemetry, and console logs. Tabular figures and fixed-pitch metrics preserve vertical scanlines during rapid data churn.

## Layout & Spacing

The layout is a dense, responsive grid system calibrated for multi-monitor workstations and rugged tactical touch slates:

- **Grid Model**: A multi-panel docked layout consisting of persistent telemetry sidebars, an expansive tactical canvas (maps, 3D point-clouds, elevation profiles), and modular bottom trays for streaming system health logs.
- **Spacing Principle**: Tightly compact. Component internal padding utilizes `space-sm` (8px) and `space-md` (12px) to maximize screen real estate for instrument panels.
- **Reflow Adaptations**:
  - **Desktop (>=1440px)**: 3-column split console. Left: EVA telemetry and subsystem vitals. Center: Orthomosaic tactical map and elevation profile. Right: Spectrometry, AI copilot diagnostics, and comms link budget.
  - **Tablet (768px - 1439px)**: Dual-pane interface with collapsible telemetry sidebars and a bottom drawer for sensor output.
  - **Mobile (<768px)**: Stacked single-column tactical telemetry stream with a floating segmented switcher for rapid panel swapping.

## Elevation & Depth

Tactical interfaces discard decorative drop shadows and heavy light blooms to maintain crisp edge acuity and eliminate display artifacts:

- **Surface Tiers**: Depth is conveyed through subtle tonal stepping:
  - Level 0 (Base Canvas): `#0B0E14`
  - Level 1 (Modular Instrument Containers): `#121721` with a `1px` border of `#1E293B`
  - Level 2 (Active Toolbars, Floating Overlays, Modals): `#1A2230` with a `1px` border of `#232B3A`
- **Ghost Borders & Inset Highlights**: Panels utilize a `1px` solid outline. Focused or active instrument panels swap their top or left border to `#10B981` or `#38BDF8` to indicate active telemetry lock without altering container bounds.
- **Shadows**: Near-zero diffusion. Critical modals and floating telemetry tools use an ambient occlusion shadow: `0 4px 16px rgba(0, 0, 0, 0.65)`.

## Shapes

The design system employs a soft-industrial radius (`roundedness: 1`), utilizing `0.25rem` (4px) corner radii across containers, buttons, and telemetry badges. 

- Sharp outer borders maintain the mechanical structural integrity of instrumentation consoles.
- Inner elements (pills, chips, input fields, and graph wrappers) use 4px corner rounding to prevent harsh pixel aliasing against high-resolution geospatial displays while avoiding playful or consumer-oriented curved aesthetics.
- Tactical map overlays and crosshairs maintain 0px sharp geometry.

## Components

### Buttons & Operational Switches
- **Primary Control**: Background `#10B981`, text `#0B0E14`, font `Inter` bold 12px uppercase. `4px` border radius. Pressed state shifts to dark emerald with an inset highlight.
- **Secondary Telemetry Action**: Background `#1A2230`, border `1px solid #232B3A`, text `#E2E8F0`. Hover triggers a `#38BDF8` border focus.
- **Hazard Overrides**: Border `1px solid #EF4444`, background `rgba(239, 68, 68, 0.1)`, text `#EF4444`. Pulsing state for unacknowledged alarms.

### Telemetry Badges & Chips
- Monospace status chips displaying live parameters (e.g., `O2: 98.4 kPa [NOM]`).
- Left-aligned 6px status dot matching semantic safety colors (`#10B981`, `#F59E0B`, `#EF4444`).
- Background: `rgba(255, 255, 255, 0.03)` with a `1px solid #1E293B` border.

### Tactical Map Controls & Layer Toggles
- Compact overlay stacks featuring layer toggles (CRISM NIR, Elevation Contours, Rover Path, Hazard Slope).
- Includes fine-stepped opacity sliders (`0% - 100%`) with integrated numerical readout fields.
- Scale bars rendered with high-contrast alternating white and black telemetry markers.

### Telemetry Tickers & Data Lists
- Alternating dark zebra striping (`#121721` / `#0F141D`).
- Strictly aligned tabular columns: `TIMESTAMP (UTC)`, `SUBSYSTEM`, `METRIC`, `VALUE`, `STATUS`.
- Fixed line-height with truncation markers and inline sparklines.

### AI Copilot Provenance Cards
- Surface background `#121721` with a `2px` left border in `#A855F7`.
- Header displays algorithm confidence (e.g., `AUTONOMOUS PATH: 94.2% OPTIMAL`) and geological sample classification tags.
- Actionable decision buttons: `ACCEPT ROUTE`, `OVERRIDE MANUAL`, `SIMULATE TRAVERSAL`.

### Input Fields & Segmented Mode Switchers
- **Inputs**: Dark inset background (`#0B0E14`), monospace text, `1px solid #232B3A` border. Active state shifts border to `#38BDF8`.
- **Mode Switchers**: Enclosed segment bar with tabs for operational modes (`SURFACE EVA`, `HABITAT MONITOR`, `ORBITAL RELAY`). The active segment is highlighted with `#1A2230` and a `1px` border of `#10B981`.