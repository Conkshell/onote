# Onote Requirements

## Overview

Onote is an Obsidian community plugin that processes a timestamped source note with AI, generates a reviewable action plan, and then executes that plan into multiple durable derivative notes and tracker updates.

The system is designed to:

- preserve the source note until execution succeeds
- use an explicit review/edit gate before final note creation
- create multiple output notes when a source note spans multiple categories or topics
- use vault-local context and acronym memory instead of relying only on hardcoded prompt text

## Core Workflow

### Source Notes

The plugin must use `Source Note` or `Timestamped Note` terminology.

The recommended default source note naming pattern is:

```text
YYYY-MM-DD HHmm - Note Title.md
```

Examples:

- `2026-04-26 1254 - Roadmap Release Process.md`
- `2026-04-26 1254 - PM Ownership Coaching.md`

The plugin must avoid “Daily Note” terminology in:

- code
- prompts
- README
- generated notes

### Step 1: Process Current Note With AI

The plugin must provide an Obsidian command:

- `Process Current Note with AI`

When triggered, it must:

1. Read the currently active Markdown note.
2. Treat it as the source note.
3. Register new acronym definitions found in the note.
4. Load AI context from configured vault files.
5. Send the source note plus loaded context to the OpenAI API.
6. Generate an editable action-plan note.
7. Never overwrite the source note during processing.

### Step 2: Execute Current Action Plan

The plugin must provide an Obsidian command:

- `Execute Current Action Plan`

When triggered on an action-plan note, it must:

1. Parse the action-plan note.
2. Validate the `Proposed Derivative Notes` section.
3. Create all derivative notes described in that section.
4. Update trackers.
5. Update category and program home pages.
6. Archive the source note after successful execution.
7. Move the completed action plan to `Action Plans/Completed` by default, unless configured to archive action plans too.
8. Avoid deleting or archiving the source note if derivative-note parsing fails.

## Action Plan Model

The action plan is the review/edit gate between raw capture and final outputs.

The generated action-plan note must include:

- summary
- recommended action items rendered as native Obsidian Markdown tasks
- delegations
- risks
- decisions
- strategy recommendations
- people / coaching notes
- suggested links
- proposed derivative notes

The action-plan note must include a section:

```text
## Proposed Derivative Notes
```

Each proposed derivative note must include:

- Title
- Category
- Folder
- Related Programs
- Related Organizations
- Related People
- Summary
- Tags

The user must be able to edit this section before execution.

Execution must parse this section and use it as the source of truth for derivative-note creation.

## Derivative Note Model

The system must not create one final revised note.

Instead, execution must create one small derivative note per relevant category/topic.

A single source note may create multiple derivative notes, such as:

- `Programs/MEGALODON/2026-04-26 1254 - Roadmap Release Process.md`
- `Leadership/2026-04-26 1254 - PM Ownership Coaching.md`
- `Strategy/2026-04-26 1254 - Productization vs Coordination.md`

Each derivative note must summarize only the portion of the source note relevant to that category/topic.

Each derivative note must include YAML frontmatter with:

- `onote_type: derivative_note`
- `category`
- `source_note_path`
- `action_plan_path`
- `created_at`
- `programs`
- `organizations`
- `people`
- `tags`

Each derivative note must include backlinks to:

- the source note
- the action plan

No root-level derivative notes should be created.

## Programs

Programs must be configurable in plugin settings.

Program configuration must be stored as structured plugin data:

```json
programs: [
  { "name": "MEGALODON", "acronyms": ["MEG"] },
  { "name": "MEGALODON 2", "acronyms": ["MEG2"] },
  { "name": "Object Based Orchestration", "acronyms": ["OBO"] },
  { "name": "STARSKIPPER", "acronyms": ["StS"] },
  { "name": "THRESHER", "acronyms": ["THR"] },
  { "name": "DRAGONSPELL", "acronyms": ["DS"] }
]
```

Program configuration is authoritative for program names and program acronyms.

The plugin must:

- inject configured programs into the AI prompt
- use configured programs for related-program detection
- use configured programs for derivative-note routing
- preserve `Acronyms.md` support, but treat program config as authoritative for program naming

### Program Folder Behavior

For program derivative notes, the plugin must create:

```text
Programs/<Program Name>/
Programs/<Program Name>/<Program Name>.md
```

