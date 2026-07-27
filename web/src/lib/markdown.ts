/** Minimal Markdown → HTML for the API docs page (trusted first-party source). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
    '<a href="$2" rel="noreferrer">$1</a>',
  );
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        code.push(lines[i]!);
        i += 1;
      }
      i += 1;
      out.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i]!)) {
        const raw = lines[i]!;
        i += 1;
        if (/^\|\s*-/.test(raw)) continue;
        rows.push(
          raw
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim()),
        );
      }
      if (rows.length > 0) {
        const [head, ...body] = rows;
        out.push("<table><thead><tr>");
        for (const cell of head!) out.push(`<th>${inlineFormat(cell)}</th>`);
        out.push("</tr></thead><tbody>");
        for (const row of body) {
          out.push("<tr>");
          for (const cell of row) out.push(`<td>${inlineFormat(cell)}</td>`);
          out.push("</tr>");
        }
        out.push("</tbody></table>");
      }
      continue;
    }

    if (line.startsWith("# ")) {
      out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        quote.push(lines[i]!.slice(2));
        i += 1;
      }
      out.push(`<blockquote><p>${inlineFormat(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^[-*] /.test(line)) {
      out.push("<ul>");
      while (i < lines.length && /^[-*] /.test(lines[i]!)) {
        out.push(`<li>${inlineFormat(lines[i]!.slice(2))}</li>`);
        i += 1;
      }
      out.push("</ul>");
      continue;
    }

    if (/^\d+\. /.test(line)) {
      out.push("<ol>");
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) {
        out.push(`<li>${inlineFormat(lines[i]!.replace(/^\d+\. /, ""))}</li>`);
        i += 1;
      }
      out.push("</ol>");
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !isBlockStart(lines[i]!)) {
      para.push(lines[i]!);
      i += 1;
    }
    out.push(`<p>${inlineFormat(para.join(" "))}</p>`);
  }

  return out.join("\n");
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("#") ||
    line.startsWith("```") ||
    line.startsWith("> ") ||
    /^[-*] /.test(line) ||
    /^\d+\. /.test(line) ||
    /^\|.*\|$/.test(line)
  );
}
