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

type ProgramConfig = {
	name: string;
	acronyms: string[];
};

type CategoryConfig = {
	name: string;
	folderPath: string;
	description: string;
};

type DerivativeNotePlan = {
	title: string;
	category: string;
	folder: string;
	relatedPrograms: string[];
	relatedOrganizations: string[];
	relatedPeople: string[];
	summaryMarkdown: string;
	tags: string[];
};

type ReviewTask = {
	text: string;
	checked: boolean;
};

type ActionPlan = {
	summary: string;
	actionItems: string[];
	delegations: string[];
	risks: string[];
	decisions: string[];
	strategyRecommendations: string[];
	peopleCoachingNotes: string[];
	suggestedLinks: SuggestedLink[];
	derivativeNotes: DerivativeNotePlan[];
};

type ParsedActionPlanNote = {
	sourceNotePath: string;
	summary: string;
	actionItems: ReviewTask[];
	delegations: string[];
	risks: string[];
	decisions: string[];
	strategyRecommendations: string[];
	peopleCoachingNotes: string[];
	suggestedLinks: string[];
	derivativeNotes: DerivativeNotePlan[];
};

type DefaultContextFile = {
	path: string;
	content: string;
};

type ResolvedCategory = CategoryConfig & {
	homePagePath: string;
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
	archiveCompletedActionPlans: boolean;
	programs: ProgramConfig[];
	categories: CategoryConfig[];
}

const DEFAULT_PROGRAMS: ProgramConfig[] = [
	{ name: "MEGALODON", acronyms: ["MEG"] },
	{ name: "MEGALODON 2", acronyms: ["MEG2"] },
	{ name: "Object Based Orchestration", acronyms: ["OBO"] },
	{ name: "STARSKIPPER", acronyms: ["StS"] },
	{ name: "THRESHER", acronyms: ["THR"] },
	{ name: "DRAGONSPELL", acronyms: ["DS"] },
];

const DEFAULT_CATEGORIES: CategoryConfig[] = [
	{ name: "Programs", folderPath: "Programs", description: "Program-specific delivery, roadmap, release, and execution notes." },
	{ name: "Leadership", folderPath: "Leadership", description: "Leadership decisions, management observations, ownership, and execution notes." },
	{ name: "Strategy", folderPath: "Strategy", description: "Strategy, operating model, and directional thinking." },
	{ name: "People", folderPath: "People", description: "Coaching, performance, role fit, and people-development notes." },
	{ name: "Meetings", folderPath: "Meetings", description: "Meeting-derived notes and meeting follow-through." },
	{ name: "Reference", folderPath: "Reference", description: "Reference material, definitions, concepts, and operating knowledge." },
	{ name: "Scratchpad", folderPath: "Scratchpad", description: "Temporary thinking, working drafts, and exploratory note fragments." },
];

const DEFAULT_SETTINGS: OnoteSettings = {
	apiKey: "",
	model: "gpt-4.1-mini",
	followUpTrackerPath: "Action Plans/Open Tasks.md",
	delegationTrackerPath: "Action Plans/Delegations.md",
	strategyTrackerPath: "Strategy/Strategy Themes.md",
	peopleCoachingTrackerPath: "People/People - Coaching.md",
	acronymListPath: "Acronyms.md",
	programNotesFolder: "Programs",
	aiContextFolderPath: "System/AI Context",
	archiveFolderPath: "Archive",
	archiveCompletedActionPlans: false,
	programs: DEFAULT_PROGRAMS,
	categories: DEFAULT_CATEGORIES,
};

const ACTION_PLANS_FOLDER = "Action Plans";
const ACTION_PLANS_COMPLETED_FOLDER = "Action Plans/Completed";
const REVISED_NOTE_START = "<!-- ONOTE_DERIVATIVE_NOTES_START -->";
const REVISED_NOTE_END = "<!-- ONOTE_DERIVATIVE_NOTES_END -->";
const ACRONYM_FILE_HEADER = `# Acronyms

| Acronym | Full Name | First Seen | Source |
|---|---|---|---|
`;
const PROCESS_CURRENT_NOTE_COMMAND = "onote:process-current-note-with-ai";
const EXECUTE_ACTION_PLAN_COMMAND = "onote:execute-current-action-plan";
const OPEN_TASKS_DASHBOARD_CONTENT = `# Open Tasks

All unresolved tasks across the vault.

## All Open Tasks

\`\`\`tasks
not done
path does not include Action Plans/Completed
sort by due
group by path
\`\`\`
`;

export default class OnotePlugin extends Plugin {
	settings!: OnoteSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.ensureOpenTasksDashboard();

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
		const loaded = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		this.settings.programs = this.normalizePrograms(loaded?.programs ?? DEFAULT_PROGRAMS);
		this.settings.categories = this.normalizeCategories(loaded?.categories ?? DEFAULT_CATEGORIES);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private normalizePrograms(value: unknown): ProgramConfig[] {
		if (!Array.isArray(value)) {
			return DEFAULT_PROGRAMS;
		}

		const programs = value
			.map((item) => {
				if (typeof item !== "object" || item === null) {
					return null;
				}

				const record = item as Record<string, unknown>;
				const name = this.asString(record.name);
				const acronyms = Array.isArray(record.acronyms)
					? record.acronyms
							.filter((entry): entry is string => typeof entry === "string")
							.map((entry) => entry.trim())
							.filter(Boolean)
					: [];
				return name ? { name, acronyms } : null;
			})
			.filter((item): item is ProgramConfig => item !== null);

		return programs.length > 0 ? programs : DEFAULT_PROGRAMS;
	}

	private normalizeCategories(value: unknown): CategoryConfig[] {
		if (!Array.isArray(value)) {
			return DEFAULT_CATEGORIES;
		}

		const categories = value
			.map((item) => {
				if (typeof item !== "object" || item === null) {
					return null;
				}

				const record = item as Record<string, unknown>;
				const name = this.asString(record.name);
				const folderPath = this.asString(record.folderPath);
				const description = this.asString(record.description);
				return name && folderPath ? { name, folderPath, description } : null;
			})
			.filter((item): item is CategoryConfig => item !== null);

		return categories.length > 0 ? categories : DEFAULT_CATEGORIES;
	}

