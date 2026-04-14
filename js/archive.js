/**
 * archive.js — Past books archive page.
 */

(async () => {
  try {
    await App.init();
  } catch {
    document.getElementById('main-content').innerHTML =
      `<div class="loading-state"><p>Could not load data.</p></div>`;
    return;
  }

  if (!App.checkAuth()) return;

  const session = App.getSession();
  document.getElementById('nav-member-name').textContent = session.memberName;
  const member = App.findMemberById(session.memberId);
  if (member && member.isAdmin) document.getElementById('admin-nav-link').classList.remove('hidden');

  const pastSessions = App.getPastSessions();
  const grid = document.getElementById('archive-grid');

  if (!pastSessions.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state__icon">🕰️</span>
        <p>No past books yet — check back after the first month wraps up!</p>
      </div>`;
    return;
  }

  pastSessions.forEach(sess => {
    grid.appendChild(buildArchiveCard(sess));
  });

  // Stats summary
  const totalBooks   = pastSessions.flatMap(s => s.books).length;
  const totalRatings = pastSessions.flatMap(s => s.books).flatMap(b => App.getRatingsForBook(b.id)).length;
  document.getElementById('stat-past-sessions').textContent = pastSessions.length;
  document.getElementById('stat-past-books').textContent    = totalBooks;
  document.getElementById('stat-past-ratings').textContent  = totalRatings;
})();

function buildArchiveCard(sess) {
  const card = document.createElement('div');
  card.className = 'archive-card';

  const booksHTML = sess.books.map(book => {
    const avg      = App.averageRating(book.id);
    const count    = App.getRatingsForBook(book.id).length;
    const comments = App.getCommentsForBook(book.id).length;
    return `
      <div class="archive-book">
        <div class="archive-book__swatch" style="background:${book.coverColor}"></div>
        <div style="flex:1">
          <div class="archive-book__title">${esc(book.title)}</div>
          <div class="archive-book__author">${esc(book.author)}</div>
          ${book.selectedBy ? `<div style="font-size:0.75rem;color:var(--clr-text-muted);margin-bottom:0.2rem">🎯 ${esc(book.selectedBy)}</div>` : ''}
          <div class="archive-book__rating">
            ${avg ? `${App.starsHTML(Math.round(avg), { size: 'sm' })} ${avg} (${count})` : 'No ratings'}
            ${comments ? ` · ${comments} response${comments !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  card.innerHTML = `
    <div class="archive-card__month">${esc(sess.label)}</div>
    ${booksHTML}
    <div class="archive-card__actions">
      ${sess.books.map(b =>
        `<a href="book.html?id=${b.id}" class="btn btn--ghost btn--sm">View Discussion →</a>`
      ).join('')}
    </div>`;

  return card;
}

function signOut() {
  App.clearSession();
  window.location.href = 'index.html';
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
