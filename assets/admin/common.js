// Shared admin helpers: slugs, YouTube parsing, Cloudinary upload, Firestore writes.
import { getFirebase } from "./guard.js";
import { cloudinaryConfig, isCloudinaryConfigured } from "../cloudinary-config.js";

export { cdnImage } from "../cloudinary-config.js";
export { escapeHtml, formatDate, toDate } from "../blog-data.js";

// ---------- Slugs ----------
export function slugify(s = "") {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
export const isValidSlug = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80;

// ---------- YouTube ----------
export function parseYoutubeId(input = "") {
  let url;
  try { url = new URL(input.trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (["youtube.com", "youtube-nocookie.com", "music.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else { const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/); if (m) id = m[2]; }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export const youtubeNocookieUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}`;

// ---------- Reading time ----------
export const readingTimeFromWords = (words) => Math.max(1, Math.round(words / 200));

// ---------- Cloudinary upload ----------
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateImage(file) {
  if (!file) return "No file selected.";
  if (!IMAGE_TYPES.includes(file.type)) return "Use a JPG, PNG, WebP, GIF or AVIF image.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is larger than 8 MB.";
  return null;
}

// Upload straight from the browser with the unsigned preset. onProgress(0..1).
export function uploadImage(file, onProgress) {
  return new Promise((resolve, reject) => {
    const problem = validateImage(file);
    if (problem) return reject(new Error(problem));
    if (!isCloudinaryConfigured) return reject(new Error("Cloudinary upload preset isn't set in assets/cloudinary-config.js."));
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", cloudinaryConfig.uploadPreset);
    if (cloudinaryConfig.folder) body.append("folder", cloudinaryConfig.folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let json = {};
      try { json = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) resolve(json.secure_url);
      else reject(new Error(json?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(body);
  });
}

// ---------- Firestore ----------
export async function listAllPosts() {
  const { db, fs } = await getFirebase();
  const snap = await fs.getDocs(fs.collection(db, "posts"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPost(id) {
  const { db, fs } = await getFirebase();
  const snap = await fs.getDoc(fs.doc(db, "posts", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export class SlugTakenError extends Error {
  constructor(slug) { super(`The URL "/blog/${slug}" is already used by another post.`); this.code = "slug-taken"; }
}

// Create or update a post and its slug reservation in one batch.
// `data` must include `slug`. Returns the post id.
export async function savePost(id, data, previousSlug = null) {
  const { db, fs } = await getFirebase();
  const postRef = id ? fs.doc(db, "posts", id) : fs.doc(fs.collection(db, "posts"));
  const slugRef = fs.doc(db, "slugs", data.slug);
  const slugSnap = await fs.getDoc(slugRef);
  if (slugSnap.exists() && slugSnap.data().postId !== postRef.id) throw new SlugTakenError(data.slug);

  const batch = fs.writeBatch(db);
  const payload = { ...data, updatedAt: fs.serverTimestamp() };
  if (!id) payload.createdAt = fs.serverTimestamp();
  batch.set(postRef, payload, { merge: true });
  batch.set(slugRef, { postId: postRef.id });
  if (previousSlug && previousSlug !== data.slug) batch.delete(fs.doc(db, "slugs", previousSlug));
  await batch.commit();
  return postRef.id;
}

export async function setPostStatus(post, status) {
  const { db, fs } = await getFirebase();
  const patch = { status, updatedAt: fs.serverTimestamp() };
  if (status === "published" && !post.publishedAt) patch.publishedAt = fs.serverTimestamp();
  await fs.updateDoc(fs.doc(db, "posts", post.id), patch);
}

// Deleting a post also frees its slug.
export async function deletePost(post) {
  const { db, fs } = await getFirebase();
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, "posts", post.id));
  if (post.slug) batch.delete(fs.doc(db, "slugs", post.slug));
  await batch.commit();
}

export async function timestampFromDate(date) {
  const { fs } = await getFirebase();
  return fs.Timestamp.fromDate(date);
}

// ---------- UI ----------
export function toast(message, kind = "ok") {
  let el = document.getElementById("admin-toast");
  if (!el) { el = document.createElement("div"); el.id = "admin-toast"; document.body.appendChild(el); }
  el.textContent = message;
  el.className = `admin-toast show ${kind}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3200);
}