	private async createActionPlanFromCurrentNote(): Promise<void> {
		new Notice("Onote: reading current source note...");

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
			const aiContext = await this.loadAIContext();
			const relatedNotes = this.getRelatedMarkdownNotes(file);

			new Notice("Onote: sending source note to OpenAI...");
			const actionPlan = await this.callOpenAI(file, noteContent, relatedNotes, aiContext);

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
			if (parsed.derivativeNotes.length === 0) {
				throw new Error("No derivative notes were parsed from Proposed Derivative Notes.");
			}

			const sourceFile = this.app.vault.getAbstractFileByPath(parsed.sourceNotePath);
			if (!(sourceFile instanceof TFile)) {
				throw new Error(`Source note not found: ${parsed.sourceNotePath}`);
			}

			const completedActionPlanPath = this.settings.archiveCompletedActionPlans
				? null
				: await this.getAvailableMarkdownPath(
						`${ACTION_PLANS_COMPLETED_FOLDER}/${this.sanitizeFileName(planFile.basename)}.md`,
				  );

			new Notice("Onote: creating derivative notes...");
			const derivativeFiles = await this.createDerivativeNotesFromPlan(sourceFile, planFile, completedActionPlanPath ?? planFile.path, parsed);

			new Notice("Onote: updating trackers...");
			const primaryReference = derivativeFiles[0] ?? sourceFile;
			await this.ensureOpenTasksDashboard();
			await this.appendItemsToTracker(this.settings.delegationTrackerPath, "Delegations", primaryReference, parsed.delegations);
			await this.appendItemsToTracker(this.settings.strategyTrackerPath, "Strategy Themes", primaryReference, parsed.strategyRecommendations);
			await this.appendItemsToTracker(this.settings.peopleCoachingTrackerPath, "People - Coaching", primaryReference, parsed.peopleCoachingNotes);

			new Notice("Onote: finalizing source note and action plan...");
			const sourceArchiveNotice = await this.archiveSourceNote(sourceFile);
			await this.markOpenActionPlanTasksComplete(planFile);
			const actionPlanNotice = await this.completeActionPlan(planFile, completedActionPlanPath);

			await this.app.workspace.getLeaf(true).openFile(derivativeFiles[0] ?? primaryReference);
			new Notice(`Onote: created ${derivativeFiles.length} derivative notes. ${sourceArchiveNotice} ${actionPlanNotice}`, 9000);
		} catch (error) {
			console.error("Onote action plan execution failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			new Notice(`Onote execution failed: ${message}`, 9000);
		}
	}

	private async createDerivativeNotesFromPlan(
		sourceFile: TFile,
		actionPlanFile: TFile,
		finalActionPlanPath: string,
		plan: ParsedActionPlanNote,
	): Promise<TFile[]> {
		const timestampPrefix = this.getSourceTimestampPrefix(sourceFile);
		const createdFiles: TFile[] = [];
		const taskAssignments = this.assignUncheckedTasksToDerivatives(plan.actionItems, plan.derivativeNotes);

		for (const [index, derivative] of plan.derivativeNotes.entries()) {
			const normalized = this.normalizeDerivativeNotePlan(derivative);
			const category = await this.ensureCategory(normalized.category);
			const folderPath = await this.resolveDerivativeFolder(normalized, category);
			const derivativePath = await this.getAvailableMarkdownPath(
				`${folderPath}/${this.ensureTimestampedTitle(timestampPrefix, normalized.title)}.md`,
			);
			const derivativeContent = this.buildDerivativeNoteContent(
				normalized,
				sourceFile,
				finalActionPlanPath,
				taskAssignments.get(index) ?? [],
			);
			const derivativeFile = await this.app.vault.create(derivativePath, derivativeContent);
			createdFiles.push(derivativeFile);

			await this.ensureCategoryHomePage(category);
			await this.appendLinkUnderSection(category.homePagePath, "Recent Notes", `[[${this.app.metadataCache.fileToLinktext(derivativeFile, category.homePagePath, true)}]]`);

			const primaryProgram = normalized.relatedPrograms[0];
			if (primaryProgram) {
				const primaryProgramHome = await this.ensureProgramHomePage(primaryProgram);
				await this.appendLinkUnderSection(primaryProgramHome, "Recent Notes", `[[${this.app.metadataCache.fileToLinktext(derivativeFile, primaryProgramHome, true)}]]`);
				for (const program of normalized.relatedPrograms.slice(1)) {
					const relatedProgramHome = await this.ensureProgramHomePage(program);
					await this.appendLinkUnderSection(relatedProgramHome, "Recent Notes", `[[${this.app.metadataCache.fileToLinktext(derivativeFile, relatedProgramHome, true)}]]`);
				}
			}
		}

		return createdFiles;
	}

