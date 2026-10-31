import type { ExportWriter } from '@core/export/domain/ExportWriter';

/**
 * Builds a fresh {@link ExportWriter} per export. Implementations own
 * any runtime resources (workers, file handles) and isolate them per
 * call so concurrent exports cannot collide. Implementations are
 * expected to always return a usable writer; consumers do not need to
 * handle the case of "no writer available".
 */
export interface ExportWriterFactory {
  create(): ExportWriter;
  /**
   * A writer that needs no browser permission and hands the finished
   * file to a plain download. Used when the {@link create} writer cannot
   * open, e.g. the save dialog was refused because the click that
   * started the export is no longer active.
   */
  createFallback?(): ExportWriter;
}
