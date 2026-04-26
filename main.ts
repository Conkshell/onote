import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	requestUrl,
} from "obsidian";

type SuggestedLink = {
	title: string;
	path?: string;
};

type ActionPlan = {
	summary: string;
	relatedPrograms: string[];
	relatedOrganizations: string[];
	decisions: string[];
	actionItems: string[];
	delegations: string[];
	risks: string[];
	strategyRecommendations: string[];
	peopleCoachingNotes: string[];
	suggestedTags: string[];
	suggestedLinks: SuggestedLink[];
	revisedNoteTitle: string;
	revisedNoteMarkdown: string;
};

type ParsedActionPlanNote = {
	sourceNotePath: string;
	revisedNoteTitle: string;
	summary: string;
	actionItems: string[];
	delegations: string[];
	strategyRecommendations: string[];
	decisions: string[];
	risks: string[];
	peopleCoachingNotes: string[];
	relatedPrograms: string[];
	relatedOrganizations: string[];
	suggestedTags: string[];
	suggestedLinks: string[];
	revisedNoteMarkdown: string;
};

type DefaultContextFile = {
	path: string;
	content: string;
};

interface OnoteSettings {
	apiKey: string;
	model: string;
	followUpTrackerPath: string;
	delegationTrackerPath: string;
	strategyTrackerPath: string;
	peopleCoachingTrackerPath: string;
	acronymListPath: string;
	programNotesFolder: string;
	aiContextFolderPath: string;
	archiveFolderPath: string;
}

const DEFAULT_SETTINGS: OnoteSettings = {
	apiKey: "",
	model: "gpt-4.1-mini",
	followUpTrackerPath: "Follow-Ups.md",
	delegationTrackerPath: "Delegations.md",
	strategyTrackerPath: "Strategy Themes.md",
	peopleCoachingTrackerPath: "People - Coaching.md",
	acronymListPath: "Acronyms.md",
	programNotesFolder: "Programs",
	aiContextFolderPath: "System/AI Context",
	archiveFolderPath: "System/Onote Archive",
};

const DEFAULT_CONTEXT_FILES: DefaultContextFile[] = [
	{
		path: "Program Glossary.md",
		content: `# Program Glossary

## STARSKIPPER
Acronyms: StS
Type: Program

## Object Based Orchestration
Acronyms: OBO
Type: Program

## DRAGONSPELL
Acronyms: DS
Type: Program

## THRESHER
Acronyms: THR
Type: Program

## MEGALODON
Acronyms: MEG
Type: Program

## MEGALODON 2
Acronyms: MEG2
Type: Program
Related: [[MEGALODON]]
`,
	},
	{
		path: "Organizational Vocabulary.md",
		content: `# Organizational Vocabulary

## ISG
Meaning: Intelligence Solutions Group
Type: Organization / portfolio

## PMO
Meaning: Government Program Management Office

## PIPE
Meaning: Increment planning event
Rule: Do not rewrite PIPE as pipeline.
`,
	},
	{
		path: "Processing Rules.md",
		content: `# Processing Rules

## Related Programs / Organizations
- If a program, acronym, organization, or entity appears in the raw note, summary, revised note title, revised note draft, or extracted items, include it in Related Programs or Related Organizations.
- Use canonical names from the Program Glossary.
- Treat acronyms and full names as equivalent.
- If MEG is mentioned, use MEGALODON.
- If MEG2 is mentioned, use MEGALODON 2.
- If THR is mentioned, use THRESHER.
- If DS is mentioned, use DRAGONSPELL.
- If OBO is mentioned, use Object Based Orchestration.
- If StS is mentioned, use STARSKIPPER.
- If ISG is mentioned, include ISG as a related organization/entity.

## Suggested Links
- Suggested links should be durable entity or concept notes.
- Prefer links to programs, organizations, people, teams, processes, roles, risks, and strategic themes.
- Do not suggest links to daily notes, action-plan notes, tracker files, or temporary processing artifacts.
- Do not suggest links whose title begins with "#".
- Good examples: [[ISG]], [[MEGALODON]], [[Release Process]], [[Roadmap]], [[DIT]], [[Leadership Bench]], [[Succession Planning]], [[PM Expectations]], [[Operating Rhythm]], [[Product-Solutions Boundary]], [[Operational Readiness]].

## Formatting and Link Rules
- Suggested Links must be valid Obsidian wiki links in the form [[Note Name]].
- Do not suggest links to AI context files, including [[Processing Rules]], [[Organizational Vocabulary]], [[Program Glossary]], [[Acronyms]], or any note under System/AI Context.
- Preserve known acronyms exactly: PMO, PIPE, ISG, OBO, StS, DS, THR, MEG, MEG2.
- Do not split acronyms into words. PMO should never become "PM O".
- Preserve the difference between "remember" and "attend"; a reminder should stay a reminder unless the note explicitly says to attend.
- Suggested Links should be durable topic/entity notes, not temporary processing artifacts.

## Decisions
- Only list a decision if the note clearly indicates that a choice has already been made.
- Do not convert action items, questions, ideas, tentative thoughts, or coaching intentions into decisions.
- Phrases like "maybe", "might", "still thinking", "seems", "could", "need to think", and "probably" usually indicate uncertainty, not decisions.

## Action Items
- Action items are specific things the user should do, ask, review, prepare, clarify, remember, or investigate.

## Delegations
- Delegations are only items the user assigned to another person.
- Do not infer delegation merely because a person is mentioned.

## Strategy Recommendations
- Strategy recommendations are higher-level implications, organizational design ideas, program direction, recurring patterns, or possible future operating model changes.
- Preserve uncertainty when the raw note is uncertain.

## People / Coaching Notes
- Only create people/coaching notes when the note refers to a specific person's performance, behavior, development, role fit, or coaching need.
- Do not create generic coaching notes about communication unless tied to a specific person.
`,
	},
];

