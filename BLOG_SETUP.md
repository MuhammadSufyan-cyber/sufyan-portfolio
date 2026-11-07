# Blog & Admin CMS

Static HTML/CSS/JS site. Firebase handles login and data, Cloudinary stores images, and Vercel serves the files and URL rewrites. There are no serverless functions.

| URL | File |
|---|---|
| `/blog` | `blog.html` + `assets/blog.js` |
| `/blog/<slug>` | `post.html` + `assets/post.js` |
| `/admin/login` | `admin/login.html` |
| `/admin` | `admin/index.html` + `assets/admin/dashboard.js` |
| `/admin/editor` | `admin/editor.html` + `assets/admin/editor.js` |

## One-time setup

1. **Firebase web config:** paste it into `assets/firebase-config.js`.
2. **Firebase Auth:** enable Email/Password. Create the admin user (Authentication → Users → Add user) and copy its **User UID**.
3. **Admin UID:** put it in `ADMIN_UIDS` in `assets/admin/guard.js` and in `firestore.rules`.
4. **Firestore:** create the database. Paste `firestore.rules` into Firestore → Rules → **Publish**.
5. **Authorized domains:** add your Vercel domain under Authentication → Settings → Authorized domains.
6. **Cloudinary:** create an **unsigned** upload preset (asset folder `blog`). Put its name in `assets/cloudinary-config.js`. Don't share the preset name.

## Data

- `posts/{postId}` holds: title, slug, excerpt, contentJson (Tiptap), contentHtml (sanitized), coverImage `{url, alt}`, tags, status (`draft` | `published`), publishedAt/createdAt/updatedAt, readingTime and seo `{metaTitle, metaDescription}`.
- `slugs/{slug}` holds `{postId}`. It's written in the same batch as the post, so two posts can never share a URL.
- No Firestore indexes are needed. Queries only use equality filters and sort in the browser.

## Changing things later

- **Add another admin:** add their UID to `firestore.rules` and to `ADMIN_UIDS`.
- **Rebuild the editor or sanitizer bundles** (only needed after changing `tools/editor/src` or upgrading a package):

  ```bash
  cd tools/editor && npm install && npm run build
  ```

- **Deleting images:** deleting a post doesn't delete its images. Remove them in the Cloudinary dashboard.
