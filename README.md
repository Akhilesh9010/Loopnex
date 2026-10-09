# Loopnex

Loopnex is a local frontend and API for an industrial-material marketplace.

## Run locally

Requirements: Node.js 20.19 or newer, npm, and Python 3. MongoDB is optional for local development.

1. Open a terminal in `backend` and install packages once:

   ```powershell
   npm install
   ```

2. Copy `backend/.env.example` to `backend/.env` and replace `JWT_SECRET` with a private random value of at least 32 characters. Never commit or share `.env`.
3. In the `backend` folder, start the API:

   ```powershell
   npm start
   ```

   The API is at `http://127.0.0.1:5000`; its health check is `http://127.0.0.1:5000/api/health`.
4. In a second terminal, open the project folder and serve the frontend:

   ```powershell
   py -m http.server 5500
   ```

5. Open `http://localhost:5500` in a browser.

By default, the backend uses a private JSON data file at `backend/data/loopnex.local.json` when no MongoDB URI is configured or Atlas cannot be reached. This keeps registration, listings, requests, and feedback working on one computer. Local fallback data is separate from Atlas and is not synced to other computers.

## Deploy the full app

The Render blueprint in `render.yaml` deploys the Node API and serves the frontend from the same HTTPS origin. This avoids pointing a hosted browser at a visitor's own `localhost` and keeps API requests on the deployed host. For a quick hackathon demo, the blueprint enables the app's JSON fallback so registration, listings, requests, and feedback can be exercised without a database account. Render generates `JWT_SECRET` and provides the public HTTPS URL after deployment.

The demo fallback is not durable cloud storage: data can disappear when the free service restarts, and it is not suitable for real users. For persistent shared data, add a MongoDB Atlas database, configure `MONGODB_URI` as a private Render environment variable, and switch `LOCAL_DATA_FALLBACK` to `false`. The `/api/health` endpoint reports which storage mode is active.

The current `backend/.env` is local-only and is excluded from Git. Do not put credentials in the repository. This demo uses temporary local storage unless a reachable MongoDB Atlas URI is configured.

## MongoDB Atlas and another laptop

To use shared storage, add `MONGODB_URI` to `.env` and set `LOCAL_DATA_FALLBACK=false` if the API must stop rather than switch to local-only data. Each computer running the backend connects to MongoDB from its own network. In Atlas, allow the backend computer's public IP in **Network Access**, and use a database user with access to the project database. URL-encode special characters in the URI username or password.

`localhost` always refers to the computer using the browser. For a friend to run this project locally, the friend needs both the frontend and API running on their laptop. The local JSON fallback works without Atlas, but each laptop gets separate data. In production, the frontend automatically uses `/api` on the same deployed origin; for a separately hosted frontend, configure `window.LOOPNEX_API_BASE` to the deployed API URL.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings` (search with `search`, filter with `category`), `GET /api/listings/:id`
- Authenticated generators: `POST /api/listings`, `PATCH /api/listings/:id`, `DELETE /api/listings/:id`
- Authenticated buyers: `POST /api/listings/:id/interest`
- Authenticated users: `GET /api/dashboard`, `GET /api/transactions`, `PATCH /api/transactions/:id/status`
- Public feedback form: `POST /api/feedback` (saved to the configured storage; limited to five submissions per IP every 15 minutes in this MVP)

Requests that require an account use `Authorization: Bearer <token>`. Registration roles are `generator`, `buyer`, and `logistics`; only buyers can request material, and only generators can publish listings.
