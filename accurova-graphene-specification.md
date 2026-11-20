# Accurova Graphene

## Product specification and Claude Code implementation brief

**Project:** `accurova-graphene`\
**Purpose:** A free, Canva-like, AI-assisted web editor for producing
accurate, professional marketing graphics using real, user-supplied
assets.\
**Initial reference template:** Accurova's BNI Crescendo
portrait-photography promotional banner.\
**Primary principle:** AI may assist with design decisions, but must not
silently redraw, replace, distort or invent supplied brand assets, logos
or authentic photographs.

------------------------------------------------------------------------

# Part I --- Reference poster template

## 1. Template identity

  -----------------------------------------------------------------------
  Property                            Specification
  ----------------------------------- -----------------------------------
  Template name                       Accurova --- BNI Crescendo Portrait
                                      Session

  Format                              Landscape promotional banner

  Reference aspect ratio              Approximately 16:9

  Reference image size                1647 × 922 px

  Primary use                         Promote a pop-up portrait
                                      photography service at a BNI
                                      meeting

  Visual style                        Clean corporate advertising; strong
                                      navy, red and white palette

  Layout                              Asymmetric split composition:
                                      information panel on the left,
                                      photographic scene on the right

  Main message                        Fast and easy three-pose upper-body
                                      portraits

  Offer                               Special package: \$50 for 3 photos

  Audience                            BNI Crescendo members
  -----------------------------------------------------------------------

The dimensions and proportions above describe the supplied reference
artwork. The editor must allow users to change canvas dimensions and
must not hard-code this template to one output size.

## 2. Design intent and asset-integrity rules

The poster is a composite of designed graphic elements and authentic
photography. It should be reconstructed as independent editable layers
rather than regenerated as one flattened AI image.

### Preserve supplied assets exactly

-   Use the supplied Accurova logo file. Do not recreate the logo with
    generated text, substitute a typeface, redraw the camera mark or
    alter its proportions.
-   Use the supplied event/location photograph as the photographic
    background. Preserve the actual room, people, queue, furniture and
    other visible details.
-   Use the supplied studio photograph and retain the studio equipment,
    lights, white backdrop, subject in the brown jacket and DSLR camera
    on its tripod.
-   Use the four supplied portrait photographs as the four example
    images. Use the original photographs, not AI recreations or
    approximations.
-   Preserve each photograph's identity, expression, clothing, pose and
    important details. Cropping and non-destructive scaling are
    permitted; generative alteration is not.
-   Keep original uploaded files intact. All placement, cropping,
    masking and transformations must be non-destructive.
-   Never use an AI-generated replacement when an authentic source asset
    is available, unless the user explicitly asks for that replacement.

### AI-assisted design boundaries

AI may: - Suggest layout variations and visual hierarchy. - Generate
editable copy, headlines, captions and calls to action. - Recommend font
pairings, spacing, colours and icon styles. - Generate a new background
or decorative illustration when requested. - Create a first-draft
composition from a written brief. - Suggest crops and focal points
without modifying the original image. - Detect likely overlaps, low
contrast, clipped text and inconsistent spacing.

AI must not, without explicit user approval: - Retouch or regenerate
people in supplied photographs. - Change faces, clothing, body shape,
expressions or photographic details. - Modify a logo or brand mark. -
Flatten the composition into a single generated image and present it as
an editable design. - Replace source assets with visually similar
generated assets. - change the user's approved wording, prices, dates or
names.

## 3. Visual system

### Colour palette

These are practical starting values sampled/estimated from the visual
design, not a claim that they are the official Accurova brand colour
specifications.

  Role              Suggested colour         Usage
  ----------------- ------------------------ -----------------------------------------------
  Primary navy      `#071D43`                Main headline, footer, dark text
  Promotional red   `#C50918`                Offer panel, ribbons, emphasis
  White             `#FFFFFF`                Main information panel and text on dark fills
  Near-black        `#111827`                Secondary text and icons
  Light grey        `#D9DEE7`                Dividers, subtle borders
  Photo tones       Original image colours   Event and portrait imagery

The application should let the user sample colours from uploaded assets
and save brand palettes.

### Typography

Use a bold, contemporary sans-serif family for the main headline and a
clean sans-serif for supporting information. The reference uses: -
Large, heavy, italic display lettering for promotional emphasis. - Bold
supporting text for the service description. - Smaller, readable labels
for features and session details. - White bold italic lettering on red
promotional ribbons. - White text on a navy footer.

