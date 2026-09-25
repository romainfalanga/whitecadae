// Public entry points for the album and its escape game.
function pageOrange() {
  newEpoch();
  document.title = 'Escape Game Orange · White Cadae';
  app.innerHTML = `<section class="orange-story" aria-labelledby="story-title">
    <h1 id="story-title" class="orange-title">Escape Game <span>Orange</span></h1>
    <p class="eyebrow">Entre l’enfer et le paradis</p>
    <div class="orange-story-text"><p>Vulpis était en enfer. Les quatre morceaux de son petit album <strong>57</strong> l’ont aidé à s’en échapper et à trouver le chemin vers son paradis. En mettant en musique ce qu’il traversait, en extériorisant ce qu’il portait en lui, il a laissé des signes dans ses textes.</p>
    <p>Dans ces quatre morceaux, plusieurs grilles de lecture se superposent : les mêmes paroles peuvent raconter plusieurs choses à la fois. Un mot, une expression, un nombre, une sonorité ou un rapprochement entre deux passages peut révéler un autre sens. Ces codes cachés sont les <strong>signes</strong> que tu dois retrouver.</p>
    <p>Écoute, réécoute et lis les paroles. Fais dialoguer les morceaux pour découvrir les différentes lectures qu’ils contiennent. Puis rends-toi sur la <a href="/echelon" data-link>page Échelons</a> pour proposer les signes que tu as trouvés et progresser dans l’escape game.</p></div>
  </section>`;
}

function pageMusique() {
  newEpoch();
  document.title = '57 · Vulpis · White Cadae';
  app.innerHTML = `<section class="music-album">
    <img class="music-cover" src="${WC57.cover}" alt="Pochette de l’album 57 de Vulpis" width="360" height="360">
    <div><p class="eyebrow">L’album de l’Escape Game Orange</p><h1>57</h1><p class="music-artist">Vulpis</p><p class="music-meta">4 morceaux <span>·</span> 12 min 39</p></div>
  </section>
  <section class="music-list" aria-label="Les quatre morceaux dans l’ordre">
    <div class="music-list-head"><span>L’album, dans l’ordre</span><span>Durée</span></div>
    <ol>${WC57.tracks.map((t, i) => `<li data-track-row="${t.slug}">
      <span class="track-number">${String(i + 1).padStart(2, '0')}</span>
      <button class="track-play" data-play-track="${t.slug}" aria-label="Écouter ${esc(t.title)}">${WCIcon('play')}<span>${esc(t.title)}<small>Vulpis</small></span></button>
      <a class="track-lyrics" href="/chanson/${t.slug}" data-link aria-label="Lire les paroles de ${esc(t.title)}">${WCIcon('book')}<span>Paroles</span></a>
      <span class="track-duration">${mmss(Math.floor(t.duration))}</span>
    </li>`).join('')}</ol>
  </section><p class="album-game-link"><a href="/echelon" data-link>Le jeu se poursuit dans Échelons →</a></p>`;
  bindMusicButtons();
}

function bindMusicButtons() {
  document.querySelectorAll('[data-play-track]').forEach((button) => {
    button.onclick = () => WCPlayer.toggle(button.dataset.playTrack);
  });
  updateMusicButtons();
}

function updateMusicButtons() {
  const current = WCPlayer.snapshot();
  document.querySelectorAll('[data-play-track]').forEach((button) => {
    const t = WC57.tracks.find((track) => track.slug === button.dataset.playTrack);
    const playing = current.slug === t.slug && (current.playing || current.loading);
    const label = `${playing ? 'Mettre en pause' : 'Écouter'} ${t.title}`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(playing));
    button.innerHTML = button.classList.contains('track-play')
      ? `${WCIcon(playing ? 'pause' : 'play')}<span>${esc(t.title)}<small>Vulpis</small></span>`
      : `${WCIcon(playing ? 'pause' : 'play')} ${playing ? 'Mettre en pause' : 'Écouter le morceau'}`;
  });
  document.querySelectorAll('[data-track-row]').forEach((row) => {
    row.classList.toggle('is-current', row.dataset.trackRow === current.slug);
  });
}
window.addEventListener('wc:music', updateMusicButtons);
