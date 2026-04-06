const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DEFAULT_FILES = ["flashcards.csv", "pr_mock2526_solution_questions.csv"];
const START_TAG = "[[MATH]]";
const END_TAG = "[[/MATH]]";

const CANDIDATE_PATTERN = /([A-Za-zθϕφλμΣ∇Ωπ][A-Za-z0-9_′'()\[\]{}^|\s]{0,32}(?:<=|>=|!=|=|≤|≥|≠|<|>)[A-Za-z0-9_θϕφλμΣ∇Ωπ()\[\]{}^|+\-*/.,\s]{1,72})/g;

function withStandardizedFormulas(text) {
  return String(text ?? "")
    .replace(/g\(z\)\s*=\s*1\+e[−-]?z/gi, "g(z) = 1/(1+e^{-z})")
    .replace(/θTx/g, "θ^T x")
    .replace(/θTxi/g, "θ^T x_i")
    .replace(/Pm i=1\(yi\s*[−-]\s*g\(θTxi\)\)xi/g, "sum_{i=1}^{m}(y_i - g(θ^T x_i))x_i")
    .replace(/P\(x\|y\)\s*=\s*prod\s+P\(x_i\|y\)/gi, "P(x|y) = prod_i P(x_i|y)")
    .replace(/P\(x\|y\)\s*=\s*prod_d\s+P\(x_d\|y\)/gi, "P(x|y) = prod_d P(x_d|y)")
    .replace(/L\(theta\)\s*=\s*sum_i\s+log\s+P\(x_i\s*\|\s*theta\)/gi, "L(theta) = sum_i log P(x_i | theta)")
    .replace(/theta_ML\s*=\s*argmax_theta\s+sum_i\s+log\s+P\(x_i\s*\|\s*theta\)/gi, "theta_ML = argmax_theta sum_i log P(x_i | theta)")
    .replace(
      /theta_MAP\s*=\s*argmax_theta\s*\[\s*sum_i\s+log\s+P\(x_i\s*\|\s*theta\)\s*\+\s*log\s+P\(theta\)\s*\]/gi,
      "theta_MAP = argmax_theta [ sum_i log P(x_i | theta) + log P(theta) ]"
    )
    .replace(/R\(w\)\s*=\s*\(w\^T\s*Sigma_between\s*w\)\s*\/\s*\(w\^T\s*Sigma_intra\s*w\)/gi, "R(w) = (w^T Sigma_between w) / (w^T Sigma_intra w)")
    .replace(/N\(x\s*\|\s*mu_k\s+Sigma_k\)/gi, "N(x | mu_k, Sigma_k)")
    .replace(/lambda_i\s*-\s*lambda_hat_i\s*!=\s*0/gi, "lambda_i - lambda_hat_i != 0")
    .replace(/D−1\/2U Tx/g, "D^{-1/2}U^T x")
    .replace(/J\(r\)\s*=\s*r⊤SBr\s*r⊤SW\s*r/g, "J(r) = (r^T S_B r)/(r^T S_W r)");
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function isAlreadyTagged(text, start, end) {
  const before = text.slice(0, start);
  const openCount = countMatches(before, /\[\[MATH\]\]/g);
  const closeCount = countMatches(before, /\[\[\/MATH\]\]/g);
  return openCount > closeCount || /\[\[MATH\]\][\s\S]*\[\[\/MATH\]\]/.test(text.slice(start, end));
}

function looksLikeStandaloneEquation(text) {
  const candidate = String(text ?? "").trim();
  if (!candidate) {
    return false;
  }

  if (!/(<=|>=|!=|=|≤|≥|≠|<|>)/.test(candidate)) {
    return false;
  }

  // Avoid wrapping prose fragments that merely contain a comparison.
  if (/\b(if|because|requires|describes|means|assumes|model|algorithm|class|boundary|probability|training|samples|data)\b/i.test(candidate)) {
    return false;
  }

  const longWordCount = countMatches(candidate.toLowerCase(), /\b[a-z]{5,}\b/g);
  const symbolCount = countMatches(candidate, /[\^_()\[\]{}|+\-*/]/g);
  if (longWordCount >= 4 && symbolCount <= 2) {
    return false;
  }

  return true;
}

function isLikelyMathExpression(candidate) {
  const text = String(candidate ?? "").trim();
  if (!text) {
    return false;
  }

  if (!/(<=|>=|!=|=|≤|≥|≠)/.test(text)) {
    return false;
  }

  const lower = text.toLowerCase();
  const greekOrNamedSignals = /(theta|sigma|lambda|mu|phi|argmax|sum|prod|log|exp|sqrt|logit|odds|f1|tpr|fpr|npv|acc|precision|recall|\blda\b|\bgmm\b|\bem\b|\bsvr\b|θ|ϕ|φ|λ|μ|Σ|∇|Ω|π)/i;
  const structuralSignals = /(\^|_|\(|\)|\[|\]|\{|\}|\/|\*|\+|\-|\|)/;
  const variableSignals = /(\b[a-zA-Z]\d+\b|\b[a-zA-Z]_[a-zA-Z0-9]+\b|\b[a-zA-Z]\s*[\*\/+\-]\s*[a-zA-Z0-9]|\b[a-zA-Z]+\([^\)]*\))/;
  const numericSignals = /\d/;

  const hasStrongSignal = greekOrNamedSignals.test(text) || structuralSignals.test(text) || variableSignals.test(text);
  const hasNumericSignal = numericSignals.test(text);

  if (!hasStrongSignal && !hasNumericSignal) {
    return false;
  }

  const longWordCount = countMatches(lower, /\b[a-z]{5,}\b/g);
  const symbolCount = countMatches(text, /[\^_\(\)\[\]\{\}\/\*\+\-|]/g);
  const operatorCount = countMatches(text, /<=|>=|!=|=|≤|≥|≠/g);

  if (longWordCount >= 6 && symbolCount <= 1 && operatorCount === 1 && !greekOrNamedSignals.test(text)) {
    return false;
  }

  return true;
}

function tagMathSegments(value) {
  const normalized = withStandardizedFormulas(value);
  let replacements = 0;

  const tagged = normalized.replace(CANDIDATE_PATTERN, (match, _group, offset, whole) => {
    const start = Number(offset);
    const end = start + match.length;

    if (isAlreadyTagged(whole, start, end)) {
      return match;
    }

    const compact = String(match).replace(/\s+/g, " ").trim();
    if (!looksLikeStandaloneEquation(compact) || !isLikelyMathExpression(compact)) {
      return match;
    }

    replacements += 1;
    return `${START_TAG}${compact}${END_TAG}`;
  });

  return { text: tagged, count: replacements };
}

function processFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const result = tagMathSegments(raw);
  const out = result.text;
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, out, "utf8");
  fs.renameSync(tempPath, filePath);

  return { fileName, taggedCount: result.count };
}

function main() {
  const cliFiles = process.argv.slice(2).filter(Boolean);
  const files = cliFiles.length ? cliFiles : DEFAULT_FILES;
  const summary = files.map(processFile);
  summary.forEach((entry) => {
    console.log(`${entry.fileName}: tagged ${entry.taggedCount} equations`);
  });
}

main();
