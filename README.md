# 📚 Page Turners Book Club

A static web app for a private book club, designed to run on **GitHub Pages** with zero backend. Members rate books, share discussion thoughts, and read each other's responses — all managed through JSON files and browser localStorage.

---

## Project Structure

```
book-club/
├── index.html          # Access code landing page
├── register.html       # Member selection / registration
├── dashboard.html      # Current month's book(s), ratings, recent responses
├── book.html           # Full book detail, discussion form, spoiler zone
├── archive.html        # Past months archive
│
├── css/
│   └── style.css       # All styles (no external dependencies)
│
├── js/
│   ├── app.js          # Shared logic: data loading, auth, ratings, comments
│   ├── dashboard.js    # Dashboard page logic
│   ├── book.js         # Book detail page logic
│   └── archive.js      # Archive page logic
│
├── data/
│   ├── config.json     # App name, access code, feature flags
│   ├── books.json      # Monthly reading sessions (1 or 2 books per month)
│   ├── members.json    # Pre-registered members (admin-maintained)
│   ├── ratings.json    # Seed ratings (exported from localStorage + committed)
│   └── comments.json   # Seed comments (exported from localStorage + committed)
│
└── README.md
```

---

## GitHub Pages Deployment

### First-time setup

1. **Fork or clone** this repository to your GitHub account.
2. Go to **Settings → Pages** in your GitHub repo.
3. Under *Source*, select **`main` branch** and the **`/ (root)` folder**.
4. Click **Save**. GitHub will assign a URL like `https://yourusername.github.io/book-club/`.
5. Share that URL (and the access code) with club members.

### After every data update

```bash
git add data/
git commit -m "Update book club data for May 2024"
git push origin main
```

GitHub Pages typically deploys within 30–90 seconds.

> **Note:** The app uses relative paths for all fetch calls, so it works equally well
> at `https://yourusername.github.io/book-club/` and `http://localhost:8080/`.

### Local development

Because the app uses `fetch()` to load JSON files, you must serve it via HTTP — **not** by double-clicking `index.html` in a browser (that uses `file://` and blocks fetches).

Quick options:

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code — install the "Live Server" extension, then click "Go Live"
```

Then open `http://localhost:8080` in your browser.

---

## Configuring the App

Edit `data/config.json`:

```jsonc
{
  "appName":          "Page Turners",        // Displayed on landing page
  "appSubtitle":      "Our Monthly Book Club",
  "accessCode":       "BOOKS6",              // Change this! (see Access Code section)
  "allowEditRatings":  true,                 // false = members can't change their rating
  "allowEditComments": true,                 // false = members can't edit their response
  "adminMemberId":    "member-001"           // ID of admin member in members.json
}
```

---

## Managing the Access Code

The access code is the first gate to the app. Anyone who knows it can enter.

### Change the code (plaintext mode)

1. Edit `data/config.json` and change the `"accessCode"` value.
2. Commit and push. The new code takes effect immediately.
3. Tell members to clear their browser's localStorage if they get stuck
   (DevTools → Application → Local Storage → Clear).

### Upgrade to hashed mode (optional — slightly more obscure)

The code will no longer appear in plaintext in your repository:

1. Open your browser console and run:
   ```js
   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOURNEWCODE'))
     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
   ```
2. Copy the hex string and update `config.json`:
   ```json
   { "accessCode": "hash:a3f5c8…<your-hex-hash>" }
   ```
3. Commit and push.

