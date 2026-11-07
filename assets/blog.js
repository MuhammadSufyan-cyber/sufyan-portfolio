// Public blog list (/blog): search, tag filter, "Load more" after 9 posts.
import { initChrome, fetchPublishedPosts, formatDate, escapeHtml, setMeta, SITE } from "./blog-data.js";
import { cdnImage } from "./cloudinary-config.js";

const PAGE = 9;

export function postRow(p, { variant = "row" } = {}) {
  const cover = p.coverImage?.url
    ? `<img src="${escapeHtml(cdnImage(p.coverImage.url, variant === "card" ? 800 : 480))}" alt="${escapeHtml(p.coverImage.alt || "")}" loading="lazy">`
    : `<div class="cover-fallback"><i class="fa-solid fa-feather-pointed"></i></div>`;
  const tags = (p.tags || []).slice(0, 4).map((t) => `<span class="post-tag">#${escapeHtml(t)}</span>`).join("");
  const cls = variant === "card" ? "home-post" : "post-row";
  return `
    <a class="${cls} glass-card spotlight-card" href="/blog/${encodeURIComponent(p.slug)}">
      <div class="post-row-cover">${cover}</div>
      <div class="post-row-body">
        <div class="post-meta">
          <span><i class="fa-regular fa-calendar"></i>${formatDate(p.publishedAt || p.createdAt)}</span>
          <span><i class="fa-regular fa-clock"></i>${p.readingTime || 1} min read</span>
        </div>
        <h2 class="post-row-title">${escapeHtml(p.title)}</h2>
        <p class="post-row-excerpt">${escapeHtml(p.excerpt || "")}</p>
        <div class="post-tags">${tags}</div>
      </div>
    </a>`;
}

export function initSpotlight(root = document) {
  root.querySelectorAll(".spotlight-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", `${e.clientX - r.left}px`);
      card.style.setProperty("--mouse-y", `${e.clientY - r.top}px`);
    });
  });
}

const state = (icon, text) => `<div class="blog-state"><i class="fa-solid ${icon}"></i>${text}</div>`;

async function main() {
  initChrome();
  setMeta({ url: `${SITE}/blog` });

  const list = document.getElementById("posts");
  const search = document.getElementById("search");
  const tagBox = document.getElementById("tag-filters");
  const moreWrap = document.getElementById("load-more-wrap");
  let posts = [];
  let shown = PAGE;
  const params = new URLSearchParams(location.search);
  let activeTag = params.get("tag");

  const filtered = () => {
    const q = search.value.trim().toLowerCase();
    return posts.filter((p) =>
      (!activeTag || (p.tags || []).includes(activeTag)) &&
      (!q || `${p.title} ${p.excerpt || ""} ${(p.tags || []).join(" ")}`.toLowerCase().includes(q)));
  };

  const render = () => {
    const items = filtered();
    list.innerHTML = items.length ? items.slice(0, shown).map((p) => postRow(p)).join("") : state("fa-magnifying-glass", "No posts match your search.");
    moreWrap.hidden = items.length <= shown;
    initSpotlight(list);
  };

  const renderTags = () => {
    const tags = [...new Set(posts.flatMap((p) => p.tags || []))].sort();
    tagBox.innerHTML = tags.map((t) => `<button class="tag-filter${t === activeTag ? " active" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join("");
    tagBox.querySelectorAll(".tag-filter").forEach((b) => b.addEventListener("click", () => {
      activeTag = activeTag === b.dataset.tag ? null : b.dataset.tag;
      const u = new URL(location.href);
      activeTag ? u.searchParams.set("tag", activeTag) : u.searchParams.delete("tag");
      history.replaceState(null, "", u);
      shown = PAGE; renderTags(); render();
    }));
  };

  try {
    posts = await fetchPublishedPosts();
  } catch (err) {
    list.innerHTML = err.message === "not-configured"
      ? state("fa-plug-circle-xmark", "The blog isn't connected to Firebase yet.")
      : state("fa-triangle-exclamation", "Couldn't load posts. Please try again later.");
    if (err.message !== "not-configured") console.error(err);
    return;
  }

  if (!posts.length) { list.innerHTML = state("fa-feather-pointed", "No posts yet. The first one is coming soon!"); return; }

  document.getElementById("toolbar").hidden = false;
  renderTags(); render();
  search.addEventListener("input", () => { shown = PAGE; render(); });
  document.getElementById("load-more").addEventListener("click", () => { shown += PAGE; render(); });
}

if (document.getElementById("posts")) main();
