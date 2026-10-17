const modal = document.getElementById("modal");
const API_HOST = window.location.hostname || "localhost";
const isLocalDevelopment = API_HOST === "localhost" || API_HOST === "127.0.0.1";
const isLocalFrontendServer = isLocalDevelopment || window.location.port === "5500";
const API_BASE = window.LOOPNEX_API_BASE || (isLocalFrontendServer
  ? `${window.location.protocol === "https:" ? "https" : "http"}://${API_HOST}:5000/api`
  : `${window.location.origin}/api`);

function authHeaders(json = true) {
  const headers = {};
  const token = sessionStorage.getItem("loopnexToken");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...authHeaders(options.body !== undefined), ...options.headers }
    });
  } catch {
    throw new Error(`Could not reach the Loopnex API at ${API_BASE}. Start the backend on port 5000. On a second laptop, open the site with the host laptop's Wi-Fi address instead of localhost.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && path !== "/auth/register") {
      sessionStorage.removeItem("loopnexToken");
      sessionStorage.removeItem("loopnexUser");
    }
    throw new Error(data.message || `Request failed (${response.status}).`);
  }
  return data;
}

function openModal(type) {
  modal.classList.add("open");
  switchForm(type);
}

function closeModal() {
  modal.classList.remove("open");
}

function switchForm(type) {
  document.getElementById("loginForm").hidden = type !== "login";
  document.getElementById("registerForm").hidden = type !== "register";
  document.getElementById("dash").hidden = type !== "dashboard";
}

function setMessage(target, message, isError = false) {
  const element = document.getElementById(target);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#ff9f9f" : "#6dffb2";
}

async function demoRegister() {
  const button = document.querySelector("#registerForm button");
  button.disabled = true;
  try {
    const body = {
      name: document.getElementById("registerName").value.trim(),
      company: document.getElementById("registerCompany").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password: document.getElementById("registerPassword").value,
      role: document.getElementById("registerRole").value
    };
    const result = await api("/auth/register", { method: "POST", body: JSON.stringify(body) });
    setMessage("authMessage", result.message);
    document.getElementById("loginEmail").value = body.email;
    switchForm("login");
  } catch (error) {
    setMessage("authMessage", error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function demoLogin() {
  const button = document.querySelector("#loginForm button");
  button.disabled = true;
  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value
      })
    });
    sessionStorage.setItem("loopnexToken", result.token);
    sessionStorage.setItem("loopnexUser", JSON.stringify(result.user));
    await showDashboard();
  } catch (error) {
    setMessage("authMessage", error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function showDashboard() {
  switchForm("dashboard");
  setMessage("dashboardMessage", "Loading your account…");
  try {
    const [data, transactions] = await Promise.all([api("/dashboard"), api("/transactions")]);
    const dashboard = data.dashboard;
    sessionStorage.setItem("loopnexUser", JSON.stringify(dashboard.user));
    document.querySelector("#dash h2").textContent = `Welcome, ${dashboard.user.name}`;
    document.getElementById("listingCount").textContent = dashboard.activeListings;
    document.getElementById("matchCount").textContent = dashboard.matches;
    document.getElementById("transactionCount").textContent = dashboard.transactions;
    document.getElementById("listingForm").hidden = dashboard.user.role !== "generator";
    renderTransactions(transactions.transactions, dashboard.user.id);
    setMessage("dashboardMessage", `Signed in as ${dashboard.user.role}.`);
  } catch (error) {
    setMessage("dashboardMessage", error.message, true);
  }
}

function renderTransactions(items, userId) {
  const container = document.getElementById("transactionList");
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Requests and transactions";
  container.append(heading);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.textContent = "No requests yet.";
    container.append(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = item.listing?.title || "Listing unavailable";
    const summary = document.createElement("p");
    const otherParty = item.buyer?._id === userId ? item.seller?.company : item.buyer?.company;
    summary.textContent = `${item.quantity} requested · ${item.status} · ${otherParty || "Loopnex member"}`;
    card.append(title, summary);
    if (item.message) {
      const message = document.createElement("p");
      message.textContent = item.message;
      card.append(message);
    }
    const controls = document.createElement("div");
    const isSeller = item.seller?._id === userId;
    const actions = item.status === "requested"
      ? (isSeller ? [["Accept", "accepted"], ["Decline", "rejected"]] : [["Cancel request", "cancelled"]])
      : item.status === "accepted" ? [["Mark complete", "completed"]] : [];
    for (const [label, status] of actions) {
      const button = document.createElement("button");
      button.className = "solid";
      button.textContent = label;
      button.onclick = () => updateTransaction(item._id, status);
      controls.append(button);
    }
    card.append(controls);
    container.append(card);
  }
}

async function updateTransaction(id, status) {
  try {
    await api(`/transactions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await showDashboard();
  } catch (error) {
    setMessage("dashboardMessage", error.message, true);
  }
}

