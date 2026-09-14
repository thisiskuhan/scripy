import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Fragment, Slice } from 'prosemirror-model'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { inputRules } from 'prosemirror-inputrules'
import {
  ELEMENTS,
  getCharacters,
  importFountain,
  makeBlock,
  type ElementKind,
  type ScriptBlock,
} from '../lib/screenplay'
import { elementMetrics, type ScriptLayout } from '../lib/layout'
import { paperMetrics, type PaperSize } from '../lib/paper'
import {
  documentBoundary,
  fromEditorDoc,
  sceneHeadingRule,
  screenplayEnter,
  screenplaySchema,
  screenplayTab,
  setElement,
  stableIds,
  toEditorDoc,
} from '../editor/model'
import { paginationKey, paginationPlugin } from '../editor/pagination'
import { findMatches, searchKey, searchPlugin } from '../editor/search'

export interface EditorInfo {
  blockId: string
  kind: ElementKind
  page: number
  pages: number
  canUndo: boolean
  canRedo: boolean
}
export interface EditorHandle {
  getBlocks(): ScriptBlock[]
  setKind(kind: ElementKind): void
  undo(): void
  redo(): void
  focus(): void
  goTo(id: string): void
  addScene(): void
  replaceBlocks(blocks: ScriptBlock[]): void
  search(query: string, direction?: -1 | 1): number
  countMatches(query: string): number
  replace(query: string, replacement: string, all: boolean): number
}
interface Props {
  initialBlocks: ScriptBlock[]
  documentKey: string
  paperSize: PaperSize
  zoom: number
  sceneNumbers: boolean
  spellcheck: boolean
  readOnly: boolean
  onChange(blocks: ScriptBlock[]): boolean
  onSelection(info: EditorInfo): void
  onLayout(layout: ScriptLayout): void
  onFind(): void
}

