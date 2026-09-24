import type { HistoryEntry } from './types'

// Bounds the undo stack's total memory footprint (roughly this many grid
// cells, summed across all retained snapshots and all layers) instead of a
// flat entry count or a flat max-entries count. Either flat cap breaks down
// once an entry's own cost changes over a session (canvas resized, layers
// added/removed): a max-entries figure computed from just the newest entry
// doesn't bound the total once older, differently-sized entries are mixed
// in, and trimming only one entry per commit can leave the stack far above
// budget for many edits while it catches up. Trimming from the oldest entry
// until the *summed* cost of what's retained fits the budget handles both -
// and computing each entry's cost from its own stored grids (rather than
// the *current* canvas size) keeps it correct across a resize too: an old
// snapshot from before a resize-down would otherwise be charged as if it
// were small, letting the stack retain far more than the budget permits.
export const HISTORY_CELL_BUDGET = 2_000_000

// A hard ceiling on retained entries regardless of estimated cell cost.
// historyEntryCellCost below only counts painted cells plus one unit per
// layer, but a real Layer object (id/name strings, visible flag, a grid
// Object) costs noticeably more than that in actual bytes - a drawing with
// many near-empty layers (renaming/toggling/reordering them repeatedly)
// would look "cheap" by cell count alone and could otherwise accumulate far
// more retained snapshots than is actually safe.
export const HISTORY_MAX_ENTRIES = 100

export function historyEntryCellCost(entry: HistoryEntry): number {
  // Every layer has real structural overhead beyond its painted cells (id/
  // name strings, the grid object itself), so it's counted even when empty.
  let cost = entry.layers.length
  for (const layer of entry.layers) {
    cost += Object.keys(layer.grid).length
  }
  return Math.max(1, cost)
}

// budget/maxEntries default to the real constants above; tests override them
// to exercise the trimming logic with small data instead of needing
// literal million-cell grids to cross the real budget.
export function trimHistoryToBudget(
  history: HistoryEntry[],
  budget: number = HISTORY_CELL_BUDGET,
  maxEntries: number = HISTORY_MAX_ENTRIES
): HistoryEntry[] {
  const trimmed = history.length > maxEntries
    ? history.slice(history.length - maxEntries)
    : history.slice()
  let totalCost = trimmed.reduce((sum, entry) => sum + historyEntryCellCost(entry), 0)
  // Always keep at least the most recent entry, even over budget - there
  // must be something to undo/redo against.
  while (trimmed.length > 1 && totalCost > budget) {
    totalCost -= historyEntryCellCost(trimmed[0])
    trimmed.shift()
  }
  return trimmed
}
