import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  databaseOperationNames,
  emptySeed,
  openDatabase,
  parseDbDelayArgument,
  parseDbFailureArgument,
  parseSeedArgument,
  resetDatabase,
  untitledDocumentTitle,
} from '../../electron/database.ts'
import type {
  OpenDatabaseOptions,
  WordAppDatabase,
} from '../../electron/database.ts'

let temporaryDirectory: string | undefined
let database: WordAppDatabase | undefined

function collectDatabaseObjects(): void {
  ;(globalThis as { Bun?: { gc?: (force: boolean) => void } }).Bun?.gc?.(true)
}

function temporaryDatabasePath(): string {
  temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'wordapp-database-test-'),
  )
  return path.join(temporaryDirectory, 'db.sqlite')
}

function openTestDatabase(options?: OpenDatabaseOptions): {
  database: WordAppDatabase
  databasePath: string
} {
  const databasePath = temporaryDatabasePath()
  const instance = openDatabase(databasePath, options)
  database = instance

  return { database: instance, databasePath }
}

afterEach(async () => {
  database?.close()
  database = undefined

  for (let attempt = 0; temporaryDirectory && attempt < 500; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    collectDatabaseObjects()

    try {
      rmSync(temporaryDirectory, { recursive: true, force: true })
      temporaryDirectory = undefined
    } catch {}
  }

  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true })
    temporaryDirectory = undefined
  }
})

