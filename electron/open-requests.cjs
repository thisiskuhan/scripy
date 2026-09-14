const path = require('node:path')
const { fileURLToPath } = require('node:url')

function screenplayArguments(arguments_, workingDirectory) {
  return arguments_.flatMap((argument) => {
    if (typeof argument !== 'string' || argument.startsWith('-') || argument.includes('\0')) return []
    let filePath = argument
    if (argument.startsWith('file:')) {
      try {
        filePath = fileURLToPath(argument)
      } catch {
        return []
      }
    }
    return path.extname(filePath).toLowerCase() === '.scripy'
      ? [path.resolve(workingDirectory, filePath)]
      : []
  })
}

class OpenRequests {
  paths = []

  add(arguments_, workingDirectory) {
    for (const filePath of screenplayArguments(arguments_, workingDirectory)) {
      if (!this.paths.includes(filePath)) this.paths.push(filePath)
    }
  }

  take() {
    return this.paths.shift() ?? null
  }
}

module.exports = { OpenRequests, screenplayArguments }
