/**
 * dashboard.js — Current month's reading & quick stats.
 */

(async () => {
  // ── Boot ───────────────────────────────────────────────
  try {
    await App.init();
  } catch {
    document.getElementById('main-content').innerHTML =
      `<div class="loading-state"><p>Could not load data. Make sure you're running this via a web server, not the file:// protocol.</p></div>`;
    return;
  }

  if (!App.checkAuth()) return;

  const session = App.getSession();
  if (!session) return;

  // Render nav user info
  document.getElementById('nav-member-name').textContent = session.memberName;
  const member = App.findMemberById(session.memberId);
  if (member && member.isAdmin) {
    document.getElementById('admin-nav-link').classList.remove('hidden');
  }

  // ── Current Session ────────────────────────────────────
  const currentSession = App.getCurrentSession();
  const main = document.getElementById('main-content');

  if (!currentSession) {
    main.innerHTML = `
      <div class="section">
        <div class="section__inner">
          <div class="empty-state">
            <span class="empty-state__icon">📚</span>
            <p>No reading session is currently active. Check back soon!</p>
            <a href="archive.html" class="btn btn--secondary mt-2">View Past Books</a>
          </div>
        </div>
      </div>`;
    return;
  }

  // ── Page Hero ──────────────────────────────────────────
  document.getElementById('hero-label').textContent = currentSession.label;
  document.getElementById('hero-count').textContent =
    currentSession.books.length === 2 ? 'Two Books This Month' : 'This Month\'s Read';

  // ── Stats Bar ──────────────────────────────────────────
  renderStats(currentSession);

  // ── Book Cards ─────────────────────────────────────────
  const grid = document.getElementById('books-grid');
  if (currentSession.books.length === 1) grid.classList.add('books-grid--single');

  currentSession.books.forEach(book => {
    grid.appendChild(buildBookCard(book, session));
  });

  // ── Recent Responses ───────────────────────────────────
  renderRecentResponses(currentSession);

  // ── Admin Panel ────────────────────────────────────────
  if (member && member.isAdmin) {
    document.getElementById('admin-section').classList.remove('hidden');
  }
})();

// ── Render Functions ───────────────────────────────────────

function renderStats(currentSession) {
  const allRatings = currentSession.books.flatMap(b => App.getRatingsForBook(b.id));
  const allComments = currentSession.books.flatMap(b => App.getCommentsForBook(b.id));
  const members = App.getAllMembers();

  document.getElementById('stat-members').textContent = members.length;
  document.getElementById('stat-ratings').textContent = allRatings.length;
  document.getElementById('stat-comments').textContent = allComments.length;

  if (currentSession.books.length === 1) {
    const avg = App.averageRating(currentSession.books[0].id);
    document.getElementById('stat-avg').textContent = avg ? `${avg} ★` : '—';
  } else {
    document.getElementById('stat-avg-label').textContent = 'Books This Month';
    document.getElementById('stat-avg').textContent = '2';
  }
}

function buildBookCard(book, session) {
  const ratings = App.getRatingsForBook(book.id);
  const avg = App.averageRating(book.id);
  const comments = App.getCommentsForBook(book.id);
  const recPct = App.recommendPercent(book.id);
  const myRating = App.getMemberRatingForBook(book.id, session.memberId);
  const myComment = App.getMemberCommentForBook(book.id, session.memberId);

  const card = document.createElement('div');
  card.className = 'book-card';
  card.innerHTML = `
    <div class="book-card__cover" style="background:${book.coverColor}; color:${book.coverTextColor}">
      <span class="book-card__genre-badge" style="color:${book.coverTextColor}">${book.genre}</span>
      <div class="book-card__cover-text">
        <div class="book-card__title">${esc(book.title)}</div>
        <div class="book-card__author">${esc(book.author)}</div>
      </div>
    </div>
    <div class="book-card__body">
      <p class="book-card__desc">${esc(book.description)}</p>
      <div class="book-card__meta">
        <span>📖 ${book.pages} pages</span>
        ${book.selectedBy ? `<span>🎯 Picked by ${esc(book.selectedBy)}</span>` : ''}
      </div>

      <div class="book-card__rating-row">
        ${avg
          ? `${App.starsHTML(Math.round(avg), { size: 'sm' })}
             <span class="book-card__avg-rating">${avg}</span>
             <span class="book-card__count">(${ratings.length} rating${ratings.length !== 1 ? 's' : ''})</span>`
          : `<span class="book-card__count">No ratings yet — be first!</span>`}
        ${recPct !== null ? `<span class="book-card__rec">👍 ${recPct}% recommend</span>` : ''}
      </div>

      ${buildInlineRating(book, session, myRating)}

      <div class="book-card__actions">
        <a href="book.html?id=${book.id}" class="btn btn--primary btn--sm">
          💬 ${comments.length} Discussion${comments.length !== 1 ? 's' : ''} →
        </a>
        ${myComment
          ? `<span class="badge badge--success">✓ Shared</span>`
          : `<a href="book.html?id=${book.id}#share" class="btn btn--ghost btn--sm">Share thoughts</a>`}
      </div>
    </div>`;
  return card;
}

