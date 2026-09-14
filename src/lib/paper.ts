export const PAPER_SIZES = ['letter', 'a4'] as const
export type PaperSize = (typeof PAPER_SIZES)[number]

export const PAPER_LABELS: Record<PaperSize, string> = { letter: 'US Letter', a4: 'A4' }

export function paperMetrics(size: PaperSize = 'letter') {
  const width = size === 'a4' ? (210 / 25.4) * 96 : 816
  const height = size === 'a4' ? (297 / 25.4) * 96 : 1056
  const top = 96
  const bottom = 96
  const lineHeight = 16
  return {
    width,
    height,
    top,
    bottom,
    left: 144,
    right: 96,
    lineHeight,
    gap: 32,
    charWidth: 9.6,
    rows: Math.floor((height - top - bottom) / lineHeight),
  }
}
