import React, { useEffect, useState } from "react";
import { Search, X, Image as ImageIcon, LoaderCircle } from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

export default function MediaPicker({ token, onSelect, onClose }) {
  const [tab, setTab] = useState("gifs");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadMedia(search = query, type = tab) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type: type === "stickers" ? "sticker" : "gif" });
      if (search.trim()) params.set("q", search.trim().slice(0, 50));
      const response = await fetch(API + "/api/media/giphy?" + params.toString(), {
        headers: token ? { Authorization: "Bearer " + token } : {}
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load media.");
      setResults(data.results || []);
    } catch (err) {
      setResults([]);
      setError(err.message || "Could not load GIFs and stickers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMedia("", tab); }, [tab]);

  function submit(event) {
    event.preventDefault();
    loadMedia(query, tab);
  }

  return <div className="profile-overlay media-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="media-dialog" role="dialog" aria-modal="true" aria-label="GIF and sticker picker">
      <header className="settings-heading"><div><p className="eyebrow">POCKETCHAT MEDIA</p><h2>GIFs & Stickers</h2></div><button type="button" className="icon-btn" aria-label="Close media picker" onClick={onClose}><X size={17}/></button></header>
      <div className="media-tabs"><button type="button" className={tab==="gifs"?"settings-tab active":"settings-tab"} onClick={()=>setTab("gifs")}><ImageIcon size={14}/>GIFs</button><button type="button" className={tab==="stickers"?"settings-tab active":"settings-tab"} onClick={()=>setTab("stickers")}>Stickers</button></div>
      <form className="media-search" onSubmit={submit}><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tab==="gifs"?"Search GIFs…":"Search stickers…"} maxLength={50}/><button className="primary-btn" type="submit" disabled={loading}>Search</button></form>
      {loading ? <div className="media-state"><LoaderCircle size={20} className="spin-icon"/>Loading…</div> : error ? <div className="media-state media-error"><strong>Media unavailable</strong><span>{error}</span><button className="text-btn" type="button" onClick={()=>loadMedia(query,tab)}>Try again</button></div> : results.length ? <div className="media-grid">{results.map(item=><button className="media-item" type="button" key={item.id} title={item.title || "Send media"} onClick={()=>onSelect({ type: tab==="stickers"?"sticker":"gif", mediaUrl:item.mediaUrl, previewUrl:item.previewUrl, title:item.title || "" })}><img src={item.previewUrl || item.mediaUrl} alt={item.title || tab} loading="lazy"/><span>{item.title || (tab==="stickers"?"Sticker":"GIF")}</span></button>)}</div> : <div className="media-state"><ImageIcon size={22}/><strong>No results</strong><span>Try a different search.</span></div>}
      <footer className="giphy-attribution">Powered by <strong>GIPHY</strong></footer>
    </section>
  </div>;
}
