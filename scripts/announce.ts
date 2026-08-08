#!/usr/bin/env node
// Generates the GitHub Release body (changelog + copy-paste announcement
// drafts for X/LinkedIn/Reddit) and posts a draft to dev.to when
// DEV_API_KEY is set. Env-driven so the same file serves every repo.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const repo = process.env.REPO_NAME ?? "repo";
const pkg = process.env.PKG_NAME ?? repo;
const desc = process.env.PKG_DESC ?? "";
const tags = (process.env.DEVTO_TAGS ?? "cli,developer-tools").split(",").map((t) => t.trim());
const version = (process.env.GITHUB_REF_NAME ?? "v0.0.0").replace(/^v/, "");
const apiKey = process.env.DEV_API_KEY;

function changelog(): string {
  try {
    const prev = execSync(
      "git describe --tags --abbrev=0 HEAD~1 2>/dev/null || git rev-list --max-parents=0 HEAD",
    )
      .toString()
      .trim();
    const log = execSync(`git log --oneline --no-decorate ${prev}..HEAD`).toString().trim();
    return log === "" ? "release inicial" : log;
  } catch {
    return "release inicial";
  }
}

const install = `npm install -g ${pkg}`;
const url = `https://github.com/darkm3tter/${repo}`;
const log = changelog();

const body = `## ${repo} v${version}

${desc}

### Instalación

\`\`\`bash
${install}
\`\`\`

### Cambios

${log
  .split("\n")
  .map((l) => `- ${l}`)
  .join("\n")}

---

## 📣 Para compartir (borradores)

### X / Twitter (EN)

> ${repo} v${version} is out — ${desc} — ${install} — ${url}

### X / Twitter (ES)

> Se lanzó ${repo} v${version} — ${desc} — ${install} — ${url}

### LinkedIn (ES)

> Acabo de publicar ${repo} v${version}: ${desc}
> Instalación: \`${install}\`
> Open source (MIT): ${url}

### Reddit r/commandline (EN)

> [Release] ${repo} v${version} — ${desc}
> \`${install}\`
> MIT, feedback bienvenido: ${url}
`;

writeFileSync("body.md", body, "utf8");
console.log(`body.md generado (${body.length} chars)`);

if (apiKey) {
  const article = {
    article: {
      title: `${repo} v${version}: ${desc}`,
      published: false,
      body_markdown: `# ${repo} v${version}\n\n${desc}\n\n## Instalación\n\n\`\`\`bash\n${install}\n\`\`\`\n\n## Cambios\n\n${log
        .split("\n")
        .map((l) => `- ${l}`)
        .join("\n")}\n\nRepo: ${url}`,
      tags: tags.slice(0, 4),
    },
  };
  try {
    const res = await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(article),
    });
    const text = await res.text();
    console.log(`dev.to draft: HTTP ${res.status} ${res.ok ? "OK" : text.slice(0, 300)}`);
  } catch (e) {
    console.error(`dev.to draft falló: ${(e as Error).message}`);
  }
}
