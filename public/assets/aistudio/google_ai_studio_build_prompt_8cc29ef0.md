# Prompt for Google AI Studio: Full Application Engineering

Using the attached Stitch UI design system, visual hierarchy, color palette, and layout structure, build a complete, interactive, single-page React + TypeScript + Tailwind CSS web application for **"ARES-EVA: Marswalk Mission Planner"**.

### Core Functional Requirements:

1. **Interactive Multi-Layered Mars Map (HTML5 Canvas / SVG Tactical Map Engine):**
   - Implement a rich, interactive pan-and-zoom map centered on **Mount Sharp / Gale Crater** (with a site switcher in the top bar that also supports **Jezero Crater Delta** and **Valles Marineris** with smooth animated fly-in transitions and unique terrain/targets for each site).
   - Render distinct, toggleable data layers with adjustable opacity:
     - **Optical Terrain & Hillshade:** Realistic Martian rust/ochre/basalt terrain shading with crater rims and sedimentary strata.
     - **Elevation Contours (MOLA/HiRISE DTM):** Crisp topographic isolines with elevation labels (`-4400m` to `-4150m`).
     - **Slope & Hazard Overlay:** Translucent amber (`15°–22°`) and red (`>22°`) hazard zones plus hatched aeolian sand traps (e.g., *Greenheugh Sand Apron*, *Bagnold Dunes*).
     - **CRISM Mineralogy Spectral Overlay:** Glowing cyan/violet regions representing *Hematite*, *Smectite Clays*, and *Hydrated Sulfates*.
     - **THEMIS Thermal Inertia:** Heatmap layer distinguishing high-thermal-inertia exposed bedrock (safe for walking) from low-thermal-inertia loose dust.
     - **Robotic Scout Support:** Live animated marker for the **Curiosity-II Scout Rover** positioned ahead of the route, displaying sensor telemetry and panoramic rover image previews when clicked.

2. **Dynamic Route Planning, Waypoint Editing & Hazard Detection:**
   - Preload the **Mount Sharp Demo Scenario** with 4 waypoints (`Base Camp`, `Vera Rubin Ridge`, `Glen Torridon`, `Greenheugh Pediment`) where the initial route intentionally crosses a steep 26° sand hazard so the user immediately sees the safety warning system in action.
   - Allow users to **click the map to add waypoints**, **drag existing waypoints**, or **delete waypoints**.
   - Automatically recalculate in real time:
     - Total distance (`km`), estimated astronaut traversal time (accounting for slope penalties), suit oxygen/battery consumption, and overall **Route Safety Status** (`NOMINAL`, `CAUTION`, or `CRITICAL HAZARD`).
     - **Intersection detection:** Whenever any route segment passes through a hazard zone or steep slope, highlight that segment in pulsing red on the map and list the specific hazard in the Right Panel.
   - Update the docked **Elevation & Slope Profile SVG Chart** dynamically as waypoints move, highlighting steep gradient spikes in red.
   - Include a one-click **"Compare & Apply Safe Route"** feature that visualizes both the *Direct/High-Science Route* and an *AI-Optimized Safe Bedrock Route* on the map and lets the user switch between them.

3. **Scientific Targets & Field Observation Logging:**
   - Clicking any scientific POI on the map or in the `SCIENCE TARGETS` tab displays its NASA dataset provenance (e.g., *CRISM FRT0000B6F1*, *HiRISE ESP_036128_1755*), geological significance, investigation tasks, and a simulated **Mastcam-Z / Orbital Close-Up Inspection View**.
   - Provide an interactive **"Log Observation / Discovery"** tool allowing the user to click anywhere on the map to drop a custom sample marker with title, sample type (Core, Regolith, Spectral Scan, Photo), and field notes.

4. **AI Mission Assistant (with Provenance Separation):**
   - Build an interactive AI Copilot panel in the right sidebar that dynamically analyzes the *currently selected site, active data layers, waypoints, and detected route hazards*.
   - Include quick-prompt buttons (`"Why is this location scientifically interesting?"`, `"What hazards are along my route?"`, `"Suggest a safer route for top science targets"`, `"Explain the CRISM mineral signature"`).
   - Format every AI response with explicit visual badges separating **`[NASA/JPL DATASET]`** facts from **`[AI MISSION SYNTHESIS]`** recommendations, plus actionable `[Apply Suggested Reroute]` buttons inside the chat when relevant.

5. **Immersive "Marswalk Mode" (Astronaut Field HUD):**
   - Clicking `MARSWALK HUD` in the top bar smoothly transforms the UI from the dense mission-control planner into an astronaut suit/visor field interface:
     - Hides planning sidebars and expands the map into a centered, forward-looking tactical navigation view.
     - Includes a simulation playback control (`Play / Pause EVA Traverse` + speed toggle `1x / 5x`) that moves the astronaut icon along the planned waypoints in real time.
     - Displays a top compass heading tape, large distance-to-next-waypoint readout, real-time terrain slope & thermal readout under the astronaut's boots, proximity hazard alerts when approaching caution zones, distance to the companion rover, and a prominent **`+ LOG FIELD DISCOVERY`** modal button.

6. **Post-EVA Mission Report Modal:**
   - Clicking `MISSION REPORT` (or completing the Marswalk simulation) opens a polished, printable/exportable NASA Mission Debrief modal summarizing total distance covered, elevation gained, targets investigated, hazards avoided, logged astronaut discoveries, and a scientific value score.

### Technical & Quality Guidelines:
- Make the prototype completely self-contained with zero broken external dependencies or missing API keys (use rich local NASA Gale Crater / Jezero Crater datasets structured identically to NASA PDS/Mars Trek schemas, with clean service abstractions ready for live NASA API endpoints).
- Ensure smooth 60fps map panning/zooming, crisp typography, responsive layout, and zero placeholder buttons—every toggle, slider, waypoint, simulation control, and AI query must work end-to-end.