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

function waitForEvent(socket, event, predicate = () => true, ms = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error("timeout waiting for " + event)); }, ms);
    const listener = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
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

  const savedPreferences = await req("/api/preferences", {
    method: "PATCH", token: alice.token,
    body: { appearance: { accentColor: "#00aa88", theme: "dark" } }
  });
  if (savedPreferences.preferences.appearance.accentColor !== "#00aa88") throw new Error("preferences were not saved");
  const loadedPreferences = await req("/api/preferences", { token: alice.token });
  if (loadedPreferences.preferences.appearance.accentColor !== "#00aa88") throw new Error("preferences were not persisted");
  console.log("PASS account preferences save and reload");

  await req("/api/friends/request", { method: "POST", token: alice.token, body: { username: b } });
  const bobRequests = await req("/api/friends", { token: bob.token });
  const incoming = bobRequests.requests.find(r => r.senderId === alice.user.id && r.status === "pending");
  if (!incoming) throw new Error("friend request not visible to recipient");
  await req("/api/friends/" + incoming.id, { method: "PATCH", token: bob.token, body: { action: "accept" } });
  console.log("PASS friend request and acceptance");

  const conv = await req(`/api/conversations/${bob.user.id}`, { token: alice.token });
  if (!conv.conversation || !conv.conversation._id) throw new Error("no conversation id returned");
  console.log("PASS GET /api/conversations/:id ->", conv.conversation._id, "(messages:", conv.messages.length + ")");

  const aliceSocket = await connect(alice.token);
  const bobPresence = waitForEvent(aliceSocket, "presence:changed", p => p.userId === bob.user.id && p.online);
  const bobSocket = await connect(bob.token);
  await bobPresence;
  console.log("PASS sockets connected and friend presence syncs");

  await req("/api/preferences", { method: "PATCH", token: alice.token, body: { privacy: { profileVisibility: "nobody" } } });
  const privateDirectory = await req("/api/users", { token: bob.token });
  const privateAlice = privateDirectory.users.find(u => u._id === alice.user.id);
  if (!privateAlice || privateAlice.displayName || privateAlice.avatarData) throw new Error("profile visibility setting was not enforced");
  await req("/api/preferences", { method: "PATCH", token: alice.token, body: { privacy: { profileVisibility: "contacts" } } });
  console.log("PASS profile visibility is enforced by the API");

  const presenceOff = waitForEvent(aliceSocket, "presence:changed", p => p.userId === bob.user.id && !p.online);
  await req("/api/preferences", { method: "PATCH", token: bob.token, body: { privacy: { showOnline: false } } });
  await presenceOff;
  console.log("PASS online status privacy toggle");

  const incomingMessage = waitForEvent(bobSocket, "message:new", m => m.body === "hello from smoke test");
  const ack = await new Promise((resolve) =>
    aliceSocket.emit("message:send", { conversationId: conv.conversation._id, body: "hello from smoke test" }, resolve)
  );
  if (ack && ack.error) throw new Error("ack error: " + ack.error);
  console.log("PASS message:send ack ->", ack.message._id);

  const received = await incomingMessage;
  if (received.senderId !== alice.user.id) throw new Error("senderId mismatch");
  console.log("PASS message:new delivered to recipient");

  const readReceipt = waitForEvent(aliceSocket, "message:read", p => (p.messageIds || []).includes(ack.message._id));
  const readAck = await new Promise(resolve => bobSocket.emit("message:read", { conversationId: conv.conversation._id }, resolve));
  if (readAck?.error) throw new Error("read ack error: " + readAck.error);
  await readReceipt;
  const afterRead = await req(`/api/conversations/${alice.user.id}`, { token: bob.token });
  if (!afterRead.messages.find(m => m._id === ack.message._id)) throw new Error("reading a message deleted it unexpectedly");
  console.log("PASS read receipt sync and manual-retention rule");

  const hiddenIncoming = waitForEvent(bobSocket, "message:new", m => m.body === "delete for me test");
  const hiddenAck = await new Promise(resolve => aliceSocket.emit("message:send", { conversationId: conv.conversation._id, body: "delete for me test" }, resolve));
  if (hiddenAck?.error) throw new Error(hiddenAck.error);
  await hiddenIncoming;
  const hiddenEvent = waitForEvent(aliceSocket, "message:hidden", p => (p.messageIds || []).includes(hiddenAck.message._id));
  const hideAck = await new Promise(resolve => aliceSocket.emit("message:delete", { messageId: hiddenAck.message._id, scope: "me" }, resolve));
  if (hideAck?.error) throw new Error(hideAck.error);
  await hiddenEvent;
  const aliceHistory = await req(`/api/conversations/${bob.user.id}`, { token: alice.token });
  const bobHistory = await req(`/api/conversations/${alice.user.id}`, { token: bob.token });
  if (aliceHistory.messages.some(m => m._id === hiddenAck.message._id)) throw new Error("Delete for me did not hide the message");
  if (!bobHistory.messages.some(m => m._id === hiddenAck.message._id)) throw new Error("Delete for me removed the other user's copy");
  console.log("PASS Delete for me is per-user");

  const deletedOnBob = waitForEvent(bobSocket, "message:deleted", p => (p.messageIds || []).includes(ack.message._id));
  const deletedOnAlice = waitForEvent(aliceSocket, "message:deleted", p => (p.messageIds || []).includes(ack.message._id));
  const deleteAck = await new Promise(resolve => aliceSocket.emit("message:delete", { messageId: ack.message._id, scope: "everyone" }, resolve));
  if (deleteAck?.error) throw new Error(deleteAck.error);
  await Promise.all([deletedOnBob, deletedOnAlice]);
  const finalHistory = await req(`/api/conversations/${alice.user.id}`, { token: bob.token });
  if (finalHistory.messages.some(m => m._id === ack.message._id)) throw new Error("Delete for everyone did not remove the message");
  console.log("PASS Delete for everyone syncs to both participants");

  aliceSocket.close();
  bobSocket.close();
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
})().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err.message);
  process.exit(1);
});
