/**
 * Minimal glob matcher for repo-relative POSIX paths.
 *
 * Supports:
 *   *   — any run of characters except "/"
 *   **  — any run of characters including "/" (spanning directories)
 *   ?   — a single non-"/" character
 *
 * Kept dependency-free and deterministic. Not a full-featured matcher (no brace
 * expansion, no extglob) — that is documented in docs/configuration.md.
 */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**" — match across directory separators.
        i += 1;
        if (glob[i + 1] === "/") {
          // "**/" — also match zero directories so "a/**/b" matches "a/b".
          i += 1;
          re += "(?:.*/)?";
        } else {
          // trailing or embedded "**" — match anything including slashes.
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c !== undefined && "\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

const cache = new Map<string, RegExp>();

export function matchGlob(pattern: string, path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  let re = cache.get(pattern);
  if (re === undefined) {
    re = globToRegExp(pattern.replace(/\\/g, "/"));
    cache.set(pattern, re);
  }
  return re.test(normalizedPath);
}

export function matchAny(patterns: string[], path: string): boolean {
  return patterns.some((p) => matchGlob(p, path));
}
