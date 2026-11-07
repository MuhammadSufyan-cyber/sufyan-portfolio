// Admin editor (/admin/editor, /admin/editor?id=<postId>).
import { requireAdmin } from "./guard.js";
import { createEditor, wordCount, highlightCodeBlocks } from "./editor-bundle.js";
import { sanitizeHtml } from "../sanitize-bundle.js";
import {
  getPost, savePost, SlugTakenError, slugify, isValidSlug, parseYoutubeId, readingTimeFromWords,
  uploadImage, validateImage, cdnImage, escapeHtml, formatDate, toDate, timestampFromDate, toast,
} from "./common.js";

const $ = (id) => document.getElementById(id);
const AUTOSAVE_MS = 20000;

const state = {
  id: new URLSearchParams(location.search).get("id"),
  status: "draft",
  savedSlug: null,      // slug as last saved (to free it if it changes)
  publishedAt: null,
  cover: null,          // { url, alt }
  slugTouched: false,
  dirty: false,
  saving: false,
  lastSaved: null,
};

let editor;

// ---------------------------------------------------------------------------
// Small text prompt using <dialog>
// ---------------------------------------------------------------------------
function ask(title, { value = "", placeholder = "", validate } = {}) {
  return new Promise((resolve) => {
    const dlg = $("ask-dialog");
    $("ask-title").textContent = title;
    $("ask-input").value = value;
    $("ask-input").placeholder = placeholder;
    $("ask-error").textContent = "";
    const onSubmit = (e) => {
      if (e.submitter?.value !== "ok") return;
      const v = $("ask-input").value.trim();
      const problem = validate?.(v);
      if (problem) { e.preventDefault(); $("ask-error").textContent = problem; }
    };
    $("ask-form").addEventListener("submit", onSubmit);
    dlg.addEventListener("close", function onClose() {
      dlg.removeEventListener("close", onClose);
      $("ask-form").removeEventListener("submit", onSubmit);
      resolve(dlg.returnValue === "ok" ? $("ask-input").value.trim() : null);
    });
    dlg.returnValue = "";
    dlg.showModal();
    $("ask-input").focus();
  });
}

// ---------------------------------------------------------------------------
// Dirty tracking + status UI
// ---------------------------------------------------------------------------
function markDirty() {
  state.dirty = true;
  $("save-state").textContent = "Unsaved changes";
}

function updateCounts() {
  const words = wordCount(editor);
  $("counts").textContent = `${words} word${words === 1 ? "" : "s"} · ${readingTimeFromWords(words)} min read`;
}

function renderStatus() {
  const published = state.status === "published";
  $("status-badge").textContent = published ? "Published" : "Draft";
  $("status-badge").className = `badge-status ${published ? "published" : "draft"}`;
  $("autosave-hint").textContent = published
    ? "Published posts never change until you click Update."
    : "Drafts autosave every 20 seconds.";
  $("save-buttons").innerHTML = published
    ? `<button class="btn btn-primary" data-save="published"><i class="fa-solid fa-floppy-disk"></i> Update</button>
       <button class="btn btn-outline" data-save="draft"><i class="fa-solid fa-eye-slash"></i> Unpublish</button>`
    : `<button class="btn btn-secondary" data-save="draft"><i class="fa-solid fa-floppy-disk"></i> Save draft</button>
       <button class="btn btn-primary" data-save="published"><i class="fa-solid fa-rocket"></i> Publish</button>`;
  $("save-buttons").querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => save(b.dataset.save)));
  if (state.id && state.savedSlug && published) {
    $("save-buttons").insertAdjacentHTML("beforeend", `<a class="btn btn-outline" href="/blog/${encodeURIComponent(state.savedSlug)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> View live</a>`);
  }
}

function updateSlugHint() {
  const s = $("slug").value.trim();
  $("slug-hint").textContent = `/blog/${s || "…"}`;
  $("slug-hint").classList.toggle("error", !!s && !isValidSlug(s));
}

// ---------------------------------------------------------------------------
// Cover photo
// ---------------------------------------------------------------------------
function renderCover() {
  const has = !!state.cover?.url;
  $("cover-img").hidden = !has;
  $("cover-empty").hidden = has;
  $("cover-remove").hidden = !has;
  if (has) { $("cover-img").src = cdnImage(state.cover.url, 700); $("cover-img").alt = state.cover.alt || ""; }
  $("cover-alt").value = state.cover?.alt || "";
}

