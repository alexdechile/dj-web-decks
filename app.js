/**
 * DJ Web Decks - Refactorizado
 * Versión limpia con Wake Lock API y código modular
 */

// ===== WAKE LOCK API (Evita bloqueo de pantalla) =====
class WakeLockManager {
  constructor() {
    this.wakeLock = null;
    this.indicator = document.getElementById('wakeLockIndicator');
    this.init();
  }

  async init() {
    if ('wakeLock' in navigator) {
      // Solicitar wake lock cuando hay audio reproduciéndose
      document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    } else {
      console.warn('[WakeLock] No soportado en este navegador');
      this.indicator.innerHTML = '<span class="dot" style="background:#ff4444"></span><span>Wake Lock no soportado</span>';
    }
  }

  async request() {
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.indicator.classList.remove('inactive');
      console.log('[WakeLock] Pantalla activa');

      this.wakeLock.addEventListener('release', () => {
        this.indicator.classList.add('inactive');
        console.log('[WakeLock] Liberado');
      });
    } catch (err) {
      console.error('[WakeLock] Error:', err);
    }
  }

  async release() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  async handleVisibilityChange() {
    if (document.visibilityState === 'visible' && (deckA.isPlaying || deckB.isPlaying)) {
      await this.request();
    }
  }
}

// ===== AUDIO CONTEXT & RECORDING DESTINATION =====
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Nodo de destino para grabación (captura todo el audio del mixer)
const recordingDestination = audioCtx.createMediaStreamDestination();
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
masterGain.connect(recordingDestination);

