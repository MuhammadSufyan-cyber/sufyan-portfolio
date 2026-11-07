// Firestore reads for the public blog pages + small shared helpers.
import { firebaseConfig, FIREBASE_SDK, isFirebaseConfigured } from "./firebase-config.js";

// Public URL of the site, used for canonical links and share URLs.
// Follows whatever domain the page is served from (Vercel URL or a custom domain).
export const SITE = location.origin;
export const AUTHOR = "Muhammad Sufyan";

let fs = null;   // Firestore module
let db = null;

export async function getDb() {
  if (!isFirebaseConfigured) throw new Error("not-configured");
  if (db) return { db, fs };
  const [{ initializeApp, getApps }, firestore] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  fs = firestore;
  db = firestore.getFirestore(app);
  return { db, fs };
}

export function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d) ? null : d;
}

export function formatDate(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
}

export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const sortKey = (p) => (toDate(p.publishedAt) || toDate(p.createdAt) || new Date(0)).getTime();

// All published posts, newest first. Equality filter only → no index needed.
export async function fetchPublishedPosts() {
  const { db, fs } = await getDb();
  const snap = await fs.getDocs(fs.query(fs.collection(db, "posts"), fs.where("status", "==", "published")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => sortKey(b) - sortKey(a));
}

// Resolve slug → postId via the slugs collection, then load the post.
// Returns null when the slug is unknown or the post isn't published.
export async function fetchPostBySlug(slug) {
  const { db, fs } = await getDb();
  const slugSnap = await fs.getDoc(fs.doc(db, "slugs", slug));
  if (!slugSnap.exists()) return null;
  try {
    const postSnap = await fs.getDoc(fs.doc(db, "posts", slugSnap.data().postId));
    if (!postSnap.exists()) return null;
    const post = { id: postSnap.id, ...postSnap.data() };
    return post.status === "published" ? post : null;
  } catch (err) {
    if (err?.code === "permission-denied") return null; // draft: rules hide it
    throw err;
  }
}

// ---------- Theme (same localStorage key as the portfolio home page) ----------
const THEME_KEY = "sufyan_portfolio_theme";
const THEME_ICONS = { cyber: "fa-bolt", ocean: "fa-water", light: "fa-sun" };

export function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || "cyber"; } catch { return "cyber"; }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
  document.querySelectorAll(".theme-option").forEach((o) => o.classList.toggle("active", o.dataset.themeVal === theme));
  const btn = document.getElementById("theme-btn");
  if (btn) btn.innerHTML = `<i class="fa-solid ${THEME_ICONS[theme] || "fa-palette"}"></i>`;
}

// Theme switcher, sticky nav, mobile menu, footer year.
export function initChrome() {
  applyTheme(readTheme());
  const btn = document.getElementById("theme-btn");
  const dd = document.getElementById("theme-dropdown");
  if (btn && dd) {
    btn.addEventListener("click", (e) => { e.stopPropagation(); dd.classList.toggle("show"); });
    document.addEventListener("click", () => dd.classList.remove("show"));
    document.querySelectorAll(".theme-option").forEach((o) =>
      o.addEventListener("click", () => { applyTheme(o.dataset.themeVal); dd.classList.remove("show"); }));
  }
  const nav = document.getElementById("navbar");
  const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll); onScroll();
  const toggle = document.getElementById("mobile-toggle");
  const drawer = document.getElementById("mobile-drawer");
  toggle?.addEventListener("click", () => {
    drawer.classList.toggle("open");
    toggle.innerHTML = drawer.classList.contains("open") ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
  });
  const year = document.getElementById("current-year");
  if (year) year.textContent = new Date().getFullYear();
}

export function setMeta({ title, description, url, image, type = "website", noindex = false }) {
  if (title) document.title = title;
  const upsert = (sel, make) => { let el = document.head.querySelector(sel); if (!el) { el = make(); document.head.appendChild(el); } return el; };
  const meta = (attr, key, value) => {
    if (value == null) return;
    upsert(`meta[${attr}="${key}"]`, () => { const m = document.createElement("meta"); m.setAttribute(attr, key); return m; }).setAttribute("content", value);
  };
  meta("name", "description", description);
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:type", type);
  meta("property", "og:url", url);
  meta("property", "og:image", image);
  meta("name", "twitter:card", image ? "summary_large_image" : "summary");
  meta("name", "twitter:title", title);
  meta("name", "twitter:description", description);
  meta("name", "twitter:image", image);
  if (url) upsert('link[rel="canonical"]', () => { const l = document.createElement("link"); l.rel = "canonical"; return l; }).href = url;
  if (noindex) meta("name", "robots", "noindex");
}
