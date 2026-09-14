import { describe, expect, it } from 'vitest'
import { MOVIE_QUOTES, quoteIndex } from './movie-quotes'

describe('login quotes', () => {
  it('keeps a film attribution and highlighted phrase for every quote', () => {
    for (const quote of MOVIE_QUOTES) {
      expect(quote.film).not.toBe('')
      expect(quote.highlight).not.toBe('')
      expect(quote.year).toBeGreaterThan(1900)
    }
  })
  it('chooses every quote without immediately repeating the previous load', () => {
    for (let previous = 0; previous < MOVIE_QUOTES.length; previous += 1) {
      const choices = new Set(
        Array.from({ length: MOVIE_QUOTES.length - 1 }, (_, index) =>
          quoteIndex(previous, index / (MOVIE_QUOTES.length - 1)),
        ),
      )
      expect(choices.size).toBe(MOVIE_QUOTES.length - 1)
      expect(choices.has(previous)).toBe(false)
    }
  })
})