// ===== MIX RECORDER =====
class MixRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
    this.startTime = 0;
    this.timerInterval = null;
    this.recordedBlob = null;

    // DOM Elements
    this.recBtn = document.getElementById('recBtn');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.recIndicator = document.getElementById('recIndicator');
    this.recTime = document.getElementById('recTime');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.recBtn.addEventListener('click', () => this.toggleRecording());
    this.downloadBtn.addEventListener('click', () => this.downloadMix());
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  startRecording() {
    // Limpiar grabación anterior
    this.chunks = [];
    this.recordedBlob = null;
    this.downloadBtn.disabled = true;
    this.downloadBtn.classList.remove('ready');

    // Configurar MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    try {
      this.mediaRecorder = new MediaRecorder(recordingDestination.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 192000
      });
    } catch (e) {
      console.error('[Recorder] Error creando MediaRecorder:', e);
      alert('Tu navegador no soporta grabación de audio');
      return;
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.recordedBlob = new Blob(this.chunks, { type: mimeType });
      this.downloadBtn.disabled = false;
      this.downloadBtn.classList.add('ready');
      console.log('[Recorder] Grabación lista:', this.formatBytes(this.recordedBlob.size));
    };

    // Iniciar grabación
    this.mediaRecorder.start(1000); // Guardar cada segundo
    this.isRecording = true;
    this.startTime = Date.now();

    // UI
    this.recBtn.textContent = '⏹ STOP';
    this.recBtn.classList.add('recording');
    this.recIndicator.classList.add('recording');
    this.recTime.classList.add('recording');

    // Timer
    this.timerInterval = setInterval(() => this.updateTimer(), 100);

    console.log('[Recorder] Grabación iniciada');
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.isRecording = false;

    // UI
    this.recBtn.textContent = '⏺ REC';
    this.recBtn.classList.remove('recording');
    this.recIndicator.classList.remove('recording');
    this.recTime.classList.remove('recording');

    // Detener timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    console.log('[Recorder] Grabación detenida');
  }

  updateTimer() {
    const elapsed = Date.now() - this.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    this.recTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  async downloadMix() {
    if (!this.recordedBlob) return;

    // Mostrar estado de conversión
    this.downloadBtn.disabled = true;
    this.downloadBtn.textContent = '⏳ Convirtiendo...';
    this.downloadBtn.classList.remove('ready');

    try {
      console.log('[Recorder] Enviando al servidor para conversión a MP3...');
      console.log('[Recorder] Tamaño WebM:', this.formatBytes(this.recordedBlob.size));

      // Convertir Blob a base64
      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(this.recordedBlob);
      });
      const base64Audio = await base64Promise;

      // Enviar al servidor
      const response = await fetch('/convert-to-mp3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ audio: base64Audio })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error);
      }

      // Descargar el MP3
      const mp3Blob = await response.blob();
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const filename = `dj-mix-${timestamp}.mp3`;

      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[Recorder] ¡MP3 descargado!', filename, this.formatBytes(mp3Blob.size));

    } catch (error) {
      console.error('[Recorder] Error convirtiendo a MP3:', error);
      alert('Error al convertir a MP3: ' + error.message);
    } finally {
      // Restaurar botón
      this.downloadBtn.disabled = false;
      this.downloadBtn.textContent = '💾 Descargar MP3';
      this.downloadBtn.classList.add('ready');
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// ===== CHROMECAST MANAGER =====
class ChromecastManager {
  constructor() {
    this.devices = [];
    this.selectedDevice = null;

    // DOM Elements
    this.castBtn = document.getElementById('castBtn');
    this.modal = document.getElementById('castModal');
    this.deviceListEl = document.getElementById('castDeviceList');
    this.closeBtn = document.getElementById('closeCastModal');
    this.modalTitle = this.modal.querySelector('h3');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.castBtn.addEventListener('click', () => this.openModal());
    this.closeBtn.addEventListener('click', () => this.closeModal());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  async openModal() {
    this.modalTitle.textContent = 'Enviar a Dispositivo Chromecast';
    this.modal.classList.remove('hidden');
    this.deviceListEl.innerHTML = '<p>Buscando dispositivos...</p>';
    
    try {
      const response = await fetch('/api/chromecast-devices');
      this.devices = await response.json();
      this.renderDevices();
    } catch (error) {
      console.error('[Chromecast] Error al obtener dispositivos:', error);
      this.deviceListEl.innerHTML = '<p style="color: #ff4444;">Error al buscar dispositivos.</p>';
    }
  }

  closeModal() {
    this.modal.classList.add('hidden');
  }

  renderDevices() {
    this.deviceListEl.innerHTML = ''; // Clear current list

    if (this.devices.length === 0) {
      this.deviceListEl.innerHTML = '<p>No se encontraron dispositivos.</p>';
      return;
    }

    this.devices.forEach(device => {
      const deviceEl = document.createElement('div');
      deviceEl.className = 'device-item';
      deviceEl.textContent = device.name;
      deviceEl.addEventListener('click', () => this.selectDevice(device));
      this.deviceListEl.appendChild(deviceEl);
    });
  }

  async selectDevice(device) {
    this.selectedDevice = device;
    console.log('[Chromecast] Dispositivo seleccionado:', device);
    this.closeModal();

    // Prioritize Deck A, fallback to Deck B
    const deckToCast = deckA.audio.src && !deckA.audio.src.endsWith('/') ? deckA : deckB;
    const mediaElement = deckToCast.audio;
    const trackTitle = deckToCast.titleEl.textContent;

    if (!mediaElement.src || mediaElement.src.endsWith('/')) {
      playlistManager.statusEl.textContent = 'No hay pista para transmitir.';
      playlistManager.statusEl.classList.add('error');
      setTimeout(() => playlistManager.statusEl.classList.remove('error'), 3000);
      return;
    }

    // Extract the path from the full URL (e.g., /temp_audio/video-id.webm)
    const mediaUrl = new URL(mediaElement.src).pathname;

    // Show feedback to user
    const originalStatus = playlistManager.statusEl.textContent;
    playlistManager.statusEl.textContent = `Enviando a ${device.name}...`;
    playlistManager.statusEl.classList.remove('error');

    try {
      const response = await fetch('/api/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, mediaUrl, trackTitle })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error);
      }

      playlistManager.statusEl.textContent = `✔ Reproduciendo en ${device.name}`;

    } catch (error) {
      console.error('[Chromecast] Error al iniciar el cast:', error);
      playlistManager.statusEl.textContent = `✖ Error: ${error.message}`;
      playlistManager.statusEl.classList.add('error');
    } finally {
      // Restore status after a few seconds
      setTimeout(() => {
        if (!playlistManager.statusEl.classList.contains('error')) {
          playlistManager.statusEl.textContent = originalStatus;
        }
      }, 8000);
    }
  }
}

// ===== AUDIO OUTPUT MANAGER =====
class AudioOutputManager {
  constructor() {
    // DOM Elements
    this.outputBtn = document.getElementById('bluetoothBtn');
    this.modal = document.getElementById('castModal');
    this.deviceListEl = document.getElementById('castDeviceList');
    this.modalTitle = this.modal.querySelector('h3');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.outputBtn.addEventListener('click', () => this.openAudioOutputSelector());
  }

  async openAudioOutputSelector() {
    if (!('setSinkId' in HTMLMediaElement.prototype)) {
      alert('Tu navegador no soporta la selección de salida de audio.');
      return;
    }

    this.modalTitle.textContent = 'Seleccionar Salida de Audio';
    this.deviceListEl.innerHTML = '<p>Buscando salidas de audio...</p>';
    this.modal.classList.remove('hidden');

    try {
      // Request permission to access devices, otherwise labels might be empty
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

      this.deviceListEl.innerHTML = ''; // Clear
      if (audioOutputs.length === 0) {
          this.deviceListEl.innerHTML = '<p>No se encontraron salidas de audio.</p>';
          return;
      }

      audioOutputs.forEach(device => {
        const deviceEl = document.createElement('div');
        deviceEl.className = 'device-item';
        deviceEl.textContent = device.label || `Dispositivo ${this.deviceListEl.children.length + 1}`;
        deviceEl.addEventListener('click', () => this.setAudioOutput(device.deviceId, device.label));
        this.deviceListEl.appendChild(deviceEl);
      });

    } catch (error) {
      console.error('[AudioOutput] Error enumerando dispositivos:', error);
      this.deviceListEl.innerHTML = '<p style="color: #ff4444;">Error al buscar dispositivos.</p>';
    }
  }

  async setAudioOutput(deviceId, deviceLabel) {
    try {
      await Promise.all([
        deckA.audio.setSinkId(deviceId),
        deckB.audio.setSinkId(deviceId)
      ]);
      console.log(`[AudioOutput] Salida de audio cambiada a: ${deviceLabel}`);
      playlistManager.statusEl.textContent = `✔ Audio enviado a: ${deviceLabel.substring(0, 30)}...`;
      setTimeout(() => { playlistManager.statusEl.textContent = '' }, 5000);
    } catch (error) {
      console.error('[AudioOutput] Error al cambiar la salida de audio:', error);
      playlistManager.statusEl.textContent = `✖ Error al cambiar salida de audio.`;
      playlistManager.statusEl.classList.add('error');
    } finally {
        document.getElementById('closeCastModal').click();
    }
  }
}

class Deck {
  constructor(id, accentColor) {
    this.id = id;
    this.accentColor = accentColor;
    this.isPlaying = false;
    this.cuePoint = 0;
    this.isFading = false;

    // DOM Elements
    this.audio = document.getElementById(`deck${id}`);
    this.titleEl = document.getElementById(`title${id}`);
    this.subtitleEl = document.getElementById(`subtitle${id}`);
    this.bpmEl = document.getElementById(`bpm${id}`);
    this.jogwheel = document.getElementById(`jogwheel${id}`);
    this.urlInput = document.getElementById(`ytUrl${id}`);
    this.loadBtn = document.getElementById(`load${id}`);
    this.vuBar = document.getElementById(`vuBar${id}`);

    // Control buttons
    this.playBtn = document.getElementById(`play${id}`);
    this.pauseBtn = document.getElementById(`pause${id}`);
    this.stopBtn = document.getElementById(`stop${id}`);
    this.cueBtn = document.getElementById(`cue${id}`);

    // Web Audio Nodes
    this.source = audioCtx.createMediaElementSource(this.audio);
    this.gain = audioCtx.createGain();
    this.analyser = audioCtx.createAnalyser();

    // Connect nodes (through masterGain for recording)
    this.source.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(masterGain); // Conectar al masterGain para grabación

    this.gain.gain.value = 0.8;

    this.setupEventListeners();
    this.startVUMeter();
  }

  setupEventListeners() {
    // Play
    this.playBtn.addEventListener('click', () => this.play());

    // Pause
    this.pauseBtn.addEventListener('click', () => this.pause());

    // Stop
    this.stopBtn.addEventListener('click', () => this.stop());

    // Cue
    this.cueBtn.addEventListener('click', () => this.handleCue());

    // Load from URL
    this.loadBtn.addEventListener('click', () => this.loadFromUrl());
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.loadFromUrl();
    });

    // Audio events
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.jogwheel.classList.add('spinning');
      this.setActiveButton('play');
      wakeLockManager.request();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.jogwheel.classList.remove('spinning');
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.jogwheel.classList.remove('spinning');
      this.setActiveButton('stop');
    });
  }

  async play() {
    await audioCtx.resume();
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
    this.setActiveButton('pause');
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.setActiveButton('stop');
  }

  handleCue() {
    if (this.audio.paused) {
      // Si está pausado, salta al cue point
      this.audio.currentTime = this.cuePoint;
    } else {
      // Si está sonando, establece el cue point actual
      this.cuePoint = this.audio.currentTime;
      this.cueBtn.classList.add('active');
      setTimeout(() => this.cueBtn.classList.remove('active'), 200);
    }
  }

  setActiveButton(action) {
    [this.playBtn, this.pauseBtn, this.stopBtn].forEach(btn => btn.classList.remove('active'));
    if (action === 'play') this.playBtn.classList.add('active');
    if (action === 'pause') this.pauseBtn.classList.add('active');
    if (action === 'stop') this.stopBtn.classList.add('active');
  }

  async loadFromUrl() {
    const url = this.urlInput.value.trim();
    if (!url) return;

    this.loadBtn.disabled = true;
    this.loadBtn.textContent = '...';
    this.titleEl.textContent = 'Cargando...';
    this.subtitleEl.textContent = '';

    try {
      const response = await fetch(`/get-audio?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      this.audio.src = data.audioUrl;
      this.titleEl.textContent = this.extractTitle(url);
      this.subtitleEl.textContent = 'YouTube';
      this.cuePoint = 0;

    } catch (error) {
      console.error('[Deck] Error cargando:', error);
      this.titleEl.textContent = 'Error al cargar';
      this.subtitleEl.textContent = error.message;
    } finally {
      this.loadBtn.disabled = false;
      this.loadBtn.textContent = 'Cargar';
    }
  }

  loadTrack(audioPath, title, artist) {
    this.audio.src = audioPath;
    this.titleEl.textContent = title || 'Pista cargada';
    this.subtitleEl.textContent = artist || '';
    this.cuePoint = 0;
    this.isFading = false; // Reset fading flag on new track load
  }

  extractTitle(url) {
    // Intenta extraer algo legible de la URL
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? `Video: ${match[1]}` : 'Pista de YouTube';
  }


  setVolume(value) {
    this.gain.gain.value = value;
  }

  startVUMeter() {
    const dataArray = new Uint8Array(this.analyser.fftSize);

    const draw = () => {
      this.analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      const percent = Math.min(1, rms * 3) * 100;
      this.vuBar.style.height = `${percent}%`;

      requestAnimationFrame(draw);
    };

    draw();
  }
}

// ===== MIXER =====
class Mixer {
  constructor(deckA, deckB) {
    this.deckA = deckA;
    this.deckB = deckB;

    this.crossfader = document.getElementById('crossfader');
    this.transitionBtn = document.getElementById('transitionBtn');
    this.autoMixBtn = document.getElementById('autoMixBtn');

    this.autoMixActive = false;
    this.autoMixInterval = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Crossfader
    this.crossfader.addEventListener('input', () => this.updateMix());

    // Transition button
    this.transitionBtn.addEventListener('click', () => this.doTransition());

    // Auto mix
    this.autoMixBtn.addEventListener('click', () => this.toggleAutoMix());
  }

  updateMix() {
    const val = this.crossfader.value / 100;
    this.deckA.setVolume((1 - val) * 0.8);
    this.deckB.setVolume(val * 0.8);
  }

  doTransition(duration = 8000) {
    const startVal = parseInt(this.crossfader.value);
    const endVal = startVal < 50 ? 100 : 0;
    const steps = 100;
    const stepDuration = duration / steps;

    let currentStep = 0;

    this.transitionBtn.classList.add('active');

    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const easedProgress = this.easeInOutCubic(progress);

      this.crossfader.value = startVal + (endVal - startVal) * easedProgress;
      this.updateMix();

      if (currentStep >= steps) {
        clearInterval(interval);
        this.transitionBtn.classList.remove('active');
      }
    }, stepDuration);
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  toggleAutoMix() {
    this.autoMixActive = !this.autoMixActive;
    this.autoMixBtn.classList.toggle('active', this.autoMixActive);

    if (this.autoMixActive) {
      this.startAutoMix();
    } else {
      this.stopAutoMix();
    }
  }

  startAutoMix() {
    this.autoMixInterval = setInterval(() => {
      if (!this.autoMixActive) return;

      // Detectar cuál deck está reproduciendo
      const mainDeck = this.deckA.isPlaying ? this.deckA : (this.deckB.isPlaying ? this.deckB : null);
      const otherDeck = mainDeck === this.deckA ? this.deckB : this.deckA;

      if (!mainDeck) return;

      // Si quedan menos de 30 segundos, iniciar transición
      const timeLeft = mainDeck.audio.duration - mainDeck.audio.currentTime;
      if (timeLeft < 30 && timeLeft > 28 && otherDeck.audio.src) {
        otherDeck.play();
        this.doTransition(25000);
      }
    }, 1000);
  }

  stopAutoMix() {
    if (this.autoMixInterval) {
      clearInterval(this.autoMixInterval);
      this.autoMixInterval = null;
    }
  }
}

// ===== PLAYLIST MANAGER =====
class PlaylistManager {
  constructor(deckA, deckB, mixer) {
    this.deckA = deckA;
    this.deckB = deckB;
    this.mixer = mixer;
    this.tracks = [];
    this.currentIndex = 0;
    this.autoMixActive = false;

    this.urlInput = document.getElementById('playlistUrlInput');
    this.loadBtn = document.getElementById('loadPlaylistBtn');
    this.autoMixBtn = document.getElementById('playlistAutoMixBtn');
    this.container = document.getElementById('playlistContainer');
    this.statusEl = document.getElementById('automixStatus');
    this.historyDatalist = document.getElementById('playlist-history');

    this.loadHistory();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.loadBtn.addEventListener('click', () => this.loadPlaylist());
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.loadPlaylist();
    });
    this.autoMixBtn.addEventListener('click', () => this.toggleAutoMix());
  }

  async loadPlaylist() {
    const url = this.urlInput.value.trim();
    if (!url) return;

    this.loadBtn.disabled = true;
    this.loadBtn.textContent = 'Cargando...';
    this.statusEl.textContent = 'Obteniendo playlist...';
    this.statusEl.classList.remove('error');

    try {
      const response = await fetch(`/get-playlist-info?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      this.tracks = data.tracks;
      this.renderTracks();
      this.saveToHistory(url);
      this.statusEl.textContent = `${data.playlistTitle} - ${this.tracks.length} pistas`;

    } catch (error) {
      console.error('[Playlist] Error:', error);
      this.statusEl.textContent = `Error: ${error.message}`;
      this.statusEl.classList.add('error');
    } finally {
      this.loadBtn.disabled = false;
      this.loadBtn.textContent = 'Cargar Playlist';
    }
  }

  renderTracks() {
    this.container.innerHTML = this.tracks.map((track, index) => `
      <div class="track-item" data-index="${index}" data-id="${track.id}">
        <img class="thumb" src="https://img.youtube.com/vi/${track.id}/default.jpg" alt="">
        <div class="info">
          <div class="title">${track.title}</div>
          <div class="artist">${track.uploader || ''}</div>
        </div>
        <span class="duration">${this.formatDuration(track.duration)}</span>
      </div>
    `).join('');

    // Event listeners para cada track
    this.container.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.loadTrackToDeck(index, this.deckA);
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const index = parseInt(item.dataset.index);
        this.loadTrackToDeck(index, this.deckB);
      });
    });
  }

  async loadTrackToDeck(index, deck) {
    const track = this.tracks[index];
    if (!track) return;

    // Marcar como cargando
    this.container.querySelectorAll('.track-item').forEach(el => el.classList.remove('playing'));
    const trackEl = this.container.querySelector(`[data-index="${index}"]`);
    trackEl.classList.add('playing');

    this.statusEl.textContent = `Descargando: ${track.title}...`;

    try {
      const response = await fetch('/download-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: track.id })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      deck.loadTrack(data.path, track.title, track.uploader);
      this.statusEl.textContent = `Cargado en Deck ${deck.id}: ${track.title}`;

    } catch (error) {
      console.error('[Playlist] Error cargando track:', error);
      this.statusEl.textContent = `Error: ${error.message}`;
      this.statusEl.classList.add('error');
    }
  }

  toggleAutoMix() {
    this.autoMixActive = !this.autoMixActive;
    this.autoMixBtn.classList.toggle('active', this.autoMixActive);
    this.autoMixBtn.textContent = this.autoMixActive ? '⏹ Detener' : '▶ Automix';

    if (this.autoMixActive) {
      this.startPlaylistAutoMix();
    } else if (this.autoMixTimer) {
      clearInterval(this.autoMixTimer);
    }
  }

  async startPlaylistAutoMix() {
    if (!this.autoMixActive || this.tracks.length < 2) {
      this.statusEl.textContent = 'Playlist necesita al menos 2 pistas para automix.';
      this.toggleAutoMix(); // Turn it off
      return;
    }

    this.currentIndex = 0;
    this.statusEl.textContent = 'Iniciando Automix...';

    // Reset fading flags on both decks
    this.deckA.isFading = false;
    this.deckB.isFading = false;

    // Load first two tracks
    await this.loadTrackToDeck(this.currentIndex, this.deckA);
    await this.loadTrackToDeck(this.currentIndex + 1, this.deckB);

    // Start Deck A and set fader
    this.deckA.play();
    this.mixer.crossfader.value = 0;
    this.mixer.updateMix();
    
    this.monitorPlayback();
  }

  monitorPlayback() {
    if (this.autoMixTimer) clearInterval(this.autoMixTimer);

    this.autoMixTimer = setInterval(() => {
      if (!this.autoMixActive) {
        clearInterval(this.autoMixTimer);
        return;
      }

      const faderValue = parseInt(this.mixer.crossfader.value);
      
      // Don't do anything if a transition is already happening
      if (faderValue > 5 && faderValue < 95) {
          return;
      }
      
      const mainDeck = faderValue < 50 ? this.deckA : this.deckB;
      
      if (mainDeck.isPlaying && !mainDeck.isFading) {
        const timeLeft = mainDeck.audio.duration - mainDeck.audio.currentTime;

        if (timeLeft < 30) {
            mainDeck.isFading = true; // Mark as fading to prevent re-triggering
            this.handleAutoTransition();
        }
      }
    }, 2000); // Check every 2 seconds
  }

  async handleAutoTransition() {
    const faderValue = parseInt(this.mixer.crossfader.value);
    const currentDeck = faderValue < 50 ? this.deckA : this.deckB;
    const nextDeck = currentDeck === this.deckA ? this.deckB : this.deckA;

    if (!nextDeck.audio.src || nextDeck.audio.src.endsWith('/')) {
        console.log('[AutoMix] Fin de la playlist.');
        this.statusEl.textContent = 'Fin de la playlist.';
        this.toggleAutoMix();
        return;
    }

    console.log(`[AutoMix] Iniciando transición desde ${currentDeck.id} hacia ${nextDeck.id}`);
    nextDeck.play();
    this.mixer.doTransition(25000);

    // Update the index and preload the *next* track
    this.currentIndex++;
    const nextTrackIndex = this.currentIndex + 1;

    if (nextTrackIndex < this.tracks.length) {
        // Preload onto the deck that is now fading out
        console.log(`[AutoMix] Precargando pista ${nextTrackIndex} en Deck ${currentDeck.id}`);
        await this.loadTrackToDeck(nextTrackIndex, currentDeck);
    } else {
        console.log('[AutoMix] No hay más pistas para precargar.');
        currentDeck.isFading = true; // Mark the last fading deck to stop checks
    }
  }

  formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  saveToHistory(url) {
    let history = JSON.parse(localStorage.getItem('playlistHistory') || '[]');
    history = [url, ...history.filter(u => u !== url)].slice(0, 10);
    localStorage.setItem('playlistHistory', JSON.stringify(history));
    this.loadHistory();
  }

  loadHistory() {
    const history = JSON.parse(localStorage.getItem('playlistHistory') || '[]');
    this.historyDatalist.innerHTML = history.map(url => `<option value="${url}">`).join('');
  }
}

