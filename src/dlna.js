const dlnacasts = require('./dlnacasts');
const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');
const EventEmitter = require('events');

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

class Dlna extends EventEmitter {
  constructor() {
    super();

    this.dlnacasts = dlnacasts();
    this.startPlayer = this.startPlayer.bind(this);
  }

  start({ video, subtitles, server }) {
    const spinner = ora('Searching for devices...').start();

    this.dlnacasts.once('update', player => {
      spinner.stop();
      this.startPlayer({ player, video, subtitles, server });
    });
  }

  searchPlayers() {
    return new Promise(async (resolve, reject) => {
      if (this.dlnacasts.players.length) resolve(this.dlnacasts.players);

      try {
        this.dlnacasts.update();
        await sleep(2000);
        resolve(this.dlnacasts.players);
      } catch (error) {
        reject(error);
      }
    });
  }

  startPlayer({ player, video, subtitles, server }) {
    const title = decodeURIComponent((video.path || '').substr(video.path.lastIndexOf('/') + 1 || 0));
    const options = { title, type: video.mime };
    let info = `Sending ${chalk.blue(video.path)} to ${chalk.blue(player.name)} `;

    if (subtitles) {
      options.subtitles = [subtitles.url];
      info += `with subtitles ${chalk.blue(subtitles.path)}`;
    }

    const onPlayError = (err) => {
      if (!err) return;

      console.log(err);
      const transitionNotAvailable = err && err.errorCode === '701';
      this._stop({
        player,
        server,
        exit: !transitionNotAvailable,
        callback: () => {
          player.play(video.url, options, onPlayError);
        }
      });
    };

    player.play(video.url, options, onPlayError);

    console.log(info);
    console.log('\nUsage:');
    console.log(`Press ${chalk.blue('<Space>')} to Play/Pause`);
    console.log(`Press ${chalk.blue('<Up/Down>')} to VolUp/VolDown`);
    console.log(`Press ${chalk.blue('q')} to quit`);

    const getTransportInfo = () => {
      player.client.getTransportInfo((err, result) => {
        if (err) throw err;
        this.emit(result.CurrentTransportState);
        if (result.CurrentTransportState === 'STOPPED') {
          server.close(() => {
            process.exit(0);
          });
        }
      });
      setTimeout(getTransportInfo, 1500);
    };

    setTimeout(getTransportInfo, 3000);
    this._bindKeys({ player, server });
  }

  // private

  _bindKeys({ player, server }) {
    let paused = false;
    const rl = readline.createInterface({ input: process.stdin });

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);

    process.stdin.on('keypress', (character, key) => {
      if (key.name === 'space') {
        (paused) ? player.client.play() : player.client.pause();
        paused = !paused;
      }

      if (key.name == 'q' || (key.ctrl && key.name == 'c')) {
        this._stop({ player, server, rl });
      }

      if (key.name == 'i') {
        player.status();
      }

      if (key.name == 'up') {
        player.client.getVolume((err, volume) => {
          player.client.setVolume(volume + 1);
        });
      }

      if (key.name == 'down') {
        player.client.getVolume((err, volume) => {
          player.client.setVolume(volume - 1);
        });
      }

      if (key.name == 'right') {
        player.client.seek(10, (err, res) => {
          console.log(err, res);
        });
      }
    });
  }

  _stop({ player, server, rl, exit = true, callback = () => {} }) {
    player.client.stop(() => {
      console.log(chalk.red('Stopped'));
      player.client.pause();
      if (rl) rl.close();
      if (exit)
        server.close(() => process.exit(0));
      else
        callback();
    });
  }
}

module.exports = new Dlna();
