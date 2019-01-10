#!/usr/bin/env node

const program = require('commander');
const CLI = require('./src/cli');

program
  .version(require('./package').version, '-v, --version')
  .description('Stream your favorite media to a DLNA device in your local network')
  .usage('[options] <file>')
  .option('-n --no-dlna', 'Only start media server (no DLNA streaming)')
  .option('-l --list', 'Choose from the available devices in your network')
  .option('-s, --subtitles [file]', 'Add subtitles or auto load subtitles file with the same name')
  .option('-p, --port <port>', 'Change media server port', parseInt, 8888)
  .parse(process.argv);

// If not passed one argument, show help
if (program.args.length !== 1) program.help();

const cli = new CLI(program);
cli.stream();

// const max = 433328987;
// const des = 433317853;
// const size = max - des;
// const size2 = size * 3000;
// const des2 = max - size2;
// const headers = { 'Range': 'bytes=433317853-433328987' };

// console.log(headers);
// console.log(size2 / 1024 / 1024);

// require('request').get(process.argv[2], 
//   { headers }, 
//   (err, resp, body) => {
//     debugger;
//   });