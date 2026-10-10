# Loopnex

Loopnex is an industrial-material marketplace MVP. Generators can publish material listings, buyers can search and send requests, and both sides can update a request through completion. A feedback form is included.

> **Live demo:** [https://loopnex-dj2m.onrender.com](https://loopnex-dj2m.onrender.com). The free service may need about a minute to wake after inactivity. For local development, run the frontend and backend with the steps below.

## Run on one laptop

Requirements: Node.js 22 (or Node.js 20.19 or newer), npm, and Python 3. MongoDB is optional for local development.

1. In a terminal, open `backend` and set up the local environment:

   ```powershell
   Copy-Item .env.example .env
   ```

   Replace `JWT_SECRET` in `.env` with a private random value of at least 32 characters. Keep `.env` on your computer; it is excluded from Git.

2. In the `backend` terminal, install and start the API:

   ```powershell
   npm install
   npm start
   ```

   The API should respond at `http://127.0.0.1:5000`; check `http://127.0.0.1:5000/api/health`.

3. In a second terminal, open the project root and serve the frontend:

   ```powershell
   py -m http.server 5500
   ```

4. Open `http://localhost:5500` in a browser. Keep both terminals running while you use the site.

By default, the API saves registrations, listings, requests, and feedback in `backend/data/loopnex.local.json`. This local JSON file is private to that laptop and is not synced to another computer. If MongoDB Atlas is configured and reachable, the API uses it instead.

## Gemini listing assistant

Generator accounts can ask Gemini to improve a material listing's title and description. The backend sends only the title, material, category, and description after the user presses the button; quantity and location are not sent. The prompt asks Gemini to avoid adding unsupported claims, and the generator reviews the suggestion before publishing. Requests require a signed-in generator account and are limited to five per account every 15 minutes.

To enable it, create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey), set `GEMINI_API_KEY` in `backend/.env` for local development and in the Render service's Environment settings for the live demo, then redeploy. The key belongs only in the backend environment; never put it in frontend files or commit it. The backend uses `gemini-3.8-flash` by default; set `GEMINI_MODEL` to override it. Until the key is configured, the rest of the website and backend continue to work and the helper returns a clear setup message.

## Demo from another laptop on the same Wi-Fi

The word `localhost` always means “this device.” If a friend opens `http://localhost:5500`, their browser looks for a site and API on their own laptop.

To share one running demo across laptops on the same trusted Wi-Fi:

1. On the host laptop, set `HOST=0.0.0.0` in `backend/.env` and start the API.
2. Serve the frontend on the network with `py -m http.server 5500 --bind 0.0.0.0`.
3. Allow Node.js and Python through the laptop firewall on the **Private** network if Windows asks.
4. Find the host laptop's local IPv4 address, then open `http://<host-ip>:5500` on the other laptop. The frontend uses that same host on port `5000` for API calls.

Keep the laptops on the same trusted network. The JSON data stays on the host laptop. Do not expose the development API directly to the public internet.

## Current MVP scope

- **Implemented:** account registration and login for generator, buyer, and logistics roles; material listings; keyword/category search; buyer requests; request status changes; feedback form.
- **Not implemented yet:** distance-based or AI-ranked matching, verified-company checks, a dedicated transport-partner workflow, file/photo uploads, password reset, and review/report tools.

The logistics role can register, but it does not yet have transport-service areas, vehicle capacity, shipment assignment, or pickup/delivery status screens. The site does not claim business or certification verification.

## Product decisions

- Search is deterministic keyword and category filtering. It is described as search, not AI matching.
- The impact panel shows the live count of offers that match the current filters. It does not combine unlike units or estimate emissions savings from unverified listings.
- A material request records the agreed listing details and status. It is not proof that a physical shipment was delivered.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings` (supports `search`, `category`, `page`, and `limit`), `GET /api/listings/:id`
- Authenticated generators: `POST /api/listings`, `PATCH /api/listings/:id`, `DELETE /api/listings/:id`
- Authenticated buyers: `POST /api/listings/:id/interest`
- Authenticated users: `GET /api/dashboard`, `GET /api/transactions`, `PATCH /api/transactions/:id/status`
- Public feedback: `POST /api/feedback` (five submissions per IP every 15 minutes per running API process)

Authenticated requests use `Authorization: Bearer <token>`. Only buyers can request listings, and only generators can publish them.

## Shared database for multiple networks

For data shared across different networks, configure MongoDB Atlas in a private `backend/.env` file. Use a database user restricted to this project and allow the backend machine's public IP in Atlas Network Access. Set `LOCAL_DATA_FALLBACK=false` to make startup fail clearly when the database cannot be reached instead of silently using laptop-only data. Never commit the Atlas URI or JWT secret.

## Free hosted demo

The Render Blueprint in `render.yaml` serves the frontend and API from one HTTPS URL. It uses temporary local JSON storage so the demo works without a MongoDB account. Free Render services can sleep after inactivity and erase local data when they restart; warm the link before judging and use demo-only accounts. This setup is for a hackathon demo, not persistent production data.
