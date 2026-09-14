# Local Qwen3 semantic-evaluation pass

The adjacent `cold/` and `warm/` JSON and Markdown reports were generated from the same frozen B3 evaluation basis. Both record source commit `64a46bb5cee7043e482e0cb9d00ff0a5ff31cfbb`, corpus hash `1dd1ccb213252a34bb777e46c7d628c447a45bd192c6cf03ac3d1f1d95850476`, oracle hash `d3e9d25d6ae708f85cbfe11231f1b24c127beeeb3684adc392d2535e744a1b09`, synthetic-scenario hash `b03944b31f33fd47373658c47df40dce714910a2f08e70dacadb3d857df4d497`, cutoff `2026-09-12T23:59:59.999Z`, K=5 per resource type/channel, and generation `1/1/1`.

Both used local Ollama at its OpenAI-compatible `/v1/embeddings` endpoint with tag `qwen3-embedding:0.6b`, digest `ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d`, and 1,024 dimensions. Semantic queries used this newline-bearing template exactly once:

```text
Instruct: Given a support ticket, retrieve relevant support resources.
 Query:{query}
```

Documents were embedded without that prefix, and lexical queries were unchanged.

After a local Ollama `keep_alive: 0` release request, the cold-labeled evaluation took 5,947.2 ms (5,636.6 ms embedding); the immediately repeated warm run took 2,140.3 ms (1,850.5 ms embedding). No GPU-residency telemetry was collected, so the cold label records the release-request procedure rather than proving physical model eviction.

The frozen inputs and aggregate metrics match. Three low-ranked semantic candidate orders varied between the runs (TKT-1010, TKT-1024, TKT-1031), so these artifacts support measured local behavior but do not establish byte-for-byte provider determinism. Both reports preserve required-resource coverage at 1.0; the deterministic article baseline is also 1.0, so this corpus does not demonstrate a candidate-pool coverage improvement over that baseline.

| Ranked knowledge-article channel | Recall@1 | Recall@5 |
|---|---:|---:|
| Lexical/BM25 | 0.556 | 0.889 |
| Semantic/exact cosine | 0.778 | 1.000 |

This is a comparison of separately ranked lexical and semantic channels on the small controlled corpus. It is not a union ranking or a production-quality claim.

| Timing category (ms) | Cold-labeled run | Warm run | Meaning |
|---|---:|---:|---|
| Total evaluator duration | 5,947.2 | 2,140.3 | Complete local process evaluation. |
| Refresh | 5,185.3 | 1,434.9 | Corpus/index refresh, including document embedding work. |
| Aggregate retrieval | 557.8 | 520.3 | All nine `retrieve` calls, including non-provider retrieval work. |
| Aggregate provider embedding | 5,636.6 | 1,850.5 | All 12 embedding calls for 42 inputs. |

Timing categories overlap, so they are not additive. The reports do not record individual query or batch latencies; neither run supports a per-query latency claim.

## Reproduction

From the worktree root, configure only the local endpoint and then write to a new isolated output directory:

```powershell
$env:TRIAGE_EMBEDDING_ENDPOINT = 'http://localhost:11434/v1/embeddings'
$env:TRIAGE_EMBEDDING_MODEL = 'qwen3-embedding:0.6b'
$env:TRIAGE_EMBEDDING_REVISION = 'ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d'
$env:TRIAGE_EMBEDDING_DIMENSIONS = '1024'
$env:TRIAGE_EMBEDDING_TIMEOUT_MS = '60000'
npm run evaluate:retrieval -- --live-embeddings --qwen3-retrieval-instruction --output-dir reports/retrieval/semantic-ollama-qwen3-embedding-0.6b/reproduction
```

For a cold-labeled comparison, make a local Ollama `keep_alive: 0` release request first; this is only a release-request procedure and not evidence of physical GPU eviction.

The corpus contains zero eligible resolved cases. The evaluation uses reviewed seed labels plus one synthetic browser-session contrast fixture; it does not measure semantic quality on real resolved-case memories or production traffic.