Suggested freely available font options include Inter, Manrope, or
Montserrat. These are editable defaults, not an instruction to imitate
the logo lettering. The logo must remain an image/vector asset.

### Shape language

-   Red slanted/ribbon-like promotional panels.
-   Navy rectangular footer strip.
-   White cards with rounded corners and subtle shadows for portrait
    examples.
-   Thin red accent rule beneath the logo.
-   Simple outline icons with consistent stroke weight.
-   Minimal decorative elements; photography remains the focal point.

## 4. Poster composition map

The layout is a landscape canvas with a left information column and a
right photographic composition. Approximate percentages are starting
guides; all elements must remain independently movable and resizable.

### A. Brand header --- upper left

**Content** - Accurova camera logo. - Wordmark: `ACCUROVA` - Existing
tagline in the supplied logo: `ACCURACY. INNOVATION.`

**Layout** - Position at the upper-left of the canvas. - Keep clear
space around the logo. - Add a short red horizontal accent rule below
it. - Do not typeset a substitute logo if the source logo is available.

### B. Exclusive label --- upper right

**Exact copy** - `Exclusive for` - `BNI Crescendo`

**Layout** - Red ribbon/banner near the upper-right corner. - White,
bold, high-contrast lettering. - Keep the text editable and grouped with
its background shape.

### C. Main headline --- left column

**Exact copy** - `Fast and Easy` - `3 Pose` - `Upper Body Portrait`

**Hierarchy** - "Fast and Easy" sits in a red ribbon with white bold
italic lettering. - "3 Pose" is the largest text element in the
information panel, in bold navy. - "Upper Body Portrait" is a supporting
navy line directly beneath it.

The headline must be editable text, not baked into an image.

### D. Offer panel --- lower left / middle left

**Exact copy** - `Special Package` - `$50` - `for` - `3 Photos`

**Layout** - Large red angled or rounded promotional panel. - `$50` is
the dominant element. - "Special Package" appears above the price. -
"for 3 Photos" appears beside the price, separated by a slim vertical
rule. - Keep all text editable.

### E. Feature row --- below the offer

Four compact feature groups, each with a simple outline icon and
editable label:

1.  Camera icon --- `Authentic Photos`
2.  Lightning icon --- `Quick & Efficient`
3.  Layer/backdrop icon --- `Clean White Backdrop`
4.  Screen/monitor icon --- `Ready for BNI+ & More`

Use thin vertical separators between feature groups. Keep icon and text
alignment consistent.

### F. Photographic scene --- right side / background

The scene communicates the real on-site portrait setup: - The actual
event room and queue. - The portable studio setup at the start of the
queue, so attendees visibly appear to be waiting for their portrait. -
The brown-jacket subject on the white backdrop. - Studio lights and
softbox. - A DSLR camera mounted on a tripod, clearly visible and
pointed towards the subject on the backdrop.

**Important:** The DSLR and tripod are required visual elements. Do not
omit them or replace them with an unrelated camera graphic. Preserve the
original camera and tripod from the source photograph wherever possible.

The photographic scene should be assembled from source photographs as
separate image layers. If the scene requires a composite, use masks and
manual positioning. Do not ask an image model to recreate the room or
people.

### G. Four portrait examples --- lower right

Show exactly four portrait examples in a horizontal row of white
cards: 1. Woman in a dark blazer and teal dress. 2. Woman in a vivid
blue blazer and black dress. 3. Woman in a dark suit holding a laptop.
4. Man in a brown jacket.

Use the four original uploaded portrait photographs. Do not generate
replacement portraits. Keep each portrait as a separate image layer
inside its own card, with non-destructive crop controls.

### H. Session footer --- bottom

**Exact copy** - `Next Session` - `26 Nov (Thurs) at 10:00 AM` -
`After the BNI Meeting`

**Layout** - Wide navy footer strip across the bottom-left portion. -
Calendar icon on the left. - "Next Session" as the label. - Date/time as
the dominant line. - Supporting timing note beneath it. - Ensure the
footer does not obscure the example portraits or important photographic
content.

## 5. Suggested layer tree

The initial project should load with a meaningful, editable layer
structure similar to:

``` text
Accurova BNI Crescendo Banner
├── Background
│   ├── Event room photograph
│   └── Optional tonal overlay
├── Studio composite
│   ├── Studio backdrop
│   ├── Brown-jacket subject
│   ├── Studio softbox / lights
│   └── DSLR on tripod
├── Brand
│   ├── Accurova logo image
│   └── Red accent rule
├── Exclusive ribbon
│   ├── Red ribbon shape
│   ├── Exclusive for text
│   └── BNI Crescendo text
├── Headline
│   ├── Fast and Easy ribbon
│   ├── 3 Pose
│   └── Upper Body Portrait
├── Offer
│   ├── Red offer panel
│   ├── Special Package
│   ├── $50
│   ├── Divider
│   ├── for
│   └── 3 Photos
├── Features
│   ├── Authentic Photos
│   ├── Quick & Efficient
│   ├── Clean White Backdrop
│   └── Ready for BNI+ & More
├── Portrait examples
│   ├── Portrait 01
│   ├── Portrait 02
│   ├── Portrait 03
│   └── Portrait 04
└── Footer
    ├── Calendar icon
    ├── Next Session
    ├── Date and time
    └── After the BNI Meeting
```

This tree is a suggested starting structure. The user must be able to
rename, reorder, group, lock, hide, duplicate and delete layers.

------------------------------------------------------------------------

# Part II --- Accurova Graphene application

## 6. Product vision

Build `accurova-graphene`: a free, responsive, browser-based graphic
design application inspired by Canva, but optimised for fast, precise
composition using authentic assets and AI-assisted design workflows.

It should support: - Marketing banners and promotional posters. - Social
media graphics. - Photography service advertisements. - Event
collateral. - Business cards, flyers and simple brochures. - Reusable
brand templates.

The central workflow is:

1.  Start from a Markdown design brief/template or enter a
    natural-language prompt.
2.  Import logos, photographs, icons, fonts and other assets.
3.  Generate an initial editable composition.
4.  Arrange, crop, scale and layer assets manually.
5.  Use AI to suggest improvements or create selected elements.
6.  Inspect the design at full size.
7.  Export the finished composition.

**Graphene is an editor first and an AI design assistant second.** It
must never require a generative model to make simple layout changes.

## 7. Core UX and interface

Use a familiar editor layout:

``` text
┌──────────────────────────────────────────────────────────────────┐
│ Graphene | Project | Undo | Redo | Zoom | Preview | Export       │
├──────────────┬───────────────────────────────┬───────────────────┤
│              │                               │                   │
│ Asset panel  │                               │ Properties        │
│ Templates    │         Design canvas         │ Position          │
│ Uploads      │                               │ Size              │
│ Text         │       Selection handles       │ Rotation          │
│ Shapes       │       Guides and snapping     │ Typography        │
│ Icons        │                               │ Fill / Stroke     │
│ AI Assistant │                               │ Effects           │
│              │                               │                   │
├──────────────┴───────────────────────────────┴───────────────────┤
│ Layers panel / timeline-like object list                         │
└──────────────────────────────────────────────────────────────────┘
```

### Main interface regions

**Top toolbar** - Project name and save status. - Undo / redo. - Zoom
controls and fit-to-canvas. - Preview mode. - Export. - Optional
collaboration/share controls in a later phase.

**Left sidebar** - Templates. - Uploads / asset library. - Text. -
Shapes. - Icons. - Backgrounds. - Brand kit. - AI design assistant.

**Centre canvas** - Accurate editable canvas. - Drag-and-drop
placement. - Selection outlines and handles. - Alignment guides and
snapping. - Zoom and pan. - Context menu. - Multi-select and grouping.

**Right properties inspector** - X/Y position. - Width and height. -
Rotation. - Opacity. - Crop and image fitting. - Text/font controls. -
Fill, stroke and corner radius. - Layer order. - Lock and visibility. -
Shadow and effects.

**Bottom or docked layers panel** - Full object/layer tree. - Drag to
reorder. - Rename, group, duplicate, hide, lock and delete. -
Multi-select. - Clear indication of selected layer.

The interface must remain usable on a desktop browser first. A
simplified tablet layout is desirable. Mobile editing can be a later
phase.

## 8. Editing features

### 8.1 Canvas and document management

