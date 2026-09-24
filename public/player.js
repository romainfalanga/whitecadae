// One audio element survives every SPA route, including account changes.
(() => {
  'use strict';
  const album = window.WC57;
  const audio = document.getElementById('music-audio');
  const root = document.getElementById('music-player');
  const key = 'wc_music_57_v1';
  const icon = window.WCIcon;
  let selected = -1;
  let repeat = false;
  let pendingSeek = null;
  let lastSaved = 0;
  let requestId = 0;
  let loading = false;
  let automaticMedia = 0;
  const otherMedia = new Set();
  let error = '';

  const time = (s) => {
    const n = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };
  const track = () => album.tracks[selected];
  const duration = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : track()?.duration || 0;
  const active = () => !!track() && (!audio.paused || loading);
  const safeStore = (value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ } };
  const save = () => {
    if (!track()) return;
    safeStore({ slug: track().slug, position: pendingSeek ?? audio.currentTime, repeat, volume: audio.volume });
    lastSaved = Date.now();
  };
  const signal = () => window.dispatchEvent(new CustomEvent('wc:music', { detail: snapshot() }));
  function snapshot() {
    return { slug: track()?.slug || null, playing: !audio.paused, loading, repeat, error };
  }

  root.innerHTML = `
    <div class="player-main">
      <a class="player-art" href="/57" data-link aria-label="Ouvrir la playlist 57"><img src="${album.cover}" alt="Pochette de 57" width="52" height="52"></a>
      <div class="player-track"><a id="player-title" href="/57" data-link></a><span>Vulpis <span aria-hidden="true">·</span> 57</span></div>
      <div class="player-buttons">
        <button type="button" class="player-icon" id="player-prev" aria-label="Morceau précédent">${icon('previous')}</button>
        <button type="button" class="player-icon player-play" id="player-play" aria-label="Lire">${icon('play')}</button>
        <button type="button" class="player-icon" id="player-next" aria-label="Morceau suivant">${icon('next')}</button>
      </div>
      <div class="player-extras">
        <a class="player-icon" id="player-lyrics" data-link aria-label="Lire les paroles du morceau">${icon('book')}</a>
        <button type="button" class="player-icon" id="player-repeat" aria-label="Répéter l’album" aria-pressed="false">${icon('repeat')}</button>
        <label class="player-volume">${icon('volume')}<span class="sr-only">Volume</span><input id="player-volume" type="range" min="0" max="1" step="0.05" value="1"></label>
      </div>
    </div>
    <div class="player-progress"><span id="player-elapsed">0:00</span><input id="player-seek" type="range" min="0" max="1" step="0.1" value="0" aria-label="Position dans le morceau"><span id="player-duration">0:00</span></div>
    <p class="player-status" id="player-status" role="status" aria-live="polite" hidden></p>`;
  const el = (id) => document.getElementById(`player-${id}`);
  const resize = () => {
    document.documentElement.style.setProperty('--player-height', `${root.hidden ? 0 : Math.ceil(root.getBoundingClientRect().height)}px`);
  };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(root);
  window.addEventListener('resize', resize);

  function updatePosition() {
    const d = duration();
    const t = pendingSeek ?? audio.currentTime;
    el('elapsed').textContent = time(t);
    el('duration').textContent = time(d);
    el('seek').max = String(d || 1);
    el('seek').value = String(Math.min(t, d || 0));
    el('seek').setAttribute('aria-valuetext', `${time(t)} sur ${time(d)}`);
    el('seek').style.setProperty('--progress', `${d ? Math.min(100, 100 * t / d) : 0}%`);
    if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function' && Number.isFinite(audio.duration) && audio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate });
      } catch { /* optional browser support */ }
    }
  }

  function update() {
    root.hidden = !track();
    document.body.classList.toggle('with-player', !!track());
    if (!track()) return;
    el('title').textContent = track().title;
    el('lyrics').href = `/chanson/${track().slug}`;
    el('play').innerHTML = icon(active() ? 'pause' : 'play');
    el('play').setAttribute('aria-label', active() ? 'Mettre en pause' : error ? 'Réessayer la lecture' : 'Lire');
    el('next').disabled = selected === album.tracks.length - 1 && !repeat;
    el('repeat').setAttribute('aria-pressed', String(repeat));
    el('volume').value = String(audio.volume);
    root.classList.toggle('is-playing', !audio.paused);
    el('status').hidden = !error && !loading;
    el('status').textContent = error || (loading ? 'Chargement du morceau…' : '');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    updatePosition();
    resize();
    signal();
  }

  function systemMetadata() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track().title, artist: album.artist, album: album.album,
      artwork: [{ src: album.cover, sizes: '1024x1024', type: 'image/png' }],
    });
    const handlers = {
      play: () => playTrack(selected), pause,
      previoustrack: previous, nexttrack: next,
      seekto: (d) => seek(d.seekTime),
      seekbackward: (d) => seek(audio.currentTime - (d.seekOffset || 10)),
      seekforward: (d) => seek(audio.currentTime + (d.seekOffset || 10)),
      stop: () => { pause(); seek(0); },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* optional action */ }
    }
  }

  function pause() {
    requestId++;
    loading = false;
    audio.pause();
    save();
    update();
  }
  function seek(position) {
    const value = Math.max(0, Math.min(Number(position) || 0, duration()));
    if (!audio.src || audio.readyState < 1) pendingSeek = value;
    else { audio.currentTime = value; pendingSeek = null; }
    save();
    updatePosition();
  }

  // Called synchronously by the user's click (no await before audio.play).
  function playTrack(value = selected < 0 ? 0 : selected) {
    const index = typeof value === 'string' ? album.tracks.findIndex((t) => t.slug === value) : value;
    if (!Number.isInteger(index) || !album.tracks[index]) return;
    if (automaticMedia) {
      error = 'Une vidéo est en préparation. Réessaie la lecture dans un instant.';
      update();
      return;
    }
    for (const media of otherMedia) media.pause();
    document.querySelectorAll('audio, video').forEach((media) => { if (media !== audio) media.pause(); });
    const changed = index !== selected;
    const retry = !!audio.error;
    if (changed) { selected = index; pendingSeek = 0; }
    else if (retry) pendingSeek = audio.currentTime;
    const id = ++requestId;
    error = '';
    loading = true;
    if ('audioSession' in navigator) {
      try { navigator.audioSession.type = 'playback'; } catch { /* unsupported type */ }
    }
    if (changed || !audio.getAttribute('src') || retry) audio.src = track().src;
    if (audio.ended) { audio.currentTime = 0; pendingSeek = null; }
    systemMetadata();
    const started = audio.play();
    update();
    if (started) started.then(() => {
      if (id !== requestId) return;
      loading = false;
      update();
    }).catch((err) => {
      if (id !== requestId) return;
      loading = false;
      if (err.name !== 'AbortError') error = err.name === 'NotAllowedError'
        ? 'Appuie sur lecture pour reprendre le morceau.'
        : 'Le morceau ne se charge pas. Vérifie ta connexion puis réessaie.';
      update();
    });
  }

  function toggle(value) {
    const index = value == null ? selected : typeof value === 'string' ? album.tracks.findIndex((t) => t.slug === value) : value;
    if (index === selected && active()) pause();
    else playTrack(index < 0 ? 0 : index);
  }
  function next() {
    if (selected + 1 < album.tracks.length) playTrack(selected + 1);
    else if (repeat) playTrack(0);
  }
  function previous() {
    if (audio.currentTime > 3 || selected === 0) { seek(0); return; }
    playTrack(Math.max(0, selected - 1));
  }

  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 0.1));
      pendingSeek = null;
    }
    updatePosition();
  });
  audio.addEventListener('timeupdate', () => { updatePosition(); if (Date.now() - lastSaved > 5000) save(); });
  audio.addEventListener('durationchange', updatePosition);
  audio.addEventListener('playing', () => { loading = false; error = ''; update(); });
  audio.addEventListener('waiting', () => { if (!audio.paused) loading = true; update(); });
  audio.addEventListener('pause', () => { loading = false; save(); update(); });
  audio.addEventListener('volumechange', () => { save(); update(); });
  audio.addEventListener('error', () => { loading = false; error = 'Le morceau ne se charge pas. Vérifie ta connexion puis réessaie.'; update(); });
  audio.addEventListener('ended', () => { save(); next(); update(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else updatePosition(); });
  el('play').onclick = () => toggle();
  el('prev').onclick = previous;
  el('next').onclick = next;
  el('seek').oninput = (e) => seek(e.target.value);
  el('volume').oninput = (e) => { audio.volume = Number(e.target.value); };
  el('repeat').onclick = () => { repeat = !repeat; save(); update(); };

  // Other media take priority only when explicitly played. Merely opening a
  // page must never interrupt the album. Detached vocal players register too.
  function watchMedia(media) {
    otherMedia.add(media);
    media.addEventListener('play', () => { if (active()) pause(); });
    const release = () => { if (media.ended || !media.getAttribute('src')) otherMedia.delete(media); };
    media.addEventListener('ended', release);
    media.addEventListener('error', release);
  }
  document.addEventListener('play', (e) => {
    if (e.target !== audio && e.target instanceof HTMLMediaElement && active()) pause();
  }, true);

  // Automatic video generation also consumes an audio session, even muted.
  // Reserve it only while music is paused; music is never stopped by this job.
  async function reserveAutomaticMedia() {
    while (active()) await new Promise((resolve) => window.addEventListener('wc:music', resolve, { once: true }));
    automaticMedia++;
    let released = false;
    return () => { if (!released) { released = true; automaticMedia--; signal(); } };
  }

  window.WCPlayer = Object.freeze({
    playTrack, toggle, pause, snapshot, isPlaying: active, watchMedia, reserveAutomaticMedia,
    beforeRecording() { pause(); if ('audioSession' in navigator) { try { navigator.audioSession.type = 'auto'; } catch {} } },
  });
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved) {
      selected = album.tracks.findIndex((t) => t.slug === saved.slug);
      if (selected >= 0) pendingSeek = Math.max(0, Math.min(Number(saved.position) || 0, track().duration - 0.1));
      repeat = saved.repeat === true;
      if (Number.isFinite(saved.volume)) audio.volume = Math.max(0, Math.min(saved.volume, 1));
    }
  } catch { /* storage is optional */ }
  update();
})();
