const fs = require('fs');
const path = require('path');
const { Console } = require('console');

const logFile = fs.createWriteStream(path.join(__dirname, '..', 'dlna-player.log'));
const consoleToFile = new Console({ stdout: logFile, stderr: logFile });

for (var name in console) {
  if (!console[name].bind) continue;

  const originalFn = console[name].bind(console);
  console[name] = (...args) => {
    originalFn(...args);
    if (consoleToFile[name])
      consoleToFile[name](...args);
  };
}