-   Create custom canvas dimensions.
-   Preset sizes for common banner, print and social media formats.
-   Change dimensions after creation.
-   Maintain aspect ratio when resizing objects.
-   Zoom, pan and fit-to-screen.
-   Show rulers, grids, margins and safe areas.
-   Support background colour, gradient and image.
-   Support multiple pages/artboards in a later phase.

### 8.2 Image and asset editing

-   Upload PNG, JPEG, WebP and SVG where safe and supported.
-   Preserve original uploaded files.
-   Drag assets from the library onto the canvas.
-   Resize, rotate, crop, mask and reposition.
-   Fit, fill and contain modes.
-   Opacity and basic non-destructive adjustments.
-   Remove background as an optional AI-assisted operation, with preview
    and approval.
-   Support transparent PNG assets.
-   Replace an image while preserving the existing frame and placement.
-   Store source filename and asset metadata.
-   Display a visible source/AI-generated status for each asset.

### 8.3 Text

-   Add editable text boxes.
-   Quick headline, subheading, paragraph, label and caption presets.
-   Font family, size, weight, italic, colour, alignment and line
    height.
-   Letter spacing and paragraph spacing.
-   Text box resizing and overflow warnings.
-   Curved text can be deferred.
-   Load locally bundled or user-uploaded fonts where licensing permits.

### 8.4 Shapes and graphics

-   Rectangle, rounded rectangle, ellipse, line, arrow and polygon.
-   Fill and stroke.
-   Corner radius.
-   Opacity.
-   Simple gradients.
-   Reusable ribbon and callout shapes.
-   Group shapes with their text.
-   Duplicate and align objects.

### 8.5 Icons

-   Searchable icon library.
-   Consistent stroke/fill style.
-   Recolourable vector icons.
-   Ability to upload custom SVG icons.
-   Common categories: photography, calendar, business, technology,
    social media, location and communication.
-   Icons should be independent editable elements, not generated as part
    of a flattened image.

### 8.6 Layout controls

-   Align left, centre, right, top, middle and bottom.
-   Distribute horizontally and vertically.
-   Equal spacing.
-   Snap to canvas edges, centre lines, margins and other objects.
-   Smart guides.
-   Bring forward / send backward.
-   Lock and hide.
-   Group and ungroup.
-   Duplicate.
-   Keyboard shortcuts for common operations.
-   Undo and redo across all editing actions.

### 8.7 Asset library and brand kit

Allow the user to organise assets into projects and reusable
collections.

Brand kit should include: - Company logos and variants. - Brand
colours. - Typography preferences. - Common icons. - Approved
photography. - Standard disclaimers and recurring copy. - Saved design
components.

A logo should be stored as an image/vector asset, not recreated by AI.

------------------------------------------------------------------------

# Part III --- AI-assisted design workflow

## 9. Markdown as the design brief format

Graphene must support importing a Markdown file as a structured design
brief.

The Markdown document should contain: - Project title and purpose. -
Canvas dimensions or aspect ratio. - Target audience. - Design style and
colour palette. - Exact copy and text hierarchy. - Asset requirements
and references. - Layout instructions. - Asset-integrity constraints. -
Export requirements.

### Markdown import behaviour

1.  Parse Markdown headings, tables, lists, code blocks and image
    references.
2.  Identify text content, design instructions and asset references.
3.  Present a review screen showing the extracted elements.
4.  Ask the user to map missing assets to uploaded files.
5.  Convert the brief into an editable internal project representation.
6.  Create a first-pass layout.
7.  Allow every generated object to be edited independently.

The Markdown file is a human-readable source of truth, not the canvas
rendering format itself.

### Optional prompt-to-design workflow

If no Markdown template exists, provide a prompt field:

> Describe the graphic you want to create. Include its purpose,
> audience, wording, style, dimensions and assets.

AI should return a structured design proposal rather than a flattened
image.

The user should be able to review: - Proposed canvas size. - Proposed
layout. - Text elements. - Required images. - Colours and fonts. -
Missing assets. - Suggested layer structure.

Only after approval should the editor instantiate the design.

## 10. AI assistant capabilities

The AI assistant should work with the actual editable project state.

### Design generation

-   Generate a layout from a prompt or Markdown brief.
-   Create alternative layout proposals.
-   Generate a design from selected uploaded assets.
-   Suggest text placement and image hierarchy.
-   Suggest colour combinations based on the uploaded logo.
-   Generate supporting copy and headlines.
-   Generate simple decorative backgrounds and illustrations.

