"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require("node:crypto");

const root = __dirname;
const dataDirectory = path.join(root, "data");
const ordersFile = path.join(dataDirectory, "orders.json");
const staffAuthFile = path.join(dataDirectory, "staff-auth.json");
const tokenSequenceFile = path.join(dataDirectory, "token-sequence.json");
const port = Number(process.env.PORT) || 3000;
const sessionCookie = "naariyal_staff_session";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessions = new Map();
const failedLogins = new Map();
const products = {
  "tender-coconut": { name: "Green coconut (small)", price: 55, unit: "Small · 1 piece" },
  "green-coconut-large": { name: "Green coconut (large)", price: 75, unit: "Large · 1 piece" },
  "whole-coconut": { name: "Whole coconut", price: 40, unit: "Medium · 1 piece" },
  "coconut-water": { name: "Coconut water", price: 80, unit: "Pack of 2 · 500 ml" },
  "coconut-oil": { name: "Cold-pressed oil", price: 240, unit: "500 ml bottle" },
  "dry-coconut": { name: "Dried coconut", price: 120, unit: "250 g pack" },
  "coconut-chips": { name: "Toasted coconut chips", price: 95, unit: "150 g pouch" },
  "coconut-milk": { name: "Coconut milk", price: 110, unit: "400 ml carton" }
};
const clients = new Set();

