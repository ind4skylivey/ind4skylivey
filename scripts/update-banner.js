// scripts/update-banner.js
// Node 18+ required (GitHub Actions runner already has it)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = process.env.GITHUB_USERNAME || "ind4skylivey";
const TOKEN = process.env.GITHUB_TOKEN; // provided by GitHub Actions

if (!TOKEN) {
  console.error("GITHUB_TOKEN is missing. Make sure it's provided in the workflow env.");
  process.exit(1);
}

const apiBase = "https://api.github.com";

function ghRequest(endpoint) {
  const options = {
    headers: {
      "User-Agent": "github-banner-script",
      "Authorization": `token ${TOKEN}`,
      "Accept": "application/vnd.github+json"
    }
  };

  return new Promise((resolve, reject) => {
    https
      .get(apiBase + endpoint, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(
              new Error(
                `GitHub API error ${res.statusCode}: ${data.toString().slice(0, 200)}`
              )
            );
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchAllRepos(username) {
  let page = 1;
  const perPage = 100;
  const repos = [];

  while (true) {
    const batch = await ghRequest(
      `/users/${username}/repos?per_page=${perPage}&page=${page}&type=owner&sort=updated`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return repos;
}

function computeLanguageStats(repos) {
  const counts = {};
  for (const r of repos) {
    const lang = r.language || "Other";
    counts[lang] = (counts[lang] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [l1, l2, l3] = sorted.map(([lang]) => lang);
  return {
    top1: l1 || "N/A",
    top2: l2 || "N/A",
    top3: l3 || "N/A"
  };
}

async function main() {
  console.log(`Updating banner.svg for ${USERNAME} ...`);

  const user = await ghRequest(`/users/${USERNAME}`);
  const repos = await fetchAllRepos(USERNAME);

  let totalStars = 0;
  let totalForks = 0;

  for (const r of repos) {
    totalStars += r.stargazers_count || 0;
    totalForks += r.forks_count || 0;
  }

  const { top1, top2, top3 } = computeLanguageStats(repos);

  // Security grade: pequeño juguete basado en stars + repos
  const securityScore = Math.min(100, totalStars + repos.length * 2);
  let securityGrade = "B-";
  if (securityScore > 120) securityGrade = "S";
  else if (securityScore > 90) securityGrade = "A";
  else if (securityScore > 70) securityGrade = "B+";
  else if (securityScore > 40) securityGrade = "B-";
  else securityGrade = "C+";

  const templatePath = path.join(__dirname, "..", "generated", "banner.template.svg");
  const outputPath = path.join(__dirname, "..", "generated", "banner.svg");

  const template = fs.readFileSync(templatePath, "utf8");

  const replacements = {
    "{{NAME}}": user.name || USERNAME,
    "{{TOTAL_STARS}}": String(totalStars),
    "{{PUBLIC_REPOS}}": String(user.public_repos ?? repos.length),
    "{{TOP_LANG_1}}": top1,
    "{{TOP_LANG_2}}": top2,
    "{{TOP_LANG_3}}": top3,
    "{{TOTAL_FORKS}}": String(totalForks),
    "{{SECURITY_GRADE}}": securityGrade
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key, "g"), value);
  }

  fs.writeFileSync(outputPath, result, "utf8");
  console.log("Banner written to", outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