function buildInlineRating(book, session, myRating) {
  const widgetId = `stars-${book.id}`;
  const existing = myRating ? myRating.stars : 0;
  const allowEdit = App.state.config.allowEditRatings;

  // We'll attach listeners after DOM insertion via MutationObserver trick — simpler: use setTimeout
  setTimeout(() => {
    const container = document.getElementById(widgetId);
    if (!container) return;

    const widget = App.initStarWidget(container, (val) => {
      updateSelectedLabel(widgetId, val);
    });
    widget.setValue(existing);
    if (existing) updateSelectedLabel(widgetId, existing);

    const form = container.closest('.rating-panel');
    if (!form) return;
    const saveBtn = form.querySelector('.rating-save-btn');
    if (!saveBtn) return;

    if (myRating && !allowEdit) {
      container.querySelectorAll('.star').forEach(s => s.style.cursor = 'default');
      container.style.pointerEvents = 'none';
      saveBtn.disabled = true;
      saveBtn.title = 'Editing ratings is disabled';
      return;
    }

    saveBtn.addEventListener('click', () => {
      const stars = widget.getValue();
      if (!stars) { App.showToast('Please pick a star rating first.', 'warning'); return; }
      const rec = form.querySelector('.rec-checkbox') ? form.querySelector('.rec-checkbox').checked : false;

      try {
        App.saveRating({ bookId: book.id, memberId: session.memberId, memberName: session.memberName, stars, wouldRecommend: rec });
        App.showToast(myRating ? 'Rating updated!' : 'Rating saved — thanks!', 'success');
        saveBtn.textContent = '✓ Saved';
        saveBtn.disabled = true;
        setTimeout(() => location.reload(), 1000);
      } catch (e) {
        App.showToast(e.message, 'error');
      }
    });
  }, 0);

  return `
    <div class="rating-panel">
      <div class="rating-panel__title">${myRating ? 'Your rating' : 'Rate this book'}</div>
      <div class="rating-panel__stars-row">
        ${App.starsHTML(existing, { interactive: true, bookId: book.id })}
        <span id="${widgetId}-label" class="rating-panel__selected-label">
          ${existing ? App.STAR_LABELS[existing] : 'Tap a star'}
        </span>
      </div>
      <div class="rating-panel__rec-row">
        <input type="checkbox" class="rec-checkbox" id="rec-${book.id}"
          ${myRating && myRating.wouldRecommend ? 'checked' : ''}>
        <label for="rec-${book.id}">I would recommend this book</label>
      </div>
      <button class="btn btn--accent btn--sm rating-save-btn"
        ${myRating && !allowEdit ? 'disabled title="Editing disabled"' : ''}>
        ${myRating ? 'Update rating' : 'Save rating'}
      </button>
      ${myRating ? `<div class="rating-panel__existing">You rated this ${myRating.stars}/5 on ${App.formatDateShort(myRating.timestamp)}</div>` : ''}
    </div>`;
}

function updateSelectedLabel(widgetId, val) {
  const el = document.getElementById(`${widgetId}-label`);
  if (el) el.textContent = App.STAR_LABELS[val] || '';
}

function renderRecentResponses(currentSession) {
  const allComments = currentSession.books
    .flatMap(b => App.getCommentsForBook(b.id).map(c => ({ ...c, book: b })))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 6);

  const container = document.getElementById('recent-responses');
  const section   = document.getElementById('responses-section');

  if (!allComments.length) {
    section.querySelector('.empty-state').classList.remove('hidden');
    return;
  }

  allComments.forEach(comment => {
    container.appendChild(buildResponseCard(comment, comment.book));
  });
}

function buildResponseCard(comment, book) {
  const rating = App.getMemberRatingForBook(book.id, comment.memberId);
  const card = document.createElement('div');
  card.className = 'response-card';

  const recBadge = rating
    ? `<span class="response-card__rec${!rating.wouldRecommend ? ' response-card__rec--no' : ''}">
         ${rating.wouldRecommend ? '👍 Recommends' : '👎 Not for everyone'}
       </span>`
    : '';

  card.innerHTML = `
    <div class="response-card__header">
      <div class="response-card__member">
        <div class="member-avatar member-avatar--sm"
          style="background:hsl(${nameHue(comment.memberName)},45%,38%)">
          ${initials(comment.memberName)}
        </div>
        <div>
          <div class="response-card__name">${esc(comment.memberName)}</div>
          <div class="response-card__date">${App.formatDateShort(comment.timestamp)} · ${esc(book.title)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.25rem">
        ${rating ? App.starsHTML(rating.stars, { size: 'sm' }) : ''}
        ${recBadge}
      </div>
    </div>
    ${comment.liked ? `<div class="response-card__field">
      <div class="response-card__field-label">Liked</div>
      ${esc(comment.liked)}
    </div>` : ''}
    ${comment.favoriteQuote ? `<div class="response-card__quote">${esc(comment.favoriteQuote)}</div>` : ''}
    ${comment.discussionThoughts ? `<div class="response-card__field">
      <div class="response-card__field-label">Thoughts</div>
      ${esc(comment.discussionThoughts).slice(0, 160)}${comment.discussionThoughts.length > 160 ? '…' : ''}
    </div>` : ''}`;

  return card;
}

// ── Admin ──────────────────────────────────────────────────
function exportData() {
  App.exportLocalData();
  App.showToast('Export downloaded!', 'success');
}

function signOut() {
  App.clearSession();
  window.location.href = 'index.html';
}

// ── Small Helpers ──────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function nameHue(name) {
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}
