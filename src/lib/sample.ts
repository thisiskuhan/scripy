import { createScreenplay, makeBlock, type ElementKind, type Screenplay } from './screenplay'

export function sampleScreenplay(): Screenplay {
  const project = createScreenplay('The Quiet Hours')
  const lines: [ElementKind, string][] = [
    ['scene', 'EXT. CITY ROOFTOPS - PRE-DAWN'],
    ['action', 'The city holds its breath.'],
    [
      'action',
      'A thousand windows. Most dark. A few keeping secrets. Somewhere below, the first train of the morning traces a silver line through the sleeping streets.',
    ],
    ['action', 'On a rooftop, a small red light blinks.'],
    [
      'action',
      'LENA PARK, 29, stands perfectly still. Headphones on. A field recorder in her hand. Listening to something the rest of the city has forgotten how to hear.',
    ],
    ['parenthetical', '(a long, quiet beat)'],
    ['action', 'She presses STOP. The red light disappears.'],
    ['scene', "INT. LENA'S APARTMENT - PRE-DAWN"],
    [
      'action',
      'A kettle warming. Plants leaning toward the window. Stacks of cassette tapes, each labeled in the same careful handwriting.',
    ],
    [
      'action',
      'Lena sets the recorder beside a half-finished cup of tea. Her phone lights up. A voice message from ELI.',
    ],
    ['character', 'ELI (V.O.)'],
    [
      'dialogue',
      "You're probably already awake. I found something at the station. One of Dad's tapes. Thought you'd want to hear it.",
    ],
    ['action', 'Lena reaches for the phone. Stops. Looks at the tapes.'],
    ['character', 'LENA'],
    ['parenthetical', '(to the empty room)'],
    ['dialogue', 'You always did have good timing.'],
    ['transition', 'CUT TO:'],
    ['scene', 'EXT. CORNER CAFE - DAWN'],
    [
      'action',
      'A metal shutter rattles upward. SAMIR, 60s, carries two chairs onto the pavement. He places them in the exact same spots as yesterday.',
    ],
    ['action', 'Lena passes, recorder tucked into her coat. Samir lifts a paper cup. Already made.'],
    ['character', 'SAMIR'],
    ['dialogue', 'The usual silence?'],
    ['character', 'LENA'],
    ['dialogue', 'Something like that.'],
    [
      'action',
      'She takes the coffee. A tram bell rings at the far end of the street. Lena turns toward it. Samir notices.',
    ],
    ['character', 'SAMIR'],
    ['dialogue', 'Some things sound different when you stop waiting for them.'],
    ['action', 'She smiles. A small, private thing. Then she is gone.'],
    ['scene', 'INT. CENTRAL STATION - MORNING'],
    [
      'action',
      'The departures board flickers into a new arrangement of possibilities. Commuters move around Lena like water around a stone.',
    ],
    [
      'action',
      'ELI PARK, 32, waits beneath the clock. A familiar face, wearing an unfamiliar expression. He holds a cassette in a clear plastic case.',
    ],
    ['character', 'ELI'],
    ['dialogue', 'Track four. He wrote your name on it.'],
    ['character', 'LENA'],
    ['dialogue', 'He wrote my name on everything.'],
    ['character', 'ELI'],
    ['parenthetical', '(offering the tape)'],
    ['dialogue', 'Not like this.'],
    ['action', 'Through the scratched plastic: FOR LENA. WHEN THE CITY GETS TOO LOUD.'],
    ['scene', 'INT. ARCHIVE ROOM - MORNING'],
    [
      'action',
      'Shelves of recorded lives. An old cassette deck, cleaned and cared for. The familiar click of a tape finding its place.',
    ],
    ['action', 'Lena sits. Puts on her headphones. Presses PLAY.'],
    ['character', 'FATHER (V.O.)'],
    ['dialogue', "I tried to record the sunrise for you. It turns out the sun doesn't make much noise."],
    ['action', 'A small laugh on the tape. An almost-laugh in the room.'],
    ['character', 'FATHER (V.O.)'],
    [
      'dialogue',
      "But everything around it does. The kettle. The first train. Your mother looking for her keys. That's the thing about quiet, Lena. It's never really empty.",
    ],
    [
      'action',
      'Lena closes her eyes. For the first time all morning, she stops listening for something else.',
    ],
    ['scene', 'EXT. RIVER WALK - MORNING'],
    [
      'action',
      'The city is awake now. Footsteps and bicycle wheels. A dog negotiating with its owner. Life, insisting on itself.',
    ],
    ['action', 'Lena and Eli walk side by side. No headphones. No recorder.'],
    ['character', 'ELI'],
    ['dialogue', 'Did you find what you were looking for?'],
    ['action', 'Lena looks across the river. The first sunlight has reached the opposite bank.'],
    ['character', 'LENA'],
    ['dialogue', 'I think I remembered where to look.'],
    ['action', 'They keep walking. The city carries on around them.'],
    ['transition', 'FADE OUT.'],
  ]
  project.blocks = lines.map(([kind, text]) => makeBlock(kind, text))
  project.logline =
    'An urban sound archivist discovers a recording left by her father, and follows its echoes through the city they once shared.'
  project.notes[project.blocks[0].id] =
    'Let the city be a character. Hold on the rooftops before we find Lena. The first sound should feel almost accidental.'
  return project
}
