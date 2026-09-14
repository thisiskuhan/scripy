const { app } = require('electron')
if (!process.env.SCRIPY_TEST_DATA) throw new Error('An isolated test data directory is required.')
app.setPath('userData', process.env.SCRIPY_TEST_DATA)
require('../electron/main.cjs')
