// Admin dashboard (/admin): all posts, counts, search, status filter, quick actions.
import { requireAdmin, logout } from "./guard.js";
import { listAllPosts, setPostStatus, deletePost, cdnImage, escapeHtml, formatDate, toDate, toast } from "./common.js";

const $ = (id) => document.getElementById(id);
let posts = [];

const sortKey = (p) => (toDate(p.updatedAt) || toDate(p.createdAt) || new Date(0)).getTime();

function render() {
  const q = $("search").value.trim().toLowerCase();
  const status = $("status-filter").value;
  $("count-total").textContent = posts.length;
  $("count-published").textContent = posts.filter((p) => p.status === "published").length;
  $("count-draft").textContent = posts.filter((p) => p.status !== "published").length;

  const items = posts.filter((p) =>
    (status === "all" || (status === "draft" ? p.status !== "published" : p.status === status)) &&
    (!q || `${p.title} ${p.slug} ${(p.tags || []).join(" ")}`.toLowerCase().includes(q)));

  if (!posts.length) {
    $("list").innerHTML = `<div class="glass-card" style="padding:40px;text-align:center;"><p class="muted" style="margin-bottom:14px;">No posts yet.</p><a class="btn btn-primary btn-sm" href="/admin/editor"><i class="fa-solid fa-plus"></i> Write your first post</a></div>`;
    return;
  }
  if (!items.length) { $("list").innerHTML = `<p class="muted">No posts match.</p>`; return; }

  $("list").innerHTML = items.map((p) => {
    const published = p.status === "published";
    const thumb = p.coverImage?.url
      ? `<img class="dash-thumb" src="${escapeHtml(cdnImage(p.coverImage.url, 200))}" alt="">`
      : `<div class="dash-thumb"><i class="fa-regular fa-image"></i></div>`;
    const date = published ? `Published ${formatDate(p.publishedAt)}` : `Edited ${formatDate(p.updatedAt || p.createdAt)}`;
    const tags = (p.tags || []).slice(0, 4).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join(" ");
    return `
      <div class="glass-card dash-row" data-id="${escapeHtml(p.id)}">
        ${thumb}
        <div>
          <div class="dash-title">${escapeHtml(p.title || "Untitled")}</div>
          <div class="dash-sub">
            <span class="badge-status ${published ? "published" : "draft"}">${published ? "Published" : "Draft"}</span>
            <span>${date}</span>
            ${tags}
          </div>
        </div>
        <div class="dash-actions">
          <a class="btn btn-secondary btn-sm" href="/admin/editor?id=${encodeURIComponent(p.id)}"><i class="fa-solid fa-pen"></i> Edit</a>
          ${published ? `<a class="btn btn-outline btn-sm" href="/blog/${encodeURIComponent(p.slug)}" target="_blank"><i class="fa-solid fa-eye"></i> View</a>` : ""}
          <button class="btn btn-outline btn-sm" data-act="toggle">${published ? '<i class="fa-solid fa-eye-slash"></i> Unpublish' : '<i class="fa-solid fa-rocket"></i> Publish'}</button>
          <button class="btn btn-danger btn-sm" data-act="delete" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join("");

  $("list").querySelectorAll(".dash-row").forEach((row) => {
    const post = posts.find((p) => p.id === row.dataset.id);
    row.querySelector('[data-act="toggle"]').addEventListener("click", (e) => togglePublish(post, e.currentTarget));
    row.querySelector('[data-act="delete"]').addEventListener("click", () => confirmDelete(post));
  });
}

async function togglePublish(post, btn) {
  const next = post.status === "published" ? "draft" : "published";
  if (next === "published" && post.coverImage?.url && !post.coverImage.alt) {
    toast("Add alt text to the cover photo before publishing (open the editor).", "error");
    return;
  }
  btn.disabled = true;
  try {
    await setPostStatus(post, next);
    toast(next === "published" ? `Published "${post.title}"` : `Unpublished "${post.title}"`);
    await load();
  } catch (err) {
    console.error(err);
    toast(`Couldn't update: ${err.message}`, "error");
    btn.disabled = false;
  }
}

function confirmDelete(post) {
  const dlg = $("confirm-delete");
  $("confirm-text").textContent = `"${post.title || "Untitled"}" will be permanently deleted and its URL /blog/${post.slug} freed. Images stay in Cloudinary.`;
  dlg.showModal();
  $("confirm-cancel").onclick = () => dlg.close();
  $("confirm-ok").onclick = async () => {
    $("confirm-ok").disabled = true;
    try {
      await deletePost(post);
      dlg.close();
      toast(`Deleted "${post.title}"`);
      await load();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, "error");
    } finally {
      $("confirm-ok").disabled = false;
    }
  };
}

async function load() {
  posts = (await listAllPosts()).sort((a, b) => sortKey(b) - sortKey(a));
  render();
}

const user = await requireAdmin();
$("app").hidden = false;
$("who").textContent = `Signed in as ${user.email}`;
$("logout").addEventListener("click", logout);
$("search").addEventListener("input", render);
$("status-filter").addEventListener("change", render);
try { await load(); } catch (err) { console.error(err); $("list").innerHTML = `<p class="form-error">Couldn't load posts: ${escapeHtml(err.message)}</p>`; }
