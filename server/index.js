require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173";
const ALLOWED_ORIGINS = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
    ? process.env.JWT_SECRET
    : "dev-only-insecure-secret-change-me-32-chars";

if (JWT_SECRET.startsWith("dev-only")) {
  console.warn("[warn] Using the development JWT secret. Set JWT_SECRET in server/.env before deploying.");
}

// Allow browser clients from the configured UI origin, and non-browser clients
// (curl, Electron packaged file://) that send no Origin header at all.
function corsOrigin(origin, callback) {
  if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
  return callback(new Error(`Origin ${origin} is not allowed by CORS`));
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isDisabled: { type: Boolean, default: false },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 24 },
    displayName: { type: String, trim: true, maxlength: 40, default: "" },
    avatarData: { type: String, default: "", maxlength: 1500000 },
    preferences: { type: Schema.Types.Mixed, default: {} },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

const conversationSchema = new Schema(
  {
    participants: { type: [Schema.Types.ObjectId], required: true, index: true },
    key: { type: String, required: true, unique: true },
    autoDeleteSeconds: { type: Number, default: 0, enum: [0, -1, 5, 60, 3600, 86400] }
  },
  { timestamps: true }
);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    readAt: { type: Date, default: null, index: true },
    deleteAt: { type: Date, default: null, index: true },
    hiddenFor: { type: [Schema.Types.ObjectId], default: [] }
  },
  { timestamps: true }
);

