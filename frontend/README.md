# The Unheard Citizen — Frontend prototype

A responsive, dependency-free HTML/CSS/JavaScript prototype for the citizen reporting interface and admin review dashboard.

## Files

- `index.html` — all views: Home, Report Issue, View Complaints, Dashboard, About and Admin.
- `style.css` — responsive blue/navy visual design.
- `script.js` — navigation, filters, demo submissions, sample records and optional API integration.

## Preview without installing packages

1. Extract this ZIP.
2. Open `index.html` in Chrome or Edge.
3. Click Report a Problem, View Complaints, Dashboard and Admin View to inspect the interfaces.
4. In demo mode, sample reports are displayed and submitted reports exist only in the current page session. This prototype does not provide real login/authentication.

The Google Fonts import is optional; without internet, the page falls back to local system fonts. The skyline hero is CSS-drawn, so the main visual does not depend on remote images.

## Backend integration

The project context indicates these FastAPI routes exist:

- `GET http://127.0.0.1:8000/api/complaints`
- `POST http://127.0.0.1:8000/api/complaints`
- `PATCH http://127.0.0.1:8000/api/complaints/{complaint_id}/status`

To attempt API integration, open `script.js` and set `USE_API = true`. Start your backend separately. Confirm the exact request/response field names and status-update request schema in your backend's `/docs` page before relying on integration. If the schema differs, adjust `makePayload()`, `normalizeComplaint()` and the PATCH body.

## Important production notes

- The Admin View button is only a prototype shortcut, not secure authentication.
- Admin permissions must be enforced by the backend.
- Photo selection is not uploaded or stored by this prototype; implement a backend upload endpoint before enabling real evidence storage.
- Demo statistics are illustrative and must not be presented as real civic data.
- AI classifications and duplicate matches should be recommendations reviewed by a person, never automatic rejection decisions.
- Do not commit credentials, private data, or unrelated files.


## Visual design note

The refreshed homepage uses photographic city/issue imagery from Unsplash URLs to more closely match the supplied visual reference. Those photos require an internet connection. The layout and interactions still work offline, but the photographic backgrounds will not load without internet.


## Exact reference homepage mode

The homepage now uses the exact 1600×900 reference image supplied in the conversation, so the first screen visually matches that reference instead of approximating it with CSS. Transparent clickable areas are positioned over the report, complaints, dashboard, about, admin and issue-category controls. The other views remain HTML-based interactive prototype pages.

For the homepage to appear exactly like the reference, keep `assets/reference-home.jpg` in the same relative location as `index.html`. This screenshot-based homepage is a visual match rather than a fully re-created, individually selectable text layout; other pages remain responsive.