const REVISED_NOTE_START = "<!-- ONOTE_REVISED_NOTE_START -->";
const REVISED_NOTE_END = "<!-- ONOTE_REVISED_NOTE_END -->";
const ACRONYM_FILE_HEADER = `# Acronyms

| Acronym | Full Name | First Seen | Source |
|---|---|---|---|
`;
const PROCESS_CURRENT_NOTE_COMMAND = "onote:process-current-note-with-ai";
const EXECUTE_ACTION_PLAN_COMMAND = "onote:execute-current-action-plan";

export default class OnotePlugin extends Plugin {
	settings!: OnoteSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "process-current-note-with-ai",
			name: "Process Current Note with AI",
			callback: async () => {
				await this.createActionPlanFromCurrentNote();
			},
		});

		this.addCommand({
			id: "execute-current-action-plan",
			name: "Execute Current Action Plan",
			callback: async () => {
				await this.executeCurrentActionPlan();
			},
		});

		this.addSettingTab(new OnoteSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async createActionPlanFromCurrentNote(): Promise<void> {
		new Notice("Onote: reading current note...");

		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("Onote: no active Markdown note.");
			return;
		}

		if (this.isActionPlanPath(file.path)) {
			new Notice("Onote: this note is already an action plan.");
			return;
		}

		if (!this.settings.apiKey.trim()) {
			new Notice("Onote: add your OpenAI API key in plugin settings.");
			return;
		}

		try {
			const noteContent = await this.app.vault.read(file);
			await this.registerAcronymsFromNote(file, noteContent);
			const programCandidates = this.getProgramCandidates();
			const relatedNotes = this.getRelatedMarkdownNotes(file);
			const aiContext = await this.loadAIContext();

			new Notice("Onote: sending note to OpenAI...");
			const actionPlan = await this.callOpenAI(
				file,
				noteContent,
				programCandidates,
				relatedNotes,
				aiContext,
			);

			new Notice("Onote: creating action plan note...");
			const planFile = await this.createActionPlanNote(file, actionPlan);
			await this.app.workspace.getLeaf(true).openFile(planFile);

			new Notice("Onote: action plan created. Review and edit it before execution.", 7000);
		} catch (error) {
			console.error("Onote action plan generation failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			new Notice(`Onote failed: ${message}`, 8000);
		}
	}

	private async executeCurrentActionPlan(): Promise<void> {
		new Notice("Onote: reading action plan...");

		const planFile = this.app.workspace.getActiveFile();
		if (!planFile || planFile.extension !== "md") {
			new Notice("Onote: no active Markdown note.");
			return;
		}

		try {
			const planContent = await this.app.vault.read(planFile);
			const parsed = this.parseActionPlanNote(planContent);
			if (!parsed.sourceNotePath) {
				new Notice("Onote: this note is not a valid action plan.");
				return;
			}

			const sourceFile = this.app.vault.getAbstractFileByPath(parsed.sourceNotePath);
			if (!(sourceFile instanceof TFile)) {
				throw new Error(`Original note not found: ${parsed.sourceNotePath}`);
			}

			const revisedNotePath = await this.getAvailableMarkdownPath(
				this.buildSiblingPath(sourceFile, parsed.revisedNoteTitle || `${sourceFile.basename} - Summary`),
			);
			const revisedNoteContent = this.buildRevisedNoteContent(sourceFile, parsed);

			new Notice("Onote: creating approved outputs...");
			const revisedNote = await this.app.vault.create(revisedNotePath, revisedNoteContent);
			await this.appendItemsToTracker(
				this.settings.followUpTrackerPath,
				"Follow-Ups",
				revisedNote,
				parsed.actionItems,
			);
			await this.appendItemsToTracker(
				this.settings.delegationTrackerPath,
				"Delegations",
				revisedNote,
				parsed.delegations,
			);
			await this.appendItemsToTracker(
				this.settings.strategyTrackerPath,
				"Strategy Themes",
				revisedNote,
				parsed.strategyRecommendations,
			);
			await this.appendItemsToTracker(
				this.settings.peopleCoachingTrackerPath,
				"People - Coaching",
				revisedNote,
				parsed.peopleCoachingNotes,
			);

			const archivePaths = await this.archivePlanFiles(sourceFile, planFile);

			await this.app.workspace.getLeaf(true).openFile(revisedNote);
			new Notice(
				`Onote: action plan executed. Archived source files to ${archivePaths.join(" and ")}.`,
				8000,
			);
		} catch (error) {
			console.error("Onote action plan execution failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			new Notice(`Onote execution failed: ${message}`, 8000);
		}
	}

	private getProgramCandidates(): string[] {
		const folder = this.normalizeFolder(this.settings.programNotesFolder);
		if (!folder) {
			return [];
		}

		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith(`${folder}/`))
			.map((file) => file.basename)
			.sort((a, b) => a.localeCompare(b));
	}

	private getRelatedMarkdownNotes(currentFile: TFile): SuggestedLink[] {
		const excludedPaths = new Set(
			[
				this.settings.followUpTrackerPath,
				this.settings.delegationTrackerPath,
				this.settings.strategyTrackerPath,
				this.settings.peopleCoachingTrackerPath,
				this.settings.acronymListPath,
			]
				.map((path) => path.trim())
				.filter(Boolean),
		);

		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path !== currentFile.path)
			.filter((file) => !excludedPaths.has(file.path))
			.filter((file) => !this.isActionPlanPath(file.path))
			.filter((file) => !this.isAIContextFile(file.path))
			.filter((file) => !this.isTemporaryOrDailyArtifact(file))
			.map((file) => ({
				title: file.basename,
				path: file.path,
			}))
			.sort((a, b) => `${a.path ?? a.title}`.localeCompare(`${b.path ?? b.title}`));
	}

	private async loadAIContext(): Promise<string> {
		const folderPath = this.normalizeFolder(this.settings.aiContextFolderPath);
		const acronymPath = this.normalizeFilePath(this.settings.acronymListPath);
		if (!folderPath) {
			new Notice("Onote: AI Context Folder Path is empty. Proceeding without AI context.", 5000);
			return await this.loadAcronymContextOnly(acronymPath);
		}

		try {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await this.ensureFolderExists(folderPath);
				await this.seedDefaultContextFiles(folderPath);
			}

			const contextFiles = this.app.vault
				.getMarkdownFiles()
				.filter((file) => file.path.startsWith(`${folderPath}/`))
				.sort((a, b) => a.path.localeCompare(b.path));

			const blocks: string[] = [];
			for (const file of contextFiles) {
				const content = await this.app.vault.read(file);
				blocks.push(`File: ${file.path}\n${content.trim()}`);
			}

			if (acronymPath) {
				const acronymFile = await this.getOrCreateMarkdownFile(acronymPath, ACRONYM_FILE_HEADER);
				const acronymContent = await this.app.vault.read(acronymFile);
				blocks.push(`File: ${acronymFile.path}\n${acronymContent.trim()}`);
			}

			if (blocks.length === 0) {
				new Notice("Onote: no AI context files found. Proceeding without AI context.", 5000);
				return "";
			}

			blocks.sort((a, b) => a.localeCompare(b));
			return blocks.join("\n\n");
		} catch (error) {
			console.error("Onote AI context load failed", error);
			new Notice("Onote: could not load AI context files. Proceeding without AI context.", 6000);
			return "";
		}
	}

	private async loadAcronymContextOnly(acronymPath: string): Promise<string> {
		if (!acronymPath) {
			return "";
		}

		try {
			const acronymFile = await this.getOrCreateMarkdownFile(acronymPath, ACRONYM_FILE_HEADER);
			const content = await this.app.vault.read(acronymFile);
			return `File: ${acronymFile.path}\n${content.trim()}`;
		} catch (error) {
			console.error("Onote acronym context load failed", error);
			return "";
		}
	}

	private async seedDefaultContextFiles(folderPath: string): Promise<void> {
		for (const file of DEFAULT_CONTEXT_FILES) {
			const fullPath = `${folderPath}/${file.path}`;
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (!existing) {
				await this.app.vault.create(fullPath, file.content);
			}
		}
	}

	private async registerAcronymsFromNote(sourceFile: TFile, noteContent: string): Promise<void> {
		const acronymPath = this.normalizeFilePath(this.settings.acronymListPath);
		if (!acronymPath) {
			return;
		}

		const definitions = this.parseAcronymDefinitions(noteContent);
		if (definitions.length === 0) {
			await this.getOrCreateMarkdownFile(acronymPath, ACRONYM_FILE_HEADER);
			return;
		}

		const acronymFile = await this.getOrCreateMarkdownFile(acronymPath, ACRONYM_FILE_HEADER);
		const existingContent = await this.app.vault.read(acronymFile);
		const existingEntries = this.readExistingAcronymEntries(existingContent);
		const existingConflicts = new Set(this.readExistingAcronymConflicts(existingContent));
		const firstSeen = window.moment().format("YYYY-MM-DD");
		const sourceLink = this.app.metadataCache.fileToLinktext(sourceFile, acronymFile.path, true);
		const newRows: string[] = [];
		const newConflicts: string[] = [];

		for (const definition of definitions) {
			const current = existingEntries.get(definition.acronym);
			if (!current) {
				newRows.push(
					`| ${definition.acronym} | ${definition.fullName} | ${firstSeen} | [[${sourceLink}]] |`,
				);
				existingEntries.set(definition.acronym, definition.fullName);
				continue;
			}

			if (current !== definition.fullName) {
				const conflictLine = `- ${firstSeen}: ${definition.acronym} was also seen as "${definition.fullName}" in [[${sourceLink}]]`;
				if (!existingConflicts.has(conflictLine)) {
					newConflicts.push(conflictLine);
					existingConflicts.add(conflictLine);
				}
			}
		}

		if (newRows.length === 0 && newConflicts.length === 0) {
			return;
		}

		const sections: string[] = [];
		if (!existingContent.trim()) {
			sections.push(ACRONYM_FILE_HEADER.trimEnd());
		} else {
			sections.push(existingContent.trimEnd());
		}

		if (newRows.length > 0) {
			sections.push("", ...newRows);
		}

		if (newConflicts.length > 0) {
			if (!/^\#\# Acronym Conflicts$/m.test(existingContent)) {
				sections.push("", "## Acronym Conflicts");
			}
			sections.push("", ...newConflicts);
		}

		await this.app.vault.modify(acronymFile, `${sections.join("\n").trimEnd()}\n`);
	}

	private parseAcronymDefinitions(noteContent: string): Array<{ acronym: string; fullName: string }> {
		const seen = new Set<string>();
		const results: Array<{ acronym: string; fullName: string }> = [];
		const regex = /([A-Za-z0-9][A-Za-z0-9/&,\- ]*[A-Za-z0-9])\s+\(([A-Z][A-Z0-9]{1,})\)/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(noteContent)) !== null) {
			const fullName = match[1].replace(/\s+/g, " ").trim();
			const acronym = match[2].trim();
			if (!fullName || fullName.length < 3) {
				continue;
			}

			const key = `${acronym}::${fullName}`;
			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			results.push({ acronym, fullName });
		}

		return results;
	}

	private readExistingAcronymEntries(content: string): Map<string, string> {
		const entries = new Map<string, string>();
		const lines = content.split("\n");
		for (const line of lines) {
			const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
			if (!match) {
				continue;
			}

			const acronym = match[1].trim();
			const fullName = match[2].trim();
			if (!acronym || acronym === "Acronym") {
				continue;
			}

			entries.set(acronym, fullName);
		}

		return entries;
	}

	private readExistingAcronymConflicts(content: string): string[] {
		const match = content.match(/^## Acronym Conflicts\n([\s\S]*?)$/m);
		if (!match) {
			return [];
		}

		return match[1]
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.startsWith("- "));
	}

	private async callOpenAI(
		file: TFile,
		noteContent: string,
		programCandidates: string[],
		relatedNotes: SuggestedLink[],
		aiContext: string,
	): Promise<ActionPlan> {
		const response = await requestUrl({
			url: "https://api.openai.com/v1/chat/completions",
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.settings.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: this.settings.model,
				response_format: { type: "json_object" },
				messages: [
					{
						role: "system",
						content:
							"You turn raw notes into an editable execution plan. AI Context files are authoritative for acronym expansion, canonical names, and classification rules. Return only valid JSON.",
					},
					{
						role: "user",
						content: this.buildPrompt(file, noteContent, programCandidates, relatedNotes, aiContext),
					},
				],
			}),
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`OpenAI API returned ${response.status}`);
		}

		const content = response.json?.choices?.[0]?.message?.content;
		if (typeof content !== "string" || !content.trim()) {
			throw new Error("OpenAI response did not include message content.");
		}

		return this.normalizeActionPlan(this.parseJson(content), file.basename);
	}

	private buildPrompt(
		file: TFile,
		noteContent: string,
		programCandidates: string[],
		relatedNotes: SuggestedLink[],
		aiContext: string,
	): string {
		const programList = programCandidates.length > 0 ? programCandidates.join(", ") : "None provided";
		const linkCandidates =
			relatedNotes.length > 0
				? relatedNotes
						.slice(0, 200)
						.map((note) => `${note.title}${note.path ? ` (${note.path})` : ""}`)
						.join(", ")
				: "None provided";

		return [
			`You are processing an Obsidian note titled "${file.basename}".`,
			"",
			"Return exactly one JSON object with this shape:",
			"{",
			'  "summary": "string",',
			'  "related_programs": ["string"],',
			'  "related_organizations": ["string"],',
			'  "decisions": ["string"],',
			'  "action_items": ["string"],',
			'  "delegations": ["string"],',
			'  "risks": ["string"],',
			'  "strategy_recommendations": ["string"],',
			'  "people_coaching_notes": ["string"],',
			'  "suggested_tags": ["string"],',
			'  "suggested_links": [{"title": "string", "path": "optional string"}],',
			'  "revised_note_title": "string",',
			'  "revised_note_markdown": "string"',
			"}",
			"",
			"Rules:",
			"- Return valid JSON only, with no markdown fences or prose outside the JSON object.",
			"- Use empty strings or arrays when information is missing.",
			"- Keep each array item concise and specific.",
			"- AI Context files are authoritative for acronym expansion, canonical names, and classification rules.",
			"- Acronyms.md is authoritative for acronym expansion unless it records a conflict.",
			"- In revised_note_markdown, spell out each acronym on first use followed by the acronym in parentheses. After first use, use the acronym.",
			"- Preserve known acronyms exactly and do not split acronyms into words.",
			"- PMO must never become PM O.",
			"- PIPE must remain PIPE and must not be rewritten as pipeline.",
			"- revised_note_markdown should be a cleaned, concise replacement note suitable to keep after the original is archived.",
			"- Prefer related_programs and related_organizations that match these existing program notes when applicable:",
			`  ${programList}`,
			"- Prefer suggested_links that match these existing notes when applicable:",
			`  ${linkCandidates}`,
			"- Suggested_links must be valid Obsidian wiki links in the form [[Note Name]].",
			"- Suggested tags should be plain tag names without leading #.",
			"- revised_note_title should be concise and appropriate as a markdown note title.",
			"- If the note contains an uncertain dependency, missing date, incomplete plan, or unresolved ownership issue, consider whether it belongs in risks.",
			'- Example: "staffing plan coming but no real dates" should usually produce a risk.',
			"",
			"AI Context:",
			aiContext || "(none)",
			"",
			"Raw note:",
			noteContent,
		].join("\n");
	}

	private parseJson(content: string): unknown {
		const trimmed = content.trim();
		const sanitized = trimmed.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
		return JSON.parse(sanitized);
	}

	private normalizeActionPlan(raw: unknown, fallbackTitle: string): ActionPlan {
		const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
		return {
			summary: this.asString(data.summary),
			relatedPrograms: this.asStringArray(data.related_programs),
			relatedOrganizations: this.asStringArray(data.related_organizations),
			decisions: this.asStringArray(data.decisions),
			actionItems: this.asStringArray(data.action_items),
			delegations: this.asStringArray(data.delegations),
			risks: this.asStringArray(data.risks),
			strategyRecommendations: this.asStringArray(data.strategy_recommendations),
			peopleCoachingNotes: this.asStringArray(data.people_coaching_notes),
			suggestedTags: this.asStringArray(data.suggested_tags),
			suggestedLinks: this.asSuggestedLinks(data.suggested_links),
			revisedNoteTitle:
				this.asString(data.revised_note_title) || `${fallbackTitle} - Summary`,
			revisedNoteMarkdown:
				this.asString(data.revised_note_markdown) || `# ${fallbackTitle}\n\n_No revised note draft generated._`,
		};
	}

	private asString(value: unknown): string {
		return typeof value === "string" ? value.trim() : "";
	}

	private asStringArray(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);
	}

	private asSuggestedLinks(value: unknown): SuggestedLink[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map((item) => {
				if (typeof item === "string") {
					return { title: item.trim() };
				}

				if (typeof item === "object" && item !== null) {
					const record = item as Record<string, unknown>;
					const title = this.asString(record.title);
					const path = this.asString(record.path);
					return title ? { title, path: path || undefined } : null;
				}

				return null;
			})
			.filter((item): item is SuggestedLink => item !== null)
			.filter((item) => !item.title.startsWith("#"))
			.filter((item) => !this.isSuggestedLinkArtifact(item));
	}

	private async createActionPlanNote(sourceFile: TFile, actionPlan: ActionPlan): Promise<TFile> {
		const planPath = await this.getAvailableMarkdownPath(
			this.buildSiblingPath(sourceFile, `${sourceFile.basename} - Action Plan`),
		);
		const content = this.buildActionPlanNoteContent(sourceFile, actionPlan);
		return this.app.vault.create(planPath, content);
	}

	private buildActionPlanNoteContent(sourceFile: TFile, actionPlan: ActionPlan): string {
		const timestamp = window.moment().format("YYYY-MM-DD HH:mm");
		return [
			"---",
			'onote_type: "action_plan"',
			`source_note_path: "${this.escapeYamlString(sourceFile.path)}"`,
			`generated_at: "${this.escapeYamlString(new Date().toISOString())}"`,
			"---",
			"",
			`# AI Action Plan: ${sourceFile.basename}`,
			"",
			`Generated ${timestamp}. Review and edit this note, then run \`Execute Current Action Plan\` while it is open.`,
			"",
			"## Commands",
			"",
			"```meta-bind-button",
			this.buildMetaBindButton("Execute Current Action Plan", EXECUTE_ACTION_PLAN_COMMAND),
			"```",
			"",
			this.formatTextSection("Summary", actionPlan.summary || "_No summary generated._"),
			this.formatTextSection("Revised Note Title", actionPlan.revisedNoteTitle),
			this.formatListSection("Recommended Action Items", actionPlan.actionItems),
			this.formatListSection("Delegations", actionPlan.delegations),
			this.formatListSection("Strategy Recommendations", actionPlan.strategyRecommendations),
			this.formatListSection("Decisions", actionPlan.decisions),
			this.formatListSection("Risks", actionPlan.risks),
			this.formatListSection("People / Coaching Notes", actionPlan.peopleCoachingNotes),
			this.formatListSection(
				"Related Programs",
				actionPlan.relatedPrograms.map((item) => this.renderDurableEntityLink(item)),
			),
			this.formatListSection(
				"Related Organizations",
				actionPlan.relatedOrganizations.map((item) => this.renderDurableEntityLink(item)),
			),
			this.formatListSection(
				"Suggested Tags",
				actionPlan.suggestedTags.map((tag) => `#${tag.replace(/^#/, "")}`),
			),
			this.formatListSection(
				"Suggested Links",
				actionPlan.suggestedLinks
					.map((link) => this.formatSuggestedLink(link))
					.filter(Boolean),
			),
			"## Revised Note Draft",
			"",
			"Edit the content between the markers below. This draft becomes the kept note when you execute the plan.",
			"",
			REVISED_NOTE_START,
			actionPlan.revisedNoteMarkdown.trim() || "_No revised note draft generated._",
			REVISED_NOTE_END,
			"",
		].join("\n");
	}

	private parseActionPlanNote(content: string): ParsedActionPlanNote {
		const sourceNotePath = this.readFrontmatterValue(content, "source_note_path");
		const revisedNoteMarkdown = this.extractBetween(content, REVISED_NOTE_START, REVISED_NOTE_END).trim();
		const contentBeforeDraft = content.split(REVISED_NOTE_START)[0];

		return {
			sourceNotePath,
			revisedNoteTitle:
				this.extractSectionText(contentBeforeDraft, "Revised Note Title") || "Approved Summary",
			summary: this.extractSectionText(contentBeforeDraft, "Summary"),
			actionItems: this.extractSectionList(contentBeforeDraft, "Recommended Action Items"),
			delegations: this.extractSectionList(contentBeforeDraft, "Delegations"),
			strategyRecommendations: this.extractSectionList(contentBeforeDraft, "Strategy Recommendations"),
			decisions: this.extractSectionList(contentBeforeDraft, "Decisions"),
			risks: this.extractSectionList(contentBeforeDraft, "Risks"),
			peopleCoachingNotes: this.extractSectionList(contentBeforeDraft, "People / Coaching Notes"),
			relatedPrograms: this.extractSectionList(contentBeforeDraft, "Related Programs"),
			relatedOrganizations: this.extractSectionList(contentBeforeDraft, "Related Organizations"),
			suggestedTags: this.extractSectionList(contentBeforeDraft, "Suggested Tags").map((tag) =>
				tag.replace(/^#/, "").trim(),
			),
			suggestedLinks: this.extractSectionList(contentBeforeDraft, "Suggested Links").filter(
				(link) => !link.startsWith("#"),
			),
			revisedNoteMarkdown,
		};
	}

	private readFrontmatterValue(content: string, key: string): string {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return "";
		}

		const pattern = new RegExp(`^${this.escapeRegex(key)}:\\s*"?(.+?)"?\\s*$`, "m");
		const valueMatch = frontmatterMatch[1].match(pattern);
		return valueMatch?.[1]?.trim() ?? "";
	}

	private extractSectionText(content: string, title: string): string {
		const body = this.extractSectionBody(content, title);
		return body
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.join("\n");
	}

	private extractSectionList(content: string, title: string): string[] {
		const body = this.extractSectionBody(content, title);
		return body
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.startsWith("- "))
			.map((line) => line.slice(2).trim())
			.filter(Boolean);
	}

	private extractSectionBody(content: string, title: string): string {
		const pattern = new RegExp(
			`## ${this.escapeRegex(title)}\\n([\\s\\S]*?)(?=\\n## |\\n${this.escapeRegex(REVISED_NOTE_START)}|$)`,
		);
		const match = content.match(pattern);
		return match?.[1]?.trim() ?? "";
	}

	private extractBetween(content: string, startMarker: string, endMarker: string): string {
		const startIndex = content.indexOf(startMarker);
		const endIndex = content.indexOf(endMarker);
		if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
			return "";
		}

		return content.slice(startIndex + startMarker.length, endIndex).trim();
	}

	private buildRevisedNoteContent(sourceFile: TFile, plan: ParsedActionPlanNote): string {
		const sections = [
			plan.revisedNoteMarkdown.trim(),
			[
				"## Commands",
				"",
				"```meta-bind-button",
				this.buildMetaBindButton("Process Current Note with AI", PROCESS_CURRENT_NOTE_COMMAND),
				"```",
			].join("\n"),
		];

		if (plan.summary) {
			sections.push(this.formatTextSection("AI Approved Summary", plan.summary));
		}
		if (plan.decisions.length > 0) {
			sections.push(this.formatListSection("Decisions", plan.decisions));
		}
		if (plan.relatedPrograms.length > 0) {
			sections.push(
				this.formatListSection(
					"Related Programs",
					plan.relatedPrograms.map((item) => this.renderDurableEntityLink(item)),
				),
			);
		}
		if (plan.relatedOrganizations.length > 0) {
			sections.push(
				this.formatListSection(
					"Related Organizations",
					plan.relatedOrganizations.map((item) => this.renderDurableEntityLink(item)),
				),
			);
		}
		if (plan.suggestedLinks.length > 0) {
			sections.push(
				this.formatListSection(
					"Suggested Links",
					plan.suggestedLinks
						.filter((link) => !link.startsWith("#"))
						.map((link) => this.renderDurableEntityLink(link))
						.filter(Boolean),
				),
			);
		}
		if (plan.suggestedTags.length > 0) {
			sections.push(
				this.formatListSection(
					"Suggested Tags",
					plan.suggestedTags.map((tag) => `#${tag.replace(/^#/, "")}`),
				),
			);
		}

		sections.push(
			this.formatTextSection(
				"Source",
				`Derived from "${sourceFile.path}" via an approved Onote action plan.`,
			),
		);

		return `${sections.join("\n\n").trim()}\n`;
	}

	private async appendItemsToTracker(
		trackerPath: string,
		title: string,
		sourceFile: TFile,
		items: string[],
	): Promise<void> {
		const normalizedPath = trackerPath.trim();
		if (!normalizedPath) {
			return;
		}

		const trackerFile = await this.getOrCreateMarkdownFile(normalizedPath, `# ${title}\n`);
		if (items.length === 0) {
			return;
		}

		const timestamp = window.moment().format("YYYY-MM-DD");
		const sourceLink = this.app.metadataCache.fileToLinktext(sourceFile, normalizedPath, true);
		const block = [
			"",
			`## ${timestamp} - [[${sourceLink}]]`,
			...items.map((item) => `- ${item}`),
			"",
		].join("\n");

		await this.app.vault.append(trackerFile, block);
	}

	private async archivePlanFiles(sourceFile: TFile, planFile: TFile): Promise<string[]> {
		const archiveFolder = this.normalizeFolder(this.settings.archiveFolderPath);
		if (!archiveFolder) {
			throw new Error("Archive Folder Path is empty.");
		}

		await this.ensureFolderExists(archiveFolder);

		const originalArchivePath = await this.getAvailableMarkdownPath(
			`${archiveFolder}/${this.sanitizeFileName(sourceFile.basename)}.md`,
		);
		const planArchivePath = await this.getAvailableMarkdownPath(
			`${archiveFolder}/${this.sanitizeFileName(planFile.basename)}.md`,
		);

		await this.app.fileManager.renameFile(sourceFile, originalArchivePath);
		await this.app.fileManager.renameFile(planFile, planArchivePath);

		return [originalArchivePath, planArchivePath];
	}

	private async getOrCreateMarkdownFile(path: string, initialContent: string): Promise<TFile> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			return existing;
		}

		const folderPath = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
		if (folderPath) {
			await this.ensureFolderExists(folderPath);
		}

		return this.app.vault.create(path, initialContent);
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const segments = folderPath.split("/").filter(Boolean);
		let currentPath = "";

		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	private async getAvailableMarkdownPath(preferredPath: string): Promise<string> {
		const normalized = preferredPath.endsWith(".md") ? preferredPath : `${preferredPath}.md`;
		if (!this.app.vault.getAbstractFileByPath(normalized)) {
			return normalized;
		}

		const basePath = normalized.replace(/\.md$/i, "");
		let counter = 2;
		while (this.app.vault.getAbstractFileByPath(`${basePath} ${counter}.md`)) {
			counter += 1;
		}

		return `${basePath} ${counter}.md`;
	}

	private buildSiblingPath(sourceFile: TFile, noteTitle: string): string {
		const cleanTitle = this.sanitizeFileName(noteTitle) || `${sourceFile.basename} - Summary`;
		const folder = sourceFile.parent?.path;
		return folder ? `${folder}/${cleanTitle}.md` : `${cleanTitle}.md`;
	}

	private sanitizeFileName(name: string): string {
		return name.trim().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
	}

	private formatTextSection(title: string, text: string): string {
		return `## ${title}\n\n${text || "_None_"}`;
	}

	private buildMetaBindButton(label: string, commandId: string): string {
		return [
			`label: ${label}`,
			"style: primary",
			"action:",
			"  type: command",
			`  command: ${commandId}`,
		].join("\n");
	}

	private formatListSection(title: string, items: string[]): string {
		const body = items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
		return `## ${title}\n\n${body}`;
	}

	private formatSuggestedLink(link: SuggestedLink): string {
		if (!link.title || link.title.startsWith("#") || this.isSuggestedLinkArtifact(link)) {
			return "";
		}

		if (this.isWikiLink(link.title)) {
			return this.isSuggestedLinkArtifact({ title: this.extractWikiLinkTitle(link.title), path: link.path })
				? ""
				: link.title;
		}

		const resolvedPath = link.path?.trim();
		if (resolvedPath) {
			const maybeFile = this.app.vault.getAbstractFileByPath(resolvedPath);
			if (maybeFile instanceof TFile && !this.isTemporaryOrDailyArtifact(maybeFile) && !this.isAIContextFile(maybeFile.path)) {
				const linkText = this.app.metadataCache.fileToLinktext(maybeFile, "", true);
				return `[[${linkText}]]`;
			}
		}

		const match = this.app.metadataCache.getFirstLinkpathDest(link.title, "");
		if (match && !this.isTemporaryOrDailyArtifact(match) && !this.isAIContextFile(match.path)) {
			const linkText = this.app.metadataCache.fileToLinktext(match, "", true);
			return `[[${linkText}]]`;
		}

		return this.renderDurableEntityLink(link.title);
	}

	private isSuggestedLinkArtifact(link: SuggestedLink): boolean {
		const title = this.extractWikiLinkTitle(link.title).toLowerCase();
		if (title.startsWith("#")) {
			return true;
		}

		const path = link.path?.toLowerCase() ?? "";
		if (path === this.normalizeFilePath(this.settings.acronymListPath).toLowerCase()) {
			return true;
		}
		if (path && this.isAIContextFile(path)) {
			return true;
		}
		return [
			"follow-up",
			"follow up",
			"delegation",
			"strategy theme",
			"people - coaching",
			"action plan",
			"processed summary",
			"tmp",
			"temp",
			"scratch",
			"acronyms",
		].some((marker) => title.includes(marker) || path.includes(marker));
	}

	private renderDurableEntityLink(value: string): string {
		const trimmed = value.trim();
		if (!trimmed) {
			return "";
		}

		if (this.isWikiLink(trimmed)) {
			return trimmed;
		}

		if (trimmed.startsWith("#")) {
			return "";
		}

		const match = this.app.metadataCache.getFirstLinkpathDest(trimmed, "");
		if (match && !this.isTemporaryOrDailyArtifact(match) && !this.isAIContextFile(match.path)) {
			const linkText = this.app.metadataCache.fileToLinktext(match, "", true);
			return `[[${linkText}]]`;
		}

		return `[[${trimmed}]]`;
	}

	private isWikiLink(value: string): boolean {
		return /^\[\[[^\]]+\]\]$/.test(value.trim());
	}

	private extractWikiLinkTitle(value: string): string {
		const trimmed = value.trim();
		if (!this.isWikiLink(trimmed)) {
			return trimmed;
		}

		return trimmed.slice(2, -2).split("|")[0].trim();
	}

	private normalizeFolder(folder: string): string {
		return folder.trim().replace(/^\/+|\/+$/g, "");
	}

	private normalizeFilePath(path: string): string {
		return path.trim().replace(/^\/+|\/+$/g, "");
	}

	private escapeYamlString(value: string): string {
		return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	}

	private escapeRegex(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	private isActionPlanPath(path: string): boolean {
		return /action plan\.md$/i.test(path);
	}

	private isAIContextFile(path: string): boolean {
		const normalizedPath = this.normalizeFilePath(path);
		const contextFolder = this.normalizeFolder(this.settings.aiContextFolderPath);
		const acronymPath = this.normalizeFilePath(this.settings.acronymListPath);

		if (normalizedPath === acronymPath) {
			return true;
		}

		return contextFolder ? normalizedPath.startsWith(`${contextFolder}/`) : false;
	}

	private isTemporaryOrDailyArtifact(file: TAbstractFile): boolean {
		const path = file.path.toLowerCase();
		const basename = file.name.replace(/\.md$/i, "").toLowerCase();

		if (this.isLikelyDailyNote(file.name.replace(/\.md$/i, ""))) {
			return true;
		}

		return [
			"follow-up",
			"follow up",
			"delegation",
			"strategy theme",
			"people - coaching",
			"people/coaching",
			"processed summary",
			"action plan",
			"tmp",
			"temp",
			"scratch",
			"draft",
		].some((marker) => basename.includes(marker) || path.includes(marker));
	}

	private isLikelyDailyNote(name: string): boolean {
		return (
			/^\d{4}-\d{2}-\d{2}$/.test(name) ||
			/^\d{4}\.\d{2}\.\d{2}$/.test(name) ||
			/^\d{4}_\d{2}_\d{2}$/.test(name) ||
			/^[a-z]+ \d{1,2}, \d{4}$/i.test(name)
		);
	}
}

