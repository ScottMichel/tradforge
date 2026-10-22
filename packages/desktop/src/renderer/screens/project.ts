import type { ProjectView } from "../../shared/bridge.js";
import { api } from "../api.js";
import { busy, byId, h, showError } from "../dom.js";
import { languageName, number } from "../i18n/format.js";
import { t } from "../i18n/index.js";
import { currentProject, recentFolders, rememberFolder, setProject } from "../state.js";
import { formatLabel, outputFor } from "../view.js";

/** Step 1: open a folder or a file, see the formats found, and make it a tradforge project. */

/** Left-out files listed at once; the others are behind "show all". */
const SKIPPED_SHOWN = 3;

const from = byId<HTMLInputElement>("project-from");
const to = byId<HTMLInputElement>("project-to");
const error = byId("project-error");
const view = byId("project-view");
const actions = byId("project-actions");
const proceed = byId<HTMLButtonElement>("project-continue");

/** What was opened: the folder, or the file inside it. */
function openedPath(project: ProjectView): string {
  if (project.file === undefined) return project.root;
  const separator = project.root.includes("\\") ? "\\" : "/";
  return `${project.root.replace(/[\\/]+$/, "")}${separator}${project.file}`;
}

export function setupProject(): void {
  for (const [id, kind] of [
    ["choose-folder", "folder"],
    ["choose-file", "file"],
  ] as const) {
    const button = byId<HTMLButtonElement>(id);
    button.addEventListener("click", () =>
      busy(button, async () => {
        const title = kind === "folder" ? t().chooseFolderTitle : t().chooseFileTitle;
        const path = await api.choose(kind, title);
        if (path !== undefined) await open(path);
      }),
    );
  }

  // A folder or a file dropped on the window opens like a chosen one.
  const drop = byId("drop");
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  });
  document.addEventListener("dragleave", (event) => {
    if (event.relatedTarget === null) drop.classList.remove("dragging");
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    const file = event.dataTransfer?.files[0];
    if (file !== undefined) void open(window.tradforge.pathOf(file));
  });

  // Other languages: what detection looks for changes.
  for (const input of [from, to]) {
    input.addEventListener("change", () => {
      const project = currentProject();
      if (project !== undefined && !project.configured) void open(openedPath(project));
    });
  }

  proceed.addEventListener("click", () =>
    busy(proceed, async () => {
      const project = currentProject();
      if (project === undefined) return;
      if (!project.configured) {
        const chosen = [...view.querySelectorAll<HTMLInputElement>("input[data-source]")]
          .filter((box) => box.checked)
          .map((box) => Number(box.dataset.source));
        try {
          showError(error, undefined);
          setProject(await api.createProject(openedPath(project), from.value, to.value, chosen));
        } catch (failure) {
          showError(error, failure);
          return;
        }
      }
      window.location.hash = "#settings";
    }),
  );

  showRecent();
}

async function open(path: string): Promise<void> {
  showError(error, undefined);
  try {
    const project = await api.open(path, from.value.trim(), to.value.trim());
    rememberFolder(openedPath(project));
    setProject(project);
    showRecent();
  } catch (failure) {
    showError(error, failure);
  }
}

/** Called when the step is shown: the project may have changed in another step. */
export async function enterProject(): Promise<void> {
  const project = currentProject();
  if (project?.configured === true) await open(openedPath(project));
  else render(project);
}

export function render(project: ProjectView | undefined): void {
  view.replaceChildren();
  actions.hidden = project === undefined;
  showRecent();
  if (project === undefined) return;
  if (project.configured) {
    from.value = project.sourceLanguage;
    to.value = project.targetLanguage;
  }
  proceed.textContent = project.configured ? t().continueToSettings : t().createAndContinue;
  proceed.disabled = project.sources.length === 0;
  view.append(projectCard(project));
}

function projectCard(project: ProjectView): HTMLElement {
  const messages = t();
  const languages = `${languageName(project.sourceLanguage)} → ${languageName(project.targetLanguage)}`;
  const summary =
    project.sources.length === 0
      ? messages.noFormatFound
      : `${messages.formatCount(project.sources.length)} · ${languages}`;
  const badge = project.configured
    ? h(
        "span",
        { class: "badge success" },
        messages.projectBadge(project.stats?.translated ?? 0, project.stats?.total ?? 0),
      )
    : h("span", { class: "badge" }, messages.newProjectBadge);

  const rows = project.sources.map((source, index) =>
    h(
      "tr",
      {},
      !project.configured &&
        h(
          "td",
          {},
          h("input", {
            type: "checkbox",
            checked: true,
            "data-source": String(index),
            "aria-label": messages.translateFormat(formatLabel(source.format, messages)),
          }),
        ),
      h("td", { class: "strong" }, formatLabel(source.format, messages)),
      h(
        "td",
        { class: "mono" },
        source.include.join(", ") + (source.files !== undefined ? ` · ${number(source.files)}` : ""),
      ),
      h("td", { class: "mono muted" }, outputFor(source.output, project.targetLanguage)),
    ),
  );
  const head = h(
    "tr",
    {},
    !project.configured && h("th", {}, messages.columnTranslate),
    h("th", {}, messages.columnFormat),
    h("th", {}, messages.columnFiles),
    h("th", {}, messages.columnOutput),
  );

  return h(
    "section",
    { class: "card", "aria-labelledby": "project-path" },
    h(
      "div",
      { class: "card-head" },
      h(
        "div",
        {},
        h("p", { class: "strong path", id: "project-path" }, project.root),
        project.file !== undefined && h("p", { class: "mono" }, messages.fileOnly(project.file)),
        h("p", { class: "muted" }, summary),
      ),
      badge,
    ),
    rows.length > 0 &&
      h("div", { class: "table-scroll" }, h("table", {}, h("thead", {}, head), h("tbody", {}, ...rows))),
    project.skipped.length > 0 && skippedNote(project),
  );
}

function skippedNote(project: ProjectView): HTMLElement {
  const describe = ({ file, reason }: { file: string; reason: string }) => `${file} (${reason})`;
  const first = project.skipped.slice(0, SKIPPED_SHOWN).map(describe).join(", ");
  const note = h("div", { class: "card-foot muted" }, t().skipped(project.skipped.length, first));
  if (project.skipped.length > SKIPPED_SHOWN) {
    note.append(
      h(
        "details",
        {},
        h("summary", {}, t().showAll),
        h("ul", {}, ...project.skipped.map((skipped) => h("li", {}, describe(skipped)))),
      ),
    );
  }
  return note;
}

function showRecent(): void {
  const folders = recentFolders();
  byId("recent").hidden = folders.length === 0;
  byId("recent-list").replaceChildren(
    ...folders.map((folder) => {
      const button = h("button", { type: "button", class: "link mono" }, folder);
      button.addEventListener("click", () => busy(button, () => open(folder)));
      return h("li", {}, button);
    }),
  );
}