### Design editing through natural language

Examples:

-   "Move the four portrait examples to the bottom right."
-   "Make the price the most prominent element."
-   "Align the four cards and make their spacing equal."
-   "Use the uploaded logo instead of the text logo."
-   "Keep the original people in the photographs unchanged."
-   "Move the studio backdrop to the beginning of the queue."
-   "Make the DSLR on the tripod visible and point it towards the
    subject."
-   "Remove the paragraph but preserve the headline."
-   "Create three alternative versions using the same assets."

The AI must translate these into edits to the project objects, not
regenerate the whole poster.

### AI quality control

Create a design-QC assistant that checks: - Missing assets. - Incorrect
or missing wording. - Text overflow. - Low contrast. - Misalignment. -
Inconsistent spacing. - Objects outside the canvas. - Overlapping
elements. - Insufficient margins. - Low-resolution images. - Unintended
cropping. - Inconsistent icon styles. - Potential logo distortion or
substitution. - Unapproved AI-generated assets in protected slots.

Return actionable findings with the affected object/layer identified. Do
not silently alter the design.

### Explicit asset protection

Each asset should support an integrity setting:

  -----------------------------------------------------------------------
  Mode                                Behaviour
  ----------------------------------- -----------------------------------
  Protected                           Do not alter source appearance;
                                      allow placement, scaling and
                                      cropping only

  Editable                            Allow normal non-destructive image
                                      adjustments

  AI-editable                         Allow AI transformation only after
                                      user approval

  Generated                           Asset was created by an AI workflow
  -----------------------------------------------------------------------

Default uploaded photographs and logos to **Protected**.

A project-level setting should allow the user to protect all original
assets.

------------------------------------------------------------------------

# Part IV --- Technical implementation

## 11. Suggested architecture

Use a modern, modular TypeScript web application.

### Suggested stack

  -----------------------------------------------------------------------
  Layer                   Suggested technology    Purpose
  ----------------------- ----------------------- -----------------------
  Frontend                React + TypeScript      Main application

  Build tooling           Vite                    Fast development and
                                                  build

  Styling                 Tailwind CSS            Consistent responsive
                                                  interface

  Canvas engine           Konva.js with React     Interactive
                          Konva, or Fabric.js     object-based canvas

  State                   Zustand                 Editor/project state

  UI components           shadcn/ui               Accessible interface
                                                  components

  Icons                   Lucide                  Consistent vector icon
                                                  set

  Markdown                remark / unified        Parse design briefs

  Validation              Zod                     Validate imported
                                                  project structures

  Backend                 Node.js with Fastify or API and AI
                          Express                 orchestration

  Persistence             IndexedDB initially     Local project and asset
                                                  storage

  Optional database       SQLite or PostgreSQL    Future multi-user
                                                  projects

  Image processing        Sharp                   Server-side image
                                                  processing and export

  AI integration          Provider abstraction    Text, layout and
                                                  image-generation
                                                  workflows
  -----------------------------------------------------------------------

Claude Code should inspect current package versions and compatibility
before implementation. Do not assume that every suggested library must
be used if a simpler, better-supported alternative exists.

### Important architecture decision

The editable project model must be independent of the rendering engine.

Store the document as structured JSON. The canvas engine renders that
document and sends user edits back into the project state.

This makes it possible to: - Change canvas libraries later. - Implement
reliable undo/redo. - Save and reopen projects. - Export to multiple
formats. - Generate layouts from AI. - Import and export reusable
templates.

## 12. Internal project data model

Use a versioned JSON representation for projects.

A simplified example:

``` json
{
  "schemaVersion": 1,
  "project": {
    "id": "project-example",
    "name": "Accurova BNI Crescendo Banner",
    "width": 1647,
    "height": 922,
    "background": "#FFFFFF"
  },
  "assets": [
    {
      "id": "asset-logo",
      "name": "Accurova logo",
      "type": "image",
      "source": "assets/accurova-logo.png",
      "integrity": "protected"
    }
  ],
  "elements": [
    {
      "id": "headline-main",
      "type": "text",
      "name": "Main headline",
      "text": "3 Pose",
      "x": 60,
      "y": 245,
      "width": 430,
      "height": 130,
      "fontSize": 110,
      "fontWeight": 800,
      "fill": "#071D43",
      "locked": false,
      "visible": true
    }
  ]
}
```