export const ScreenplayEditor = forwardRef<EditorHandle, Props>(function ScreenplayEditor(props, ref) {
  const mount = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [pageCount, setPageCount] = useState(1)
  const [suggestions, setSuggestions] = useState<{ names: string[]; left: number; top: number } | null>(null)
  const priorInfo = useRef('')

  useEffect(() => {
    if (!mount.current) return
    const completeName = () => {
      const current = view.current
      if (!current) return false
      const block = current.state.selection.$from.parent
      const text = block.textContent.trim().toUpperCase()
      if (block.attrs.kind !== 'character' || !text) return false
      const match = getCharacters(fromEditorDoc(current.state.doc)).find(
        (character) => character.name.startsWith(text) && character.name !== text,
      )
      if (!match) return false
      const start = current.state.selection.$from.start()
      current.dispatch(current.state.tr.insertText(match.name, start, start + block.content.size))
      return true
    }
    const shortcuts = Object.fromEntries(
      ELEMENTS.map((kind, index) => [`Alt-${index + 1}`, setElement(kind)]),
    )
    const state = EditorState.create({
      doc: toEditorDoc(latest.current.initialBlocks),
      plugins: [
        stableIds,
        history({ depth: 200 }),
        paginationPlugin(latest.current.paperSize),
        searchPlugin(),
        inputRules({ rules: [sceneHeadingRule] }),
        keymap({
          ...shortcuts,
          Enter: screenplayEnter,
          Tab: (editorState, dispatch, editorView) =>
            completeName() || screenplayTab()(editorState, dispatch, editorView),
          'Shift-Tab': screenplayTab(true),
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          'Mod-y': redo,
          'Mod-End': documentBoundary(true),
          'Mod-Home': documentBoundary(false),
          'Mod-f': () => {
            latest.current.onFind()
            return true
          },
        }),
        keymap(baseKeymap),
      ],
    })
    const editor = new EditorView(mount.current, {
      state,
      editable: () => !latest.current.readOnly,
      attributes: {
        class: 'screenplay-editor',
        role: 'textbox',
        'aria-label': 'Screenplay editor',
        'aria-multiline': 'true',
        spellcheck: String(latest.current.spellcheck),
      },
      handleDOMEvents: {
        blur: () => {
          setSuggestions(null)
          return false
        },
      },
      clipboardTextParser(text, context) {
        let blocks: ScriptBlock[]
        if (/^(?:INT\.|EXT\.|\.(?:INT|EXT)|Title:)/im.test(text)) {
          try {
            blocks = importFountain(text).blocks
          } catch {
            blocks = [makeBlock(context.parent.attrs.kind as ElementKind, text)]
          }
        } else {
          blocks = text
            .replace(/\r/g, '')
            .split(/\n\s*\n/)
            .map((line, index) =>
              makeBlock(index === 0 ? (context.parent.attrs.kind as ElementKind) : 'action', line),
            )
        }
        return new Slice(
          Fragment.fromArray(
            blocks.map((block) =>
              screenplaySchema.nodes.block.create(
                { kind: block.kind, id: block.id },
                block.text ? screenplaySchema.text(block.text) : null,
              ),
            ),
          ),
          1,
          1,
        )
      },
      dispatchTransaction(transaction) {
        if (transaction.docChanged && latest.current.readOnly) return
        const result = editor.state.applyTransaction(transaction)
        if (
          result.transactions.some((item) => item.docChanged) &&
          !latest.current.onChange(fromEditorDoc(result.state.doc))
        )
          return
        editor.updateState(result.state)
        publish(result.transactions.some((item) => item.docChanged || item.getMeta(paginationKey)))
      },
    })
    view.current = editor
    function publish(layoutChanged: boolean) {
      const current = editor.state
      const layout = paginationKey.getState(current)!.layout
      const block = current.selection.$from.parent
      const selectedPart = [...layout.parts]
        .reverse()
        .find(
          (part) =>
            !part.marker &&
            part.blockId === block.attrs.id &&
            part.lines[0].from <= current.selection.$from.parentOffset,
        )
      const info: EditorInfo = {
        blockId: block.attrs.id as string,
        kind: block.attrs.kind as ElementKind,
        page: selectedPart ? selectedPart.page + 1 : (layout.blockPages.get(block.attrs.id as string) ?? 1),
        pages: layout.pageCount,
        canUndo: undoDepth(current) > 0,
        canRedo: redoDepth(current) > 0,
      }
      const encoded = JSON.stringify(info)
      if (encoded !== priorInfo.current) {
        priorInfo.current = encoded
        latest.current.onSelection(info)
      }
      if (layoutChanged) {
        setPageCount(layout.pageCount)
        startTransition(() => latest.current.onLayout(layout))
      }
      const text = block.textContent.trim().toUpperCase()
      if (block.attrs.kind === 'character' && text && editor.hasFocus()) {
        const names = getCharacters(fromEditorDoc(current.doc))
          .map((character) => character.name)
          .filter((name) => name.startsWith(text) && name !== text)
          .slice(0, 4)
        if (names.length) {
          const coords = editor.coordsAtPos(current.selection.from)
          setSuggestions({ names, left: coords.left, top: coords.bottom + 6 })
          return
        }
      }
      setSuggestions(null)
    }
    publish(true)
    return () => {
      editor.destroy()
      view.current = null
      priorInfo.current = ''
    }
  }, [props.documentKey])

  useEffect(() => {
    view.current?.dom.setAttribute('spellcheck', String(props.spellcheck))
    view.current?.setProps({ editable: () => !latest.current.readOnly })
  }, [props.spellcheck, props.readOnly])

  useEffect(() => {
    const current = view.current
    if (current && paginationKey.getState(current.state)?.layout.paperSize !== props.paperSize) {
      current.dispatch(
        current.state.tr.setMeta(paginationKey, props.paperSize).setMeta('addToHistory', false),
      )
    }
  }, [props.paperSize])

  useImperativeHandle(
    ref,
    () => ({
      getBlocks: () => (view.current ? fromEditorDoc(view.current.state.doc) : latest.current.initialBlocks),
      setKind(kind) {
        const current = view.current
        if (current && !latest.current.readOnly) {
          setElement(kind)(current.state, current.dispatch)
          current.focus()
        }
      },
      undo() {
        const current = view.current
        if (current && !latest.current.readOnly) {
          undo(current.state, current.dispatch)
          current.focus()
        }
      },
      redo() {
        const current = view.current
        if (current && !latest.current.readOnly) {
          redo(current.state, current.dispatch)
          current.focus()
        }
      },
      focus() {
        view.current?.focus()
      },
      goTo(id) {
        const current = view.current
        if (!current) return
        current.state.doc.forEach((node, position) => {
          if (node.attrs.id === id)
            current.dispatch(
              current.state.tr
                .setSelection(TextSelection.create(current.state.doc, position + 1))
                .scrollIntoView(),
            )
        })
        current.focus()
      },
      addScene() {
        const current = view.current
        if (!current || latest.current.readOnly) return
        const position = current.state.doc.content.size
        const node = screenplaySchema.nodes.block.create(
          { kind: 'scene', id: crypto.randomUUID() },
          screenplaySchema.text('INT. '),
        )
        const transaction = current.state.tr.insert(position, node)
        current.dispatch(
          transaction.setSelection(TextSelection.create(transaction.doc, position + 6)).scrollIntoView(),
        )
        current.focus()
      },
      replaceBlocks(blocks) {
        const current = view.current
        if (!current || latest.current.readOnly) return
        current.dispatch(
          current.state.tr.replaceWith(0, current.state.doc.content.size, toEditorDoc(blocks).content),
        )
      },
      search(query, direction = 1) {
        const current = view.current
        if (!current) return 0
        const matches = findMatches(current.state.doc, query)
        const transaction = current.state.tr.setMeta(searchKey, query)
        const position = current.state.selection.from
        const match =
          direction === 1
            ? (matches.find((item) => item.from > position) ?? matches[0])
            : ([...matches].reverse().find((item) => item.from < position) ?? matches[matches.length - 1])
        if (match)
          transaction
            .setSelection(TextSelection.create(transaction.doc, match.from, match.to))
            .scrollIntoView()
        current.dispatch(transaction)
        return matches.length
      },
      countMatches(query) {
        const current = view.current
        if (!current) return 0
        const search = searchKey.getState(current.state)
        return search?.query === query ? search.matches.length : findMatches(current.state.doc, query).length
      },
      replace(query, replacement, all) {
        const current = view.current
        if (!current || !query || latest.current.readOnly) return 0
        const matches = findMatches(current.state.doc, query)
        const selected = all
          ? matches
          : matches.filter(
              (match) =>
                match.from === current.state.selection.from && match.to === current.state.selection.to,
            )
        const transaction = current.state.tr
        for (const match of [...selected].reverse()) transaction.insertText(replacement, match.from, match.to)
        if (selected.length) current.dispatch(transaction)
        return selected.length
      },
    }),
    [],
  )

  const page = paperMetrics(props.paperSize)
  const metrics = elementMetrics(props.paperSize)
  const height = pageCount * page.height + (pageCount - 1) * page.gap
  return (
    <>
      <div className="paper-scale" style={{ width: page.width * props.zoom, height: height * props.zoom }}>
        <div
          className={`paper-stack ${props.sceneNumbers ? 'show-scene-numbers' : ''}`}
          data-paper-size={props.paperSize}
          style={
            {
              width: page.width,
              minHeight: height,
              transform: `scale(${props.zoom})`,
              '--script-line-width': `${metrics.action.columns * page.charWidth}px`,
            } as CSSProperties
          }
        >
          <div className="paper-backgrounds" aria-hidden="true">
            {Array.from({ length: pageCount }, (_, index) => (
              <div
                className="paper-sheet"
                key={index}
                style={{ top: index * (page.height + page.gap), height: page.height }}
              >
                {index > 0 && <span className="printed-page-number">{index + 1}.</span>}
              </div>
            ))}
          </div>
          <div className="editor-mount" ref={mount} />
        </div>
      </div>
      {suggestions && (
        <div
          className="character-suggestions"
          style={{ left: Math.min(suggestions.left, window.innerWidth - 240), top: suggestions.top }}
          role="listbox"
          aria-label="Character suggestions"
        >
          {suggestions.names.map((name) => (
            <button
              key={name}
              role="option"
              aria-selected="false"
              onMouseDown={(event) => {
                event.preventDefault()
                const current = view.current
                if (!current) return
                const selection = current.state.selection.$from
                current.dispatch(current.state.tr.insertText(name, selection.start(), selection.end()))
                current.focus()
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </>
  )
})
