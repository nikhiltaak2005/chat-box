import React, { useState } from "react";
import { Bell, Palette, ShieldCheck, X, RotateCcw, Save, Image as ImageIcon } from "lucide-react";

export const DEFAULT_DEVICE_PREFERENCES = { pet: { avatar: "cat", size: 88, opacity: 100, alwaysOnTop: true, animate: true }, launchAtStartup: false };

export const DEFAULT_PREFERENCES = {
  appearance: { theme: "dark", accentColor: "#fa8059", wallpaperColor: "#111318", fontScale: 1, density: "comfortable", bubbleStyle: "rounded" },
  notifications: { enabled: true, sound: true, preview: "full", friendRequests: true, reactions: false, quietHoursEnabled: false, quietStart: "22:00", quietEnd: "08:00" },
  chat: { enterToSend: true, reactions: true, mediaEnabled: true },
  privacy: { readReceipts: true, showOnline: true, lastSeen: "contacts", profileVisibility: "contacts" }
};

function mergePreferences(value) {
  return {
    appearance: { ...DEFAULT_PREFERENCES.appearance, ...(value?.appearance || {}) },
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(value?.notifications || {}) },
    chat: { ...DEFAULT_PREFERENCES.chat, ...(value?.chat || {}) },
    privacy: { ...DEFAULT_PREFERENCES.privacy, ...(value?.privacy || {}) }
  };
}

function Field({ label, description, children }) {
  return <label className="settings-field"><span className="settings-field-label">{label}</span>{description && <small>{description}</small>}{children}</label>;
}

