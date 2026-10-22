import type { EntryState, EntryView } from "../../shared/bridge.js";
import { api } from "../api.js";
import { busy, byId, h, showError } from "../dom.js";
import { number } from "../i18n/format.js";
import { type Messages, t } from "../i18n/index.js";
import { configuredRoot } from "../state.js";
import { countByState, type EntryFilter, filterEntries } from "../view.js";

/** Step 4: read the translations, correct them, and approve them; an approved translation is never replaced. */

/** Texts shown at once: enough to work, light enough for a project of 100,000 texts. */
const PAGE_SIZE = 100;

const FILTERS: readonly { readonly value: EntryFilter; readonly label: (messages: Messages) => string }[] = [
  { value: "all", label: (messages) => messages.filterAll },
  { value: "failed", label: (messages) => messages.filterFailed },
  { value: "machine", label: (messages) => messages.filterMachine },
  { value: "reviewed", label: (messages) => messages.filterReviewed },
  { value: "pending", label: (messages) => messages.filterPending },
];

const STATE_LABELS: Readonly<Record<EntryState, (messages: Messages) => string>> = {
  failed: (messages) => messages.stateFailed,
  machine: (messages) => messages.stateMachine,
  reviewed: (messages) => messages.stateReviewed,
  pending: (messages) => messages.statePending,
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
    entries = await api.entries(root);
    // Failures first, when there are some: they are what needs a human.
    if (filter === "all" && entries.some((entry) => entry.state === "failed")) filter = "failed";
    render();
  } catch (failure) {
    showError(error, failure);
  }
}

/** Draws the filters and the list; also when the language of the interface changes (edits not saved are lost). */
export function render(): void {
  showFilters();
  const shown = filterEntries(entries, filter, search.value);
  list.replaceChildren(...shown.slice(0, PAGE_SIZE).map(entryItem));
  more.textContent =
    shown.length === 0 ? t().noText : shown.length > PAGE_SIZE ? t().shownOf(PAGE_SIZE, shown.length) : "";
}

function showFilters(): void {
  const counts = countByState(entries);
  filters.replaceChildren(
    ...FILTERS.map(({ value, label }) => {
      const button = h(
        "button",
        { type: "button", class: "filter", "aria-pressed": String(filter === value) },
        `${label(t())} · ${number(counts[value])}`,
      );
      button.addEventListener("click", () => {
        filter = value;
        render();
      });
      return button;
    }),
  );
}

function entryItem(entry: EntryView): HTMLElement {
  const messages = t();
  const target = h("textarea", { rows: "2", "aria-label": messages.translationOf(entry.source) });
  target.value = entry.target ?? "";
  const approve = h("button", { type: "button", class: "button small" }, messages.approve);
  const state = h("span", { class: `badge state-${entry.state}` }, STATE_LABELS[entry.state](messages));
  const problem = h("div", { class: "error small", role: "alert", hidden: true });

  approve.addEventListener("click", () =>
    busy(approve, async () => {
      const root = configuredRoot();
      if (root === undefined) return;
      showError(problem, undefined);
      try {
        const updated = await api.review(root, entry.source, target.value);
        entries = entries.map((candidate) => (candidate.source === updated.source ? updated : candidate));
        state.className = "badge state-reviewed";
        state.textContent = STATE_LABELS.reviewed(t());
        approve.textContent = t().approved;
        item.querySelector(".reason")?.remove();
        // The counts change; the list keeps its order until the next visit, so nothing jumps.
        showFilters();
      } catch (failure) {
        showError(problem, failure);
      }
    }),
  );
  target.addEventListener("input", () => {
    approve.textContent = t().approve;
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
      entry.reason !== undefined && h("p", { class: "reason small" }, messages.rejected(entry.reason)),
      problem,
    ),
    h("div", { class: "entry-actions" }, state, approve),
  );
  return item;
}
