import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import EmojiPicker from "emoji-picker-react";
import MediaPicker from "./MediaPicker.jsx";
import SettingsCenter, { DEFAULT_DEVICE_PREFERENCES, DEFAULT_PREFERENCES } from "./SettingsCenter.jsx";
import { MessageCircle, Minus, X, Send, Search, Plus, LogOut, Pin, UserRound, ArrowLeft, Circle, Camera, Reply, Copy, UserCog, Settings, Download, RefreshCw, CheckCircle2, Trash2, Image as ImageIcon, LockKeyhole, Bell, BellOff, ShieldCheck, LayoutDashboard, Users, Flag, Layers, ScrollText, Megaphone, Activity, Ban, UserCheck } from "lucide-react";

const DEFAULT_SERVER = import.meta.env.DEV ? "http://localhost:4000" : "https://chat-box-ryz8.onrender.com";
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
  const [groups, setGroups] = useState([]);
  const [homeTab, setHomeTab] = useState("chats");
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupAvatar, setGroupAvatar] = useState("");
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupMemberToAdd, setGroupMemberToAdd] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const friendRequestsRef = useRef(friendRequests);
  const peopleLoadedRef = useRef(false);
  const [friendUsername, setFriendUsername] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminTab, setAdminTab] = useState("overview");
  const [adminStats, setAdminStats] = useState({});
  const [adminGroups, setAdminGroups] = useState([]);
  const [adminReports, setAdminReports] = useState([]);
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminConfig, setAdminConfig] = useState({ maintenanceMode:false, announcement:"", announcementEnabled:false, minimumVersion:"0.3.0" });
  const [adminBusy, setAdminBusy] = useState(false);
  const [globalConfig, setGlobalConfig] = useState({ maintenanceMode:false, announcement:"", announcementEnabled:false });
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
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
  const [appLocked, setAppLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const lockInitializedRef = useRef(false);
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
  useEffect(() => { friendRequestsRef.current = friendRequests; }, [friendRequests]);
  useEffect(() => {
    localStorage.setItem("pm_device_preferences", JSON.stringify(devicePreferences));
    window.desktop?.setPetSettings?.(devicePreferences.pet);
    window.desktop?.setLaunchAtStartup?.(devicePreferences.launchAtStartup);
  }, [devicePreferences]);

  useEffect(() => { window.desktop?.setAlwaysOnTop(alwaysOnTop); }, [alwaysOnTop]);
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

  useEffect(() => { if (!token) { setGlobalConfig({ maintenanceMode:false, announcement:"", announcementEnabled:false }); return; } request("/api/app-config", token).then(setGlobalConfig).catch(() => {}); }, [token, me]);\n\n  async function toggleContactMute(personId) {
    const current = preferencesRef.current;
    const muted = new Set(current.notifications.mutedContacts || []);
    if (muted.has(personId)) muted.delete(personId); else muted.add(personId);
    await savePreferences({ ...current, notifications: { ...current.notifications, mutedContacts: [...muted] } });
  }

  async function revokeAllSessions() {
    await request("/api/sessions/revoke-all", token, { method: "POST" });
    logout();
  }

  async function deleteAccount(password) {
    await request("/api/account", token, { method: "DELETE", body: JSON.stringify({ password }) });
    logout();
  }

  async function savePreferences(next, nextDevicePreferences) {
    const data = await request("/api/preferences", token, { method: "PATCH", body: JSON.stringify(next) });
    setPreferences(data.preferences || next);
    if (nextDevicePreferences) {
      if (!devicePreferences.appLockEnabled && nextDevicePreferences.appLockEnabled) setAppLocked(true);
      setDevicePreferences(nextDevicePreferences);
    }
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
    if (!token || !me) { lockInitializedRef.current = false; setAppLocked(false); return; }
    if (!lockInitializedRef.current) {
      if (devicePreferences.appLockEnabled) setAppLocked(true);
      lockInitializedRef.current = true;
    }
  }, [token, me, devicePreferences.appLockEnabled]);

  useEffect(() => {
    if (!token || !me || !devicePreferences.appLockEnabled || appLocked) return;
    let timer;
    const scheduleLock = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setAppLocked(true), Number(devicePreferences.appLockTimeoutMinutes || 5) * 60 * 1000);
    };
    const events = ["pointerdown", "keydown", "mousemove", "touchstart"];
    events.forEach(event => window.addEventListener(event, scheduleLock, { passive: true }));
    scheduleLock();
    return () => {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, scheduleLock));
    };
  }, [token, me, devicePreferences.appLockEnabled, devicePreferences.appLockTimeoutMinutes, appLocked]);

  async function unlockApp(event) {
    event.preventDefault();
    setUnlockError("");
    setUnlockBusy(true);
    try {
      const data = await request("/api/auth/login", "", { method: "POST", body: JSON.stringify({ username: me.username, password: unlockPassword }) });
      localStorage.setItem(tokenKey, data.token);
      setToken(data.token);
      setUnlockPassword("");
      setAppLocked(false);
    } catch (err) {
      setUnlockError("Password didn't match. Try again.");
    } finally {
      setUnlockBusy(false);
    }
  }

  useEffect(() => {
    if (!token || !me) return;
    peopleLoadedRef.current = false;
    const refreshPeople = async () => {
      try {
        const friends = await request("/api/friends", token);
        const nextRequests = friends.requests || [];
        const groupData = await request("/api/groups", token);
        setGroups(groupData.groups || []);
        setContacts(nextRequests.filter(item => item.status === "accepted").map(item => ({ ...item.person, isFriend: true })));
        const existingIds = new Set(friendRequestsRef.current.map(request => request.id));
        const newIncoming = nextRequests.filter(request => request.status === "pending" && request.recipientId === me.id && !existingIds.has(request.id));
        if (peopleLoadedRef.current && newIncoming.length && !visibleRef.current && preferencesRef.current.notifications.enabled && preferencesRef.current.notifications.friendRequests && !newIncoming.some(request => (preferencesRef.current.notifications.mutedContacts || []).includes(request.senderId)) && !isQuietNow(preferencesRef.current.notifications)) {
          const personName = newIncoming[0].person?.username || "someone";
          window.desktop?.notifyIncoming("New friend request from @" + personName, { sound: preferencesRef.current.notifications.sound });
        }
        setFriendRequests(nextRequests);
        peopleLoadedRef.current = true;
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
    socket.on("group:message:new", msg => {
      if (activeRef.current?.isGroup && activeRef.current.id === msg.groupId) setMessages(prev => prev.some(existing => existing._id === msg._id) ? prev : [...prev, msg]);
      if (msg.senderId !== me.id && (!visibleRef.current || activeRef.current?.id !== msg.groupId) && preferencesRef.current.notifications.enabled && !isQuietNow(preferencesRef.current.notifications)) window.desktop?.notifyIncoming("New message in a group", { sound: preferencesRef.current.notifications.sound });
      setGroups(prev => prev.map(group => group.id === msg.groupId ? { ...group, lastMessage: { body: msg.body || (msg.contentType === "gif" ? "GIF" : "Sticker"), senderId: msg.senderId, createdAt: msg.createdAt } } : group));
    });
    socket.on("group:message:reaction", payload => {
      if (activeRef.current?.isGroup && activeRef.current.id === payload?.groupId) setMessages(prev => prev.map(message => message._id === payload.messageId ? { ...message, reactions: payload.reactions || [] } : message));
    });
    socket.on("group:message:hidden", payload => {
      if (activeRef.current?.isGroup && activeRef.current.id === payload?.groupId) { const ids = new Set(payload.messageIds || []); setMessages(prev => prev.filter(message => !ids.has(message._id))); }
    });
    socket.on("group:message:deleted", payload => {
      if (activeRef.current?.isGroup && activeRef.current.id === payload?.groupId) { const ids = new Set(payload.messageIds || []); setMessages(prev => prev.filter(message => !ids.has(message._id))); }
    });
    socket.on("group:updated", payload => {
      request("/api/groups", token).then(data => {
        setGroups(data.groups || []);
        const fresh = (data.groups || []).find(group => group.id === payload?.groupId);
        if (fresh && activeRef.current?.isGroup && activeRef.current.id === payload.groupId) setActive(prev => ({ ...prev, ...fresh, _id: fresh.id, conversationId: fresh.id, isGroup: true }));
      }).catch(() => {});
    });
    socket.on("group:deleted", payload => {
      setGroups(prev => prev.filter(group => group.id !== payload?.groupId));
      if (activeRef.current?.isGroup && activeRef.current.id === payload?.groupId) { setActive(null); setMessages([]); }
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
        if ((!visibleRef.current || !isCurrentConversation) && preferencesRef.current.notifications.enabled && !(preferencesRef.current.notifications.mutedContacts || []).includes(msg.senderId) && !isQuietNow(preferencesRef.current.notifications)) {
          const preview = preferencesRef.current.notifications.preview === "full" ? (msg.body || "You received a new message.") : preferencesRef.current.notifications.preview === "sender" ? "New message from a contact" : "You received a new message.";
          window.desktop?.notifyIncoming(preview, { sound: preferencesRef.current.notifications.sound });
        }
      }
      // Contacts are private: only accepted friends are listed.
    });
    socket.on("message:read", payload => {
      if (payload?.conversationId !== activeRef.current?.conversationId) return;
      const ids = new Set(payload.messageIds || []);
      setMessages(prev => prev.map(message => ids.has(message._id) ? { ...message, readAt: payload.readAt } : message));
    });
    socket.on("message:reaction", payload => {
      if (payload?.conversationId === activeRef.current?.conversationId) {
        setMessages(prev => prev.map(message => message._id === payload.messageId ? { ...message, reactions: payload.reactions || [] } : message));
      }
      const prefs = preferencesRef.current;
      if (payload?.messageSenderId === me.id && payload.actorId !== me.id && prefs.notifications.enabled && prefs.notifications.reactions && !(prefs.notifications.mutedContacts || []).includes(payload.actorId) && (!visibleRef.current || payload.conversationId !== activeRef.current?.conversationId) && !isQuietNow(prefs.notifications)) {
        window.desktop?.notifyIncoming("Someone reacted to your message.", { sound: prefs.notifications.sound });
      }
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
    if (!token || active?.isGroup || !conversationId || !chatVisible || !socket?.connected) return;
    const key = conversationId + ":" + messages.filter(message => message.senderId !== me?.id && !message.readAt).map(message => message._id).join(",");
    if (readRequestRef.current === key) return;
    readRequestRef.current = key;
    socket.emit("message:read", { conversationId }, result => {
      if (result?.error) console.error("[Socket] Could not mark messages read:", result.error);
    });
  }, [token, me, active?.conversationId, chatVisible, messages, status]);

  async function loadAdminData(tab = adminTab) {
    setAdminBusy(true);
    try {
      const [overview, users] = await Promise.all([request("/api/admin/overview", token), request("/api/admin/users?search="+encodeURIComponent(adminSearch), token)]);
      setAdminStats(overview.stats||{}); setAdminConfig(overview.config||adminConfig); setAdminUsers(users.users||[]);
      if(tab==="overview"||tab==="groups") setAdminGroups((await request("/api/admin/groups",token)).groups||[]);
      if(tab==="overview"||tab==="reports") setAdminReports((await request("/api/admin/reports",token)).reports||[]);
      if(tab==="audit") setAdminLogs((await request("/api/admin/audit",token)).logs||[]);
    } catch(e){setError(e.message);} finally{setAdminBusy(false);}
  }
  async function openAdmin(){setError("");try{await request("/api/admin/overview",token);setAdminOpen(true);setAdminTab("overview");await loadAdminData("overview");}catch(e){setError(e.message);}}
  async function adminDeleteUser(id,username){if(!window.confirm("Permanently delete "+username+" and their data? This cannot be undone."))return;try{await request("/api/admin/users/"+id,token,{method:"DELETE"});await loadAdminData(adminTab);}catch(e){setError(e.message);}}
  async function adminDisableUser(id,isDisabled){try{await request("/api/admin/users/"+id,token,{method:"PATCH",body:JSON.stringify({isDisabled:!isDisabled})});await loadAdminData(adminTab);}catch(e){setError(e.message);}}
  async function adminSetRole(id,role){try{await request("/api/admin/users/"+id,token,{method:"PATCH",body:JSON.stringify({role})});await loadAdminData(adminTab);}catch(e){setError(e.message);}}
  async function adminDeleteGroup(group){if(!window.confirm("Delete "+group.name+" and all its messages?"))return;try{await request("/api/admin/groups/"+group.id,token,{method:"DELETE"});await loadAdminData("groups");}catch(e){setError(e.message);}}
  async function adminUpdateReport(report,status){try{await request("/api/admin/reports/"+report.id,token,{method:"PATCH",body:JSON.stringify({status,moderatorNote:report.moderatorNote||""})});await loadAdminData("reports");}catch(e){setError(e.message);}}
  async function adminSaveConfig(e){e.preventDefault();try{const d=await request("/api/admin/config",token,{method:"PATCH",body:JSON.stringify(adminConfig)});setAdminConfig(d.config);setError("Admin settings saved.");await loadAdminData(adminTab);}catch(e){setError(e.message);}}


  async function submitReport(targetType,targetId,targetName) {
    const details = window.prompt("Tell us what is wrong with "+targetName+". Please include useful context:");
    if (details === null) return;
    try { await request("/api/reports",token,{method:"POST",body:JSON.stringify({targetType,targetId,reason:"other",details})}); setError("Thanks. Your report was sent to the moderation team."); }
    catch(e){setError(e.message);}
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
      const data = await request("/api/friends", token);
      setFriendRequests(data.requests || []);
      setContacts((data.requests || []).filter(item => item.status === "accepted").map(item => ({ ...item.person, isFriend: true })));
    } catch (e) { setError(e.message); }
  }

  async function removeFriend(person) {
    const friendship = friendRequests.find(item => item.status === "accepted" && item.person?._id === person._id);
    if (!friendship) return;
    if (!window.confirm("Remove @" + person.username + " from your friends?")) return;
    setError("");
    try {
      await request("/api/friends/" + friendship.id, token, { method: "DELETE" });
      const data = await request("/api/friends", token);
      setFriendRequests(data.requests || []);
      setContacts((data.requests || []).filter(item => item.status === "accepted").map(item => ({ ...item.person, isFriend: true })));
      if (active?._id === person._id) { setActive(null); setMessages([]); }
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
  async function refreshGroups() { const data = await request("/api/groups", token); setGroups(data.groups || []); }
  async function openGroup(group) {
    setError("");
    try { const data = await request("/api/groups/" + group.id + "/messages", token); readRequestRef.current = ""; setActive({ ...group, _id: group.id, conversationId: group.id, isGroup: true, username: group.name, displayName: group.name }); setMessages(data.messages || []); setReplyTo(null); }
    catch (e) { setError(e.message); }
  }
  function handleGroupAvatar(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); return; }
    if (file.size > 700 * 1024) { setError("Group photo must be under 700 KB."); return; }
    const reader = new FileReader(); reader.onload = () => setGroupAvatar(String(reader.result || "")); reader.onerror = () => setError("Could not read the group image."); reader.readAsDataURL(file);
  }
  async function createGroup(e) {
    e.preventDefault(); if (groupMembers.length < 2) { setError("Choose at least two friends for your group."); return; }
    setGroupBusy(true); setError("");
    try { const data = await request("/api/groups", token, { method: "POST", body: JSON.stringify({ name: groupName, description: groupDescription, avatarData: groupAvatar, memberIds: groupMembers }) }); await refreshGroups(); setGroupCreateOpen(false); setHomeTab("groups"); setGroupName(""); setGroupDescription(""); setGroupMembers([]); setGroupAvatar(""); await openGroup(data.group); }
    catch (e) { setError(e.message); } finally { setGroupBusy(false); }
  }
  async function saveGroupDetails(e) {
    e.preventDefault(); if (!active?.isGroup || !active.isAdmin) return; setGroupBusy(true); setError("");
    try { const data = await request("/api/groups/" + active.id, token, { method: "PATCH", body: JSON.stringify({ name: groupName || active.name, description: groupDescription, avatarData: groupAvatar || active.avatarData || "" }) }); await refreshGroups(); setActive(prev => ({ ...prev, ...data.group, _id: data.group.id, conversationId: data.group.id, isGroup: true, username: data.group.name, displayName: data.group.name })); setGroupSettingsOpen(false); }
    catch (e) { setError(e.message); } finally { setGroupBusy(false); }
  }
  async function addGroupMember() {
    if (!active?.isGroup || !groupMemberToAdd) return; setGroupBusy(true); setError("");
    try { await request("/api/groups/" + active.id + "/members", token, { method: "POST", body: JSON.stringify({ userId: groupMemberToAdd }) }); setGroupMemberToAdd(""); await refreshGroups(); const fresh = (await request("/api/groups", token)).groups.find(group => group.id === active.id); if (fresh) setActive(prev => ({ ...prev, ...fresh, _id: fresh.id, conversationId: fresh.id, isGroup: true })); }
    catch (e) { setError(e.message); } finally { setGroupBusy(false); }
  }

  async function toggleGroupAdmin(member) {
    if (!active?.isGroup || !active.isAdmin || !member) return;
    setGroupBusy(true); setError("");
    try {
      await request("/api/groups/" + active.id + "/admins", token, { method: "PATCH", body: JSON.stringify({ userId: member.id, action: member.isAdmin ? "demote" : "promote" }) });
      await refreshGroups();
      const fresh = (await request("/api/groups", token)).groups.find(group => group.id === active.id);
      if (fresh) setActive(prev => ({ ...prev, ...fresh, _id: fresh.id, conversationId: fresh.id, isGroup: true }));
    } catch (e) { setError(e.message); } finally { setGroupBusy(false); }
  }
  async function removeGroupMember(userId) {
    if (!active?.isGroup) return; const member = active.members?.find(item => item.id === userId);
    if (!member || !window.confirm(userId === me.id ? "Leave this group?" : "Remove @" + member.username + " from this group?")) return;
    setGroupBusy(true); setError("");
    try { await request("/api/groups/" + active.id + "/members/" + userId, token, { method: "DELETE" }); if (userId === me.id) { setActive(null); setMessages([]); } await refreshGroups(); const fresh = (await request("/api/groups", token)).groups.find(group => group.id === active.id); if (fresh && userId !== me.id) setActive(prev => ({ ...prev, ...fresh, _id: fresh.id, conversationId: fresh.id, isGroup: true })); }
    catch (e) { setError(e.message); } finally { setGroupBusy(false); }
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
    socketRef.current?.emit(active?.isGroup ? "group:message:delete" : "message:delete", { messageId: message._id, scope }, result => {
      if (result?.error) setError(result.error);
    });
  }

  function toggleReaction(message, emoji) {
    socketRef.current?.emit(active?.isGroup ? "group:message:reaction" : "message:reaction", { messageId: message._id, emoji }, result => {
      if (result?.error) setError(result.error);
    });
  }

  function sendMedia(media) {
    if (!active || !preferences.chat.mediaEnabled) return;
    socketRef.current?.emit(active.isGroup ? "group:message:send" : "message:send", active.isGroup ? { groupId: active.id, contentType: media.type, mediaUrl: media.mediaUrl, mediaPreviewUrl: media.previewUrl, body: "" } : {
      conversationId: active.conversationId,
      contentType: media.type,
      mediaUrl: media.mediaUrl,
      mediaPreviewUrl: media.previewUrl,
      body: ""
    }, result => {
      if (result?.error) setError(result.error);
      else setMediaOpen(false);
    });
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    const replyMessageId = replyTo?._id || null;
    setDraft(""); setReplyTo(null);
    socketRef.current?.emit(active.isGroup ? "group:message:send" : "message:send", active.isGroup ? { groupId: active.id, body, replyTo: replyMessageId } : { conversationId: active.conversationId, body, replyTo: replyMessageId }, result => {
      if (result?.error) { setError(result.error); setDraft(body); }
    });
  }
  const filtered = contacts.filter(c => `${c.username} ${c.displayName || ""}`.toLowerCase().includes(query.toLowerCase()));

  return <div className={`app-shell theme-${preferences.appearance.theme} density-${preferences.appearance.density} bubbles-${preferences.appearance.bubbleStyle}`} style={{ "--accent": preferences.appearance.accentColor, "--font-scale": preferences.appearance.fontScale, "--chat-wallpaper": preferences.appearance.wallpaperColor }}>
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
          <div className="avatar">{active.avatarData ? <img src={active.avatarData} alt=""/> : (active.isGroup ? <UserRound size={17}/> : (active.displayName || active.username).slice(0,1).toUpperCase())}</div>
          <div className="contact-meta"><strong>{active.isGroup ? active.name : (active.displayName || active.username)}</strong><small>{active.isGroup ? (active.memberCount || active.members?.length || 0) + " members · Group chat" : "@" + active.username}</small></div>
          {active.isGroup ? <button className="icon-btn" title="Group settings" onClick={()=>{setGroupName(active.name);setGroupDescription(active.description || "");setGroupAvatar(active.avatarData || "");setGroupSettingsOpen(true);}}><UserCog size={15}/></button> : <button className="icon-btn" title="Report user" onClick={()=>submitReport("user",active._id,"@"+active.username)}><Flag size={15}/></button><button className="icon-btn" title="Remove friend" onClick={()=>removeFriend(active)}><Trash2 size={15}/></button>}<button className="icon-btn" title={(preferences.notifications.mutedContacts || []).includes(active._id) ? "Unmute notifications for this contact" : "Mute notifications for this contact"} onClick={()=>toggleContactMute(active._id).catch(e=>setError(e.message))}>{(preferences.notifications.mutedContacts || []).includes(active._id) ? <BellOff size={15}/> : <Bell size={15}/>}</button><button className="icon-btn" title="Settings" onClick={()=>setSettingsCenterOpen(true)}><Settings size={15}/></button>
          <div className="online-dot" title={status}/>
        </div>
        <div className="messages">
          {messages.length===0 && <div className="empty-chat"><div className="empty-icon"><MessageCircle size={22}/></div><strong>Say hello 👋</strong><span>Your conversation starts here.</span></div>}
          {messages.map((m,i)=><div key={m._id || i} className={"message " + (m.senderId===me.id ? "mine" : "theirs")}><div className="bubble">{active.isGroup && m.senderId !== me.id && <div className="group-sender">{m.senderName || m.senderUsername || "Member"}</div>}{m.replyTo && <div className="quoted-message">{messages.find(original=>original._id===m.replyTo)?.body || "Original message unavailable"}</div>}{m.contentType==="gif" || m.contentType==="sticker" ? <div className={"media-message " + (m.contentType==="sticker" ? "sticker-message" : "")}><img src={m.mediaUrl} alt={m.contentType==="sticker" ? "Sticker" : "GIF"} loading="lazy"/>{m.body && <span>{m.body}</span>}</div> : m.body}</div>{preferences.chat.reactions && <div className="reaction-row">{(m.reactions || []).length>0 && Object.entries((m.reactions || []).reduce((groups,reaction)=>{groups[reaction.emoji]=(groups[reaction.emoji]||[]).concat(reaction);return groups;},{})).map(([emoji,items])=><button key={emoji} type="button" className={items.some(item=>item.userId===me.id)?"reaction-chip selected":"reaction-chip"} onClick={()=>toggleReaction(m,emoji)}>{emoji} {items.length}</button>)}{["👍","❤️","😂","😮","🔥"].map(emoji=><button key={emoji} type="button" className="quick-reaction" title={"React "+emoji} onClick={()=>toggleReaction(m,emoji)}>{emoji}</button>)}</div>}<div className="message-actions"><button type="button" title="Reply" onClick={()=>setReplyTo(m)}><Reply size={12}/></button><button type="button" title="Copy" onClick={()=>navigator.clipboard?.writeText(m.body || m.mediaUrl || "")}><Copy size={12}/></button><button type="button" title="Delete for me" onClick={()=>deleteMessage(m,"me")}><Trash2 size={12}/></button>{m.senderId===me.id && <button type="button" title="Delete for everyone" onClick={()=>deleteMessage(m,"everyone")}><X size={12}/></button>}</div><time>{new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}{m.senderId===me.id && m.readAt ? " · Seen" : ""}</time></div>)}
          <div ref={bottomRef}/>
        </div>
        {error && <div className="inline-error">{error}<button onClick={()=>setError("")}>×</button></div>}
        {replyTo && <div className="reply-preview"><div><strong>Replying to message</strong><span>{replyTo.body || (replyTo.contentType==="sticker"?"Sticker":replyTo.contentType==="gif"?"GIF":"Message")}</span></div><button type="button" onClick={()=>setReplyTo(null)}><X size={15}/></button></div>}{emojiOpen && <div className="emoji-picker-popover"><EmojiPicker onEmojiClick={emojiData=>setDraft(d=>d+emojiData.emoji)} width="100%" height={340} theme={preferences.appearance.theme === "light" ? "light" : "dark"} lazyLoadEmojis searchPlaceHolder="Search all emojis…" previewConfig={{showPreview:false}} /></div>}{mediaOpen && <MediaPicker token={token} onSelect={sendMedia} onClose={()=>setMediaOpen(false)} />}<form className="composer" onSubmit={sendMessage}><button type="button" className="icon-btn" title="Emoji" onClick={()=>setEmojiOpen(v=>!v)}>😊</button><button type="button" className="icon-btn media-open-btn" title="GIFs & stickers" disabled={!preferences.chat.mediaEnabled} onClick={()=>setMediaOpen(v=>!v)}><ImageIcon size={16}/></button><textarea className="composer-input" rows={1} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter" && (preferences.chat.enterToSend && !e.shiftKey || (e.ctrlKey || e.metaKey))){e.preventDefault();sendMessage(e);}}} placeholder={replyTo ? "Write a reply…" : "Write a message…"} maxLength={4000}/><button className="send-btn" disabled={!draft.trim()} aria-label="Send message"><Send size={16}/></button></form>
      </section> : <section className="contacts-view">
        <div className="welcome-row"><div><p className="eyebrow">YOUR PEOPLE</p><h2>Messages<span>.</span></h2></div><button className="icon-btn logout" title="Settings" onClick={()=>setSettingsCenterOpen(true)}><Settings size={16}/></button><button className="icon-btn logout" title="Admin panel" onClick={openAdmin}>A</button><button className="icon-btn logout" title="Sign out" onClick={logout}><LogOut size={16}/></button></div>
        <button className="me-card profile-button" onClick={startProfileEdit} title="Edit your profile"><div className="avatar own">{me.avatarData ? <img src={me.avatarData} alt=""/> : <UserRound size={17}/>}</div><div className="contact-meta"><strong>{me.displayName || me.username}</strong><small>@{me.username}</small></div><span className="you-badge">EDIT PROFILE</span><UserCog size={15}/></button>
        <nav className="home-tabs" aria-label="Main navigation">
          <button className={homeTab==="chats"?"active":""} onClick={()=>setHomeTab("chats")}><MessageCircle size={14}/> Chats <span>{contacts.length}</span></button>
          <button className={homeTab==="groups"?"active":""} onClick={()=>setHomeTab("groups")}><UserRound size={14}/> Groups <span>{groups.length}</span></button>
        </nav>
        {homeTab !== "groups" && <form className="searchbox" onSubmit={sendFriendRequest}><Search size={15}/><input value={friendUsername} onChange={e=>setFriendUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="Add by exact username…" minLength={3} maxLength={24}/><button className="icon-btn" type="submit" title="Send friend request"><Plus size={15}/></button></form>}
        {homeTab !== "groups" && <>
{friendRequests.some(r=>r.status==="pending" && r.recipientId===me.id) && <><div className="section-label">INCOMING REQUESTS <span>{friendRequests.filter(r=>r.status==="pending" && r.recipientId===me.id).length}</span></div><div className="contact-list request-list">{friendRequests.filter(r=>r.status==="pending" && r.recipientId===me.id).map(r=><div className="contact-row" key={r.id}><div className="contact-meta"><strong>{r.person.displayName||r.person.username}</strong><small>@{r.person.username} wants to connect</small></div><button className="primary-btn" onClick={()=>answerFriendRequest(r.id,"accept")}>Accept</button><button className="icon-btn" onClick={()=>answerFriendRequest(r.id,"reject")} title="Reject request">×</button></div>)}</div></>}
        {friendRequests.some(r=>r.status==="pending" && r.senderId===me.id) && <><div className="section-label">SENT REQUESTS <span>{friendRequests.filter(r=>r.status==="pending" && r.senderId===me.id).length}</span></div><div className="contact-list request-list">{friendRequests.filter(r=>r.status==="pending" && r.senderId===me.id).map(r=><div className="contact-row" key={r.id}><div className="contact-meta"><strong>{r.person.displayName||r.person.username}</strong><small>@{r.person.username} · Waiting for acceptance</small></div><span className="request-pending">Pending</span></div>)}</div></>}
        </>}
        {homeTab !== "groups" && <div className="section-label">CHATS <span>{filtered.length}</span></div>}
        {homeTab !== "groups" && <div className="contact-list">
          {filtered.map(c=>{const pending=friendRequests.find(r=>r.status==="pending" && ((r.senderId===me.id && r.person.username===c.username)||(r.recipientId===me.id && r.person.username===c.username)));return <button key={c._id} className="contact-row" onClick={()=>c.isFriend ? openChat(c) : pending ? (pending.recipientId===me.id ? answerFriendRequest(pending.id,"accept") : setError("Friend request already sent. Waiting for @"+c.username+" to accept.")) : requestFriendForPerson(c.username)}><div className="avatar">{c.avatarData ? <img src={c.avatarData} alt=""/> : (c.displayName||c.username).slice(0,1).toUpperCase()}</div><div className="contact-meta"><strong>{c.displayName||c.username}</strong><small>@{c.username} · {c.isFriend ? (onlineUserIds.includes(c._id) ? "Online" : c.lastSeenAt ? ("Last seen " + new Date(c.lastSeenAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })) : "Offline") : pending ? (pending.recipientId===me.id ? "Accept incoming request" : "Request sent · waiting") : "Add friend"}</small></div>{c.isFriend ? <MessageCircle size={15} className="open-arrow"/> : pending ? <span className="request-pending">{pending.recipientId===me.id ? "Accept" : "Sent"}</span> : <Plus size={15} className="open-arrow"/>}</button>})}
          {filtered.length===0 && <div className="empty-people"><UserRound size={22}/><strong>No people yet</strong><span>Search an exact username above to send a friend request. Your friends will appear here.</span></div>}
        </div>}
        {homeTab === "groups" && <div className="group-list-panel">
          <div className="group-list-heading"><div><strong>Your groups</strong><small>Private spaces with your friends</small></div><button className="primary-btn" onClick={()=>setGroupCreateOpen(true)}><Plus size={14}/> New group</button></div>
          {groups.map(group=><button className="group-row" key={group.id} onClick={()=>openGroup(group)}><div className="group-avatar">{group.avatarData ? <img src={group.avatarData} alt=""/> : <UserRound size={18}/>}</div><div className="contact-meta"><strong>{group.name}</strong><small>{group.lastMessage ? group.lastMessage.body : group.memberCount + " members · Start a conversation"}</small></div><span className="group-count">{group.memberCount}</span></button>)}
          {!groups.length && <div className="empty-people"><UserRound size={24}/><strong>No groups yet</strong><span>Create a private group with at least two of your accepted friends.</span><button className="primary-btn" onClick={()=>setGroupCreateOpen(true)}>Create your first group</button></div>}
        </div>}
        {error && <div className="inline-error">{error}<button onClick={()=>setError("")}>×</button></div>}
        <div className="footer-note"><Circle size={7} fill="currentColor"/> PRIVATE SPACE · REAL-TIME CHAT</div>
      </section>}
    </>}
    {adminOpen && <div className="profile-overlay admin-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false);}}>
      <section className="profile-dialog admin-dashboard">
        <header className="admin-topbar"><div className="admin-brand"><span><ShieldCheck size={21}/></span><div><p className="eyebrow">POCKETCHAT CONTROL CENTER</p><h2>Admin dashboard</h2></div></div><div className="admin-top-actions"><span className="admin-secure"><Activity size={12}/> Server-verified admin</span><button className="icon-btn" onClick={()=>loadAdminData(adminTab)} title="Refresh"><RefreshCw size={15}/></button><button className="icon-btn" onClick={()=>setAdminOpen(false)}><X size={17}/></button></div></header>
        <div className="admin-dashboard-layout"><nav className="admin-sidebar">
          {[["overview","Overview",LayoutDashboard],["users","Users",Users],["groups","Groups",Layers],["reports","Reports",Flag],["settings","App controls",Megaphone],["audit","Audit log",ScrollText]].map(([id,label,Icon])=><button key={id} className={adminTab===id?"active":""} onClick={()=>{setAdminTab(id);loadAdminData(id);}}><Icon size={15}/>{label}{id==="reports"&&adminStats.pendingReports>0?<b>{adminStats.pendingReports}</b>:null}</button>)}
          <small><ShieldCheck size={13}/> Permission checked by API</small>
        </nav><main className="admin-main">{adminBusy&&<div className="admin-loading"><RefreshCw size={14} className="spin-icon"/> Loading latest data…</div>}
          {adminTab==="overview"&&<div className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">LIVE PLATFORM SNAPSHOT</p><h3>Welcome back, admin.</h3><p>Monitor PocketChat and keep the community safe.</p></div><span className="admin-version">v0.3.0</span></div><div className="admin-stat-grid">{[["Total users",adminStats.totalUsers,Users],["Active today",adminStats.activeUsers,Activity],["Groups",adminStats.totalGroups,Layers],["Messages",adminStats.totalMessages,MessageCircle],["Open reports",adminStats.pendingReports,Flag],["New today",adminStats.newUsersToday,UserCheck]].map(([label,value,Icon])=><div className="admin-stat-card" key={label}><span><Icon size={15}/>{label}</span><strong>{Number(value||0).toLocaleString()}</strong></div>)}</div><div className="admin-quick-grid"><button onClick={()=>{setAdminTab("users");loadAdminData("users");}}><Users/><strong>Manage users</strong><small>Roles and account access</small></button><button onClick={()=>{setAdminTab("reports");loadAdminData("reports");}}><Flag/><strong>Review reports</strong><small>{adminStats.pendingReports||0} open reports</small></button><button onClick={()=>setAdminTab("settings")}><Megaphone/><strong>App controls</strong><small>Announcements and maintenance</small></button></div><div className="admin-health-row"><span><i/> API connected</span><span>Admin role verified server-side</span></div></div>}
          {adminTab==="users"&&<div className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">ACCOUNT DIRECTORY</p><h3>User management</h3><p>Search accounts, manage roles and control access.</p></div></div><form className="admin-search" onSubmit={e=>{e.preventDefault();loadAdminData("users");}}><Search size={15}/><input value={adminSearch} onChange={e=>setAdminSearch(e.target.value)} placeholder="Search username or display name…"/><button className="primary-btn">Search</button></form><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ACCOUNT</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>ACTIONS</th></tr></thead><tbody>{adminUsers.map(u=><tr key={u.id}><td><strong>{u.displayName||u.username}</strong><small>@{u.username}</small></td><td><span className={u.role==="admin"?"admin-role-pill":"admin-user-pill"}>{u.role}</span></td><td><span className={u.isDisabled?"admin-status-off":"admin-status-on"}>{u.isDisabled?"Suspended":"Active"}</span></td><td>{u.createdAt?new Date(u.createdAt).toLocaleDateString():"—"}</td><td><div className="admin-row-actions"><button title={u.isDisabled?"Reactivate":"Suspend"} onClick={()=>adminDisableUser(u.id,u.isDisabled)}>{u.isDisabled?<UserCheck size={14}/>:<Ban size={14}/>}</button>{u.id!==me.id&&<button title={u.role==="admin"?"Remove admin":"Promote to admin"} onClick={()=>adminSetRole(u.id,u.role==="admin"?"user":"admin")}><ShieldCheck size={14}/></button>}{u.id!==me.id&&<button className="danger" title="Delete user" onClick={()=>adminDeleteUser(u.id,u.username)}><Trash2 size={14}/></button>}</div></td></tr>)}</tbody></table>{!adminUsers.length&&<div className="admin-empty">No matching accounts found.</div>}</div></div>}
          {adminTab==="groups"&&<div className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">COMMUNITY SPACES</p><h3>Group management</h3><p>Review groups and remove harmful spaces.</p></div><span className="admin-count">{adminGroups.length} groups</span></div><div className="admin-card-list">{adminGroups.map(g=><div className="admin-list-card" key={g.id}><div className="admin-list-icon"><Layers size={17}/></div><div className="contact-meta"><strong>{g.name}</strong><small>{g.memberCount} members · Owner @{g.createdBy} · {new Date(g.createdAt).toLocaleDateString()}</small></div><button className="admin-icon-danger" onClick={()=>adminDeleteGroup(g)} title="Delete group"><Trash2 size={15}/></button></div>)}{!adminGroups.length&&<div className="admin-empty">No groups found.</div>}</div></div>}
          {adminTab==="reports"&&<div className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">TRUST & SAFETY</p><h3>Reports queue</h3><p>Review reports submitted by users.</p></div><span className="admin-count">{adminReports.length} reports</span></div><div className="admin-card-list">{adminReports.map(r=><article className="admin-report-card" key={r.id}><div className="admin-report-head"><strong>{r.targetType} · {r.reason}</strong><span className={"admin-report-status "+r.status}>{r.status}</span></div><p>{r.details||"No additional details supplied."}</p><small>By @{r.reporter} · {new Date(r.createdAt).toLocaleString()} · Target {r.targetId.slice(0,12)}…</small><select className="setting-select" value={r.status} onChange={e=>adminUpdateReport(r,e.target.value)}><option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></article>)}{!adminReports.length&&<div className="admin-empty">No reports yet. The queue is clear.</div>}</div></div>}
          {adminTab==="settings"&&<form className="admin-page admin-settings-form" onSubmit={adminSaveConfig}><div className="admin-page-heading"><div><p className="eyebrow">GLOBAL CONFIGURATION</p><h3>App controls</h3><p>Manage announcements and release requirements.</p></div></div><label className="admin-config-toggle"><span><strong>Maintenance mode</strong><small>Maintenance status for admin visibility; this does not automatically block API access.</small></span><input type="checkbox" checked={!!adminConfig.maintenanceMode} onChange={e=>setAdminConfig(v=>({...v,maintenanceMode:e.target.checked}))}/></label><label className="admin-config-toggle"><span><strong>Announcement banner</strong><small>Enable a global announcement for signed-in users.</small></span><input type="checkbox" checked={!!adminConfig.announcementEnabled} onChange={e=>setAdminConfig(v=>({...v,announcementEnabled:e.target.checked}))}/></label><label className="admin-field">Announcement message<textarea value={adminConfig.announcement||""} onChange={e=>setAdminConfig(v=>({...v,announcement:e.target.value}))} maxLength={300} placeholder="Share an update…"/></label><label className="admin-field">Minimum app version<input value={adminConfig.minimumVersion||""} onChange={e=>setAdminConfig(v=>({...v,minimumVersion:e.target.value}))} placeholder="0.3.0" pattern="\d+\.\d+\.\d+"/><small>Format: 0.3.0</small></label><button className="primary-btn admin-save-btn">Save app settings</button></form>}
          {adminTab==="audit"&&<div className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">ACCOUNTABILITY</p><h3>Admin audit log</h3><p>Recent administrative changes.</p></div></div><div className="admin-card-list">{adminLogs.map(log=><div className="admin-list-card" key={log.id}><div className="admin-list-icon"><ScrollText size={16}/></div><div className="contact-meta"><strong>{log.action}</strong><small>@{log.actor} · {log.targetType} · {log.details}</small></div><time>{new Date(log.createdAt).toLocaleString()}</time></div>)}{!adminLogs.length&&<div className="admin-empty">No admin events logged yet.</div>}</div></div>}
        </main></div><footer className="admin-footer"><span>POCKETCHAT · ADMIN CONSOLE</span><span>Admin actions are audited</span><button className="primary-btn" onClick={()=>setAdminOpen(false)}>Close dashboard</button></footer>
      </section></div>}
    {groupCreateOpen && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setGroupCreateOpen(false);}}><form className="profile-dialog group-dialog" onSubmit={createGroup}>
      <div className="profile-heading"><div><p className="eyebrow">NEW PRIVATE SPACE</p><h2>Create a group</h2></div><button type="button" className="icon-btn" onClick={()=>setGroupCreateOpen(false)}><X size={17}/></button></div>
      <label className="group-photo-picker">{groupAvatar ? <img src={groupAvatar} alt="Group preview"/> : <UserRound size={26}/>}<span><Camera size={12}/> Add group photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleGroupAvatar}/></span></label>
      <label>Group name<input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="e.g. Weekend squad" minLength={2} maxLength={48} required/></label>
      <label>Description <small>(optional)</small><input value={groupDescription} onChange={e=>setGroupDescription(e.target.value)} placeholder="What's this group about?" maxLength={240}/></label>
      <div className="group-picker-label">ADD FRIENDS <small>Choose at least 2 · {groupMembers.length} selected</small></div>
      <div className="group-friend-picker">{contacts.map(person=><label className="group-friend-option" key={person._id}><input type="checkbox" checked={groupMembers.includes(person._id)} onChange={e=>setGroupMembers(prev=>e.target.checked?[...prev,person._id]:prev.filter(id=>id!==person._id))}/><div className="avatar">{person.avatarData?<img src={person.avatarData} alt=""/>:(person.displayName||person.username).slice(0,1).toUpperCase()}</div><span>{person.displayName||person.username}<small>@{person.username}</small></span></label>)}{!contacts.length && <div className="muted">Add and accept friends first to create a group.</div>}</div>
      {error && <div className="error-text">{error}</div>}<div className="profile-actions"><button type="button" className="text-btn" onClick={()=>setGroupCreateOpen(false)}>Cancel</button><button className="primary-btn" disabled={groupBusy || groupMembers.length<2}>{groupBusy?"Creating…":"Create group"}</button></div>
    </form></div>}
    {groupSettingsOpen && active?.isGroup && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setGroupSettingsOpen(false);}}><section className="profile-dialog group-dialog">
      <div className="profile-heading"><div><p className="eyebrow">GROUP DETAILS</p><h2>Group settings</h2></div><button type="button" className="icon-btn" onClick={()=>setGroupSettingsOpen(false)}><X size={17}/></button></div>
      {active.isAdmin ? <form className="group-edit-form" onSubmit={saveGroupDetails}><label>Group name<input value={groupName} onChange={e=>setGroupName(e.target.value)} maxLength={48} minLength={2} required/></label><label>Description<input value={groupDescription} onChange={e=>setGroupDescription(e.target.value)} maxLength={240}/></label><label className="group-photo-inline">Change group photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleGroupAvatar}/></label><button className="primary-btn" disabled={groupBusy}>Save details</button></form> : <p className="muted">{active.description || "A private group for your friends."}</p>}
      <div className="group-picker-label">MEMBERS <small>{active.members?.length || active.memberCount || 0} people</small></div>
      <div className="group-member-list">{(active.members || []).map(member=><div className="group-member-row" key={member.id}><div className="avatar">{member.avatarData?<img src={member.avatarData} alt=""/>:(member.displayName||member.username).slice(0,1).toUpperCase()}</div><div className="contact-meta"><strong>{member.displayName||member.username}</strong><small>@{member.username}{member.isAdmin?" · Admin":""}</small></div>{active.isAdmin && member.id!==active.createdBy && <><button type="button" className="group-role-btn" onClick={()=>toggleGroupAdmin(member)}>{member.isAdmin ? "Admin" : "Make admin"}</button><button type="button" className="icon-btn" title="Remove member" onClick={()=>removeGroupMember(member.id)}><Trash2 size={14}/></button></>}</div>)}</div>
      {active.isAdmin && <div className="group-add-row"><select className="setting-select" value={groupMemberToAdd} onChange={e=>setGroupMemberToAdd(e.target.value)}><option value="">Add a friend…</option>{contacts.filter(person=>!(active.members||[]).some(member=>member.id===person._id)).map(person=><option key={person._id} value={person._id}>@{person.username}</option>)}</select><button className="primary-btn" disabled={!groupMemberToAdd||groupBusy} onClick={addGroupMember}>Add</button></div>}
      {active.createdBy === me.id && (active.members?.length || 0) > 1 && <p className="muted group-owner-note">As the group creator, you can leave after transferring ownership or removing the other members.</p>}
      <button className="text-btn" onClick={()=>submitReport("group",active.id,active.name)}>Report this group</button><button className="danger-btn settings-action" disabled={groupBusy || (active.createdBy === me.id && (active.members?.length || 0) > 1)} onClick={()=>removeGroupMember(me.id)}>Leave group</button>
    </section></div>}
    {updateOpen && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setUpdateOpen(false);}}><section className="profile-dialog"><div className="profile-heading"><div><p className="eyebrow">POCKETCHAT</p><h2>Software updates</h2></div><button type="button" className="icon-btn" onClick={()=>setUpdateOpen(false)}><X size={17}/></button></div><div className="update-status-icon">{updateInfo.status==="current" ? <CheckCircle2 size={28}/> : updateInfo.status==="downloaded" ? <CheckCircle2 size={28}/> : <Download size={28}/>}</div><strong className="update-status-title">{updateInfo.message || "Check for updates"}</strong>{updateInfo.version && <p className="muted">Version {updateInfo.version}</p>}{updateInfo.status==="downloading" && <div className="update-progress"><span style={{width:`${updateInfo.percent || 0}%`}}/></div>}{updateInfo.status==="error" && <p className="error-text">Please check your internet connection and try again.</p>}<div className="profile-actions"><button type="button" className="text-btn" onClick={()=>setUpdateOpen(false)}>Close</button><button type="button" className="primary-btn" disabled={updateBusy || ["checking","downloading","current","dev"].includes(updateInfo.status)} onClick={runUpdateAction}>{updateBusy ? "Please wait…" : updateInfo.status==="downloaded" ? "Install and restart" : updateInfo.status==="available" ? "Download update" : updateInfo.status==="downloading" ? "Downloading…" : updateInfo.status==="current" ? "Up to date" : updateInfo.status==="dev" ? "Installed app only" : "Check for updates"}</button></div>{updateInfo.status==="current" && <button type="button" className="text-btn" onClick={runUpdateAction}>Check again</button>}{updateInfo.status==="dev" && <p className="muted">The update service works in the installed app, not in the development window.</p>}</section></div>}
    {appLocked && <div className="app-lock-overlay"><form className="app-lock-card" onSubmit={unlockApp}><div className="lock-icon"><LockKeyhole size={25}/></div><p className="eyebrow">POCKETCHAT LOCKED</p><h2>Welcome back.</h2><p className="muted">Enter your account password to unlock this device.</p><label>Password<input type="password" autoFocus autoComplete="current-password" value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} required/></label>{unlockError && <div className="error-text">{unlockError}</div>}<button className="primary-btn" type="submit" disabled={unlockBusy}>{unlockBusy ? "Unlocking…" : "Unlock PocketChat"}</button></form></div>}
    {settingsCenterOpen && <SettingsCenter value={preferences} devicePreferences={devicePreferences} user={me} onSave={savePreferences} onRevokeAll={revokeAllSessions} onDeleteAccount={deleteAccount} onClose={()=>setSettingsCenterOpen(false)} />}
    {profileOpen && <div className="profile-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setProfileOpen(false);}}><form className="profile-dialog" onSubmit={saveProfile}><div className="profile-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><h2>Edit profile</h2></div><button type="button" className="icon-btn" onClick={()=>setProfileOpen(false)}><X size={17}/></button></div><label className="avatar-picker">{profileAvatar ? <img src={profileAvatar} alt="Profile preview"/> : <UserRound size={30}/>}<span><Camera size={13}/> Change photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatarFile}/></span></label><label>Display name<input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Your name" maxLength={40}/></label><label>Username<input value={profileUsername} onChange={e=>setProfileUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="username" minLength={3} maxLength={24} required/><small>3–24 letters, numbers or underscore</small></label>{error && <div className="error-text">{error}</div>}<div className="profile-actions"><button type="button" className="text-btn" onClick={()=>setProfileOpen(false)}>Cancel</button><button className="primary-btn" type="submit" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save changes"}</button></div></form></div>}
  </div>;
}
