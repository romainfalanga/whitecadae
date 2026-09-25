// Public entry points for the album and its escape game.
async function pageOrange() {
  const epoch=newEpoch();
  document.title = 'Escape Game Orange · White Cadae';
  app.innerHTML = `<section class="orange-story" aria-labelledby="story-title">
    <h1 id="story-title" class="orange-title">Escape Game <span>Orange</span></h1>
    <div class="orange-story-text"><p>Vulpis était en enfer. Les quatre morceaux de son petit album <strong>57</strong> l’ont aidé à s’en échapper et à trouver le chemin vers son paradis. En mettant en musique ce qu’il traversait, en extériorisant ce qu’il portait en lui, il a laissé des signes dans ses textes.</p>
    <p>Dans ces quatre morceaux, plusieurs grilles de lecture se superposent : les mêmes paroles peuvent raconter plusieurs choses à la fois. Un mot, une expression, un nombre, une sonorité ou un rapprochement entre deux passages peut révéler un autre sens. Ces codes cachés sont les <strong>signes</strong> que tu dois retrouver.</p>
    <p>Écoute, réécoute et lis les paroles. Fais dialoguer les morceaux pour découvrir les différentes lectures qu’ils contiennent. Puis rends-toi sur la <a href="/echelon" data-link>page Échelons</a> pour proposer les signes que tu as trouvés et progresser dans l’escape game.</p></div>
    <div id="orange-aa"></div>
  </section>`;
  try{const journey=await api('/api/journey');if(!stale(epoch)&&journey.aa)document.getElementById('orange-aa').innerHTML='<a class="orange-button aa-entry" href="/aa" data-link>AA</a>';}catch{/* The public story remains readable offline. */}
}

async function pageAA(){
  const epoch=newEpoch();app.innerHTML='<div class="loading">Chargement…</div>';
  try{const story=await api('/api/aa');if(stale(epoch))return;
    document.title='AA · White Cadae';
    app.innerHTML=`<article class="aa-story"><a class="back-link" href="/" data-link>← Escape Game Orange</a><p class="eyebrow">18 juillet 2019</p><h1>${esc(story.title)}</h1><h2>${esc(story.subtitle)}</h2><div class="orange-story-text">${story.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div><nav class="aa-links" aria-label="Poursuivre l’exploration"><a href="/musique#album-18-juillet-2019" data-link>18 juillet 2019 →</a><a href="/parcours" data-link>Mon arborescence →</a></nav></article>`;
  }catch(err){if(!stale(epoch))app.innerHTML=`<h1>Un chemin à découvrir</h1><p>${esc(err.message)}</p><a href="/echelon" data-link>Retrouver Échelons →</a>`;}
}

async function pageMusique() {
  const epoch=newEpoch();
  document.title = 'Musiques · White Cadae';
  app.innerHTML='<div class="loading">Chargement…</div>';
  try {const data=await api('/api/music');if(stale(epoch))return;WCPlayer.setAlbums(data.albums);}
  catch(err){if(!stale(epoch))app.innerHTML=`<h1>Musiques</h1><p>${esc(err.message)}</p><a href="/musique" data-link>Réessayer</a>`;return;}
  app.innerHTML = `<h1 class="music-page-title">Musiques</h1>${WCPlayer.getAlbums().map(album=>`<section class="music-release" id="album-${esc(album.id)}" aria-labelledby="album-title-${esc(album.id)}"><div class="music-album">
    ${album.cover?`<img class="music-cover" src="${esc(album.cover)}" alt="Pochette de l’album ${esc(album.album)}" width="360" height="360">`:'<div class="music-date-art" aria-hidden="true"><span>18</span><span>juillet</span><span>2019</span></div>'}
    <div><h2 id="album-title-${esc(album.id)}">${esc(album.album)}</h2><p class="music-artist">${esc(album.artist)}</p><p class="music-meta">${album.tracks.length} morceaux <span>·</span> ${mmss(Math.floor(album.tracks.reduce((sum,t)=>sum+t.duration,0)))}</p></div>
  </div>
  <div class="music-list" aria-label="Les morceaux de ${esc(album.album)} dans l’ordre">
    <div class="music-list-head"><span>L’album, dans l’ordre</span><span>Durée</span></div>
    <ol>${album.tracks.map((t, i) => `<li data-track-row="${t.slug}">
      <span class="track-number">${String(i + 1).padStart(2, '0')}</span>
      <button class="track-play" data-play-track="${t.slug}" aria-label="Écouter ${esc(t.title)}">${WCIcon('play')}<span>${esc(t.title)}<small>${esc(album.artist)}</small></span></button>
      <a class="track-lyrics" href="/chanson/${t.slug}" data-link aria-label="Lire les paroles de ${esc(t.title)}">${WCIcon('book')}<span>Paroles</span></a>
      <span class="track-duration">${mmss(Math.floor(t.duration))}</span>
    </li>`).join('')}</ol>
  </div></section>`).join('')}<p class="album-game-link"><a href="/echelon" data-link>Le jeu se poursuit dans Échelons →</a></p>`;
  bindMusicButtons();
  if(location.hash.startsWith('#album-'))document.getElementById(location.hash.slice(1))?.scrollIntoView();
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