This is illustrative only. Define and validate the full schema before
implementing persistence.

Each element should have: - Stable ID. - Type. - Name. - Position. -
Dimensions. - Rotation. - Opacity. - Visibility. - Lock state. - Z-order
or ordered parent/child relationship. - Type-specific properties. -
Optional asset reference. - Optional grouping/parent reference.

## 13. Save, undo and versioning

-   Autosave locally.
-   Display save state.
-   Undo and redo.
-   Preserve the original imported Markdown brief.
-   Preserve source assets.
-   Allow project duplication.
-   Provide versioned project JSON.
-   Support exporting a complete project package with its assets and
    Markdown brief.
-   Avoid destructive updates to original source files.

A project package could contain:

``` text
project/
├── project.json
├── brief.md
├── assets/
│   ├── logo.png
│   ├── event-background.jpg
│   ├── portrait-01.jpg
│   ├── portrait-02.jpg
│   ├── portrait-03.jpg
│   └── portrait-04.jpg
└── exports/
```

## 14. Export

Minimum export formats: - PNG. - JPEG. - SVG where the project elements
permit it.

PDF export should be supported for print-oriented work.

Requirements: - Custom resolution. - High-resolution export. -
Transparent background where applicable. - Correct font rendering. - No
editor UI in the exported result. - Preserve image quality. - Warn about
low-resolution source assets. - Preview before export.

## 15. AI service architecture

Do not couple the editor to one AI provider.

Create provider interfaces for: - Text and copy generation. -
Markdown-to-layout interpretation. - Project-aware editing. - Image
generation. - Background removal or image processing. - Design quality
analysis.

Use the OpenAI API as an initial provider where configured, including
image generation through the supported API. Keep model names and API
settings configurable.

### Security

-   Never expose API keys in browser code.
-   Keep API keys in server-side environment variables.
-   Provide `.env.example`.
-   Validate and limit uploads.
-   Restrict file types and file sizes.
-   Sanitize imported SVG and Markdown content.
-   Avoid executing imported HTML or scripts.
-   Do not send user assets to AI providers unless the user has
    requested or enabled that operation.
-   Explain when an operation sends an image or document to an external
    provider.

### Cost control

The editor's normal functions must not require AI calls.

-   Dragging and resizing must be local operations.
-   Text formatting must be local.
-   Layer changes must be local.
-   Markdown parsing should work locally.
-   AI calls should happen only when requested.
-   Cache reusable AI outputs where appropriate.
-   Allow the user to disable AI entirely.

The application should be free to use locally, apart from any optional
third-party API usage, hosting or storage costs. Do not advertise
unlimited free AI generation.

------------------------------------------------------------------------

# Part V --- Implementation roadmap

## 16. Development phases

### Phase 1 --- Functional editor foundation

Priority: build a genuinely useful editor before adding AI.

-   [ ] Create React + TypeScript application.
-   [ ] Implement editor shell and responsive desktop layout.
-   [ ] Create canvas with custom dimensions.
-   [ ] Add image upload and asset library.
-   [ ] Add text and basic shapes.
-   [ ] Implement selection, drag, resize and rotation.
-   [ ] Implement layer panel.
-   [ ] Implement grouping, locking, visibility and z-order.
-   [ ] Add alignment and snapping.
-   [ ] Implement undo/redo.
-   [ ] Implement local project save/load.
-   [ ] Export PNG and JPEG.

**Acceptance test:** Recreate the reference Accurova banner using
uploaded source photographs and logo without generating or modifying
those assets.

### Phase 2 --- Markdown-to-design

-   [ ] Import Markdown files.
-   [ ] Parse design instructions and text hierarchy.
-   [ ] Map image references to uploaded assets.
-   [ ] Generate editable text and shape elements.
-   [ ] Create a first-pass layout.
-   [ ] Allow users to correct the interpretation.
-   [ ] Save Markdown alongside the project.
-   [ ] Export a Markdown brief from an existing design.

**Acceptance test:** Import the Accurova poster specification in Part I
and create an editable project with all major elements represented as
independent layers.

### Phase 3 --- AI design assistant

