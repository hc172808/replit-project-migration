/** Redact common credentials before logs leave the server for AI analysis. */
export function redactRigLog(log: string): string {
  return log
    .replace(/\b(Bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/((?:RIG_TOKEN|CF[-_]Access[-_]Client[-_]Secret|CF_CLIENT_SECRET|password|api[_-]?key|private[_-]?key|secret)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/\b(gyds_rig_)[a-zA-Z0-9_-]+/g, "$1[redacted]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@");
}