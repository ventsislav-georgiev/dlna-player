const fs = require('fs');
const mime = require('mime');
const path = require('path');
const got = require('got');
const stream = require('stream');

module.exports = ({ video, sub }) => {
  const file = sub || video;
  const isLocal = file[0] === '/' || file[1] === ':';
  if (isLocal && !fs.existsSync(file)) return;

  const videoExtension = path.extname(video);
  const extension = sub ? path.extname(file) : videoExtension;
  const videoBasename = path.basename(video, videoExtension);
  const basename = sub && !isLocal ? videoBasename : path.basename(file, extension);

  const info = {
    path: file,
    mime: (extension && mime.getType(file)) || 'application/x-subrip',
    extension: extension || '.srt',
    basename,
    isLocal,
    size: isLocal && fs.statSync(file).size
  };

  return new Promise((resolve) => {
    if (isLocal) {
      resolve(info);
      return;
    }

    // subtitles
    if (sub) {
      got.get(sub, {
        headers: {
          'Referer': 'http://www.addic7ed.com'
        }
      }).then((resp) => {
        info.stream = new stream.PassThrough();
        info.stream.end(Buffer.from(resp.body, 'utf8'));
        info.size = info.stream.readableLength;
        resolve(info);
      });

      return;
    }

    // video
    got({
      url: video,
      method: 'HEAD'
    }).then((resp) => {
      info.size = parseInt(resp.headers['content-length']);
      resolve(info);
    });
  });
};
