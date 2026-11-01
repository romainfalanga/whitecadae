const themePath = id => `/loge-virtuelle/theme?theme=${encodeURIComponent(String(id ?? ''))}`;
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const escapeWith = esc => value => esc(String(value ?? ''));

function dateRange(startsAt, endsAt, esc) {
  const format = value => {
    if (value === null || value === undefined || value === '') return '';
    const date = new Date(Number(value) * 1000);
    if (!Number.isFinite(date.getTime())) return '';
    return esc(date.toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric'
    }));
  };
  const start = format(startsAt), end = format(Number.isFinite(Number(endsAt))?Number(endsAt)-1:endsAt);
  return start && end ? `${start} – ${end}` : start || end;
}

export function proposalMarkup(proposal, esc) {
  const e = escapeWith(esc), id = e(proposal.id), liked = !!proposal.liked;
  const label = `${liked ? 'Retirer mon soutien à' : 'Soutenir'} « ${proposal.title ?? ''} »`;
  return `<article class="loge-theme-proposal" id="loge-proposal-${id}">
    <div class="loge-theme-proposal-copy"><h3>${e(proposal.title)}</h3>${proposal.proposedBy?.username ? `<p>Proposé par ${e(proposal.proposedBy.username)}</p>` : ''}</div>
    <button type="button" class="loge-theme-like" data-theme-like="${id}" aria-pressed="${liked}" aria-label="${e(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg><span>${count(proposal.likes)}</span></button>
  </article>`;
}

export function historyMarkup(theme, esc) {
  const e = escapeWith(esc), editions = count(theme.editions), videos = count(theme.videoCount);
  return `<article class="loge-theme-history-row"><div><h3><a href="${e(themePath(theme.id))}" data-link>${e(theme.title)}</a></h3><p>${editions} édition${editions > 1 ? 's' : ''} · ${videos} vidéo${videos > 1 ? 's' : ''}</p></div><button type="button" class="loge-button is-quiet" data-theme-propose="${e(theme.id)}">Proposer pour la semaine prochaine</button></article>`;
}

export function themeOverviewMarkup(data, selectedTheme, esc) {
  const e = escapeWith(esc), current = data.current?.themeId != null ? data.current : null;
  const currentDates = current ? dateRange(current.startsAt, current.endsAt, e) : '';
  const upcomingDates = data.nextWeek ? dateRange(data.nextWeek.startsAt, data.nextWeek.endsAt, e) : '';
  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  const history = Array.isArray(data.history) ? data.history : [];
  return `<div class="loge-theme-content">
    <section class="loge-theme-current" aria-labelledby="loge-current-theme-heading"><h2 id="loge-current-theme-heading">Cette semaine</h2>${current ? `<h3><a href="${e(themePath(current.themeId))}" data-link>${e(current.title)}</a></h3>${currentDates ? `<p class="loge-theme-dates">${currentDates}</p>` : ''}` : '<p class="loge-theme-muted">Aucun thème cette semaine.</p>'}</section>
    <section class="loge-theme-upcoming" aria-labelledby="loge-next-theme-heading"><h2 id="loge-next-theme-heading">La semaine prochaine</h2>${upcomingDates ? `<p class="loge-theme-dates">${upcomingDates}</p>` : ''}
      <div id="loge-theme-proposals">${proposals.length ? proposals.map(item => proposalMarkup(item, esc)).join('') : '<p class="loge-theme-muted">Aucune proposition pour le moment.</p>'}</div>
      <button type="button" class="loge-button is-quiet loge-theme-more" id="loge-theme-proposals-more"${data.next == null ? ' hidden' : ''}>Voir plus de propositions</button>
      <form id="loge-theme-propose-form" class="loge-theme-form"><label for="loge-theme-title">Proposer un thème</label><div class="loge-theme-form-row"><input id="loge-theme-title" name="title" type="text" required maxlength="140" autocomplete="off"><button type="submit" class="loge-button">Proposer</button></div></form>
      <p id="loge-theme-proposal-status" class="loge-status" role="status" aria-live="polite"></p>
    </section>
    <details class="loge-theme-history"${selectedTheme ? ' open' : ''}><summary>Les thèmes précédents</summary><form id="loge-theme-search-form" class="loge-theme-form"><label for="loge-theme-query">Rechercher un thème</label><div class="loge-theme-form-row"><input id="loge-theme-query" name="q" type="search" maxlength="140" autocomplete="off"><button type="submit" class="loge-button is-quiet">Rechercher</button></div></form><div id="loge-theme-history">${history.length ? history.map(item => historyMarkup(item, esc)).join('') : '<p class="loge-theme-muted">Aucun thème trouvé.</p>'}</div><button type="button" class="loge-button is-quiet loge-theme-more" id="loge-theme-history-more"${data.historyNext == null ? ' hidden' : ''}>Voir plus de thèmes</button></details>
    <p id="loge-theme-status" class="loge-status" role="status" aria-live="polite"></p>
  </div>`;
}
