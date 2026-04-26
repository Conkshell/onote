const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

class TAbstractFile {
  constructor(filePath) {
    this.path = filePath;
    this.name = path.posix.basename(filePath);
    this.parent = (() => {
      const dir = path.posix.dirname(filePath);
      return dir && dir !== "." ? { path: dir } : null;
    })();
  }
}

class TFile extends TAbstractFile {
  constructor(filePath, content = "") {
    super(filePath);
    this.extension = "md";
    this.basename = this.name.replace(/\.md$/i, "");
    this.content = content;
  }
}

class Notice {
  constructor(message) {
    Notice.messages.push(message);
  }
}
Notice.messages = [];

class Plugin {}
class PluginSettingTab {}
class Setting {
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText(callback) {
    callback({
      inputEl: {},
      setPlaceholder() {
        return this;
      },
      setValue() {
        return this;
      },
      onChange() {
        return this;
      },
    });
    return this;
  }
  addTextArea(callback) {
    callback({
      inputEl: {},
      setValue() {
        return this;
      },
      onChange() {
        return this;
      },
    });
    return this;
  }
  addToggle(callback) {
    callback({
      setValue() {
        return this;
      },
      onChange() {
        return this;
      },
    });
    return this;
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return {
      App: class {},
      Notice,
      Plugin,
      PluginSettingTab,
      Setting,
      TAbstractFile,
      TFile,
      requestUrl: async () => {
        throw new Error("requestUrl not available in smoke test");
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

global.window = {
  moment: () => ({
    format(fmt) {
      if (fmt === "YYYY-MM-DD HHmm") return "2026-04-26 1254";
      if (fmt === "YYYY-MM-DD") return "2026-04-26";
      return "2026-04-26 1254";
    },
  }),
};

const OnotePlugin = require("../main.js").default;
const EXPECTED_OPEN_TASKS_DASHBOARD = `# Open Tasks

All unresolved tasks across the vault.

## All Open Tasks

\`\`\`tasks
not done
path does not include Action Plans/Completed
sort by due
group by path
\`\`\`
`;

function createVaultHarness() {
  const files = new Map();
  const folders = new Set();
  let lastOpened = null;
  let activeFile = null;

  function ensureFolder(folderPath) {
    if (!folderPath || folderPath === ".") return;
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  }

  function createFile(filePath, content) {
    ensureFolder(path.posix.dirname(filePath));
    const file = new TFile(filePath, content);
    files.set(filePath, file);
    return file;
  }

  const vault = {
    getAbstractFileByPath(filePath) {
      if (files.has(filePath)) return files.get(filePath);
      if (folders.has(filePath)) return new TAbstractFile(filePath);
      return null;
    },
    getMarkdownFiles() {
      return [...files.values()].filter((file) => file.extension === "md");
    },
    async read(file) {
      return file.content;
    },
    async create(filePath, content) {
      return createFile(filePath, content);
    },
    async modify(file, content) {
      file.content = content;
      files.set(file.path, file);
    },
    async append(file, content) {
      file.content += content;
      files.set(file.path, file);
    },
    async createFolder(folderPath) {
      ensureFolder(folderPath);
    },
  };

  const fileManager = {
    async renameFile(file, newPath) {
      files.delete(file.path);
      ensureFolder(path.posix.dirname(newPath));
      file.path = newPath;
      file.name = path.posix.basename(newPath);
      file.basename = file.name.replace(/\.md$/i, "");
      file.parent = (() => {
        const dir = path.posix.dirname(newPath);
        return dir && dir !== "." ? { path: dir } : null;
      })();
      files.set(newPath, file);
    },
    async trashFile(file) {
      files.delete(file.path);
    },
  };

  const metadataCache = {
    fileToLinktext(file) {
      return file.basename;
    },
    getFirstLinkpathDest(target) {
      return [...files.values()].find(
        (file) =>
          file.basename.toLowerCase() === target.toLowerCase() ||
          file.path.toLowerCase() === target.toLowerCase() ||
          file.name.toLowerCase() === target.toLowerCase(),
      );
    },
  };

  const workspace = {
    getActiveFile() {
      return activeFile;
    },
    getLeaf() {
      return {
        async openFile(file) {
          lastOpened = file;
        },
      };
    },
  };

  return {
    app: { vault, fileManager, metadataCache, workspace },
    files,
    folders,
    createFile,
    setActiveFile(file) {
      activeFile = file;
    },
    getLastOpened() {
      return lastOpened;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const harness = createVaultHarness();
  const plugin = new OnotePlugin();
  plugin.app = harness.app;
  plugin.settings = {
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
    programs: [
      { name: "MEGALODON", acronyms: ["MEG"], folderPath: "Programs/MEGALODON", dashboardEnabled: true },
      { name: "Object Based Orchestration", acronyms: ["OBO"], folderPath: "Programs/Object Based Orchestration", dashboardEnabled: true },
    ],
    categories: [
      { name: "Programs", folderPath: "Programs", description: "" },
      { name: "Leadership", folderPath: "Leadership", description: "" },
      { name: "Strategy", folderPath: "Strategy", description: "" },
      { name: "People", folderPath: "People", description: "" },
    ],
  };

  await plugin.ensureOpenTasksDashboard();

  assert(
    plugin.normalizeFilePath("../Unsafe:Folder\\Nested/./../Note?.md") === "Unsafe Folder/Nested/Note .md",
    "Vault path normalization did not remove unsafe path segments and characters",
  );

  const seededContextFiles = plugin.buildDefaultContextFiles();
  assert(
    seededContextFiles[0].content.includes("## Object Based Orchestration") &&
      !seededContextFiles[0].content.includes("## STARSKIPPER"),
    "Default AI context did not use configured programs",
  );

  const dashboard = harness.files.get("Action Plans/Open Tasks.md");
  assert(dashboard, "Open Tasks dashboard was not created");
  assert(dashboard.content.includes("```tasks"), "Open Tasks dashboard is missing Tasks query");

  const sampleNote = fs.readFileSync(path.join(__dirname, "..", "test-data", "sample-source-note.md"), "utf8");
  const sourceFile = harness.createFile(
    "Inbox/2026-04-26 1254 - Mixed Topics.md",
    sampleNote,
  );
  const persistentSource = harness.createFile(
    "Inbox/2026-04-26 1300 - Persistent Source.md",
    "# Persistent Source\n\nWorking note.\n",
  );
  await plugin.ensureSourceNoteId(persistentSource, persistentSource.content);

  const expandedPlan = plugin.ensureDerivativeCoverage(
    {
      summary:
        "MEGALODON roadmap meeting highlighted governance, release, staffing, coaching, and ISG ownership issues.",
      actionItems: [
        "Ask Hulbs what he means by tier 1",
        "Follow up with Andy before PIPE on roadmap view",
        "Ask Ben in next 1:1 what he is avoiding or worried about",
      ],
      delegations: ["Ben to send staffing plan by Wednesday."],
      risks: [
        "Unclear release authority and rollback impact create operational risk for MEGALODON.",
        "Staffing plan has no real dates.",
        "Ownership of operational readiness remains unclear.",
      ],
      decisions: [],
      strategyRecommendations: [
        "Clarify product versus solutions boundary.",
        "Evaluate systems integration lead or solution architect role.",
      ],
      peopleCoachingNotes: ["Ben shows conflict avoidance and ownership hesitation."],
      suggestedLinks: [{ title: "MEGALODON" }, { title: "ISG" }, { title: "Object Based Orchestration" }],
      derivativeNotes: [
        {
          title: "MEGALODON Program Roadmap and Risks",
          category: "Programs",
          folder: "Programs/MEGALODON",
          relatedPrograms: ["MEGALODON", "Object Based Orchestration"],
          relatedOrganizations: ["ISG"],
          relatedPeople: ["Andy", "Ben", "Hulbs"],
          summaryMarkdown:
            "- Governance, release, staffing, coaching, and organizational ownership signals were all mixed together in one broad derivative.",
          tags: ["MEGALODON", "risk"],
        },
      ],
    },
    sourceFile,
    sampleNote,
  );

  assert(expandedPlan.derivativeNotes.length >= 3, "Single broad derivative was not expanded into multiple derivative notes");
  assert(
    expandedPlan.derivativeNotes.some((note) => note.category === "Programs") &&
      expandedPlan.derivativeNotes.some((note) => note.category === "People") &&
      expandedPlan.derivativeNotes.some((note) => note.category === "Strategy"),
    "Expanded derivative notes did not cover program, people, and strategy categories",
  );

  const actionPlanContent = plugin.buildActionPlanNoteContent(sourceFile, {
    summary: "Mixed topic source note.",
    actionItems: [
      "- [ ] Ask Hulbs what he means by tier 1",
      "Follow up with Andy on roadmap view before PIPE 📅 2026-05-02",
      "- [ ] Ask Ben about OBO approvals",
      "Ask Ben about OBO approvals",
    ],
    delegations: ["Ben to draft the ISG summary."],
    risks: ["Staffing plan has no real dates."],
    decisions: [],
    strategyRecommendations: ["Clarify whether ISG strategy and program coordination should be separated."],
    peopleCoachingNotes: ["Coach Ben on ownership framing."],
    suggestedLinks: [{ title: "MEGALODON" }, { title: "ISG" }],
    derivativeNotes: [
      {
        title: "Roadmap Release Process",
        category: "Programs",
        folder: "Programs/MEGALODON",
        relatedPrograms: ["MEGALODON"],
        relatedOrganizations: [],
        relatedPeople: [],
        summaryMarkdown:
          "- Roadmap alignment for MEGALODON.\n- Delivery sequencing still needs clarification.\n- [ ] Ask Hulbs what he means by tier 1\n- [ ] Follow up with Andy before PIPE on roadmap view",
        tags: ["roadmap"],
      },
      {
        title: "Ben Ownership Coaching",
        category: "People",
        folder: "People",
        relatedPrograms: ["Object Based Orchestration"],
        relatedOrganizations: [],
        relatedPeople: ["Ben"],
        summaryMarkdown:
          "- Coaching focus for Ben.\n- Ownership language needs sharpening.\n- [ ] Ask Ben in next 1:1 what he is avoiding or worried about",
        tags: ["coaching"],
      },
      {
        title: "ISG Strategy Direction",
        category: "Strategy",
        folder: "Strategy",
        relatedPrograms: [],
        relatedOrganizations: ["ISG"],
        relatedPeople: [],
        summaryMarkdown: "- ISG strategy questions remain open.\n- Productization versus coordination needs decision support.",
        tags: ["strategy"],
      },
    ],
  }, "source-note-id-smoke-test");

  assert(actionPlanContent.includes("- [ ] Ask Hulbs what he means by tier 1"), "Action plan did not render checkbox tasks");
  assert(
    /source_note_id:\s*"[a-z0-9-]+"/i.test(actionPlanContent),
    "Action plan did not include a stable source note ID",
  );
  assert(
    !actionPlanContent.includes("- [ ] - [ ] Ask Hulbs what he means by tier 1"),
    "Action plan double-wrapped an already formatted task",
  );
  assert(
    actionPlanContent.includes("- [ ] Follow up with Andy on roadmap view before PIPE 📅 2026-05-02"),
    "Action plan did not preserve due-date task text",
  );
  assert(
    actionPlanContent.includes("➕ 2026-04-26"),
    "Action plan did not add created-date metadata to generated tasks",
  );

  const checkedActionPlanContent = actionPlanContent.replace(
    "- [ ] Ask Ben about OBO approvals",
    "- [x] Ask Ben about OBO approvals",
  );

  const planFile = harness.createFile("Action Plans/2026-04-26 1254 - Mixed Topics - Action Plan.md", checkedActionPlanContent);
  harness.setActiveFile(planFile);

  await plugin.executeCurrentActionPlan();

  const programDerivative = harness.files.get("Programs/MEGALODON/2026-04-26 1254 - Roadmap Release Process.md");
  const peopleDerivative = harness.files.get("People/2026-04-26 1254 - Ben Ownership Coaching.md");
  const strategyDerivative = harness.files.get("Strategy/2026-04-26 1254 - ISG Strategy Direction.md");

  assert(programDerivative, "Program derivative note was not created");
  assert(peopleDerivative, "People derivative note was not created");
  assert(strategyDerivative, "Strategy derivative note was not created");

  assert(
    programDerivative.content.includes("- [ ] Follow up with Andy on roadmap view before PIPE 📅 2026-05-02"),
    "Unchecked roadmap task was not carried into derivative note with due date preserved",
  );
  assert(
    programDerivative.content.includes("➕ 2026-04-26"),
    "Derivative note did not add created-date metadata to generated tasks",
  );
  assert(
    (programDerivative.content.match(/Ask Hulbs what he means by tier 1/g) || []).length === 1,
    "Program derivative duplicated a task that was already present in summary markdown",
  );
  assert(
    !programDerivative.content.includes("- [ ] - [ ]") &&
      !peopleDerivative.content.includes("- [ ] - [ ]") &&
      !strategyDerivative.content.includes("- [ ] - [ ]"),
    "Derivative note carried forward malformed nested checkbox task text",
  );
  assert(
    !programDerivative.content.includes("- [x] Ask Ben about OBO approvals") &&
      !peopleDerivative.content.includes("Ask Ben about OBO approvals") &&
      !strategyDerivative.content.includes("Ask Ben about OBO approvals"),
    "Checked action-plan task leaked into derivative notes",
  );

  assert(
    dashboard.content === EXPECTED_OPEN_TASKS_DASHBOARD,
    "Open Tasks dashboard was overwritten or mutated",
  );
  assert(
    !dashboard.content.includes("Follow up with Andy") && !dashboard.content.includes("Ask Hulbs"),
    "Open Tasks dashboard incorrectly contains copied tasks",
  );

  assert(
    harness.files.has("Action Plans/Completed/2026-04-26 1254 - Mixed Topics - Action Plan.md"),
    "Completed action plan was not moved to Action Plans/Completed",
  );
  const completedActionPlan = harness.files.get("Action Plans/Completed/2026-04-26 1254 - Mixed Topics - Action Plan.md");
  assert(
    completedActionPlan.content.includes('source_note_path: "Archive/2026-04-26 1254 - Mixed Topics.md"') &&
      /source_note_id:\s*"[a-z0-9-]+"/i.test(completedActionPlan.content) &&
      completedActionPlan.content.includes("completed_at:"),
    "Completed action plan did not record final source path and completion marker",
  );
  assert(
    harness.files.has("Archive/2026-04-26 1254 - Mixed Topics.md"),
    "Source note was not moved to the configured archive folder",
  );
  assert(
    programDerivative.content.includes('source_note_path: "Archive/2026-04-26 1254 - Mixed Topics.md"') &&
      /source_note_id:\s*"[a-z0-9-]+"/i.test(programDerivative.content) &&
      programDerivative.content.includes('action_plan_path: "Action Plans/Completed/2026-04-26 1254 - Mixed Topics - Action Plan.md"'),
    "Derivative note did not record final source/action-plan paths",
  );
  assert(
    programDerivative.content.includes("- Source Note: [[2026-04-26 1254 - Mixed Topics|source...]]") &&
      programDerivative.content.includes("- Action Plan: [[2026-04-26 1254 - Mixed Topics - Action Plan|action plan...]]"),
    "Derivative note did not use shortened source/action-plan link labels",
  );

  const derivativeCountAfterExecution = [...harness.files.keys()].filter((filePath) =>
    /2026-04-26 1254 - (Roadmap Release Process|Ben Ownership Coaching|ISG Strategy Direction)( \d+)?\.md$/.test(filePath),
  ).length;
  const delegationTrackerBeforeRerun = harness.files.get("Action Plans/Delegations.md").content;

  await plugin.executeCurrentActionPlan();

  const derivativeCountAfterRerun = [...harness.files.keys()].filter((filePath) =>
    /2026-04-26 1254 - (Roadmap Release Process|Ben Ownership Coaching|ISG Strategy Direction)( \d+)?\.md$/.test(filePath),
  ).length;
  assert(derivativeCountAfterRerun === derivativeCountAfterExecution, "Completed action plan rerun created duplicate derivative notes");
  assert(
    harness.files.get("Action Plans/Delegations.md").content === delegationTrackerBeforeRerun,
    "Completed action plan rerun duplicated tracker entries",
  );

  harness.createFile(
    "Programs/MEGALODON/2026-04-26 1400 - Release Risks.md",
    `---
onote_type: derivative_note
programs:
  - "MEGALODON"
---

# Release Risks

## Summary

- Release authority remains unclear.

## Risks

- Release authority is still unclear.
- Rollback impact is not well defined.

## Decisions

- Use risk-based release framing for MEGALODON.

## Strategy Recommendations

- Clarify roadmap ownership and customer promise boundaries.

## Action Items

- [ ] Follow up with Andy before PIPE

## Related Programs

- [[MEGALODON]]
`,
  );
  harness.createFile(
    "Programs/MEGALODON/2026-04-26 1410 - Staffing.md",
    `---
onote_type: derivative_note
programs:
  - "MEGALODON"
---

# Staffing

## Summary

- Staffing plan is still missing dates.

## Risks

- Staffing plan has no real dates.

## Related Programs

- [[MEGALODON]]
`,
  );
  harness.createFile(
    "Leadership/2026-04-26 1420 - ISG Ownership.md",
    `# ISG Ownership

[[MEGALODON]]

## Summary

- PM layer is weak and ownership boundaries remain fuzzy.

## Strategy Recommendations

- Consider a systems integration lead or solution architect.
`,
  );

  await plugin.refreshProgramDashboard("MEGALODON", false);

  const dashboardFile = harness.files.get("Programs/MEGALODON/MEGALODON.md");
  assert(dashboardFile, "Program dashboard file was not created");
  assert(dashboardFile.content.includes("onote_type: program_dashboard"), "Program dashboard frontmatter missing");
  assert(dashboardFile.content.includes("## Current Status"), "Program dashboard missing current status section");
  assert(dashboardFile.content.includes('path includes "Programs/MEGALODON"'), "Program dashboard task query did not target program folder");
  assert(dashboardFile.content.includes("[[2026-04-26 1410 - Staffing]]"), "Program dashboard missing recent note link");
  assert(!dashboardFile.content.includes("- [[MEGALODON]]"), "Program dashboard included itself as a recent note");
  assert(dashboardFile.content.includes("Use risk-based release framing for MEGALODON."), "Program dashboard missing recent decision");
  assert(dashboardFile.content.includes("systems integration lead or solution architect"), "Program dashboard missing strategy theme");
  assert(
    dashboardFile.content.includes("Status: Red") || dashboardFile.content.includes("Status: Yellow"),
    "Program dashboard did not calculate a non-unknown status from related notes",
  );
  assert(
    (dashboardFile.content.match(/ONOTE_DASHBOARD_START/g) || []).length === 1 &&
      (dashboardFile.content.match(/ONOTE_DASHBOARD_END/g) || []).length === 1,
    "Program dashboard generated block markers were duplicated",
  );

  const aiContextBeforeReset = await plugin.loadAIContext();
  assert(aiContextBeforeReset.includes("Program Glossary"), "AI context files were not created before reset");

  await plugin.resetOnoteDebugState();

  const resetDashboard = harness.files.get("Action Plans/Open Tasks.md");
  assert(resetDashboard, "Open Tasks dashboard was not recreated after reset");
  assert(resetDashboard.content === EXPECTED_OPEN_TASKS_DASHBOARD, "Open Tasks dashboard was not reset to baseline content");
  assert(!harness.files.has("Action Plans/Delegations.md"), "Delegations tracker was not removed by debug reset");
  assert(!harness.files.has("Action Plans/Completed/2026-04-26 1254 - Mixed Topics - Action Plan.md"), "Completed action plan was not removed by debug reset");
  assert(!harness.files.has("Programs/MEGALODON/2026-04-26 1254 - Roadmap Release Process.md"), "Derivative note was not removed by debug reset");
  assert(!harness.files.has("Programs/MEGALODON/MEGALODON.md"), "Program dashboard was not removed by debug reset");
  assert(!harness.files.has("Archive/2026-04-26 1254 - Mixed Topics.md"), "Archived source note was not removed by debug reset");
  assert(!harness.files.has("Acronyms.md"), "Acronym file was not removed by debug reset");
  assert(!harness.files.has("System/AI Context/Program Glossary.md"), "AI context files were not removed by debug reset");
  assert(harness.files.has("Inbox/2026-04-26 1300 - Persistent Source.md"), "Reset removed a non-generated source note");
  assert(
    !harness.files.get("Inbox/2026-04-26 1300 - Persistent Source.md").content.includes("onote_note_id:"),
    "Reset did not clear Onote note IDs from surviving notes",
  );
  assert(
    !harness.files.get("People/People.md").content.includes("[[2026-04-26 1254 - Ben Ownership Coaching]]"),
    "Reset did not remove stale generated links from surviving notes",
  );

  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