export default function SettingsCenter({ value, devicePreferences, onSave, onClose, saving = false }) {
  const [tab, setTab] = useState("appearance");
  const [draft, setDraft] = useState(() => mergePreferences(value));
  const [deviceDraft, setDeviceDraft] = useState(() => ({ ...DEFAULT_DEVICE_PREFERENCES, ...(devicePreferences || {}), pet: { ...DEFAULT_DEVICE_PREFERENCES.pet, ...(devicePreferences?.pet || {}) } }));
  const [notice, setNotice] = useState("");
  const patch = (section, key, next) => setDraft(prev => ({ ...prev, [section]: { ...prev[section], [key]: next } }));
  const reset = () => {
    setDraft(mergePreferences(DEFAULT_PREFERENCES));
    setDeviceDraft({ ...DEFAULT_DEVICE_PREFERENCES, pet: { ...DEFAULT_DEVICE_PREFERENCES.pet } });
    setNotice("Defaults restored. Save to apply them.");
  };
  const save = async () => {
    setNotice("");
    try { await onSave(draft, deviceDraft); setNotice("Settings saved."); }
    catch (error) { setNotice(error?.message || "Could not save settings."); }
  };
  const tabs = [
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "chat", label: "Chat & Media", icon: ImageIcon },
    { id: "privacy", label: "Privacy", icon: ShieldCheck },
    { id: "pet", label: "Pet & Desktop", icon: Bell }
  ];
  const appearance = draft.appearance;
  const notifications = draft.notifications;
  const chat = draft.chat;
  const privacy = draft.privacy;
  return <div className="profile-overlay settings-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="PocketChat settings">
      <header className="settings-heading"><div><p className="eyebrow">POCKETCHAT</p><h2>Settings</h2><p className="settings-subtitle">Make your chat feel like yours.</p></div><button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}><X size={17}/></button></header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">{tabs.map(({id,label,icon:Icon}) => <button key={id} type="button" className={tab === id ? "settings-tab active" : "settings-tab"} onClick={() => setTab(id)}><Icon size={15}/><span>{label}</span></button>)}</nav>
        <div className="settings-content">
          {tab === "appearance" && <div className="settings-section"><h3>Appearance</h3><p className="muted">These account preferences sync with your other devices.</p>
            <Field label="Theme"><select className="setting-select" value={appearance.theme} onChange={e=>patch("appearance","theme",e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow system</option></select></Field>
            <Field label="Chat background color" description="Choose a solid background for your message area."><div className="settings-color-row"><input aria-label="Chat background color" type="color" value={appearance.wallpaperColor} onChange={e=>patch("appearance","wallpaperColor",e.target.value)}/><code>{appearance.wallpaperColor}</code><button type="button" className="text-btn" onClick={()=>patch("appearance","wallpaperColor",DEFAULT_PREFERENCES.appearance.wallpaperColor)}>Reset</button></div></Field>
            <Field label="Accent color" description="Used for buttons, highlights and your active state."><div className="settings-color-row"><input aria-label="Accent color" type="color" value={appearance.accentColor} onChange={e=>patch("appearance","accentColor",e.target.value)}/><code>{appearance.accentColor}</code><button type="button" className="text-btn" onClick={()=>patch("appearance","accentColor",DEFAULT_PREFERENCES.appearance.accentColor)}>Reset</button></div></Field>
            <Field label="Text size"><select className="setting-select" value={appearance.fontScale} onChange={e=>patch("appearance","fontScale",Number(e.target.value))}><option value={0.9}>Small</option><option value={1}>Default</option><option value={1.1}>Large</option><option value={1.2}>Extra large</option></select></Field>
            <Field label="Chat density"><select className="setting-select" value={appearance.density} onChange={e=>patch("appearance","density",e.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field>
            <Field label="Message bubbles"><select className="setting-select" value={appearance.bubbleStyle} onChange={e=>patch("appearance","bubbleStyle",e.target.value)}><option value="rounded">Rounded</option><option value="soft">Soft corners</option><option value="square">Square</option></select></Field>
          </div>}
          {tab === "notifications" && <div className="settings-section"><h3>Notifications</h3><p className="muted">Choose which events can interrupt you.</p>
            <label className="settings-toggle"><span><strong>Desktop notifications</strong><small>Show alerts for incoming messages.</small></span><input type="checkbox" checked={notifications.enabled} onChange={e=>patch("notifications","enabled",e.target.checked)}/></label>
            <label className="settings-toggle"><span><strong>Notification sound</strong><small>Play a sound when a new message arrives.</small></span><input type="checkbox" checked={notifications.sound} onChange={e=>patch("notifications","sound",e.target.checked)}/></label>
            <Field label="Message preview"><select className="setting-select" value={notifications.preview} onChange={e=>patch("notifications","preview",e.target.value)}><option value="full">Show message text</option><option value="sender">Sender only</option><option value="hidden">Hide message details</option></select></Field>
            <label className="settings-toggle"><span><strong>Friend requests</strong><small>Notify me about incoming requests.</small></span><input type="checkbox" checked={notifications.friendRequests} onChange={e=>patch("notifications","friendRequests",e.target.checked)}/></label>
            <label className="settings-toggle"><span><strong>Message reactions</strong><small>Notify me when someone reacts.</small></span><input type="checkbox" checked={notifications.reactions} onChange={e=>patch("notifications","reactions",e.target.checked)}/></label>
            <label className="settings-toggle"><span><strong>Quiet hours</strong><small>Mute notifications during a daily time window.</small></span><input type="checkbox" checked={notifications.quietHoursEnabled} onChange={e=>patch("notifications","quietHoursEnabled",e.target.checked)}/></label>
            {notifications.quietHoursEnabled && <div className="settings-time-row"><Field label="From"><input className="setting-input" type="time" value={notifications.quietStart} onChange={e=>patch("notifications","quietStart",e.target.value)}/></Field><Field label="Until"><input className="setting-input" type="time" value={notifications.quietEnd} onChange={e=>patch("notifications","quietEnd",e.target.value)}/></Field></div>}
          </div>}
          {tab === "pet" && <div className="settings-section"><h3>Pet & Desktop</h3><p className="muted">These settings stay on this PC and are not synced to your account.</p>
            <Field label="Pet mascot"><select className="setting-select" value={deviceDraft.pet.avatar} onChange={e=>setDeviceDraft(prev=>({...prev,pet:{...prev.pet,avatar:e.target.value}}))}><option value="cat">🐱 Orange cat</option><option value="fox">🦊 Fox</option><option value="dog">🐶 Dog</option><option value="panda">🐼 Panda</option><option value="rabbit">🐰 Rabbit</option><option value="robot">🤖 Robot</option><option value="ghost">👻 Ghost</option><option value="frog">🐸 Frog</option></select></Field>
            <Field label={"Pet size · " + deviceDraft.pet.size + " px"}><input className="settings-range" type="range" min="64" max="144" step="8" value={deviceDraft.pet.size} onChange={e=>setDeviceDraft(prev=>({...prev,pet:{...prev.pet,size:Number(e.target.value)}}))}/></Field>
            <Field label={"Opacity · " + deviceDraft.pet.opacity + "%"}><input className="settings-range" type="range" min="40" max="100" step="5" value={deviceDraft.pet.opacity} onChange={e=>setDeviceDraft(prev=>({...prev,pet:{...prev.pet,opacity:Number(e.target.value)}}))}/></Field>
            <label className="settings-toggle"><span><strong>Always on top</strong><small>Keep the floating pet above other windows.</small></span><input type="checkbox" checked={deviceDraft.pet.alwaysOnTop} onChange={e=>setDeviceDraft(prev=>({...prev,pet:{...prev.pet,alwaysOnTop:e.target.checked}}))}/></label>
            <label className="settings-toggle"><span><strong>Pet animation</strong><small>Enable hover movement and playful feedback.</small></span><input type="checkbox" checked={deviceDraft.pet.animate} onChange={e=>setDeviceDraft(prev=>({...prev,pet:{...prev.pet,animate:e.target.checked}}))}/></label>
            <label className="settings-toggle"><span><strong>Start with Windows</strong><small>Launch PocketChat when you sign in to Windows.</small></span><input type="checkbox" checked={deviceDraft.launchAtStartup} onChange={e=>setDeviceDraft(prev=>({...prev,launchAtStartup:e.target.checked}))}/></label>
          </div>}
          {tab === "chat" && <div className="settings-section"><h3>Chat & Media</h3><p className="muted">These account preferences sync with your other devices.</p>
            <label className="settings-toggle"><span><strong>Enter to send</strong><small>When off, Enter inserts a new line and Ctrl+Enter sends.</small></span><input type="checkbox" checked={chat.enterToSend} onChange={e=>patch("chat","enterToSend",e.target.checked)}/></label>
            <label className="settings-toggle"><span><strong>Message reactions</strong><small>Show quick reactions on messages.</small></span><input type="checkbox" checked={chat.reactions} onChange={e=>patch("chat","reactions",e.target.checked)}/></label>
            <label className="settings-toggle"><span><strong>GIFs & stickers</strong><small>Allow browsing and sending media from GIPHY.</small></span><input type="checkbox" checked={chat.mediaEnabled} onChange={e=>patch("chat","mediaEnabled",e.target.checked)}/></label>
            <div className="settings-note">GIF and sticker search uses GIPHY. Search terms are sent to GIPHY through the PocketChat backend; media requires a configured GIPHY API key.</div>
          </div>}
          {tab === "privacy" && <div className="settings-section"><h3>Privacy</h3><p className="muted">These choices control read receipts, presence visibility and the profile details other users can see.</p>
            <label className="settings-toggle"><span><strong>Read receipts</strong><small>Let people know when you have read their messages.</small></span><input type="checkbox" checked={privacy.readReceipts} onChange={e=>patch("privacy","readReceipts",e.target.checked)}/></label>
            <label className="settings-toggle"><span><strong>Share online status</strong><small>Allow contacts to see when you are online, where presence is available.</small></span><input type="checkbox" checked={privacy.showOnline} onChange={e=>patch("privacy","showOnline",e.target.checked)}/></label>
            <Field label="Last seen visibility"><select className="setting-select" value={privacy.lastSeen} onChange={e=>patch("privacy","lastSeen",e.target.value)}><option value="everyone">Everyone</option><option value="contacts">Accepted contacts</option><option value="nobody">Nobody</option></select></Field>
            <Field label="Profile visibility"><select className="setting-select" value={privacy.profileVisibility} onChange={e=>patch("privacy","profileVisibility",e.target.value)}><option value="everyone">Everyone signed in</option><option value="contacts">Accepted contacts</option><option value="nobody">Hide profile details</option></select></Field>
            <div className="settings-note">Privacy choices sync to your account. Online status is shared only with accepted contacts when enabled, and profile details follow your visibility setting.</div>
          </div>}
        </div>
      </div>
      {notice && <p className={notice.startsWith("Could not") ? "settings-notice error-text" : "settings-notice"} role="status">{notice}</p>}
      <footer className="settings-footer"><button type="button" className="text-btn" onClick={reset}><RotateCcw size={13}/> Reset defaults</button><div><button type="button" className="text-btn" onClick={onClose}>Cancel</button><button type="button" className="primary-btn" disabled={saving} onClick={save}><Save size={14}/>{saving ? "Saving…" : "Save settings"}</button></div></footer>
    </section>
  </div>;
}