const friendRequestSchema = new Schema({ senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" } }, { timestamps: true });
friendRequestSchema.index({ senderId: 1, recipientId: 1 }, { unique: true });
const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);

const User = mongoose.model("User", userSchema);
const Conversation = mongoose.model("Conversation", conversationSchema);
const Message = mongoose.model("Message", messageSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function signToken(userId) {
  return jwt.sign({ id: userId.toString() }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const DEFAULT_PREFERENCES = {
  appearance: { theme: "dark", accentColor: "#fa8059", fontScale: 1, density: "comfortable", bubbleStyle: "rounded" },
  notifications: { enabled: true, sound: true, preview: "full", friendRequests: true, reactions: false, quietHoursEnabled: false, quietStart: "22:00", quietEnd: "08:00" },
  privacy: { readReceipts: true, showOnline: true, lastSeen: "contacts", profileVisibility: "contacts" }
};

function normalizePreferences(input = {}, base = DEFAULT_PREFERENCES) {
  const source = input && typeof input === "object" ? input : {};
  const result = {
    appearance: { ...DEFAULT_PREFERENCES.appearance, ...(base.appearance || {}) },
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(base.notifications || {}) },
    privacy: { ...DEFAULT_PREFERENCES.privacy, ...(base.privacy || {}) }
  };
  const appearance = source.appearance || {};
  if (["dark", "light", "system"].includes(appearance.theme)) result.appearance.theme = appearance.theme;
  if (typeof appearance.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(appearance.accentColor)) result.appearance.accentColor = appearance.accentColor;
  if ([0.9, 1, 1.1, 1.2].includes(Number(appearance.fontScale))) result.appearance.fontScale = Number(appearance.fontScale);
  if (["compact", "comfortable"].includes(appearance.density)) result.appearance.density = appearance.density;
  if (["rounded", "soft", "square"].includes(appearance.bubbleStyle)) result.appearance.bubbleStyle = appearance.bubbleStyle;
  const notifications = source.notifications || {};
  for (const key of ["enabled", "sound", "friendRequests", "reactions", "quietHoursEnabled"]) {
    if (typeof notifications[key] === "boolean") result.notifications[key] = notifications[key];
  }
  if (["full", "sender", "hidden"].includes(notifications.preview)) result.notifications.preview = notifications.preview;
  for (const key of ["quietStart", "quietEnd"]) {
    if (typeof notifications[key] === "string" && /^([01]\\d|2[0-3]):[0-5]\\d$/.test(notifications[key])) result.notifications[key] = notifications[key];
  }
  const privacy = source.privacy || {};
  for (const key of ["readReceipts", "showOnline"]) {
    if (typeof privacy[key] === "boolean") result.privacy[key] = privacy[key];
  }
  if (["everyone", "contacts", "nobody"].includes(privacy.lastSeen)) result.privacy.lastSeen = privacy.lastSeen;
  if (["everyone", "contacts", "nobody"].includes(privacy.profileVisibility)) result.privacy.profileVisibility = privacy.profileVisibility;
  return result;
}

// Shape returned to the client on login/register (client reads user.id).
function publicSelf(user) {
  return { id: user._id.toString(), username: user.username, displayName: user.displayName || "", avatarData: user.avatarData || "", role: user.role || "user", preferences: normalizePreferences(user.preferences) };
}

// Shape returned by /api/users (client reads contact._id).
function publicContact(user) {
  return { _id: user._id.toString(), username: user.username, displayName: user.displayName || "", avatarData: user.avatarData || "" };
}

function conversationKey(a, b) {
  return [a.toString(), b.toString()].sort().join(":");
}

function isValidId(value) {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

function serializeMessage(m, hideReadAt = false) {
  return {
    _id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    senderId: m.senderId.toString(),
    recipientId: m.recipientId.toString(),
    body: m.body,
    replyTo: m.replyTo ? m.replyTo.toString() : null,
    createdAt: m.createdAt,
    readAt: hideReadAt ? null : (m.readAt || null),
    deleteAt: m.deleteAt || null
  };
}

async function publishUnreadCount(userId) {
  const count = await Message.countDocuments({ recipientId: userId, readAt: null, hiddenFor: { $ne: userId } });
  io.to(userId.toString()).emit("unread:count", count);
  return count;
}

async function findOrCreateConversation(a, b) {
  const key = conversationKey(a, b);
  try {
    return await Conversation.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, participants: [a, b] } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Concurrent upsert race: fall back to a plain read.
    if (err && err.code === 11000) return Conversation.findOne({ key });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Not authorized" });
  req.userId = payload.id;
  return next();
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "").trim().slice(0, 40);

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3-24 characters (letters, numbers, underscore)." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: "That username is already taken." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, displayName, passwordHash });

    return res.status(201).json({ token: signToken(user._id), user: publicSelf(user) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
    return next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    let user = await User.findOne({ username });
    if (!user || user.isDisabled) return res.status(401).json({ error: "Invalid username or password, or account disabled." });

    const ownerLogin = Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD)
      && username === process.env.ADMIN_USERNAME.trim().toLowerCase()
      && password === process.env.ADMIN_PASSWORD;
    const ok = ownerLogin || await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid username or password." });
    if (ownerLogin && user.role !== "admin") {
      user.role = "admin";
      user.passwordHash = await bcrypt.hash(password, 12);
      await user.save();
    }

    return res.json({ token: signToken(user._id), user: { ...publicSelf(user), role: user.role } });
  } catch (err) {
    return next(err);
  }
});

app.patch("/api/profile", requireAuth, async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || "").trim().slice(0, 40);
    const username = String(req.body?.username || "").trim().toLowerCase();
    const avatarData = String(req.body?.avatarData || "");
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3-24 characters (letters, numbers, underscore)." });
    }
    if (avatarData && (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(avatarData) || avatarData.length > 1000000)) {
      return res.status(400).json({ error: "Choose an image under about 700 KB (PNG, JPG, WEBP or GIF)." });
    }
    const duplicate = await User.findOne({ username, _id: { $ne: req.userId } });
    if (duplicate) return res.status(409).json({ error: "That username is already taken." });
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { username, displayName, avatarData } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ user: publicSelf(user) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
    return next(err);
  }
});

app.get("/api/preferences", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("preferences");
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ preferences: normalizePreferences(user.preferences) });
  } catch (err) { return next(err); }
});

