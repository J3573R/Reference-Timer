import path from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

let db: Database.Database | null = null
let getStmt: Database.Statement<[string], { thumbnail_path: string }> | null = null
let setStmt: Database.Statement<[string, string]> | null = null
let deleteStmt: Database.Statement<[string]> | null = null

function getDb(): Database.Database {
  if (db) return db
  const dbPath = path.join(app.getPath('userData'), 'thumbnails.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS thumbnail_cache (
      image_path TEXT PRIMARY KEY,
      thumbnail_path TEXT NOT NULL
    )
  `)
  getStmt = db.prepare('SELECT thumbnail_path FROM thumbnail_cache WHERE image_path = ?')
  setStmt = db.prepare('INSERT OR REPLACE INTO thumbnail_cache (image_path, thumbnail_path) VALUES (?, ?)')
  deleteStmt = db.prepare('DELETE FROM thumbnail_cache WHERE image_path = ?')
  return db
}

export function get(imagePath: string): string | undefined {
  getDb()
  const row = getStmt!.get(imagePath)
  return row?.thumbnail_path
}

export function getMany(imagePaths: string[]): Record<string, string> {
  if (imagePaths.length === 0) return {}
  getDb()
  const result: Record<string, string> = {}
  for (const p of imagePaths) {
    const row = getStmt!.get(p)
    if (row) result[p] = row.thumbnail_path
  }
  return result
}

export function set(imagePath: string, thumbnailPath: string): void {
  getDb()
  setStmt!.run(imagePath, thumbnailPath)
}

export function setMany(entries: Record<string, string>): void {
  const keys = Object.keys(entries)
  if (keys.length === 0) return
  const database = getDb()
  const tx = database.transaction((pairs: Record<string, string>) => {
    for (const k of Object.keys(pairs)) {
      setStmt!.run(k, pairs[k])
    }
  })
  tx(entries)
}

export function deleteEntry(imagePath: string): void {
  getDb()
  deleteStmt!.run(imagePath)
}

export function deleteMany(imagePaths: string[]): void {
  if (imagePaths.length === 0) return
  const database = getDb()
  const tx = database.transaction((paths: string[]) => {
    for (const p of paths) {
      deleteStmt!.run(p)
    }
  })
  tx(imagePaths)
}

export function allEntries(): IterableIterator<{ image_path: string; thumbnail_path: string }> {
  const database = getDb()
  return database.prepare('SELECT image_path, thumbnail_path FROM thumbnail_cache').iterate() as IterableIterator<{ image_path: string; thumbnail_path: string }>
}

export function size(): number {
  const database = getDb()
  const row = database.prepare('SELECT COUNT(*) as c FROM thumbnail_cache').get() as { c: number }
  return row.c
}