describe('openDatabase', () => {
  it('migrates a fresh file to the expected schema', () => {
    const { databasePath } = openTestDatabase()
    const raw = new DatabaseSync(databasePath)

    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: 1,
      })
      expect(raw.prepare('PRAGMA journal_mode').get()).toEqual({
        journal_mode: 'wal',
      })

      const table = raw
        .prepare(
          "SELECT type, strict FROM pragma_table_list WHERE name = 'documents'",
        )
        .get()
      expect(table).toEqual({ type: 'table', strict: 1 })

      const columns = raw
        .prepare(
          `SELECT name, type, "notnull" AS "notNull", pk
           FROM pragma_table_info('documents')
           ORDER BY cid`,
        )
        .all()
      expect(columns).toEqual([
        { name: 'id', type: 'INTEGER', notNull: 0, pk: 1 },
        { name: 'title', type: 'TEXT', notNull: 1, pk: 0 },
        { name: 'body', type: 'TEXT', notNull: 1, pk: 0 },
        { name: 'created_at', type: 'INTEGER', notNull: 1, pk: 0 },
        { name: 'updated_at', type: 'INTEGER', notNull: 1, pk: 0 },
      ])

      const objects = raw
        .prepare(
          `SELECT type, name FROM sqlite_master
           WHERE name IN ('documents_created_at_idx', 'documents_touch_updated_at')
           ORDER BY type`,
        )
        .all()
      expect(objects).toEqual([
        { type: 'index', name: 'documents_created_at_idx' },
        { type: 'trigger', name: 'documents_touch_updated_at' },
      ])
    } finally {
      raw.close()
    }
  })

  it('serves the newest-first document list from the created_at index', () => {
    const { databasePath } = openTestDatabase()
    const raw = new DatabaseSync(databasePath)

    try {
      const plan = raw
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT id, title, body, created_at, updated_at
           FROM documents
           ORDER BY created_at DESC`,
        )
        .all() as Array<{ detail: string }>

      expect(plan.map((step) => step.detail).join('\n')).toContain(
        'documents_created_at_idx',
      )
    } finally {
      raw.close()
    }
  })

  it('keeps data across a reopen without re-applying migrations', async () => {
    const { database: first, databasePath } = openTestDatabase()
    const document = await first.createDocument()
    first.close()
    database = undefined

    const reopened = openDatabase(databasePath)
    database = reopened

    expect(await reopened.getDocument(document.id)).toEqual(document)

    const raw = new DatabaseSync(databasePath)
    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: 1,
      })
    } finally {
      raw.close()
    }
  })
})

describe('documents', () => {
  it('creates an untitled document and reads it back by id', async () => {
    const { database: store } = openTestDatabase()
    const before = Date.now()

    const document = await store.createDocument()

    expect(document.id).toBeGreaterThan(0)
    expect(untitledDocumentTitle).toBe('بدون عنوان')
    expect(document.title).toBe(untitledDocumentTitle)
    expect(document.body).toBe('')
    expect(document.createdAt).toBeGreaterThanOrEqual(before)
    expect(document.createdAt).toBeLessThanOrEqual(Date.now())
    expect(document.updatedAt).toBe(document.createdAt)

    expect(await store.getDocument(document.id)).toEqual(document)
    expect(await store.getDocument(document.id + 1000)).toBeUndefined()
  })

  it('counts the stored documents with a dedicated count query', async () => {
    const { database: store } = openTestDatabase()

    expect(await store.countDocuments()).toBe(0)

    await store.createDocument()
    await store.createDocument()

    expect(await store.countDocuments()).toBe(2)
  })

  it('lists nothing before the first document', async () => {
    const { database: store } = openTestDatabase()

    expect(await store.listDocuments()).toEqual([])
  })

  it('lists the stored documents newest first and drops a deleted one', async () => {
    vi.useFakeTimers()

    try {
      const { database: store } = openTestDatabase()

      vi.setSystemTime(1_000_000)
      const first = await store.createDocument()
      vi.setSystemTime(1_001_000)
      const second = await store.createDocument()

      expect(await store.listDocuments()).toEqual([second, first])

      await store.deleteDocument(second.id)

      expect(await store.listDocuments()).toEqual([first])
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes one document and keeps the others', async () => {
    const { database: store } = openTestDatabase()
    const kept = await store.createDocument()
    const removed = await store.createDocument()

    await store.deleteDocument(removed.id)

    expect(await store.getDocument(removed.id)).toBeUndefined()
    expect(await store.getDocument(kept.id)).toEqual(kept)
    expect(await store.countDocuments()).toBe(1)
  })

  it('deleting a missing document removes nothing', async () => {
    const { database: store } = openTestDatabase()
    const document = await store.createDocument()

    await store.deleteDocument(document.id + 1000)

    expect(await store.countDocuments()).toBe(1)
    expect(await store.getDocument(document.id)).toEqual(document)
  })

  it('saves a new title and returns the stored row', async () => {
    const { database: store } = openTestDatabase()
    const document = await store.createDocument()

    const saved = await store.saveDocument(document.id, {
      title: 'گزارش تازه',
    })

    expect(saved?.title).toBe('گزارش تازه')
    expect(saved?.body).toBe('')
    expect(saved?.createdAt).toBe(document.createdAt)
    expect(saved).toEqual(await store.getDocument(document.id))
  })

  it('saves the body without touching the title', async () => {
    const { database: store } = openTestDatabase()
    const document = await store.createDocument()
    await store.saveDocument(document.id, { title: 'گزارش' })

    const saved = await store.saveDocument(document.id, { body: 'متن تازه' })

    expect(saved?.title).toBe('گزارش')
    expect(saved?.body).toBe('متن تازه')
  })

  it('saves both fields in one call', async () => {
    const { database: store } = openTestDatabase()
    const document = await store.createDocument()

    const saved = await store.saveDocument(document.id, {
      title: 'گزارش',
      body: 'متن',
    })

    expect(saved?.title).toBe('گزارش')
    expect(saved?.body).toBe('متن')
  })

  it('saves an emptied title instead of leaving the old one', async () => {
    const { database: store } = openTestDatabase()
    const document = await store.createDocument()
    await store.saveDocument(document.id, { title: 'گزارش' })

    const saved = await store.saveDocument(document.id, { title: '' })

    expect(saved?.title).toBe('')
  })

  it('a save without changes reads the row back and writes nothing', async () => {
    const { database: store } = openTestDatabase()
    const document = await store.createDocument()

    const saved = await store.saveDocument(document.id, {})

    expect(saved).toEqual(document)
  })

  it('saving a missing document changes nothing and resolves to undefined', async () => {
    const { database: store } = openTestDatabase()
    await store.createDocument()

    expect(await store.saveDocument(1000, { title: 'گزارش' })).toBeUndefined()
    expect(await store.countDocuments()).toBe(1)
  })

  it('bumps updated_at through the trigger when a save changes a field', async () => {
    const { database: store, databasePath } = openTestDatabase()
    const document = await store.createDocument()
    const oldUpdate = document.createdAt - 60_000
    const raw = new DatabaseSync(databasePath)

    try {
      raw
        .prepare('UPDATE documents SET updated_at = ? WHERE id = ?')
        .run(oldUpdate, document.id)

      const saved = await store.saveDocument(document.id, { title: 'گزارش' })

      expect(saved?.updatedAt).toBeGreaterThan(oldUpdate)
    } finally {
      raw.close()
    }
  })

  it('bumps updated_at on update but keeps an explicitly set one', async () => {
    const { database: store, databasePath } = openTestDatabase()
    const document = await store.createDocument()
    const raw = new DatabaseSync(databasePath)

    const selectRow = () =>
      raw
        .prepare(
          'SELECT title, created_at, updated_at FROM documents WHERE id = ?',
        )
        .get(document.id) as {
        title: string
        created_at: number
        updated_at: number
      }

    try {
      const explicit = document.createdAt - 60_000
      raw
        .prepare('UPDATE documents SET title = ?, updated_at = ? WHERE id = ?')
        .run('ویرایش مستقیم', explicit, document.id)

      expect(selectRow()).toEqual({
        title: 'ویرایش مستقیم',
        created_at: document.createdAt,
        updated_at: explicit,
      })

      raw
        .prepare('UPDATE documents SET title = ? WHERE id = ?')
        .run('ویرایش', document.id)

      const touched = selectRow()
      expect(touched.title).toBe('ویرایش')
      expect(touched.created_at).toBe(document.createdAt)
      expect(touched.updated_at).toBeGreaterThan(explicit)

      expect((await store.getDocument(document.id))?.title).toBe('ویرایش')
    } finally {
      raw.close()
    }
  })
})

describe('emptySeed', () => {
  it('describes the documents table left with no records after a reset', () => {
    expect(emptySeed).toEqual([{ table: 'documents', count: 0 }])
  })
})

describe('parseSeedArgument', () => {
  it('parses the documented table,count layout', () => {
    expect(parseSeedArgument('documents,50-users,50')).toEqual([
      { table: 'documents', count: 50 },
      { table: 'users', count: 50 },
    ])
    expect(parseSeedArgument('documents,0')).toEqual([
      { table: 'documents', count: 0 },
    ])
  })

  it('treats an empty value as "seed nothing"', () => {
    expect(parseSeedArgument('')).toEqual([])
  })

  it('rejects entries that are not <table>,<count>', () => {
    for (const value of [
      'documents',
      'documents,',
      ',50',
      'documents,twenty',
      '2documents,50',
      'documents,50-',
      '-documents,50',
    ]) {
      expect(() => parseSeedArgument(value)).toThrowError(/Invalid --seed/)
    }
  })

  it('rejects a count beyond the safe integer range', () => {
    expect(() =>
      parseSeedArgument('documents,99999999999999999999'),
    ).toThrowError(/too large/)
  })
})

describe('parseDbDelayArgument', () => {
  it('parses the documented millisecond layout', () => {
    expect(parseDbDelayArgument('2000ms')).toBe(2000)
    expect(parseDbDelayArgument('1500ms')).toBe(1500)
    expect(parseDbDelayArgument('0ms')).toBe(0)
  })

  it('treats an empty value as "delay nothing"', () => {
    expect(parseDbDelayArgument('')).toBe(0)
  })

  it('rejects values that are not <milliseconds>ms', () => {
    for (const value of [
      '2000',
      '2s',
      'ms',
      '2000ms500',
      '2000 ms',
      '2000MS',
      '-2000ms',
    ]) {
      expect(() => parseDbDelayArgument(value)).toThrowError(
        /Invalid --db-delay/,
      )
    }
  })

  it('accepts the largest timer delay and rejects anything longer', () => {
    expect(parseDbDelayArgument('2147483647ms')).toBe(2_147_483_647)
    expect(() => parseDbDelayArgument('2147483648ms')).toThrowError(/too long/)
    expect(() => parseDbDelayArgument('99999999999999999999ms')).toThrowError(
      /too long/,
    )
  })
})

describe('databaseOperationNames', () => {
  it('lists the operations the failure knob can make fail', () => {
    expect(databaseOperationNames).toEqual([
      'createDocument',
      'getDocument',
      'countDocuments',
      'listDocuments',
      'deleteDocument',
      'saveDocument',
    ])
  })
})

describe('parseDbFailureArgument', () => {
  it('parses the documented comma-separated list, in order', () => {
    expect(parseDbFailureArgument('createDocument')).toEqual(['createDocument'])
    expect(
      parseDbFailureArgument('countDocuments,getDocument,createDocument'),
    ).toEqual(['countDocuments', 'getDocument', 'createDocument'])
  })

  it('treats an empty value as "fail nothing"', () => {
    expect(parseDbFailureArgument('')).toEqual([])
  })

  it('rejects names that are not store operations', () => {
    for (const value of [
      'users',
      'CreateDocument',
      'close',
      'createDocument,',
    ]) {
      expect(() => parseDbFailureArgument(value)).toThrowError(
        /Invalid --with-db-failure operation/,
      )
    }
  })

  it('lists the valid operations in the error message', () => {
    expect(() => parseDbFailureArgument('users')).toThrowError(
      'Invalid --with-db-failure operation "users": valid operations are createDocument, getDocument, countDocuments, listDocuments, deleteDocument, saveDocument',
    )
  })
})

describe('openDatabase operation delay', () => {
  it('waits the configured delay before every operation runs', async () => {
    vi.useFakeTimers()

    try {
      const { database: store } = openTestDatabase({ operationDelayMs: 2000 })

      const operations = [
        store.createDocument(),
        store.countDocuments(),
        store.getDocument(1),
        store.listDocuments(),
      ] as const
      let settled = 0
      for (const operation of operations) {
        void operation.then(() => {
          settled += 1
        })
      }

      await vi.advanceTimersByTimeAsync(1999)
      expect(settled).toBe(0)

      await vi.advanceTimersByTimeAsync(1)
      const [created, count, fetched, listed] = await Promise.all(operations)
      expect(settled).toBe(4)

      expect(created.title).toBe(untitledDocumentTitle)
      expect(count).toBe(1)
      expect(fetched).toEqual(created)
      expect(listed).toEqual([created])
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits the configured delay before a save runs', async () => {
    vi.useFakeTimers()

    try {
      const { database: store } = openTestDatabase({ operationDelayMs: 2000 })

      let settled = false
      const saving = store.saveDocument(1, { title: 'گزارش' }).then((saved) => {
        settled = true
        return saved
      })

      await vi.advanceTimersByTimeAsync(1999)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(await saving).toBeUndefined()
      expect(settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('openDatabase failing operations', () => {
  it('fails only the selected operation, with the injected message', async () => {
    const { database: store } = openTestDatabase({
      failingOperations: ['countDocuments'],
    })

    const document = await store.createDocument()
    expect(await store.getDocument(document.id)).toEqual(document)

    await expect(store.countDocuments()).rejects.toThrowError(
      'The countDocuments operation failed (injected by --with-db-failure)',
    )
  })

  it('fails a selected create before its query, storing nothing', async () => {
    const { database: store } = openTestDatabase({
      failingOperations: ['createDocument'],
    })

    await expect(store.createDocument()).rejects.toThrowError(
      'The createDocument operation failed (injected by --with-db-failure)',
    )
    expect(await store.countDocuments()).toBe(0)
  })

  it('fails a selected document read with the injected message', async () => {
    const { database: store } = openTestDatabase({
      failingOperations: ['getDocument'],
    })

    const document = await store.createDocument()
    await expect(store.getDocument(document.id)).rejects.toThrowError(
      'The getDocument operation failed (injected by --with-db-failure)',
    )
  })

  it('fails a selected list read with the injected message', async () => {
    const { database: store } = openTestDatabase({
      failingOperations: ['listDocuments'],
    })

    await store.createDocument()
    await expect(store.listDocuments()).rejects.toThrowError(
      'The listDocuments operation failed (injected by --with-db-failure)',
    )
  })

  it('fails a selected delete before its query, removing nothing', async () => {
    const { database: store } = openTestDatabase({
      failingOperations: ['deleteDocument'],
    })

    const document = await store.createDocument()
    await expect(store.deleteDocument(document.id)).rejects.toThrowError(
      'The deleteDocument operation failed (injected by --with-db-failure)',
    )
    expect(await store.getDocument(document.id)).toEqual(document)
  })

  it('fails a selected save before its query, changing nothing', async () => {
    const { database: store } = openTestDatabase({
      failingOperations: ['saveDocument'],
    })

    const document = await store.createDocument()
    await expect(
      store.saveDocument(document.id, { title: 'گزارش' }),
    ).rejects.toThrowError(
      'The saveDocument operation failed (injected by --with-db-failure)',
    )
    expect(await store.getDocument(document.id)).toEqual(document)
  })

  it('fails nothing when the selection is empty', async () => {
    const { database: store } = openTestDatabase({ failingOperations: [] })

    const document = await store.createDocument()
    expect(await store.getDocument(document.id)).toEqual(document)
    expect(await store.countDocuments()).toBe(1)
  })

  it('fails the selected operations after the operation delay, like a slow query that then fails', async () => {
    vi.useFakeTimers()

    try {
      const { database: store } = openTestDatabase({
        operationDelayMs: 2000,
        failingOperations: [
          'createDocument',
          'getDocument',
          'countDocuments',
          'listDocuments',
          'deleteDocument',
          'saveDocument',
        ],
      })

      const failures: unknown[] = []
      let settled = 0
      const operations = [
        store.createDocument(),
        store.getDocument(1),
        store.countDocuments(),
        store.listDocuments(),
        store.deleteDocument(1),
        store.saveDocument(1, { title: 'گزارش' }),
      ] as const
      for (const operation of operations) {
        void operation.catch((error: unknown) => {
          failures.push(error)
          settled += 1
        })
      }

      await vi.advanceTimersByTimeAsync(1999)
      expect(settled).toBe(0)

      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toBe(6)
      for (const error of failures) {
        expect((error as Error).message).toMatch(
          /operation failed \(injected by --with-db-failure\)/,
        )
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('resetDatabase', () => {
  it('creates and migrates the database file when it does not exist yet', () => {
    const databasePath = temporaryDatabasePath()

    resetDatabase(databasePath, [])

    const raw = new DatabaseSync(databasePath)
    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: 1,
      })
      expect(
        raw.prepare('SELECT COUNT(*) AS count FROM documents').get(),
      ).toEqual({ count: 0 })
    } finally {
      raw.close()
    }
  })

  it('removes every previous record even without seed entries', async () => {
    const { database: store, databasePath } = openTestDatabase()
    await store.createDocument()
    await store.createDocument()
    store.close()
    database = undefined

    resetDatabase(databasePath, [])

    const reopened = openDatabase(databasePath)
    database = reopened
    expect(await reopened.countDocuments()).toBe(0)
  })

  it('inserts the requested number of documents with numbered titles', async () => {
    const databasePath = temporaryDatabasePath()

    resetDatabase(databasePath, [{ table: 'documents', count: 3 }])

    const store = openDatabase(databasePath)
    database = store

    expect(await store.countDocuments()).toBe(3)
    expect((await store.getDocument(1))?.title).toBe('سند 1')
    expect((await store.getDocument(3))?.title).toBe('سند 3')
    expect(await store.getDocument(4)).toBeUndefined()
  })

  it('staggers the seeded timestamps one minute apart starting from now', async () => {
    const databasePath = temporaryDatabasePath()
    const seededAt = Date.UTC(2026, 0, 1, 12, 0, 0)

    vi.useFakeTimers()
    try {
      vi.setSystemTime(seededAt)
      resetDatabase(databasePath, [{ table: 'documents', count: 3 }])
    } finally {
      vi.useRealTimers()
    }

    const store = openDatabase(databasePath)
    database = store

    expect(await store.getDocument(1)).toEqual({
      id: 1,
      title: 'سند 1',
      body: '',
      createdAt: seededAt,
      updatedAt: seededAt,
    })
    expect(await store.getDocument(2)).toEqual({
      id: 2,
      title: 'سند 2',
      body: '',
      createdAt: seededAt - 60_000,
      updatedAt: seededAt - 60_000,
    })
    expect(await store.getDocument(3)).toEqual({
      id: 3,
      title: 'سند 3',
      body: '',
      createdAt: seededAt - 120_000,
      updatedAt: seededAt - 120_000,
    })
  })

  it('replaces the previous records on every seed', async () => {
    const { database: store, databasePath } = openTestDatabase()
    await store.createDocument()
    store.close()
    database = undefined

    resetDatabase(databasePath, [{ table: 'documents', count: 2 }])
    resetDatabase(databasePath, [{ table: 'documents', count: 5 }])

    const reopened = openDatabase(databasePath)
    database = reopened
    expect(await reopened.countDocuments()).toBe(5)
  })

  it('rejects unknown tables and keeps the previous records', async () => {
    const { database: store, databasePath } = openTestDatabase()
    await store.createDocument()
    store.close()
    database = undefined

    expect(() =>
      resetDatabase(databasePath, [{ table: 'users', count: 50 }]),
    ).toThrowError('Cannot seed table "users": no such table')

    const reopened = openDatabase(databasePath)
    database = reopened
    expect(await reopened.countDocuments()).toBe(1)
  })
})