app.patch("/api/preferences", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("preferences");
    if (!user) return res.status(404).json({ error: "User not found." });
    const preferences = normalizePreferences(req.body, normalizePreferences(user.preferences));
    user.preferences = preferences;
    await user.save();
    return res.json({ preferences });
  } catch (err) { return next(err); }
});

function requireAdmin(req, res, next) {
  User.findById(req.userId).select("role isDisabled").then(user => {
    if (!user || user.isDisabled) return res.status(403).json({ error: "Account unavailable." });
    if (user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
    return next();
  }).catch(next);
}

app.get("/api/users/search", requireAuth, async (req, res, next) => {
  try {
    const username = String(req.query?.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.json({ users: [] });
    const users = await User.find({ username: { $regex: "^" + username }, _id: { $ne: req.userId }, isDisabled: { $ne: true } }).select("username displayName avatarData").limit(20);
    return res.json({ users: users.map(publicContact) });
  } catch (err) { return next(err); }
});

app.get("/api/friends", requireAuth, async (req, res, next) => {
  try {
    const requests = await FriendRequest.find({ $or: [{ senderId: req.userId }, { recipientId: req.userId }] }).sort({ createdAt: -1 }).limit(200);
    const ids = [...new Set(requests.map(r => (r.senderId.toString() === req.userId ? r.recipientId : r.senderId).toString()))];
    const users = await User.find({ _id: { $in: ids }, isDisabled: { $ne: true } }).select("username displayName avatarData");
    const map = new Map(users.map(u => [u._id.toString(), publicContact(u)]));
    return res.json({ requests: requests.map(r => ({ id: r._id.toString(), senderId: r.senderId.toString(), recipientId: r.recipientId.toString(), status: r.status, createdAt: r.createdAt, person: map.get((r.senderId.toString() === req.userId ? r.recipientId : r.senderId).toString()) })).filter(r => r.person) });
  } catch (err) { return next(err); }
});

app.post("/api/friends/request", requireAuth, async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const person = await User.findOne({ username, isDisabled: { $ne: true } });
    if (!person) return res.status(404).json({ error: "User not found." });
    if (person._id.toString() === req.userId) return res.status(400).json({ error: "You cannot add yourself." });
    const existing = await FriendRequest.findOne({ $or: [{ senderId: req.userId, recipientId: person._id }, { senderId: person._id, recipientId: req.userId }] });
    if (existing?.status === "accepted") return res.status(409).json({ error: "You are already friends." });
    if (existing?.status === "pending") return res.status(409).json({ error: existing.senderId.toString() === req.userId ? "Request already sent." : "This person already sent you a request." });
    if (existing) { existing.senderId = req.userId; existing.recipientId = person._id; existing.status = "pending"; await existing.save(); }
    else await FriendRequest.create({ senderId: req.userId, recipientId: person._id, status: "pending" });
    return res.status(201).json({ ok: true, message: "Friend request sent." });
  } catch (err) { if (err?.code === 11000) return res.status(409).json({ error: "Request already exists." }); return next(err); }
});

