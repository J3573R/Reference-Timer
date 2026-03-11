import { getThumbnail } from './fileSystem.js'

type Priority = 'high' | 'low'

interface QueueItem {
  imagePath: string
  priority: Priority
  resolve: (thumbnailPath: string) => void
  reject: (error: Error) => void
}

export class ThumbnailQueue {
  private queue: QueueItem[] = []
  private activeCount = 0
  private maxConcurrency: number
  private processing = false
  // Track in-flight and completed items for deduplication
  private pending = new Map<string, Promise<string>>()

  constructor(maxConcurrency = 6) {
    this.maxConcurrency = maxConcurrency
  }

  enqueue(imagePath: string, priority: Priority = 'low'): Promise<string> {
    // Deduplicate: if already pending, return existing promise
    const existing = this.pending.get(imagePath)
    if (existing) {
      // If upgrading priority, reorder won't help since it's already processing
      // but for queued items we can upgrade
      if (priority === 'high') {
        const queued = this.queue.find(item => item.imagePath === imagePath)
        if (queued) queued.priority = 'high'
      }
      return existing
    }

    const promise = new Promise<string>((resolve, reject) => {
      this.queue.push({ imagePath, priority, resolve, reject })
    })

    this.pending.set(imagePath, promise)
    this.processNext()
    return promise
  }

  enqueueBatch(imagePaths: string[], priority: Priority = 'low'): Promise<Record<string, string>> {
    const promises = imagePaths.map(p => this.enqueue(p, priority).then(thumb => ({ path: p, thumb })))
    return Promise.all(promises).then(results => {
      const record: Record<string, string> = {}
      for (const { path, thumb } of results) {
        record[path] = thumb
      }
      return record
    })
  }

  private processNext(): void {
    if (this.processing) return
    this.processing = true

    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      // Sort: high priority items first (stable sort preserves insertion order within same priority)
      this.sortQueue()
      const item = this.queue.shift()!
      this.activeCount++
      this.processItem(item)
    }

    this.processing = false
  }

  private sortQueue(): void {
    // Move all high-priority items to the front, preserving order within each priority
    const high: QueueItem[] = []
    const low: QueueItem[] = []
    for (const item of this.queue) {
      if (item.priority === 'high') {
        high.push(item)
      } else {
        low.push(item)
      }
    }
    this.queue = [...high, ...low]
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      const thumbnailPath = await getThumbnail(item.imagePath)
      item.resolve(thumbnailPath)
    } catch (error) {
      item.reject(error as Error)
    } finally {
      this.activeCount--
      this.pending.delete(item.imagePath)
      this.processNext()
    }
  }

  clear(): void {
    // Reject all queued items (not in-flight ones)
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'))
      this.pending.delete(item.imagePath)
    }
    this.queue = []
  }
}
