const fs = require('fs');
const mime = require('mime');
const path = require('path');

module.exports = (file) => {
  const isLocal = file[0] === '/' || file[1] === ':';
  if (isLocal && !fs.existsSync(file)) return;

  const extension = path.extname(file);

  return {
    path: file,
    mime: mime.getType(file),
    extension,
    basename: path.basename(file, extension),
    isLocal,
    size: isLocal && fs.statSync(file).size
  };
};