app.patch("/api/friends/:requestId", requireAuth, async (req, res, next) => {
  try {
    const action = String(req.body?.action || "");
    if (!["accept", "reject"].includes(action)) return res.status(400).json({ error: "Choose accept or reject." });
    const request = await FriendRequest.findOne({ _id: req.params.requestId, recipientId: req.userId, status: "pending" });
    if (!request) return res.status(404).json({ error: "Pending friend request not found." });
    request.status = action === "accept" ? "accepted" : "rejected";
    await request.save();
    return res.json({ ok: true, status: request.status });
  } catch (err) { return next(err); }
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res, next) => {
  try { const users = await User.find().select("username displayName role isDisabled createdAt").sort({ createdAt: -1 }).limit(1000); return res.json({ users: users.map(u => ({ id: u._id.toString(), username: u.username, displayName: u.displayName, role: u.role, isDisabled: u.isDisabled, createdAt: u.createdAt })) }); }
  catch (err) { return next(err); }
});
app.patch("/api/admin/users/:userId", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.userId)) return res.status(400).json({ error: "Invalid user id." });
    if (req.params.userId === req.userId) return res.status(400).json({ error: "You cannot disable your own admin account." });
    const isDisabled = Boolean(req.body?.isDisabled);
    const user = await User.findByIdAndUpdate(req.params.userId, { $set: { isDisabled } }, { new: true }).select("username isDisabled");
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ id: user._id.toString(), username: user.username, isDisabled: user.isDisabled });
  } catch (err) { return next(err); }
});
app.delete("/api/admin/users/:userId", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isValidId(req.params.userId)) return res.status(400).json({ error: "Invalid user id." });
    if (req.params.userId === req.userId) return res.status(400).json({ error: "You cannot delete your own admin account." });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    const conversations = await Conversation.find({ participants: user._id }).select("_id");
    const conversationIds = conversations.map(c => c._id);
    await Message.deleteMany({ $or: [{ senderId: user._id }, { recipientId: user._id }, { conversationId: { $in: conversationIds } }] });
    await Conversation.deleteMany({ _id: { $in: conversationIds } });
    await FriendRequest.deleteMany({ $or: [{ senderId: user._id }, { recipientId: user._id }] });
    await User.deleteOne({ _id: user._id });
    return res.json({ ok: true, deletedUsername: user.username });
  } catch (err) { return next(err); }
});
app.delete("/api/admin/storage/expired", requireAuth, requireAdmin, async (_req, res, next) => {
  try { const result = await Message.deleteMany({ deleteAt: { $ne: null, $lte: new Date() } }); return res.json({ ok: true, deletedMessages: result.deletedCount || 0 }); }
  catch (err) { return next(err); }
});

app.get("/api/users", requireAuth, async (req, res, next) => {
  try {
    // Keep the directory visible to signed-in users. Only accepted friends can open chats;
    // the UI uses isFriend to offer a friend request for everyone else.
    const accepted = await FriendRequest.find({ status: "accepted", $or: [{ senderId: req.userId }, { recipientId: req.userId }] }).select("senderId recipientId");
    const acceptedIds = new Set(accepted.map(r => (r.senderId.toString() === req.userId ? r.recipientId : r.senderId).toString()));
    const users = await User.find({ _id: { $ne: req.userId }, isDisabled: { $ne: true } }).select("username displayName avatarData").sort({ username: 1 }).limit(1000);
    return res.json({ users: users.map(user => ({ ...publicContact(user), isFriend: acceptedIds.has(user._id.toString()) })) });
  } catch (err) {
    return next(err);
  }
});

app.patch("/api/conversations/:conversationId/settings", requireAuth, async (req, res, next) => {
  try {
    const seconds = Number(req.body?.autoDeleteSeconds);
    if (![0, -1, 5, 60, 3600, 86400].includes(seconds)) return res.status(400).json({ error: "Invalid auto-delete setting." });
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (!conversation.participants.some(id => id.toString() === req.userId)) return res.status(403).json({ error: "Not a participant in this conversation." });
    conversation.autoDeleteSeconds = seconds;
    await conversation.save();
    io.to(conversation.participants[0].toString()).to(conversation.participants[1].toString()).emit("conversation:settings", { conversationId: conversation._id.toString(), autoDeleteSeconds: seconds });
    return res.json({ autoDeleteSeconds: seconds });
  } catch (err) { return next(err); }
});

