# Onote

Onote is an Obsidian-based personal operating system for turning raw notes into organized knowledge, action, and strategy.

It is designed for people who work across many programs, meetings, people, and decisions, and who need a lightweight way to capture messy notes first and organize them later. Onote lets you write naturally in Obsidian, generate an editable AI action plan, and then create structured derivative notes, tasks, program updates, strategy notes, coaching notes, and dashboards from that reviewed plan.

The core idea is simple:

> Capture raw thoughts quickly. Review the AI’s interpretation. Execute the approved structure into your knowledge system.

Onote is not meant to replace Obsidian. It makes Obsidian more operational by helping transform unstructured notes into durable program context, open actions, risks, decisions, strategy, and leadership memory.

## What It Does

Onote uses the OpenAI API to process the current source note into structured output, with vault-specific context loaded from Markdown files instead of hardcoded prompt rules.

The plugin follows a two-step workflow:

1. Generate an editable action-plan note from the current source note.
2. After review, execute the action plan to create one derivative note per relevant category/topic and update the trackers.

During execution:

- the original source note is moved to the configured archive folder
- the completed action plan is moved to `Action Plans/Completed` by default
- no single root-level final note is created

## Source Notes

Onote uses the term `Source Note` or `Timestamped Note`.

Recommended naming:

```text
YYYY-MM-DD HHmm - Note Title.md
```

Examples:

```text
2026-04-26 1254 - Roadmap Release Process.md
2026-04-26 1254 - PM Ownership Coaching.md
```

## How It Works

### Step 1: Process Current Note With AI

When you run `Process Current Note with AI`, Onote:

- reads the active source note
- registers acronym definitions found in the note into `Acronyms.md`
- loads AI context from the configured AI context folder
- loads `Acronyms.md` as part of the same prompt context
- injects configured programs and categories into the AI prompt
- sends the source note plus context to OpenAI
- creates an editable action-plan note in `Action Plans/`

The action-plan note includes:

- summary
- recommended action items as native Markdown tasks
- delegations
- risks
- decisions
- strategy recommendations
- people / coaching notes
- suggested links
- proposed derivative notes

Each proposed derivative note includes:

- title
- category
- folder
- related programs
- related organizations
- related people
- summary
- tags

The action plan is the review/edit gate. You can change proposed derivative notes before execution.

### Step 2: Execute Current Action Plan

When you run `Execute Current Action Plan` with the reviewed action-plan note open, Onote:

- parses the `Proposed Derivative Notes` section
- creates one derivative note per proposed derivative
- adds frontmatter to each derivative note
- adds backlinks to the source note and action plan
- keeps action items in contextual notes as native Markdown tasks
- carries only unchecked action-plan tasks into derivative notes
- leaves checked action-plan tasks only in the reviewed action plan
- preserves task due-date text when present, for example `📅 2026-05-02`
- updates delegation, strategy, and people/coaching trackers
- ensures `Actions.md` exists as a Tasks-query dashboard instead of a copied task tracker
- ensures category home pages exist and appends links under `Recent Notes`
- ensures program home pages exist and appends links to relevant program notes
- moves the source note to the configured archive folder
- moves the completed action plan to `Action Plans/Completed` by default

If derivative-note parsing fails, the source note is not archived.

## AI Context System

Onote loads Markdown files from the configured AI context folder before each AI call.

Default folder:

```text
System/AI Context
```

If the folder does not exist, Onote creates it and seeds it with default files:

- `Program Glossary.md`
- `Organizational Vocabulary.md`
- `Processing Rules.md`

These files define canonical naming, acronym expansion, category/link guidance, and extraction rules.

Onote also maintains:

```text
Acronyms.md
```

This file is used as vault-level acronym memory and is included in the AI context for the same processing run.

## Embedded Buttons

Onote-generated action plans and derivative notes include embedded command buttons using the Meta Bind plugin format.

Meta Bind is optional, but recommended if you want clickable in-note buttons for:

- `Process Current Note with AI`
- `Execute Current Action Plan`

Without Meta Bind, the notes still work, but the button code blocks render as plain fenced text instead of interactive buttons.

## Open Tasks Dashboard

Onote uses `Actions.md` as a query dashboard, not a copied task tracker.

If the file is missing, Onote creates it automatically with a Tasks query block and does not overwrite it if it already exists.

The dashboard requires the Obsidian Tasks plugin for live task queries. Without the Tasks plugin, the note still exists, but the query block will not render as a live task view.

## Acronym Management

Onote scans the raw note for acronym definitions in the form:

```text
Full Name (ACRONYM)
```

Examples:

- `Object Based Orchestration (OBO)`
- `Program Management Office (PMO)`
- `MEGALODON 2 (MEG2)`

If an acronym is new, it is appended to `Acronyms.md`.