-   [ ] Add natural-language design prompts.
-   [ ] Add AI-generated layout proposals.
-   [ ] Add project-aware editing commands.
-   [ ] Add text and headline suggestions.
-   [ ] Add palette and typography suggestions.
-   [ ] Add optional image generation.
-   [ ] Add protected asset handling.
-   [ ] Add AI QC checks and actionable findings.

**Acceptance test:** The user can ask Graphene to move, resize, align or
restyle selected objects without the application regenerating the
photographs or logo.

### Phase 4 --- Professional workflow

-   [ ] Brand kit.
-   [ ] Reusable templates.
-   [ ] Component library.
-   [ ] Multiple artboards/pages.
-   [ ] PDF and SVG export.
-   [ ] Project packaging.
-   [ ] Font management.
-   [ ] Better print-resolution controls.
-   [ ] Accessibility and keyboard navigation.
-   [ ] Browser performance optimisation.

### Phase 5 --- Optional future features

-   Team collaboration.
-   Cloud project storage.
-   Shared brand libraries.
-   Template marketplace.
-   Batch generation of size variants.
-   Bulk asset tagging.
-   Automated social media resizing.
-   Template versioning.
-   AI-assisted campaign sets.

Do not let future features delay the first usable editor.

------------------------------------------------------------------------

# Part VI --- Claude Code execution instructions

## 17. Instructions for Claude Code

You are the lead engineer building **Accurova Graphene**, a
browser-based graphic design editor.

Read this entire Markdown file before implementation.

### Your priorities

1.  Build a usable layer-based editor.
2.  Preserve uploaded assets faithfully.
3.  Support Markdown as an editable design brief.
4.  Make routine design operations fast and local.
5.  Add AI assistance as a separate, optional layer.
6.  Make the codebase modular and maintainable.

### Development approach

-   Inspect the repository before making changes.
-   If the repository is empty, initialise the application cleanly.
-   Create a clear architecture and document key decisions.
-   Build in small, testable milestones.
-   Run the application and verify the actual interface.
-   Test the important editing workflows.
-   Do not stop after creating a static mockup of the editor.
-   Do not implement non-functional placeholder buttons.
-   Do not claim a feature works until it has been tested.
-   Keep the development environment easy to run locally.
-   Provide setup instructions and `.env.example`.
-   Keep API keys out of source control.
-   Use sensible defaults and avoid unnecessary infrastructure.

### First milestone

Build a working editor that can: 1. Create a landscape canvas. 2. Upload
and place the Accurova logo. 3. Upload and place the two event/studio
source photographs. 4. Upload and place all four portrait photographs.
5. Add editable text. 6. Add shapes, icons and promotional ribbons. 7.
Move, resize, crop and layer all objects. 8. Show a functional layers
panel. 9. Undo and redo edits. 10. Save and reopen the project locally.
11. Export the composition as a high-resolution PNG.

Use the reference poster in Part I as the initial sample project.

### Second milestone

Implement the Markdown importer. Use the supplied poster specification
to create the first editable design automatically. Show a mapping/review
step for assets rather than guessing which uploaded photograph is which.

### Third milestone

Implement AI-assisted layout generation and natural-language editing. AI
must operate on the structured project model and propose explicit
object-level changes. Require user approval before applying substantial
changes.

### Quality requirements

-   No accidental image stretching.
-   No accidental source-image modification.
-   No missing or hidden camera/tripod in the sample composition.
-   No text clipping.
-   No broken layer ordering.
-   No unresponsive controls.
-   No loss of project data during ordinary editing.
-   No API secrets in frontend code.
-   No mandatory AI dependency for core editing.

### Deliverables

-   Working source code.
-   Local development instructions.
-   `.env.example`.
-   Sample Accurova project.
-   Sample Markdown brief.
-   README.
-   Basic tests for core editing, saving/loading, Markdown parsing and
    export.
-   A concise list of implemented features and known limitations.

**Do not attempt to build every roadmap feature at once. Finish and test
Phase 1 before moving on.**

------------------------------------------------------------------------

# Part VII --- Definition of success

Graphene succeeds when a user can take a real promotional brief, upload
their own photographs and company logo, produce a polished editable
layout, make precise revisions and export the finished graphic without
repeatedly asking an image generator to redraw the entire composition.

The most important distinction is:

**Generate ideas. Compose with real assets. Edit individual layers.
Export with confidence.**

That is the core identity of Accurova Graphene.
