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

  const publicDirectory = await fetch(API + "/api/users", { headers: { Authorization: "Bearer " + alice.token } });
  if (publicDirectory.status !== 404) throw new Error("public user directory should not be available");
  const exactSearch = await req("/api/users/search?username=" + b, { token: alice.token });
  if (!exactSearch.users.some(user => user.username === b) || exactSearch.users.length !== 1) throw new Error("exact username search did not return one exact match");
  const partialSearch = await req("/api/users/search?username=" + b.slice(0, -1), { token: alice.token });
  if (partialSearch.users.length !== 0) throw new Error("partial username search should not expose user suggestions");
  console.log("PASS private directory disabled and exact username search enforced");

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
  const mutePrefs = await req("/api/preferences", { method: "PATCH", token: alice.token, body: { notifications: { mutedContacts: [bob.user.id, "not-an-id"] } } });
  if (mutePrefs.preferences.notifications.mutedContacts.length !== 1 || mutePrefs.preferences.notifications.mutedContacts[0] !== bob.user.id) throw new Error("muted contacts were not validated");
  await req("/api/preferences", { method: "PATCH", token: alice.token, body: { notifications: { mutedContacts: [] } } });
  console.log("PASS per-contact mute preferences are validated");

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
  const charlieSocket = await connect(charlie.token);
  await bobPresence;
  console.log("PASS sockets connected and friend presence syncs");

  const createdGroup = await req("/api/groups", { method: "POST", token: alice.token, body: { name: "Smoke Test Squad", description: "Private group test", memberIds: [bob.user.id, charlie.user.id] } });
  if (!createdGroup.group?.id || createdGroup.group.memberCount !== 3 || !createdGroup.group.isAdmin) throw new Error("group creation did not return expected members/admin");
  const bobGroups = await req("/api/groups", { token: bob.token });
  if (!bobGroups.groups.some(group => group.id === createdGroup.group.id)) throw new Error("group did not appear for invited friend");
  const groupMessageForBob = waitForEvent(bobSocket, "group:message:new", message => message.groupId === createdGroup.group.id && message.body === "hello group");
  const groupMessageForCharlie = waitForEvent(charlieSocket, "group:message:new", message => message.groupId === createdGroup.group.id && message.body === "hello group");
  const groupAck = await new Promise(resolve => aliceSocket.emit("group:message:send", { groupId: createdGroup.group.id, body: "hello group" }, resolve));
  if (groupAck?.error) throw new Error("group send ack error: " + groupAck.error);
  await Promise.all([groupMessageForBob, groupMessageForCharlie]);
  const groupHistory = await req("/api/groups/" + createdGroup.group.id + "/messages", { token: bob.token });
  if (!groupHistory.messages.some(message => message.body === "hello group" && message.senderId === alice.user.id)) throw new Error("group message history did not persist");
  console.log("PASS private group creation, membership, realtime delivery and history");

  const outsider = await req("/api/auth/register", { method: "POST", body: { username: `outsider_${stamp}`, password: "password123" } });
  const forbiddenGroup = await req("/api/groups", { token: outsider.token });
  if (forbiddenGroup.groups.length !== 0) throw new Error("group leaked to non-members");
  const outsiderSocket = await connect(outsider.token);
  const outsiderGroupAck = await new Promise(resolve => outsiderSocket.emit("group:message:send", { groupId: createdGroup.group.id, body: "not allowed" }, resolve));
  if (!outsiderGroupAck?.error) throw new Error("non-member was allowed to send a group message");
  outsiderSocket.close();

  await req("/api/preferences", { method: "PATCH", token: alice.token, body: { privacy: { profileVisibility: "nobody" } } });
  const privateSearch = await req("/api/users/search?username=" + a, { token: bob.token });
  const privateAlice = privateSearch.users.find(u => u.username === a);
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

  const reactionEvent = waitForEvent(bobSocket, "message:reaction", p => p.messageId === ack.message._id && (p.reactions || []).some(r => r.userId === bob.user.id && r.emoji === "🔥"));
  const reactionAck = await new Promise(resolve => bobSocket.emit("message:reaction", { messageId: ack.message._id, emoji: "🔥" }, resolve));
  if (reactionAck?.error) throw new Error(reactionAck.error);
  await reactionEvent;
  const reactionHistory = await req(`/api/conversations/${alice.user.id}`, { token: bob.token });
  if (!reactionHistory.messages.find(m => m._id === ack.message._id)?.reactions?.some(r => r.emoji === "🔥")) throw new Error("reaction was not persisted");
  console.log("PASS message reactions persist and sync");

  const mediaIncoming = waitForEvent(bobSocket, "message:new", m => m.contentType === "gif");
  const mediaAck = await new Promise(resolve => aliceSocket.emit("message:send", {
    conversationId: conv.conversation._id,
    contentType: "gif",
    mediaUrl: "https://media0.giphy.com/media/example/giphy.gif",
    mediaPreviewUrl: "https://media0.giphy.com/media/example/200w.gif",
    body: ""
  }, resolve));
  if (mediaAck?.error) throw new Error(mediaAck.error);
  const mediaReceived = await mediaIncoming;
  if (mediaReceived.mediaUrl !== "https://media0.giphy.com/media/example/giphy.gif") throw new Error("media URL was not delivered");
  console.log("PASS GIF message payload validation and delivery");

  const mediaConfigResponse = await fetch(API + "/api/media/giphy", { headers: { Authorization: `Bearer ${alice.token}` } });
  if (![200, 503].includes(mediaConfigResponse.status)) throw new Error("unexpected GIF provider response: " + mediaConfigResponse.status);
  console.log("PASS GIF provider endpoint responds safely when not configured");

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
  charlieSocket.close();

  const charlie = await req("/api/auth/register", { method: "POST", body: { username: `charlie_${stamp}`, password: "password123" } });
  await req("/api/friends/request", { method: "POST", token: alice.token, body: { username: charlie.user.username } });
  const charlieRequests = await req("/api/friends", { token: charlie.token });
  const charlieIncoming = charlieRequests.requests.find(r => r.senderId === alice.user.id && r.status === "pending");
  if (!charlieIncoming) throw new Error("second friend request not visible");
  await req("/api/friends/" + charlieIncoming.id, { method: "PATCH", token: charlie.token, body: { action: "accept" } });
  await req("/api/sessions/revoke-all", { method: "POST", token: charlie.token });
  const revokedCheck = await fetch(API + "/api/preferences", { headers: { Authorization: "Bearer " + charlie.token } });
  if (revokedCheck.status !== 401) throw new Error("revoked session token still works");
  console.log("PASS revoke-all invalidates old sessions");

  const dave = await req("/api/auth/register", { method: "POST", body: { username: `dave_${stamp}`, password: "password123" } });
  await req("/api/account", { method: "DELETE", token: dave.token, body: { password: "password123" } });
  const deletedCheck = await fetch(API + "/api/preferences", { headers: { Authorization: "Bearer " + dave.token } });
  if (deletedCheck.status !== 401) throw new Error("deleted account token still works");
  console.log("PASS account deletion removes account access");

  console.log("\nALL CHECKS PASSED");
  process.exit(0);
})().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err.message);
  process.exit(1);
});
