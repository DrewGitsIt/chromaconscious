// The App dashboard's fixtures that more than one part reads.

/** Requests per day, Friday to Thursday. They sum to the headline, 12,904. */
export const REQUEST_DAYS: Array<[day: string, total: number]> = [
  ['Fri', 1610],
  ['Sat', 1702],
  ['Sun', 1874],
  ['Mon', 1938],
  ['Tue', 1795],
  ['Wed', 2041],
  ['Thu', 1944],
]
export const REQUESTS_TOTAL = REQUEST_DAYS.reduce((a, [, n]) => a + n, 0)
