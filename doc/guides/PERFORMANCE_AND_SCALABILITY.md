# Performance and Scalability Requirements

## Purpose

LLM Aggregator is a local-first archive application. Archive size must not turn
ordinary UI operations into blocked or delayed workflows.

## Scale target

- **Design target:** 5,000 threads and 30,000 Q&A pairs.
- **Current real-world reference archive:** approximately 1,240 threads and
  5,000 Q&A pairs (August 2026).

Features should be designed and validated against the target, not just the
current reference archive.

## Non-negotiable responsiveness requirements

- Interactive work must be near-constant with archive size whenever the action
  concerns one control or one record: typing, cursor movement, opening/closing a
  local form, toggling a UI preference, and selecting a visible row must not
  scan, sort, serialize, or rerender archive-scale data.
- Input must remain fluid. A keypress must not be delayed by archive-wide
  derived-state calculation or by rendering unrelated list rows.
- Long-running work must not block the application. Startup, archive loading,
  import, indexing, and archive-wide maintenance must expose progress, yield or
  run incrementally where possible, and leave unrelated functionality available.
- Startup must show a usable application shell promptly; loading a large archive
  must not leave the whole app unresponsive while all records are read and
  rendered.

## Engineering rules

- Scalability is a design constraint. Never implement an archive-scale rescan,
  reparse, sort, serialization, or derived-collection rebuild in a per-item,
  per-keystroke, per-selection, or ordinary single-record lookup path. Maintain
  an explicit index or cached projection, and invalidate or update it only when
  its source archive data changes.
- Isolate local draft/form state in components or composables whose updates do
  not rerender archive-scale parents or lists.
- Treat a full `threads` or `pairs` traversal, sorting, JSON serialization, and
  list VNode construction as archive-scale work. Do it only when its actual
  inputs change, cache/projection the result, and never from an unrelated input
  event.
- Use debouncing only for user-intended query work; it is not a substitute for
  preventing unnecessary rendering or calculation on every keystroke.
- For large lists, render only visible rows when ordinary rendering, scrolling,
  filtering, or selection cannot meet the responsiveness requirement. Virtualize
  only with keyboard selection, context menus, and accessibility behavior kept
  intact.
- Main-process archive operations must avoid synchronous loops that monopolize
  the event loop. Break work into durable, observable units and yield between
  them when appropriate.

## Validation

For any feature touching archive-wide state or a repeated user interaction:

1. Identify whether the hot path is constant, proportional to visible rows, or
   proportional to the archive.
2. Confirm a local input cannot trigger an archive-scale traversal or list
   render.
3. Manually profile or benchmark at the scale target when practical; record
   material findings in `doc/dev_process/build-notes.md`.
4. Add a focused automated regression test when the behavior can be asserted
   without a timing-sensitive test.

These requirements govern new work and performance fixes. Existing large-scale
paths should be documented and improved in priority order when observed.
