/** Quote one value for a POSIX shell without allowing interpolation. */
export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}
