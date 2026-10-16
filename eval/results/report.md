# Judge eval report

Generated 2026-10-16 07:51 UTC by `npm run eval:report`. How to read it: docs/evals.md.

## Summary

0/151 labels reviewed by a human; the rest are LLM drafts (docs/evals.md). Test split:

- **jev-1.13.0:v1**: AUC 0.99 on test. At 0.85 (current default), 1/39 broken replies replayed and 24/28 valid ones kept; at 0.57 (chosen on tune), 3/39 and 28/28.
- **jev-1.13.0:v2**: AUC 0.99 on test. At 0.85 (current default), 1/39 broken replies replayed and 22/28 valid ones kept; at 0.49 (chosen on tune), 3/39 and 28/28.
- **span-01-free:v1**: AUC 0.79 on test. At 0.85 (current default), 10/39 broken replies replayed and 23/28 valid ones kept; at 0.96 (chosen on tune), 0/39 and 0/28.
- **span-01-free:v2**: AUC 0.79 on test. At 0.85 (current default), 10/39 broken replies replayed and 23/28 valid ones kept; at 0.96 (chosen on tune), 0/39 and 0/28.

## Dataset

- 151 pairs from 13 families: 81 tune, 70 test.
- Labels: 67 replay, 81 re-record, 3 unsure (left out of scoring).
- Reviewed by a human: 0/151 (0 blind).
- Stopped by the hard checks before the judge: 5 (schema of called tool "create_event" changed; settings changed: temperature; model changed (claude-sonnet-5 → claude-opus-5-5); settings changed: output_config; schema of called tool "get_weather" changed).

> **Provisional.** 151 labels are LLM drafts nobody has reviewed. Run `npm run eval:review`.

## Label agreement (blind round)

No blind labels yet: `npm run eval:review -- --blind 30`.

## jev-1.13.0:v1

Separation (AUC): tune 0.99, test 0.99.

Chosen threshold **0.575**: the lowest with no wrong replays on tune, placed midway to the next replay score.

| split | threshold | wrong replays | 95% upper bound | replays kept |
|---|---|---|---|---|
| tune | 0.575 | 0/39 (0%) | ≤9% | 31/37 (84%) |
| **test** | 0.575 | 3/39 (8%) | ≤20% | 28/28 (100%) |
| test at the current default | 0.850 | 1/39 (3%) | ≤13% | 24/28 (86%) |

Sweep on tune (thresholds are chosen here, never on test):

| threshold | wrong replays | replays kept |
|---|---|---|
| 0.30 | 2/39 (5%) | 34/37 (92%) |
| 0.50 | 1/39 (3%) | 32/37 (86%) |
| 0.70 | 0/39 (0%) | 27/37 (73%) |
| 0.80 | 0/39 (0%) | 26/37 (70%) |
| 0.85 | 0/39 (0%) | 25/37 (68%) |
| 0.90 | 0/39 (0%) | 24/37 (65%) |
| 0.95 | 0/39 (0%) | 23/37 (62%) |
| 0.99 | 0/39 (0%) | 3/37 (8%) |

Errors at 0.575: 9

| pair | split | category | label | p | signals |
|---|---|---|---|---|---|
| capital/in-french | tune | added-met | replay | 0.45 | asks_different_task 0.47, format_changed 0.86 |
| weather-tool/paraphrase | tune | reword | replay | 0.30 | asks_different_task 0.03, format_changed 0.06 |
| weather-tool/description-reword | tune | tools | replay | 0.29 | asks_different_task 0.02, format_changed 0.08 |
| weather-tool/extra-tool | tune | tools | replay | 0.53 | asks_different_task 0.04, format_changed 0.18 |
| weather-tool/typo | tune | cosmetic | replay | 0.28 | asks_different_task 0.02, format_changed 0.08 |
| weather-tool/tokyo-japan | tune | reword | replay | 0.37 | asks_different_task 0.04, format_changed 0.10 |
| calendar-tool/today-tuesday | test | input-edit | rerecord | 0.66 | asks_different_task 0.19, format_changed 0.14 |
| rag-answer/refunds-renumbered | test | input-edit | rerecord | 0.62 | asks_different_task 0.05, format_changed 0.13 |
| rag-answer/one-sentence | test | added-broken | rerecord | 0.88 | asks_different_task 0.25, format_changed 0.84 |

