import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { MessageCircle, Minus, X, Send, Search, Plus, LogOut, Pin, UserRound, ArrowLeft, Circle } from "lucide-react";

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
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [error, setError] = useState("");
  const [chatVisible, setChatVisible] = useState(!window.desktop);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const activeRef = useRef(active);
  const visibleRef = useRef(chatVisible);
  const readRequestRef = useRef("");

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { visibleRef.current = chatVisible; }, [chatVisible]);

  useEffect(() => { window.desktop?.setAlwaysOnTop(true); }, []);
  useEffect(() => {
    if (!window.desktop?.onChatVisibility) return;
    return window.desktop.onChatVisibility(setChatVisible);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!token || !me) return;
    request("/api/users", token).then(d => setContacts(d.users || [])).catch(e => setError(e.message));
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
    });
    socket.on("disconnect", reason => {
      console.log("[Socket] Disconnected:", reason);
      setStatus("Reconnecting…");
    });
    socket.on("connect_error", err => {
      console.error("[Socket] Connection error:", err.message);
      setStatus("Offline");
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
        // The main process only displays a Windows notification when the chat is hidden.
        if (!visibleRef.current || !isCurrentConversation) {
          window.desktop?.notifyIncoming(msg.body || "You received a new message.");
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
    socket.on("message:deleted", payload => {
      if (payload?.conversationId !== activeRef.current?.conversationId) return;
      const ids = new Set(payload.messageIds || []);
      setMessages(prev => prev.filter(message => !ids.has(message._id)));
    });
    return () => {
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
  }, [token, me, active?.conversationId, chatVisible, messages]);

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
      setMessages(data.messages || []);
    } catch (e) { setError(e.message); }
  }
  async function sendMessage(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    setDraft("");
    socketRef.current?.emit("message:send", { conversationId: active.conversationId, body }, result => {
      if (result?.error) { setError(result.error); setDraft(body); }
    });
  }
  const filtered = contacts.filter(c => `${c.username} ${c.displayName || ""}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="app-shell">
    <header className="titlebar">
      <div className="brand-mark"><MessageCircle size={16} /></div>
      <div className="brand-title">pocket<span>chat</span><small>{me ? status : "PERSONAL MESSENGER"}</small></div>
      <div className="drag-space" />
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
          <div className="avatar">{(active.displayName || active.username).slice(0,1).toUpperCase()}</div>
          <div className="contact-meta"><strong>{active.displayName || active.username}</strong><small>@{active.username}</small></div>
          <div className="online-dot" title={status}/>
        </div>
        <div className="messages">
          {messages.length===0 && <div className="empty-chat"><div className="empty-icon"><MessageCircle size={22}/></div><strong>Say hello 👋</strong><span>Your conversation starts here.</span></div>}
          {messages.map((m,i)=><div key={m._id || `${m.createdAt}-${i}`} className={`message ${m.senderId===me.id ? "mine" : "theirs"}`}><div className="bubble">{m.body}</div><time>{new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}{m.senderId===me.id && m.readAt ? " · Seen" : ""}</time></div>)}
          <div ref={bottomRef}/>
        </div>
        {error && <div className="inline-error">{error}<button onClick={()=>setError("")}>×</button></div>}
        <form className="composer" onSubmit={sendMessage}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000}/><button className="send-btn" disabled={!draft.trim()} aria-label="Send message"><Send size={16}/></button></form>
      </section> : <section className="contacts-view">
        <div className="welcome-row"><div><p className="eyebrow">YOUR PEOPLE</p><h2>Messages<span>.</span></h2></div><button className="icon-btn logout" title="Sign out" onClick={logout}><LogOut size={16}/></button></div>
        <div className="me-card"><div className="avatar own"><UserRound size={17}/></div><div className="contact-meta"><strong>{me.displayName || me.username}</strong><small>@{me.username}</small></div><span className="you-badge">YOU</span></div>
        <div className="searchbox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a person…"/></div>
        <div className="section-label">PEOPLE <span>{filtered.length}</span></div>
        <div className="contact-list">
          {filtered.map(c=><button key={c._id} className="contact-row" onClick={()=>openChat(c)}><div className="avatar">{(c.displayName||c.username).slice(0,1).toUpperCase()}</div><div className="contact-meta"><strong>{c.displayName||c.username}</strong><small>@{c.username}</small></div><Plus size={15} className="open-arrow"/></button>)}
          {filtered.length===0 && <div className="empty-people"><UserRound size={22}/><strong>No people yet</strong><span>Create another account on a second device/server to start a conversation.</span></div>}
        </div>
        {error && <div className="inline-error">{error}<button onClick={()=>setError("")}>×</button></div>}
        <div className="footer-note"><Circle size={7} fill="currentColor"/> PRIVATE SPACE · REAL-TIME CHAT</div>
      </section>}
    </>}
  </div>;
}
