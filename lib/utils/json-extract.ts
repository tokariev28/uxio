/**
 * Extracts the first JSON object or array from a string.
 * Handles LLM responses that include preamble or trailing text.
 */
export function extractJSON(text: string): string {
  const objIndex = text.indexOf("{");
  const arrIndex = text.indexOf("[");

  let start: number;
  let opener: string;
  let closer: string;

  if (objIndex === -1 && arrIndex === -1) {
    throw new Error("No JSON object or array found in response");
  } else if (objIndex === -1) {
    start = arrIndex;
    opener = "[";
    closer = "]";
  } else if (arrIndex === -1) {
    start = objIndex;
    opener = "{";
    closer = "}";
  } else if (objIndex < arrIndex) {
    start = objIndex;
    opener = "{";
    closer = "}";
  } else {
    start = arrIndex;
    opener = "[";
    closer = "]";
  }

  let depth = 0;
  let inString = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (char === "\\" ) {
        i++; // skip escaped character
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth++;
    } else if (char === closer) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("Unmatched JSON brackets in response");
}
