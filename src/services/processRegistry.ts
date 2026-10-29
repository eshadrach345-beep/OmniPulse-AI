export interface LocalProcessSummary { id: string; type: string; title: string; startedAt: number; }
type StopHandler = () => void;
const active = new Map<string, { summary: LocalProcessSummary; stop: StopHandler }>();
const STORAGE_KEY = 'omnipulse:local-jobs';
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...active.values()].map((v) => v.summary))); } catch { /* storage can be disabled */ }
}
function announce() { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('omnipulse:local-job-updated')); }
export function registerLocalProcess(summary: LocalProcessSummary, stop: StopHandler) {
  active.set(summary.id, { summary, stop }); persist(); announce();
}
export function unregisterLocalProcess(id: string) { active.delete(id); persist(); announce(); }
export function getLocalProcesses() { return [...active.values()].map((v) => v.summary); }
export function isLocalProcessRegistered(id: string) { return active.has(id); }
export function stopLocalProcess(id: string) { const job = active.get(id); if (!job) return false; job.stop(); return true; }