class OnoteSettingTab extends PluginSettingTab {
	plugin: OnotePlugin;

	constructor(app: App, plugin: OnotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Onote Settings" });

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Used to generate action plans and revised notes from the current note.")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model name")
			.setDesc("Chat Completions model to use.")
			.addText((text) =>
				text
					.setPlaceholder("gpt-4.1-mini")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
						await this.plugin.saveSettings();
					}),
			);

		this.addPathSetting(containerEl, "Action item tracker path", "followUpTrackerPath");
		this.addPathSetting(containerEl, "Delegation tracker path", "delegationTrackerPath");
		this.addPathSetting(containerEl, "Strategy tracker path", "strategyTrackerPath");
		this.addPathSetting(containerEl, "People / coaching tracker path", "peopleCoachingTrackerPath");
		this.addPathSetting(containerEl, "Acronym List Path", "acronymListPath");
		this.addPathSetting(containerEl, "Program notes folder", "programNotesFolder");
		this.addPathSetting(containerEl, "AI Context Folder Path", "aiContextFolderPath");
		this.addPathSetting(containerEl, "Archive Folder Path", "archiveFolderPath");
	}

	private addPathSetting(containerEl: HTMLElement, label: string, key: keyof OnoteSettings): void {
		new Setting(containerEl)
			.setName(label)
			.setDesc("Markdown path or folder path inside the vault. Missing folders/files will be created when needed.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS[key])
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						this.plugin.settings[key] = value.trim() || DEFAULT_SETTINGS[key];
						await this.plugin.saveSettings();
					}),
			);
	}
}