If an acronym already exists with a different expansion, Onote records the conflict under `## Acronym Conflicts` instead of overwriting the existing row.

## Programs And Categories

Programs are configurable in plugin settings and are the authoritative source for program names and acronyms.

Default programs:

- `MEGALODON` (`MEG`)
- `MEGALODON 2` (`MEG2`)
- `Object Based Orchestration` (`OBO`)
- `STARSKIPPER` (`StS`)
- `THRESHER` (`THR`)
- `DRAGONSPELL` (`DS`)

Categories are also configurable in plugin settings.

Default categories:

- Programs
- Leadership
- Strategy
- People
- Meetings
- Reference
- Scratchpad

Each category has:

- name
- folder path
- description

When a new category appears in a derivative-note plan, Onote creates:

- the category folder
- a category home page at `<Category Folder>/<Category Name>.md`

Category home pages include:

- `# Category Name`
- `## Purpose`
- `## Recent Notes`
- `## Related Topics`

## Multi-Category Derivative Notes

Onote does not create one final revised note.

Instead, execution creates one small derivative note per relevant category/topic. A single source note can therefore produce outputs such as:

- `Programs/MEGALODON/2026-04-26 1254 - Roadmap Release Process.md`
- `Leadership/2026-04-26 1254 - PM Ownership Coaching.md`
- `Strategy/2026-04-26 1254 - Productization vs Coordination.md`

Program derivative notes use program folders:

```text
Programs/<Program Name>/
Programs/<Program Name>/<Program Name>.md
```

If multiple programs are related, Onote places the derivative note in the strongest program folder and backlinks it from other related program home pages.

## Link Handling

Suggested links are filtered and normalized before they are written back into notes or derivative-note plans.

Onote prefers durable entity and concept notes such as:

- programs
- organizations
- people
- teams
- processes
- concepts
- strategic themes

Onote excludes:

- timestamped source notes
- action-plan notes
- tracker files
- AI context files
- temporary processing artifacts
- `Acronyms.md`
- links whose title starts with `#`

Plain durable names are normalized to Obsidian wiki links where possible.

## Key Features

- Two-step workflow with review before execution
- Multi-category derivative-note execution instead of a single final note
- Native Obsidian Markdown tasks instead of duplicated task-tracker copies
- Vault-specific AI context loaded from Markdown files
- Acronym discovery and persistent acronym memory
- Configurable programs and categories
- Related programs, organizations, and people inside derivative-note plans
- Durable suggested-link filtering
- Category and program home page generation
- Tracker-file updates for action items, delegations, strategy, and coaching notes
- Conservative extraction rules for decisions and uncertainty
- Obsidian notices for progress and failure states

## Settings

Onote supports these settings:

- OpenAI API key
- model name
- action item tracker path
  This is used as the `Open Tasks` dashboard path rather than a copied task tracker.
- delegation tracker path
- strategy tracker path
- people / coaching tracker path
- acronym list path
- archive completed action plans toggle
- archive folder path
- programs
- categories
- AI Context Folder Path

## Development

Install and build:

```bash
npm install
npm run build
```

Run the watcher:

```bash
npm run dev
```

## Local Testing

Run the automated smoke suite from the repo root:

```bash
npm run test
```

This covers the main plugin flow against the in-memory test harness in `scripts/smoke-test.js`, including:

- first-pass source note ID creation
- action-plan regeneration without duplicate plans
- derivative note execution
- program dashboard refresh
- debug reset behavior

Sample raw-note input used by the smoke test lives at:

```text
test-data/sample-source-note.md
```

To test against a real Obsidian vault, this repo includes a sample vault at:

```text
onote-test/
```

For a local vault test, copy the built plugin into:

```text
onote-test/.obsidian/plugins/onote/
```

Required files:

- `main.js`
- `manifest.json`
- `versions.json`

Repo-local copy command:

```bash
cp main.js manifest.json versions.json onote-test/.obsidian/plugins/onote/
```

Then in Obsidian:

1. Open `onote-test`.
2. Go to `Settings -> Community plugins`.
3. Disable `Restricted mode` if needed.
4. Enable `Onote`.
5. Configure your API key and model.

Suggested manual test flow inside `onote-test`:

1. Create or paste a raw note using `test-data/sample-source-note.md` as starter content.
2. Run `Process Current Note with AI`.
3. Review the generated action plan in `Action Plans/`.
4. Run `Execute Current Action Plan`.
5. Verify derivative notes, `Actions.md`, and any affected program dashboard.
6. If you want to reset the generated state, run `Reset Onote Debug State`.

## Example Use Cases

- Turn one source note into separate program, leadership, and strategy notes
- Capture delegation items without over-classifying mentions of people
- Track strategy themes and coaching notes across source notes
- Maintain consistent acronym usage and canonical program names across the vault
- Automatically create category and program home pages as the vault grows
