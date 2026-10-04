/**
 * Text inputs that live inside panels (e.g. the commit message) register here
 * while open so the IDE's global shortcuts leave their keys alone ("?" used to
 * open the help over the input, Tab moved focus, Esc closed both).
 */
const owners = new Set<string>();

export function setKeyCapture(owner: string, active: boolean) {
  if (active) owners.add(owner);
  else owners.delete(owner);
}

export function isKeyCaptureActive(): boolean {
  return owners.size > 0;
}
