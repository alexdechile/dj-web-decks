import express from "express";
import { URL } from "url";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import axios from "axios";
import { spawn } from "child_process";

const require = createRequire(import.meta.url);
const YTDlpWrap = require("yt-dlp-wrap").default;

const app = express();
app.use(express.json({ limit: '500mb' }));
app.use(express.raw({ type: 'audio/*', limit: '500mb' }));
const PORT = 3555;

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

    // --- Temporary Audio Directory Setup ---
    const tempDir = path.join(process.cwd(), 'temp_audio');
    if (fs.existsSync(tempDir)) {
      console.log('[Setup] Cleaning up old temporary files...');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);
    console.log('[Setup] Temporary audio directory created.');
    app.use('/temp_audio', express.static(tempDir));
    // -----------------------------------------

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[Setup] Failed to initialize server:", error);
    process.exit(1);
  }
}

app.use(express.static("."));

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

    // Si la URL no es una playlist sino un video, crear una playlist de 1 canción
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

    // Primero, verificar si el archivo ya existe con cualquier extensión
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
      '-f', 'bestaudio', // Simplificado para mayor compatibilidad
      '-o', outputPath,
    ]);
    console.log(`[Download] Finished download for ${videoId}`);

    // Find the actual downloaded file extension
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

// ===== CONVERT TO MP3 =====
app.post('/convert-to-mp3', async (req, res) => {
  try {
    const timestamp = Date.now();
    const tempDir = path.join(process.cwd(), 'temp_audio');
    const inputPath = path.join(tempDir, `mix-${timestamp}.webm`);
    const outputPath = path.join(tempDir, `mix-${timestamp}.mp3`);

    // Obtener el audio del body (puede venir como base64 en JSON o como raw)
    let audioBuffer;
    if (req.body.audio) {
      // Viene como base64 en JSON
      const base64Data = req.body.audio.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(req.body)) {
      // Viene como raw
      audioBuffer = req.body;
    } else {
      return res.status(400).json({ error: 'No se recibió audio' });
    }

    console.log(`[Convert] Recibido audio: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Guardar WebM temporal
    fs.writeFileSync(inputPath, audioBuffer);
    console.log(`[Convert] Archivo temporal guardado: ${inputPath}`);

    // Convertir con FFmpeg a MP3 320kbps
    const ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,
        '-vn',                    // Sin video
        '-acodec', 'libmp3lame',  // Codec MP3
        '-ab', '320k',            // 320 kbps
        '-ar', '44100',           // 44.1 kHz
        '-ac', '2',               // Stereo
        '-y',                     // Sobrescribir
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg error (code ${code}): ${stderr}`));
        }
      });

      ffmpeg.on('error', reject);
    });

    console.log(`[Convert] Conversión completada: ${outputPath}`);

    // Leer el MP3 y enviarlo
    const mp3Buffer = fs.readFileSync(outputPath);
    const mp3Size = (mp3Buffer.length / 1024 / 1024).toFixed(2);
    console.log(`[Convert] Enviando MP3: ${mp3Size} MB`);

    // Limpiar archivos temporales
    fs.unlinkSync(inputPath);
    // Mantener el MP3 por si quiere descargarlo de nuevo

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