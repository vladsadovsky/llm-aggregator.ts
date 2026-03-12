export interface ThreadData {
  name: string
  items: string[]
  tags?: string[]
}

export type ThreadMap = Record<string, ThreadData>
