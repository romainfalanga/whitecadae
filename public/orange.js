// Public entry points for the album and its escape game.
async function pageOrange() {
  const epoch=newEpoch();
  document.title = 'Escape Game Orange · White Cadae';
  app.innerHTML='<div class="loading">Ouverture de ton récit…</div>';
  let data;
  try{data=await api('/api/orange');}catch(error){if(!stale(epoch))app.innerHTML=`<h1>Escape Game Orange</h1><p>${esc(error.message)}</p><a href="/" data-link>Réessayer</a>`;return;}
  if(stale(epoch))return;
  const access=item=>`<a class="story-access" href="${esc(item.href)}" data-link><span>${item.lyricsHref?'Musique':'Explorer'}</span>${esc(item.title)} ↗</a>${item.lyricsHref?`<a class="story-lyrics" href="${esc(item.lyricsHref)}" data-link>Paroles de ${esc(item.title)} ↗</a>`:''}`;
  app.innerHTML=`<section class="orange-story story-progressive" aria-labelledby="story-title">
    <header class="story-header"><p class="eyebrow">Un récit qui s’ouvre avec tes découvertes</p><h1 id="story-title" class="orange-title">Escape Game <span>Orange</span></h1><p>Écouter. Chercher. Revenir avec un autre regard.</p></header>
    ${data.author?'<p class="story-author">Vue auteur · Tous les chapitres préparés sont visibles, y compris les révélations à définir. Les joueurs ne voient que les étapes atteintes.</p>':''}
    <div class="story-position"><span>${data.score===0?'Le récit commence ici':`Ton récit · Échelon ${data.level}`}</span>${data.level>1?'<button type="button" id="story-current">Reprendre ma lecture ↓</button>':'<a href="/echelon" data-link>Chercher les premiers signes →</a>'}</div>
    ${data.chapters.length>1?`<details class="story-index"><summary>Retrouver un échelon</summary><nav aria-label="Chapitres accessibles">${data.chapters.map(c=>`<a href="#recit-${c.level}" ${c.level===data.level?'aria-current="step"':''}>${c.level}</a>`).join('')}</nav></details>`:''}
    <div class="story-chapters">${data.chapters.map(c=>`<article id="recit-${c.level}" class="story-chapter ${c.apocalypse?'story-revelation':''}" ${c.level===data.level?'aria-current="step"':''}><div class="story-chapter-heading"><h2>Échelon ${c.level}</h2>${c.apocalypse?'<span class="story-apocalypse">Apocalypse · Révélation</span>':''}</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>${c.access.length?`<div class="story-resources" aria-label="Accès de cet échelon">${c.access.map(access).join('')}</div>`:''}${c.videos.length?`<div class="story-videos"><h4>Pour aller plus loin</h4>${c.videos.map(video=>`<a href="${esc(safeUrl(video.url))}" target="_blank" rel="noopener noreferrer">Voir ${esc(video.title)} ↗</a>`).join('')}</div>`:''}</article>`).join('')}</div>
    ${data.historicalAccess.length?`<section class="story-extra"><h2>Tes accès conservés</h2><p>Ces contenus restent accessibles grâce à ta progression précédente.</p>${data.historicalAccess.map(access).join('')}</section>`:''}
    ${data.discovery?`<section class="story-extra"><h2>Une découverte ouvre aussi un chemin</h2><a href="${esc(data.discovery.href)}" data-link>Retrouver ${esc(data.discovery.title)} →</a></section>`:''}
    <footer class="story-next"><p class="eyebrow">L’histoire continue</p><h2>${data.nextLevel?`La suite à l’échelon ${data.nextLevel}`:'Continue d’explorer'}</h2><p>Chaque nouvel échelon dévoile un autre paragraphe. Tu peux toujours revenir sur ceux que tu as déjà ouverts.</p>${data.nextAccess.length?`<p class="story-next-access">Prochain contenu · ${data.nextAccess.map(i=>`${esc(i.title)} — échelon ${i.level}`).join(' · ')}</p>`:''}<a class="orange-button" href="/echelon" data-link>Poursuivre les énigmes →</a></footer>
  </section>`;
  const current=()=>document.getElementById('recit-'+Math.min(data.level,data.chapters.at(-1).level));
  document.getElementById('story-current')?.addEventListener('click',()=>current()?.scrollIntoView({block:'start',behavior:'auto'}));
  if(location.hash==='#mon-palier')current()?.scrollIntoView({block:'start'});
  else if(/^#recit-\d+$/.test(location.hash))document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'start'});
}

async function pageMusique() {
  const epoch=newEpoch();
  document.title = 'Musiques · White Cadae';
  app.innerHTML='<div class="loading">Chargement…</div>';
  try {const data=await api('/api/music');if(stale(epoch))return;WCPlayer.setAlbums(data.albums);}
  catch(err){if(!stale(epoch))app.innerHTML=`<h1>Musiques</h1><p>${esc(err.message)}</p><a href="/musique" data-link>Réessayer</a>`;return;}
  app.innerHTML = `<h1 class="music-page-title">Musiques</h1>${WCPlayer.getAlbums().map(album=>`<section class="music-release" id="album-${esc(album.id)}" aria-labelledby="album-title-${esc(album.id)}"><div class="music-album">
    ${album.cover?`<img class="music-cover" src="${esc(album.cover)}" alt="Pochette de l’album ${esc(album.album)}" width="360" height="360">`:'<div class="music-date-art" aria-hidden="true"><span>18</span><span>juillet</span><span>2019</span></div>'}
    <div><h2 id="album-title-${esc(album.id)}">${esc(album.album)}</h2><p class="music-artist">${esc(album.artist)}</p><p class="music-meta">${album.tracks.length} morceau${album.tracks.length>1?'x':''} <span>·</span> ${mmss(Math.floor(album.tracks.reduce((sum,t)=>sum+t.duration,0)))}</p></div>
  </div>
  <div class="music-list" aria-label="Les morceaux de ${esc(album.album)} dans l’ordre">
    <div class="music-list-head"><span>L’album, dans l’ordre</span><span>Durée</span></div>
    <ol>${album.tracks.map((t, i) => `<li id="track-${t.slug}" data-track-row="${t.slug}">
      <span class="track-number">${String(i + 1).padStart(2, '0')}</span>
      <button class="track-play" data-play-track="${t.slug}" aria-label="Écouter ${esc(t.title)}">${WCIcon('play')}<span>${esc(t.title)}<small>${esc(album.artist)}</small></span></button>
      <a class="track-lyrics" href="/chanson/${t.slug}" data-link aria-label="Lire les paroles de ${esc(t.title)}">${WCIcon('book')}<span>Paroles</span></a>
      <span class="track-duration">${mmss(Math.floor(t.duration))}</span>
    </li>`).join('')}</ol>
  </div></section>`).join('')}<p class="album-game-link"><a href="/echelon" data-link>Le jeu se poursuit dans Échelons →</a></p>`;
  bindMusicButtons();
  if(/^#(?:album|track)-/.test(location.hash))document.getElementById(location.hash.slice(1))?.scrollIntoView();
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
    const t = WCPlayer.findTrack(button.dataset.playTrack);
    if(!t){button.disabled=true;return;}
    const playing = current.slug === t.slug && (current.playing || current.loading);
    const label = `${playing ? 'Mettre en pause' : 'Écouter'} ${t.title}`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(playing));
    button.innerHTML = button.classList.contains('track-play')
      ? `${WCIcon(playing ? 'pause' : 'play')}<span>${esc(t.title)}<small>${esc(t.artist)}</small></span>`
      : `${WCIcon(playing ? 'pause' : 'play')} ${playing ? 'Mettre en pause' : 'Écouter le morceau'}`;
  });
  document.querySelectorAll('[data-track-row]').forEach((row) => {
    row.classList.toggle('is-current', row.dataset.trackRow === current.slug);
  });
}
window.addEventListener('wc:music', updateMusicButtons);
