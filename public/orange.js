// Public entry points for the album and its escape game.
function pageOrange() {
  newEpoch();
  document.title = 'Escape Game Orange · White Cadae';
  app.innerHTML = `<section class="orange-hero">
    <div class="orange-intro">
      <p class="eyebrow">Vulpis présente · une énigme musicale</p>
      <h1>Escape Game <em>Orange</em></h1>
      <p class="orange-lead">Quatre morceaux.<br>Plusieurs lectures.<br>Des signes à découvrir.</p>
      <p class="orange-invitation">Entre dans l’histoire de <strong>57</strong>. Écoute ce qui se dit… et ce qui se cache entre les lignes.</p>
      <div class="orange-actions"><a class="orange-button" href="/musique" data-link>${WCIcon('play')} Écouter l’album</a><a class="orange-secondary" href="/57" data-link>Entrer dans le jeu ${WCIcon('arrow')}</a></div>
    </div>
    <figure class="orange-cover"><img src="${WC57.cover}" width="1024" height="1024" alt="57, par Vulpis : un chiffre d’or porté par des ailes sur un fond orange"><figcaption><span>57</span><span>Vulpis · 4 morceaux · 12 min 39</span></figcaption></figure>
  </section>
  <section class="orange-story" aria-labelledby="story-title">
    <p class="eyebrow">Entre l’enfer et le paradis</p>
    <h2 id="story-title">Il s’est échappé.<br>Il a laissé des signes.</h2>
    <div class="orange-story-text"><p>Vulpis était en enfer. Il a réussi à s’en échapper. Avant de rejoindre son paradis, il a créé quatre musiques, réunies dans un petit album qu’il a appelé <strong>57</strong>.</p>
    <p>Dans ces quatre morceaux, plusieurs grilles de lecture se superposent : les mêmes paroles peuvent raconter plusieurs choses à la fois. Un mot, une expression, un nombre, une sonorité ou un rapprochement entre deux passages peut révéler un autre sens. Ces codes cachés sont les <strong>signes</strong> que tu dois retrouver.</p>
    <p>Écoute, réécoute et lis les paroles. Fais dialoguer les morceaux pour découvrir les différentes lectures qu’ils contiennent. Puis rends-toi sur la page <strong>57</strong> pour proposer les signes que tu as trouvés et progresser dans l’escape game.</p></div>
  </section>
  <section class="orange-steps" aria-label="Comment jouer">
    <a href="/musique" data-link><span class="step-number">01</span><h3>Écoute</h3><p>Quatre morceaux, dans l’ordre. Reviens sur un passage, laisse émerger un autre sens.</p><span class="step-link">La musique ${WCIcon('arrow')}</span></a>
    <a href="/paroles" data-link><span class="step-number">02</span><h3>Croise les lectures</h3><p>Lis les textes. Repère les correspondances et les signes qui s’y cachent.</p><span class="step-link">Les paroles ${WCIcon('arrow')}</span></a>
    <a href="/57" data-link><span class="step-number">03</span><h3>Trouve les signes</h3><p>Propose tes découvertes sur la page 57 et avance dans l’escape game.</p><span class="step-link">Le jeu ${WCIcon('arrow')}</span></a>
  </section>`;
}

function pageMusique() {
  newEpoch();
  document.title = 'Musique · 57 · Vulpis · White Cadae';
  app.innerHTML = `<section class="music-album">
    <img class="music-cover" src="${WC57.cover}" alt="Pochette de l’album 57 de Vulpis" width="360" height="360">
    <div><p class="eyebrow">L’album de l’Escape Game Orange</p><h1>57</h1><p class="music-artist">Vulpis</p><p class="music-meta">4 morceaux <span>·</span> 12 min 39</p>
    <p class="music-description">Une première écoute. Puis une autre lecture.<br>Les signes sont dans les morceaux.</p>
    <button class="orange-button" id="play-album">${WCIcon('play')} Écouter l’album</button></div>
  </section>
  <section class="music-list" aria-label="Les quatre morceaux dans l’ordre">
    <div class="music-list-head"><span>L’album, dans l’ordre</span><span>Durée</span></div>
    <ol>${WC57.tracks.map((t, i) => `<li data-track-row="${t.slug}">
      <span class="track-number">${String(i + 1).padStart(2, '0')}</span>
      <button class="track-play" data-play-track="${t.slug}" aria-label="Écouter ${esc(t.title)}">${WCIcon('play')}<span>${esc(t.title)}<small>Vulpis</small></span></button>
      <a class="track-lyrics" href="/chanson/${t.slug}" data-link aria-label="Lire les paroles de ${esc(t.title)}">${WCIcon('book')}<span>Paroles</span></a>
      <span class="track-duration">${mmss(Math.floor(t.duration))}</span>
    </li>`).join('')}</ol>
  </section>
  <div class="music-footer"><p>La musique t’accompagne pendant que tu explores le site.</p><a href="/57" data-link>Proposer un signe ${WCIcon('arrow')}</a></div>`;
  document.getElementById('play-album').onclick = () => WCPlayer.playTrack(0);
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
