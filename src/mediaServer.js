const http = require('http');
const fs = require('fs');
const got = require('got');

module.exports = (video, subtitles) => {
  let currentRequest = null;

  return http.createServer((req, res) => {
    const url = req.url;

    if (req.headers.range) {
      //console.log('range: ', req.headers.range);

      if (currentRequest) currentRequest.end();

      const range = req.headers.range;
      const parts = range.replace(/bytes=/, '').split('-');
      const partialstart = parts[0];
      const partialend = parts[1];

      const start = parseInt(partialstart, 10);
      const end = partialend ? parseInt(partialend, 10) : video.size - 1;
      const chunksize = (end - start) + 1;

      const file = video.isLocal ?
        fs.createReadStream(video.path, { start, end }) :
        currentRequest = got.stream.get(video.path, {
          headers: { 'Range': `bytes=${start}-` }
        });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${video.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': video.mime
      });

      file.pipe(res);

      return;
    }

    // GET /
    if (url === '/') {
      const headers = {
        'Accept-Ranges': 'bytes',
        'Content-Length': video.size,
        'Content-Range': `bytes 0-${video.size - 1}/${video.size}`,
        'transferMode.dlna.org': 'Streaming',
        'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
        'Content-Type': video.mime
      };

      if (subtitles) headers['CaptionInfo.sec'] = subtitles.url;

      //console.log('content-length: ' + video.size);

      res.writeHead(200, headers);
      res.end();
      return;
    }

    // GET /subtitles
    if (subtitles && url === '/subtitles') {
      res.writeHead(200, {
        'Content-Length': subtitles.size,
        'transferMode.dlna.org': 'Streaming',
        'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
        'CaptionInfo.sec': subtitles.url,
        'Content-Type': subtitles.mime
      });

      if (subtitles.isLocal)
        fs.createReadStream(subtitles.path).pipe(res);
      else {
        subtitles.stream.pipe(res);
      }
    }
  });
};
