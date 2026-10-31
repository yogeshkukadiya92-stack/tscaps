import type { OutputFormat, RenderOutputChunk } from '@tscaps/engine';
import type { ExportWriter } from '@core/export/domain/ExportWriter';

// Inline structural type — lib.dom in our TS version doesn't yet
// declare showSaveFilePicker, so the writer leans on duck-typed access.
type ShowSaveFilePicker = (options: {
  suggestedName?: string;
  types?: ReadonlyArray<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

interface SaveFileHandle {
  createWritable: () => Promise<WritableStream<unknown>>;
  getFile?: () => Promise<File>;
  // Chromium 110+; absent elsewhere, so removal is best-effort.
  remove?: () => Promise<void>;
}

/**
 * Writes encoded bytes straight to a disk file the user picks through
 * the browser's save dialog (the File System Access API). Bytes never
 * touch the JS heap — the renderer streams them through to the file
 * the user selected and the export is complete the moment the stream
 * closes, so {@link finalize} has nothing to do.
 *
 * The primary path in Chromium. {@link open} rejects with an
 * `AbortError` when the user dismisses the picker; callers treat that
 * as a cancellation of the entire export.
 */
export class FilePickerExportWriter implements ExportWriter {

  static isSupported(): boolean {
    return typeof window !== 'undefined'
      && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
  }

  private writable: WritableStream<unknown> | null = null;
  // Set while the picked file is one this export created empty, so a
  // failed or cancelled export can take it away instead of leaving a
  // 0-byte file behind. A file the user chose to overwrite is never removed.
  private emptyHandle: SaveFileHandle | null = null;

  async open(format: OutputFormat): Promise<void> {
    const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
    if (typeof picker !== 'function') throw new Error('showSaveFilePicker is not available');
    const isWebm = format === 'webm';
    const handle = await picker({
      suggestedName: `subtitled.${format}`,
      types: [
        {
          description: isWebm ? 'WebM video' : 'MP4 video',
          accept: { [isWebm ? 'video/webm' : 'video/mp4']: [isWebm ? '.webm' : '.mp4'] },
        },
      ],
    });
    this.emptyHandle = (await handle.getFile?.().catch(() => null))?.size === 0 ? handle : null;
    try {
      this.writable = await handle.createWritable();
    } catch (err) {
      await this.removeEmptyFile();
      throw err;
    }
  }

  stream(): WritableStream<RenderOutputChunk> {
    if (!this.writable) throw new Error('writer not opened');
    return this.writable as unknown as WritableStream<RenderOutputChunk>;
  }

  async finalize(): Promise<File | null> {
    this.emptyHandle = null;
    return null;
  }

  async abort(): Promise<void> {
    if (this.writable) {
      try {
        await this.writable.abort();
      } catch {
        // The writable may already be closed/aborted by the renderer's
        // own cancellation path; that's fine.
      }
      this.writable = null;
    }
    await this.removeEmptyFile();
  }

  private async removeEmptyFile(): Promise<void> {
    const handle = this.emptyHandle;
    this.emptyHandle = null;
    try {
      await handle?.remove?.();
    } catch {
      // Best-effort: an empty file left behind is harmless.
    }
  }

  dispose(): void {
    this.writable = null;
  }
}