The plugin must append links to relevant derivative notes on the program home page.

If multiple programs are related:

- the derivative note should be created in the strongest related program folder
- the derivative note should be backlinked from other related program home pages

## Categories

Categories must be configurable in plugin settings.

Default categories:

- Programs
- Leadership
- Strategy
- People
- Meetings
- Reference
- Scratchpad

Each category must have:

- `name`
- `folderPath`
- `description`

When a new category appears in an action plan or AI output, the plugin must:

1. Create the folder if missing.
2. Create a category home page if missing.

The category home page path must be:

```text
<Category Folder>/<Category Name>.md
```

The category home page must include:

- `# Category Name`
- `## Purpose`
- `## Recent Notes`
- `## Related Topics`

When derivative notes are created, the plugin must ensure the category home page exists and append a link under `Recent Notes` without duplicating links.

## Archiving

The plugin must not use an `Action Plans/Archived` folder.

For source-note archiving:

1. Move the source note to the configured archive folder after derivative creation and tracker updates succeed.
2. Write final archive paths into derivative-note and completed-action-plan metadata so backlinks remain resolvable.

Required setting:

- `Archive Folder Path`
- default: `Archive`

After successful execution:

- move the original source note to the configured archive folder
- move the completed action plan to `Action Plans/Completed`

If the user setting indicates action plans should also be archived, archive them instead of moving them to `Action Plans/Completed`.

If moving/archiving fails, the plugin must not silently delete source material.

## Trackers

Execution must update these trackers:

- `Actions.md` as a query dashboard, not a copied task tracker
- `Action Plans/Delegations.md`
- `Strategy/Strategy Themes.md`
- `People/People - Coaching.md`

Tracker updates must append new entries rather than overwrite existing content, except `Actions.md`, which must remain a dashboard note.

Action items must:

- live as native Markdown tasks in contextual notes
- render as native tasks in action-plan notes
- render as native tasks in derivative notes when relevant
- not be duplicated into a tracker file
- preserve due-date text if present
- remain only in the reviewed action plan when checked
- be included in derivative notes only when unchecked at execution time

## AI Context

The plugin must support a configurable AI context folder.

Required setting:

- `AI Context Folder Path`
- default: `System/AI Context`

Before sending a note to OpenAI, the plugin must:

1. Load all Markdown files from the configured AI context folder.
2. Sort them deterministically by path/name.
3. Concatenate their contents into an `AI Context` block in the prompt.

If the folder does not exist, the plugin must:

1. Create it.
2. Seed it with default context files.

If context files cannot be loaded, processing must continue with a Notice rather than fail hard.

### Default AI Context Files

The plugin must seed default files including:

- `Program Glossary.md`
- `Organizational Vocabulary.md`
- `Processing Rules.md`

The processing rules must cover:

- canonical program naming
- durable suggested-link guidance
- category and classification rules
- acronym preservation
- decision strictness
- uncertainty preservation
- risk extraction guidance

## Acronym Management

The plugin must support a configurable acronym list path.

Required setting:

- `Acronym List Path`
- default: `Acronyms.md`

The plugin must:

1. Scan source-note text for acronym definitions in the form `Full Name (ACRONYM)`.
2. Create `Acronyms.md` automatically if missing.
3. Append new acronyms using a Markdown table.
4. Avoid duplicating acronyms already present.
5. Record conflicts when the same acronym is seen with a different full name.
6. Register acronyms before calling OpenAI so the same processing run benefits from them.
7. Include `Acronyms.md` content in the AI context block.

The Acronyms file format must be:

```md
# Acronyms

| Acronym | Full Name | First Seen | Source |
|---|---|---|---|
| OBO | Object Based Orchestration | 2026-04-26 | [[Source Note]] |
```

Conflict format:

```md
## Acronym Conflicts

- 2026-04-26: OBO was also seen as "..." in [[Source Note]]
```

## Prompt and Schema Requirements

The prompt must tell the model:

- AI Context files are authoritative for classification rules
- `Acronyms.md` is authoritative for acronym expansion unless there is a conflict
- configured programs are authoritative for program names and acronyms
- in derivative-note summaries, spell out each acronym on first use followed by the acronym in parentheses
- after first use, use the acronym
- preserve known acronyms exactly
- do not split acronyms into words
- `PIPE` must remain `PIPE` and not become `pipeline`

