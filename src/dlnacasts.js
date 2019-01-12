var MediaRenderer = require('./upnp-mediarenderer-client');
var debug = require('debug')('dlnacasts');
var events = require('events');
var get = require('simple-get');
var mime = require('mime');
var parallel = require('run-parallel');
var parseString = require('xml2js').parseString;

var SSDP;
try {
  SSDP = require('node-ssdp').Client;
} catch (err) {
  SSDP = null;
}

var thunky = require('thunky');

var noop = function () {};

module.exports = function () {
  var that = new events.EventEmitter();
  var casts = {};
  var ssdp = SSDP ? new SSDP({ explicitSocketBind: true }) : null;

  that.players = [];

  var emit = function (cst) {
    if (!cst || !cst.host || cst.emitted) return;
    cst.emitted = true;

    var player = new events.EventEmitter();

    var connect = thunky(function reconnect (cb) {
      var client = new MediaRenderer(player.xml);

      client.on('error', function (err) {
        player.emit('error', err);
      });

      client.on('close', function () {
        connect = thunky(reconnect);
      });

      player.client = client;
      cb(null, player.client);
    });

    player.name = cst.name;
    player.host = cst.host;
    player.xml = cst.xml;
    player._status = {};
    player.MAX_VOLUME = 100;

    player.play = function (url, opts, cb) {
      if (typeof opts === 'function') return player.play(url, null, opts);
      if (!opts) opts = {};
      if (!url) return player.resume(cb);
      if (!cb) cb = noop;
      player.subtitles = opts.subtitles;
      connect(function (err, p) {
        if (err) return cb(err);

        var media = {
          autoplay: opts.autoPlay !== false,
          contentType: opts.type || mime.lookup(url, 'video/mp4'),
          metadata: opts.metadata || {
            title: opts.title || '',
            type: 'video', // can be 'video', 'audio' or 'image'
            subtitlesUrl: player.subtitles && player.subtitles.length ? player.subtitles[0] : null
          }
        };

        var callback = cb;
        if (opts.seek) {
          callback = function () {
            player.seek(opts.seek, cb);
          };
        }

        p.load(url, media, callback);
      });
    };

    player.status = function (cb) {
      if (!cb) cb = noop;
      parallel({
        supportedProtocols: function (acb) {
          player.client.getSupportedProtocols(acb);
        },
        positionInfo: function (acb) {
          player.client.getPositionInfo(acb);
        },
        transportInfo: function (acb) {
          player.client.getTransportInfo(acb);
        },
        transportSettings: function (acb) {
          player.client.getTransportSettings(acb);
        },
        deviceCapabilities: function (acb) {
          player.client.getDeviceCapabilities(acb);
        },
        mediaInfo: function (acb) {
          player.client.getMediaInfo(acb);
        },
        volume: function (acb) {
          player.client.getVolume(acb);
        }
      },
      function (err, results) {
        debug('%o', results);
        player._status.currentTime = results.currentTime;
        player._status.volume = {level: results.volume / (player.MAX_VOLUME)};
        return cb(err, player._status);
      });
    };

    that.players.push(player);
    that.emit('update', player);
  };

  if (ssdp) {
    let intervalId;
    setTimeout(() => {
      intervalId = setInterval(() => {
        that.update();
      }, 1000);
    });

    ssdp.on('response', function (headers, statusCode, info) {
      clearInterval(intervalId);

      if (!headers.LOCATION) return;

      get.concat(headers.LOCATION, function (err, res, body) {
        if (err) return;
        parseString(body.toString(), {explicitArray: false, explicitRoot: false},
          function (err, service) {
            if (err) return;
            if (!service.device) return;

            debug('device %j', service.device);

            var name = service.device.friendlyName;

            if (!name) return;

            var host = info.address;
            var xml = headers.LOCATION;

            if (!casts[name]) {
              casts[name] = {name: name, host: host, xml: xml};
              return emit(casts[name]);
            }

            if (casts[name] && !casts[name].host) {
              casts[name].host = host;
              casts[name].xml = xml;
              emit(casts[name]);
            }
          });
      });
    });
  }

  that.update = function () {
    debug('querying ssdp');
    if (ssdp) ssdp.search('urn:schemas-upnp-org:device:MediaRenderer:1');
  };

  that.destroy = function () {
  };

  return that;
};
