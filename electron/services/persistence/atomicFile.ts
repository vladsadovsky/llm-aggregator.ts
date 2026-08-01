/**
 * Atomic, synchronous same-directory file write (`INV-DATA`).
 *
 * The last valid target survives until a complete replacement has been written,
 * flushed, validated, and promoted. On any failure before promotion the original
 * target is left byte-identical and only this operation's temp file is cleaned
 * up — a crash, disk-full, permission error, or antivirus lock can never leave a
 * half-written control file in place of a good one.
 *
 * Kept synchronous to match the existing services (settings, threads, tags, QA).
 * All filesystem calls go through an injectable `FileOps` so tests can fail each
 * individual step deterministically.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { dirname, resolve } from 'path'
import { randomBytes } from 'crypto'

export interface FileOps {
  existsSync(p: string): boolean
  mkdirSync(p: string, opts: { recursive: boolean }): void
  readFileSync(p: string): Buffer
  openSync(p: string, flags: string): number
  writeSync(fd: number, data: Buffer): number
  fsyncSync(fd: number): void
  closeSync(fd: number): void
  renameSync(from: string, to: string): void
  unlinkSync(p: string): void
}

/** Default FileOps bound to Node `fs`. */
export const nodeFileOps: FileOps = {
  existsSync,
  mkdirSync: (p, opts) => {
    mkdirSync(p, opts)
  },
  readFileSync: (p) => readFileSync(p),
  openSync,
  writeSync: (fd, data) => writeSync(fd, data),
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
}

export interface AtomicWriteOptions {
  /** Inject a FileOps for testing. Defaults to Node `fs`. */
  fileOps?: FileOps
  /**
   * Keep the previous target as a `<name>.bak` last-known-good sibling. Intended
   * for small control files (settings, threads, tags, secrets envelope), not for
   * the whole archive.
   */
  keepLastKnownGood?: boolean
  /**
   * Read the temp file back and hand its bytes to this validator before
   * promotion. Throw to reject. Used to prove a JSON/envelope round-trips.
   */
  validate?: (written: Buffer) => void
}

export interface AtomicWriteResult {
  operationId: string
  /** Absolute path that was written. */
  path: string
  /** Byte length written. */
  bytes: number
  /** Last-known-good sibling path, when `keepLastKnownGood` preserved one. */
  lastKnownGoodPath?: string
}

export class AtomicWriteError extends Error {
  readonly step: string
  constructor(step: string, cause: unknown) {
    super(`atomic write failed at ${step}`)
    this.name = 'AtomicWriteError'
    this.step = step
    if (cause instanceof Error) this.stack = cause.stack
  }
}

/** Transient errors where a same-directory rename can still succeed on retry (Windows AV/indexer locks). */
const TRANSIENT_PROMOTE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST'])
const PROMOTE_MAX_RETRIES = 5
const PROMOTE_BACKOFF_MS = 10

/** Synchronous sleep (the service is sync); only ever reached on the rare retry path. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Promote the temp file over the target by rename. POSIX rename is an atomic
 * replace, and on Windows a same-directory rename is too — but Windows can
 * transiently fail it with EPERM/EACCES/EBUSY/EEXIST when an antivirus scanner
 * or the search indexer holds a brief handle on the target (the plan's P0-D
 * failure matrix). Retry a bounded number of times with a short backoff; a
 * non-transient error (e.g. ENOENT) fails immediately without retrying.
 */
function promoteWithRetry(fops: FileOps, tmp: string, target: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fops.renameSync(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (attempt >= PROMOTE_MAX_RETRIES || code === undefined || !TRANSIENT_PROMOTE_CODES.has(code)) {
        throw err
      }
      sleepSync(PROMOTE_BACKOFF_MS * (attempt + 1))
    }
  }
}

