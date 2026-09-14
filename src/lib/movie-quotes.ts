export const MOVIE_QUOTES = [
  { film: 'The Godfather', year: 1972, text: "I'm gonna make him an offer ", highlight: "he can't refuse." },
  { film: 'The Dark Knight', year: 2008, text: 'Why so ', highlight: 'serious?' },
  {
    film: 'The Shawshank Redemption',
    year: 1994,
    text: 'Hope is a good thing, ',
    highlight: 'maybe the best of things.',
  },
  {
    film: 'Forrest Gump',
    year: 1994,
    text: 'Life is like a box of chocolates. ',
    highlight: "You never know what you're gonna get.",
  },
  { film: 'Gladiator', year: 2000, text: 'What we do in life ', highlight: 'echoes in eternity.' },
  { film: 'The Matrix', year: 1999, text: 'There is ', highlight: 'no spoon.' },
  {
    film: 'The Lord of the Rings: The Two Towers',
    year: 2002,
    text: 'There is some good in this world, Mr. Frodo. ',
    highlight: "And it's worth fighting for.",
  },
  {
    film: 'Pulp Fiction',
    year: 1994,
    text: "Say 'what' again. ",
    highlight: 'I dare you, I double dare you.',
  },
  {
    film: 'Fight Club',
    year: 1999,
    text: 'The first rule of Fight Club is: ',
    highlight: 'you do not talk about Fight Club.',
  },
  {
    film: 'Interstellar',
    year: 2014,
    text: 'Love is the one thing that ',
    highlight: 'transcends time and space.',
  },
  { film: 'Avengers: Endgame', year: 2019, text: 'I love you ', highlight: '3000.' },
  { film: 'Iron Man', year: 2008, text: 'I am ', highlight: 'Iron Man.' },
  { film: 'Spider-Man', year: 2002, text: 'With great power comes ', highlight: 'great responsibility.' },
  { film: 'The Dark Knight Rises', year: 2012, text: 'A hero can be ', highlight: 'anyone.' },
  { film: 'Dune', year: 2021, text: 'Fear is ', highlight: 'the mind-killer.' },
  { film: 'Dune: Part Two', year: 2024, text: 'Long live ', highlight: 'the fighters.' },
  { film: 'Top Gun: Maverick', year: 2022, text: "It's not the plane, ", highlight: "it's the pilot." },
  { film: 'Titanic', year: 1997, text: "I'm the king ", highlight: 'of the world!' },
  { film: 'Terminator 2: Judgment Day', year: 1991, text: 'Hasta la vista, ', highlight: 'baby.' },
  { film: 'The Terminator', year: 1984, text: "I'll be ", highlight: 'back.' },
  { film: 'Predator', year: 1987, text: 'Get to ', highlight: 'the chopper!' },
  {
    film: 'The Godfather Part II',
    year: 1974,
    text: 'Keep your friends close, ',
    highlight: 'but your enemies closer.',
  },
  { film: 'V for Vendetta', year: 2005, text: 'Ideas are ', highlight: 'bulletproof.' },
  { film: '300', year: 2006, text: 'This is ', highlight: 'Sparta!' },
  {
    film: 'John Wick',
    year: 2014,
    text: "People keep asking if I'm back. ",
    highlight: "And I haven't really had an answer.",
  },
  {
    film: 'The Dark Knight',
    year: 2008,
    text: 'You either die a hero, ',
    highlight: 'or you live long enough to see yourself become the villain.',
  },
  { film: 'The Matrix', year: 1999, text: 'What is ', highlight: 'real?' },
  {
    film: 'Interstellar',
    year: 2014,
    text: 'We used to look up at the sky ',
    highlight: 'and wonder at our place in the stars.',
  },
  {
    film: 'The Lord of the Rings: The Fellowship of the Ring',
    year: 2001,
    text: 'All we have to decide is ',
    highlight: 'what to do with the time that is given us.',
  },
  {
    film: 'Good Will Hunting',
    year: 1997,
    text: 'Some people can never believe in themselves ',
    highlight: 'until someone believes in them.',
  },
  { film: 'Dead Poets Society', year: 1989, text: 'Carpe diem. ', highlight: 'Seize the day, boys.' },
  {
    film: 'Rocky Balboa',
    year: 2006,
    text: "It ain't about how hard you hit. ",
    highlight: "It's about how hard you can get hit and keep moving forward.",
  },
  {
    film: 'The Lord of the Rings: The Return of the King',
    year: 2003,
    text: "I can't carry it for you... ",
    highlight: 'but I can carry you.',
  },
  { film: 'Interstellar', year: 2014, text: 'Because my dad ', highlight: 'promised me.' },
  { film: 'Avengers: Endgame', year: 2019, text: 'Part of the journey is ', highlight: 'the end.' },
  { film: 'Good Will Hunting', year: 1997, text: "It's not ", highlight: 'your fault.' },
  {
    film: 'The Pursuit of Happyness',
    year: 2006,
    text: "Don't ever let somebody tell you ",
    highlight: "you can't do something.",
  },
] as const

export function quoteIndex(previous: number, random = Math.random()) {
  const skipPrevious = Number.isInteger(previous) && previous >= 0 && previous < MOVIE_QUOTES.length
  const index = Math.floor(
    Math.max(0, Math.min(0.999999, random)) * (MOVIE_QUOTES.length - Number(skipPrevious)),
  )
  return skipPrevious && index >= previous ? index + 1 : index
}

let currentQuote: (typeof MOVIE_QUOTES)[number] | undefined

export function quoteForPageLoad() {
  if (currentQuote) return currentQuote
  let previous = -1
  try {
    const stored = sessionStorage.getItem('scripy.login-quote')
    if (stored !== null) previous = Number(stored)
  } catch {
    previous = -1
  }
  const index = quoteIndex(previous)
  currentQuote = MOVIE_QUOTES[index]
  try {
    sessionStorage.setItem('scripy.login-quote', String(index))
  } catch {
    return currentQuote
  }
  return currentQuote
}
