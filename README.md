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

The Render blueprint in `render.yaml` deploys the Node API and serves the frontend from the same HTTPS origin. This avoids pointing a hosted browser at a visitor's own `localhost` and keeps API requests on the deployed host. To deploy, create a Render Blueprint from this repository, then set the generated `MONGODB_URI` secret to a MongoDB Atlas connection string for a production database. Keep `LOCAL_DATA_FALLBACK=false` so the app never reports success while saving production data only to temporary local storage. Render generates `JWT_SECRET` and provides the public HTTPS URL after deployment; its `/api/health` endpoint confirms whether MongoDB connected.

The current `backend/.env` is local-only and is excluded from Git. Do not put credentials in the repository. The deployed app requires a reachable MongoDB Atlas cluster and database user; local machine allowlists may need to be updated to permit the hosting service's connections. Use a dedicated database user and restrict Atlas network access according to the chosen host's current networking guidance.

## MongoDB Atlas and another laptop

To use shared storage, add `MONGODB_URI` to `.env` and set `LOCAL_DATA_FALLBACK=false` if the API must stop rather than switch to local-only data. Each computer running the backend connects to MongoDB from its own network. In Atlas, allow the backend computer's public IP in **Network Access**, and use a database user with access to the project database. URL-encode special characters in the URI username or password.

`localhost` always refers to the computer using the browser. For a friend to run this project locally, the friend needs both the frontend and API running on their laptop. The local JSON fallback works without Atlas, but each laptop gets separate data. In production, the frontend automatically uses `/api` on the same deployed origin; for a separately hosted frontend, configure `window.LOOPNEX_API_BASE` to the deployed API URL.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings` (search with `search`, filter with `category`), `GET /api/listings/:id`
- Authenticated generators: `POST /api/listings`, `PATCH /api/listings/:id`, `DELETE /api/listings/:id`
- Authenticated buyers: `POST /api/listings/:id/interest`
- Authenticated users: `GET /api/dashboard`, `GET /api/transactions`, `PATCH /api/transactions/:id/status`
- Public feedback form: `POST /api/feedback` (stored privately in MongoDB; limited to five submissions per IP every 15 minutes in this local MVP)

Requests that require an account use `Authorization: Bearer <token>`. Registration roles are `generator`, `buyer`, and `logistics`; only buyers can request material, and only generators can publish listings.
