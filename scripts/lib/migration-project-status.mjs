// These projects contain real accounts. The candidate was promoted on
// 2026-11-19; changing an environment label must never re-enable fixtures.
const productionProjects = new Set(["qgqwvyprivwvffuewzmp", "gfedmrhckghmgssgfwis"]);

export function assertMigrationCandidate(projectRef) {
  if (productionProjects.has(projectRef))
    throw new Error(
      "This migration project contains production data; candidate mutations are disabled.",
    );
}
