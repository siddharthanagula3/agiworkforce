# Semantic decision benchmark

Run date 2026-09-20 (passed in, not read from a clock). Model `jev-1.13.0`, git `420e825fa60a2da17e60185d01c737fe05f16772`, concurrency 4, SDK retries 0.
Totals: 550/576 cases answered, 1205581 input tokens, 191347 output tokens, $0.0506.

| suite                      | question version | fixture sha256 | objective                                                                                                                                                                         |
| -------------------------- | ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turn_signals`             | 1                | `f767cd9dcaeb` | accuracy per field on calibration; this kind gates nothing today, so each boolean threshold is chosen for accuracy alone and the family and complexity answers are scored ungated |
| `connector_tool_shortlist` | 1                | `e821ba1416db` | minimise mean kept schema bytes subject to core recall on calibration at or above the production shortlist, per the suite README (recall first, tokens second)                    |
| `memory_relevance`         | 1                | `32c221dc6110` | minimise mean characters kept subject to zero standing instructions dropped and core recall of 1 on calibration, per the suite README                                             |
| `memory_worth_extracting`  | 1                | `dffbbb595640` | minimise (4 x false negatives + false positives) per scored calibration case, per the suite README asymmetry                                                                      |
| `review_security_gate`     | 1                | `9cb09cc0112a` | maximise chunks skipped subject to zero false negatives on calibration, per the suite README asymmetry                                                                            |
| `element_resolution`       | 1                | `3767122122ff` | minimise (3 x wrong index + escalations) per scored calibration case; a wrong index is a click, an escalation is the round trip production already pays                           |

| suite                      | chosen                                             | errors | p50 ms | p95 ms | p99 ms | input tokens / decision | $ / 1k   | $ / 1M |
| -------------------------- | -------------------------------------------------- | ------ | ------ | ------ | ------ | ----------------------- | -------- | ------ |
| `turn_signals`             | {}                                                 | 1      | 184    | 330    | 406    | 1145                    | 0.04809  | 48.09  |
| `connector_tool_shortlist` | {"keep":0.6,"maybe":0.6}                           | 0      | 199    | 284    | 321    | 4774.2                  | 0.200517 | 200.52 |
| `memory_relevance`         | {"minimumConfidence":0.9}                          | 0      | 189    | 330    | 416    | 4201.6                  | 0.176465 | 176.47 |
| `memory_worth_extracting`  | {"extractAbove":0.35,"useAnswerAboveConfidence":0} | 0      | 165    | 229    | 388    | 417.9                   | 0.01755  | 17.55  |
| `review_security_gate`     | {"skipBelow":0.1}                                  | 0      | 162    | 224    | 278    | 1441                    | 0.060524 | 60.52  |
| `element_resolution`       | {"minimumConfidence":0.85}                         | 0      | 170    | 219    | 260    | 1629.3                  | 0.068429 | 68.43  |

## Per suite

### turn_signals

```json
{
  "chosen": {},
  "production": {
    "task_family": {
      "all": {
        "scored": 88,
        "correct": 47,
        "accuracy": 0.5341,
        "accuracyWhenUsed": 0.5341,
        "escalationRate": 0
      },
      "calibration": {
        "scored": 32,
        "correct": 19,
        "accuracy": 0.5938,
        "accuracyWhenUsed": 0.5938,
        "escalationRate": 0
      },
      "heldout": {
        "scored": 56,
        "correct": 28,
        "accuracy": 0.5,
        "accuracyWhenUsed": 0.5,
        "escalationRate": 0
      }
    },
    "needs_current_info": {
      "all": {
        "scored": 98,
        "truePositives": 4,
        "falsePositives": 4,
        "trueNegatives": 77,
        "falseNegatives": 13,
        "accuracy": 0.8265,
        "precision": 0.5,
        "recall": 0.2353,
        "f1": 0.32,
        "fallbackRate": 0
      },
      "calibration": {
        "scored": 37,
        "truePositives": 1,
        "falsePositives": 3,
        "trueNegatives": 28,
        "falseNegatives": 5,
        "accuracy": 0.7838,
        "precision": 0.25,
        "recall": 0.1667,
        "f1": 0.2,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 61,
        "truePositives": 3,
        "falsePositives": 1,
        "trueNegatives": 49,
        "falseNegatives": 8,
        "accuracy": 0.8525,
        "precision": 0.75,
        "recall": 0.2727,
        "f1": 0.4,
        "fallbackRate": 0
      }
    },
    "needs_external_tools": {
      "all": {
        "scored": 99,
        "truePositives": 3,
        "falsePositives": 7,
        "trueNegatives": 64,
        "falseNegatives": 25,
        "accuracy": 0.6768,
        "precision": 0.3,
        "recall": 0.1071,
        "f1": 0.1579,
        "fallbackRate": 0
      },
      "calibration": {
        "scored": 37,
        "truePositives": 1,
        "falsePositives": 3,
        "trueNegatives": 25,
        "falseNegatives": 8,
        "accuracy": 0.7027,
        "precision": 0.25,
        "recall": 0.1111,
        "f1": 0.1538,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 62,
        "truePositives": 2,
        "falsePositives": 4,
        "trueNegatives": 39,
        "falseNegatives": 17,
        "accuracy": 0.6613,
        "precision": 0.3333,
        "recall": 0.1053,
        "f1": 0.16,
        "fallbackRate": 0
      }
    },
    "needs_code": {
      "all": {
        "scored": 97,
        "truePositives": 0,
        "falsePositives": 1,
        "trueNegatives": 94,
        "falseNegatives": 2,
        "accuracy": 0.9691,
        "precision": 0,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0
      },
      "calibration": {
        "scored": 37,
        "truePositives": 0,
        "falsePositives": 0,
        "trueNegatives": 36,
        "falseNegatives": 1,
        "accuracy": 0.973,
        "precision": null,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 60,
        "truePositives": 0,
        "falsePositives": 1,
        "trueNegatives": 58,
        "falseNegatives": 1,
        "accuracy": 0.9667,
        "precision": 0,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0
      }
    }
  },
  "ungated": {
    "task_family": {
      "all": {
        "scored": 88,
        "correct": 65,
        "accuracy": 0.7386,
        "accuracyWhenUsed": 0.7471,
        "escalationRate": 0.0098
      },
      "calibration": {
        "scored": 32,
        "correct": 26,
        "accuracy": 0.8125,
        "accuracyWhenUsed": 0.8125,
        "escalationRate": 0
      },
      "heldout": {
        "scored": 56,
        "correct": 39,
        "accuracy": 0.6964,
        "accuracyWhenUsed": 0.7091,
        "escalationRate": 0.0159
      }
    },
    "complexity4": {
      "all": {
        "scored": 102,
        "correct": 82,
        "accuracy": 0.8039,
        "accuracyWhenUsed": 0.8119,
        "escalationRate": 0.0098
      },
      "calibration": {
        "scored": 39,
        "correct": 37,
        "accuracy": 0.9487,
        "accuracyWhenUsed": 0.9487,
        "escalationRate": 0
      },
      "heldout": {
        "scored": 63,
        "correct": 45,
        "accuracy": 0.7143,
        "accuracyWhenUsed": 0.7258,
        "escalationRate": 0.0159
      }
    },
    "needs_current_info": {
      "all": {
        "scored": 98,
        "truePositives": 17,
        "falsePositives": 4,
        "trueNegatives": 77,
        "falseNegatives": 0,
        "accuracy": 0.9592,
        "precision": 0.8095,
        "recall": 1,
        "f1": 0.8947,
        "fallbackRate": 0.0098
      },
      "calibration": {
        "scored": 37,
        "truePositives": 6,
        "falsePositives": 2,
        "trueNegatives": 29,
        "falseNegatives": 0,
        "accuracy": 0.9459,
        "precision": 0.75,
        "recall": 1,
        "f1": 0.8571,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 61,
        "truePositives": 11,
        "falsePositives": 2,
        "trueNegatives": 48,
        "falseNegatives": 0,
        "accuracy": 0.9672,
        "precision": 0.8462,
        "recall": 1,
        "f1": 0.9167,
        "fallbackRate": 0.0159
      }
    },
    "needs_external_tools": {
      "all": {
        "scored": 99,
        "truePositives": 18,
        "falsePositives": 5,
        "trueNegatives": 66,
        "falseNegatives": 10,
        "accuracy": 0.8485,
        "precision": 0.7826,
        "recall": 0.6429,
        "f1": 0.7059,
        "fallbackRate": 0.0098
      },
      "calibration": {
        "scored": 37,
        "truePositives": 5,
        "falsePositives": 3,
        "trueNegatives": 25,
        "falseNegatives": 4,
        "accuracy": 0.8108,
        "precision": 0.625,
        "recall": 0.5556,
        "f1": 0.5882,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 62,
        "truePositives": 13,
        "falsePositives": 2,
        "trueNegatives": 41,
        "falseNegatives": 6,
        "accuracy": 0.871,
        "precision": 0.8667,
        "recall": 0.6842,
        "f1": 0.7647,
        "fallbackRate": 0.0159
      }
    },
    "needs_code": {
      "all": {
        "scored": 97,
        "truePositives": 0,
        "falsePositives": 2,
        "trueNegatives": 93,
        "falseNegatives": 2,
        "accuracy": 0.9588,
        "precision": 0,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0.0098
      },
      "calibration": {
        "scored": 37,
        "truePositives": 0,
        "falsePositives": 0,
        "trueNegatives": 36,
        "falseNegatives": 1,
        "accuracy": 0.973,
        "precision": null,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 60,
        "truePositives": 0,
        "falsePositives": 2,
        "trueNegatives": 57,
        "falseNegatives": 1,
        "accuracy": 0.95,
        "precision": 0,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0.0159
      }
    }
  },
  "gated": {
    "needs_current_info": {
      "chosenThreshold": 0.45,
      "all": {
        "scored": 98,
        "truePositives": 17,
        "falsePositives": 4,
        "trueNegatives": 77,
        "falseNegatives": 0,
        "accuracy": 0.9592,
        "precision": 0.8095,
        "recall": 1,
        "f1": 0.8947,
        "fallbackRate": 0.0098
      },
      "calibration": {
        "scored": 37,
        "truePositives": 6,
        "falsePositives": 2,
        "trueNegatives": 29,
        "falseNegatives": 0,
        "accuracy": 0.9459,
        "precision": 0.75,
        "recall": 1,
        "f1": 0.8571,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 61,
        "truePositives": 11,
        "falsePositives": 2,
        "trueNegatives": 48,
        "falseNegatives": 0,
        "accuracy": 0.9672,
        "precision": 0.8462,
        "recall": 1,
        "f1": 0.9167,
        "fallbackRate": 0.0159
      }
    },
    "needs_external_tools": {
      "chosenThreshold": 0.2,
      "all": {
        "scored": 99,
        "truePositives": 18,
        "falsePositives": 5,
        "trueNegatives": 66,
        "falseNegatives": 10,
        "accuracy": 0.8485,
        "precision": 0.7826,
        "recall": 0.6429,
        "f1": 0.7059,
        "fallbackRate": 0.0098
      },
      "calibration": {
        "scored": 37,
        "truePositives": 5,
        "falsePositives": 3,
        "trueNegatives": 25,
        "falseNegatives": 4,
        "accuracy": 0.8108,
        "precision": 0.625,
        "recall": 0.5556,
        "f1": 0.5882,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 62,
        "truePositives": 13,
        "falsePositives": 2,
        "trueNegatives": 41,
        "falseNegatives": 6,
        "accuracy": 0.871,
        "precision": 0.8667,
        "recall": 0.6842,
        "f1": 0.7647,
        "fallbackRate": 0.0159
      }
    },
    "needs_code": {
      "chosenThreshold": 0.95,
      "all": {
        "scored": 97,
        "truePositives": 0,
        "falsePositives": 2,
        "trueNegatives": 93,
        "falseNegatives": 2,
        "accuracy": 0.9588,
        "precision": 0,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0.0098
      },
      "calibration": {
        "scored": 37,
        "truePositives": 0,
        "falsePositives": 0,
        "trueNegatives": 36,
        "falseNegatives": 1,
        "accuracy": 0.973,
        "precision": null,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0
      },
      "heldout": {
        "scored": 60,
        "truePositives": 0,
        "falsePositives": 2,
        "trueNegatives": 57,
        "falseNegatives": 1,
        "accuracy": 0.95,
        "precision": 0,
        "recall": 0,
        "f1": null,
        "fallbackRate": 0.0159
      }
    }
  },
  "reliability": {
    "task_family": [
      {
        "lower": 0,
        "upper": 0.2,
        "count": 0,
        "observedAccuracy": null
      },
      {
        "lower": 0.2,
        "upper": 0.4,
        "count": 3,
        "observedAccuracy": 0
      },
      {
        "lower": 0.4,
        "upper": 0.6,
        "count": 8,
        "observedAccuracy": 0.25
      },
      {
        "lower": 0.6,
        "upper": 0.8,
        "count": 12,
        "observedAccuracy": 0.4167
      },
      {
        "lower": 0.8,
        "upper": 1,
        "count": 64,
        "observedAccuracy": 0.9063
      }
    ],
    "complexity4": [
      {
        "lower": 0,
        "upper": 0.2,
        "count": 4,
        "observedAccuracy": 0.5
      },
      {
        "lower": 0.2,
        "upper": 0.4,
        "count": 4,
        "observedAccuracy": 0.75
      },
      {
        "lower": 0.4,
        "upper": 0.6,
        "count": 24,
        "observedAccuracy": 0.75
      },
      {
        "lower": 0.6,
        "upper": 0.8,
        "count": 36,
        "observedAccuracy": 0.8056
      },
      {
        "lower": 0.8,
        "upper": 1,
        "count": 33,
        "observedAccuracy": 0.9091
      }
    ],
    "needs_current_info": [
      {
        "lower": 0,
        "upper": 0.2,
        "count": 4,
        "observedAccuracy": 0.5
      },
      {
        "lower": 0.2,
        "upper": 0.4,
        "count": 4,
        "observedAccuracy": 1
      },
      {
        "lower": 0.4,
        "upper": 0.6,
        "count": 13,
        "observedAccuracy": 0.8462
      },
      {
        "lower": 0.6,
        "upper": 0.8,
        "count": 11,
        "observedAccuracy": 1
      },
      {
        "lower": 0.8,
        "upper": 1,
        "count": 65,
        "observedAccuracy": 1
      }
    ],
    "needs_external_tools": [
      {
        "lower": 0,
        "upper": 0.2,
        "count": 7,
        "observedAccuracy": 0.8571
      },
      {
        "lower": 0.2,
        "upper": 0.4,
        "count": 3,
        "observedAccuracy": 0.6667
      },
      {
        "lower": 0.4,
        "upper": 0.6,
        "count": 6,
        "observedAccuracy": 0.5
      },
      {
        "lower": 0.6,
        "upper": 0.8,
        "count": 15,
        "observedAccuracy": 0.9333
      },
      {
        "lower": 0.8,
        "upper": 1,
        "count": 67,
        "observedAccuracy": 0.8806
      }
    ],
    "needs_code": [
      {
        "lower": 0,
        "upper": 0.2,
        "count": 10,
        "observedAccuracy": 0.9
      },
      {
        "lower": 0.2,
        "upper": 0.4,
        "count": 2,
        "observedAccuracy": 1
      },
      {
        "lower": 0.4,
        "upper": 0.6,
        "count": 11,
        "observedAccuracy": 1
      },
      {
        "lower": 0.6,
        "upper": 0.8,
        "count": 15,
        "observedAccuracy": 1
      },
      {
        "lower": 0.8,
        "upper": 1,
        "count": 58,
        "observedAccuracy": 0.9483
      }
    ]
  },
  "byTag": {
    "task_family": {
      "ambiguous": {
        "scored": 2,
        "correct": 2,
        "accuracy": 1,
        "accuracyWhenUsed": 1,
        "escalationRate": 0
      },
      "cjk": {
        "scored": 4,
        "correct": 4,
        "accuracy": 1,
        "accuracyWhenUsed": 1,
        "escalationRate": 0
      },
      "embedded_instruction": {
        "scored": 6,
        "correct": 4,
        "accuracy": 0.6667,
        "accuracyWhenUsed": 0.6667,
        "escalationRate": 0
      },
      "indirect": {
        "scored": 12,
        "correct": 8,
        "accuracy": 0.6667,
        "accuracyWhenUsed": 0.6667,
        "escalationRate": 0
      },
      "long_irrelevant": {
        "scored": 3,
        "correct": 2,
        "accuracy": 0.6667,
        "accuracyWhenUsed": 0.6667,
        "escalationRate": 0
      },
      "near_miss": {
        "scored": 9,
        "correct": 7,
        "accuracy": 0.7778,
        "accuracyWhenUsed": 0.7778,
        "escalationRate": 0
      },
      "negation": {
        "scored": 13,
        "correct": 10,
        "accuracy": 0.7692,
        "accuracyWhenUsed": 0.7692,
        "escalationRate": 0
      },
      "non_english": {
        "scored": 12,
        "correct": 10,
        "accuracy": 0.8333,
        "accuracyWhenUsed": 0.8333,
        "escalationRate": 0
      },
      "numeric": {
        "scored": 8,
        "correct": 5,
        "accuracy": 0.625,
        "accuracyWhenUsed": 0.625,
        "escalationRate": 0
      },
      "plain": {
        "scored": 41,
        "correct": 30,
        "accuracy": 0.7317,
        "accuracyWhenUsed": 0.75,
        "escalationRate": 0.0238
      },
      "typo": {
        "scored": 8,
        "correct": 7,
        "accuracy": 0.875,
        "accuracyWhenUsed": 0.875,
        "escalationRate": 0
      }
    },
    "complexity4": {
      "ambiguous": {
        "scored": 4,
        "correct": 4,
        "accuracy": 1,
        "accuracyWhenUsed": 1,
        "escalationRate": 0
      },
      "cjk": {
        "scored": 4,
        "correct": 2,
        "accuracy": 0.5,
        "accuracyWhenUsed": 0.5,
        "escalationRate": 0
      },
      "embedded_instruction": {
        "scored": 6,
        "correct": 5,
        "accuracy": 0.8333,
        "accuracyWhenUsed": 0.8333,
        "escalationRate": 0
      },
      "indirect": {
        "scored": 16,
        "correct": 10,
        "accuracy": 0.625,
        "accuracyWhenUsed": 0.625,
        "escalationRate": 0
      },
      "long_irrelevant": {
        "scored": 5,
        "correct": 4,
        "accuracy": 0.8,
        "accuracyWhenUsed": 0.8,
        "escalationRate": 0
      },
      "near_miss": {
        "scored": 12,
        "correct": 10,
        "accuracy": 0.8333,
        "accuracyWhenUsed": 0.8333,
        "escalationRate": 0
      },
      "negation": {
        "scored": 15,
        "correct": 14,
        "accuracy": 0.9333,
        "accuracyWhenUsed": 0.9333,
        "escalationRate": 0
      },
      "non_english": {
        "scored": 14,
        "correct": 12,
        "accuracy": 0.8571,
        "accuracyWhenUsed": 0.8571,
        "escalationRate": 0
      },
      "numeric": {
        "scored": 15,
        "correct": 11,
        "accuracy": 0.7333,
        "accuracyWhenUsed": 0.7333,
        "escalationRate": 0
      },
      "plain": {
        "scored": 42,
        "correct": 33,
        "accuracy": 0.7857,
        "accuracyWhenUsed": 0.8049,
        "escalationRate": 0.0238
      },
      "typo": {
        "scored": 8,
        "correct": 7,
        "accuracy": 0.875,
        "accuracyWhenUsed": 0.875,
        "escalationRate": 0
      }
    }
  },
  "errors": {
    "providerErrors": 0,
    "invalidResponses": 1,
    "timeouts": 0,
    "aborted": 0,
    "capacity": 0,
    "otherFallbacks": 0,
    "retries": 0,
    "rateLimited": 0,
    "overBudget": 0,
    "decidedByCode": 0,
    "skipped": 0
  },
  "cost": {
    "cases": 102,
    "answered": 101,
    "p50Ms": 183.6244160000001,
    "p95Ms": 330.119958,
    "p99Ms": 406.08666700000003,
    "meanInputTokens": 1145,
    "totalInputTokens": 115645,
    "totalOutputTokens": 20611,
    "usdPer1000Decisions": 0.04809,
    "usdPerMillionDecisions": 48.09,
    "totalUsd": 0.004857
  },
  "extra": {
    "unscoredPerField": {
      "needs_current_info": 4,
      "needs_external_tools": 3,
      "needs_code": 5,
      "task_family": 14,
      "complexity4": 0
    },
    "complexityExactAgreement": 60,
    "familyVocabularyBridge": "the production classifier answers in RoutingTaskType and the labels in TaskFamily; the baseline column counts a case right when the produced type is in TASK_FAMILY_INTENDED_TASK_TYPES for the labelled family"
  }
}
```

### connector_tool_shortlist

```json
{
  "chosen": {
    "keep": 0.6,
    "maybe": 0.6
  },
  "production": {
    "all": {
      "cases": 84,
      "scored": 80,
      "coreNeeded": 81,
      "coreKept": 53,
      "coreRecall": 0.6543,
      "precision": 0.0426,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 25,
      "meanKeptBytesOnEmptyCore": 6694.8,
      "meanKeptBytes": 6911.7,
      "meanBaselineBytes": 6911.7,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.545,
      "bytesSavedVersusBaseline": 0,
      "casesFullyCovered": 29
    },
    "calibration": {
      "cases": 32,
      "scored": 31,
      "coreNeeded": 35,
      "coreKept": 23,
      "coreRecall": 0.6571,
      "precision": 0.0441,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 5,
      "meanKeptBytesOnEmptyCore": 6367.2,
      "meanKeptBytes": 7107.4,
      "meanBaselineBytes": 7107.4,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.5321,
      "bytesSavedVersusBaseline": 0,
      "casesFullyCovered": 15
    },
    "heldout": {
      "cases": 52,
      "scored": 49,
      "coreNeeded": 46,
      "coreKept": 30,
      "coreRecall": 0.6522,
      "precision": 0.0417,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 20,
      "meanKeptBytesOnEmptyCore": 6776.8,
      "meanKeptBytes": 6787.9,
      "meanBaselineBytes": 6787.9,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.5531,
      "bytesSavedVersusBaseline": 0,
      "casesFullyCovered": 14
    }
  },
  "ungated": {
    "all": {
      "cases": 84,
      "scored": 80,
      "coreNeeded": 81,
      "coreKept": 66,
      "coreRecall": 0.8148,
      "precision": 0.641,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 25,
      "meanKeptBytesOnEmptyCore": 19.6,
      "meanKeptBytes": 568.4,
      "meanBaselineBytes": 6911.7,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9626,
      "bytesSavedVersusBaseline": 0.9178,
      "casesFullyCovered": 40
    },
    "calibration": {
      "cases": 32,
      "scored": 31,
      "coreNeeded": 35,
      "coreKept": 28,
      "coreRecall": 0.8,
      "precision": 0.5769,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 5,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 644.6,
      "meanBaselineBytes": 7107.4,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9576,
      "bytesSavedVersusBaseline": 0.9093,
      "casesFullyCovered": 19
    },
    "heldout": {
      "cases": 52,
      "scored": 49,
      "coreNeeded": 46,
      "coreKept": 38,
      "coreRecall": 0.8261,
      "precision": 0.6923,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 20,
      "meanKeptBytesOnEmptyCore": 24.6,
      "meanKeptBytes": 520.1,
      "meanBaselineBytes": 6787.9,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9658,
      "bytesSavedVersusBaseline": 0.9234,
      "casesFullyCovered": 21
    }
  },
  "gated": {
    "all": {
      "cases": 84,
      "scored": 80,
      "coreNeeded": 81,
      "coreKept": 59,
      "coreRecall": 0.7284,
      "precision": 0.7857,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 25,
      "meanKeptBytesOnEmptyCore": 19.6,
      "meanKeptBytes": 416.4,
      "meanBaselineBytes": 6911.7,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9726,
      "bytesSavedVersusBaseline": 0.9398,
      "casesFullyCovered": 34
    },
    "calibration": {
      "cases": 32,
      "scored": 31,
      "coreNeeded": 35,
      "coreKept": 25,
      "coreRecall": 0.7143,
      "precision": 0.7714,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 5,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 443.1,
      "meanBaselineBytes": 7107.4,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9708,
      "bytesSavedVersusBaseline": 0.9377,
      "casesFullyCovered": 16
    },
    "heldout": {
      "cases": 52,
      "scored": 49,
      "coreNeeded": 46,
      "coreKept": 34,
      "coreRecall": 0.7391,
      "precision": 0.7959,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 20,
      "meanKeptBytesOnEmptyCore": 24.6,
      "meanKeptBytes": 399.4,
      "meanBaselineBytes": 6787.9,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9737,
      "bytesSavedVersusBaseline": 0.9412,
      "casesFullyCovered": 18
    }
  },
  "reliability": [
    {
      "lower": 0,
      "upper": 0.2,
      "count": 76,
      "observedAccuracy": 0.5658
    },
    {
      "lower": 0.2,
      "upper": 0.4,
      "count": 84,
      "observedAccuracy": 0.8214
    },
    {
      "lower": 0.4,
      "upper": 0.6,
      "count": 115,
      "observedAccuracy": 0.8783
    },
    {
      "lower": 0.6,
      "upper": 0.8,
      "count": 232,
      "observedAccuracy": 0.9871
    },
    {
      "lower": 0.8,
      "upper": 1,
      "count": 2690,
      "observedAccuracy": 1
    }
  ],
  "byTag": {
    "ambiguous": {
      "cases": 3,
      "scored": 0,
      "coreNeeded": 0,
      "coreKept": 0,
      "coreRecall": null,
      "precision": null,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 0,
      "meanKeptBytesOnEmptyCore": null,
      "meanKeptBytes": null,
      "meanBaselineBytes": null,
      "meanTotalBytes": null,
      "bytesSavedVersusTotal": null,
      "bytesSavedVersusBaseline": null,
      "casesFullyCovered": 0
    },
    "cjk": {
      "cases": 4,
      "scored": 4,
      "coreNeeded": 5,
      "coreKept": 4,
      "coreRecall": 0.8,
      "precision": 1,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 0,
      "meanKeptBytesOnEmptyCore": null,
      "meanKeptBytes": 402.8,
      "meanBaselineBytes": 12346,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9735,
      "bytesSavedVersusBaseline": 0.9674,
      "casesFullyCovered": 3
    },
    "embedded_instruction": {
      "cases": 6,
      "scored": 6,
      "coreNeeded": 3,
      "coreKept": 2,
      "coreRecall": 0.6667,
      "precision": 0.6667,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 3,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 222.3,
      "meanBaselineBytes": 7223.5,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9854,
      "bytesSavedVersusBaseline": 0.9692,
      "casesFullyCovered": 2
    },
    "indirect": {
      "cases": 20,
      "scored": 18,
      "coreNeeded": 23,
      "coreKept": 13,
      "coreRecall": 0.5652,
      "precision": 0.8235,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 3,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 372.9,
      "meanBaselineBytes": 5598.8,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9755,
      "bytesSavedVersusBaseline": 0.9334,
      "casesFullyCovered": 6
    },
    "long_irrelevant": {
      "cases": 2,
      "scored": 2,
      "coreNeeded": 5,
      "coreKept": 4,
      "coreRecall": 0.8,
      "precision": 0.6667,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 0,
      "meanKeptBytesOnEmptyCore": null,
      "meanKeptBytes": 1145,
      "meanBaselineBytes": 11575,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9246,
      "bytesSavedVersusBaseline": 0.9011,
      "casesFullyCovered": 1
    },
    "near_miss": {
      "cases": 14,
      "scored": 12,
      "coreNeeded": 1,
      "coreKept": 1,
      "coreRecall": 1,
      "precision": 0.5,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 11,
      "meanKeptBytesOnEmptyCore": 44.6,
      "meanKeptBytes": 72.4,
      "meanBaselineBytes": 5232.2,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9952,
      "bytesSavedVersusBaseline": 0.9862,
      "casesFullyCovered": 1
    },
    "negation": {
      "cases": 6,
      "scored": 6,
      "coreNeeded": 5,
      "coreKept": 5,
      "coreRecall": 1,
      "precision": 1,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 2,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 400.3,
      "meanBaselineBytes": 3530.5,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9736,
      "bytesSavedVersusBaseline": 0.8866,
      "casesFullyCovered": 4
    },
    "non_english": {
      "cases": 12,
      "scored": 12,
      "coreNeeded": 12,
      "coreKept": 10,
      "coreRecall": 0.8333,
      "precision": 0.8462,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 2,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 442.5,
      "meanBaselineBytes": 11371.5,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9709,
      "bytesSavedVersusBaseline": 0.9611,
      "casesFullyCovered": 8
    },
    "numeric": {
      "cases": 6,
      "scored": 6,
      "coreNeeded": 11,
      "coreKept": 7,
      "coreRecall": 0.6364,
      "precision": 0.7273,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 0,
      "meanKeptBytesOnEmptyCore": null,
      "meanKeptBytes": 765.5,
      "meanBaselineBytes": 10405.2,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9496,
      "bytesSavedVersusBaseline": 0.9264,
      "casesFullyCovered": 3
    },
    "plain": {
      "cases": 28,
      "scored": 28,
      "coreNeeded": 37,
      "coreKept": 29,
      "coreRecall": 0.7838,
      "precision": 0.75,
      "standingNeeded": 0,
      "standingDropped": 0,
      "emptyCoreCases": 5,
      "meanKeptBytesOnEmptyCore": 0,
      "meanKeptBytes": 613.5,
      "meanBaselineBytes": 6924.1,
      "meanTotalBytes": 15190,
      "bytesSavedVersusTotal": 0.9596,
      "bytesSavedVersusBaseline": 0.9114,
      "casesFullyCovered": 15
    }
  },
  "errors": {
    "providerErrors": 0,
    "invalidResponses": 0,
    "timeouts": 0,
    "aborted": 0,
    "capacity": 0,
    "otherFallbacks": 0,
    "retries": 0,
    "rateLimited": 0,
    "overBudget": 0,
    "decidedByCode": 0,
    "skipped": 0
  },
  "cost": {
    "cases": 84,
    "answered": 84,
    "p50Ms": 199.3194999999996,
    "p95Ms": 283.5594169999986,
    "p99Ms": 320.591124999999,
    "meanInputTokens": 4774.2,
    "totalInputTokens": 401033,
    "totalOutputTokens": 63279,
    "usdPer1000Decisions": 0.200517,
    "usdPerMillionDecisions": 200.52,
    "totalUsd": 0.016843
  },
  "extra": {
    "catalogBytes": 15190,
    "catalogTools": 40,
    "budget": {
      "maxTools": 32,
      "maxSchemaBytes": 24000
    }
  }
}
```

### memory_relevance

```json
{
  "chosen": {
    "minimumConfidence": 0.9
  },
  "production": {
    "all": {
      "cases": 84,
      "scored": 84,
      "coreNeeded": 116,
      "coreKept": 116,
      "coreRecall": 1,
      "precision": 0.1046,
      "standingNeeded": 310,
      "standingDropped": 0,
      "emptyCoreCases": 10,
      "meanKeptBytesOnEmptyCore": 783.7,
      "meanKeptBytes": 928.3,
      "meanBaselineBytes": 928.3,
      "meanTotalBytes": 928.3,
      "bytesSavedVersusTotal": 0,
      "bytesSavedVersusBaseline": 0,
      "casesFullyCovered": 74
    },
    "calibration": {
      "cases": 33,
      "scored": 33,
      "coreNeeded": 43,
      "coreKept": 43,
      "coreRecall": 1,
      "precision": 0.0996,
      "standingNeeded": 136,
      "standingDropped": 0,
      "emptyCoreCases": 1,
      "meanKeptBytesOnEmptyCore": 1205,
      "meanKeptBytes": 980.3,
      "meanBaselineBytes": 980.3,
      "meanTotalBytes": 980.3,
      "bytesSavedVersusTotal": 0,
      "bytesSavedVersusBaseline": 0,
      "casesFullyCovered": 32
    },
    "heldout": {
      "cases": 51,
      "scored": 51,
      "coreNeeded": 73,
      "coreKept": 73,
      "coreRecall": 1,
      "precision": 0.1082,
      "standingNeeded": 174,
      "standingDropped": 0,
      "emptyCoreCases": 9,
      "meanKeptBytesOnEmptyCore": 736.9,
      "meanKeptBytes": 894.6,
      "meanBaselineBytes": 894.6,
      "meanTotalBytes": 894.6,
      "bytesSavedVersusTotal": 0,
      "bytesSavedVersusBaseline": 0,
      "casesFullyCovered": 42
    }
  },
  "ungated": {
    "all": {
      "cases": 84,
      "scored": 84,
      "coreNeeded": 116,
      "coreKept": 93,
      "coreRecall": 0.8017,
      "precision": 0.2483,
      "standingNeeded": 310,
      "standingDropped": 0,
      "emptyCoreCases": 10,
      "meanKeptBytesOnEmptyCore": 150.7,
      "meanKeptBytes": 259.9,
      "meanBaselineBytes": 928.3,
      "meanTotalBytes": 928.3,
      "bytesSavedVersusTotal": 0.72,
      "bytesSavedVersusBaseline": 0.72,
      "casesFullyCovered": 53
    },
    "calibration": {
      "cases": 33,
      "scored": 33,
      "coreNeeded": 43,
      "coreKept": 34,
      "coreRecall": 0.7907,
      "precision": 0.2216,
      "standingNeeded": 136,
      "standingDropped": 0,
      "emptyCoreCases": 1,
      "meanKeptBytesOnEmptyCore": 366,
      "meanKeptBytes": 281,
      "meanBaselineBytes": 980.3,
      "meanTotalBytes": 980.3,
      "bytesSavedVersusTotal": 0.7134,
      "bytesSavedVersusBaseline": 0.7134,
      "casesFullyCovered": 24
    },
    "heldout": {
      "cases": 51,
      "scored": 51,
      "coreNeeded": 73,
      "coreKept": 59,
      "coreRecall": 0.8082,
      "precision": 0.2669,
      "standingNeeded": 174,
      "standingDropped": 0,
      "emptyCoreCases": 9,
      "meanKeptBytesOnEmptyCore": 126.8,
      "meanKeptBytes": 246.3,
      "meanBaselineBytes": 894.6,
      "meanTotalBytes": 894.6,
      "bytesSavedVersusTotal": 0.7247,
      "bytesSavedVersusBaseline": 0.7247,
      "casesFullyCovered": 29
    }
  },
  "gated": {
    "all": {
      "cases": 84,
      "scored": 84,
      "coreNeeded": 116,
      "coreKept": 116,
      "coreRecall": 1,
      "precision": 0.2,
      "standingNeeded": 310,
      "standingDropped": 0,
      "emptyCoreCases": 10,
      "meanKeptBytesOnEmptyCore": 286,
      "meanKeptBytes": 514.3,
      "meanBaselineBytes": 928.3,
      "meanTotalBytes": 928.3,
      "bytesSavedVersusTotal": 0.446,
      "bytesSavedVersusBaseline": 0.446,
      "casesFullyCovered": 74
    },
    "calibration": {
      "cases": 33,
      "scored": 33,
      "coreNeeded": 43,
      "coreKept": 43,
      "coreRecall": 1,
      "precision": 0.1955,
      "standingNeeded": 136,
      "standingDropped": 0,
      "emptyCoreCases": 1,
      "meanKeptBytesOnEmptyCore": 442,
      "meanKeptBytes": 535.8,
      "meanBaselineBytes": 980.3,
      "meanTotalBytes": 980.3,
      "bytesSavedVersusTotal": 0.4534,
      "bytesSavedVersusBaseline": 0.4534,
      "casesFullyCovered": 32
    },
    "heldout": {
      "cases": 51,
      "scored": 51,
      "coreNeeded": 73,
      "coreKept": 73,
      "coreRecall": 1,
      "precision": 0.203,
      "standingNeeded": 174,
      "standingDropped": 0,
      "emptyCoreCases": 9,
      "meanKeptBytesOnEmptyCore": 268.7,
      "meanKeptBytes": 500.4,
      "meanBaselineBytes": 894.6,
      "meanTotalBytes": 894.6,
      "bytesSavedVersusTotal": 0.4406,
      "bytesSavedVersusBaseline": 0.4406,
      "casesFullyCovered": 42
    }
  },
  "reliability": [
    {
      "lower": 0,
      "upper": 0.2,
      "count": 1,
      "observedAccuracy": 1
    },
    {
      "lower": 0.2,
      "upper": 0.4,
      "count": 81,
      "observedAccuracy": 0.679
    },
    {
      "lower": 0.4,
      "upper": 0.6,
      "count": 112,
      "observedAccuracy": 0.8214
    },
    {
      "lower": 0.6,
      "upper": 0.8,
      "count": 187,
      "observedAccuracy": 0.9251
    },
    {
      "lower": 0.8,
      "upper": 1,
      "count": 1039,
      "observedAccuracy": 0.9894
    }
  ],
  "byTag": {
    "ambiguous": {
      "cases": 2,
      "scored": 2,
      "coreNeeded": 2,
      "coreKept": 2,
      "coreRecall": 1,
      "precision": 0.3,
      "standingNeeded": 5,
      "standingDropped": 0,
      "emptyCoreCases": 0,
      "meanKeptBytesOnEmptyCore": null,
      "meanKeptBytes": 195.5,
      "meanBaselineBytes": 540,
      "meanTotalBytes": 540,
      "bytesSavedVersusTotal": 0.638,
      "bytesSavedVersusBaseline": 0.638,
      "casesFullyCovered": 2
    },
    "cjk": {
      "cases": 10,
      "scored": 10,
      "coreNeeded": 11,
      "coreKept": 11,
      "coreRecall": 1,
      "precision": 0.2647,
      "standingNeeded": 20,
      "standingDropped": 0,
      "emptyCoreCases": 2,
      "meanKeptBytesOnEmptyCore": 155.5,
      "meanKeptBytes": 269.9,
      "meanBaselineBytes": 458,
      "meanTotalBytes": 458,
      "bytesSavedVersusTotal": 0.4107,
      "bytesSavedVersusBaseline": 0.4107,
      "casesFullyCovered": 8
    },
    "embedded_instruction": {
      "cases": 4,
      "scored": 4,
      "coreNeeded": 1,
      "coreKept": 1,
      "coreRecall": 1,
      "precision": 0.025,
      "standingNeeded": 13,
      "standingDropped": 0,
      "emptyCoreCases": 3,
      "meanKeptBytesOnEmptyCore": 290.3,
      "meanKeptBytes": 485.5,
      "meanBaselineBytes": 919.8,
      "meanTotalBytes": 919.8,
      "bytesSavedVersusTotal": 0.4722,
      "bytesSavedVersusBaseline": 0.4722,
      "casesFullyCovered": 1
    },
    "indirect": {
      "cases": 27,
      "scored": 27,
      "coreNeeded": 38,
      "coreKept": 38,
      "coreRecall": 1,
      "precision": 0.1812,
      "standingNeeded": 99,
      "standingDropped": 0,
      "emptyCoreCases": 1,
      "meanKeptBytesOnEmptyCore": 159,
      "meanKeptBytes": 518.8,
      "meanBaselineBytes": 885,
      "meanTotalBytes": 885,
      "bytesSavedVersusTotal": 0.4138,
      "bytesSavedVersusBaseline": 0.4138,
      "casesFullyCovered": 26
    },
    "long_irrelevant": {
      "cases": 2,
      "scored": 2,
      "coreNeeded": 2,
      "coreKept": 2,
      "coreRecall": 1,
      "precision": 0.3214,
      "standingNeeded": 5,
      "standingDropped": 0,
      "emptyCoreCases": 0,
      "meanKeptBytesOnEmptyCore": null,
      "meanKeptBytes": 657.5,
      "meanBaselineBytes": 922.5,
      "meanTotalBytes": 922.5,
      "bytesSavedVersusTotal": 0.2873,
      "bytesSavedVersusBaseline": 0.2873,
      "casesFullyCovered": 2
    },
    "near_miss": {
      "cases": 12,
      "scored": 12,
      "coreNeeded": 12,
      "coreKept": 12,
      "coreRecall": 1,
      "precision": 0.1172,
      "standingNeeded": 49,
      "standingDropped": 0,
      "emptyCoreCases": 5,
      "meanKeptBytesOnEmptyCore": 320.6,
      "meanKeptBytes": 542.2,
      "meanBaselineBytes": 1040.1,
      "meanTotalBytes": 1040.1,
      "bytesSavedVersusTotal": 0.4787,
      "bytesSavedVersusBaseline": 0.4787,
      "casesFullyCovered": 7
    },
    "negation": {
      "cases": 8,
      "scored": 8,
      "coreNeeded": 6,
      "coreKept": 6,
      "coreRecall": 1,
      "precision": 0.1818,
      "standingNeeded": 26,
      "standingDropped": 0,
      "emptyCoreCases": 3,
      "meanKeptBytesOnEmptyCore": 298.3,
      "meanKeptBytes": 315.6,
      "meanBaselineBytes": 719.9,
      "meanTotalBytes": 719.9,
      "bytesSavedVersusTotal": 0.5616,
      "bytesSavedVersusBaseline": 0.5616,
      "casesFullyCovered": 5
    },
    "non_english": {
      "cases": 23,
      "scored": 23,
      "coreNeeded": 28,
      "coreKept": 28,
      "coreRecall": 1,
      "precision": 0.2527,
      "standingNeeded": 64,
      "standingDropped": 0,
      "emptyCoreCases": 4,
      "meanKeptBytesOnEmptyCore": 178.5,
      "meanKeptBytes": 337.9,
      "meanBaselineBytes": 595.7,
      "meanTotalBytes": 595.7,
      "bytesSavedVersusTotal": 0.4328,
      "bytesSavedVersusBaseline": 0.4328,
      "casesFullyCovered": 19
    },
    "numeric": {
      "cases": 11,
      "scored": 11,
      "coreNeeded": 17,
      "coreKept": 17,
      "coreRecall": 1,
      "precision": 0.186,
      "standingNeeded": 35,
      "standingDropped": 0,
      "emptyCoreCases": 2,
      "meanKeptBytesOnEmptyCore": 141,
      "meanKeptBytes": 549.9,
      "meanBaselineBytes": 971.4,
      "meanTotalBytes": 971.4,
      "bytesSavedVersusTotal": 0.4339,
      "bytesSavedVersusBaseline": 0.4339,
      "casesFullyCovered": 9
    },
    "plain": {
      "cases": 32,
      "scored": 32,
      "coreNeeded": 53,
      "coreKept": 53,
      "coreRecall": 1,
      "precision": 0.233,
      "standingNeeded": 125,
      "standingDropped": 0,
      "emptyCoreCases": 1,
      "meanKeptBytesOnEmptyCore": 227,
      "meanKeptBytes": 561.1,
      "meanBaselineBytes": 1019.4,
      "meanTotalBytes": 1019.4,
      "bytesSavedVersusTotal": 0.4496,
      "bytesSavedVersusBaseline": 0.4496,
      "casesFullyCovered": 31
    }
  },
  "errors": {
    "providerErrors": 0,
    "invalidResponses": 0,
    "timeouts": 0,
    "aborted": 0,
    "capacity": 0,
    "otherFallbacks": 0,
    "retries": 0,
    "rateLimited": 0,
    "overBudget": 0,
    "decidedByCode": 0,
    "skipped": 0
  },
  "cost": {
    "cases": 84,
    "answered": 84,
    "p50Ms": 189.35429099999965,
    "p95Ms": 329.81225000000086,
    "p99Ms": 416.12604199999987,
    "meanInputTokens": 4201.6,
    "totalInputTokens": 352931,
    "totalOutputTokens": 63621,
    "usdPer1000Decisions": 0.176465,
    "usdPerMillionDecisions": 176.47,
    "totalUsd": 0.014823
  },
  "extra": {
    "standingDroppedIds": [],
    "meanRowsSentProduction": 20.6,
    "meanRowsKept": 10.54
  }
}
```

### memory_worth_extracting

```json
{
  "chosen": {
    "extractAbove": 0.35,
    "useAnswerAboveConfidence": 0
  },
  "production": {
    "all": {
      "scored": 83,
      "truePositives": 31,
      "falsePositives": 20,
      "trueNegatives": 21,
      "falseNegatives": 11,
      "accuracy": 0.6265,
      "precision": 0.6078,
      "recall": 0.7381,
      "f1": 0.6667,
      "fallbackRate": 0
    },
    "calibration": {
      "scored": 38,
      "truePositives": 17,
      "falsePositives": 10,
      "trueNegatives": 7,
      "falseNegatives": 4,
      "accuracy": 0.6316,
      "precision": 0.6296,
      "recall": 0.8095,
      "f1": 0.7083,
      "fallbackRate": 0
    },
    "heldout": {
      "scored": 45,
      "truePositives": 14,
      "falsePositives": 10,
      "trueNegatives": 14,
      "falseNegatives": 7,
      "accuracy": 0.6222,
      "precision": 0.5833,
      "recall": 0.6667,
      "f1": 0.6222,
      "fallbackRate": 0
    }
  },
  "ungated": {
    "all": {
      "scored": 83,
      "truePositives": 42,
      "falsePositives": 4,
      "trueNegatives": 37,
      "falseNegatives": 0,
      "accuracy": 0.9518,
      "precision": 0.913,
      "recall": 1,
      "f1": 0.9545,
      "fallbackRate": 0
    },
    "calibration": {
      "scored": 38,
      "truePositives": 21,
      "falsePositives": 3,
      "trueNegatives": 14,
      "falseNegatives": 0,
      "accuracy": 0.9211,
      "precision": 0.875,
      "recall": 1,
      "f1": 0.9333,
      "fallbackRate": 0
    },
    "heldout": {
      "scored": 45,
      "truePositives": 21,
      "falsePositives": 1,
      "trueNegatives": 23,
      "falseNegatives": 0,
      "accuracy": 0.9778,
      "precision": 0.9545,
      "recall": 1,
      "f1": 0.9767,
      "fallbackRate": 0
    }
  },
  "gated": {
    "all": {
      "scored": 83,
      "truePositives": 42,
      "falsePositives": 4,
      "trueNegatives": 37,
      "falseNegatives": 0,
      "accuracy": 0.9518,
      "precision": 0.913,
      "recall": 1,
      "f1": 0.9545,
      "fallbackRate": 0
    },
    "calibration": {
      "scored": 38,
      "truePositives": 21,
      "falsePositives": 3,
      "trueNegatives": 14,
      "falseNegatives": 0,
      "accuracy": 0.9211,
      "precision": 0.875,
      "recall": 1,
      "f1": 0.9333,
      "fallbackRate": 0
    },
    "heldout": {
      "scored": 45,
      "truePositives": 21,
      "falsePositives": 1,
      "trueNegatives": 23,
      "falseNegatives": 0,
      "accuracy": 0.9778,
      "precision": 0.9545,
      "recall": 1,
      "f1": 0.9767,
      "fallbackRate": 0
    }
  },
  "reliability": [
    {
      "lower": 0,
      "upper": 0.2,
      "count": 7,
      "observedAccuracy": 0.5714
    },
    {
      "lower": 0.2,
      "upper": 0.4,
      "count": 3,
      "observedAccuracy": 0.6667
    },
    {
      "lower": 0.4,
      "upper": 0.6,
      "count": 12,
      "observedAccuracy": 1
    },
    {
      "lower": 0.6,
      "upper": 0.8,
      "count": 34,
      "observedAccuracy": 1
    },
    {
      "lower": 0.8,
      "upper": 1,
      "count": 27,
      "observedAccuracy": 1
    }
  ],
  "byTag": {
    "ambiguous": {
      "scored": 0,
      "truePositives": 0,
      "falsePositives": 0,
      "trueNegatives": 0,
      "falseNegatives": 0,
      "accuracy": null,
      "precision": null,
      "recall": null,
      "f1": null,
      "fallbackRate": 0
    },
    "cjk": {
      "scored": 4,
      "truePositives": 3,
      "falsePositives": 0,
      "trueNegatives": 1,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "embedded_instruction": {
      "scored": 7,
      "truePositives": 2,
      "falsePositives": 1,
      "trueNegatives": 4,
      "falseNegatives": 0,
      "accuracy": 0.8571,
      "precision": 0.6667,
      "recall": 1,
      "f1": 0.8,
      "fallbackRate": 0
    },
    "indirect": {
      "scored": 7,
      "truePositives": 6,
      "falsePositives": 0,
      "trueNegatives": 1,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "long_irrelevant": {
      "scored": 6,
      "truePositives": 3,
      "falsePositives": 1,
      "trueNegatives": 2,
      "falseNegatives": 0,
      "accuracy": 0.8333,
      "precision": 0.75,
      "recall": 1,
      "f1": 0.8571,
      "fallbackRate": 0
    },
    "near_miss": {
      "scored": 21,
      "truePositives": 0,
      "falsePositives": 4,
      "trueNegatives": 17,
      "falseNegatives": 0,
      "accuracy": 0.8095,
      "precision": 0,
      "recall": null,
      "f1": null,
      "fallbackRate": 0
    },
    "negation": {
      "scored": 12,
      "truePositives": 10,
      "falsePositives": 0,
      "trueNegatives": 2,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "non_english": {
      "scored": 14,
      "truePositives": 8,
      "falsePositives": 0,
      "trueNegatives": 6,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "numeric": {
      "scored": 9,
      "truePositives": 2,
      "falsePositives": 0,
      "trueNegatives": 7,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "plain": {
      "scored": 27,
      "truePositives": 15,
      "falsePositives": 0,
      "trueNegatives": 12,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "typo": {
      "scored": 6,
      "truePositives": 5,
      "falsePositives": 0,
      "trueNegatives": 1,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    }
  },
  "errors": {
    "providerErrors": 0,
    "invalidResponses": 0,
    "timeouts": 0,
    "aborted": 0,
    "capacity": 0,
    "otherFallbacks": 0,
    "retries": 0,
    "rateLimited": 0,
    "overBudget": 0,
    "decidedByCode": 0,
    "skipped": 0
  },
  "cost": {
    "cases": 88,
    "answered": 88,
    "p50Ms": 164.55924999999843,
    "p95Ms": 228.61737500000163,
    "p99Ms": 387.91825000000244,
    "meanInputTokens": 417.9,
    "totalInputTokens": 36772,
    "totalOutputTokens": 1936,
    "usdPer1000Decisions": 0.01755,
    "usdPerMillionDecisions": 17.55,
    "totalUsd": 0.001544
  }
}
```

### review_security_gate

```json
{
  "chosen": {
    "skipBelow": 0.1
  },
  "production": {
    "all": {
      "scored": 92,
      "truePositives": 35,
      "falsePositives": 57,
      "trueNegatives": 0,
      "falseNegatives": 0,
      "accuracy": 0.3804,
      "precision": 0.3804,
      "recall": 1,
      "f1": 0.5512,
      "fallbackRate": 0
    },
    "calibration": {
      "scored": 33,
      "truePositives": 15,
      "falsePositives": 18,
      "trueNegatives": 0,
      "falseNegatives": 0,
      "accuracy": 0.4545,
      "precision": 0.4545,
      "recall": 1,
      "f1": 0.625,
      "fallbackRate": 0
    },
    "heldout": {
      "scored": 59,
      "truePositives": 20,
      "falsePositives": 39,
      "trueNegatives": 0,
      "falseNegatives": 0,
      "accuracy": 0.339,
      "precision": 0.339,
      "recall": 1,
      "f1": 0.5063,
      "fallbackRate": 0
    }
  },
  "ungated": {
    "all": {
      "scored": 92,
      "truePositives": 32,
      "falsePositives": 1,
      "trueNegatives": 56,
      "falseNegatives": 3,
      "accuracy": 0.9565,
      "precision": 0.9697,
      "recall": 0.9143,
      "f1": 0.9412,
      "fallbackRate": 0
    },
    "calibration": {
      "scored": 33,
      "truePositives": 12,
      "falsePositives": 0,
      "trueNegatives": 18,
      "falseNegatives": 3,
      "accuracy": 0.9091,
      "precision": 1,
      "recall": 0.8,
      "f1": 0.8889,
      "fallbackRate": 0
    },
    "heldout": {
      "scored": 59,
      "truePositives": 20,
      "falsePositives": 1,
      "trueNegatives": 38,
      "falseNegatives": 0,
      "accuracy": 0.9831,
      "precision": 0.9524,
      "recall": 1,
      "f1": 0.9756,
      "fallbackRate": 0
    }
  },
  "gated": {
    "all": {
      "scored": 92,
      "truePositives": 35,
      "falsePositives": 5,
      "trueNegatives": 52,
      "falseNegatives": 0,
      "accuracy": 0.9457,
      "precision": 0.875,
      "recall": 1,
      "f1": 0.9333,
      "fallbackRate": 0
    },
    "calibration": {
      "scored": 33,
      "truePositives": 15,
      "falsePositives": 1,
      "trueNegatives": 17,
      "falseNegatives": 0,
      "accuracy": 0.9697,
      "precision": 0.9375,
      "recall": 1,
      "f1": 0.9677,
      "fallbackRate": 0
    },
    "heldout": {
      "scored": 59,
      "truePositives": 20,
      "falsePositives": 4,
      "trueNegatives": 35,
      "falseNegatives": 0,
      "accuracy": 0.9322,
      "precision": 0.8333,
      "recall": 1,
      "f1": 0.9091,
      "fallbackRate": 0
    }
  },
  "reliability": [
    {
      "lower": 0,
      "upper": 0.2,
      "count": 10,
      "observedAccuracy": 0.9
    },
    {
      "lower": 0.2,
      "upper": 0.4,
      "count": 6,
      "observedAccuracy": 0.5
    },
    {
      "lower": 0.4,
      "upper": 0.6,
      "count": 4,
      "observedAccuracy": 1
    },
    {
      "lower": 0.6,
      "upper": 0.8,
      "count": 10,
      "observedAccuracy": 0.9
    },
    {
      "lower": 0.8,
      "upper": 1,
      "count": 39,
      "observedAccuracy": 1
    }
  ],
  "byTag": {
    "ambiguous": {
      "scored": 0,
      "truePositives": 0,
      "falsePositives": 0,
      "trueNegatives": 0,
      "falseNegatives": 0,
      "accuracy": null,
      "precision": null,
      "recall": null,
      "f1": null,
      "fallbackRate": 0
    },
    "cjk": {
      "scored": 3,
      "truePositives": 0,
      "falsePositives": 0,
      "trueNegatives": 3,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": null,
      "recall": null,
      "f1": null,
      "fallbackRate": 0
    },
    "embedded_instruction": {
      "scored": 5,
      "truePositives": 3,
      "falsePositives": 0,
      "trueNegatives": 2,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "indirect": {
      "scored": 10,
      "truePositives": 8,
      "falsePositives": 0,
      "trueNegatives": 2,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "long_irrelevant": {
      "scored": 6,
      "truePositives": 0,
      "falsePositives": 3,
      "trueNegatives": 3,
      "falseNegatives": 0,
      "accuracy": 0.5,
      "precision": 0,
      "recall": null,
      "f1": null,
      "fallbackRate": 0
    },
    "near_miss": {
      "scored": 37,
      "truePositives": 3,
      "falsePositives": 5,
      "trueNegatives": 29,
      "falseNegatives": 0,
      "accuracy": 0.8649,
      "precision": 0.375,
      "recall": 1,
      "f1": 0.5455,
      "fallbackRate": 0
    },
    "negation": {
      "scored": 3,
      "truePositives": 3,
      "falsePositives": 0,
      "trueNegatives": 0,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    },
    "non_english": {
      "scored": 11,
      "truePositives": 0,
      "falsePositives": 0,
      "trueNegatives": 11,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": null,
      "recall": null,
      "f1": null,
      "fallbackRate": 0
    },
    "plain": {
      "scored": 54,
      "truePositives": 31,
      "falsePositives": 0,
      "trueNegatives": 23,
      "falseNegatives": 0,
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "fallbackRate": 0
    }
  },
  "errors": {
    "providerErrors": 0,
    "invalidResponses": 0,
    "timeouts": 0,
    "aborted": 0,
    "capacity": 0,
    "otherFallbacks": 0,
    "retries": 0,
    "rateLimited": 0,
    "overBudget": 0,
    "decidedByCode": 23,
    "skipped": 0
  },
  "cost": {
    "cases": 104,
    "answered": 81,
    "p50Ms": 161.79462500000227,
    "p95Ms": 223.86383300000307,
    "p99Ms": 278.0847500000018,
    "meanInputTokens": 1441,
    "totalInputTokens": 116724,
    "totalOutputTokens": 1944,
    "usdPer1000Decisions": 0.060524,
    "usdPerMillionDecisions": 60.52,
    "totalUsd": 0.004902
  },
  "extra": {
    "falseNegativeIds": [],
    "calls": {
      "all": {
        "chunks": 104,
        "reviewed": 46,
        "skipped": 58,
        "modelCallsPerChunk": 1.442
      },
      "calibration": {
        "chunks": 38,
        "reviewed": 19,
        "skipped": 19,
        "modelCallsPerChunk": 1.5
      },
      "heldout": {
        "chunks": 66,
        "reviewed": 27,
        "skipped": 39,
        "modelCallsPerChunk": 1.409
      }
    },
    "decidedByPath": [
      "rs-058",
      "rs-059",
      "rs-060",
      "rs-061",
      "rs-062",
      "rs-063",
      "rs-064",
      "rs-065",
      "rs-066",
      "rs-067",
      "rs-069",
      "rs-070",
      "rs-071",
      "rs-072",
      "rs-073",
      "rs-074",
      "rs-075",
      "rs-076",
      "rs-077",
      "rs-078",
      "rs-079",
      "rs-203",
      "rs-204"
    ]
  }
}
```

### element_resolution

```json
{
  "chosen": {
    "minimumConfidence": 0.85
  },
  "production": {
    "all": {
      "scored": 110,
      "correct": 56,
      "accuracy": 0.5091,
      "accuracyWhenUsed": 0.5091,
      "escalationRate": 0
    },
    "calibration": {
      "scored": 44,
      "correct": 21,
      "accuracy": 0.4773,
      "accuracyWhenUsed": 0.4773,
      "escalationRate": 0
    },
    "heldout": {
      "scored": 66,
      "correct": 35,
      "accuracy": 0.5303,
      "accuracyWhenUsed": 0.5303,
      "escalationRate": 0
    }
  },
  "ungated": {
    "all": {
      "scored": 110,
      "correct": 101,
      "accuracy": 0.9182,
      "accuracyWhenUsed": 0.9182,
      "escalationRate": 0
    },
    "calibration": {
      "scored": 44,
      "correct": 39,
      "accuracy": 0.8864,
      "accuracyWhenUsed": 0.8864,
      "escalationRate": 0
    },
    "heldout": {
      "scored": 66,
      "correct": 62,
      "accuracy": 0.9394,
      "accuracyWhenUsed": 0.9394,
      "escalationRate": 0
    }
  },
  "gated": {
    "all": {
      "scored": 110,
      "correct": 83,
      "accuracy": 0.7545,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2632
    },
    "calibration": {
      "scored": 44,
      "correct": 35,
      "accuracy": 0.7955,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2391
    },
    "heldout": {
      "scored": 66,
      "correct": 48,
      "accuracy": 0.7273,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2794
    }
  },
  "reliability": [
    {
      "lower": 0,
      "upper": 0.2,
      "count": 0,
      "observedAccuracy": null
    },
    {
      "lower": 0.2,
      "upper": 0.4,
      "count": 1,
      "observedAccuracy": 0
    },
    {
      "lower": 0.4,
      "upper": 0.6,
      "count": 10,
      "observedAccuracy": 0.5
    },
    {
      "lower": 0.6,
      "upper": 0.8,
      "count": 9,
      "observedAccuracy": 0.7778
    },
    {
      "lower": 0.8,
      "upper": 1,
      "count": 90,
      "observedAccuracy": 0.9889
    }
  ],
  "byTag": {
    "ambiguous": {
      "scored": 0,
      "correct": 0,
      "accuracy": null,
      "accuracyWhenUsed": null,
      "escalationRate": 0.6667
    },
    "cjk": {
      "scored": 10,
      "correct": 10,
      "accuracy": 1,
      "accuracyWhenUsed": 1,
      "escalationRate": 0
    },
    "embedded_instruction": {
      "scored": 6,
      "correct": 5,
      "accuracy": 0.8333,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.1667
    },
    "indirect": {
      "scored": 35,
      "correct": 23,
      "accuracy": 0.6571,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.3429
    },
    "long_irrelevant": {
      "scored": 16,
      "correct": 7,
      "accuracy": 0.4375,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.5882
    },
    "near_miss": {
      "scored": 37,
      "correct": 26,
      "accuracy": 0.7027,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2973
    },
    "negation": {
      "scored": 7,
      "correct": 6,
      "accuracy": 0.8571,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.1429
    },
    "non_english": {
      "scored": 24,
      "correct": 21,
      "accuracy": 0.875,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.125
    },
    "numeric": {
      "scored": 11,
      "correct": 4,
      "accuracy": 0.3636,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.6364
    },
    "page:admin-users-de": {
      "scored": 9,
      "correct": 6,
      "accuracy": 0.6667,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.3333
    },
    "page:checkout": {
      "scored": 17,
      "correct": 12,
      "accuracy": 0.7059,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2941
    },
    "page:dashboard-injected": {
      "scored": 6,
      "correct": 5,
      "accuracy": 0.8333,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.1667
    },
    "page:job-application": {
      "scored": 11,
      "correct": 10,
      "accuracy": 0.9091,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2308
    },
    "page:login": {
      "scored": 15,
      "correct": 12,
      "accuracy": 0.8,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.1875
    },
    "page:orders-table": {
      "scored": 15,
      "correct": 6,
      "accuracy": 0.4,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.625
    },
    "page:search-results": {
      "scored": 13,
      "correct": 10,
      "accuracy": 0.7692,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.2308
    },
    "page:settings": {
      "scored": 15,
      "correct": 13,
      "accuracy": 0.8667,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.1333
    },
    "page:shop-ja": {
      "scored": 9,
      "correct": 9,
      "accuracy": 1,
      "accuracyWhenUsed": 1,
      "escalationRate": 0
    },
    "plain": {
      "scored": 22,
      "correct": 19,
      "accuracy": 0.8636,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.1739
    },
    "typo": {
      "scored": 2,
      "correct": 1,
      "accuracy": 0.5,
      "accuracyWhenUsed": 1,
      "escalationRate": 0.5
    }
  },
  "errors": {
    "providerErrors": 0,
    "invalidResponses": 0,
    "timeouts": 0,
    "aborted": 0,
    "capacity": 0,
    "otherFallbacks": 0,
    "retries": 0,
    "rateLimited": 0,
    "overBudget": 0,
    "decidedByCode": 2,
    "skipped": 0
  },
  "cost": {
    "cases": 114,
    "answered": 112,
    "p50Ms": 169.5234580000033,
    "p95Ms": 218.86670799999774,
    "p99Ms": 259.68616699999984,
    "meanInputTokens": 1629.3,
    "totalInputTokens": 182476,
    "totalOutputTokens": 39956,
    "usdPer1000Decisions": 0.068429,
    "usdPerMillionDecisions": 68.43,
    "totalUsd": 0.007664
  },
  "extra": {
    "decidedByExactLabel": 2,
    "chosenNoneWhenAnElementWasLabelled": 0,
    "answerKey": "element"
  }
}
```