> **Reminder:** This is still client-side security. Anyone with browser DevTools can
> read the hash and brute-force it. See [Limitations](#limitations) below.

---

## Adding Books (Admin Workflow)

### Using Excel as the master source

1. Maintain `books-master.xlsx` locally (not committed — it's your source of truth).
   Suggested columns: `SessionId | Label | IsCurrent | BookId | Title | Author | Genre | Pages | ISBN | CoverColor | CoverTextColor | Description`
2. When a new month starts:
   - Set `IsCurrent = FALSE` on the old session row.
   - Add a new session row with `IsCurrent = TRUE`.
   - Add the book rows for that session.
3. Export the sheet as **CSV**, then convert to JSON (see tip below).
4. Replace `data/books.json` with the new JSON.
5. Commit and push.

**Quick CSV → JSON tip** (browser console or Node):

```js
// Paste this into the browser console with your CSV string:
function csvToBooks(csv) {
  // ... or just edit books.json directly — it's straightforward.
}
```

Or edit `data/books.json` directly — it's a simple format and easier for most admins.

### books.json structure

```jsonc
{
  "sessions": [
    {
      "id": "2024-05",          // Unique ID for the month
      "label": "May 2024",      // Displayed in the UI
      "isCurrent": true,        // ONLY ONE session should be true at a time
      "books": [
        {
          "id": "book-006",
          "title": "Intermezzo",
          "author": "Sally Rooney",
          "genre": "Literary Fiction",
          "pages": 432,
          "isbn": "978-0374610333",
          "coverColor": "#2d4a3e",        // CSS colour for the book cover swatch
          "coverTextColor": "#FFFFFF",
          "description": "Two brothers navigate grief, love, and family…",
          "discussionPrompts": [
            "How does the age gap in each relationship affect its dynamics?",
            "What does the novel say about grief as a shared vs. private experience?"
          ],
          "spoilerPrompts": [
            "Did the ending satisfy you — why or why not?"
          ]
        }
        // Add a second book object here for a two-book month
      ]
    }
  ]
}
```

> **Two-book months:** Just add a second object to the `"books"` array. The dashboard automatically shows both cards side by side.

---

## Managing Members

### members.json structure

```jsonc
{
  "members": [
    {
      "id": "member-001",           // Stable unique ID
      "name": "Sarah Chen",         // Display name — must match exactly what member types
      "joinedAt": "2024-01-05T10:00:00Z",
      "isAdmin": true               // Admins see the export button on the dashboard
    }
  ]
}
```

### Adding members before they self-register

Add them to `members.json` and commit. They'll see their name in the "I'm a member" list immediately.

### Self-registered members

When a new member types a name not in `members.json`, they're registered and stored in **browser localStorage only**. Their data won't appear for other members until you export and commit it.

To make self-registered members permanent:
1. Click **⬇ Export Local Data as JSON** on the dashboard (admin only).
2. Open the downloaded JSON. Copy the `members` array items into `data/members.json`.
3. Commit and push.

---

## Data Export & Merge Workflow

All new ratings and comments entered through the app are stored in each member's **browser localStorage**. They are not automatically visible to other members.

> This is the fundamental constraint of static hosting. See [Limitations](#limitations).

### Recommended workflow

**Option A — Nightly / weekly sync (recommended for active clubs)**

1. At the end of each session or week, the admin opens the dashboard.
2. Clicks **⬇ Export Local Data as JSON**.
3. The downloaded file contains three arrays: `members`, `ratings`, `comments`.
4. Merge each array into the matching `data/*.json` file:
   - Add new items (by `id`) — do not duplicate existing ones.
5. Commit and push. All members now see the merged data on next page load.

**Option B — Shared device**

If all members use the same device (e.g. a shared laptop at the meeting), all data accumulates in one localStorage and only one export is needed.

**Option C — Google Forms / Typeform bridge (advanced)**

Use an external form (Google Forms) that writes to Google Sheets, then export the sheet as JSON and commit. This gives you a proper multi-user data collection layer without a real backend.

---

## Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| `allowEditRatings` | `true` | Members can update their rating |
| `allowEditComments` | `true` | Members can update their discussion response |

Set either to `false` in `config.json` to lock responses after submission.

---

## Limitations

This app runs entirely in the browser. There is **no real backend** and **no server-side security**. Here is what that means in practice:

### What works well
- ✅ Access code gate keeps casual browsers out
- ✅ Member names and session are stored per browser
- ✅ Ratings and comments persist across sessions in the same browser
- ✅ Admin can export and commit data to share it with all members
- ✅ No monthly cost — GitHub Pages is free

### What does NOT work
- ❌ **The access code is not truly secret** — it is stored in `config.json` in your public repository. Anyone who finds the repo URL can read it. The "hash:" mode adds minimal obscurity but is not a real security barrier.
- ❌ **Members can impersonate each other** — there is no password, so anyone who knows a member's name can log in as them.
- ❌ **New ratings and comments are not instantly shared** — they live in the submitting member's browser until the admin exports and commits them.
- ❌ **No real-time updates** — members must refresh to see new responses.
- ❌ **Clearing localStorage loses data** — if a member clears their browser storage, their locally-stored entries disappear (unless previously exported and committed).
- ❌ **Private repos only partially help** — GitHub Pages is public by default. A private repo with GitHub Pages still exposes the site publicly unless you're on GitHub Enterprise.

### Mitigation
- Export and commit data regularly to minimise loss.
- Treat the access code as "obscurity" rather than real security.
- If your club wants real multi-user sync, see [Upgrade Path](#upgrade-path) below.

---

## Upgrade Path

When the static-hosting limitations become a problem, migrate to a real backend:

### Option A — Supabase (recommended)

Supabase provides a Postgres database with a REST API and realtime subscriptions.

1. Create a free Supabase project.
2. Create tables: `members`, `ratings`, `comments` (matching the JSON shapes).
3. Replace the `fetchJSON` calls in `app.js` with Supabase client calls:
   ```js
   import { createClient } from '@supabase/supabase-js'
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
   const { data } = await supabase.from('ratings').select('*').eq('book_id', bookId)
   ```
4. Use Supabase's Row Level Security to lock down who can read/write what.
5. Replace the localStorage write path with `supabase.from('ratings').insert(...)`.

This gives you: real multi-user sync, real-time updates, proper auth.

### Option B — Firebase Firestore

Similar to Supabase. Use Firebase Auth for proper login (email/password or Google Sign-In).

### Option C — A simple Netlify Function or Cloudflare Worker

Write a small serverless function that accepts POST requests and appends to a JSON store in S3 or R2. Keeps the static site concept but adds a write endpoint.

### What to keep

The HTML, CSS, and `app.js` architecture work with any data source. The migration is mostly replacing the `fetchJSON` + `localGet/localSet` calls with API calls.

---

## Customising the App

### Colours and branding

Edit the `:root` variables at the top of `css/style.css`:

```css
:root {
  --clr-primary:  #7B3F00;   /* Main brown — change to match your club's palette */
  --clr-accent:   #C8A84B;   /* Gold highlights */
  --clr-bg:       #FDF8F0;   /* Cream page background */
}
```

### Book cover colours

Each book in `books.json` has a `coverColor` (CSS colour string) and `coverTextColor`. Use any CSS colour:

```json
"coverColor": "#1a3a5c",
"coverTextColor": "#FFFFFF"
```

### Discussion prompts

Add as many as you like to `discussionPrompts` and `spoilerPrompts` in `books.json`.
The spoiler section is hidden by default and requires a click to reveal.

---

## Frequently Asked Questions

**Q: A member can't find their name in the list.**  
A: Either they haven't been added to `members.json`, or they registered under a different spelling. Add them to `members.json` and commit, or have them use the "New member" tab.

**Q: A member's rating isn't visible to others.**  
A: Ratings are stored locally until the admin exports and commits. Do an export and push.

**Q: The app shows old book data.**  
A: GitHub Pages caches aggressively. Hard-refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`) or wait 5 minutes. The app also adds a cache-busting query string to JSON fetches.

**Q: I want to reset the access code.**  
A: Change `accessCode` in `config.json`, commit, push, and tell members. Ask them to clear localStorage if they get "already granted" stuck state (DevTools → Application → Clear storage).

**Q: Can I add more than 2 books in a month?**  
A: The data supports it — just add more objects to the `books` array. The UI grid will reflow automatically. We haven't tested beyond 2, but it should work.

---

## Accessibility Notes

- All interactive elements have keyboard support.
- ARIA labels and roles are used for major regions.
- Star ratings use `aria-label` on the container.
- Colour contrast meets WCAG AA for body text.
- The spoiler section uses `aria-expanded` for screen reader announcements.

---

*Built with plain HTML, CSS, and JavaScript. No build step, no npm, no frameworks.*