fs.mkdirSync(dataDirectory, { recursive: true });
if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, "[]\n");
let initialPasswordToPrint = "";
let passwordRecord;
if (fs.existsSync(staffAuthFile)) {
  passwordRecord = JSON.parse(fs.readFileSync(staffAuthFile, "utf8"));
  if (process.env.SHOPKEEPER_PASSWORD) {
    if (process.env.SHOPKEEPER_PASSWORD.length < 10 || process.env.SHOPKEEPER_PASSWORD.length > 128) {
      throw new Error("SHOPKEEPER_PASSWORD must be between 10 and 128 characters.");
    }
    savePassword(process.env.SHOPKEEPER_PASSWORD);
  }
} else {
  initialPasswordToPrint = process.env.SHOPKEEPER_PASSWORD || randomBytes(18).toString("base64url");
  if (initialPasswordToPrint.length < 10 || initialPasswordToPrint.length > 128) {
    throw new Error("SHOPKEEPER_PASSWORD must be between 10 and 128 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  passwordRecord = { salt, hash: scryptSync(initialPasswordToPrint, salt, 64).toString("hex") };
  fs.writeFileSync(staffAuthFile, `${JSON.stringify(passwordRecord, null, 2)}\n`);
}

function readOrders() {
  return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
}

function writeOrders(orders) {
  fs.writeFileSync(ordersFile, `${JSON.stringify(orders, null, 2)}\n`);
}

function nextPickupToken(existingOrders, createdAt) {
  const dateKey = createdAt.toISOString().slice(0, 10).replaceAll("-", "");
  const tokenPrefix = `N-${dateKey}-`;
  let savedSequence = { dateKey, sequence: 0 };
  try {
    savedSequence = JSON.parse(fs.readFileSync(tokenSequenceFile, "utf8"));
  } catch {
    savedSequence = { dateKey, sequence: 0 };
  }

  const highestRecordedSequence = existingOrders.reduce((maxSequence, order) => {
    if (!order.token?.startsWith(tokenPrefix)) return maxSequence;
    return Math.max(maxSequence, Number(order.token.slice(tokenPrefix.length)) || 0);
  }, 0);
  const previousSequence = savedSequence.dateKey === dateKey && Number.isInteger(savedSequence.sequence)
    ? savedSequence.sequence
    : 0;
  const sequence = Math.max(previousSequence, highestRecordedSequence) + 1;
  fs.writeFileSync(tokenSequenceFile, `${JSON.stringify({ dateKey, sequence }, null, 2)}\n`);
  return `${tokenPrefix}${String(sequence).padStart(3, "0")}`;
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const cookie = (request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : "";
}

function getStaffSession(request) {
  const sessionId = readCookie(request, sessionCookie);
  const expiresAt = sessions.get(sessionId);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

function requireStaff(request, response) {
  if (getStaffSession(request)) return true;
  sendJson(response, 401, { error: "Shopkeeper login required." });
  return false;
}

function savePassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  passwordRecord = { salt, hash };
  fs.writeFileSync(staffAuthFile, `${JSON.stringify(passwordRecord, null, 2)}\n`);
}

function setStaffSession(response) {
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, Date.now() + sessionLifetimeMs);
  response.setHeader("Set-Cookie", createSessionCookie(sessionId, Math.floor(sessionLifetimeMs / 1000)));
}

function passwordInputMatches(input) {
  const supplied = Buffer.from(typeof input === "string" ? input : "");
  const expected = Buffer.from(passwordRecord.hash, "hex");
  if (!supplied.length) return false;
  const actual = scryptSync(supplied, passwordRecord.salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createSessionCookie(sessionId, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookie}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function broadcast(type, order) {
  const message = `event: orders\ndata: ${JSON.stringify({ type, order })}\n\n`;
  for (const client of clients) client.write(message);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    request.on("error", reject);
  });
}

function buildOrder(input, existingOrders) {
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 30) throw new Error("The cart is empty or invalid.");
  if (!["upi_qr", "pay_at_shop"].includes(input.paymentMethod)) throw new Error("Choose UPI QR or pay at shop.");

  const items = input.items.map((item) => {
    const product = products[item.id];
    const quantity = Number(item.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("An item in the cart is invalid.");
    return { id: item.id, name: product.name, unit: product.unit, unitPrice: product.price, quantity, lineTotal: product.price * quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const createdAt = new Date();

  return {
    id: randomUUID(),
    token: nextPickupToken(existingOrders, createdAt),
    createdAt: createdAt.toISOString(),
    items,
    subtotal,
    delivery: 0,
    total: subtotal,
    paymentMethod: input.paymentMethod,
    paymentStatus: "pending",
    status: "awaiting_payment"
  };
}

function nextStatus(order, requestedStatus) {
  if (requestedStatus === "cancelled" && !["completed", "cancelled"].includes(order.status)) return true;
  const transitions = {
    awaiting_payment: ["paid"],
    paid: ["preparing"],
    preparing: ["ready"],
    ready: ["completed"]
  };
  return transitions[order.status]?.includes(requestedStatus) || false;
}

function contentType(filePath) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/staff/login" && request.method === "POST") {
    const remoteAddress = request.socket.remoteAddress || "unknown";
    const attempts = failedLogins.get(remoteAddress) || { count: 0, blockedUntil: 0 };
    if (attempts.blockedUntil > Date.now()) return sendJson(response, 429, { error: "Too many attempts. Try again in one minute." });

    const input = await readBody(request);
    if (!passwordInputMatches(input.password)) {
      attempts.count += 1;
      if (attempts.count >= 5) {
        attempts.count = 0;
        attempts.blockedUntil = Date.now() + 60_000;
      }
      failedLogins.set(remoteAddress, attempts);
      return sendJson(response, 401, { error: "That password did not match." });
    }

    failedLogins.delete(remoteAddress);
    setStaffSession(response);
    return sendJson(response, 200, { authenticated: true });
  }

  if (url.pathname === "/api/staff/change-password" && request.method === "POST") {
    if (!requireStaff(request, response)) return;
    const input = await readBody(request);
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
    if (!passwordInputMatches(input.currentPassword)) return sendJson(response, 403, { error: "The current password is incorrect." });
    if (newPassword.length < 10 || newPassword.length > 128) {
      return sendJson(response, 400, { error: "Use a new password between 10 and 128 characters." });
    }
    if (passwordInputMatches(newPassword)) return sendJson(response, 400, { error: "Choose a password different from the current one." });

    savePassword(newPassword);
    sessions.clear();
    setStaffSession(response);
    return sendJson(response, 200, { changed: true });
  }

  if (url.pathname === "/api/staff/logout" && request.method === "POST") {
    sessions.delete(readCookie(request, sessionCookie));
    response.setHeader("Set-Cookie", createSessionCookie("", 0));
    return sendJson(response, 200, { authenticated: false });
  }

  if (url.pathname === "/api/staff/session" && request.method === "GET") {
    return sendJson(response, 200, { authenticated: getStaffSession(request) });
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    if (!requireStaff(request, response)) return;
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    response.write("event: connected\ndata: {}\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (url.pathname === "/api/orders" && request.method === "GET") {
    if (!requireStaff(request, response)) return;
    return sendJson(response, 200, readOrders().sort((first, second) => second.createdAt.localeCompare(first.createdAt)));
  }

  if (url.pathname === "/api/orders" && request.method === "POST") {
    const orders = readOrders();
    const order = buildOrder(await readBody(request), orders);
    orders.push(order);
    writeOrders(orders);
    broadcast("new-order", order);
    return sendJson(response, 201, order);
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
  if (orderMatch && request.method === "PATCH") {
    if (!requireStaff(request, response)) return;
    const input = await readBody(request);
    const orders = readOrders();
    const order = orders.find((candidate) => candidate.id === orderMatch[1]);
    if (!order) return sendJson(response, 404, { error: "Order not found." });
    if (!nextStatus(order, input.status)) return sendJson(response, 409, { error: "That order status change is not allowed." });
    order.status = input.status;
    if (input.status === "paid") {
      order.paymentStatus = "paid_manual_confirmation";
      order.paymentConfirmedAt = new Date().toISOString();
    }
    order.updatedAt = new Date().toISOString();
    writeOrders(orders);
    broadcast("order-updated", order);
    return sendJson(response, 200, order);
  }

  return sendJson(response, 404, { error: "API route not found." });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    try {
      await handleApi(request, response, url);
    } catch (error) {
      if (!response.headersSent) sendJson(response, 400, { error: error.message || "Request failed." });
      else response.destroy();
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  if (url.pathname === "/shopkeeper.html" && !getStaffSession(request)) {
    response.writeHead(302, { Location: "/shopkeeper-login.html", "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (url.pathname === "/shopkeeper-login.html" && getStaffSession(request)) {
    response.writeHead(302, { Location: "/shopkeeper.html", "Cache-Control": "no-store" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === "/" ? "/intexx.html" : url.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(`${root}${path.sep}`) || filePath.startsWith(`${dataDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath), "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Customer shop: http://localhost:${port}/`);
  console.log(`Shopkeeper dashboard: http://localhost:${port}/shopkeeper.html`);
  if (initialPasswordToPrint) console.log(`Initial shopkeeper password: ${initialPasswordToPrint}`);
  console.log("Demo server listens on all network interfaces for local-network testing.");
});