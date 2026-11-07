// Public post page (/blog/<slug>, served by post.html via a vercel.json rewrite).
import { initChrome, fetchPostBySlug, formatDate, toDate, escapeHtml, setMeta, SITE, AUTHOR } from "./blog-data.js";
import { cdnImage } from "./cloudinary-config.js";
import { sanitizeHtml } from "./sanitize-bundle.js";

const el = document.getElementById("article");
const back = `<a class="article-back" href="/blog"><i class="fa-solid fa-arrow-left"></i> All posts</a>`;

function notFound(message = "This post doesn't exist or isn't published.") {
  setMeta({ title: `Post not found | ${AUTHOR}`, description: message, noindex: true });
  el.innerHTML = `${back}<div class="blog-state"><i class="fa-solid fa-ghost"></i><h1>Post not found</h1>${escapeHtml(message)}<div style="margin-top:20px;"><a class="btn btn-primary btn-sm" href="/blog">Browse all posts</a></div></div>`;
}

function slugFromUrl() {
  const m = location.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(location.search).get("slug"); // fallback: /post.html?slug=…
}

function addStructuredData(p, url, image) {
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.seo?.metaDescription || p.excerpt || "",
    image: image ? [image] : undefined,
    datePublished: toDate(p.publishedAt || p.createdAt)?.toISOString(),
    dateModified: toDate(p.updatedAt || p.publishedAt)?.toISOString(),
    author: { "@type": "Person", name: AUTHOR, url: SITE },
    mainEntityOfPage: url,
    keywords: (p.tags || []).join(", "),
  });
  document.head.appendChild(s);
}

async function main() {
  initChrome();
  const slug = slugFromUrl();
  if (!slug) return notFound("No post selected.");

  let p;
  try {
    p = await fetchPostBySlug(slug);
  } catch (err) {
    if (err.message === "not-configured") return notFound("The blog isn't connected to Firebase yet.");
    console.error(err);
    el.innerHTML = `${back}<div class="blog-state"><i class="fa-solid fa-triangle-exclamation"></i>Couldn't load this post. Please try again later.</div>`;
    return;
  }
  if (!p) return notFound();

  const url = `${SITE}/blog/${encodeURIComponent(p.slug)}`;
  const image = p.coverImage?.url ? cdnImage(p.coverImage.url, 1200) : `${SITE}/avatar.jpg`;
  const title = p.seo?.metaTitle || p.title;
  const description = p.seo?.metaDescription || p.excerpt || p.title;
  setMeta({ title: `${title} | ${AUTHOR}`, description, url, image, type: "article" });
  addStructuredData(p, url, image);

  const tags = (p.tags || []).map((t) => `<a class="post-tag" href="/blog?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join("");
  const shareText = encodeURIComponent(p.title);
  const shareUrl = encodeURIComponent(url);

  el.innerHTML = `
    ${back}
    ${p.coverImage?.url ? `<img class="article-cover" src="${escapeHtml(cdnImage(p.coverImage.url, 1400))}" alt="${escapeHtml(p.coverImage.alt || "")}">` : ""}
    <header class="article-header">
      <div class="post-tags">${tags}</div>
      <h1 class="article-title">${escapeHtml(p.title)}</h1>
      <div class="post-meta">
        <span><i class="fa-regular fa-calendar"></i>${formatDate(p.publishedAt || p.createdAt)}</span>
        <span><i class="fa-regular fa-clock"></i>${p.readingTime || 1} min read</span>
        <span><i class="fa-regular fa-user"></i>${AUTHOR}</span>
      </div>
    </header>
    <div class="prose">${sanitizeHtml(p.contentHtml || "")}</div>
    <div class="share-row">
      <strong>Share:</strong>
      <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}"><i class="fa-brands fa-x-twitter"></i> X</a>
      <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}"><i class="fa-brands fa-linkedin"></i> LinkedIn</a>
      <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${shareText}%20${shareUrl}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
      <button class="btn btn-secondary btn-sm" id="copy-link" type="button"><i class="fa-solid fa-link"></i> Copy link</button>
    </div>`;

  document.getElementById("copy-link").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(url); btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied'; }
    catch { prompt("Copy this link:", url); }
  });
}

main();
