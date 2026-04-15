/**
 * library.js — Library page: all books with stats, metadata, and sort controls.
 */

(async () => {
  try {
    await App.init();
  } catch {
    document.getElementById('lib-grid').innerHTML =
      `<div class="loading-state" style="grid-column:1/-1">
        <p>Could not load data. Make sure you're serving via HTTP.</p>
       </div>`;
    return;
  }

  if (!App.checkAuth()) return;

  const session = App.getSession();
  if (!session) return;

  // Nav user
  document.getElementById('nav-member-name').textContent = session.memberName;
  const member = App.findMemberById(session.memberId);
  if (member && member.isAdmin) document.getElementById('admin-nav-link').classList.remove('hidden');

  // Collect all books (past + current; skip upcoming)
  const allBooks = [];
  for (const sess of App.state.sessions) {
    if (sess.isUpcoming) continue;
    for (const book of sess.books) {
      allBooks.push({ book, session: sess });
    }
  }

  // ── Compute stats ───────────────────────────────────────────
  let totalRatings = 0;
  let totalPages   = 0;
  let ratingSum    = 0;
  let ratingCount  = 0;

  for (const { book } of allBooks) {
    const ratings = App.getRatingsForBook(book.id);
    totalRatings += ratings.length;
    totalPages   += book.pages || 0;
    for (const r of ratings) {
      ratingSum += r.stars;
      ratingCount++;
    }
  }

  const clubAvg = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : null;

  document.getElementById('lib-stat-books').textContent   = allBooks.length;
  document.getElementById('lib-stat-avg').textContent     = clubAvg ? `${clubAvg} ★` : '—';
  document.getElementById('lib-stat-ratings').textContent = totalRatings;
  document.getElementById('lib-stat-pages').textContent   = totalPages.toLocaleString();

  // ── Initial render ──────────────────────────────────────────
  let currentSort = 'date';
  renderGrid(allBooks, currentSort);

  // ── Sort controls ───────────────────────────────────────────
  document.querySelectorAll('.lib-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lib-sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      renderGrid(allBooks, currentSort);
    });
  });
})();

// ── Render the book grid ──────────────────────────────────────
function renderGrid(allBooks, sortBy) {
  const sorted = [...allBooks];

  if (sortBy === 'date') {
    sorted.sort((a, b) => b.session.id.localeCompare(a.session.id));
  } else if (sortBy === 'rating') {
    sorted.sort((a, b) => {
      const avgA = parseFloat(App.averageRating(a.book.id)) || 0;
      const avgB = parseFloat(App.averageRating(b.book.id)) || 0;
      return avgB - avgA || b.session.id.localeCompare(a.session.id);
    });
  } else if (sortBy === 'title') {
    sorted.sort((a, b) => a.book.title.localeCompare(b.book.title));
  }

  const grid = document.getElementById('lib-grid');
  grid.innerHTML = '';

  if (!sorted.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state__icon">📚</span>
        <p>No books in the library yet.</p>
      </div>`;
    return;
  }

  sorted.forEach(({ book, session }) => grid.appendChild(buildLibCard(book, session)));
}

// ── Build a single library card ───────────────────────────────
function buildLibCard(book, session) {
  const avg     = App.averageRating(book.id);
  const ratings = App.getRatingsForBook(book.id);
  const recPct  = App.recommendPercent(book.id);

  const card = document.createElement('a');
  card.className = 'lib-book-card';
  card.href = `book.html?id=${libEsc(book.id)}`;

  card.innerHTML = `
    <div class="lib-book-card__cover"
         style="background:${libEsc(book.coverColor || '#2C3E50')};color:${libEsc(book.coverTextColor || '#fff')}">
      <div class="lib-book-card__cover-month">${libEsc(session.label)}</div>
      <div class="lib-book-card__cover-title">${libEsc(book.title)}</div>
      <div class="lib-book-card__cover-author">${libEsc(book.author)}</div>
    </div>
    <div class="lib-book-card__body">
      <div class="lib-book-card__title">${libEsc(book.title)}</div>
      <div class="lib-book-card__author">${libEsc(book.author)}</div>
      <div class="lib-book-card__meta">
        ${book.genre   ? `<span>${libEsc(book.genre)}</span>`              : ''}
        ${book.pages   ? `<span>${book.pages.toLocaleString()} pages</span>` : ''}
        ${book.selectedBy ? `<span>🎯 ${libEsc(book.selectedBy)}</span>` : ''}
      </div>
      <div class="lib-book-card__rating-row">
        ${avg
          ? `${App.starsHTML(Math.round(avg), { size: 'sm' })}
             <strong class="lib-book-card__avg">${avg}</strong>`
          : `<span class="lib-book-card__no-rating">No ratings yet</span>`}
        ${ratings.length ? `<span class="lib-book-card__count">${ratings.length} rating${ratings.length !== 1 ? 's' : ''}</span>` : ''}
        ${recPct !== null ? `<span class="lib-book-card__rec">👍 ${recPct}%</span>` : ''}
      </div>
    </div>`;

  return card;
}

function libEsc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
