var DeviceClient = require('upnp-device-client');
var util = require('util');
var et = require('elementtree');

function MediaRendererClient(url) {
  DeviceClient.call(this, url);
  this.instanceId = 0;
}

util.inherits(MediaRendererClient, DeviceClient);

MediaRendererClient.prototype.getSupportedProtocols = function (callback) {
  this.callAction('ConnectionManager', 'GetProtocolInfo', {}, function (err, result) {
    if (err) return callback(err);

    //
    // Here we leave off the `Source` field as we're hopefuly dealing with a Sink-only device.
    //
    var lines = result.Sink.split(',');

    var protocols = lines.map(function (line) {
      var tmp = line.split(':');
      return {
        protocol: tmp[0],
        network: tmp[1],
        contentFormat: tmp[2],
        additionalInfo: tmp[3]
      };
    });

    console.log('GetProtocolInfo', protocols.map(JSON.stringify).join('\n'));
    callback(null, protocols);
  });
};


MediaRendererClient.prototype.getPositionInfo = function (callback) {
  this.callAction('AVTransport', 'GetPositionInfo', { InstanceID: this.instanceId }, function (err, result) {
    if (err) return callback(err);

    var str = result.AbsTime !== 'NOT_IMPLEMENTED'
      ? result.AbsTime
      : result.RelTime;

    console.log('GetPositionInfo', result);
    callback(null, parseTime(str));
  });
};


MediaRendererClient.prototype.getTransportInfo = function (callback) {
  this.callAction('AVTransport', 'GetTransportInfo', { InstanceID: this.instanceId }, function (err, result) {
    if (err) return callback(err);
    //console.log('GetTransportInfo', result);
    callback(null, result);
  });
};

MediaRendererClient.prototype.getTransportSettings = function (callback) {
  this.callAction('AVTransport', 'GetTransportSettings', { InstanceID: this.instanceId }, function (err, result) {
    if (err) return callback(err);
    console.log('GetTransportSettings', result);
    callback(null, result);
  });
};

MediaRendererClient.prototype.getDeviceCapabilities = function (callback) {
  this.callAction('AVTransport', 'GetDeviceCapabilities', { InstanceID: this.instanceId }, function (err, result) {
    if (err) return callback(err);
    console.log('GetDeviceCapabilities', result);
    callback(null, result);
  });
};

MediaRendererClient.prototype.getMediaInfo = function (callback) {
  this.callAction('AVTransport', 'GetMediaInfo', { InstanceID: this.instanceId }, function (err, result) {
    if (err) return callback(err);
    console.log('GetMediaInfo', result);
    callback(null, result);
  });
};

MediaRendererClient.prototype.load = function (url, options, callback) {
  var self = this;
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var contentType = options.contentType || 'video/mpeg'; // Default to something generic
  var protocolInfo = 'http-get:*:' + contentType;
  
  if (!options.file.isLocal || options.contentType !== 'video/mp2t') {
    protocolInfo += ':DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000';
  } else {
    protocolInfo += ':*';
  }

  var metadata = options.metadata || {};
  metadata.url = url;
  metadata.protocolInfo = protocolInfo;

  var params = {
    RemoteProtocolInfo: protocolInfo,
    PeerConnectionManager: null,
    PeerConnectionID: -1,
    Direction: 'Input'
  };

  this.callAction('ConnectionManager', 'PrepareForConnection', params, function (err, result) {
    if (err) {
      if (err.code !== 'ENOACTION') {
        return callback(err);
      }
      //
      // If PrepareForConnection is not implemented, we keep the default (0) InstanceID
      //
    } else {
      self.instanceId = result.AVTransportID;
    }

    var params = {
      InstanceID: self.instanceId,
      CurrentURI: url,
      CurrentURIMetaData: buildMetadata(metadata)
    };

    self.callAction('AVTransport', 'SetAVTransportURI', params, function (err) {
      if (err) return callback(err);
      if (options.autoplay) {
        self.play(callback);
        return;
      }
      callback();
    });
  });
};


MediaRendererClient.prototype.play = function (callback) {
  var params = {
    InstanceID: this.instanceId,
    Speed: 1,
  };
  this.callAction('AVTransport', 'Play', params, callback || noop);
};


