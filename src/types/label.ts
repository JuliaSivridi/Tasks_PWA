export interface Label {
  id: string
  name: string
  color: string   // hex '#EF4444'
  sort_order: number
}

export type LabelInput = Omit<Label, 'id'>
