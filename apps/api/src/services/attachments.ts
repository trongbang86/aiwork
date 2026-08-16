import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';

export interface Storage { put(key: string, bytes: Buffer): Promise<void>; }
export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}
  async put(key: string, bytes: Buffer) { const path = join(this.root, key); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); }
}
export class AttachmentService {
  constructor(private readonly storage: Storage) {}
  async process(id: string, filename: string, mimeType: string, bytes: Buffer) {
    if (!mimeType.startsWith('image/')) { const key = `${id}/original${extname(filename)}`; await this.storage.put(key, bytes); return { storageKey: key, size: bytes.length, variants: {} }; }
    const image = sharp(bytes).rotate();
    const original = await image.clone().resize({ width: 2400, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    const storageKey = `${id}/original.png`; await this.storage.put(storageKey, original);
    const variants: Record<string, Record<string,string>> = {};
    for (const [name,width] of Object.entries({ thumbnail:240, small:480, medium:960, large:1600 })) {
      const webp = await image.clone().resize({ width, withoutEnlargement:true }).webp({ quality:82 }).toBuffer();
      const avif = await image.clone().resize({ width, withoutEnlargement:true }).avif({ quality:55 }).toBuffer();
      const variant = { webp:`${id}/${name}.webp`, avif:`${id}/${name}.avif` };
      variants[name] = variant;
      await Promise.all([this.storage.put(variant.webp,webp),this.storage.put(variant.avif,avif)]);
    }
    return { storageKey, size: original.length, variants };
  }
}
