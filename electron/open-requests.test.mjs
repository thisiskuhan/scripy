import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import requests from './open-requests.cjs'

describe('operating-system screenplay opening', () => {
  it('accepts absolute, relative, spaced, uppercase, and file-URL screenplay paths', () => {
    const root = path.resolve('test-workspace')
    expect(
      requests.screenplayArguments(
        [
          '/usr/bin/scripy',
          'electron/main.cjs',
          '--inspect',
          '--flag.scripy',
          'The First Draft.scripy',
          path.join(root, 'Second.SCRIPY'),
          pathToFileURL(path.join(root, 'Third Draft.scripy')).href,
          'notes.pdf',
        ],
        root,
      ),
    ).toEqual([
      path.join(root, 'The First Draft.scripy'),
      path.join(root, 'Second.SCRIPY'),
      path.join(root, 'Third Draft.scripy'),
    ])
  })

  it('queues separate files in order until the renderer is ready', () => {
    const queue = new requests.OpenRequests()
    const root = path.resolve('test-workspace')
    queue.add(['First.scripy', 'Second.scripy', 'First.scripy'], root)
    expect(queue.take()).toBe(path.join(root, 'First.scripy'))
    expect(queue.take()).toBe(path.join(root, 'Second.scripy'))
    expect(queue.take()).toBeNull()
    queue.add(['First.scripy'], root)
    expect(queue.take()).toBe(path.join(root, 'First.scripy'))
  })
})
