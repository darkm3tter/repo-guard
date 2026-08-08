/**
 * Minimal glob matcher (zero-deps) supporting `*`, `**`, `?`.
 * `**` crosses directory boundaries; `*`/`?` stay within one segment.
 */

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function matchGlob(pattern: string, path: string, caseInsensitive = false): boolean {
  const pat = normalizePath(pattern);
  const p = normalizePath(path);
  const patSegs = pat.split("/").filter((s) => s !== "");
  const pathSegs = p.split("/").filter((s) => s !== "");
  const fold = (s: string): string => (caseInsensitive ? s.toLowerCase() : s);
  const patF = patSegs.map(fold);
  const pathF = pathSegs.map(fold);

  const matchFrom = (pi: number, ji: number): boolean => {
    if (pi >= patF.length) return ji >= pathF.length;
    const seg = patF[pi]!;
    if (seg === "**") {
      // `**` can consume zero or more segments (but must leave at least what remains)
      for (let k = ji; k <= pathF.length; k++) {
        if (matchFrom(pi + 1, k)) return true;
      }
      return false;
    }
    if (ji >= pathF.length) return false;
    return segMatch(seg, pathF[ji]!) && matchFrom(pi + 1, ji + 1);
  };

  return matchFrom(0, 0);
}

function segMatch(pattern: string, segment: string): boolean {
  if (pattern === "*") return true;
  if (pattern.indexOf("*") === -1 && pattern.indexOf("?") === -1) return pattern === segment;
  const re = new RegExp(
    "^" +
      pattern
        .split("")
        .map((c) => {
          if (c === "*") return "[^/]*";
          if (c === "?") return "[^/]";
          return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("") +
      "$",
  );
  return re.test(segment);
}