	private normalizeDerivativeNotePlan(plan: DerivativeNotePlan): DerivativeNotePlan {
		const categoryName = this.normalizeCategoryName(plan.category);
		return {
			title: this.asString(plan.title) || "Untitled Derivative",
			category: categoryName,
			folder: this.normalizeFilePath(plan.folder),
			relatedPrograms: this.normalizeProgramList(plan.relatedPrograms),
			relatedOrganizations: this.asStringArray(plan.relatedOrganizations).map((entry) => this.extractWikiLinkTitle(entry)),
			relatedPeople: this.asStringArray(plan.relatedPeople).map((entry) => this.extractWikiLinkTitle(entry)),
			summaryMarkdown: this.asString(plan.summaryMarkdown),
			tags: this.asStringArray(plan.tags).map((tag) => tag.replace(/^#/, "")),
		};
	}

	private assignUncheckedTasksToDerivatives(
		tasks: ReviewTask[],
		derivatives: DerivativeNotePlan[],
	): Map<number, string[]> {
		const assignments = new Map<number, string[]>();
		if (derivatives.length === 0) {
			return assignments;
		}

		const openTasks = tasks.filter((task) => !task.checked);
		for (const task of openTasks) {
			const targetIndex = this.findBestDerivativeForTask(task.text, derivatives);
			const existing = assignments.get(targetIndex) ?? [];
			existing.push(task.text);
			assignments.set(targetIndex, existing);
		}

		return assignments;
	}

	private findBestDerivativeForTask(taskText: string, derivatives: DerivativeNotePlan[]): number {
		const normalizedTask = taskText.toLowerCase();
		let bestIndex = 0;
		let bestScore = -1;

		for (const [index, derivative] of derivatives.entries()) {
			const haystack = [
				derivative.title,
				derivative.category,
				derivative.folder,
				derivative.summaryMarkdown,
				...derivative.relatedPrograms,
				...derivative.relatedOrganizations,
				...derivative.relatedPeople,
				...derivative.tags,
			]
				.join(" ")
				.toLowerCase();

			let score = 0;
			for (const token of normalizedTask.split(/[^a-z0-9]+/).filter((token) => token.length > 2)) {
				if (haystack.includes(token)) {
					score += 1;
				}
			}

			if (score > bestScore) {
				bestScore = score;
				bestIndex = index;
			}
		}

		return bestIndex;
	}

	private async ensureCategory(categoryName: string): Promise<ResolvedCategory> {
		const existing = this.settings.categories.find(
			(category) => category.name.toLowerCase() === categoryName.toLowerCase(),
		);
		const category = existing ?? {
			name: categoryName,
			folderPath: this.sanitizeFileName(categoryName),
			description: "",
		};
		await this.ensureFolderExists(category.folderPath);
		return {
			...category,
			homePagePath: `${category.folderPath}/${this.sanitizeFileName(category.name)}.md`,
		};
	}

	private async ensureCategoryHomePage(category: ResolvedCategory): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(category.homePagePath);
		if (existing instanceof TFile) {
			return;
		}
		const content = [
			`# ${category.name}`,
			"",
			"## Purpose",
			"",
			category.description || "_Add category purpose._",
			"",
			"## Recent Notes",
			"",
			"## Related Topics",
			"",
		].join("\n");
		await this.app.vault.create(category.homePagePath, content);
	}

	private async ensureProgramHomePage(programName: string): Promise<string> {
		const programsRoot = this.resolveProgramsRoot();
		const folderPath = `${programsRoot}/${this.sanitizeFileName(programName)}`;
		await this.ensureFolderExists(folderPath);
		const homePath = `${folderPath}/${this.sanitizeFileName(programName)}.md`;
		const existing = this.app.vault.getAbstractFileByPath(homePath);
		if (!(existing instanceof TFile)) {
			const content = [
				`# ${programName}`,
				"",
				"## Purpose",
				"",
				"_Program home page._",
				"",
				"## Recent Notes",
				"",
				"## Related Topics",
				"",
			].join("\n");
			await this.app.vault.create(homePath, content);
		}
		return homePath;
	}

	private async resolveDerivativeFolder(plan: DerivativeNotePlan, category: ResolvedCategory): Promise<string> {
		if (plan.folder) {
			await this.ensureFolderExists(plan.folder);
			return plan.folder;
		}

		if (category.name.toLowerCase() === "programs" && plan.relatedPrograms.length > 0) {
			const folder = `${this.resolveProgramsRoot()}/${this.sanitizeFileName(plan.relatedPrograms[0])}`;
			await this.ensureFolderExists(folder);
			return folder;
		}

		await this.ensureFolderExists(category.folderPath);
		return category.folderPath;
	}

	private resolveProgramsRoot(): string {
		const configured = this.settings.categories.find((category) => category.name.toLowerCase() === "programs");
		return configured?.folderPath || "Programs";
	}

	private async archiveSourceNote(sourceFile: TFile): Promise<string> {
		if (typeof this.app.fileManager.trashFile === "function") {
			await this.app.fileManager.trashFile(sourceFile);
			return `Source note moved using Obsidian archive/trash behavior.`;
		}

		const archiveFolder = this.normalizeFolder(this.settings.archiveFolderPath);
		if (!archiveFolder) {
			throw new Error("Archive Folder Path is empty.");
		}
		await this.ensureFolderExists(archiveFolder);
		const archivePath = await this.getAvailableMarkdownPath(`${archiveFolder}/${this.sanitizeFileName(sourceFile.basename)}.md`);
		await this.app.fileManager.renameFile(sourceFile, archivePath);
		return `Source note archived to ${archivePath}.`;
	}

	private async completeActionPlan(planFile: TFile, completedActionPlanPath: string | null): Promise<string> {
		if (this.settings.archiveCompletedActionPlans) {
			if (typeof this.app.fileManager.trashFile === "function") {
				await this.app.fileManager.trashFile(planFile);
				return "Action plan archived using Obsidian archive/trash behavior.";
			}

			const archiveFolder = this.normalizeFolder(this.settings.archiveFolderPath);
			await this.ensureFolderExists(archiveFolder);
			const archivePath = await this.getAvailableMarkdownPath(`${archiveFolder}/${this.sanitizeFileName(planFile.basename)}.md`);
			await this.app.fileManager.renameFile(planFile, archivePath);
			return `Action plan archived to ${archivePath}.`;
		}

		if (!completedActionPlanPath) {
			throw new Error("Completed action plan path was not resolved.");
		}
		await this.ensureFolderExists(ACTION_PLANS_COMPLETED_FOLDER);
		await this.app.fileManager.renameFile(planFile, completedActionPlanPath);
		return `Action plan moved to ${completedActionPlanPath}.`;
	}

	private getRelatedMarkdownNotes(currentFile: TFile): SuggestedLink[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path !== currentFile.path)
			.filter((file) => !this.isActionPlanPath(file.path))
			.filter((file) => !this.isAIContextFile(file.path))
			.filter((file) => !this.isAcronymFile(file.path))
			.filter((file) => !this.isTrackerFile(file.path))
			.filter((file) => !this.isTemporaryOrTimestampArtifact(file))
			.map((file) => ({ title: file.basename, path: file.path }))
			.sort((a, b) => `${a.path}`.localeCompare(`${b.path}`));
	}

	private async loadAIContext(): Promise<string> {
		const folderPath = this.normalizeFolder(this.settings.aiContextFolderPath);
		const acronymPath = this.normalizeFilePath(this.settings.acronymListPath);
		const blocks: string[] = [];

		try {
			if (folderPath) {
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folder) {
					await this.ensureFolderExists(folderPath);
					await this.seedDefaultContextFiles(folderPath);
				}

				const contextFiles = this.app.vault
					.getMarkdownFiles()
					.filter((file) => file.path.startsWith(`${folderPath}/`))
					.sort((a, b) => a.path.localeCompare(b.path));

				for (const file of contextFiles) {
					const content = await this.app.vault.read(file);
					blocks.push(`File: ${file.path}\n${content.trim()}`);
				}
			} else {
				new Notice("Onote: AI Context Folder Path is empty. Proceeding without folder-based AI context.", 5000);
			}

			if (acronymPath) {
				const acronymFile = await this.getOrCreateMarkdownFile(acronymPath, ACRONYM_FILE_HEADER);
				const content = await this.app.vault.read(acronymFile);
				blocks.push(`File: ${acronymFile.path}\n${content.trim()}`);
			}
		} catch (error) {
			console.error("Onote AI context load failed", error);
			new Notice("Onote: could not load one or more AI context files. Proceeding with available context.", 6000);
		}

