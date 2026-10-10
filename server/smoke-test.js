// End-to-end smoke test for the Personal Messenger backend.
// Usage: start the server (node index.js), then run `node smoke-test.js`.
const { io } = require("socket.io-client");

const API = process.env.TEST_API || "http://127.0.0.1:4000";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

function waitForMessage(socket, ms = 5000) {
  return Promise.race([
    new Promise((resolve) => socket.once("message:new", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for message:new")), ms))
  ]);
}

(async () => {
  const stamp = Date.now().toString().slice(-6);
  const a = `alice_${stamp}`;
  const b = `bob_${stamp}`;

  const alice = await req("/api/auth/register", {
    method: "POST",
    body: { username: a, password: "password123", displayName: "Alice" }
  });
  const bob = await req("/api/auth/register", {
    method: "POST",
    body: { username: b, password: "password123", displayName: "Bob" }
  });
  console.log("PASS register ->", alice.user.username, "/", bob.user.username);

  const users = await req("/api/users", { token: alice.token });
  if (!users.users.find((u) => u._id === bob.user.id)) throw new Error("bob not listed in /api/users for alice");
  console.log("PASS GET /api/users ->", users.users.map((u) => u.username).join(", "));

  const login = await req("/api/auth/login", { method: "POST", body: { username: a, password: "password123" } });
  if (login.user.id !== alice.user.id) throw new Error("login returned a different user");
  console.log("PASS POST /api/auth/login");

  const conv = await req(`/api/conversations/${bob.user.id}`, { token: alice.token });
  if (!conv.conversation || !conv.conversation._id) throw new Error("no conversation id returned");
  console.log("PASS GET /api/conversations/:id ->", conv.conversation._id, "(messages:", conv.messages.length + ")");

  const aliceSocket = await connect(alice.token);
  const bobSocket = await connect(bob.token);
  console.log("PASS sockets connected");

  const incoming = waitForMessage(bobSocket);
  const ack = await new Promise((resolve) =>
    aliceSocket.emit("message:send", { conversationId: conv.conversation._id, body: "hello from smoke test" }, resolve)
  );
  if (ack && ack.error) throw new Error("ack error: " + ack.error);
  console.log("PASS message:send ack ->", ack.message._id);

  const received = await incoming;
  if (received.body !== "hello from smoke test") throw new Error("unexpected body: " + received.body);
  if (received.senderId !== alice.user.id) throw new Error("senderId mismatch");
  console.log("PASS message:new delivered to recipient");

  const history = await req(`/api/conversations/${alice.user.id}`, { token: bob.token });
  if (!history.messages.find((m) => m._id === ack.message._id)) throw new Error("message not persisted");
  console.log("PASS persistence ->", history.messages.length, "message(s) in history");

  aliceSocket.close();
  bobSocket.close();
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
})().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err.message);
  process.exit(1);
});
