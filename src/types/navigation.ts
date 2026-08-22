export interface NavigationRoute {
  prefix: string
  bucket?: string
}

export interface NavigationHistoryState {
  prefix: string
  bucket?: string
  timestamp?: number
}