MediaRendererClient.prototype.pause = function (callback) {
  var params = {
    InstanceID: this.instanceId
  };
  this.callAction('AVTransport', 'Pause', params, callback || noop);
};


MediaRendererClient.prototype.stop = function (callback) {
  var params = {
    InstanceID: this.instanceId
  };
  this.callAction('AVTransport', 'Stop', params, callback || noop);
};


MediaRendererClient.prototype.seek = function (seconds, callback) {
  var params = {
    InstanceID: this.instanceId,
    Unit: 'REL_TIME',
    Target: formatTime(seconds)
  };
  this.callAction('AVTransport', 'Seek', params, callback || noop);
};


MediaRendererClient.prototype.getVolume = function (callback) {
  this.callAction('RenderingControl', 'GetVolume', { InstanceID: this.instanceId, Channel: 'Master' }, function (err, result) {
    if (err) return callback(err);
    callback(null, parseInt(result.CurrentVolume));
  });
};


MediaRendererClient.prototype.setVolume = function (volume, callback) {
  var params = {
    InstanceID: this.instanceId,
    Channel: 'Master',
    DesiredVolume: volume
  };
  this.callAction('RenderingControl', 'SetVolume', params, callback || noop);
};


function formatTime(seconds) {
  var h = 0;
  var m = 0;
  var s = 0;
  h = Math.floor((seconds - (h * 0) - (m * 0)) / 3600);
  m = Math.floor((seconds - (h * 3600) - (m * 0)) / 60);
  s = (seconds - (h * 3600) - (m * 60));

  function pad(v) {
    return (v < 10) ? '0' + v : v;
  }

  return [pad(h), pad(m), pad(s)].join(':');
}


function parseTime(time) {
  var parts = time.split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}


function buildMetadata(metadata) {
  var didl = et.Element('DIDL-Lite');
  didl.set('xmlns', 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/');
  didl.set('xmlns:dc', 'http://purl.org/dc/elements/1.1/');
  didl.set('xmlns:upnp', 'urn:schemas-upnp-org:metadata-1-0/upnp/');
  didl.set('xmlns:sec', 'http://www.sec.co.kr/');
  didl.set('xmlns:dlna', 'urn:schemas-dlna-org:metadata-1-0/');

  var item = et.SubElement(didl, 'item');
  item.set('id', 0);
  item.set('parentID', -1);
  item.set('restricted', false);

  var title = et.SubElement(item, 'dc:title');
  title.text = metadata.title || 'Unknown';

  var creator = et.SubElement(item, 'dc:creator');
  creator.text = metadata.creator || 'Unknown';

  var genre = et.SubElement(item, 'upnp:genre');
  genre.text = 'Unknown';

  if (metadata.url && metadata.protocolInfo) {
    var res = et.SubElement(item, 'res');

    res.set('protocolInfo', metadata.protocolInfo);
    res.text = metadata.url;
  }

  var OBJECT_CLASSES = {
    'audio': 'object.item.audioItem.musicTrack',
    'video': 'object.item.videoItem.movie',
    'image': 'object.item.imageItem.photo'
  };

  if (metadata.type) {
    var klass = et.SubElement(item, 'upnp:class');
    klass.text = OBJECT_CLASSES[metadata.type];
  }

  if (metadata.subtitlesUrl) {
    var captionInfo = et.SubElement(item, 'sec:CaptionInfo');
    captionInfo.set('sec:type', 'srt');
    captionInfo.text = metadata.subtitlesUrl;

    var captionInfoEx = et.SubElement(item, 'sec:CaptionInfoEx');
    captionInfoEx.set('sec:type', 'srt');
    captionInfoEx.text = metadata.subtitlesUrl;

    // Create a second `res` for the subtitles
    var subRes = et.SubElement(item, 'res');
    subRes.set('protocolInfo', 'http-get:*:text/srt:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000');
    subRes.text = metadata.subtitlesUrl;
  }

  var doc = new et.ElementTree(didl);
  var xml = doc.write({ xml_declaration: false });

  return xml;
}


function noop() { }


module.exports = MediaRendererClient;