The AI output schema must include:

- `summary`
- `action_items`
- `delegations`
- `risks`
- `decisions`
- `strategy_recommendations`
- `people_coaching_notes`
- `suggested_links`
- `derivative_notes`

Each `derivative_note` object must include:

- `title`
- `category`
- `folder`
- `related_programs`
- `related_organizations`
- `related_people`
- `summary_markdown`
- `tags`

## Classification Rules

The extraction rules must be strict.

### Action Items

Action items are specific things the user should do, ask, review, prepare, clarify, remember, or investigate.

### Delegations

Delegations are only items explicitly assigned by the user to another person.

The plugin must not infer delegation merely because a person is mentioned.

### Decisions

Decisions must only include explicit choices already made.

The plugin must not convert:

- action items
- actions
- coaching topics
- questions
- intentions
- ideas
- tentative thoughts

into decisions.

### Strategy Recommendations

These are higher-level implications, organizational design ideas, program direction, recurring patterns, or possible future operating model changes.

### People / Coaching Notes

These must only be created when the note refers to a specific person’s:

- performance
- behavior
- development
- role fit
- coaching need

### Risks

The prompt must explicitly guide the model to consider risks when the note contains:

- uncertain dependencies
- missing dates
- incomplete plans
- unresolved ownership issues

Example:

- `staffing plan coming but no real dates` should usually result in a risk

### Uncertainty

The plugin must preserve uncertainty.

Words and phrases like:

- maybe
- probably
- might
- need to think
- not sure
- still thinking

must not be turned into firm decisions or conclusions.

## Suggested Links

Suggested links must:

- prefer durable entity and concept notes
- be valid Obsidian wiki links when written back into notes
- preserve already-valid wiki links
- normalize plain durable names to wiki links where appropriate

Suggested links must exclude:

- timestamped source notes
- action-plan notes
- tracker files
- AI context files
- any note under `System/AI Context`
- `Acronyms.md`
- temporary processing artifacts
- titles beginning with `#`

Suggested links should prefer:

- programs
- organizations
- people
- teams
- processes
- concepts
- roles
- strategic themes

## Embedded Buttons

Onote-generated action plans and derivative notes must include embedded command buttons using the Meta Bind button format.

Preferred format:

```meta-bind-button
label: Button Label
style: primary
action:
  type: command
  command: plugin-id:command-id
```

Expected buttons:

- action-plan note: `Execute Current Action Plan`
- derivative note: `Process Current Note with AI`

Meta Bind is optional, but the generated format should be valid when Meta Bind is installed.

## Settings

The plugin must expose settings for:

- OpenAI API key
- model name
- action item tracker path
- delegation tracker path
- strategy tracker path
- people / coaching tracker path
- acronym list path
- AI Context Folder Path
- Archive Folder Path
- archive completed action plans toggle
- programs
- categories

Settings must preserve existing plugin data when new settings are introduced by merging saved settings with defaults.

## Notices And Error Handling

The plugin must use Obsidian Notices to show:

- progress
- successful creation/execution states
- recoverable failures
- validation problems

The plugin should avoid destructive behavior when:

- derivative-note parsing fails
- archive/move operations fail
- AI context files cannot be fully loaded

## README Requirements

The project README must explain:

- source notes are timestamped notes, not daily notes
- action plans are review/edit gates
- execution creates multiple derivative notes when multiple topics/categories appear
- programs and categories are configurable
- new categories automatically create folders and home pages
- Meta Bind is optional but recommended for embedded buttons

## Build And Test Requirements

The project must support:

```bash
npm install
npm run build
npm run dev
```

For local testing, the built `main.js` must be copied into:

```text
onote-test/.obsidian/plugins/onote/main.js
```

Behavioral testing should confirm:

1. A source note mentioning `MEGALODON` roadmap, `Ben` coaching, and `ISG` strategy creates separate derivative notes under appropriate category/program folders.
2. Category and program home pages are created and updated.
3. No root-level derivative notes are created.
4. Acronyms are registered into `Acronyms.md`.
5. Tracker files are updated.
6. Source notes are archived after successful execution.
7. Completed action plans move to `Action Plans/Completed` unless configured otherwise.
