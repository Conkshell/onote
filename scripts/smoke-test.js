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
sort by due
group by path
\`\`\`
`;

function createVaultHarness() {
  const files = new Map();
  const folders = new Set();
  const trashed = [];
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
      trashed.push(file.path);
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
    trashed,
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
      { name: "MEGALODON", acronyms: ["MEG"] },
      { name: "Object Based Orchestration", acronyms: ["OBO"] },
    ],
    categories: [
      { name: "Programs", folderPath: "Programs", description: "" },
      { name: "Leadership", folderPath: "Leadership", description: "" },
      { name: "Strategy", folderPath: "Strategy", description: "" },
      { name: "People", folderPath: "People", description: "" },
    ],
  };

  await plugin.ensureOpenTasksDashboard();

  const dashboard = harness.files.get("Action Plans/Open Tasks.md");
  assert(dashboard, "Open Tasks dashboard was not created");
  assert(dashboard.content.includes("```tasks"), "Open Tasks dashboard is missing Tasks query");

  const sampleNote = fs.readFileSync(path.join(__dirname, "..", "test-data", "sample-source-note.md"), "utf8");
  const sourceFile = harness.createFile(
    "Inbox/2026-04-26 1254 - Mixed Topics.md",
    sampleNote,
  );

  const actionPlanContent = plugin.buildActionPlanNoteContent(sourceFile, {
    summary: "Mixed topic source note.",
    actionItems: [
      "Ask Hulbs what he means by tier 1",
      "Follow up with Andy on roadmap view before PIPE 📅 2026-05-02",
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
        summaryMarkdown: "- Roadmap alignment for MEGALODON.\n- Delivery sequencing still needs clarification.",
        tags: ["roadmap"],
      },
      {
        title: "Ben Ownership Coaching",
        category: "People",
        folder: "People",
        relatedPrograms: ["Object Based Orchestration"],
        relatedOrganizations: [],
        relatedPeople: ["Ben"],
        summaryMarkdown: "- Coaching focus for Ben.\n- Ownership language needs sharpening.",
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
  });

  assert(actionPlanContent.includes("- [ ] Ask Hulbs what he means by tier 1"), "Action plan did not render checkbox tasks");
  assert(
    actionPlanContent.includes("- [ ] Follow up with Andy on roadmap view before PIPE 📅 2026-05-02"),
    "Action plan did not preserve due-date task text",
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
  assert(
    harness.trashed.includes("Inbox/2026-04-26 1254 - Mixed Topics.md"),
    "Source note was not archived using native trash behavior",
  );

  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
