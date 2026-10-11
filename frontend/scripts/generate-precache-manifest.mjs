import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const assetDirectory = path.join(distDirectory, 'assets')

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) return listFiles(path.join(directory, entry.name), relativePath)
    return [`/assets/${relativePath}`]
  }))
  return files.flat()
}

const assets = (await listFiles(assetDirectory)).sort()
const buildId = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12)
await writeFile(path.join(distDirectory, 'precache-manifest.json'), JSON.stringify(assets))

const workerPath = path.join(distDirectory, 'sw.js')
const worker = await readFile(workerPath, 'utf8')
await writeFile(workerPath, worker.replaceAll('__BUILD_ID__', buildId))

process.stdout.write(`Prepared an offline app shell with ${assets.length} local assets.\n`)
