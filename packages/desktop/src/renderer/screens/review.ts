import type { EntryState, EntryView } from "../../shared/bridge.js";
import { busy, byId, h, showError } from "../dom.js";
import { configuredRoot } from "../state.js";
import { count, countByState, type EntryFilter, filterEntries } from "../view.js";

/** Step 4: read the translations, correct them, and approve them; an approved translation is never replaced. */

/** Texts shown at once: enough to work, light enough for a project of 100,000 texts. */
const PAGE_SIZE = 100;

const FILTERS: readonly { readonly value: EntryFilter; readonly label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "failed", label: "Échecs" },
  { value: "machine", label: "À vérifier" },
  { value: "reviewed", label: "Relus" },
  { value: "pending", label: "À traduire" },
];

const STATE_LABELS: Readonly<Record<EntryState, string>> = {
  failed: "Échec",
  machine: "Moteur",
  reviewed: "Relu",
  pending: "À traduire",
};

const filters = byId("review-filters");
const search = byId<HTMLInputElement>("review-search");
const list = byId("review-list");
const more = byId("review-more");
const error = byId("review-error");

let entries: readonly EntryView[] = [];
let filter: EntryFilter = "all";

export function setupReview(): void {
  search.addEventListener("input", render);
}

export async function enterReview(): Promise<void> {
  const root = configuredRoot();
  if (root === undefined) return;
  showError(error, undefined);
  try {
    entries = await window.tradforge.entries(root);
    // Failures first, when there are some: they are what needs a human.
    if (filter === "all" && entries.some((entry) => entry.state === "failed")) filter = "failed";
    render();
  } catch (failure) {
    showError(error, failure);
  }
}

function render(): void {
  const counts = countByState(entries);
  filters.replaceChildren(
    ...FILTERS.map(({ value, label }) => {
      const button = h(
        "button",
        { type: "button", class: "filter", "aria-pressed": String(filter === value) },
        `${label} · ${count(counts[value])}`,
      );
      button.addEventListener("click", () => {
        filter = value;
        render();
      });
      return button;
    }),
  );
  const shown = filterEntries(entries, filter, search.value);
  list.replaceChildren(...shown.slice(0, PAGE_SIZE).map(entryItem));
  more.textContent =
    shown.length === 0
      ? "Aucun texte ici."
      : shown.length > PAGE_SIZE
        ? `${count(PAGE_SIZE)} textes affichés sur ${count(shown.length)} : affine la recherche pour trouver les autres.`
        : "";
}

function entryItem(entry: EntryView): HTMLElement {
  const target = h("textarea", { rows: "2", "aria-label": `Traduction de « ${entry.source} »` });
  target.value = entry.target ?? "";
  const approve = h("button", { type: "button", class: "button small" }, "Valider");
  const state = h("span", { class: `badge state-${entry.state}` }, STATE_LABELS[entry.state]);
  const problem = h("p", { class: "error small", role: "alert", hidden: true });

  approve.addEventListener("click", () =>
    busy(approve, async () => {
      const root = configuredRoot();
      if (root === undefined) return;
      showError(problem, undefined);
      try {
        const updated = await window.tradforge.review(root, entry.source, target.value);
        entries = entries.map((candidate) => (candidate.source === updated.source ? updated : candidate));
        state.className = "badge state-reviewed";
        state.textContent = STATE_LABELS.reviewed;
        approve.textContent = "Validé";
        item.querySelector(".reason")?.remove();
        // The filter counts change; the list keeps its order until the next visit, so nothing jumps.
        const counts = countByState(entries);
        filters.querySelectorAll("button").forEach((button, index) => {
          const filterOf = FILTERS[index];
          if (filterOf !== undefined) button.textContent = `${filterOf.label} · ${count(counts[filterOf.value])}`;
        });
      } catch (failure) {
        showError(problem, failure);
      }
    }),
  );
  target.addEventListener("input", () => {
    approve.textContent = "Valider";
  });

  const item = h(
    "li",
    { class: "entry" },
    h(
      "div",
      { class: "entry-source" },
      h("p", {}, entry.source),
      h("p", { class: "muted small mono" }, entry.file + (entry.context !== undefined ? ` · ${entry.context}` : "")),
    ),
    h(
      "div",
      { class: "entry-target" },
      target,
      entry.reason !== undefined && h("p", { class: "reason small" }, `Refusé : ${entry.reason}`),
      problem,
    ),
    h("div", { class: "entry-actions" }, state, approve),
  );
  return item;
}
