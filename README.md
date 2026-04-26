# Onote

Onote is an Obsidian community plugin for turning rough notes into a reviewable action plan and then executing that plan into durable notes and trackers.

It is designed for operating notes, leadership notes, meeting notes, program notes, and similar working material where the raw note should be preserved through review before the cleaned outputs are finalized.

## What It Does

Onote uses the OpenAI API to process the current Obsidian note into structured output, with vault-specific context loaded from Markdown files instead of hardcoded prompt rules.

The plugin follows a two-step workflow:

1. Generate an editable action-plan note from the current raw note.
2. After review, execute the action plan to create the revised note and update tracker files.

During execution, the original raw note and the action-plan note are archived instead of deleted.

## How It Works

### Step 1: Process Current Note With AI

When you run `Process Current Note with AI`, Onote:

- reads the active Markdown note
- registers acronym definitions found in the note into `Acronyms.md`
- loads AI context from the configured AI context folder
- loads `Acronyms.md` as part of the AI context
- sends the raw note plus context to OpenAI
- creates a new `... - Action Plan` note for review

The action-plan note includes:

- summary
- revised note title
- recommended action items
- delegations
- strategy recommendations
- decisions
- risks
- people / coaching notes
- related programs
- related organizations
- suggested tags
- suggested links
- revised note draft

### Step 2: Execute Current Action Plan

When you run `Execute Current Action Plan` with the reviewed action-plan note open, Onote:

- creates the revised note
- appends action items to the follow-up tracker
- appends delegations to the delegation tracker
- appends strategic observations to the strategy tracker
- appends people/coaching notes to the people tracker
- archives the original raw note
- archives the action-plan note

If archive moves fail, execution stops rather than deleting source material.

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

These files define canonical naming, acronym expansion, durable-link guidance, and extraction rules.

Onote also maintains:

```text
Acronyms.md
```

This file is used as vault-level acronym memory and is included in the AI context for the same processing run.

## Embedded Buttons

Onote-generated action plans and revised notes include embedded command buttons using the Meta Bind plugin format.

Meta Bind is optional, but recommended if you want clickable in-note buttons for:

- `Process Current Note with AI`
- `Execute Current Action Plan`

Without Meta Bind, the notes still work, but the button code blocks will render as plain fenced text instead of interactive buttons.

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

## Link Handling

Suggested links are filtered and normalized before they are written back into notes.

Onote prefers durable entity and concept notes such as:

- programs
- organizations
- people
- teams
- processes
- concepts
- strategic themes

Onote excludes:

- daily notes
- action-plan notes
- tracker files
- AI context files
- temporary processing artifacts
- `Acronyms.md`
- links whose title starts with `#`

Plain durable names are normalized to Obsidian wiki links where possible.

## Key Features

- Two-step workflow with review before execution
- Revised-note drafting with archive-safe execution
- Vault-specific AI context loaded from Markdown files
- Acronym discovery and persistent acronym memory
- Related programs and related organizations extraction
- Durable suggested-link filtering
- Tracker-file updates for action items, delegations, strategy, and coaching notes
- Conservative extraction rules for decisions and uncertainty
- Obsidian notices for progress and failure states

## Settings

Onote supports these settings:

- OpenAI API key
- model name
- action item tracker path
- delegation tracker path
- strategy tracker path
- people / coaching tracker path
- acronym list path
- program notes folder
- AI Context Folder Path
- Archive Folder Path

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

For a local vault test, copy the built plugin into:

```text
YOUR_VAULT/.obsidian/plugins/onote/
```

Required files:

- `main.js`
- `manifest.json`
- `versions.json`

Then in Obsidian:

1. Open the target vault.
2. Go to `Settings -> Community plugins`.
3. Disable `Restricted mode` if needed.
4. Enable `Onote`.
5. Configure your API key and model.

## Example Use Cases

- Turn rough meeting notes into a clean summary note plus follow-ups
- Capture delegation items without over-classifying mentions of people
- Track strategy themes and coaching notes across operating notes
- Maintain consistent acronym usage and canonical program names across the vault
