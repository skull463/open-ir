export function escapeLucene(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\/]/gu, "\\$&");
}

export function buildFulltextQuery(terms: readonly string[]): string {
  return terms.map((term) => `*${escapeLucene(term)}*`).join(" ");
}
