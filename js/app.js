/**
 * app.js — Shared Book Club Application Logic
 * Handles: data loading, session management, ratings, comments, utilities.
 * All writes go to localStorage. JSON files are the seed / exported data source.
 */

const App = (() => {
  // ── Firestore instance (set in init if Firebase is configured) ──
  let db = null;

  // ── Storage Keys ────────────────────────────────────────
  const KEYS = {
    session:  'bookclub_session',
    members:  'bookclub_members',
    ratings:  'bookclub_ratings',
    comments: 'bookclub_comments',
    access:   'bookclub_access_granted',
    upcoming: 'bookclub_upcoming',
  };

  // ── State ────────────────────────────────────────────────
  const state = {
    config:          null,
    sessions:        [],   // month sessions from books.json
    members:         [],
    ratings:         [],
    comments:        [],
    upcomingSession: null, // next month's book (admin-set)
    ready:           false,
  };

  // ── Data Loading ─────────────────────────────────────────
  async function fetchJSON(path) {
    // Cache-bust with timestamp to avoid stale GitHub Pages cache
    const res = await fetch(path + '?_=' + Math.floor(Date.now() / 60000));
    if (!res.ok) throw new Error(`Cannot load ${path} (${res.status})`);
    return res.json();
  }

  async function init() {
    try {
      const [config, booksData, seedMembers, seedRatings, seedComments] = await Promise.all([
        fetchJSON('data/config.json'),
        fetchJSON('data/books.json'),
        fetchJSON('data/members.json'),
        fetchJSON('data/ratings.json'),
        fetchJSON('data/comments.json'),
      ]);

      state.config   = config;
      state.sessions = booksData.sessions || [];

      // ── Try to initialise Firestore ──────────────────────
      try {
        if (typeof FIREBASE_CONFIG !== 'undefined' &&
            !FIREBASE_CONFIG.projectId.startsWith('REPLACE')) {
          if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
          db = firebase.firestore();
        }
      } catch (e) {
        console.warn('[App] Firebase unavailable, using localStorage:', e.message);
      }

      if (db) {
        // ── Load from Firestore ────────────────────────────
        const [membersSnap, ratingsSnap, commentsSnap, upcomingSnap] = await Promise.all([
          db.collection('members').get(),
          db.collection('ratings').get(),
          db.collection('comments').get(),
          db.collection('upcoming').doc('current').get(),
        ]);

        state.members  = membersSnap.docs.map(d => d.data());
        state.ratings  = ratingsSnap.docs.map(d => d.data());
        state.comments = commentsSnap.docs.map(d => d.data());
        state.upcomingSession = upcomingSnap.exists ? upcomingSnap.data() : null;

        // Auto-seed Firestore on first run (collections empty → import JSON)
        if (state.members.length === 0 && seedMembers.members.length > 0) {
          await _seedCollection('members', seedMembers.members);
          state.members = seedMembers.members;
        }
        if (state.ratings.length === 0 && seedRatings.ratings.length > 0) {
          await _seedCollection('ratings', seedRatings.ratings);
          state.ratings = seedRatings.ratings;
        }
        if (state.comments.length === 0 && seedComments.comments.length > 0) {
          await _seedCollection('comments', seedComments.comments);
          state.comments = seedComments.comments;
        }
      } else {
        // ── Fallback: merge seed JSON with localStorage ────
        state.members  = mergeById(seedMembers.members  || [], localGet(KEYS.members));
        state.ratings  = mergeById(seedRatings.ratings  || [], localGet(KEYS.ratings));
        state.comments = mergeById(seedComments.comments || [], localGet(KEYS.comments));

        const localUpcoming = (() => {
          try { return JSON.parse(localStorage.getItem(KEYS.upcoming)); } catch { return null; }
        })();
        state.upcomingSession = localUpcoming
          || state.sessions.find(s => s.isUpcoming && !s.isCurrent)
          || null;
      }

      state.ready = true;
    } catch (err) {
      console.error('[App] init error:', err);
      throw err;
    }
  }

  // Batch-write an array of docs into a Firestore collection
  async function _seedCollection(collectionName, docs) {
    const batch = db.batch();
    docs.forEach(doc => batch.set(db.collection(collectionName).doc(doc.id), doc));
    await batch.commit();
  }

  function mergeById(seed, local) {
    const map = new Map(seed.map(item => [item.id, item]));
    local.forEach(item => map.set(item.id, item));
    return Array.from(map.values());
  }

  // ── LocalStorage Helpers ──────────────────────────────────
  function localGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }

  function localSet(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ── Session (who is logged in) ────────────────────────────
  function getSession() {
    try {
      const raw = sessionStorage.getItem(KEYS.session);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setSession(data) {
    sessionStorage.setItem(KEYS.session, JSON.stringify(data));
  }

  function clearSession() {
    sessionStorage.removeItem(KEYS.session);
  }

  /** Drop the member session and return to the registration page. */
  function switchMember() {
    clearSession();
    window.location.href = 'register.html';
  }

  // ── Auth Guards ───────────────────────────────────────────
  /**
   * Verify both access-code grant AND member session.
   * Call this at the top of every protected page.
   */
  function checkAuth(redirect = true) {
    const granted = localStorage.getItem(KEYS.access) === 'true';
    if (!granted) {
      if (redirect) window.location.href = 'index.html';
      return false;
    }
    const session = getSession();
    if (!session || !session.memberId) {
      if (redirect) window.location.href = 'register.html';
      return false;
    }
    return true;
  }

  /** Just verify the access code gate (used on register page). */
  function checkAccessOnly(redirect = true) {
    const granted = localStorage.getItem(KEYS.access) === 'true';
    if (!granted && redirect) window.location.href = 'index.html';
    return granted;
  }

  // ── Access Code Verification ──────────────────────────────
  async function verifyAccessCode(input) {
    if (!state.config) return false;
    const stored = (state.config.accessCode || '').trim();
    const normalized = input.trim().toUpperCase();

    if (stored.startsWith('hash:')) {
      // SHA-256 mode: hash of input must match stored hash
      const hash = await sha256(normalized);
      return hash === stored.slice(5);
    }
    return normalized === stored.toUpperCase();
  }

  async function sha256(message) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Member Management ─────────────────────────────────────
  function getAllMembers() {
    return state.members;
  }

  function findMemberByName(name) {
    const n = name.trim().toLowerCase();
    return state.members.find(m => m.name.trim().toLowerCase() === n) || null;
  }

  function findMemberById(id) {
    return state.members.find(m => m.id === id) || null;
  }

  /**
   * Register a new member (local-only; admin must export and commit to make permanent).
   * Returns the member object (existing or new).
   */
  async function registerMember(name) {
    const trimmed = name.trim();
    const existing = findMemberByName(trimmed);
    if (existing) return existing;

    const member = {
      id:       generateId('member'),
      name:     trimmed,
      joinedAt: new Date().toISOString(),
      isAdmin:  false,
    };

    state.members.push(member);
    if (db) {
      await db.collection('members').doc(member.id).set(member);
    } else {
      const local = localGet(KEYS.members);
      local.push(member);
      localSet(KEYS.members, local);
    }
    return member;
  }

  // ── Books & Sessions ──────────────────────────────────────
  function getCurrentSession() {
    return state.sessions.find(s => s.isCurrent) || null;
  }

  function getPastSessions() {
    return state.sessions.filter(s => !s.isCurrent && !s.isUpcoming).reverse();
  }

  function getUpcomingSession() {
    return state.upcomingSession;
  }

  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];

  async function saveUpcomingBook({ month, year, title, author, genre, pages, isbn,
                               selectedBy, selectedById, description, prompts, coverColor }) {
    const monthStr = String(month).padStart(2, '0');
    const session = {
      id:         `${year}-${monthStr}`,
      label:      `${MONTH_NAMES[month]} ${year}`,
      isCurrent:  false,
      isUpcoming: true,
      books: [{
        id:              generateId('book'),
        title:           title.trim(),
        author:          author.trim(),
        genre:           (genre || '').trim(),
        pages:           parseInt(pages) || 0,
        isbn:            (isbn || '').trim(),
        coverColor:      coverColor || '#2C3E50',
        coverTextColor:  '#FFFFFF',
        selectedBy:      (selectedBy || '').trim(),
        selectedById:    (selectedById || '').trim(),
        description:     (description || '').trim(),
        discussionPrompts: prompts
          ? prompts.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
        spoilerPrompts:  [],
      }]
    };
    if (db) {
      await db.collection('upcoming').doc('current').set(session);
    } else {
      localStorage.setItem(KEYS.upcoming, JSON.stringify(session));
    }
    state.upcomingSession = session;
  }

  async function clearUpcomingBook() {
    state.upcomingSession = null;
    if (db) {
      await db.collection('upcoming').doc('current').delete();
    } else {
      localStorage.removeItem(KEYS.upcoming);
    }
  }

  function exportBooksJson() {
    // Build a complete books.json with all sessions + upcoming
    const allSessions = state.sessions
      .filter(s => !s.isUpcoming)         // strip any old upcoming flags
      .map(s => ({ ...s, isUpcoming: undefined }));  // clean flag

    if (state.upcomingSession) {
      // Replace if same id already in list (e.g. admin re-editing), else append
      const idx = allSessions.findIndex(s => s.id === state.upcomingSession.id);
      if (idx >= 0) allSessions[idx] = state.upcomingSession;
      else allSessions.push(state.upcomingSession);
    }

    const blob = new Blob([JSON.stringify({ sessions: allSessions }, null, 2)],
                          { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: 'books.json',
    }).click();
    URL.revokeObjectURL(url);
  }

  function getBookById(bookId) {
    for (const session of state.sessions) {
      const book = session.books.find(b => b.id === bookId);
      if (book) return { book, session };
    }
    return null;
  }

  // ── Ratings ───────────────────────────────────────────────
  function getRatingsForBook(bookId) {
    return state.ratings.filter(r => r.bookId === bookId);
  }

  function getMemberRatingForBook(bookId, memberId) {
    return state.ratings.find(r => r.bookId === bookId && r.memberId === memberId) || null;
  }

  function averageRating(bookId) {
    const list = getRatingsForBook(bookId);
    if (!list.length) return null;
    return (list.reduce((sum, r) => sum + r.stars, 0) / list.length).toFixed(1);
  }

  function recommendPercent(bookId) {
    const list = getRatingsForBook(bookId);
    if (!list.length) return null;
    const yes = list.filter(r => r.wouldRecommend).length;
    return Math.round((yes / list.length) * 100);
  }

  /**
   * Save or update a rating. Throws if editing is disabled and rating already exists.
   */
  async function saveRating(data) {
    const existing = getMemberRatingForBook(data.bookId, data.memberId);

    if (existing) {
      if (!state.config.allowEditRatings) {
        throw new Error('You have already rated this book. Editing ratings is disabled by the admin.');
      }
      Object.assign(existing, data, { updatedAt: new Date().toISOString() });
      if (db) {
        await db.collection('ratings').doc(existing.id).set(existing);
      } else {
        _persistLocalUpdate(KEYS.ratings, existing);
      }
    } else {
      const rating = { id: generateId('rating'), timestamp: new Date().toISOString(), ...data };
      state.ratings.push(rating);
      if (db) {
        await db.collection('ratings').doc(rating.id).set(rating);
      } else {
        const local = localGet(KEYS.ratings);
        local.push(rating);
        localSet(KEYS.ratings, local);
      }
    }
  }

  // ── Comments ──────────────────────────────────────────────
  function getCommentsForBook(bookId) {
    return state.comments
      .filter(c => c.bookId === bookId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function getMemberCommentForBook(bookId, memberId) {
    return state.comments.find(c => c.bookId === bookId && c.memberId === memberId) || null;
  }

  async function saveComment(data) {
    const existing = getMemberCommentForBook(data.bookId, data.memberId);

    if (existing) {
      if (!state.config.allowEditComments) {
        throw new Error('You have already shared thoughts on this book. Editing is disabled by the admin.');
      }
      Object.assign(existing, data, { updatedAt: new Date().toISOString() });
      if (db) {
        await db.collection('comments').doc(existing.id).set(existing);
      } else {
        _persistLocalUpdate(KEYS.comments, existing);
      }
    } else {
      const comment = { id: generateId('comment'), timestamp: new Date().toISOString(), ...data };
      state.comments.push(comment);
      if (db) {
        await db.collection('comments').doc(comment.id).set(comment);
      } else {
        const local = localGet(KEYS.comments);
        local.push(comment);
        localSet(KEYS.comments, local);
      }
    }
  }

  function _persistLocalUpdate(key, item) {
    const local = localGet(key);
    const idx = local.findIndex(x => x.id === item.id);
    if (idx >= 0) local[idx] = item; else local.push(item);
    localSet(key, local);
  }

  // ── Admin: Export Data ────────────────────────────────────
  function exportLocalData() {
    const payload = {
      _exportedAt: new Date().toISOString(),
      _instructions: 'Merge each array into the matching data/*.json file, commit, and push to GitHub.',
      members:  localGet(KEYS.members),
      ratings:  localGet(KEYS.ratings),
      comments: localGet(KEYS.comments),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `bookclub-export-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearLocalData() {
    localStorage.removeItem(KEYS.members);
    localStorage.removeItem(KEYS.ratings);
    localStorage.removeItem(KEYS.comments);
  }

  // ── Utilities ─────────────────────────────────────────────
  function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const STAR_LABELS = ['', 'Didn\'t enjoy it', 'It was okay', 'Liked it', 'Really liked it', 'Loved it'];

  function starsHTML(count, { max = 5, interactive = false, bookId = '', size = '' } = {}) {
    const cls = ['stars', interactive && 'stars--interactive', size && `stars--${size}`]
      .filter(Boolean).join(' ');
    const attr = interactive ? ` data-book="${bookId}"` : '';
    let html = `<span class="${cls}"${attr} aria-label="${count} out of ${max} stars">`;
    for (let i = 1; i <= max; i++) {
      const filled = i <= count ? ' star--filled' : '';
      if (interactive) {
        // Use <button> for interactive stars — guaranteed to work on iOS Safari.
        // Plain <span> elements are not reliably tappable in mobile Safari.
        html += `<button type="button" class="star${filled}" data-value="${i}" aria-label="${i} star">★</button>`;
      } else {
        html += `<span class="star${filled}" data-value="${i}">★</span>`;
      }
    }
    return html + '</span>';
  }

  /**
   * Attach interactive star-rating behaviour to a .stars--interactive container.
   * Returns { getValue, setValue }.
   */
  function initStarWidget(container, onChange) {
    const stars = Array.from(container.querySelectorAll('.star'));
    let current = 0;

    function selectValue(v) {
      current = v;
      _paintStars(stars, current);
      if (onChange) onChange(current);
    }

    stars.forEach(star => {
      star.addEventListener('mouseenter', () => {
        const v = parseInt(star.dataset.value);
        stars.forEach((s, i) => s.classList.toggle('star--hover', i < v));
      });

      // touchstart gives instant feedback on mobile without waiting for click
      star.addEventListener('touchstart', (e) => {
        e.preventDefault(); // prevents ghost mouse events firing after touch
        const v = parseInt(star.dataset.value);
        selectValue(v);
      }, { passive: false });

      star.addEventListener('click', () => {
        const v = parseInt(star.dataset.value);
        selectValue(v);
      });
    });

    container.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('star--hover'));
    });

    function _paintStars(list, val) {
      list.forEach((s, i) => {
        s.classList.toggle('star--filled', i < val);
        s.classList.remove('star--hover');
      });
    }

    return {
      getValue: () => current,
      setValue: (val) => { current = val; _paintStars(stars, val); },
    };
  }

  /** Show a transient toast notification. */
  function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = Object.assign(document.createElement('div'), { id: 'toast-container' });
      document.body.appendChild(container);
    }
    const toast = Object.assign(document.createElement('div'), {
      className: `toast toast--${type}`,
      textContent: message,
    });
    container.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast--visible'));
    });
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /** Create an avatar element with the member's initials. */
  function avatarEl(name, size = '') {
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const div = document.createElement('div');
    div.className = `member-avatar${size ? ` member-avatar--${size}` : ''}`;
    div.textContent = initials;
    // Deterministic colour from name
    const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    div.style.background = `hsl(${hue}, 45%, 38%)`;
    return div;
  }

  // ── Public API ────────────────────────────────────────────
  return {
    init,
    get state()  { return state; },
    KEYS,

    // Session
    getSession, setSession, clearSession, switchMember,
    checkAuth, checkAccessOnly,

    // Access code
    verifyAccessCode,

    // Members
    getAllMembers, findMemberByName, findMemberById, registerMember,

    // Books
    getCurrentSession, getPastSessions, getBookById,
    getUpcomingSession, saveUpcomingBook, clearUpcomingBook, exportBooksJson, MONTH_NAMES,

    // Ratings
    getRatingsForBook, getMemberRatingForBook, averageRating, recommendPercent, saveRating,

    // Comments
    getCommentsForBook, getMemberCommentForBook, saveComment,

    // Admin
    exportLocalData, clearLocalData,

    // Utilities
    generateId, formatDate, formatDateShort, starsHTML, initStarWidget, showToast, avatarEl,
    STAR_LABELS,
  };
})();
