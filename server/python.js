// The Python interpreter every spawned script runs with. Defaults to "python"
// (as before); set PYTHON to point the server at a virtual environment, e.g.
//   PYTHON=/path/to/venv/bin/python node index.js
module.exports = { PYTHON: process.env.PYTHON || "python" };