function newTempPath(target: string): string {
  return `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
}

/**
 * Write `data` to `targetPath` atomically. Returns a structured outcome that logs
 * a path category and byte count — never file contents.
 */
export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  options: AtomicWriteOptions = {},
): AtomicWriteResult {
  const fops = options.fileOps ?? nodeFileOps
  const target = resolve(targetPath)
  const dir = dirname(target)
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8')
  const operationId = randomBytes(8).toString('hex')

  // 1. Ensure the directory exists.
  try {
    if (!fops.existsSync(dir)) fops.mkdirSync(dir, { recursive: true })
  } catch (err) {
    throw new AtomicWriteError('mkdir', err)
  }

  // 2. Exclusive-create a uniquely named sibling temp file.
  let tmp = newTempPath(target)
  let fd: number
  for (let attempt = 0; ; attempt += 1) {
    try {
      fd = fops.openSync(tmp, 'wx')
      break
    } catch (err) {
      if (attempt < 5 && (err as NodeJS.ErrnoException).code === 'EEXIST') {
        tmp = newTempPath(target)
        continue
      }
      throw new AtomicWriteError('open', err)
    }
  }

  // 3. Write, flush, close.
  try {
    fops.writeSync(fd, bytes)
  } catch (err) {
    safeClose(fops, fd)
    safeUnlink(fops, tmp)
    throw new AtomicWriteError('write', err)
  }
  try {
    fops.fsyncSync(fd)
  } catch (err) {
    safeClose(fops, fd)
    safeUnlink(fops, tmp)
    throw new AtomicWriteError('fsync', err)
  }
  try {
    fops.closeSync(fd)
  } catch (err) {
    safeUnlink(fops, tmp)
    throw new AtomicWriteError('close', err)
  }

  // 4. Optional read-back validation before we touch the real target.
  if (options.validate) {
    try {
      const readBack = fops.readFileSync(tmp)
      options.validate(readBack)
    } catch (err) {
      safeUnlink(fops, tmp)
      throw new AtomicWriteError('validate', err)
    }
  }

  // 5. Preserve the previous target as last-known-good (small control files).
  let lastKnownGoodPath: string | undefined
  if (options.keepLastKnownGood && fops.existsSync(target)) {
    const bak = `${target}.bak`
    try {
      const current = fops.readFileSync(target)
      // The .bak itself is written atomically-enough: a partial .bak never
      // endangers the live target, which is still intact at this point.
      writeBackup(fops, bak, current)
      lastKnownGoodPath = bak
    } catch {
      // Backup is best-effort insurance; do not abort the primary write.
      lastKnownGoodPath = undefined
    }
  }

  // 6. Promote by same-directory rename (atomic replace on Windows and POSIX),
  //    retrying transient Windows AV/indexer locks a bounded number of times.
  try {
    promoteWithRetry(fops, tmp, target)
  } catch (err) {
    safeUnlink(fops, tmp)
    throw new AtomicWriteError('promote', err)
  }

  return { operationId, path: target, bytes: bytes.length, lastKnownGoodPath }
}

/** Convenience: serialize an object as pretty JSON and round-trip-validate it. */
export function atomicWriteJsonSync(
  targetPath: string,
  value: unknown,
  options: AtomicWriteOptions = {},
): AtomicWriteResult {
  const json = JSON.stringify(value, null, 2)
  return atomicWriteFileSync(targetPath, json, {
    ...options,
    validate: (written) => {
      JSON.parse(written.toString('utf-8'))
      options.validate?.(written)
    },
  })
}

function writeBackup(fops: FileOps, bakPath: string, data: Buffer): void {
  // Use the injectable ops when possible; fall back to fs for the default path.
  if (fops === nodeFileOps) {
    writeFileSync(bakPath, data)
    return
  }
  const fd = fops.openSync(bakPath, 'w')
  try {
    fops.writeSync(fd, data)
    fops.fsyncSync(fd)
  } finally {
    safeClose(fops, fd)
  }
}

function safeClose(fops: FileOps, fd: number): void {
  try {
    fops.closeSync(fd)
  } catch {
    /* already closed / best effort */
  }
}

function safeUnlink(fops: FileOps, p: string): void {
  try {
    if (fops.existsSync(p)) fops.unlinkSync(p)
  } catch {
    /* best effort */
  }
}
