const address = require('network-address');
const chalk = require('chalk');
const glob = require('glob');
const inquirer = require('inquirer');
const ora = require('ora');
const path = require('path');
const klawSync = require('klaw-sync');

const dlna = require('./dlna');
const fileInfo = require('./fileInfo');
const mediaServer = require('./mediaServer');

class CLI {
  constructor(program) {
    this.program = program;
  }

  stream() {
    this._initVideo()
      .then((video) => {
        this.video = video;
      })
      .then(() => this._initSubtitles())
      .then((subtitles) => {
        this.subtitles = subtitles;
      })
      .then(() => {
        this.server = this._initServer();
        if (this.program.dlna) this._initDlna();
      });
  }

  // private

  _initVideo() {
    // Use http instead of https.
    // https sometimes have cert issues like:
    // Hostname/IP does not match certificate's altnames: 
    // Host: julianna.rapidcdn.vip. is not in the cert's altnames:
    // DNS:*.energycdn.com, DNS:energycdn.com
    const videoPath = this.program.args[0].replace('https://', 'http://');
    const video = fileInfo({ video: videoPath });

    if (!video) {
      console.log(chalk.red('File not found'));
      process.exit(1);
    }

    return video;
  }

  _initSubtitles() {
    if (!this.program.subtitles) return this._checkSubtitlesFromKodiAddons();

    let subtitles = fileInfo({ sub: this.program.subtitles, video: this.video.path });

    if (!subtitles) {
      // Select same filename but different extensions: filename!(*.mkv)
      const globPattern = `${this.video.basename}!(*${this.video.extension})`;
      const subsFiles = glob.sync(path.join(path.dirname(this.video.path), globPattern));

      subtitles = fileInfo({ sub: subsFiles[0], video: this.video.path });
    }

    return subtitles;
  }

  _initServer() {
    const host = address();
    const port = this.program.port;

    this.video.url = `http://${host}:${port}/`;
    if (this.subtitles) this.subtitles.url = this.video.url + 'subtitles';

    const server = mediaServer(this.video, this.subtitles);
    server.listen(port, '0.0.0.0');
    console.log(`Server started at ${chalk.blue(this.video.url)}`);

    process.on('SIGTERM', function () {
      server.close(() => {
        process.exit(0);
      });
    });

    return server;
  }

  _initDlna() {
    if (this.program.list) {
      this._choosePlayer();
    } else {
      this._chooseFirstPlayer();
    }
  }

  _checkSubtitlesFromKodiAddons() {
    if (process.platform !== 'win32') return;

    const subInfo = [
      'C:\\Users\\extad\\AppData\\Roaming\\Kodi\\userdata\\addon_data\\service.subtitles.addic7ed',
      'C:\\Users\\extad\\AppData\\Roaming\\Kodi\\userdata\\addon_data\\service.subtitles.opensubtitles_by_opensubtitles',
      'C:\\Users\\extad\\AppData\\Roaming\\Kodi\\userdata\\addon_data\\service.subtitles.subscene',
    ].map((root) => {
      const files = klawSync(root, { 
        traverseAll: true,
        nodir: true,
        filter: item => {
          return path.extname(item.path) === '.srt';
        }
      });
  
      return files[0];
    }).filter(v => v)
      .sort(item => item.stats.mtime)[0];

    if (!subInfo) {
      return null;
    }

    return fileInfo({ sub: subInfo.path, video: this.video.path });
  }

  _chooseFirstPlayer() {
    dlna.start({
      video: this.video,
      subtitles: this.subtitles,
      server: this.server
    });
  }

  async _choosePlayer() {
    // search for players
    const spinner = ora('Searching for devices...').start();
    const players = await dlna.searchPlayers();
    spinner.stop();

    if (players.length === 0) {
      console.log(chalk.red('Couldn\'t find any devices'));
      process.exit();
    }

    // offer choice
    try {
      var { player } = await inquirer.prompt({
        type: 'list',
        name: 'player',
        message: 'Choose a player',
        choices: players,
        filter: (choice) => players.find(player => player.name === choice)
      });
    } catch (error) {
      console.log(chalk.red('Interrupted'));
    }

    // stream to player
    dlna.startPlayer({
      player,
      video: this.video,
      subtitles: this.subtitles,
      server: this.server
    });
  }
}

module.exports = CLI;
