/** Parse a shell-like line into argv: GET key, SET a "b c", supports double quotes */
export function parseRedisArgv(line: string): string[] {
  const argv: string[] = [];
  let i = 0;
  const s = line.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    if (i >= s.length) break;

    if (s[i] === '"') {
      i += 1;
      let token = "";
      while (i < s.length) {
        if (s[i] === '"') {
          if (s[i + 1] === '"') {
            token += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        token += s[i];
        i += 1;
      }
      argv.push(token);
      continue;
    }

    let token = "";
    while (i < s.length && !/\s/.test(s[i]!)) {
      token += s[i];
      i += 1;
    }
    argv.push(token);
  }
  return argv;
}
