/**
 * Cue validation for Mode 1 "What's the Play?" flow.
 *
 * Rules:
 * - Student must submit at least 1 recognition cue before options appear
 * - At least 1 submitted cue must match cue_tokens or cue_aliases
 * - Matching is normalized: case-insensitive, punctuation-stripped, stemmed
 * - If validation fails, options stay hidden + corrective feedback shown
 * - At least 1 matched cue must be non-generic (dynamically computed from problem DB)
 */

// Simple stemmer — strips common suffixes for matching
function stem(word) {
  let w = word.toLowerCase().trim();
  // Remove common suffixes
  const suffixes = ['ing', 'tion', 'sion', 'ment', 'ness', 'ous', 'ive', 'ful', 'less', 'ly', 'ed', 'er', 'est', 'es', 's'];
  for (const suffix of suffixes) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

// Normalize a string: lowercase, strip punctuation, trim
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenize a normalized string into stemmed words
function tokenize(str) {
  return normalize(str).split(' ').map(stem).filter(Boolean);
}

// Generic cue phrases — broad math vocabulary that matches too many concepts (hardcoded)
const GENERIC_CUE_PHRASES = new Set([
  'rate of change',
  'maximum value',
  'minimum value',
  'increasing function',
  'decreasing function',
  'concave up',
  'concave down',
  'integral',
  'derivative',
  'antiderivative',
  'differentiate',
  'integrate',
  'continuous function',
  'area under',
]);

// Fallback generic single words — used when no problem array is available
const FALLBACK_GENERIC_CUE_WORDS = new Set([
  'rate', 'change', 'maximum', 'minimum', 'increasing', 'decreasing',
  'integral', 'derivative', 'antiderivative', 'differentiate', 'integrate',
  'slope', 'tangent', 'continuous', 'limit', 'function', 'interval',
]);

// Cache for buildGenericCueWords results
let _genericCueWordsCache = null;
let _genericCueWordsCacheKey = null;

/**
 * Build the set of generic cue words dynamically from the problem database.
 * A token is generic if it appears as a meaningful cue token across >= minConcepts
 * distinct concepts. This replaces manual word lists with data-driven detection.
 *
 * @param {object[]} allProblems - Full problems array
 * @param {number} minConcepts - Minimum distinct concepts for a word to be generic (default 3)
 * @returns {Set<string>}
 */
export function buildGenericCueWords(allProblems, minConcepts = 3) {
  if (!allProblems || allProblems.length === 0) return FALLBACK_GENERIC_CUE_WORDS;

  const cacheKey = `${allProblems.length}:${minConcepts}`;
  if (_genericCueWordsCacheKey === cacheKey && _genericCueWordsCache) {
    return _genericCueWordsCache;
  }

  const wordToConcepts = new Map();
  for (const p of allProblems) {
    const cues = [...(p.cue_tokens || []), ...(p.cue_aliases || [])];
    for (const cue of cues) {
      const tokens = new Set(meaningfulTokens(cue));
      for (const t of tokens) {
        if (!wordToConcepts.has(t)) wordToConcepts.set(t, new Set());
        wordToConcepts.get(t).add(p.concept);
      }
    }
  }

  const result = new Set(
    [...wordToConcepts.entries()]
      .filter(([, s]) => s.size >= minConcepts)
      .map(([w]) => w)
  );

  _genericCueWordsCache = result;
  _genericCueWordsCacheKey = cacheKey;
  return result;
}

// Stopwords — generic terms that don't indicate concept recognition
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when',
  'where', 'which', 'find', 'solve', 'compute', 'apply', 'use', 'given',
  'determine', 'calculate', 'show', 'let', 'suppose', 'assume', 'consider',
  'are', 'was', 'been', 'being', 'have', 'has', 'had', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'not', 'but', 'yet', 'also', 'just', 'than', 'then', 'now', 'how',
]);

// Filter tokens to only meaningful ones (length >= 4, not stopwords)
function meaningfulTokens(str) {
  return tokenize(str).filter(t => t.length >= 4 && !STOPWORDS.has(t));
}

/**
 * Detect if a string is math notation (LaTeX, derivative notation, etc.)
 * Math cues like "lim", "\to", "f''(x) > 0", "d/dx", "f^{-1}" have no
 * meaningful alpha tokens after normalization.
 */