		return blocks.sort((a, b) => a.localeCompare(b)).join("\n\n");
	}

	private async seedDefaultContextFiles(folderPath: string): Promise<void> {
		const files = this.buildDefaultContextFiles();
		for (const file of files) {
			const fullPath = `${folderPath}/${file.path}`;
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (!existing) {
				await this.app.vault.create(fullPath, file.content);
			}
		}
	}

	private buildDefaultContextFiles(): DefaultContextFile[] {
		const glossaryLines = ["# Program Glossary", ""];
		for (const program of DEFAULT_PROGRAMS) {
			glossaryLines.push(`## ${program.name}`);
			glossaryLines.push(`Acronyms: ${program.acronyms.join(", ")}`);
			glossaryLines.push("Type: Program");
			glossaryLines.push("");
		}
		glossaryLines.push("Related: [[MEGALODON]]");

		return [
			{
				path: "Program Glossary.md",
				content: glossaryLines.join("\n"),
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
- If a program, acronym, organization, or entity appears in the raw note, summary, derivative note title, derivative note summary, or extracted items, include it in Related Programs or Related Organizations.
- Use canonical names from the Program Glossary.
- Treat acronyms and full names as equivalent.
- If ISG is mentioned, include ISG as a related organization/entity.

## Suggested Links
- Suggested links should be durable entity or concept notes.
- Prefer links to programs, organizations, people, teams, processes, roles, risks, and strategic themes.
- Do not suggest links to timestamped source notes, action-plan notes, tracker files, or temporary processing artifacts.
- Do not suggest links whose title begins with "#".

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

## Risks
- If a note contains an uncertain dependency, missing date, incomplete plan, or unresolved ownership issue, consider whether it belongs in Risks.
- Example: staffing plan coming but no real dates usually indicates risk.

## Strategy Recommendations
- Strategy recommendations are higher-level implications, organizational design ideas, program direction, recurring patterns, or possible future operating model changes.
- Preserve uncertainty when the raw note is uncertain.

## People / Coaching Notes
- Only create people/coaching notes when the note refers to a specific person's performance, behavior, development, role fit, or coaching need.
- Do not create generic coaching notes about communication unless tied to a specific person.
`,
			},
		];
	}

	private async registerAcronymsFromNote(sourceFile: TFile, noteContent: string): Promise<void> {
		const acronymPath = this.normalizeFilePath(this.settings.acronymListPath);
		if (!acronymPath) {
			return;
		}

		const definitions = this.parseAcronymDefinitions(noteContent);
		const acronymFile = await this.getOrCreateMarkdownFile(acronymPath, ACRONYM_FILE_HEADER);
		if (definitions.length === 0) {
			return;
		}

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
				newRows.push(`| ${definition.acronym} | ${definition.fullName} | ${firstSeen} | [[${sourceLink}]] |`);
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

		const sections: string[] = [existingContent.trimEnd() || ACRONYM_FILE_HEADER.trimEnd()];
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
		const results: Array<{ acronym: string; fullName: string }> = [];
		const seen = new Set<string>();
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
		for (const line of content.split("\n")) {
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
							"You turn raw timestamped source notes into editable action plans and derivative-note plans. AI context files are authoritative for classification rules. Program configuration is authoritative for program names and program acronyms. Return only valid JSON.",
					},
					{
						role: "user",
						content: this.buildPrompt(file, noteContent, relatedNotes, aiContext),
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

		return this.normalizeActionPlan(this.parseJson(content));
	}

	private buildPrompt(file: TFile, noteContent: string, relatedNotes: SuggestedLink[], aiContext: string): string {
		const configuredPrograms = this.settings.programs
			.map((program) => `${program.name}${program.acronyms.length > 0 ? ` (${program.acronyms.join(", ")})` : ""}`)
			.join(", ");
		const configuredCategories = this.settings.categories
			.map((category) => `${category.name}: ${category.folderPath} - ${category.description}`)
			.join("\n");
		const linkCandidates =
			relatedNotes.length > 0
				? relatedNotes
						.slice(0, 200)
						.map((note) => `${note.title}${note.path ? ` (${note.path})` : ""}`)
						.join(", ")
				: "None provided";

		return [
			`You are processing an Obsidian source note titled "${file.basename}".`,
			"",
			"Return exactly one JSON object with this shape:",
			"{",
			'  "summary": "string",',
			'  "action_items": ["string"],',
			'  "delegations": ["string"],',
			'  "risks": ["string"],',
			'  "decisions": ["string"],',
			'  "strategy_recommendations": ["string"],',
			'  "people_coaching_notes": ["string"],',
			'  "suggested_links": [{"title": "string", "path": "optional string"}],',
			'  "derivative_notes": [',
			"    {",
			'      "title": "string",',
			'      "category": "string",',
			'      "folder": "string",',
			'      "related_programs": ["string"],',
			'      "related_organizations": ["string"],',
			'      "related_people": ["string"],',
			'      "summary_markdown": "string",',
			'      "tags": ["string"]',
			"    }",
			"  ]",
			"}",
			"",
			"Rules:",
			"- Return valid JSON only, with no markdown fences or prose outside the JSON object.",
			"- Use empty strings or arrays when information is missing.",
			"- Keep each array item concise and specific.",
			"- Source notes are timestamped notes, not daily notes.",
			"- Action plans are review/edit gates before execution.",
			"- Programs configuration is authoritative for program names and acronyms.",
			"- Acronyms.md is authoritative for acronym expansion unless it records a conflict.",
			"- In derivative note summaries, spell out each acronym on first use followed by the acronym in parentheses. After first use, use the acronym.",
			"- Prefer derivative note summary_markdown in a scannable bulleted format rather than narrative prose.",
			"- Use short bullets, subheadings, and task bullets when helpful for fast reading.",
			"- Preserve known acronyms exactly and do not split acronyms into words.",
			"- PMO must never become PM O.",
			"- PIPE must remain PIPE and must not be rewritten as pipeline.",
			"- Suggested_links must be valid Obsidian wiki links in the form [[Note Name]].",
			"- Do not suggest links to AI context files, Acronyms.md, tracker files, action plans, timestamped source notes, or temporary processing artifacts.",
			"- Suggested links should be durable topic/entity notes.",
			"- Render recommended action items as native Obsidian Markdown tasks in the action plan.",
			"- Do not create a copied task tracker. Tasks should live in the contextual notes where they belong.",
			"- Keep derivative note summary_markdown focused on scannable summary bullets, not duplicated task lists.",
			"- Onote will attach contextual unchecked action items to derivative notes separately, so do not repeat those tasks in summary_markdown.",
			"- Only list a decision if the note clearly indicates that a choice has already been made.",
			"- Do not convert actions, questions, ideas, tentative thoughts, coaching topics, reminders, or follow-ups into decisions.",
			"- Preserve uncertainty. Words like maybe, probably, might, need to think, not sure, and still thinking are not firm conclusions.",
			"- Delegations are only items explicitly assigned by the user to another person.",
			"- People/coaching notes only apply to a specific person's performance, behavior, development, role fit, or coaching need.",
			"- If the note contains an uncertain dependency, missing date, incomplete plan, or unresolved ownership issue, consider whether it belongs in risks.",
			'- Example: "staffing plan coming but no real dates" usually indicates a risk.',
			"- Create one derivative note per relevant category/topic rather than one final output note.",
			"- Use configured categories for routing and propose a concrete folder for each derivative note. Never leave derivative notes at the vault root.",
			"- For program derivative notes, prefer Programs/<Program Name>/ as the folder using the strongest related program.",
			"",
			"Configured Programs:",
			configuredPrograms || "None configured",
			"",
			"Configured Categories:",
			configuredCategories || "None configured",
			"",
			"Existing durable note candidates:",
			linkCandidates,
			"",
			"AI Context:",
			aiContext || "(none)",
			"",
			"Raw source note:",
			noteContent,
		].join("\n");
	}

	private parseJson(content: string): unknown {
		const trimmed = content.trim();
		const sanitized = trimmed.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
		return JSON.parse(sanitized);
	}

	private normalizeActionPlan(raw: unknown): ActionPlan {
		const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
		return {
			summary: this.asString(data.summary),
			actionItems: this.asUniqueStringArray(data.action_items),
			delegations: this.asUniqueStringArray(data.delegations),
			risks: this.asUniqueStringArray(data.risks),
			decisions: this.asUniqueStringArray(data.decisions),
			strategyRecommendations: this.asUniqueStringArray(data.strategy_recommendations),
			peopleCoachingNotes: this.asUniqueStringArray(data.people_coaching_notes),
			suggestedLinks: this.asSuggestedLinks(data.suggested_links),
			derivativeNotes: this.asDerivativeNotes(data.derivative_notes),
		};
	}

	private asDerivativeNotes(value: unknown): DerivativeNotePlan[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map((item) => {
				if (typeof item !== "object" || item === null) {
					return null;
				}
				const record = item as Record<string, unknown>;
				const title = this.asString(record.title);
				const category = this.asString(record.category);
				const folder = this.asString(record.folder);
				const summaryMarkdown = this.asString(record.summary_markdown);
				if (!title || !category) {
					return null;
				}
				return this.normalizeDerivativeNotePlan({
					title,
					category,
					folder,
					relatedPrograms: this.asStringArray(record.related_programs),
					relatedOrganizations: this.asStringArray(record.related_organizations),
					relatedPeople: this.asStringArray(record.related_people),
					summaryMarkdown,
					tags: this.asStringArray(record.tags),
				});
			})
			.filter((item): item is DerivativeNotePlan => item !== null);
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

	private asUniqueStringArray(value: unknown): string[] {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const item of this.asStringArray(value)) {
			const key = item.toLowerCase();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			result.push(item);
		}
		return result;
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
		await this.ensureFolderExists(ACTION_PLANS_FOLDER);
		const timestampPrefix = this.getSourceTimestampPrefix(sourceFile);
		const baseTitle = `${timestampPrefix} - ${this.stripTimestampPrefix(sourceFile.basename)} - Action Plan`;
		const planPath = await this.getAvailableMarkdownPath(`${ACTION_PLANS_FOLDER}/${this.sanitizeFileName(baseTitle)}.md`);
		const content = this.buildActionPlanNoteContent(sourceFile, actionPlan);
		return this.app.vault.create(planPath, content);
	}

	private buildActionPlanNoteContent(sourceFile: TFile, actionPlan: ActionPlan): string {
		const timestamp = new Date().toISOString();
		return [
			"---",
			'onote_type: "action_plan"',
			`source_note_path: "${this.escapeYamlString(sourceFile.path)}"`,
			`generated_at: "${this.escapeYamlString(timestamp)}"`,
			"---",
			"",
			`# AI Action Plan: ${sourceFile.basename}`,
			"",
			"Review and edit this action plan, then run `Execute Current Action Plan` while it is open.",
			"",
			"## Commands",
			"",
			"```meta-bind-button",
			this.buildMetaBindButton("Execute Current Action Plan", EXECUTE_ACTION_PLAN_COMMAND),
			"```",
			"",
			this.formatTextSection("Summary", actionPlan.summary || "_No summary generated._"),
			this.formatTaskSection("Recommended Action Items", actionPlan.actionItems),
			this.formatListSection("Delegations", actionPlan.delegations),
			this.formatListSection("Risks", actionPlan.risks),
			this.formatListSection("Decisions", actionPlan.decisions),
			this.formatListSection("Strategy Recommendations", actionPlan.strategyRecommendations),
			this.formatListSection("People / Coaching Notes", actionPlan.peopleCoachingNotes),
			this.formatListSection(
				"Suggested Links",
				actionPlan.suggestedLinks.map((link) => this.formatSuggestedLink(link)).filter(Boolean),
			),
			"## Proposed Derivative Notes",
			"",
			"Edit the derivative note plans below. Execution will parse these blocks and create one derivative note per entry.",
			"",
			REVISED_NOTE_START,
			...this.formatDerivativeNoteBlocks(actionPlan.derivativeNotes),
			REVISED_NOTE_END,
			"",
		].join("\n");
	}

	private formatDerivativeNoteBlocks(derivativeNotes: DerivativeNotePlan[]): string[] {
		if (derivativeNotes.length === 0) {
			return [
				"### Derivative Note 1",
				"Title: Untitled Derivative",
				"Category: Scratchpad",
				"Folder: Scratchpad",
				"Related Programs: ",
				"Related Organizations: ",
				"Related People: ",
				"Tags: ",
				"Summary:",
				"_Add derivative note summary markdown here._",
			];
		}

		return derivativeNotes.flatMap((note, index) => [
			`### Derivative Note ${index + 1}`,
			`Title: ${note.title}`,
			`Category: ${note.category}`,
			`Folder: ${note.folder || this.resolveDefaultFolderForDerivative(note)}`,
			`Related Programs: ${note.relatedPrograms.map((item) => this.renderDurableEntityLink(item)).join(", ")}`,
			`Related Organizations: ${note.relatedOrganizations.map((item) => this.renderDurableEntityLink(item)).join(", ")}`,
			`Related People: ${note.relatedPeople.map((item) => this.renderDurableEntityLink(item)).join(", ")}`,
			`Tags: ${note.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(", ")}`,
			"Summary:",
			note.summaryMarkdown || "_Add derivative note summary markdown here._",
			"",
		]);
	}

	private parseActionPlanNote(content: string): ParsedActionPlanNote {
		const sourceNotePath = this.readFrontmatterValue(content, "source_note_path");
		const derivativeBlock = this.extractBetween(content, REVISED_NOTE_START, REVISED_NOTE_END).trim();
		const contentBeforeDerivatives = content.split(REVISED_NOTE_START)[0];
		return {
			sourceNotePath,
			summary: this.extractSectionText(contentBeforeDerivatives, "Summary"),
			actionItems: this.extractSectionTasks(contentBeforeDerivatives, "Recommended Action Items"),
			delegations: this.extractSectionList(contentBeforeDerivatives, "Delegations"),
			risks: this.extractSectionList(contentBeforeDerivatives, "Risks"),
			decisions: this.extractSectionList(contentBeforeDerivatives, "Decisions"),
			strategyRecommendations: this.extractSectionList(contentBeforeDerivatives, "Strategy Recommendations"),
			peopleCoachingNotes: this.extractSectionList(contentBeforeDerivatives, "People / Coaching Notes"),
			suggestedLinks: this.extractSectionList(contentBeforeDerivatives, "Suggested Links"),
			derivativeNotes: this.parseDerivativeNotesBlock(derivativeBlock),
		};
	}

	private parseDerivativeNotesBlock(block: string): DerivativeNotePlan[] {
		if (!block) {
			return [];
		}

		return block
			.split(/^### Derivative Note \d+\s*$/m)
			.map((chunk) => chunk.trim())
			.filter(Boolean)
			.map((chunk) => this.parseSingleDerivativeBlock(chunk))
			.filter((item): item is DerivativeNotePlan => item !== null);
	}

	private parseSingleDerivativeBlock(chunk: string): DerivativeNotePlan | null {
		const lines = chunk.split("\n");
		const getField = (name: string): string => {
			const line = lines.find((entry) => entry.startsWith(`${name}:`));
			return line ? line.slice(name.length + 1).trim() : "";
		};
		const summaryIndex = lines.findIndex((entry) => entry.trim() === "Summary:");
		const summaryMarkdown =
			summaryIndex >= 0 ? lines.slice(summaryIndex + 1).join("\n").trim() : "";
		const title = getField("Title");
		const category = getField("Category");
		if (!title || !category) {
			return null;
		}
		return this.normalizeDerivativeNotePlan({
			title,
			category,
			folder: getField("Folder"),
			relatedPrograms: this.parseCommaSeparatedField(getField("Related Programs")),
			relatedOrganizations: this.parseCommaSeparatedField(getField("Related Organizations")),
			relatedPeople: this.parseCommaSeparatedField(getField("Related People")),
			summaryMarkdown,
			tags: this.parseCommaSeparatedField(getField("Tags")).map((tag) => tag.replace(/^#/, "")),
		});
	}

	private parseCommaSeparatedField(value: string): string[] {
		return value
			.split(",")
			.map((entry) => this.extractWikiLinkTitle(entry.trim()))
			.map((entry) => entry.replace(/^#/, "").trim())
			.filter(Boolean);
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

	private extractSectionTasks(content: string, title: string): ReviewTask[] {
		const body = this.extractSectionBody(content, title);
		return body
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => /^\-\s\[[ xX]\]\s+/.test(line))
			.map((line) => {
				const checked = /^\-\s\[[xX]\]\s+/.test(line);
				const text = line.replace(/^\-\s\[[ xX]\]\s+/, "").trim();
				return text ? { text, checked } : null;
			})
			.filter((item): item is ReviewTask => item !== null);
	}

	private extractSectionBody(content: string, title: string): string {
		const pattern = new RegExp(`## ${this.escapeRegex(title)}\\n([\\s\\S]*?)(?=\\n## |\\n${this.escapeRegex(REVISED_NOTE_START)}|$)`);
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

	private buildDerivativeNoteContent(
		plan: DerivativeNotePlan,
		sourceFile: TFile,
		actionPlanPath: string,
		actionItems: string[],
	): string {
		const createdAt = new Date().toISOString();
		const sourceLink = `[[${this.app.metadataCache.fileToLinktext(sourceFile, "", true)}]]`;
		const actionPlanLink = `[[${this.linkTextForPath(actionPlanPath)}]]`;
		const uniqueActionItems = this.dedupeTasksAgainstSummary(actionItems, plan.summaryMarkdown);
		return [
			"---",
			'onote_type: derivative_note',
			`category: "${this.escapeYamlString(plan.category)}"`,
			`source_note_path: "${this.escapeYamlString(sourceFile.path)}"`,
			`action_plan_path: "${this.escapeYamlString(actionPlanPath)}"`,
			`created_at: "${createdAt}"`,
			this.yamlArray("programs", plan.relatedPrograms),
			this.yamlArray("organizations", plan.relatedOrganizations),
			this.yamlArray("people", plan.relatedPeople),
			this.yamlArray("tags", plan.tags.map((tag) => `#${tag.replace(/^#/, "")}`)),
			"---",
			"",
			`# ${plan.title}`,
			"",
			"## Commands",
			"",
			"```meta-bind-button",
			this.buildMetaBindButton("Process Current Note with AI", PROCESS_CURRENT_NOTE_COMMAND),
			"```",
			"",
			plan.summaryMarkdown || "_No derivative summary provided._",
			...(uniqueActionItems.length > 0 ? ["", this.formatTaskSection("Action Items", uniqueActionItems)] : []),
			"",
			this.formatListSection("Related Programs", plan.relatedPrograms.map((item) => this.renderDurableEntityLink(item))),
			this.formatListSection("Related Organizations", plan.relatedOrganizations.map((item) => this.renderDurableEntityLink(item))),
			this.formatListSection("Related People", plan.relatedPeople.map((item) => this.renderDurableEntityLink(item))),
			this.formatListSection("Tags", plan.tags.map((tag) => `#${tag.replace(/^#/, "")}`)),
			"## Source Links",
			"",
			`- Source Note: ${sourceLink}`,
			`- Action Plan: ${actionPlanLink}`,
			"",
		].join("\n");
	}

	private yamlArray(key: string, values: string[]): string {
		if (values.length === 0) {
			return `${key}: []`;
		}
		return [`${key}:`, ...values.map((value) => `  - "${this.escapeYamlString(value)}"`)].join("\n");
	}

	private dedupeTasksAgainstSummary(actionItems: string[], summaryMarkdown: string): string[] {
		const normalizedSummary = this.normalizeTaskText(summaryMarkdown);
		const seen = new Set<string>();
		const result: string[] = [];

		for (const item of actionItems) {
			const normalizedItem = this.normalizeTaskText(item);
			if (!normalizedItem) {
				continue;
			}
			if (seen.has(normalizedItem)) {
				continue;
			}
			if (normalizedSummary.includes(normalizedItem)) {
				continue;
			}
			seen.add(normalizedItem);
			result.push(item);
		}

		return result;
	}

	private normalizeTaskText(value: string): string {
		return value
			.toLowerCase()
			.replace(/^\-\s\[[ xX]\]\s+/, "")
			.replace(/[^\p{L}\p{N}\s📅-]/gu, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	private async appendItemsToTracker(trackerPath: string, title: string, sourceFile: TFile, items: string[]): Promise<void> {
		const normalizedPath = this.normalizeFilePath(trackerPath);
		if (!normalizedPath || items.length === 0) {
			return;
		}
		const trackerFile = await this.getOrCreateMarkdownFile(normalizedPath, `# ${title}\n`);
		const sourceLink = this.app.metadataCache.fileToLinktext(sourceFile, normalizedPath, true);
		const block = ["", `[[${sourceLink}]]`, "", ...items.map((item) => `- ${item}`), ""].join("\n");
		await this.app.vault.append(trackerFile, block);
	}

	private async markOpenActionPlanTasksComplete(planFile: TFile): Promise<void> {
		const content = await this.app.vault.read(planFile);
		const updated = content.replace(/^- \[ \] /gm, "- [x] ");
		if (updated !== content) {
			await this.app.vault.modify(planFile, updated);
		}
	}

	private async appendLinkUnderSection(filePath: string, sectionTitle: string, link: string): Promise<void> {
		const file = await this.getOrCreateMarkdownFile(filePath, `# ${this.stripFileExtension(this.basenameFromPath(filePath))}\n`);
		const content = await this.app.vault.read(file);
		if (content.includes(link)) {
			return;
		}

		const pattern = new RegExp(`## ${this.escapeRegex(sectionTitle)}\\n`);
		if (!pattern.test(content)) {
			const updated = `${content.trimEnd()}\n\n## ${sectionTitle}\n\n- ${link}\n`;
			await this.app.vault.modify(file, updated);
			return;
		}

		const updated = content.replace(pattern, `## ${sectionTitle}\n\n- ${link}\n`);
		if (updated !== content) {
			await this.app.vault.modify(file, updated);
		}
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

	private async ensureOpenTasksDashboard(): Promise<void> {
		const dashboardPath = this.normalizeFilePath(this.settings.followUpTrackerPath);
		if (!dashboardPath) {
			return;
		}

		const existing = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (existing instanceof TFile) {
			return;
		}

		await this.getOrCreateMarkdownFile(dashboardPath, OPEN_TASKS_DASHBOARD_CONTENT);
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

	private formatTextSection(title: string, text: string): string {
		return `## ${title}\n\n${text || "_None_"}`;
	}

	private formatListSection(title: string, items: string[]): string {
		const body = items.length > 0 ? items.filter(Boolean).map((item) => `- ${item}`).join("\n") : "- None";
		return `## ${title}\n\n${body}`;
	}

	private formatTaskSection(title: string, items: string[]): string {
		const body = items.length > 0 ? items.filter(Boolean).map((item) => `- [ ] ${item}`).join("\n") : "- [ ] _No action items yet_";
		return `## ${title}\n\n${body}`;
	}

	private buildMetaBindButton(label: string, commandId: string): string {
		return [`label: ${label}`, "style: primary", "action:", "  type: command", `  command: ${commandId}`].join("\n");
	}

	private formatSuggestedLink(link: SuggestedLink): string {
		if (!link.title || link.title.startsWith("#") || this.isSuggestedLinkArtifact(link)) {
			return "";
		}
		if (this.isWikiLink(link.title)) {
			return this.isSuggestedLinkArtifact({ title: this.extractWikiLinkTitle(link.title), path: link.path }) ? "" : link.title;
		}

		const resolvedPath = link.path?.trim();
		if (resolvedPath) {
			const maybeFile = this.app.vault.getAbstractFileByPath(resolvedPath);
			if (maybeFile instanceof TFile && !this.isTemporaryOrTimestampArtifact(maybeFile) && !this.isAIContextFile(maybeFile.path)) {
				return `[[${this.app.metadataCache.fileToLinktext(maybeFile, "", true)}]]`;
			}
		}

		return this.renderDurableEntityLink(link.title);
	}

	private isSuggestedLinkArtifact(link: SuggestedLink): boolean {
		const title = this.extractWikiLinkTitle(link.title).toLowerCase();
		const path = link.path?.toLowerCase() ?? "";
		if (title.startsWith("#")) {
			return true;
		}
		if (this.isAIContextFile(path) || this.isAcronymFile(path) || this.isTrackerFile(path) || this.isActionPlanPath(path)) {
			return true;
		}
		return ["timestamped note", "source note", "action plan", "follow-up", "delegation", "strategy theme", "people - coaching", "scratch", "temp", "draft", "acronyms"].some(
			(marker) => title.includes(marker) || path.includes(marker),
		);
	}

	private renderDurableEntityLink(value: string): string {
		const trimmed = this.extractWikiLinkTitle(value.trim());
		if (!trimmed || trimmed.startsWith("#")) {
			return "";
		}
		if (this.isWikiLink(value.trim())) {
			return value.trim();
		}
		const match = this.app.metadataCache.getFirstLinkpathDest(trimmed, "");
		if (match && !this.isTemporaryOrTimestampArtifact(match) && !this.isAIContextFile(match.path)) {
			return `[[${this.app.metadataCache.fileToLinktext(match, "", true)}]]`;
		}
		return `[[${trimmed}]]`;
	}

	private normalizeProgramList(values: string[]): string[] {
		const map = this.buildProgramLookup();
		return this.asStringArray(values)
			.map((value) => this.extractWikiLinkTitle(value))
			.map((value) => map.get(value.toLowerCase()) ?? value)
			.filter(Boolean)
			.filter((value, index, array) => array.indexOf(value) === index);
	}

	private buildProgramLookup(): Map<string, string> {
		const lookup = new Map<string, string>();
		for (const program of this.settings.programs) {
			lookup.set(program.name.toLowerCase(), program.name);
			for (const acronym of program.acronyms) {
				lookup.set(acronym.toLowerCase(), program.name);
			}
		}
		return lookup;
	}

	private normalizeCategoryName(value: string): string {
		const trimmed = this.asString(value);
		const configured = this.settings.categories.find((category) => category.name.toLowerCase() === trimmed.toLowerCase());
		return configured?.name || trimmed || "Scratchpad";
	}

	private resolveDefaultFolderForDerivative(note: DerivativeNotePlan): string {
		const category = this.settings.categories.find((entry) => entry.name.toLowerCase() === note.category.toLowerCase());
		if (note.category.toLowerCase() === "programs" && note.relatedPrograms.length > 0) {
			return `${this.resolveProgramsRoot()}/${this.sanitizeFileName(note.relatedPrograms[0])}`;
		}
		return category?.folderPath || this.sanitizeFileName(note.category);
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
		return !!normalizedPath && !!contextFolder && normalizedPath.startsWith(`${contextFolder}/`);
	}

	private isAcronymFile(path: string): boolean {
		return this.normalizeFilePath(path).toLowerCase() === this.normalizeFilePath(this.settings.acronymListPath).toLowerCase();
	}

	private isTrackerFile(path: string): boolean {
		const normalized = this.normalizeFilePath(path).toLowerCase();
		return [
			this.settings.followUpTrackerPath,
			this.settings.delegationTrackerPath,
			this.settings.strategyTrackerPath,
			this.settings.peopleCoachingTrackerPath,
		]
			.map((entry) => this.normalizeFilePath(entry).toLowerCase())
			.includes(normalized);
	}

	private isTemporaryOrTimestampArtifact(file: TAbstractFile): boolean {
		const path = file.path.toLowerCase();
		const basename = file.name.replace(/\.md$/i, "");
		if (this.looksTimestampedName(basename)) {
			return true;
		}
		return ["action plan", "follow-up", "delegation", "strategy theme", "people - coaching", "scratch", "temp", "draft"].some(
			(marker) => path.includes(marker),
		);
	}

	private looksTimestampedName(name: string): boolean {
		return /^\d{4}-\d{2}-\d{2} \d{4} /.test(name);
	}

	private getSourceTimestampPrefix(sourceFile: TFile): string {
		const match = sourceFile.basename.match(/^(\d{4}-\d{2}-\d{2} \d{4})/);
		return match?.[1] || window.moment().format("YYYY-MM-DD HHmm");
	}

	private stripTimestampPrefix(name: string): string {
		return name.replace(/^\d{4}-\d{2}-\d{2} \d{4}\s*-\s*/, "").trim();
	}

	private ensureTimestampedTitle(timestampPrefix: string, title: string): string {
		const cleanTitle = this.sanitizeFileName(title);
		return cleanTitle.startsWith(timestampPrefix) ? cleanTitle : `${timestampPrefix} - ${cleanTitle}`;
	}

	private sanitizeFileName(name: string): string {
		return name.trim().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
	}

	private basenameFromPath(path: string): string {
		return path.split("/").pop() ?? path;
	}

	private stripFileExtension(name: string): string {
		return name.replace(/\.md$/i, "");
	}

	private linkTextForPath(path: string): string {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return this.app.metadataCache.fileToLinktext(file, "", true);
		}
		return this.stripFileExtension(this.basenameFromPath(path));
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
			.setDesc("Used to generate action plans and derivative notes from the current source note.")
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
					.setPlaceholder(DEFAULT_SETTINGS.model)
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
						await this.plugin.saveSettings();
					}),
			);

		this.addPathSetting(containerEl, "Open Tasks dashboard path", "followUpTrackerPath");
		this.addPathSetting(containerEl, "Delegation tracker path", "delegationTrackerPath");
		this.addPathSetting(containerEl, "Strategy tracker path", "strategyTrackerPath");
		this.addPathSetting(containerEl, "People / coaching tracker path", "peopleCoachingTrackerPath");
		this.addPathSetting(containerEl, "Acronym List Path", "acronymListPath");
		this.addPathSetting(containerEl, "AI Context Folder Path", "aiContextFolderPath");
		this.addPathSetting(containerEl, "Archive Folder Path", "archiveFolderPath");

		new Setting(containerEl)
			.setName("Archive completed action plans")
			.setDesc("If enabled, completed action plans use Obsidian archive/trash behavior instead of moving to Action Plans/Completed.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.archiveCompletedActionPlans).onChange(async (value) => {
					this.plugin.settings.archiveCompletedActionPlans = value;
					await this.plugin.saveSettings();
				}),
			);

		this.addJsonSetting(containerEl, "Programs", "Authoritative program names and acronyms used for routing and prompt injection.", "programs");
		this.addJsonSetting(containerEl, "Categories", "Configurable note categories used for derivative note routing and home page generation.", "categories");
	}

	private addPathSetting(containerEl: HTMLElement, label: string, key: keyof Pick<
		OnoteSettings,
		| "followUpTrackerPath"
		| "delegationTrackerPath"
		| "strategyTrackerPath"
		| "peopleCoachingTrackerPath"
		| "acronymListPath"
		| "aiContextFolderPath"
		| "archiveFolderPath"
	>): void {
		new Setting(containerEl)
			.setName(label)
			.setDesc("Vault-relative path. Missing folders/files are created when needed.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS[key] as string)
					.setValue(this.plugin.settings[key] as string)
					.onChange(async (value) => {
						this.plugin.settings[key] = value.trim() || (DEFAULT_SETTINGS[key] as string);
						await this.plugin.saveSettings();
					}),
			);
	}

	private addJsonSetting(containerEl: HTMLElement, label: string, description: string, key: "programs" | "categories"): void {
		new Setting(containerEl)
			.setName(label)
			.setDesc(description)
			.addTextArea((text) => {
				text.inputEl.rows = 12;
				text.setValue(JSON.stringify(this.plugin.settings[key], null, 2));
				text.onChange(async (value) => {
					try {
						const parsed = JSON.parse(value);
						if (key === "programs") {
							this.plugin.settings.programs = this.plugin["normalizePrograms"](parsed);
						} else {
							this.plugin.settings.categories = this.plugin["normalizeCategories"](parsed);
						}
						await this.plugin.saveSettings();
					} catch {
						new Notice(`Onote: invalid JSON in ${label} setting. Changes not saved.`, 5000);
					}
				});
				return text;
			});
	}
}
