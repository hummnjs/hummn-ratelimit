import {
  fixedWindowLimitScript,
  fixedWindowRemainingTokensScript,
  slidingWindowLimitScript,
  slidingWindowRemainingTokensScript,
  tokenBucketLimitScript,
  tokenBucketRemainingTokensScript,
} from "./algorithms";
import { resetScript } from "./reset";

export type ScriptInfo = {
  script: string;
  hash: string;
};

type Algorithm = {
  limit: ScriptInfo;
  getRemaining: ScriptInfo;
};

type AlgorithmKind = "fixedWindow" | "slidingWindow" | "tokenBucket";

export const SCRIPTS: {
  default: Record<AlgorithmKind, Algorithm>;
} = {
  default: {
    fixedWindow: {
      limit: {
        script: fixedWindowLimitScript,
        hash: "40229e0827adf609e738cf5505d787710b2e9167",
      },
      getRemaining: {
        script: fixedWindowRemainingTokensScript,
        hash: "727a04e0b8638393a29a1b7e854532c4d4a5e63c",
      },
    },
    slidingWindow: {
      limit: {
        script: slidingWindowLimitScript,
        hash: "553d3f80f6eb3cdffa382465ecce625e9599687d",
      },
      getRemaining: {
        script: slidingWindowRemainingTokensScript,
        hash: "a1ee4c694289e4958f64662cac60cd4300b3c9ad",
      },
    },
    tokenBucket: {
      limit: {
        script: tokenBucketLimitScript,
        hash: "b28bf2bf367df84c2125427c31de987ed651f0bf",
      },
      getRemaining: {
        script: tokenBucketRemainingTokensScript,
        hash: "594bad9db6bdac192171292446ecbffc8f372925",
      },
    },
  },
};

/** COMMON */
export const RESET_SCRIPT: ScriptInfo = {
  script: resetScript,
  hash: "3ced5b0882b46335cdd53291d2bbe4ea98b1a648",
};
