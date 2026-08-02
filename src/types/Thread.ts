export interface ThreadData {
  name: string
  items: string[]
  tags?: string[]
  /**
   * When the thread's content originated (ISO). Importers set it from the source
   * conversation; hand-made threads get the moment of creation. Optional so
   * threads.json files written before this existed still load.
   */
  createdAt?: string
  /** Last entry or edit (ISO) — renames, reorders and add/remove all refresh it. */
  updatedAt?: string
  /** Stable account-export conversation identity used to make ZIP re-import idempotent. */
  importSourceId?: string
}

export type ThreadMap = Record<string, ThreadData>
