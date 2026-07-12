/**
 * Extract the first balanced JSON object from a model response. Models often
 * wrap JSON in prose or ```json fences; this pulls out the object without
 * executing anything. Returns undefined if no balanced object is found.
 */
export function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

export function parseJsonObject(text: string): unknown {
  const extracted = extractJsonObject(text);
  if (extracted === undefined) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(extracted);
}
