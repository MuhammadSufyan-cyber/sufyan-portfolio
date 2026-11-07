// Cloudinary settings (public by design). Uploads use an *unsigned* preset,
// so don't publish the preset name anywhere else.
export const cloudinaryConfig = {
  cloudName: "q1omtrrr",
  uploadPreset: "sufyan-blog",
  folder: "blog",
};

export const isCloudinaryConfigured = !cloudinaryConfig.uploadPreset.includes("REPLACE_ME");

// Add delivery transformations (auto format + quality, width limit) to a Cloudinary URL.
export function cdnImage(url, width = 1200) {
  if (!url || !/^https:\/\/res\.cloudinary\.com\//.test(url) || !url.includes("/upload/")) return url || "";
  if (/\/upload\/[^/]*f_auto/.test(url)) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${width}/`);
}