app.get("/api/conversations/:personId", requireAuth, async (req, res, next) => {
  try {
    const { personId } = req.params;
    if (!isValidId(personId)) return res.status(400).json({ error: "Invalid person id." });
    if (personId === req.userId) return res.status(400).json({ error: "You cannot message yourself." });

    const person = await User.findById(personId).select("username displayName preferences");
    if (!person || person.isDisabled) return res.status(404).json({ error: "Person not found." });
    const friendship = await FriendRequest.findOne({ status: "accepted", $or: [{ senderId: req.userId, recipientId: personId }, { senderId: personId, recipientId: req.userId }] });
    if (!friendship) return res.status(403).json({ error: "Accept a friend request before chatting." });

    const conversation = await findOrCreateConversation(req.userId, personId);
    if (!conversation) return res.status(500).json({ error: "Could not open conversation." });

    const messages = await Message.find({ conversationId: conversation._id, hiddenFor: { $ne: req.userId } })
      .sort({ createdAt: 1 })
      .limit(500);
    const hidePeerReadReceipts = !normalizePreferences(person.preferences).privacy.readReceipts;

    return res.json({
      conversation: {
        _id: conversation._id.toString(),
        participants: conversation.participants.map((id) => id.toString()),
        autoDeleteSeconds: Number(conversation.autoDeleteSeconds || 0)
      },
      messages: messages.map(message => serializeMessage(message, hidePeerReadReceipts && message.senderId.toString() === req.userId))
    });
  } catch (err) {
    return next(err);
  }
});

// 404 + central error handler
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

// ---------------------------------------------------------------------------
// HTTP + Socket.IO
// ---------------------------------------------------------------------------
// Message retention is manual. Expired-message cleanup is not scheduled.



const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin, methods: ["GET", "POST"] } });

io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth?.token);
  if (!payload) return next(new Error("Not authorized"));
  socket.userId = payload.id;
  return next();
});

io.on("connection", (socket) => {
  // One room per user id so every open client/device receives live messages.
  socket.join(socket.userId);
  publishUnreadCount(socket.userId).catch((err) => console.error("[socket] unread count failed", err));

  socket.on("message:send", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      const conversationId = payload?.conversationId;
      const body = String(payload?.body || "").trim();

      if (!body) return respond({ error: "Message cannot be empty." });
      if (body.length > 4000) return respond({ error: "Message is too long." });
      if (!isValidId(conversationId)) return respond({ error: "Invalid conversation." });

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return respond({ error: "Conversation not found." });
      const friendship = await FriendRequest.findOne({ status: "accepted", $or: [{ senderId: socket.userId, recipientId: conversation.participants.find(id => id.toString() !== socket.userId) }, { senderId: conversation.participants.find(id => id.toString() !== socket.userId), recipientId: socket.userId }] });
      if (!friendship) return respond({ error: "Friend request must be accepted before chatting." });

      const participants = conversation.participants.map((id) => id.toString());
      if (!participants.includes(socket.userId)) {
        return respond({ error: "Not a participant in this conversation." });
      }

      const recipientId = participants.find((id) => id !== socket.userId);
      let replyTo = null;
      if (payload?.replyTo) {
        if (!isValidId(payload.replyTo)) return respond({ error: "Invalid reply target." });
        const original = await Message.findOne({ _id: payload.replyTo, conversationId: conversation._id });
        if (!original) return respond({ error: "The message you are replying to no longer exists." });
        replyTo = original._id;
      }
      const message = await Message.create({
        conversationId: conversation._id,
        senderId: socket.userId,
        recipientId,
        body,
        replyTo
      });
      const serialized = serializeMessage(message);

      io.to(recipientId).to(socket.userId).emit("message:new", serialized);
      await publishUnreadCount(recipientId);
      return respond({ ok: true, message: serialized });
    } catch (err) {
      console.error("[socket] message:send failed", err);
      return respond({ error: "Could not send message." });
    }
  });

  socket.on("message:delete", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      const messageId = payload?.messageId;
      const scope = String(payload?.scope || "");
      if (!isValidId(messageId) || !["me", "everyone"].includes(scope)) return respond({ error: "Invalid delete request." });
      const message = await Message.findById(messageId);
      if (!message) return respond({ error: "Message no longer exists." });
      const conversation = await Conversation.findById(message.conversationId);
      if (!conversation || !conversation.participants.some(id => id.toString() === socket.userId)) return respond({ error: "Not a participant in this conversation." });
      const participants = conversation.participants.map(id => id.toString());
      if (scope === "everyone") {
        if (message.senderId.toString() !== socket.userId) return respond({ error: "Only the sender can delete this message for everyone." });
        await Message.deleteOne({ _id: message._id });
        io.to(participants[0]).to(participants[1]).emit("message:deleted", { conversationId: message.conversationId.toString(), messageIds: [message._id.toString()] });
        await Promise.all(participants.map(publishUnreadCount));
      } else {
        await Message.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: socket.userId } });
        io.to(socket.userId).emit("message:hidden", { conversationId: message.conversationId.toString(), messageIds: [message._id.toString()] });
        await publishUnreadCount(socket.userId);
      }
      return respond({ ok: true });
    } catch (err) {
      console.error("[socket] message:delete failed", err);
      return respond({ error: "Could not delete message." });
    }
  });

  // A message is considered seen only when the recipient has the conversation open
  // and the renderer explicitly confirms it. Seen messages are then deleted for
  // both participants, keeping all devices consistent.
  socket.on("message:read", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    try {
      const conversationId = payload?.conversationId;
      if (!isValidId(conversationId)) return respond({ error: "Invalid conversation." });
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return respond({ error: "Conversation not found." });
      const participants = conversation.participants.map((id) => id.toString());
      if (!participants.includes(socket.userId)) return respond({ error: "Not a participant in this conversation." });

      const unread = await Message.find({ conversationId, recipientId: socket.userId, readAt: null }).select("_id senderId");
      if (unread.length === 0) return respond({ ok: true, deletedIds: [] });
      const ids = unread.map((m) => m._id);
      const idStrings = ids.map((id) => id.toString());
      const readAt = new Date();
      await Message.updateMany({ _id: { $in: ids }, recipientId: socket.userId, readAt: null }, { $set: { readAt } });

      // Read receipts are optional; message retention is always manual.
      const reader = await User.findById(socket.userId).select("preferences");
      const receiptsEnabled = normalizePreferences(reader?.preferences).privacy.readReceipts;
      if (receiptsEnabled) {
        io.to(participants[0]).to(participants[1]).emit("message:read", {
          conversationId: conversationId.toString(), messageIds: idStrings, readerId: socket.userId, readAt
        });
      }
      await publishUnreadCount(socket.userId);
      return respond({ ok: true, deletedIds: idStrings });
    } catch (err) {
      console.error("[socket] message:read failed", err);
      return respond({ error: "Could not mark messages as seen." });
    }
  });
});

