// HTML sanitizer used before saving a post and again before rendering it.
// Built with esbuild into assets/sanitize-bundle.js (see ../build.mjs).
import DOMPurify from "dompurify";

const YT_EMBED = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}(\?[^"'<>\s]*)?$/;

let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Images must be https.
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || "";
      if (!/^https:\/\//i.test(src)) { node.remove(); return; }
      node.setAttribute("loading", "lazy");
      node.setAttribute("decoding", "async");
    }
    // Links: http(s)/mailto only, and always safe target/rel.
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (href && !/^(https?:|mailto:|#|\/)/i.test(href)) node.removeAttribute("href");
      if (/^https?:/i.test(href)) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }
    if (node.tagName === "IFRAME") {
      // Only youtube-nocookie embeds survive.
      if (!YT_EMBED.test(node.getAttribute("src") || "")) { node.remove(); return; }
      node.setAttribute("allowfullscreen", "true");
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      node.setAttribute("allow", "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
    }
  });
}

export function sanitizeHtml(html = "") {
  installHooks();
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["target", "allowfullscreen", "frameborder", "allow", "data-youtube-video", "data-type", "data-checked", "colspan", "rowspan"],
    FORBID_TAGS: ["style", "script", "form", "input", "button", "object", "embed", "svg", "math"],
    FORBID_ATTR: ["srcset"],
    ALLOW_DATA_ATTR: false,
  });
}
