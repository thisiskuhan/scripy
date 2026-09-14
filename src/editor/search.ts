import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node as ProseMirrorNode } from 'prosemirror-model'

export interface Match {
  from: number
  to: number
}
interface SearchState {
  query: string
  matches: Match[]
  decorations: DecorationSet
}
export const searchKey = new PluginKey<SearchState>('search')

export function findMatches(doc: ProseMirrorNode, query: string): Match[] {
  if (!query) return []
  const matches: Match[] = []
  const needle = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  doc.forEach((node, position) => {
    for (const match of node.textContent.matchAll(needle)) {
      const start = position + 1 + match.index!
      matches.push({ from: start, to: start + match[0].length })
    }
  })
  return matches
}

export function searchPlugin() {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({ query: '', matches: [], decorations: DecorationSet.empty }),
      apply(transaction, previous) {
        const query = (transaction.getMeta(searchKey) as string | undefined) ?? previous.query
        if (!transaction.docChanged && query === previous.query) return previous
        const matches = findMatches(transaction.doc, query)
        return {
          query,
          matches,
          decorations: DecorationSet.create(
            transaction.doc,
            matches.map((match) => Decoration.inline(match.from, match.to, { class: 'search-match' })),
          ),
        }
      },
    },
    props: { decorations: (state) => searchKey.getState(state)?.decorations },
  })
}
