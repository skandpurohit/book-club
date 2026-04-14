/**
 * book.js — Book detail page: full info, discussion form, member responses, spoilers.
 * URL: book.html?id=book-005
 */

(async () => {
  // ── Boot ────────────────────────────────────────────────
  try {
    await App.init();
  } catch {
    document.getElementById('main-content').innerHTML =
      `<div class="loading-state"><p>Could not load data. Make sure you're serving via HTTP.</p></div>`;
    return;
  }

  if (!App.checkAuth()) return;

  const session = App.getSession();
  if (!session) return;

  // ── Load Book ────────────────────────────────────────────
  const params  = new URLSearchParams(location.search);
  const bookId  = params.get('id');
  const result  = bookId ? App.getBookById(bookId) : null;

  if (!result) {
    document.getElementById('main-content').innerHTML =
      `<div class="section"><div class="section__inner">
        <div class="empty-state"><span class="empty-state__icon">📕</span>
        <p>Book not found.</p><a href="dashboard.html" class="btn btn--secondary mt-2">← Dashboard</a></div>
      </div></div>`;
    return;
  }

  const { book, sess: monthSession } = { book: result.book, sess: result.session };

  // Nav user
  document.getElementById('nav-member-name').textContent = session.memberName;
  const member = App.findMemberById(session.memberId);
  if (member && member.isAdmin) document.getElementById('admin-nav-link').classList.remove('hidden');

  // ── Book Header ──────────────────────────────────────────
  renderBookHeader(book, monthSession);

  // ── Rating Panel ────────────────────────────────────────
  renderRatingPanel(book, session);

  // ── Discussion Prompts ───────────────────────────────────
  renderPrompts(book);

  // ── Discussion Form ──────────────────────────────────────
  renderDiscussionForm(book, session);

  // ── Member Responses ─────────────────────────────────────
  renderResponses(book);

  // ── Spoiler Section ──────────────────────────────────────
  renderSpoilerSection(book, session);

  // Auto-scroll to #share if in URL
  if (location.hash === '#share') {
    setTimeout(() => {
      const el = document.getElementById('discussion-form-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  }
})();

// ── Book Header ─────────────────────────────────────────────
function renderBookHeader(book, monthSession) {
  const ratings  = App.getRatingsForBook(book.id);
  const avg      = App.averageRating(book.id);
  const comments = App.getCommentsForBook(book.id);
  const recPct   = App.recommendPercent(book.id);

  document.getElementById('back-link').href =
    monthSession.isCurrent ? 'dashboard.html' : 'archive.html';
  document.getElementById('back-link').textContent =
    `← ${monthSession.isCurrent ? 'Dashboard' : 'Archive'}`;

  document.getElementById('book-month').textContent = monthSession.label;
  document.title = `${book.title} — Page Turners`;

  const coverEl = document.getElementById('book-cover');
  coverEl.style.background = book.coverColor;
  coverEl.style.color = book.coverTextColor;
  coverEl.innerHTML = `
    <div>
      <div style="font-family:Georgia,serif;font-size:1.1rem;font-weight:bold;line-height:1.2;margin-bottom:0.2rem">${esc(book.title)}</div>
      <div style="font-size:0.8rem;opacity:0.8">${esc(book.author)}</div>
    </div>`;

  document.getElementById('book-title').textContent  = book.title;
  document.getElementById('book-author').textContent = book.author;
  document.getElementById('book-genre').textContent  = book.genre;
  document.getElementById('book-pages').textContent  = `${book.pages} pages`;
  document.getElementById('book-isbn').textContent   = book.isbn ? `ISBN ${book.isbn}` : '';
  document.getElementById('book-selected').textContent = book.selectedBy ? `🎯 Picked by ${book.selectedBy}` : '';
  document.getElementById('book-desc').textContent   = book.description;

  const statsEl = document.getElementById('book-stats');
  statsEl.innerHTML = `
    ${avg
      ? `${App.starsHTML(Math.round(avg))} <strong>${avg}</strong> avg rating`
      : 'No ratings yet'}
    ${ratings.length ? `<span class="text-muted">·</span> ${ratings.length} rating${ratings.length !== 1 ? 's' : ''}` : ''}
    ${comments.length ? `<span class="text-muted">·</span> ${comments.length} response${comments.length !== 1 ? 's' : ''}` : ''}
    ${recPct !== null ? `<span class="text-muted">·</span> 👍 ${recPct}% recommend` : ''}`;
}

// ── Rating Panel ────────────────────────────────────────────
function renderRatingPanel(book, session) {
  const myRating  = App.getMemberRatingForBook(book.id, session.memberId);
  const allowEdit = App.state.config.allowEditRatings;
  const panel     = document.getElementById('rating-panel');

  panel.innerHTML = `
    <div class="rating-panel__title">
      ${myRating ? `Your rating for <em>${esc(book.title)}</em>` : `Rate <em>${esc(book.title)}</em>`}
    </div>
    <div class="rating-panel__stars-row">
      ${App.starsHTML(myRating ? myRating.stars : 0, { interactive: true, size: 'lg' })}
      <span id="star-label" class="rating-panel__selected-label">
        ${myRating ? App.STAR_LABELS[myRating.stars] : 'Tap a star to rate'}
      </span>
    </div>
    <div class="rating-panel__rec-row">
      <input type="checkbox" id="rec-check" class="rec-checkbox"
        ${myRating && myRating.wouldRecommend ? 'checked' : ''}>
      <label for="rec-check">I would recommend this book to others</label>
    </div>
    <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
      <button id="save-rating-btn" class="btn btn--primary"
        ${myRating && !allowEdit ? 'disabled title="Editing disabled by admin"' : ''}>
        ${myRating ? 'Update Rating' : 'Save Rating'}
      </button>
      ${myRating ? `<span class="text-muted" style="font-size:0.82rem">You rated ${myRating.stars}/5 on ${App.formatDate(myRating.timestamp)}</span>` : ''}
      ${myRating && !allowEdit ? `<span class="badge badge--info">Editing disabled</span>` : ''}
    </div>`;

  // Attach star widget
  const starsContainer = panel.querySelector('.stars--interactive');
  const widget = App.initStarWidget(starsContainer, (val) => {
    document.getElementById('star-label').textContent = App.STAR_LABELS[val];
  });
  if (myRating) widget.setValue(myRating.stars);

  if (myRating && !allowEdit) {
    starsContainer.style.pointerEvents = 'none';
    return;
  }

  document.getElementById('save-rating-btn').addEventListener('click', async () => {
    const stars = widget.getValue();
    if (!stars) { App.showToast('Please select a rating first.', 'warning'); return; }
    const rec = document.getElementById('rec-check').checked;
    const btn = document.getElementById('save-rating-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await App.saveRating({ bookId: book.id, memberId: session.memberId, memberName: session.memberName, stars, wouldRecommend: rec });
      App.showToast(myRating ? 'Rating updated!' : 'Rating saved — thank you!', 'success');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      App.showToast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = myRating ? 'Update Rating' : 'Save Rating';
    }
  });
}

// ── Discussion Prompts ───────────────────────────────────────
function renderPrompts(book) {
  const list = document.getElementById('prompts-list');
  if (!book.discussionPrompts || !book.discussionPrompts.length) {
    list.closest('.section').classList.add('hidden');
    return;
  }
  list.className = 'prompts-list';
  list.innerHTML = book.discussionPrompts
    .map(p => `<li class="prompt-item">${esc(p)}</li>`)
    .join('');
}

// ── Discussion Form ──────────────────────────────────────────
function renderDiscussionForm(book, session) {
  const existing  = App.getMemberCommentForBook(book.id, session.memberId);
  const allowEdit = App.state.config.allowEditComments;
  const section   = document.getElementById('discussion-form-section');

  if (existing && !allowEdit) {
    section.innerHTML = `
      <div class="alert alert--success">
        ✓ You've already shared your thoughts on this book. (Editing is currently disabled by the admin.)
      </div>`;
    return;
  }

  const form = section.querySelector('#discussion-form');
  if (!form) return;

  if (existing) {
    // Pre-fill with existing values
    setValue('field-liked',        existing.liked);
    setValue('field-disliked',     existing.disliked);
    setValue('field-char',         existing.favoriteCharacter);
    setValue('field-quote',        existing.favoriteQuote);
    setValue('field-thoughts',     existing.discussionThoughts);
    setValue('field-wouldrecommend', existing.wouldRecommend ? 'yes' : 'no');
    section.querySelector('.discussion-form__sub').textContent =
      'Update your response below — all fields are optional.';
    section.querySelector('#form-submit-btn').textContent = 'Update Response';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const liked         = form.querySelector('#field-liked').value.trim();
    const disliked      = form.querySelector('#field-disliked').value.trim();
    const favChar       = form.querySelector('#field-char').value.trim();
    const favQuote      = form.querySelector('#field-quote').value.trim();
    const thoughts      = form.querySelector('#field-thoughts').value.trim();
    const recVal        = form.querySelector('#field-wouldrecommend').value;
    const wouldRec      = recVal === 'yes' ? true : recVal === 'no' ? false : null;

    if (!liked && !disliked && !thoughts) {
      App.showToast('Please fill in at least one field before submitting.', 'warning');
      return;
    }

    const btn = form.querySelector('#form-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await App.saveComment({
        bookId: book.id,
        memberId: session.memberId,
        memberName: session.memberName,
        liked, disliked,
        favoriteCharacter: favChar,
        favoriteQuote: favQuote,
        discussionThoughts: thoughts,
        wouldRecommend: wouldRec,
      });
      App.showToast(existing ? 'Response updated!' : 'Response shared — thank you!', 'success');
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      App.showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = existing ? 'Update Response' : 'Share Response';
    }
  });
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (!el || val == null) return;
  if (el.tagName === 'SELECT') el.value = val === true ? 'yes' : val === false ? 'no' : '';
  else el.value = val;
}

// ── Member Responses ─────────────────────────────────────────
function renderResponses(book) {
  const comments   = App.getCommentsForBook(book.id);
  const container  = document.getElementById('responses-container');
  const countEl    = document.getElementById('responses-count');

  countEl.textContent = `${comments.length} Member Response${comments.length !== 1 ? 's' : ''}`;

  if (!comments.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">💬</span>
        <p>No responses yet. Be the first to share your thoughts!</p>
      </div>`;
    return;
  }

  container.className = 'responses-grid';
  comments.forEach(comment => {
    const rating = App.getMemberRatingForBook(book.id, comment.memberId);
    container.appendChild(buildFullResponseCard(comment, rating));
  });
}

function buildFullResponseCard(comment, rating) {
  const card = document.createElement('div');
  card.className = 'response-card';

  const recBadge = rating
    ? `<span class="response-card__rec${!rating.wouldRecommend ? ' response-card__rec--no' : ''}">
        ${rating.wouldRecommend ? '👍 Recommends' : '👎 Not for everyone'}
       </span>`
    : '';

  const fields = [
    { label: 'What they liked',    value: comment.liked },
    { label: 'What they disliked', value: comment.disliked },
    { label: 'Favourite character', value: comment.favoriteCharacter },
    { label: 'Discussion thoughts', value: comment.discussionThoughts },
  ].filter(f => f.value);

  card.innerHTML = `
    <div class="response-card__header">
      <div class="response-card__member">
        <div class="member-avatar member-avatar--sm"
          style="background:hsl(${nameHue(comment.memberName)},45%,38%)">
          ${initials(comment.memberName)}
        </div>
        <div>
          <div class="response-card__name">${esc(comment.memberName)}</div>
          <div class="response-card__date">${App.formatDate(comment.timestamp)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem">
        ${rating ? App.starsHTML(rating.stars, { size: 'sm' }) : ''}
        ${recBadge}
      </div>
    </div>
    ${fields.map(f => `
      <div class="response-card__field">
        <div class="response-card__field-label">${esc(f.label)}</div>
        ${esc(f.value)}
      </div>`).join('')}
    ${comment.favoriteQuote ? `<div class="response-card__quote">${esc(comment.favoriteQuote)}</div>` : ''}
    ${comment.updatedAt ? `<div class="response-card__date" style="margin-top:0.25rem">Updated ${App.formatDateShort(comment.updatedAt)}</div>` : ''}`;

  return card;
}

// ── Spoiler Section ──────────────────────────────────────────
function renderSpoilerSection(book, session) {
  if (!book.spoilerPrompts || !book.spoilerPrompts.length) {
    document.getElementById('spoiler-wrap').classList.add('hidden');
    return;
  }

  // Prompts
  const promptsList = document.getElementById('spoiler-prompts');
  promptsList.innerHTML = book.spoilerPrompts
    .map(p => `<li class="prompt-item">${esc(p)}</li>`)
    .join('');

  // Toggle
  const toggle = document.getElementById('spoiler-toggle');
  const body   = document.getElementById('spoiler-body');
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    if (open) renderSpoilerResponses(book, session);
  });

  // Form
  const existingComment = App.getMemberCommentForBook(book.id, session.memberId);
  const spoilerInput    = document.getElementById('spoiler-input');
  if (existingComment && existingComment.spoilerThoughts) {
    spoilerInput.value = existingComment.spoilerThoughts;
  }

  document.getElementById('spoiler-save-btn').addEventListener('click', async () => {
    const text = spoilerInput.value.trim();
    if (!text) { App.showToast('Write something first.', 'warning'); return; }

    const saveBtn = document.getElementById('spoiler-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const existing = App.getMemberCommentForBook(book.id, session.memberId);
    try {
      if (existing) {
        await App.saveComment({ ...existing, spoilerThoughts: text });
      } else {
        await App.saveComment({
          bookId: book.id, memberId: session.memberId, memberName: session.memberName,
          liked: '', disliked: '', favoriteCharacter: '', favoriteQuote: '',
          discussionThoughts: '', wouldRecommend: null, spoilerThoughts: text,
        });
      }
      App.showToast('Spoiler thoughts saved!', 'success');
      renderSpoilerResponses(book, session);
    } catch (e) {
      App.showToast(e.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Spoiler Thoughts';
    }
  });
}

function renderSpoilerResponses(book, session) {
  const container = document.getElementById('spoiler-responses');
  container.innerHTML = '';
  const comments = App.getCommentsForBook(book.id).filter(c => c.spoilerThoughts);

  if (!comments.length) {
    container.innerHTML = '<p style="color:rgba(232,213,176,0.6);font-size:0.85rem">No spoiler thoughts shared yet.</p>';
    return;
  }

  comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'spoiler-response';
    div.innerHTML = `
      <div class="spoiler-response__meta">${esc(c.memberName)} · ${App.formatDateShort(c.timestamp)}</div>
      ${esc(c.spoilerThoughts)}`;
    container.appendChild(div);
  });
}

// ── Sign-out ─────────────────────────────────────────────────
function signOut() {
  App.clearSession();
  window.location.href = 'index.html';
}

// ── Helpers ───────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function nameHue(name) {
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}
