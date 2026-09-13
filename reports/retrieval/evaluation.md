# B3 hybrid retrieval evaluation

- Mode: offline-lexical-only
- Semantic evidence: outstanding
- Source commit: 255b146ef402b32e43ba9f33b5202cf01e27f0b2
- Oracle hash: dcb56214562d4d3a68c6ea5ccb0b421f789f185c10aaa7c114c7e3a34aa183d9
- Scenario cutoff: 2026-09-12T23:59:59.999Z
- Corpus hash: 7bdf5d216fde8db344b2f83602a7e4a26465e361a90b253ba89c2ca863cfc521
- Representation version: 1
- Scenarios: 4

## Candidate pools

| Ticket | Pool size | Candidate recall | Required coverage | Unjudged hits |
|---|---:|---:|---:|---:|
| TKT-1017 | 16 | 1 | 1 | 13 |
| TKT-1028 | 17 | 1 | 1 | 14 |
| TKT-1010 | 14 | 0.5 | n/a | 13 |
| TKT-1020 | 16 | 1 | 1 | 13 |

## Notes

Semantic quality evidence is outstanding because no live or cached embedding provider was configured. Lexical metrics are deterministic and the corpus/oracle hashes freeze this run's identity.
