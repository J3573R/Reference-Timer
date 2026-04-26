// Build a URL for a local image file. Uses the custom `local://` protocol
// registered in the main process, which sets Cache-Control headers so
// Chromium can cache decoded bitmaps. file:// bypasses that cache.
//
// The `f` host is a placeholder. Without an explicit host, Chromium's
// standard-scheme URL canonicalizer treats the first path segment as the
// hostname (and lowercases it), corrupting paths like /Volumes/...
export function imageUrl(absolutePath: string | undefined | null): string {
  if (!absolutePath) return ''
  return `local://f${encodeURI(absolutePath)}`
}
