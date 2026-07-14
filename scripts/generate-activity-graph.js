// generate-activity-graph.js
// Fetches real contribution data from the GitHub GraphQL API and writes
// an animated SVG (slow, smooth line + area draw-in) to activity-graph.svg

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN;

if (!USERNAME || !TOKEN) {
  console.error("Missing GH_USERNAME or GH_TOKEN environment variables.");
  process.exit(1);
}

const QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
  const total = json.data.user.contributionsCollection.contributionCalendar.totalContributions;

  // Take the last 8 full weeks, sum contributions per week
  const lastWeeks = weeks.slice(-8);
  const weeklyTotals = lastWeeks.map((w) =>
    w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0)
  );

  // Pad to exactly 8 points if fewer weeks exist (new accounts)
  while (weeklyTotals.length < 8) weeklyTotals.unshift(0);

  const svg = buildSvg(weeklyTotals, total);
  const fs = await import("node:fs");
  fs.writeFileSync("activity-graph.svg", svg, "utf8");
  console.log("Wrote activity-graph.svg with weekly totals:", weeklyTotals);
}

function buildSvg(values, totalContributions) {
  const maxVal = Math.max(...values, 1);
  const baseline = 260;
  const top = 40;
  const startX = 60;
  const endX = 739;
  const step = (endX - startX) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = startX + i * step;
    const y = baseline - (v / maxVal) * (baseline - top);
    return { x, y };
  });

  const halfStep = step / 2;
  let linePath = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    linePath += ` C${p0.x + halfStep},${p0.y} ${p1.x - halfStep},${p1.y} ${p1.x},${p1.y}`;
  }
  const areaPath = `${linePath} L${endX},${baseline} L${startX},${baseline} Z`;

  const dotDelays = points.map((_, i) => (i * 0.5 + 0.1).toFixed(1));
  const dotCircles = points
    .map((p, i) => `  <circle class="dot" cx="${p.x}" cy="${p.y}" style="animation-delay:${dotDelays[i]}s"/>`)
    .join("\n");

  return `<svg width="800" height="300" viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7aa2f7" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#7aa2f7" stop-opacity="0"/>
    </linearGradient>
    <style>
      .bg { fill: #1a1b27; }
      .title { fill: #c0caf5; font-family: 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 600; }
      .subtitle { fill: #565f89; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; }
      .axis { stroke: #292e42; stroke-width: 1; }

      .area { opacity: 0; animation: fadeArea 5s ease-in-out infinite alternate; }
      .line {
        stroke: #7aa2f7; stroke-width: 3; fill: none;
        stroke-linecap: round; stroke-linejoin: round;
        stroke-dasharray: 1500; stroke-dashoffset: 1500;
        animation: drawLine 5s ease-in-out infinite alternate;
      }
      .dot { fill: #7aa2f7; opacity: 0; animation: popDot 5s ease-in-out infinite alternate; }

      @keyframes drawLine { 0% { stroke-dashoffset: 1500; } 60% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 0; } }
      @keyframes fadeArea { 0% { opacity: 0; } 60% { opacity: 1; } 100% { opacity: 1; } }
      @keyframes popDot { 0% { opacity: 0; r: 0; } 100% { opacity: 1; r: 4.5; } }
    </style>
  </defs>

  <rect class="bg" width="800" height="300" rx="10"/>
  <text x="30" y="35" class="title">${escapeXml(USERNAME)}'s Contribution Activity</text>
  <text x="30" y="54" class="subtitle">Last 8 weeks · ${totalContributions} contributions in the past year</text>
  <line class="axis" x1="60" y1="260" x2="760" y2="260"/>

  <path class="area" fill="url(#areaFill)" d="${areaPath}"/>
  <path class="line" d="${linePath}"/>

${dotCircles}
</svg>
`;
}

function escapeXml(str) {
  return str.replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