async function handleCoverFile(file) {
  const problem = validateImage(file);
  if (problem) return toast(problem, "error");
  const bar = $("cover-progress");
  bar.classList.add("show");
  bar.firstElementChild.style.width = "0%";
  try {
    const url = await uploadImage(file, (p) => { bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
    state.cover = { url, alt: $("cover-alt").value.trim() };
    renderCover();
    markDirty();
    toast("Cover uploaded. Don't forget the alt text.");
    $("cover-alt").focus();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setTimeout(() => bar.classList.remove("show"), 600);
  }
}

function initCover() {
  const drop = $("cover-drop");
  drop.addEventListener("click", () => $("cover-file").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("cover-file").click(); } });
  $("cover-file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) handleCoverFile(f); });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleCoverFile(f); });
  $("cover-alt").addEventListener("input", () => { if (state.cover) state.cover.alt = $("cover-alt").value.trim(); markDirty(); });
  $("cover-remove").addEventListener("click", () => { state.cover = null; renderCover(); markDirty(); });
}

// ---------------------------------------------------------------------------
// Inline images + YouTube
// ---------------------------------------------------------------------------
async function insertInlineImage(file) {
  const problem = validateImage(file);
  if (problem) return toast(problem, "error");
  const status = $("upload-status");
  try {
    const url = await uploadImage(file, (p) => { status.textContent = `Uploading image… ${Math.round(p * 100)}%`; });
    status.textContent = "";
    const alt = await ask("Alt text for this image", { placeholder: "Describe the image for screen readers" });
    editor.chain().focus().setImage({ src: cdnImage(url, 1600), alt: alt || "" }).run();
  } catch (err) {
    status.textContent = "";
    toast(err.message, "error");
  }
}

async function insertYoutube() {
  const link = await ask("YouTube link", {
    placeholder: "https://www.youtube.com/watch?v=…",
    validate: (v) => (parseYoutubeId(v) ? null : "That isn't a valid YouTube link."),
  });
  if (!link) return;
  const id = parseYoutubeId(link);
  editor.chain().focus().setYoutubeVideo({ src: `https://www.youtube.com/watch?v=${id}` }).run();
}

async function editLink() {
  const prev = editor.getAttributes("link").href || "";
  const href = await ask("Link URL (leave empty to remove)", {
    value: prev, placeholder: "https://…",
    validate: (v) => (!v || /^(https?:\/\/|mailto:)/i.test(v) ? null : "Use an https://, http:// or mailto: link."),
  });
  if (href === null) return;
  if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
const COMMANDS = {
  bold: (c) => c.toggleBold(), italic: (c) => c.toggleItalic(), underline: (c) => c.toggleUnderline(),
  strike: (c) => c.toggleStrike(), code: (c) => c.toggleCode(), highlight: (c) => c.toggleHighlight(),
  unsetColor: (c) => c.unsetColor(),
  bulletList: (c) => c.toggleBulletList(), orderedList: (c) => c.toggleOrderedList(), taskList: (c) => c.toggleTaskList(),
  blockquote: (c) => c.toggleBlockquote(), codeBlock: (c) => c.toggleCodeBlock(), hr: (c) => c.setHorizontalRule(),
  table: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  alignLeft: (c) => c.setTextAlign("left"), alignCenter: (c) => c.setTextAlign("center"), alignRight: (c) => c.setTextAlign("right"),
  undo: (c) => c.undo(), redo: (c) => c.redo(),
  addRowAfter: (c) => c.addRowAfter(), addColumnAfter: (c) => c.addColumnAfter(),
  deleteRow: (c) => c.deleteRow(), deleteColumn: (c) => c.deleteColumn(),
  toggleHeaderRow: (c) => c.toggleHeaderRow(), deleteTable: (c) => c.deleteTable(),
};
const ACTIVE = {
  bold: () => editor.isActive("bold"), italic: () => editor.isActive("italic"), underline: () => editor.isActive("underline"),
  strike: () => editor.isActive("strike"), code: () => editor.isActive("code"), highlight: () => editor.isActive("highlight"),
  link: () => editor.isActive("link"), bulletList: () => editor.isActive("bulletList"), orderedList: () => editor.isActive("orderedList"),
  taskList: () => editor.isActive("taskList"), blockquote: () => editor.isActive("blockquote"), codeBlock: () => editor.isActive("codeBlock"),
  alignLeft: () => editor.isActive({ textAlign: "left" }), alignCenter: () => editor.isActive({ textAlign: "center" }),
  alignRight: () => editor.isActive({ textAlign: "right" }),
};

function refreshToolbar() {
  document.querySelectorAll(".tb[data-cmd]").forEach((b) => b.classList.toggle("is-active", !!ACTIVE[b.dataset.cmd]?.()));
  const level = [1, 2, 3, 4].find((l) => editor.isActive("heading", { level: l }));
  $("block-type").value = level ? String(level) : "p";
  $("table-tools").classList.toggle("show", editor.isActive("table"));
}

function initToolbar() {
  document.querySelectorAll(".tb[data-cmd]").forEach((b) => {
    b.type = "button";
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep editor selection
    b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      if (cmd === "link") return editLink();
      if (cmd === "image") return $("inline-file").click();
      if (cmd === "youtube") return insertYoutube();
      COMMANDS[cmd]?.(editor.chain().focus()).run();
    });
  });
  $("block-type").addEventListener("change", (e) => {
    const v = e.target.value;
    const c = editor.chain().focus();
    (v === "p" ? c.setParagraph() : c.setHeading({ level: +v })).run();
  });
  $("text-color").addEventListener("input", (e) => editor.chain().focus().setColor(e.target.value).run());
  $("inline-file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) insertInlineImage(f); });
}

// ---------------------------------------------------------------------------
// Collect + save
// ---------------------------------------------------------------------------
function tagsFromInput() {
  return [...new Set($("tags").value.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 12);
}

async function collect(targetStatus) {
  const words = wordCount(editor);
  const manualDate = $("publish-date").value ? new Date($("publish-date").value) : null;
  let publishedAt = state.publishedAt || null;
  if (manualDate && !isNaN(manualDate)) publishedAt = await timestampFromDate(manualDate);
  else if (targetStatus === "published" && !publishedAt) publishedAt = await timestampFromDate(new Date());
  return {
    title: $("title").value.trim(),
    slug: $("slug").value.trim(),
    excerpt: $("excerpt").value.trim(),
    contentJson: JSON.stringify(editor.getJSON()),
    contentHtml: sanitizeHtml(highlightCodeBlocks(editor.getHTML())),
    coverImage: state.cover?.url ? { url: state.cover.url, alt: (state.cover.alt || "").trim() } : null,
    tags: tagsFromInput(),
    status: targetStatus,
    publishedAt,
    readingTime: readingTimeFromWords(words),
    seo: { metaTitle: $("seo-title").value.trim(), metaDescription: $("seo-desc").value.trim() },
  };
}

function validate(data) {
  if (!data.title) return "Add a title.";
  if (!isValidSlug(data.slug)) return "The URL slug can only use lowercase letters, numbers and dashes.";
  if (data.status === "published") {
    if (editor.isEmpty) return "Write something before publishing.";
    if (data.coverImage && !data.coverImage.alt) return "Add alt text for the cover photo before publishing.";
  }
  return null;
}

async function save(targetStatus, { silent = false } = {}) {
  if (state.saving) return;
  $("form-error").textContent = "";
  if (!$("slug").value.trim() && $("title").value.trim()) $("slug").value = slugify($("title").value);
  const data = await collect(targetStatus);
  const problem = validate(data);
  if (problem) { if (!silent) { $("form-error").textContent = problem; toast(problem, "error"); } return; }

  state.saving = true;
  $("save-state").textContent = silent ? "Autosaving…" : "Saving…";
  try {
    const wasNew = !state.id;
    const prevStatus = state.status;
    state.id = await savePost(state.id, data, state.savedSlug);
    state.savedSlug = data.slug;
    state.status = data.status;
    state.publishedAt = data.publishedAt;
    state.dirty = false;
    state.lastSaved = new Date();
    if (wasNew) history.replaceState(null, "", `/admin/editor?id=${encodeURIComponent(state.id)}`);
    $("save-state").textContent = `Saved ${state.lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderStatus();
    if (!silent) {
      const msg = data.status === "published"
        ? (prevStatus === "published" ? "Post updated." : "Published! It's live on /blog.")
        : (prevStatus === "published" ? "Unpublished. It's a draft again." : "Draft saved.");
      toast(msg);
    }
  } catch (err) {
    console.error(err);
    const msg = err instanceof SlugTakenError ? err.message : `Save failed: ${err.message}`;
    $("form-error").textContent = msg;
    $("save-state").textContent = "Not saved";
    if (!silent || err instanceof SlugTakenError) toast(msg, "error");
  } finally {
    state.saving = false;
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------
function openPreview() {
  const tags = tagsFromInput().map((t) => `<span class="post-tag">#${escapeHtml(t)}</span>`).join("");
  const words = wordCount(editor);
  const date = $("publish-date").value ? new Date($("publish-date").value) : (toDate(state.publishedAt) || new Date());
  $("preview-article").innerHTML = `
    ${state.cover?.url ? `<img class="article-cover" src="${escapeHtml(cdnImage(state.cover.url, 1400))}" alt="${escapeHtml(state.cover.alt || "")}">` : ""}
    <header class="article-header">
      <div class="post-tags">${tags}</div>
      <h1 class="article-title">${escapeHtml($("title").value || "Untitled")}</h1>
      <div class="post-meta">
        <span><i class="fa-regular fa-calendar"></i>${formatDate(date)}</span>
        <span><i class="fa-regular fa-clock"></i>${readingTimeFromWords(words)} min read</span>
      </div>
    </header>
    <div class="prose">${sanitizeHtml(highlightCodeBlocks(editor.getHTML()))}</div>`;
  $("preview").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closePreview() { $("preview").classList.remove("show"); document.body.style.overflow = ""; }

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function toLocalInput(ts) {
  const d = toDate(ts);
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Keep the sticky toolbar just below the (variable-height) admin bar.
function trackAdminBarHeight() {
  const bar = document.querySelector(".admin-bar");
  const set = () => document.documentElement.style.setProperty("--admin-bar-h", `${bar.offsetHeight}px`);
  new ResizeObserver(set).observe(bar);
  set();
}

async function boot() {
  await requireAdmin();
  trackAdminBarHeight();

  let post = null;
  if (state.id) {
    try { post = await getPost(state.id); } catch (err) { console.error(err); }
    if (!post) { toast("That post wasn't found. Starting a new one.", "error"); state.id = null; history.replaceState(null, "", "/admin/editor"); }
  }

  let content = "";
  if (post) {
    state.status = post.status === "published" ? "published" : "draft";
    state.savedSlug = post.slug;
    state.publishedAt = post.publishedAt || null;
    state.cover = post.coverImage?.url ? { ...post.coverImage } : null;
    state.slugTouched = true;
    $("title").value = post.title || "";
    $("slug").value = post.slug || "";
    $("excerpt").value = post.excerpt || "";
    $("tags").value = (post.tags || []).join(", ");
    $("seo-title").value = post.seo?.metaTitle || "";
    $("seo-desc").value = post.seo?.metaDescription || "";
    $("publish-date").value = post.publishedAt ? toLocalInput(post.publishedAt) : "";
    try { content = post.contentJson ? JSON.parse(post.contentJson) : (post.contentHtml || ""); }
    catch { content = post.contentHtml || ""; }
    $("save-state").textContent = `Last saved ${formatDate(post.updatedAt)}`;
    document.title = `${post.title || "Untitled"} · Editor`;
  }

  $("app").hidden = false;
  editor = createEditor({
    element: $("editor"),
    content,
    onUpdate: () => { markDirty(); updateCounts(); },
    onImage: () => $("inline-file").click(),
    onYoutube: insertYoutube,
    onPasteImage: insertInlineImage,
  });
  editor.on("selectionUpdate", refreshToolbar);
  editor.on("transaction", refreshToolbar);

  initToolbar();
  initCover();
  renderCover();
  renderStatus();
  updateCounts();
  updateSlugHint();
  refreshToolbar();

  $("title").addEventListener("input", () => {
    if (!state.slugTouched) { $("slug").value = slugify($("title").value); updateSlugHint(); }
    markDirty();
  });
  $("slug").addEventListener("input", () => { state.slugTouched = true; updateSlugHint(); markDirty(); });
  $("slug").addEventListener("blur", () => { $("slug").value = slugify($("slug").value); updateSlugHint(); });
  ["excerpt", "tags", "seo-title", "seo-desc", "publish-date"].forEach((id) => $(id).addEventListener("input", markDirty));

  $("preview-btn").addEventListener("click", openPreview);
  $("preview-close").addEventListener("click", closePreview);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(state.status === "published" ? "published" : "draft"); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && editor.isFocused) { e.preventDefault(); editLink(); }
    if (e.key === "Escape" && $("preview").classList.contains("show")) closePreview();
  });

  window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });

  // Autosave drafts only — published posts never change silently.
  setInterval(() => {
    if (state.dirty && state.status !== "published" && $("title").value.trim() && !state.saving) save("draft", { silent: true });
  }, AUTOSAVE_MS);

  $("title").focus();
}

boot().catch((err) => { if (err.message !== "redirecting" && err.message !== "not-configured") console.error(err); });
