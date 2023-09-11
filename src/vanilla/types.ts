export interface InfiniteData<TFetcherData> {
  pages: TFetcherData[]
  pageParams: number[]
}
