/**
 * tests/unit/helpers/zipWriter.ts
 * A minimal STORED (uncompressed) zip writer, for building archive fixtures at
 * test time.
 *
 * Why this exists rather than a dependency or a committed binary (issue #10):
 *  - yauzl, the reader under test, is read-only.
 *  - `archiver` / `zip-stream` are only present transitively; depending on them
 *    to test our own reader would be a real new dependency for test scaffolding.
 *  - `Compress-Archive` would make the suite Windows-only.
 *
 * yauzl reads compression method 0 (STORED) without complaint, so ~90 lines of
 * pure Node buys fixtures that are readable, reviewable code instead of blobs
 * nobody can diff.
 *
 * Deliberately minimal: no ZIP64, no encryption, no data descriptors, no
 * directory entries (the reader skips names ending in `/` anyway, and a path
 * inside a file entry is all that nesting requires). Do not grow this into a
 * general-purpose zip library — if a fixture needs more, question the fixture.
 */

import { writeFileSync } from 'fs'

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ -1) >>> 0
}

export interface ZipEntry {
  /** Path inside the archive. Always forward slashes, even on Windows. */
  path: string
  content: string
}

/**
 * Build a zip in memory. Entries land in the central directory in the order
 * given — which is what lets a fixture put the *wrong* product first and prove
 * the reader does not simply take the first basename match.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  // A fixed DOS timestamp keeps fixture bytes stable across runs.
  const dosTime = 0x6000 // 12:00:00
  const dosDate = 0x5901 // 2024-08-01

  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.path, 'utf-8')
    const dataBuf = Buffer.from(entry.content, 'utf-8')
    const crc = crc32(dataBuf)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed to extract (2.0)
    local.writeUInt16LE(0, 6) // general purpose bit flag
    local.writeUInt16LE(0, 8) // compression method: 0 = STORED
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(dataBuf.length, 18) // compressed size
    local.writeUInt32LE(dataBuf.length, 22) // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    locals.push(local, nameBuf, dataBuf)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central file header signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed to extract
    central.writeUInt16LE(0, 8) // general purpose bit flag
    central.writeUInt16LE(0, 10) // compression method
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(dataBuf.length, 20)
    central.writeUInt32LE(dataBuf.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // extra field length
    central.writeUInt16LE(0, 32) // file comment length
    central.writeUInt16LE(0, 34) // disk number start
    central.writeUInt16LE(0, 36) // internal file attributes
    central.writeUInt32LE(0, 38) // external file attributes
    central.writeUInt32LE(offset, 42) // relative offset of local header
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + dataBuf.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  end.writeUInt16LE(0, 4) // number of this disk
  end.writeUInt16LE(0, 6) // disk where central directory starts
  end.writeUInt16LE(entries.length, 8) // central directory records on this disk
  end.writeUInt16LE(entries.length, 10) // total central directory records
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16) // offset of start of central directory
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...locals, centralBuf, end])
}

/** Build a zip and write it to `filePath`. Returns the path, for chaining. */
export function writeZip(filePath: string, entries: ZipEntry[]): string {
  writeFileSync(filePath, buildZip(entries))
  return filePath
}
