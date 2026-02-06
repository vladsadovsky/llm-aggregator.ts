export interface ThreadData {
  name: string
  items: string[]
}

export type ThreadMap = Record<string, ThreadData>
