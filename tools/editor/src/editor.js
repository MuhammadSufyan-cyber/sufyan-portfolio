// Tiptap editor bundle for the blog admin.
// Built with esbuild into assets/admin/editor-bundle.js (see ../build.mjs).
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Suggestion from "@tiptap/suggestion";
import { createLowlight, common } from "lowlight";

const lowlight = createLowlight(common);

// ---------------------------------------------------------------------------
// Slash command menu
// ---------------------------------------------------------------------------
function buildCommands(handlers) {
  return [
    { title: "Text", hint: "Plain paragraph", keys: "paragraph p", run: (c) => c.setParagraph() },
    { title: "Heading 1", hint: "Big section title", keys: "h1 title", run: (c) => c.setHeading({ level: 1 }) },
    { title: "Heading 2", hint: "Section heading", keys: "h2", run: (c) => c.setHeading({ level: 2 }) },
    { title: "Heading 3", hint: "Sub-heading", keys: "h3", run: (c) => c.setHeading({ level: 3 }) },
    { title: "Heading 4", hint: "Small heading", keys: "h4", run: (c) => c.setHeading({ level: 4 }) },
    { title: "Bullet list", hint: "Unordered list", keys: "ul bullets", run: (c) => c.toggleBulletList() },
    { title: "Numbered list", hint: "Ordered list", keys: "ol numbers", run: (c) => c.toggleOrderedList() },
    { title: "Task list", hint: "Checklist", keys: "todo checkbox", run: (c) => c.toggleTaskList() },
    { title: "Quote", hint: "Blockquote", keys: "blockquote", run: (c) => c.toggleBlockquote() },
    { title: "Code block", hint: "With syntax highlighting", keys: "pre snippet", run: (c) => c.toggleCodeBlock() },
    { title: "Divider", hint: "Horizontal line", keys: "hr rule line", run: (c) => c.setHorizontalRule() },
    { title: "Table", hint: "3 × 3 table", keys: "grid", run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { title: "Image", hint: "Upload an image", keys: "picture photo", run: (c) => { c.run(); handlers.onImage?.(); return null; } },
    { title: "YouTube", hint: "Embed a video", keys: "video embed", run: (c) => { c.run(); handlers.onYoutube?.(); return null; } },
  ];
}

function slashMenuExtension(handlers) {
  return Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      const commands = buildCommands(handlers);
      return [
        Suggestion({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return commands.filter((c) => !q || c.title.toLowerCase().includes(q) || c.keys.includes(q)).slice(0, 14);
          },
          command: ({ editor, range, props }) => {
            const chain = editor.chain().focus().deleteRange(range);
            const result = props.run(chain);
            if (result) result.run();
          },
          render: () => {
            let el; let items = []; let index = 0; let command;
            const draw = () => {
              el.innerHTML = items.length
                ? items.map((it, i) => `<button type="button" class="slash-item${i === index ? " active" : ""}" data-i="${i}"><strong>${it.title}</strong><span>${it.hint}</span></button>`).join("")
                : `<div class="slash-empty">No matches</div>`;
              el.querySelectorAll(".slash-item").forEach((b) =>
                b.addEventListener("mousedown", (e) => { e.preventDefault(); command(items[+b.dataset.i]); }));
            };
            const place = (rect) => {
              if (!rect) return;
              const r = rect();
              el.style.left = `${Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - 270)}px`;
              el.style.top = `${r.bottom + window.scrollY + 6}px`;
            };
            return {
              onStart: (props) => {
                el = document.createElement("div");
                el.className = "slash-menu";
                document.body.appendChild(el);
                items = props.items; index = 0; command = props.command;
                draw(); place(props.clientRect);
              },
              onUpdate: (props) => { items = props.items; index = 0; command = props.command; draw(); place(props.clientRect); },
              onKeyDown: ({ event }) => {
                if (event.key === "ArrowDown") { index = (index + 1) % Math.max(items.length, 1); draw(); return true; }
                if (event.key === "ArrowUp") { index = (index - 1 + items.length) % Math.max(items.length, 1); draw(); return true; }
                if (event.key === "Enter") { if (items[index]) command(items[index]); return true; }
                if (event.key === "Escape") { el?.remove(); return true; }
                return false;
              },
              onExit: () => { el?.remove(); el = null; },
            };
          },
        }),
      ];
    },
  });
}

// ---------------------------------------------------------------------------
// YouTube link parsing → youtube-nocookie embed URL
// ---------------------------------------------------------------------------
export function parseYoutubeId(input = "") {
  let url;
  try { url = new URL(input.trim()); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const ok = /^[A-Za-z0-9_-]{11}$/;
  let id = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (["youtube.com", "youtube-nocookie.com", "music.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && ok.test(id) ? id : null;
}

export function youtubeEmbedUrl(id) {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

// ---------------------------------------------------------------------------
// Editor factory
// ---------------------------------------------------------------------------
export function createEditor({ element, content, placeholder = "Start writing, or press / for commands…", onUpdate, onImage, onYoutube, onPasteImage }) {
  const editor = new Editor({
    element,
    content: content || "",
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        validate: (href) => /^(https?:|mailto:)/i.test(href),
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }), // null = auto-detect
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: true, controls: true, width: 640, height: 360, HTMLAttributes: { class: "yt-embed" } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      slashMenuExtension({ onImage, onYoutube }),
    ],
    editorProps: {
      handlePaste: (view, event) => {
        const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
        if (file && onPasteImage) { onPasteImage(file); return true; }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false;
        const file = [...(event.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
        if (file && onPasteImage) {
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) editor.commands.setTextSelection(pos.pos);
          onPasteImage(file);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => onUpdate?.(editor),
  });
  return editor;
}

export function wordCount(editor) {
  return editor.storage.characterCount.words();
}

// ---------------------------------------------------------------------------
// Bake syntax highlighting into saved HTML (Tiptap only highlights live in the
// editor via decorations, so getHTML() has plain code blocks).
// ---------------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function hastToHtml(node) {
  if (node.type === "text") return esc(node.value);
  const inner = (node.children || []).map(hastToHtml).join("");
  if (node.type === "element") {
    const cls = (node.properties?.className || []).join(" ");
    return `<span${cls ? ` class="${cls}"` : ""}>${inner}</span>`;
  }
  return inner;
}

export function highlightCodeBlocks(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  doc.querySelectorAll("pre > code").forEach((code) => {
    const text = code.textContent;
    const lang = [...code.classList].find((c) => c.startsWith("language-"))?.slice(9);
    let tree;
    try { tree = lang && lowlight.registered(lang) ? lowlight.highlight(lang, text) : lowlight.highlightAuto(text); }
    catch { return; }
    code.innerHTML = hastToHtml(tree);
    code.classList.add("hljs");
  });
  return doc.body.firstElementChild.innerHTML;
}
