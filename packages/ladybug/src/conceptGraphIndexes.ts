export async function ensureConceptGraphIndexes(): Promise<void> {
  // LadybugDB implements uniqueness natively via PRIMARY KEY constraints defined during schema creation.
  // The concept-graph labels (:Concept / :Contract / :Guidepost) need no separate Cypher index DDL;
  // standard MATCH scans are used instead.
  return Promise.resolve();
}