function isMathNotation(str) {
  return /[\\^{}']|^[a-z]{1,3}$|^d\/d[a-z]$/i.test(str.trim());
}

/**
 * Normalize math notation for comparison: strip spaces/casing but keep
 * math-significant characters (primes, braces, backslashes, carets).
 */
function normalizeMath(str) {
  return str.toLowerCase().replace(/\s+/g, '').trim();
}

/**
 * Check if a cue is generic math vocabulary.
 * - Single meaningful token in genericWords → generic
 * - Multi-word cue where ALL meaningful tokens are in genericWords → generic
 * - Phrase match against GENERIC_CUE_PHRASES → generic
 *
 * @param {string} cue - The cue to check
 * @param {Set<string>} genericWords - Dynamic set of generic words
 */
function isGenericCue(cue, genericWords) {
  const n = normalize(cue);
  if (GENERIC_CUE_PHRASES.has(n)) return true;
  const tokens = meaningfulTokens(cue);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return genericWords.has(tokens[0]);
  // Multi-word: generic only if ALL meaningful tokens are generic
  return tokens.every(t => genericWords.has(t));
}

/**
 * Check if a student-submitted cue matches any of the valid cue tokens/aliases.
 * Strict matching: exact phrase or significant token overlap only.
 * Math-notation cues use exact normalized comparison.
 *
 * Prefers non-generic validCue matches: if a generic validCue matches first,
 * continues searching for a non-generic one to return instead.
 *
 * @param {string} studentCue - Student's submitted cue
 * @param {string[]} validCues - Problem's cue_tokens + cue_aliases
 * @param {Set<string>} genericWords - Dynamic set of generic words
 * @returns {{ matched: boolean, validCue: string | null }}
 */
function cueMatches(studentCue, validCues, genericWords) {
  const normalizedStudent = normalize(studentCue);
  const studentTokens = meaningfulTokens(studentCue);
  const studentMath = normalizeMath(studentCue);
  let firstGenericMatch = null;

  for (const validCue of validCues) {
    const normalizedValid = normalize(validCue);

    // Exact full-phrase match (after normalization)
    if (normalizedStudent === normalizedValid) {
      if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
      if (!firstGenericMatch) firstGenericMatch = validCue;
      continue;
    }

    // Math-notation match: if the valid cue is math notation,
    // compare via math-aware normalization (keeps primes, braces, etc.)
    const validTokens = meaningfulTokens(validCue);
    if (validTokens.length === 0 && isMathNotation(validCue)) {
      if (studentMath === normalizeMath(validCue)) {
        if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
        if (!firstGenericMatch) firstGenericMatch = validCue;
      }
      continue;
    }

    // If student input has no meaningful tokens, can't do token matching
    if (studentTokens.length === 0) continue;

    if (validTokens.length === 0) continue;

    let tokenMatch = false;
    if (validTokens.length === 1) {
      // Single-token cue: student must have that exact token
      tokenMatch = studentTokens.includes(validTokens[0]);
    } else {
      // Multi-token cue: require >= 2 overlapping meaningful tokens
      const overlap = studentTokens.filter(t => validTokens.includes(t));
      tokenMatch = overlap.length >= 2;
    }

    if (tokenMatch) {
      if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
      if (!firstGenericMatch) firstGenericMatch = validCue;
    }
  }

  // If only generic matches found, return the first one
  if (firstGenericMatch) return { matched: true, validCue: firstGenericMatch };

  return { matched: false, validCue: null };
}

/**
 * Validate student's cues against problem's cue_tokens + cue_aliases.
 *
 * @param {string[]} studentCues - 1 or more cues submitted by student
 * @param {object} problem - The problem object with cue_tokens and cue_aliases
 * @param {object[]} allProblems - Full problems array for dynamic generic detection
 * @returns {{ valid: boolean, matchCount: number, feedback: string | null }}
 */
export function validateCues(studentCues, problem, allProblems = []) {
  if (!studentCues || studentCues.length === 0) {
    return {
      valid: false,
      matchCount: 0,
      feedback: 'Select at least one recognition cue.',
    };
  }

  // Filter out empty cues
  const nonEmpty = studentCues.filter((c) => c.trim().length > 0);
  if (nonEmpty.length === 0) {
    return {
      valid: false,
      matchCount: 0,
      feedback: 'Select at least one recognition cue. What in this problem tells you which technique to use?',
    };
  }

  const genericWords = buildGenericCueWords(allProblems, 3);
  const validCues = [...(problem.cue_tokens || []), ...(problem.cue_aliases || [])];

  // Check if this problem has ANY non-generic valid cues.
  // If all valid cues are generic, waive the non-generic requirement —
  // the student can't be expected to provide specific cues that don't exist.
  const hasNonGenericValidCue = validCues.some(vc => !isGenericCue(vc, genericWords));

  let matchCount = 0;
  let nonGenericMatchCount = 0;

  for (const cue of nonEmpty) {
    const result = cueMatches(cue, validCues, genericWords);
    if (result.matched) {
      matchCount++;
      // A match is non-generic if neither the student cue NOR the matched valid cue is generic
      if (!isGenericCue(cue, genericWords) && !isGenericCue(result.validCue, genericWords)) {
        nonGenericMatchCount++;
      }
    }
  }

  const needsNonGeneric = hasNonGenericValidCue;

  if (matchCount >= 1 && (!needsNonGeneric || nonGenericMatchCount >= 1)) {
    return { valid: true, matchCount, feedback: null };
  }

  if (matchCount >= 1 && nonGenericMatchCount === 0) {
    return {
      valid: false,
      matchCount,
      feedback: 'Your cues are too generic. What specific structure in this problem points to the technique?',
    };
  }

  return {
    valid: false,
    matchCount: 0,
    feedback: generateCorrectiveFeedback(problem),
  };
}

/**
 * Generate corrective feedback when cue validation fails.
 * Gives a hint about what to look for without revealing the answer.
 */
function generateCorrectiveFeedback(problem) {
  const concept = problem.concept;

  // Concept-specific corrective hints
  const hints = {
    derivative_as_rate: 'Look again \u2014 what in this problem tells you something is changing? Is there a rate mentioned?',
    integral_as_accumulation: 'Look again \u2014 is the problem asking about a total amount built up over time or an interval?',
    ftc_part1: 'Look again \u2014 do you see a function defined as an integral with a variable bound?',
    ftc_part2: 'Look again \u2014 is there a connection between an antiderivative and a definite integral here?',
    riemann_sums: 'Look again \u2014 do you see a sum of rectangles or a partition of an interval?',
    f_fprime_fdoubleprime: 'Look again \u2014 is the problem asking you to connect information between a function and its derivatives?',
    increasing_decreasing: 'Look again \u2014 is the problem asking WHERE a function goes up or goes down?',
    concavity: 'Look again \u2014 is the problem asking about the shape of the curve (bending up or down)?',
    relative_extrema: 'Look again \u2014 is the problem asking about local high or low points?',
    absolute_extrema: 'Look again \u2014 is there a closed interval and a question about the highest or lowest value overall?',
    inflection_points: 'Look again \u2014 is the problem asking where concavity changes?',
    evt: 'Look again \u2014 does this involve a continuous function on a closed interval guaranteeing extreme values?',
    mvt: 'Look again \u2014 is there a connection between an average rate and an instantaneous rate on an interval?',
    optimization: 'Look again \u2014 is the problem asking you to find a maximum or minimum value of some quantity?',
    product_rule: 'Look again \u2014 are you differentiating a product of two functions?',
    quotient_rule: 'Look again \u2014 are you differentiating a fraction where both top and bottom have variables?',
    chain_rule: 'Look again \u2014 is there a composition of functions (a function inside another function)?',
    implicit_differentiation: 'Look again \u2014 is the equation mixing x and y without y being isolated?',
    inverse_function_derivatives: 'Look again \u2014 does this involve finding the derivative of an inverse function?',
    related_rates: 'Look again \u2014 what in this problem tells you something is changing over time? Are multiple quantities linked?',
    linear_approximation: 'Look again \u2014 is the problem asking you to estimate a value near a known point?',
    lhopitals_rule: 'Look again \u2014 does evaluating this limit give you an indeterminate form like 0/0 or \u221e/\u221e?',
    u_substitution: 'Look again \u2014 is there a composite structure inside an integral that suggests a substitution?',
    area_between_curves: 'Look again \u2014 is the problem asking for the area enclosed between two functions?',
    volume_cross_sections: 'Look again \u2014 is the problem describing a solid with known cross-sectional shapes?',
    volume_disk_washer: 'Look again \u2014 is a region being revolved around an axis?',
    average_value: 'Look again \u2014 is the problem asking for the average of a function over an interval?',
    separation_of_variables: 'Look again \u2014 do you see a differential equation where you can isolate dy and dx on different sides?',
    slope_fields: 'Look again \u2014 does the problem show or describe a field of tiny line segments?',
    eulers_method: 'Look again \u2014 is the problem asking you to approximate a solution using small steps from an initial value?',
    particle_motion: 'Look again \u2014 is this about position, velocity, or acceleration of a moving object?',
    limit_evaluation: 'Look again \u2014 is the problem asking what value an expression approaches?',
    continuity_types: 'Look again \u2014 is the problem asking about whether or where a function is continuous?',
    squeeze_theorem: 'Look again \u2014 are there bounding functions trapping the expression from above and below?',
  };

  return hints[concept] || 'Look again \u2014 what specific words or structure in this problem point to the technique you need?';
}

/**
 * Extract candidate cue chips from problem stem text.
 * Returns short phrases that a student might click as recognition cues.
 */
export function extractCueChips(problem, allProblems) {
  const stem = problem.stem;
  const chips = new Set();

  // Always include ALL cue tokens as tappable chips
  for (const token of problem.cue_tokens || []) {
    chips.add(token);
  }

  // Extract common signal phrases from the stem
  const signalPatterns = [
    /how fast/gi,
    /rate of change/gi,
    /at what rate/gi,
    /per second/gi,
    /per minute/gi,
    /per hour/gi,
    /ft\/s/gi,
    /m\/s/gi,
    /increasing|decreasing/gi,
    /maximum|minimum/gi,
    /concav(?:e|ity)/gi,
    /inflection/gi,
    /continuous|continuity/gi,
    /closed interval/gi,
    /approaches|tends to/gi,
    /limit/gi,
    /approximate|approximation|estimate/gi,
    /total (?:amount|distance|change)/gi,
    /accumulated/gi,
    /area (?:under|between|enclosed)/gi,
    /volume/gi,
    /cross[- ]section/gi,
    /revolve|rotated|rotation/gi,
    /average value/gi,
    /slope field/gi,
    /initial (?:value|condition)/gi,
    /separate|separation/gi,
    /with respect to (?:time|t|x)/gi,
    /implicit/gi,
    /inverse/gi,
    /indeterminate/gi,
    /0\/0/g,
    /position|velocity|acceleration/gi,
  ];

  for (const pattern of signalPatterns) {
    const matches = stem.match(pattern);
    if (matches) {
      for (const m of matches) {
        chips.add(m.trim());
      }
    }
  }

  // Add problem-specific distractor chips from the confusion concept
  const distractorChips = allProblems
    ? generateDistractorChips(problem, allProblems)
    : [];
  for (const dc of distractorChips) {
    chips.add(dc);
  }

  return Array.from(chips);
}

/**
 * Generate distractor cue chips from the common_misidentification concept's problems.
 * These are cue tokens that belong to the WRONG concept, making them plausible-but-incorrect.
 */
export function generateDistractorChips(problem, allProblems) {
  const distractorConcept = problem.common_misidentification;
  if (!distractorConcept) return [];

  // Collect cue tokens from problems of the distractor concept
  const distractorProblems = allProblems.filter(p => p.concept === distractorConcept);
  const distractorCuePool = new Set();
  const currentValidCues = (problem.cue_tokens || []).concat(problem.cue_aliases || []);

  for (const dp of distractorProblems) {
    for (const ct of (dp.cue_tokens || [])) {
      // Don't include cues that are also valid for the current problem
      const isValidForCurrent = currentValidCues
        .some(vc => normalize(vc) === normalize(ct));
      if (!isValidForCurrent) {
        distractorCuePool.add(ct);
      }
    }
  }

  // Shuffle and take up to 4
  const arr = Array.from(distractorCuePool);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 4);
}
