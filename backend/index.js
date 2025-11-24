const express = require('express');           // Creates the backend API server.
const { spawn } = require('child_process');   // Used to run FFmpeg as a separate background process for each HLS stream.
const cors = require('cors');                 // Allows frontend -> backend communication (React uses localhost:3000).
const path = require('path');                 // Creates directory paths independent of OS (Windows/Linux).
const http = require('http');                 // Required because Socket.IO cannot directly attach to Express.
                                              // We wrap Express app with an HTTP server.
const socketio = require('socket.io');        // Real-time sync between backend -> frontend (for timestamp sync).
const fs = require('fs');                     // Interacts with filesystem (creates HLS folders, checks for existence).

const app = express();                                // Starts Express server.
app.use(cors({ origin: 'http://localhost:3000' }));   // Allows only http://localhost:3000 React app to call this backend.

const server = http.createServer(app);                    // Wrap Express inside an HTTP server.
const io = socketio(server, { cors: { origin: '*' } });   // Attach socket.io to this HTTP server.

const RTSP_URL = 'rtsp://13.60.76.79:8554/live2';         // the source camera stream.
const HLS_ROOT = path.join(__dirname, 'public', 'hls');   // folder where .m3u8 and .ts files will be created.

// Ensure hls dirs exist
if (!fs.existsSync(HLS_ROOT)) fs.mkdirSync(HLS_ROOT, { recursive: true });    // If /public/hls doesn't exist, create it.

// Windows requires full path to ffmpeg.
const FFmpegPath = 'ffmpeg.exe';  // or full path to ffmpeg.exe on Windows, e.g. C:\\ffmpeg\\bin\\ffmpeg.exe

// Number of streams to create
const N_STREAMS = 6;                                      // (stream1, stream2, ..., stream6)

// master start time — used for sync
const serverStart = Date.now();                           // Frontend uses this to keep all videos time-synced.

// spawn ffmpeg for i stream (core of the entire backend.)
function spawnFFmpeg(i) {

  console.log(`SpawnFFmpeg Called`);

  const outDir = path.join(HLS_ROOT, `stream${i}`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // common HLS options (low-latency style small segments)
  // segmentation: -hls_time 1 (1s segment) and -hls_list_size 5 keeps a rolling playlist
  // adjust -preset, -r, -s if needed
  const args = [
    '-rtsp_transport', 'tcp',       //  RTSP over TCP ensures stable data flow without dropped packets.
    '-i', RTSP_URL,                 // Input file / stream
    '-an',                          // remove audio for lower processing (optional)
    '-c:v', 'libx264',              // Video encoding -> libx264 → best for HLS
    '-preset', 'veryfast',          // Video encoding -> veryfast → faster CPU usage
    '-tune', 'zerolatency',         // Video encoding -> zerolatency → real-time streaming
    '-r', '25',                     // Frame rate
    '-g', '50',                     // keyframes (For HLS / Live stream -g 60 o 50)
    '-keyint_min', '50',            // keyframes, but it sets the minimum distance between keyframes.
    '-sc_threshold', '0',           // Scene-Change Threshold -> Don’t insert keyframes automatically — only insert keyframes according to -g and -keyint_min.
    '-b:v', '1000k',                // Video Bitrate
    '-maxrate', '1200k',            // Max
    '-bufsize', '2000k',            // buffer size
    '-vf', 'scale=640:-2',          // scaling -> Width → 640px, Height → auto-adjust to keep aspect ratio
    '-f', 'hls',                    // This tells FFmpeg: -> Output format = HLS (HTTP Live Streaming)
    '-hls_time', '1',               // Sets the length of each HLS segment in seconds.
    '-hls_list_size', '6',          // This defines how many segments the playlist keeps.
    '-hls_flags', 'delete_segments+program_date_time',    // delete_segments -> Automatically removes old segment files from disk.
                                                          // program_date_time -> Adds real date and time inside the playlist.
    '-hls_segment_filename', path.join(outDir, 'seg_%03d.ts'),
    path.join(outDir, 'index.m3u8')
  ];

  console.log(`Spawning ffmpeg for stream ${i}: ${FFmpegPath} ${args.join(' ')}`);

  // Runs FFmpeg as a separate background process.
  const ff = spawn(FFmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  ff.stdout.on('data', (d) => {
    // ffmpeg logs
    // console.log(`ffmpeg${i} stdout: ${d}`);
  });

  ff.stderr.on('data', (d) => {
    const s = d.toString();
    // keep limited logs
    if (!s.includes('frame=')) console.log(`[ffmpeg${i}] ${s}`);      // like -> [ffmpeg1] ffmpeg version.....
  });

  // Ensures 24/7 uptime even if FFmpeg crashes.
  ff.on('close', (code) => {
    console.log(`ffmpeg${i} exited with ${code}`);
    // optionally restart
    setTimeout(() => spawnFFmpeg(i), 2000);
  });

  return ff;
}

// spawn N streams
const ffProcesses = [];
for (let i = 1; i <= N_STREAMS; i++) {
  ffProcesses.push(spawnFFmpeg(i));
}

// Serve static HLS files
app.use('/hls', express.static(path.join(__dirname, 'public', 'hls')));   // Frontend now access -> http://localhost:8000/hls/stream(1-6)/index.m3u8
app.use(express.static(path.join(__dirname, 'public')));                  // Serve ALL files inside public/ directly from root URL.

// Endpoint to list streams
app.get('/streams', (req, res) => {

  console.log("GET Called for streams");

  const streams = [];
  for (let i = 1; i <= N_STREAMS; i++) {
    streams.push({
      id: i,
      url: `/hls/stream${i}/index.m3u8`
    });
  }
  res.json({ streams, serverStart });
});

// Socket.IO sync namespace
io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  // Immediately send serverStart for initial sync
  socket.emit('server-info', { serverStart });

  // Every 1 second send server clock; include playlist sequence if desired
  const t = setInterval(() => {
    const payload = {
      now: Date.now()
      // you can add more metadata like latest segment timestamp per stream if you compute it
    };
    socket.emit('clock', payload);
  }, 1000);

  socket.on('disconnect', () => {
    clearInterval(t);
    console.log('client disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`HLS root: ${HLS_ROOT}`);
});
