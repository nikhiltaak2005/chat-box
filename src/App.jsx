import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import EmojiPicker from "emoji-picker-react";
import SettingsCenter, { DEFAULT_DEVICE_PREFERENCES, DEFAULT_PREFERENCES } from "./SettingsCenter.jsx";
import { MessageCircle, Minus, X, Send, Search, Plus, LogOut, Pin, UserRound, ArrowLeft, Circle, Camera, Reply, Copy, UserCog, Settings, Download, RefreshCw, CheckCircle2, Trash2 } from "lucide-react";

const DEFAULT_SERVER = "http://localhost:4000";
const API = (import.meta.env.VITE_API_URL || DEFAULT_SERVER).replace(/\/$/, "");
const tokenKey = "pm_token";
const userKey = "pm_user";

async function request(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || "");
  const [me, setMe] = useState(() => { try { return JSON.parse(localStorage.getItem(userKey) || "null"); } catch { return null; } });
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendUsername, setFriendUsername] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [error, setError] = useState("");
  const [chatVisible, setChatVisible] = useState(!window.desktop);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(me?.displayName || "");
  const [profileUsername, setProfileUsername] = useState(me?.username || "");
  const [profileAvatar, setProfileAvatar] = useState(me?.avatarData || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [settingsCenterOpen, setSettingsCenterOpen] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [devicePreferences, setDevicePreferences] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem("pm_device_preferences") || "null"); return { ...DEFAULT_DEVICE_PREFERENCES, ...(saved || {}), pet: { ...DEFAULT_DEVICE_PREFERENCES.pet, ...(saved?.pet || {}) } }; }
    catch { return DEFAULT_DEVICE_PREFERENCES; }
  });
  const preferencesRef = useRef(preferences);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState({ status: "idle", message: "Check for updates", version: "", percent: 0 });
  const [updateBusy, setUpdateBusy] = useState(false);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const activeRef = useRef(active);
  const visibleRef = useRef(chatVisible);
  const readRequestRef = useRef("");

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { visibleRef.current = chatVisible; }, [chatVisible]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => {
    localStorage.setItem("pm_device_preferences", JSON.stringify(devicePreferences));
    window.desktop?.setPetSettings?.(devicePreferences.pet);
    window.desktop?.setLaunchAtStartup?.(devicePreferences.launchAtStartup);
  }, [devicePreferences]);

  useEffect(() => { window.desktop?.setAlwaysOnTop(true); }, []);
  useEffect(() => {
    if (!window.desktop?.getUpdateStatus) return;
    window.desktop.getUpdateStatus().then(setUpdateInfo).catch(() => {});
    return window.desktop.onUpdateStatus?.(setUpdateInfo);
  }, []);
  useEffect(() => {
    if (!window.desktop?.onChatVisibility) return;
    return window.desktop.onChatVisibility(setChatVisible);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!token || !me) return;
    request("/api/preferences", token).then(data => setPreferences(data.preferences || DEFAULT_PREFERENCES)).catch(e => setError(e.message));
  }, [token, me]);

  async function savePreferences(next, nextDevicePreferences) {
    const data = await request("/api/preferences", token, { method: "PATCH", body: JSON.stringify(next) });
    setPreferences(data.preferences || next);
    if (nextDevicePreferences) setDevicePreferences(nextDevicePreferences);
  }

  function isQuietNow(settings) {
    if (!settings?.quietHoursEnabled) return false;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const toMinutes = value => { const [h, m] = String(value || "00:00").split(":").map(Number); return h * 60 + m; };
    const start = toMinutes(settings.quietStart), end = toMinutes(settings.quietEnd);
    return start === end ? true : start < end ? current >= start && current < end : current >= start || current < end;
  }

  useEffect(() => {
    if (!token || !me) return;
    const refreshPeople = async () => {
      try {
        const [people, friends] = await Promise.all([
          request("/api/users", token),
          request("/api/friends", token)
        ]);
        setContacts(people.users || []);
        setFriendRequests(friends.requests || []);
      } catch (e) {
        setError(e.message);
      }
    };
    refreshPeople();
    // Keep incoming friend requests and accepted friends in sync even when
    // the other person sends a request while this window is already open.
    const peopleRefresh = setInterval(refreshPeople, 5000);
    const socket = io(API, {
      auth: { token },
      // Start with polling because some hosting proxies reject WebSocket upgrades.
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);
      setStatus("Online");
      socket.emit("presence:sync");
    });
    socket.on("disconnect", reason => {
      console.log("[Socket] Disconnected:", reason);
      setStatus("Reconnecting…");
    });
    socket.on("connect_error", err => {
      console.error("[Socket] Connection error:", err.message);
      setStatus("Offline");
    });
    socket.on("presence:initial", payload => setOnlineUserIds(payload?.onlineUserIds || []));
    socket.on("presence:changed", payload => {
      if (!payload?.userId) return;
      setOnlineUserIds(prev => payload.online ? (prev.includes(payload.userId) ? prev : [...prev, payload.userId]) : prev.filter(id => id !== payload.userId));
    });
    socket.on("unread:count", count => {
      window.desktop?.setUnreadCount(count);
    });
    socket.on("message:new", msg => {
      const current = activeRef.current;
      const isCurrentConversation = current && msg.conversationId === current.conversationId;
      if (isCurrentConversation) setMessages(prev => {
        if (prev.some(existing => existing._id === msg._id)) return prev;
        return [...prev, msg];
      });
      if (msg.senderId !== me.id) {
        // Notifications never mark a message as read. Preferences are account-synced.
        if ((!visibleRef.current || !isCurrentConversation) && preferencesRef.current.notifications.enabled && !isQuietNow(preferencesRef.current.notifications)) {
          const preview = preferencesRef.current.notifications.preview === "full" ? (msg.body || "You received a new message.") : preferencesRef.current.notifications.preview === "sender" ? ("New message from " + (activeRef.current?.username || "a contact")) : "You received a new message.";
          window.desktop?.notifyIncoming(preview, { sound: preferencesRef.current.notifications.sound });
        }
      }
      setContacts(prev => {
        const found = prev.find(person => person._id === msg.senderId || person._id === msg.recipientId);
        if (!found) request("/api/users", token).then(d => setContacts(d.users || [])).catch(() => {});
        return prev;
      });
    });
    socket.on("message:read", payload => {
      if (payload?.conversationId !== activeRef.current?.conversationId) return;
      const ids = new Set(payload.messageIds || []);
      setMessages(prev => prev.map(message => ids.has(message._id) ? { ...message, readAt: payload.readAt } : message));
    });
    socket.on("message:hidden", payload => {
      if (payload?.conversationId !== activeRef.current?.conversationId) return;
      const ids = new Set(payload.messageIds || []);
      setMessages(prev => prev.filter(message => !ids.has(message._id)));
    });
    socket.on("message:deleted", payload => {
      if (payload?.conversationId !== activeRef.current?.conversationId) return;
      const ids = new Set(payload.messageIds || []);
      setMessages(prev => prev.filter(message => !ids.has(message._id)));
    });
    return () => {
      clearInterval(peopleRefresh);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, me]);

  useEffect(() => {
    const conversationId = active?.conversationId;
    const socket = socketRef.current;
    if (!token || !conversationId || !chatVisible || !socket?.connected) return;
    const key = conversationId + ":" + messages.filter(message => message.senderId !== me?.id && !message.readAt).map(message => message._id).join(",");
    if (readRequestRef.current === key) return;
    readRequestRef.current = key;
    socket.emit("message:read", { conversationId }, result => {
      if (result?.error) console.error("[Socket] Could not mark messages read:", result.error);
    });
  }, [token, me, active?.conversationId, chatVisible, messages, status]);

  async function openAdmin() {
    setError("");
    try { const data = await request("/api/admin/users", token); setAdminUsers(data.users || []); setAdminOpen(true); }
    catch (e) { setError(e.message); }
  }
  async function adminDeleteUser(id, username) {
    if (!window.confirm("Permanently delete " + username + " and their conversations?")) return;
    try { await request("/api/admin/users/" + id, token, { method: "DELETE" }); setAdminUsers(prev => prev.filter(u => u.id !== id)); }
    catch (e) { setError(e.message); }
  }
  async function adminDisableUser(id, isDisabled) {
    try { await request("/api/admin/users/" + id, token, { method: "PATCH", body: JSON.stringify({ isDisabled: !isDisabled }) }); setAdminUsers(prev => prev.map(u => u.id === id ? { ...u, isDisabled: !isDisabled } : u)); }
    catch (e) { setError(e.message); }
  }

  async function requestFriendForPerson(targetUsername) {
    setError("");
    try {
      await request("/api/friends/request", token, { method: "POST", body: JSON.stringify({ username: targetUsername }) });
      const data = await request("/api/friends", token);
      setFriendRequests(data.requests || []);
      setError("Friend request sent to @" + targetUsername + ".");
    } catch (e) { setError(e.message); }
  }
  async function sendFriendRequest(e) {
    e.preventDefault();
    const targetUsername = friendUsername.trim();
    if (!targetUsername) return;
    await requestFriendForPerson(targetUsername);
    setFriendUsername("");
  }
  async function answerFriendRequest(id, action) {
    setError("");
    try {
      await request("/api/friends/" + id, token, { method: "PATCH", body: JSON.stringify({ action }) });
      const data = await request("/api/friends", token); setFriendRequests(data.requests || []);
      const friends = await request("/api/users", token); setContacts(friends.users || []);
    } catch (e) { setError(e.message); }
  }

  function startProfileEdit() {
    setProfileName(me?.displayName || ""); setProfileUsername(me?.username || ""); setProfileAvatar(me?.avatarData || ""); setError(""); setProfileOpen(true);
  }
  async function saveProfile(e) {
    e.preventDefault(); setProfileSaving(true); setError("");
    try {
      const data = await request("/api/profile", token, { method: "PATCH", body: JSON.stringify({ displayName: profileName, username: profileUsername, avatarData: profileAvatar }) });
      localStorage.setItem(userKey, JSON.stringify(data.user)); setMe(data.user);
      setContacts(prev => prev.map(person => person._id === data.user.id ? { ...person, username: data.user.username, displayName: data.user.displayName, avatarData: data.user.avatarData } : person));
      setProfileOpen(false);
    } catch (e) { setError(e.message); } finally { setProfileSaving(false); }
  }
  function handleAvatarFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > 1024 * 1024) { setError("Profile photo must be under 1 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setProfileAvatar(String(reader.result || "")); reader.onerror = () => setError("Could not read this image."); reader.readAsDataURL(file);
  }

  async function submitAuth(e) {
    e.preventDefault(); setAuthError("");
    try {
      const data = await request(`/api/auth/${authMode}`, "", { method: "POST", body: JSON.stringify({ username, password, displayName }) });
      localStorage.setItem(tokenKey, data.token); localStorage.setItem(userKey, JSON.stringify(data.user));
      setToken(data.token); setMe(data.user);
    } catch (e) { setAuthError(e.message); }
  }
  function logout() {
    localStorage.removeItem(tokenKey); localStorage.removeItem(userKey);
    setToken(""); setMe(null); setActive(null); setMessages([]); setContacts([]); readRequestRef.current = "";
  }
  async function openChat(person) {
    setError("");
    try {
      const data = await request(`/api/conversations/${person._id}`, token);
      readRequestRef.current = "";
      setActive({ ...person, conversationId: data.conversation._id });
      setMessages(data.messages || []); setReplyTo(null);
    } catch (e) { setError(e.message); }
  }
  async function runUpdateAction() {
    if (!window.desktop) { setUpdateInfo({ status: "dev", message: "Updates are available in the installed Windows app." }); return; }
    setUpdateBusy(true);
    try {
      let next;
      if (updateInfo.status === "downloaded") {
        await window.desktop.installUpdate();
        return;
      } else if (updateInfo.status === "available") {
        next = await window.desktop.downloadUpdate();
      } else {
        next = await window.desktop.checkForUpdates();
      }
      if (next) setUpdateInfo(next);
    } catch (e) {
      setUpdateInfo({ status: "error", message: e.message || "Update action failed" });
    } finally { setUpdateBusy(false); }
  }

  async function deleteMessage(message, scope) {
    if (!message?._id) return;
    if (scope === "everyone" && !window.confirm("Delete this message for everyone? This cannot be undone.")) return;
    socketRef.current?.emit("message:delete", { messageId: message._id, scope }, result => {
      if (result?.error) setError(result.error);
    });
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    const replyMessageId = replyTo?._id || null;
    setDraft(""); setReplyTo(null);
    socketRef.current?.emit("message:send", { conversationId: active.conversationId, body, replyTo: replyMessageId }, result => {
      if (result?.error) { setError(result.error); setDraft(body); }
    });
  }
  const filtered = contacts.filter(c => `${c.username} ${c.displayName || ""}`.toLowerCase().includes(query.toLowerCase()));

  return <div className={`app-shell theme-${preferences.appearance.theme} density-${preferences.appearance.density} bubbles-${preferences.appearance.bubbleStyle}`} style={{ "--accent": preferences.appearance.accentColor, "--font-scale": preferences.appearance.fontScale }}>
    <header className="titlebar">
      <div className="brand-mark"><MessageCircle size={16} /></div>
      <div className="brand-title">pocket<span>chat</span><small>{me ? status : "PERSONAL MESSENGER"}</small></div>
      <div className="drag-space" />
      <button className="icon-btn" title="Software updates" onClick={()=>setUpdateOpen(true)}><Download size={14}/></button>
      <button className={`icon-btn pin ${alwaysOnTop ? "selected" : ""}`} title="Toggle always on top" onClick={() => { const n = !alwaysOnTop; setAlwaysOnTop(n); window.desktop?.setAlwaysOnTop(n); }}><Pin size={14}/></button>
      <button className="icon-btn" title="Minimize" onClick={() => window.desktop?.minimize()}><Minus size={16}/></button>
      <button className="icon-btn close" title="Hide window" onClick={() => window.desktop?.hide()}><X size={16}/></button>
    </header>

    {!token || !me ? <main className="auth-view">
      <div className="hero-icon"><MessageCircle size={28}/></div>
      <p className="eyebrow">YOUR SMALL SPACE TO TALK</p>
      <h1>{authMode === "login" ? "Welcome back." : "Make it personal."}</h1>
      <p className="muted">{authMode === "login" ? "Sign in to pick up your conversations." : "Create an account to start chatting."}</p>
      <form onSubmit={submitAuth} className="auth-form">
        {authMode === "register" && <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="How people see you" maxLength={40}/></label>}
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. nikhil_01" autoComplete="username" minLength={3} maxLength={24} required/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode==="login"?"current-password":"new-password"} minLength={8} required/></label>
        {authError && <div className="error-text">{authError}</div>}
        <button className="primary-btn" type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="text-btn" onClick={()=>{setAuthMode(authMode==="login"?"register":"login");setAuthError("");}}>{authMode==="login"?"New here? Create an account":"Already have an account? Sign in"}</button>
      <div className="local-note">Internet chat works once your own backend is configured and running.</div>
    </main> : <>
      {active ? <section className="chat-view">
        <div className="chat-header">
          <button className="icon-btn back" onClick={()=>setActive(null)}><ArrowLeft size={17}/></button>
          <div className="avatar">{active.avatarData ? <img src={active.avatarData} alt=""/> : (active.displayName || active.username).slice(0,1).toUpperCase()}</div>
          <div className="contact-meta"><strong>{active.displayName || active.username}</strong><small>@{active.username}</small></div>
          <button className="icon-btn" title="Settings" onClick={()=>setSettingsCenterOpen(true)}><Settings size={15}/></button>
          <div className="online-dot" title={status}/>
        </div>
        <div className="messages">
          {messages.length===0 && <div className="empty-chat"><div className="empty-icon"><MessageCircle size={22}/></div><strong>Say hello 👋</strong><span>Your conversation starts here.</span></div>}
          {messages.map((m,i)=><div key={m._id || i} className={"message " + (m.senderId===me.id ? "mine" : "theirs")}><div className="bubble">{m.replyTo && <div className="quoted-message">{messages.find(original=>original._id===m.replyTo)?.body || "Original message unavailable"}</div>}{m.body}</div><div className="message-actions"><button type="button" title="Reply" onClick={()=>setReplyTo(m)}><Reply size={12}/></button><button type="button" title="Copy" onClick={()=>navigator.clipboard?.writeText(m.body)}><Copy size={12}/></button><button type="button" title="Delete for me" onClick={()=>deleteMessage(m,"me")}><Trash2 size={12}/></button>{m.senderId===me.id && <button type="button" title="Delete for everyone" onClick={()=>deleteMessage(m,"everyone")}><X size={12}/></button>}</div><time>{new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}{m.senderId===me.id && m.readAt ? " · Seen" : ""}</time></div>)}
          <div ref={bottomRef}/>
        </div>
        {error && <div className="inline-error">{error}<button onClick={()=>setError("")}>×</button></div>}
        {replyTo && <div className="reply-preview"><div><strong>Replying to message</strong><span>{replyTo.body}</span></div><button type="button" onClick={()=>setReplyTo(null)}><X size={15}/></button></div>}{emojiOpen && <div className="emoji-picker-popover"><EmojiPicker onEmojiClick={emojiData=>setDraft(d=>d+emojiData.emoji)} width="100%" height={340} theme={preferences.appearance.theme === "light" ? "light" : "dark"} lazyLoadEmojis searchPlaceHolder="Search all emojis…" previewConfig={{showPreview:false}} /></div>}<form className="composer" onSubmit={sendMessage}><button type="button" className="icon-btn" title="Emoji" onClick={()=>setEmojiOpen(v=>!v)}>😊</button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={replyTo ? "Write a reply…" : "Write a message…"} maxLength={4000}/><button className="send-btn" disabled={!draft.trim()} aria-label="Send message"><Send size={16}/></button></form>
      </section> : <section className="contacts-view">
        <div className="welcome-row"><div><p className="eyebrow">YOUR PEOPLE</p><h2>Messages<span>.</span></h2></div><button className="icon-btn logout" title="Settings" onClick={()=>setSettingsCenterOpen(true)}><Settings size={16}/></button><button className="icon-btn logout" title="Admin panel" onClick={openAdmin}>A</button><button className="icon-btn logout" title="Sign out" onClick={logout}><LogOut size={16}/></button></div>
        <button className="me-card profile-button" onClick={startProfileEdit} title="Edit your profile"><div className="avatar own">{me.avatarData ? <img src={me.avatarData} alt=""/> : <UserRound size={17}/>}</div><div className="contact-meta"><strong>{me.displayName || me.username}</strong><small>@{me.username}</small></div><span className="you-badge">EDIT PROFILE</span><UserCog size={15}/></button>
        <form className="searchbox" onSubmit={sendFriendRequest}><Search size={15}/><input value={friendUsername} onChange={e=>setFriendUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="Add by exact username…" minLength={3} maxLength={24}/><button className="icon-btn" type="submit" title="Send friend request"><Plus size={15}/></button></form>
        {friendRequests.some(r=>r.status==="pending" && r.recipientId===me.id) && <><div className="section-label">INCOMING REQUESTS <span>{friendRequests.filter(r=>r.status==="pending" && r.recipientId===me.id).length}</span></div><div className="contact-list request-list">{friendRequests.filter(r=>r.status==="pending" && r.recipientId===me.id).map(r=><div className="contact-row" key={r.id}><div className="contact-meta"><strong>{r.person.displayName||r.person.username}</strong><small>@{r.person.username} wants to connect</small></div><button className="primary-btn" onClick={()=>answerFriendRequest(r.id,"accept")}>Accept</button><button className="icon-btn" onClick={()=>answerFriendRequest(r.id,"reject")} title="Reject request">×</button></div>)}</div></>}
        {friendRequests.some(r=>r.status==="pending" && r.senderId===me.id) && <><div className="section-label">SENT REQUESTS <span>{friendRequests.filter(r=>r.status==="pending" && r.senderId===me.id).length}</span></div><div className="contact-list request-list">{friendRequests.filter(r=>r.status==="pending" && r.senderId===me.id).map(r=><div className="contact-row" key={r.id}><div className="contact-meta"><strong>{r.person.displayName||r.person.username}</strong><small>@{r.person.username} · Waiting for acceptance</small></div><span className="request-pending">Pending</span></div>)}</div></>}
        <div className="section-label">PEOPLE <span>{filtered.length}</span></div>
        <div className="contact-list">
          {filtered.map(c=>{const pending=friendRequests.find(r=>r.status==="pending" && ((r.senderId===me.id && r.person.username===c.username)||(r.recipientId===me.id && r.person.username===c.username)));return <button key={c._id} className="contact-row" onClick={()=>c.isFriend ? openChat(c) : pending ? (pending.recipientId===me.id ? answerFriendRequest(pending.id,"accept") : setError("Friend request already sent. Waiting for @"+c.username+" to accept.")) : requestFriendForPerson(c.username)}><div className="avatar">{c.avatarData ? <img src={c.avatarData} alt=""/> : (c.displayName||c.username).slice(0,1).toUpperCase()}</div><div className="contact-meta"><strong>{c.displayName||c.username}</strong><small>@{c.username} · {c.isFriend ? (onlineUserIds.includes(c._id) ? "Online" : c.lastSeenAt ? ("Last seen " + new Date(c.lastSeenAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })) : "Offline") : pending ? (pending.recipientId===me.id ? "Accept incoming request" : "Request sent · waiting") : "Add friend"}</small></div>{c.isFriend ? <MessageCircle size={15} className="open-arrow"/> : pending ? <span className="request-pending">{pending.recipientId===me.id ? "Accept" : "Sent"}</span> : <Plus size={15} className="open-arrow"/>}</button>})}
          {filtered.length===0 && <div className="empty-people"><UserRound size={22}/><strong>No people yet</strong><span>Create another account on a second device/server to start a conversation.</span></div>}
        </div>
        {error && <div className="inline-error">{error}<button onClick={()=>setError("")}>×</button></div>}
        <div className="footer-note"><Circle size={7} fill="currentColor"/> PRIVATE SPACE · REAL-TIME CHAT</div>
      </section>}
    </>}
    {adminOpen && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false);}}><section className="profile-dialog admin-dialog"><div className="profile-heading"><div><p className="eyebrow">OWNER CONTROLS</p><h2>User management</h2></div><button type="button" className="icon-btn" onClick={()=>setAdminOpen(false)}><X size={17}/></button></div><p className="muted">Disable an account to block access, or permanently delete its account, messages, conversations and friend requests.</p><div className="admin-user-list">{adminUsers.map(u=><div className="admin-user" key={u.id}><div className="contact-meta"><strong>{u.displayName||u.username} {u.role==="admin"?"· ADMIN":""}</strong><small>@{u.username} · {u.isDisabled?"Disabled":"Active"}</small></div>{u.role!=="admin" && <><button className="icon-btn" title={u.isDisabled?"Enable":"Disable"} onClick={()=>adminDisableUser(u.id,u.isDisabled)}>{u.isDisabled?"✓":"⏸"}</button><button className="icon-btn" title="Delete user and chats" onClick={()=>adminDeleteUser(u.id,u.username)}>🗑</button></>}</div>)}</div><div className="profile-actions"><button type="button" className="text-btn" onClick={()=>request("/api/admin/storage/expired",token,{method:"DELETE"}).then(d=>setError("Expired messages cleaned: "+d.deletedMessages)).catch(e=>setError(e.message))}>Clean expired messages</button><button type="button" className="primary-btn" onClick={()=>setAdminOpen(false)}>Done</button></div></section></div>}
    {updateOpen && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setUpdateOpen(false);}}><section className="profile-dialog"><div className="profile-heading"><div><p className="eyebrow">POCKETCHAT</p><h2>Software updates</h2></div><button type="button" className="icon-btn" onClick={()=>setUpdateOpen(false)}><X size={17}/></button></div><div className="update-status-icon">{updateInfo.status==="current" ? <CheckCircle2 size={28}/> : updateInfo.status==="downloaded" ? <CheckCircle2 size={28}/> : <Download size={28}/>}</div><strong className="update-status-title">{updateInfo.message || "Check for updates"}</strong>{updateInfo.version && <p className="muted">Version {updateInfo.version}</p>}{updateInfo.status==="downloading" && <div className="update-progress"><span style={{width:`${updateInfo.percent || 0}%`}}/></div>}{updateInfo.status==="error" && <p className="error-text">Please check your internet connection and try again.</p>}<div className="profile-actions"><button type="button" className="text-btn" onClick={()=>setUpdateOpen(false)}>Close</button><button type="button" className="primary-btn" disabled={updateBusy || ["checking","downloading","current","dev"].includes(updateInfo.status)} onClick={runUpdateAction}>{updateBusy ? "Please wait…" : updateInfo.status==="downloaded" ? "Install and restart" : updateInfo.status==="available" ? "Download update" : updateInfo.status==="downloading" ? "Downloading…" : updateInfo.status==="current" ? "Up to date" : updateInfo.status==="dev" ? "Installed app only" : "Check for updates"}</button></div>{updateInfo.status==="current" && <button type="button" className="text-btn" onClick={runUpdateAction}>Check again</button>}{updateInfo.status==="dev" && <p className="muted">The update service works in the installed app, not in the development window.</p>}</section></div>}
    {settingsCenterOpen && <SettingsCenter value={preferences} devicePreferences={devicePreferences} onSave={savePreferences} onClose={()=>setSettingsCenterOpen(false)} />}
    {profileOpen && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setProfileOpen(false);}}><form className="profile-dialog" onSubmit={saveProfile}><div className="profile-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><h2>Edit profile</h2></div><button type="button" className="icon-btn" onClick={()=>setProfileOpen(false)}><X size={17}/></button></div><label className="avatar-picker">{profileAvatar ? <img src={profileAvatar} alt="Profile preview"/> : <UserRound size={30}/>}<span><Camera size={13}/> Change photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatarFile}/></span></label><label>Display name<input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Your name" maxLength={40}/></label><label>Username<input value={profileUsername} onChange={e=>setProfileUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="username" minLength={3} maxLength={24} required/><small>3–24 letters, numbers or underscore</small></label>{error && <div className="error-text">{error}</div>}<div className="profile-actions"><button type="button" className="text-btn" onClick={()=>setProfileOpen(false)}>Cancel</button><button className="primary-btn" type="submit" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save changes"}</button></div></form></div>}
  </div>;
}