async function improveListingWithGemini() {
  const form = document.getElementById("listingForm");
  const button = document.getElementById("improveListingButton");
  const body = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  setMessage("listingAIStatus", "Asking Gemini to improve the listing copy…");
  try {
    const suggestion = await api("/ai/listing-copy", {
      method: "POST",
      body: JSON.stringify({
        title: body.title,
        material: body.material,
        category: body.category,
        description: body.description
      })
    });
    form.elements.title.value = suggestion.title;
    form.elements.description.value = suggestion.description;
    setMessage("listingAIStatus", suggestion.notice);
  } catch (error) {
    setMessage("listingAIStatus", error.message, true);
  } finally {
    button.disabled = false;
  }
}

function logout() {
  sessionStorage.removeItem("loopnexToken");
  sessionStorage.removeItem("loopnexUser");
  document.querySelector("#dash h2").textContent = "Dashboard";
  switchForm("login");
  setMessage("authMessage", "You have signed out.");
}

let listingsRequestNumber = 0;

async function loadListings() {
  const requestNumber = ++listingsRequestNumber;
  const container = document.getElementById("listings");
  if (!container) return;
  const params = new URLSearchParams();
  const search = document.getElementById("search").value.trim();
  const category = document.getElementById("categoryFilter").value;
  if (search) params.set("search", search);
  if (category && category !== "All Categories") params.set("category", category);
  container.replaceChildren();
  document.getElementById("impactListingCount").textContent = "…";
  const loading = document.createElement("p");
  loading.textContent = "Loading available materials…";
  container.append(loading);
  try {
    const result = await api(`/listings?${params.toString()}`, { headers: {} });
    if (requestNumber !== listingsRequestNumber) return;
    document.getElementById("impactListingCount").textContent = String(result.total);
    container.replaceChildren();
    if (!result.listings.length) {
      const empty = document.createElement("p");
      empty.textContent = "No active listings match that search yet.";
      container.append(empty);
      return;
    }
    for (const listing of result.listings) {
      const card = document.createElement("article");
      card.dataset.name = `${listing.title} ${listing.material} ${listing.category} ${listing.location}`.toLowerCase();
      const categoryLabel = document.createElement("span");
      categoryLabel.textContent = listing.category.toUpperCase();
      const title = document.createElement("h3");
      title.textContent = listing.title;
      const details = document.createElement("p");
      details.textContent = `${listing.material} · ${listing.quantity} ${listing.unit} · ${listing.location}`;
      const owner = document.createElement("p");
      owner.textContent = listing.owner?.company ? `Listed by ${listing.owner.company}` : "Loopnex member";
      const button = document.createElement("button");
      button.textContent = "Request material →";
      button.onclick = () => requestMaterial(listing);
      card.append(categoryLabel, title, details, owner, button);
      container.append(card);
    }
  } catch (error) {
    if (requestNumber !== listingsRequestNumber) return;
    document.getElementById("impactListingCount").textContent = "—";
    container.replaceChildren();
    const message = document.createElement("p");
    message.textContent = error.message;
    container.append(message);
  }
}

async function requestMaterial(listing) {
  const token = sessionStorage.getItem("loopnexToken");
  if (!token) {
    openModal("login");
    setMessage("authMessage", "Sign in as a buyer to request this material.");
    return;
  }
  const user = JSON.parse(sessionStorage.getItem("loopnexUser") || "{}");
  if (user.role !== "buyer") {
    alert(user.role === "generator" ? "Buyer accounts can request material listings." : "Only buyer accounts can request material listings.");
    return;
  }
  const quantityText = window.prompt(`How many ${listing.unit} would you like to request?`, String(listing.quantity));
  if (quantityText === null) return;
  const quantity = Number(quantityText);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > listing.quantity) {
    alert(`Enter a quantity from 0.01 to ${listing.quantity} ${listing.unit}.`);
    return;
  }
  const message = window.prompt("Add a note for the generator (optional):", "") || "";
  try {
    const result = await api(`/listings/${listing._id}/interest`, {
      method: "POST",
      body: JSON.stringify({ quantity, message })
    });
    alert(result.message);
    await loadListings();
  } catch (error) {
    alert(error.message);
  }
}

document.getElementById("listingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api("/listings", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    setMessage("dashboardMessage", result.message);
    await Promise.all([showDashboard(), loadListings()]);
  } catch (error) {
    setMessage("dashboardMessage", error.message, true);
  }
});

document.getElementById("feedbackForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setMessage("feedbackStatus", "Sending feedback…");
  try {
    form.elements.page.value = window.location.pathname;
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await api("/feedback", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    setMessage("feedbackStatus", result.message);
  } catch (error) {
    setMessage("feedbackStatus", error.message, true);
  } finally {
    button.disabled = false;
  }
});

let searchTimer;
document.getElementById("search").addEventListener("input", () => {
  listingsRequestNumber += 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadListings, 250);
});

window.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

loadListings();
