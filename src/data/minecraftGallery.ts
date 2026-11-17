/**
 * Minecraft gallery. Put images in public/assets/minecraft/ and add an entry here.
 * Newest first.
 */
export interface GalleryShot { src: string; title: string; by?: string }

export const MINECRAFT_GALLERY: GalleryShot[] = [];
