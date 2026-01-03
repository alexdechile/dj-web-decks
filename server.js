import express from "express";
import { URL } from "url";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { spawn } from "child_process";
import mdns from 'mdns-js';
import GoogleHomePlayer from 'google-home-player';

const require = createRequire(import.meta.url);
const YTDlpWrap = require("yt-dlp-wrap").default;

const app = express();
app.use(express.json({ limit: '500mb' }));
app.use(express.raw({ type: 'audio/*', limit: '500mb' }));
const PORT = 3555;

// --- Helper to get Local IP ---
const getLocalIp = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
};

// --- Chromecast Discovery ---
const chromecastDevices = [];
const serviceType = '_googlecast._tcp.local';
console.log('[Chromecast] Iniciando búsqueda de dispositivos...');

try {
  const browser = mdns.createBrowser(serviceType);

  browser.on('ready', () => {
    console.log('[Chromecast] Buscando dispositivos en la red...');
    browser.discover();
  });

  browser.on('error', (err) => {
    console.error('[Chromecast] Error en el buscador de dispositivos. La detección puede no funcionar:', err);
  });

  browser.on('update', (data) => {
    if (data.fullname && data.addresses && data.port) {
      const deviceName = data.fullname.replace(`.${serviceType}`, '').replace(/\._sub\..*/, '');
      const existingDevice = chromecastDevices.find(d => d.name === deviceName);
      
      if (!existingDevice) {
        const device = {
          name: deviceName,
          host: data.addresses[0],
          port: data.port,
        };
        console.log(`[Chromecast] Dispositivo añadido: ${device.name} (${device.host}:${device.port})`);
        chromecastDevices.push(device);
      }
    }
  });

  setInterval(() => {
    console.log('[Chromecast] Limpiando y redescubriendo dispositivos...');
    chromecastDevices.length = 0;
    browser.discover();
  }, 300000);

} catch (err) {
  console.error("[Chromecast] Error al inicializar mDNS. La detección de Chromecast no funcionará.", err);
}
// -------------------------

const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const binaryPath = path.join(process.cwd(), binaryName);
let ytDlpWrap;

async function initialize() {
  try {
    if (!fs.existsSync(binaryPath)) {
      console.log(`[Setup] yt-dlp binary not found. Downloading to: ${binaryPath}`);
      await YTDlpWrap.downloadFromGithub(binaryPath);
      console.log("[Setup] Download complete.");
    } else {
      console.log("[Setup] yt-dlp binary already exists.");
    }
    ytDlpWrap = new YTDlpWrap(binaryPath);

    const tempDir = path.join(process.cwd(), 'temp_audio');
    if (fs.existsSync(tempDir)) {
      console.log('[Setup] Cleaning up old temporary files...');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);
    console.log('[Setup] Temporary audio directory created.');
    app.use('/temp_audio', express.static(tempDir));

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[Setup] Failed to initialize server:", error);
    process.exit(1);
  }
}

app.use(express.static("."));

// --- API Endpoints ---

app.get('/api/chromecast-devices', (req, res) => {
  res.json(chromecastDevices);
});

app.post('/api/cast', async (req, res) => {
  const { device, mediaUrl } = req.body;

  if (!device || !mediaUrl) {
    return res.status(400).json({ error: 'Faltan datos del dispositivo o del audio.' });
  }

  try {
    const localIp = getLocalIp();
    if (localIp === 'localhost') {
      throw new Error('No se pudo determinar la IP local. Asegúrate de estar conectado a una red.');
    }

    const fullMediaUrl = `http://${localIp}:${PORT}${mediaUrl}`;
    console.log(`[Cast] Intentando transmitir a ${device.name} (${device.host})`);
    console.log(`[Cast] URL del medio: ${fullMediaUrl}`);

    const player = new GoogleHomePlayer(device.host, device.name);

    const playPromise = player.play(fullMediaUrl);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: No se pudo conectar al dispositivo en 10 segundos.')), 10000)
    );

    await Promise.race([playPromise, timeoutPromise]);

    console.log(`[Cast] Reproduciendo en ${device.name}.`);
    res.json({ success: true, message: `Reproduciendo en ${device.name}` });

  } catch (error) {
    console.error('[Cast] Error al transmitir:', error.message);
    res.status(500).json({ error: 'No se pudo iniciar la transmisión.', details: error.message });
  }
});

app.get("/get-audio", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "No se recibió URL" });
    const audioUrl = await ytDlpWrap.execPromise([url, "-f", "bestaudio", "-g"]);
    res.json({ audioUrl: `/proxy?v=${encodeURIComponent(audioUrl)}` });
  } catch (error) {
    res.status(500).json({
      error: "Error al procesar la solicitud con yt-dlp",
      details: error.stderr || error.message,
    });
  }
});