By category (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| added-broken | 19 | 1 | 0 | – / 0.12 |
| added-met | 7 | 0 | 1 | 0.81 / – |
| audience | 3 | 0 | 0 | 0.69 / – |
| changed-requirement | 32 | 0 | 0 | 0.81 / 0.11 |
| cosmetic | 9 | 0 | 1 | 0.88 / 0.30 |
| different-subject | 13 | 0 | 0 | – / 0.03 |
| earlier-turn | 3 | 0 | 0 | 0.96 / 0.41 |
| input-edit | 25 | 2 | 0 | 0.96 / 0.11 |
| irrelevant-addition | 9 | 0 | 0 | 0.95 / – |
| removed-requirement | 2 | 0 | 0 | 0.91 / – |
| reword | 16 | 0 | 2 | 0.87 / – |
| tools | 5 | 0 | 2 | 0.68 / 0.04 |

By condition (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| long-prompt | 25 | 0 | 0 | 0.88 / 0.14 |
| structured | 36 | 0 | 0 | 0.91 / 0.11 |
| tools | 22 | 1 | 5 | 0.62 / 0.11 |
| multi-turn | 10 | 0 | 0 | 0.84 / 0.21 |
| (none) | 75 | 2 | 1 | 0.92 / 0.09 |

Stability: 146 pairs judged more than once; largest spread in p 0.110; decisions that flip at 0.575: none.

Cost and latency: 292 calls, p50 120 ms, p95 214 ms, 329,260 input tokens, ~$0.0138.

## jev-1.13.0:v2

Separation (AUC): tune 1.00, test 0.99.

Chosen threshold **0.487**: the lowest with no wrong replays on tune, placed midway to the next replay score.

| split | threshold | wrong replays | 95% upper bound | replays kept |
|---|---|---|---|---|
| tune | 0.487 | 0/39 (0%) | ≤9% | 37/37 (100%) |
| **test** | 0.487 | 3/39 (8%) | ≤20% | 28/28 (100%) |
| test at the current default | 0.850 | 1/39 (3%) | ≤13% | 22/28 (79%) |

Sweep on tune (thresholds are chosen here, never on test):

| threshold | wrong replays | replays kept |
|---|---|---|
| 0.30 | 3/39 (8%) | 37/37 (100%) |
| 0.50 | 0/39 (0%) | 36/37 (97%) |
| 0.70 | 0/39 (0%) | 34/37 (92%) |
| 0.80 | 0/39 (0%) | 31/37 (84%) |
| 0.85 | 0/39 (0%) | 31/37 (84%) |
| 0.90 | 0/39 (0%) | 28/37 (76%) |
| 0.95 | 0/39 (0%) | 23/37 (62%) |
| 0.99 | 0/39 (0%) | 3/37 (8%) |

Errors at 0.487: 3

| pair | split | category | label | p | signals |
|---|---|---|---|---|---|
| calendar-tool/today-tuesday | test | input-edit | rerecord | 0.68 | asks_different_task 0.18, format_changed 0.14 |
| rag-answer/refunds-renumbered | test | input-edit | rerecord | 0.68 | asks_different_task 0.04, format_changed 0.15 |
| rag-answer/one-sentence | test | added-broken | rerecord | 0.91 | asks_different_task 0.26, format_changed 0.79 |

By category (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| added-broken | 19 | 1 | 0 | – / 0.12 |
| added-met | 7 | 0 | 0 | 0.81 / – |
| audience | 3 | 0 | 0 | 0.70 / – |
| changed-requirement | 32 | 0 | 0 | 0.81 / 0.11 |
| cosmetic | 9 | 0 | 0 | 0.96 / 0.26 |
| different-subject | 13 | 0 | 0 | – / 0.03 |
| earlier-turn | 3 | 0 | 0 | 0.96 / 0.40 |
| input-edit | 25 | 2 | 0 | 0.97 / 0.12 |
| irrelevant-addition | 9 | 0 | 0 | 0.95 / – |
| removed-requirement | 2 | 0 | 0 | 0.90 / – |
| reword | 16 | 0 | 0 | 0.96 / – |
| tools | 5 | 0 | 0 | 0.93 / 0.10 |

By condition (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| long-prompt | 25 | 0 | 0 | 0.88 / 0.14 |
| structured | 36 | 0 | 0 | 0.91 / 0.11 |
| tools | 22 | 1 | 0 | 0.93 / 0.12 |
| multi-turn | 10 | 0 | 0 | 0.85 / 0.20 |
| (none) | 75 | 2 | 0 | 0.91 / 0.09 |

Stability: 146 pairs judged more than once; largest spread in p 0.100; decisions that flip at 0.487: capital/in-french, multi-turn/eight-people, prompt-tuner/more-options.

Cost and latency: 292 calls, p50 122 ms, p95 217 ms, 335,684 input tokens, ~$0.0141.

## span-01-free:v1

Separation (AUC): tune 0.87, test 0.79.

Chosen threshold **0.958**: the lowest with no wrong replays on tune, placed midway to the next replay score.

| split | threshold | wrong replays | 95% upper bound | replays kept |
|---|---|---|---|---|
| tune | 0.958 | 0/39 (0%) | ≤9% | 2/37 (5%) |
| **test** | 0.958 | 0/39 (0%) | ≤9% | 0/28 (0%) |
| test at the current default | 0.850 | 10/39 (26%) | ≤41% | 23/28 (82%) |

Sweep on tune (thresholds are chosen here, never on test):

| threshold | wrong replays | replays kept |
|---|---|---|
| 0.30 | 18/39 (46%) | 37/37 (100%) |
| 0.50 | 18/39 (46%) | 37/37 (100%) |
| 0.70 | 18/39 (46%) | 37/37 (100%) |
| 0.80 | 16/39 (41%) | 35/37 (95%) |
| 0.85 | 12/39 (31%) | 34/37 (92%) |
| 0.90 | 11/39 (28%) | 31/37 (84%) |
| 0.95 | 2/39 (5%) | 11/37 (30%) |
| 0.99 | 0/39 (0%) | 0/37 (0%) |

Errors at 0.958: 63

| pair | split | category | label | p | signals |
|---|---|---|---|---|---|
| capital/lowercase-question | tune | cosmetic | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| capital/paraphrase | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| capital/be-concise | tune | added-met | replay | 0.96 | format_mismatch 0.02, off_task 0.02 |
| capital/tutor-persona | tune | irrelevant-addition | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| capital/in-french | tune | added-met | replay | 0.95 | format_mismatch 0.03, off_task 0.02 |
| capital/drop-one-word | tune | removed-requirement | replay | 0.95 | format_mismatch 0.05, off_task 0.02 |
| code-gen/reword | tune | reword | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| code-gen/prefer-reduce | tune | added-met | replay | 0.95 | format_mismatch 0.03, off_task 0.03 |
| code-gen/casing | tune | cosmetic | replay | 0.92 | format_mismatch 0.03, off_task 0.02 |
| code-gen/named-export | tune | added-met | replay | 0.96 | format_mismatch 0.03, off_task 0.03 |
| extraction/reword-system | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| extraction/line-item-detail | tune | input-edit | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| extraction/address | tune | irrelevant-addition | replay | 0.93 | format_mismatch 0.02, off_task 0.02 |
| extraction/pound-sign | tune | input-edit | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| extraction/typo | tune | cosmetic | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| extraction/copy-marker | tune | input-edit | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| multi-turn/reword-follow-up | tune | reword | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| multi-turn/earlier-typo | tune | earlier-turn | replay | 0.86 | format_mismatch 0.02, off_task 0.02 |
| multi-turn/limit-30 | tune | changed-requirement | replay | 0.95 | format_mismatch 0.03, off_task 0.02 |
| multi-turn/vegan | tune | audience | replay | 0.87 | format_mismatch 0.03, off_task 0.02 |
| multi-turn/metric-only | tune | added-met | replay | 0.92 | format_mismatch 0.03, off_task 0.02 |
| support-triage/intro-reword | tune | reword | replay | 0.93 | format_mismatch 0.03, off_task 0.02 |
| support-triage/feature-rule-reword | tune | reword | replay | 0.89 | format_mismatch 0.03, off_task 0.02 |
| support-triage/critical-adds-security | tune | changed-requirement | replay | 0.72 | format_mismatch 0.03, off_task 0.03 |
| support-triage/signature | tune | input-edit | replay | 0.74 | format_mismatch 0.07, off_task 0.04 |
| support-triage/stay-neutral | tune | irrelevant-addition | replay | 0.93 | format_mismatch 0.03, off_task 0.02 |
| translation/formal | tune | added-met | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| translation/informal-tu | tune | added-met | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| translation/pm-spacing | tune | cosmetic | replay | 0.95 | format_mismatch 0.02, off_task 0.03 |
| translation/reword | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/paraphrase | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/description-reword | tune | tools | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/extra-tool | tune | tools | replay | 0.82 | format_mismatch 0.03, off_task 0.02 |
| weather-tool/typo | tune | cosmetic | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/tokyo-japan | tune | reword | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/reword | test | reword | replay | 0.93 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/slots-description | test | tools | replay | 0.87 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/delete-tool | test | tools | replay | 0.81 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/thanks | test | irrelevant-addition | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| classification/add-neutral | test | changed-requirement | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| classification/typo | test | cosmetic | replay | 0.88 | format_mismatch 0.03, off_task 0.03 |
| classification/reword | test | reword | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| classification/other-mixed-review | test | input-edit | replay | 0.92 | format_mismatch 0.02, off_task 0.02 |
| classification/reviewer-name | test | irrelevant-addition | replay | 0.93 | format_mismatch 0.03, off_task 0.03 |
| prompt-tuner/harmless-reword | test | reword | replay | 0.91 | format_mismatch 0.07, off_task 0.03 |
| prompt-tuner/at-most-five-gaps | test | changed-requirement | replay | 0.43 | format_mismatch 0.12, off_task 0.04 |
| prompt-tuner/fewer-options | test | changed-requirement | replay | 0.40 | format_mismatch 0.11, off_task 0.04 |
| prompt-tuner/draft-typo | test | cosmetic | replay | 0.89 | format_mismatch 0.07, off_task 0.04 |
| prompt-tuner/no-reveal | test | irrelevant-addition | replay | 0.85 | format_mismatch 0.07, off_task 0.04 |
| prompt-tuner/audience-anchor | test | changed-requirement | replay | 0.26 | format_mismatch 0.10, off_task 0.04 |
| rag-answer/reword-question | test | reword | replay | 0.75 | format_mismatch 0.03, off_task 0.05 |
| rag-answer/swap-2-3 | test | input-edit | replay | 0.93 | format_mismatch 0.02, off_task 0.02 |
| rag-answer/extra-doc | test | irrelevant-addition | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| rag-answer/no-citations | test | removed-requirement | replay | 0.85 | format_mismatch 0.07, off_task 0.02 |
| rag-answer/policy-date | test | input-edit | replay | 0.91 | format_mismatch 0.03, off_task 0.02 |
| sql/reword | test | reword | replay | 0.93 | format_mismatch 0.04, off_task 0.03 |
| sql/extra-table | test | irrelevant-addition | replay | 0.88 | format_mismatch 0.04, off_task 0.04 |
| sql/mysql | test | changed-requirement | replay | 0.93 | format_mismatch 0.04, off_task 0.03 |
| sql/status-values | test | irrelevant-addition | replay | 0.90 | format_mismatch 0.03, off_task 0.03 |
| summarise-email/reword-instructions | test | reword | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| summarise-email/signature | test | input-edit | replay | 0.94 | format_mismatch 0.09, off_task 0.03 |
| summarise-email/greeting | test | cosmetic | replay | 0.92 | format_mismatch 0.11, off_task 0.04 |
| summarise-email/on-call-engineer | test | audience | replay | 0.93 | format_mismatch 0.05, off_task 0.02 |

By category (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| added-broken | 19 | 0 | 0 | – / 0.61 |
| added-met | 7 | 0 | 7 | 0.94 / – |
| audience | 3 | 0 | 2 | 0.92 / – |
| changed-requirement | 32 | 0 | 7 | 0.66 / 0.53 |
| cosmetic | 9 | 0 | 8 | 0.92 / 0.26 |
| different-subject | 13 | 0 | 0 | – / 0.22 |
| earlier-turn | 3 | 0 | 1 | 0.86 / 0.13 |
| input-edit | 25 | 0 | 8 | 0.91 / 0.35 |
| irrelevant-addition | 9 | 0 | 9 | 0.92 / – |
| removed-requirement | 2 | 0 | 2 | 0.90 / – |
| reword | 16 | 0 | 15 | 0.93 / – |
| tools | 5 | 0 | 4 | 0.86 / 0.92 |

By condition (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| long-prompt | 25 | 0 | 11 | 0.72 / 0.38 |
| structured | 36 | 0 | 17 | 0.80 / 0.39 |
| tools | 22 | 0 | 9 | 0.91 / 0.45 |
| multi-turn | 10 | 0 | 5 | 0.91 / 0.37 |
| (none) | 75 | 0 | 32 | 0.93 / 0.49 |

Cost and latency: 146 calls, p50 108 ms, p95 275 ms, 80,219 input tokens, ~$0.0000.

## span-01-free:v2

Separation (AUC): tune 0.87, test 0.79.

Chosen threshold **0.958**: the lowest with no wrong replays on tune, placed midway to the next replay score.

| split | threshold | wrong replays | 95% upper bound | replays kept |
|---|---|---|---|---|
| tune | 0.958 | 0/39 (0%) | ≤9% | 2/37 (5%) |
| **test** | 0.958 | 0/39 (0%) | ≤9% | 0/28 (0%) |
| test at the current default | 0.850 | 10/39 (26%) | ≤41% | 23/28 (82%) |

Sweep on tune (thresholds are chosen here, never on test):

| threshold | wrong replays | replays kept |
|---|---|---|
| 0.30 | 18/39 (46%) | 37/37 (100%) |
| 0.50 | 18/39 (46%) | 37/37 (100%) |
| 0.70 | 18/39 (46%) | 37/37 (100%) |
| 0.80 | 16/39 (41%) | 35/37 (95%) |
| 0.85 | 12/39 (31%) | 34/37 (92%) |
| 0.90 | 11/39 (28%) | 31/37 (84%) |
| 0.95 | 2/39 (5%) | 11/37 (30%) |
| 0.99 | 0/39 (0%) | 0/37 (0%) |

Errors at 0.958: 63

| pair | split | category | label | p | signals |
|---|---|---|---|---|---|
| capital/lowercase-question | tune | cosmetic | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| capital/paraphrase | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| capital/be-concise | tune | added-met | replay | 0.96 | format_mismatch 0.02, off_task 0.02 |
| capital/tutor-persona | tune | irrelevant-addition | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| capital/in-french | tune | added-met | replay | 0.95 | format_mismatch 0.03, off_task 0.02 |
| capital/drop-one-word | tune | removed-requirement | replay | 0.95 | format_mismatch 0.05, off_task 0.02 |
| code-gen/reword | tune | reword | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| code-gen/prefer-reduce | tune | added-met | replay | 0.95 | format_mismatch 0.03, off_task 0.03 |
| code-gen/casing | tune | cosmetic | replay | 0.92 | format_mismatch 0.03, off_task 0.02 |
| code-gen/named-export | tune | added-met | replay | 0.96 | format_mismatch 0.03, off_task 0.03 |
| extraction/reword-system | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| extraction/line-item-detail | tune | input-edit | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| extraction/address | tune | irrelevant-addition | replay | 0.93 | format_mismatch 0.02, off_task 0.02 |
| extraction/pound-sign | tune | input-edit | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| extraction/typo | tune | cosmetic | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| extraction/copy-marker | tune | input-edit | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| multi-turn/reword-follow-up | tune | reword | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| multi-turn/earlier-typo | tune | earlier-turn | replay | 0.86 | format_mismatch 0.02, off_task 0.02 |
| multi-turn/limit-30 | tune | changed-requirement | replay | 0.95 | format_mismatch 0.03, off_task 0.02 |
| multi-turn/vegan | tune | audience | replay | 0.87 | format_mismatch 0.03, off_task 0.02 |
| multi-turn/metric-only | tune | added-met | replay | 0.92 | format_mismatch 0.03, off_task 0.02 |
| support-triage/intro-reword | tune | reword | replay | 0.93 | format_mismatch 0.03, off_task 0.02 |
| support-triage/feature-rule-reword | tune | reword | replay | 0.89 | format_mismatch 0.03, off_task 0.02 |
| support-triage/critical-adds-security | tune | changed-requirement | replay | 0.72 | format_mismatch 0.03, off_task 0.03 |
| support-triage/signature | tune | input-edit | replay | 0.74 | format_mismatch 0.07, off_task 0.04 |
| support-triage/stay-neutral | tune | irrelevant-addition | replay | 0.93 | format_mismatch 0.03, off_task 0.02 |
| translation/formal | tune | added-met | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| translation/informal-tu | tune | added-met | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| translation/pm-spacing | tune | cosmetic | replay | 0.95 | format_mismatch 0.02, off_task 0.03 |
| translation/reword | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/paraphrase | tune | reword | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/description-reword | tune | tools | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/extra-tool | tune | tools | replay | 0.82 | format_mismatch 0.03, off_task 0.02 |
| weather-tool/typo | tune | cosmetic | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| weather-tool/tokyo-japan | tune | reword | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/reword | test | reword | replay | 0.93 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/slots-description | test | tools | replay | 0.87 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/delete-tool | test | tools | replay | 0.81 | format_mismatch 0.02, off_task 0.02 |
| calendar-tool/thanks | test | irrelevant-addition | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| classification/add-neutral | test | changed-requirement | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| classification/typo | test | cosmetic | replay | 0.88 | format_mismatch 0.03, off_task 0.03 |
| classification/reword | test | reword | replay | 0.94 | format_mismatch 0.02, off_task 0.02 |
| classification/other-mixed-review | test | input-edit | replay | 0.92 | format_mismatch 0.02, off_task 0.02 |
| classification/reviewer-name | test | irrelevant-addition | replay | 0.93 | format_mismatch 0.03, off_task 0.03 |
| prompt-tuner/harmless-reword | test | reword | replay | 0.91 | format_mismatch 0.07, off_task 0.03 |
| prompt-tuner/at-most-five-gaps | test | changed-requirement | replay | 0.43 | format_mismatch 0.12, off_task 0.04 |
| prompt-tuner/fewer-options | test | changed-requirement | replay | 0.40 | format_mismatch 0.11, off_task 0.04 |
| prompt-tuner/draft-typo | test | cosmetic | replay | 0.89 | format_mismatch 0.07, off_task 0.04 |
| prompt-tuner/no-reveal | test | irrelevant-addition | replay | 0.85 | format_mismatch 0.07, off_task 0.04 |
| prompt-tuner/audience-anchor | test | changed-requirement | replay | 0.26 | format_mismatch 0.10, off_task 0.04 |
| rag-answer/reword-question | test | reword | replay | 0.75 | format_mismatch 0.03, off_task 0.05 |
| rag-answer/swap-2-3 | test | input-edit | replay | 0.93 | format_mismatch 0.02, off_task 0.02 |
| rag-answer/extra-doc | test | irrelevant-addition | replay | 0.95 | format_mismatch 0.02, off_task 0.02 |
| rag-answer/no-citations | test | removed-requirement | replay | 0.85 | format_mismatch 0.07, off_task 0.02 |
| rag-answer/policy-date | test | input-edit | replay | 0.91 | format_mismatch 0.03, off_task 0.02 |
| sql/reword | test | reword | replay | 0.93 | format_mismatch 0.04, off_task 0.03 |
| sql/extra-table | test | irrelevant-addition | replay | 0.88 | format_mismatch 0.04, off_task 0.04 |
| sql/mysql | test | changed-requirement | replay | 0.93 | format_mismatch 0.04, off_task 0.03 |
| sql/status-values | test | irrelevant-addition | replay | 0.90 | format_mismatch 0.03, off_task 0.03 |
| summarise-email/reword-instructions | test | reword | replay | 0.94 | format_mismatch 0.03, off_task 0.02 |
| summarise-email/signature | test | input-edit | replay | 0.94 | format_mismatch 0.09, off_task 0.03 |
| summarise-email/greeting | test | cosmetic | replay | 0.92 | format_mismatch 0.11, off_task 0.04 |
| summarise-email/on-call-engineer | test | audience | replay | 0.93 | format_mismatch 0.05, off_task 0.02 |

By category (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| added-broken | 19 | 0 | 0 | – / 0.61 |
| added-met | 7 | 0 | 7 | 0.94 / – |
| audience | 3 | 0 | 2 | 0.92 / – |
| changed-requirement | 32 | 0 | 7 | 0.66 / 0.53 |
| cosmetic | 9 | 0 | 8 | 0.92 / 0.26 |
| different-subject | 13 | 0 | 0 | – / 0.22 |
| earlier-turn | 3 | 0 | 1 | 0.86 / 0.13 |
| input-edit | 25 | 0 | 8 | 0.91 / 0.35 |
| irrelevant-addition | 9 | 0 | 9 | 0.92 / – |
| removed-requirement | 2 | 0 | 2 | 0.90 / – |
| reword | 16 | 0 | 15 | 0.93 / – |
| tools | 5 | 0 | 4 | 0.86 / 0.92 |

By condition (both splits):

| pairs | n | wrong replays | unneeded re-records | mean p: replay / re-record |
|---|---|---|---|---|
| long-prompt | 25 | 0 | 11 | 0.72 / 0.38 |
| structured | 36 | 0 | 17 | 0.80 / 0.39 |
| tools | 22 | 0 | 9 | 0.91 / 0.45 |
| multi-turn | 10 | 0 | 5 | 0.91 / 0.37 |
| (none) | 75 | 0 | 32 | 0.93 / 0.49 |

Cost and latency: 146 calls, p50 122 ms, p95 349 ms, 80,219 input tokens, ~$0.0000.

## Matching ladder (test split)

The hard checks run first, then the judge at its chosen threshold. Fail closed: a pair with no score re-records.

| judge | threshold | wrong replays | unneeded re-records (hard checks) | unneeded re-records (judge) | re-records avoided |
|---|---|---|---|---|---|
| jev-1.13.0:v1 | 0.575 | 3/41 (7%) | 0/28 (0%) | 0/28 (0%) | 28/28 (100%) |
| jev-1.13.0:v2 | 0.487 | 3/41 (7%) | 0/28 (0%) | 0/28 (0%) | 28/28 (100%) |
| span-01-free:v1 | 0.958 | 0/41 (0%) | 0/28 (0%) | 28/28 (100%) | 0/28 (0%) |
| span-01-free:v2 | 0.958 | 0/41 (0%) | 0/28 (0%) | 28/28 (100%) | 0/28 (0%) |

## jev-1.13.0:v1 vs jev-1.13.0:v2 (test split)

Same decision on 67/67 (100%) pairs, each at its own chosen threshold.
