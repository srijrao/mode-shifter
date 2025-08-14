/**
 * Small helpers for working with "modes" and recording simple mapping data.
 *
 * This file contains small, pure functions so they are easy to test and
 * understand. Each function is documented with explanatory comments geared
 * toward beginners learning TypeScript and immutable-style updates.
 */

/**
 * A very small description of a mode entry used by the plugin UI.
 *
 * - `id` is a unique string identifier for the mode (required).
 * - `name` is an optional human-readable label shown in the UI.
 * - `active` marks whether this mode is currently selected/active.
 */
export interface ModeEntryBrief {
  // Unique identifier used to match modes. Think of this like a primary key.
  id: string;

  // Optional display name for humans. Not required for internal logic.
  name?: string;

  // Optional boolean showing if this mode is currently active/selected.
  // We keep this optional to make constructing entries convenient.
  active?: boolean;
}

/**
 * Return a new array of modes where the mode with id `activateId` is marked
 * active and every other mode is marked inactive.
 *
 * Important beginner notes:
 * - This function does NOT mutate the original `modes` array or its objects.
 *   Instead it returns a new array and new objects so callers can rely on
 *   immutability (which avoids surprising side-effects).
 * - `activateId` can be `null` to clear all active flags.
 *
 * @param modes - array of mode entries to update
 * @param activateId - id of the mode to mark active, or null to clear
 * @returns a new array of ModeEntryBrief with updated `active` flags
 */
export function setActiveMode(modes: ModeEntryBrief[], activateId: string | null): ModeEntryBrief[] {
  // Array.prototype.map returns a new array. For each mode we shallow-copy
  // the object with `{ ...m }` and set its `active` property based on the
  // comparison. Using a shallow copy keeps other properties (like `name`)
  // unchanged while avoiding mutation of the original objects.
  return modes.map(m => ({
    ...m, // copy existing properties
    // Set `active` to true only when the ids match. If `activateId` is null
    // this will always be false, effectively clearing the active flag.
    active: activateId === m.id,
  }));
}

/**
 * Record the path to the last-created archive (zip) for a given mode.
 *
 * This function treats the `mapping` object as an immutable input. It
 * creates and returns a shallow copy with the new mapping applied. The
 * returned object can be stored (for example in plugin settings) without
 * mutating the original object passed in.
 *
 * Example:
 *   const previous = { 'modeA': 'archives/a.zip' };
 *   const updated = recordLastArchive(previous, 'modeB', 'archives/b.zip');
 *   // previous is unchanged; updated now contains both keys
 *
 * @param mapping - optional existing mapping from mode id -> zip path
 * @param modeId - mode id to record/update
 * @param zipPath - filesystem path to the archive file
 * @returns a new mapping object with the updated entry
 */
export function recordLastArchive(mapping: Record<string, string> | undefined, modeId: string, zipPath: string) {
  // Create a shallow copy of the mapping. `mapping` might be undefined
  // (no previous data), so we default to an empty object. Object.assign
  // copies enumerable own properties from the source(s) into the target.
  const m = Object.assign({}, mapping || {});

  // Set or overwrite the path for the given mode id.
  m[modeId] = zipPath;

  // Return the new object. Callers should use the returned value rather than
  // assuming the original `mapping` was modified in place.
  return m;
}

/**
 * Retrieve the last recorded archive path for the given mode id.
 *
 * Returns the string path if present, or `null` when there is no mapping or
 * no entry for the given mode id. Returning `null` (instead of undefined)
 * makes it explicit that there is no value.
 *
 * @param mapping - optional mapping object produced by recordLastArchive
 * @param modeId - the id to look up
 * @returns the zip path string or null when not found
 */
export function getLastArchive(mapping: Record<string, string> | undefined, modeId: string): string | null {
  // If we don't even have a mapping object, return null early.
  if (!mapping) return null;

  // Return the stored path if present; otherwise return null. The `||`
  // fallback handles the case where the property is undefined.
  return mapping[modeId] || null;
}