app.get('/proxy', async (req, res) => {
  try {
    const videoUrl = decodeURIComponent(req.query.v);
    if (!videoUrl) return res.status(400).send('No se proporcionó URL de video.');
    const response = await axios({ method: 'get', url: videoUrl, responseType: 'stream' });
    res.set('Content-Type', response.headers['content-type']);
    res.set('Content-Length', response.headers['content-length']);
    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Error al obtener el audio.');
  }
});

app.get('/get-playlist-info', async (req, res) => {
  try {
    const playlistUrl = req.query.url;
    if (!playlistUrl) return res.status(400).json({ error: 'No se proporcionó URL de la playlist' });

    console.log(`[yt-dlp] Obteniendo información de la playlist: ${playlistUrl}`);
    const stdout = await ytDlpWrap.execPromise([
      playlistUrl,
      '--dump-single-json',
      '--flat-playlist'
    ]);

    const playlistData = JSON.parse(stdout);

    if (!playlistData.entries || !Array.isArray(playlistData.entries)) {
      if (playlistData.id && playlistData.title) {
        console.log('[yt-dlp] La URL parece ser de un solo video. Creando playlist de una canción.');
        const track = {
          id: playlistData.id,
          title: playlistData.title,
          duration: playlistData.duration,
          uploader: playlistData.uploader,
        };
        return res.json({ playlistTitle: playlistData.title, tracks: [track] });
      } else {
        throw new Error('La URL no es una playlist de YouTube válida.');
      }
    }

    const tracks = playlistData.entries.map(video => ({
      id: video.id,
      title: video.title,
      duration: video.duration,
      uploader: video.uploader,
    }));

    console.log(`[yt-dlp] Se encontraron ${tracks.length} pistas en la playlist.`);
    res.json({ playlistTitle: playlistData.title, tracks: tracks });

  } catch (error) {
    console.error('[yt-dlp] Error al obtener la playlist:', error.stderr || error.message);
    res.status(500).json({
      error: 'Error al procesar la playlist con yt-dlp',
      details: error.stderr || error.message,
    });
  }
});

app.post('/download-track', async (req, res) => {
  try {
    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'No se proporcionó videoId' });
    }
    const tempDir = path.join(process.cwd(), 'temp_audio');

    const existingFile = fs.readdirSync(tempDir).find(file => file.startsWith(videoId));
    if (existingFile) {
      console.log(`[Download] Track ${videoId} already exists as ${existingFile}.`);
      return res.json({ success: true, message: 'El archivo ya existe', path: `/temp_audio/${existingFile}` });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outputPath = path.join(tempDir, `${videoId}.%(ext)s`);

    console.log(`[Download] Starting download for ${videoId}...`);
    await ytDlpWrap.execPromise([
      videoUrl,
      '-f', 'bestaudio',
      '-o', outputPath,
    ]);
    console.log(`[Download] Finished download for ${videoId}`);

    const downloadedFile = fs.readdirSync(tempDir).find(file => file.startsWith(videoId));
    if (!downloadedFile) {
      throw new Error('File not found after download');
    }
    const finalFilePath = `/temp_audio/${downloadedFile}`;

    res.json({ success: true, message: 'Descarga completada', path: finalFilePath });

  } catch (error) {
    console.error(`[Download] Error downloading track:`, error.stderr || error.message);
    res.status(500).json({
      error: 'Error al descargar la pista',
      details: error.stderr || error.message,
    });
  }
});

app.post('/convert-to-mp3', async (req, res) => {
  try {
    const timestamp = Date.now();
    const tempDir = path.join(process.cwd(), 'temp_audio');
    const inputPath = path.join(tempDir, `mix-${timestamp}.webm`);
    const outputPath = path.join(tempDir, `mix-${timestamp}.mp3`);

    let audioBuffer;
    if (req.body.audio) {
      const base64Data = req.body.audio.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
    } else {
      return res.status(400).json({ error: 'No se recibió audio' });
    }

    console.log(`[Convert] Recibido audio: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    fs.writeFileSync(inputPath, audioBuffer);
    console.log(`[Convert] Archivo temporal guardado: ${inputPath}`);

    const ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,
        '-vn',
        '-acodec', 'libmp3lame',
        '-ab', '320k',
        '-ar', '44100',
        '-ac', '2',
        '-y',
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg error (code ${code}): ${stderr}`)));
      ffmpeg.on('error', reject);
    });

    console.log(`[Convert] Conversión completada: ${outputPath}`);
    const mp3Buffer = fs.readFileSync(outputPath);
    const mp3Size = (mp3Buffer.length / 1024 / 1024).toFixed(2);
    console.log(`[Convert] Enviando MP3: ${mp3Size} MB`);

    fs.unlinkSync(inputPath);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `attachment; filename="dj-mix-${timestamp}.mp3"`,
      'Content-Length': mp3Buffer.length
    });
    res.send(mp3Buffer);

  } catch (error) {
    console.error('[Convert] Error:', error.message);
    res.status(500).json({
      error: 'Error al convertir a MP3',
      details: error.message
    });
  }
});

initialize();