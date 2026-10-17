/**
 * Whether the open costing has typed-in changes that are not saved as a version yet. The Cost Engine page sets it; the browser's
 * leave guard (tab close / refresh) and the top navigation read it, so a costing clerk never loses typed values silently.
 */
let unsaved = false;
export const setUnsaved = (v: boolean) => { unsaved = v; };
export const hasUnsaved = () => unsaved;
export const LEAVE_MESSAGE = "This costing has unsaved changes. Leave without saving?";

let installed = false;
export function installLeaveGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("beforeunload", (e) => {
    if (!unsaved) return;
    e.preventDefault();
    e.returnValue = ""; // the browser shows its own wording
  });
}