// ===== KEYBOARD SHORTCUTS =====
function setupKeyboardShortcuts(deckA, deckB) {
  document.addEventListener('keydown', (e) => {
    // Ignorar si estamos escribiendo en un input
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        deckA.isPlaying ? deckA.pause() : deckA.play();
        break;
      case 'KeyQ':
        deckA.play();
        break;
      case 'KeyW':
        deckA.pause();
        break;
      case 'KeyE':
        deckA.stop();
        break;
      case 'KeyP':
        deckB.isPlaying ? deckB.pause() : deckB.play();
        break;
      case 'KeyO':
        deckB.play();
        break;
      case 'KeyI':
        deckB.pause();
        break;
      case 'KeyU':
        deckB.stop();
        break;
    }
  });
}

// ===== INITIALIZATION =====
let wakeLockManager;
let deckA, deckB;
let mixer;
let playlistManager;
let mixRecorder;
let chromecastManager;

document.addEventListener('DOMContentLoaded', () => {
  console.log('[DJ Web Decks] Iniciando...');

  // Initialize Wake Lock
  wakeLockManager = new WakeLockManager();
  
  // Initialize Chromecast Manager
  chromecastManager = new ChromecastManager();
  
  // Initialize Audio Output Manager
  new AudioOutputManager();

  // Initialize Decks
  deckA = new Deck('A', '#00d4ff');
  deckB = new Deck('B', '#ff00aa');

  // Initialize Mixer
  mixer = new Mixer(deckA, deckB);

  // Initialize Mix Recorder
  mixRecorder = new MixRecorder();

  // Initialize Playlist Manager
  playlistManager = new PlaylistManager(deckA, deckB, mixer);

  // Setup Keyboard Shortcuts
  setupKeyboardShortcuts(deckA, deckB);

  console.log('[DJ Web Decks] ¡Listo! Grabación de mezclas habilitada.');
});
