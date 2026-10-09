const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "loopnex.local.json");
let localMode = false;
let writeQueue = Promise.resolve();

function emptyDatabase() {
  return { users: [], listings: [], transactions: [], feedback: [] };
}

async function readDatabase() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    const defaults = emptyDatabase();
    return { ...defaults, ...parsed };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(dataDir, { recursive: true });
    await writeDatabase(emptyDatabase());
    return emptyDatabase();
  }
}

async function writeDatabase(data) {
  await fs.mkdir(dataDir, { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporaryFile, dataFile);
}

function query(read) {
  return writeQueue.then(async () => read(await readDatabase()));
}

function mutate(change) {
  const operation = writeQueue.then(async () => {
    const data = await readDatabase();
    const result = await change(data);
    await writeDatabase(data);
    return result;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

function id() {
  return randomUUID();
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function listingWithOwner(data, listing) {
  if (!listing) return null;
  const owner = data.users.find((user) => user._id === listing.owner);
  return { ...listing, owner: owner ? { _id: owner._id, name: owner.name, company: owner.company, role: owner.role } : null };
}

function transactionWithParties(data, transaction) {
  if (!transaction) return null;
  return {
    ...transaction,
    listing: data.listings.find((listing) => listing._id === transaction.listing) || null,
    buyer: publicUser(data.users.find((user) => user._id === transaction.buyer)),
    seller: publicUser(data.users.find((user) => user._id === transaction.seller))
  };
}

function setLocalMode(enabled) {
  localMode = Boolean(enabled);
}

function isLocalMode() {
  return localMode;
}

function getDataFile() {
  return dataFile;
}

async function findUserByEmail(email) {
  return query((data) => data.users.find((user) => user.email === email) || null);
}

async function findUserById(userId) {
  return query((data) => publicUser(data.users.find((user) => user._id === String(userId)) || null));
}

async function createUser(fields) {
  return mutate((data) => {
    if (data.users.some((user) => user.email === fields.email)) {
      const error = new Error("Duplicate email");
      error.code = 11000;
      throw error;
    }
    const user = { _id: id(), ...fields, createdAt: new Date().toISOString() };
    data.users.push(user);
    return user;
  });
}

async function findListings({ category, search, page, limit }) {
  return query((data) => {
    const term = search.trim().toLowerCase();
    const filtered = data.listings
      .filter((listing) => listing.status === "active")
      .filter((listing) => !category || listing.category === category)
      .filter((listing) => !term || [listing.title, listing.material, listing.description, listing.location, listing.category]
        .some((value) => String(value || "").toLowerCase().includes(term)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * limit;
    return { listings: filtered.slice(start, start + limit).map((listing) => listingWithOwner(data, listing)), total: filtered.length };
  });
}

async function findListingById(listingId) {
  return query((data) => listingWithOwner(data, data.listings.find((listing) => listing._id === String(listingId)) || null));
}

async function createListing(fields, ownerId) {
  return mutate((data) => {
    const listing = {
      _id: id(), ...fields, owner: String(ownerId), status: "active",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.listings.push(listing);
    return listingWithOwner(data, listing);
  });
}

async function updateListing(listingId, ownerId, fields, status) {
  return mutate((data) => {
    const listing = data.listings.find((item) => item._id === String(listingId) && item.owner === String(ownerId) && item.status === "active");
    if (!listing) return null;
    Object.assign(listing, fields, { updatedAt: new Date().toISOString() });
    if (status) listing.status = status;
    return listingWithOwner(data, listing);
  });
}

async function createTransaction({ listingId, buyerId, quantity, message }) {
  return mutate((data) => {
    if (data.transactions.some((item) => item.listing === String(listingId) && item.buyer === String(buyerId))) {
      const error = new Error("Duplicate request");
      error.code = 11000;
      throw error;
    }
    const listing = data.listings.find((item) => item._id === String(listingId) && item.status === "active");
    if (!listing) return null;
    const transaction = {
      _id: id(), listing: listing._id, buyer: String(buyerId), seller: listing.owner,
      quantity, message, status: "requested", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.transactions.push(transaction);
    return transactionWithParties(data, transaction);
  });
}

async function getTransaction(transactionId) {
  return query((data) => data.transactions.find((item) => item._id === String(transactionId)) || null);
}

async function findTransactionsForUser(userId) {
  return query((data) => data.transactions
    .filter((item) => item.buyer === String(userId) || item.seller === String(userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => transactionWithParties(data, item)));
}

async function setTransactionStatus(transactionId, status) {
  return mutate((data) => {
    const transaction = data.transactions.find((item) => item._id === String(transactionId));
    if (!transaction) return null;
    transaction.status = status;
    transaction.updatedAt = new Date().toISOString();
    return transactionWithParties(data, transaction);
  });
}

async function getDashboardCounts(userId, role) {
  return query((data) => ({
    activeListings: data.listings.filter((item) => item.owner === String(userId) && item.status === "active").length,
    matches: role === "buyer" ? data.listings.filter((item) => item.owner !== String(userId) && item.status === "active").length : 0,
    transactions: data.transactions.filter((item) => item.buyer === String(userId) || item.seller === String(userId)).length
  }));
}

async function createFeedback(fields) {
  return mutate((data) => {
    const feedback = { _id: id(), ...fields, status: "new", createdAt: new Date().toISOString() };
    data.feedback.push(feedback);
    return feedback;
  });
}

module.exports = {
  setLocalMode,
  isLocalMode,
  getDataFile,
  findUserByEmail,
  findUserById,
  createUser,
  findListings,
  findListingById,
  createListing,
  updateListing,
  createTransaction,
  getTransaction,
  findTransactionsForUser,
  setTransactionStatus,
  getDashboardCounts,
  createFeedback
};