// ---------------------------------------------------------------------------
// Database + startup
// ---------------------------------------------------------------------------
let memoryServer = null;

async function connectDatabase() {
  const uri = (process.env.MONGODB_URI || "").trim();
  const looksConfigured = uri && !/USER:PASSWORD|YOUR_CLUSTER|YOUR_DATABASE/i.test(uri);

  if (looksConfigured) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    return "MONGODB_URI from environment";
  }

  // Local-dev fallback so `npm run dev` works without a MongoDB server installed.
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = require("mongodb-memory-server"));
  } catch {
    throw new Error(
      "No usable MONGODB_URI configured and the in-memory fallback is unavailable.\n" +
        "     Copy server/.env.example to server/.env, set MONGODB_URI, then retry."
    );
  }

  console.warn("[warn] No usable MONGODB_URI found - starting a temporary in-memory MongoDB (data is not persisted).");
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri("personal_messenger"), { serverSelectionTimeoutMS: 15000 });
  return "in-memory MongoDB (dev fallback)";
}

async function shutdown(signal) {
  console.log(`\n[api] received ${signal}, shutting down...`);
  io.close();
  await mongoose.connection.close().catch(() => {});
  if (memoryServer) await memoryServer.stop().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

async function start() {
  try {
    const source = await connectDatabase();
    console.log(`[db] connected using ${source}`);
  } catch (err) {
    console.error("[db] failed to connect:", err.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`[api] listening on http://127.0.0.1:${PORT}`);
    console.log(`[api] allowed client origin(s): ${[...ALLOWED_ORIGINS].join(", ")}`);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();

