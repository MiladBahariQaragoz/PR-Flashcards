const elements = {
  userLabel: document.getElementById("userLabel"),
  switchUserButton: document.getElementById("switchUserButton"),
  deckSize: document.getElementById("deckSize"),
  masteredCount: document.getElementById("masteredCount"),
  reviewCount: document.getElementById("reviewCount"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  contextFilter: document.getElementById("contextFilter"),
  searchInput: document.getElementById("searchInput"),
  reviewOnlyToggle: document.getElementById("reviewOnlyToggle"),
  previousButton: document.getElementById("previousButton"),
  shuffleButton: document.getElementById("shuffleButton"),
  resetButton: document.getElementById("resetButton"),
  flashcardButton: document.getElementById("flashcardButton"),
  knownButton: document.getElementById("knownButton"),
  reviewButton: document.getElementById("reviewButton"),
  nextButton: document.getElementById("nextButton"),
  cardCounter: document.getElementById("cardCounter"),
  frontText: document.getElementById("frontText"),
  frontContext: document.getElementById("frontContext"),
  frontMedia: document.getElementById("frontMedia"),
  frontOptions: document.getElementById("frontOptions"),
  frontHint: document.getElementById("frontHint"),
  backAnswer: document.getElementById("backAnswer"),
  backDetails: document.getElementById("backDetails"),
  queueList: document.getElementById("queueList"),
  nameModal: document.getElementById("nameModal"),
  nameForm: document.getElementById("nameForm"),
  nameInput: document.getElementById("nameInput"),
};

const STORAGE_USER_KEY = "flashcards.activeUser";
const progressPrefix = "flashcards.progress:";

const state = {
  cards: [],
  userName: "",
  progress: null,
  currentCardId: null,
  currentFilter: "all",
  searchQuery: "",
  showReviewOnly: false,
  isFlipped: false,
};

const EXAM_CSV_PATH = "./pr_mock2526_solution_questions.csv";
const FLASHCARD_CSV_PATH = "./flashcards.csv";
const MOCK_EXAM_CONTEXT = "mock exam";
const MATH_TAG_START = "[[MATH]]";
const MATH_TAG_END = "[[/MATH]]";

function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

function storageKeyForUser(name) {
  return `${progressPrefix}${slugify(name)}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      if (current.length > 0 || row.length > 0) {
        row.push(current);
        rows.push(row);
      }

      row = [];
      current = "";
      continue;
    }

    current += character;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((entry) => entry.trim());

  return dataRows
    .filter((entry) => entry.length >= headers.length)
    .map((entry) => {
      const record = {};

      headers.forEach((header, index) => {
        record[header] = (entry[index] ?? "").trim();
      });

      return record;
    });
}

function loadProgress(name) {
  const raw = localStorage.getItem(storageKeyForUser(name));
  if (!raw) {
    return {
      currentCardId: null,
      flipped: false,
      cardState: {},
      shuffleSeed: Date.now(),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      currentCardId: parsed.currentCardId ?? null,
      flipped: Boolean(parsed.flipped),
      cardState: parsed.cardState && typeof parsed.cardState === "object" ? parsed.cardState : {},
      shuffleSeed: parsed.shuffleSeed ?? Date.now(),
    };
  } catch {
    return {
      currentCardId: null,
      flipped: false,
      cardState: {},
      shuffleSeed: Date.now(),
    };
  }
}

function saveProgress() {
  if (!state.userName || !state.progress) {
    return;
  }

  const payload = {
    currentCardId: state.currentCardId,
    flipped: state.isFlipped,
    cardState: state.progress.cardState,
    shuffleSeed: state.progress.shuffleSeed,
  };

  localStorage.setItem(storageKeyForUser(state.userName), JSON.stringify(payload));
  localStorage.setItem(STORAGE_USER_KEY, state.userName);
}

function setCardState(cardId, status) {
  state.progress.cardState[cardId] = {
    status,
    updatedAt: new Date().toISOString(),
  };
  saveProgress();
  renderStats();
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function standardizeEquationText(value) {
  let text = String(value ?? "");

  const replacements = [
    [/g\(z\)\s*=\s*1\+e[−-]?z/gi, "g(z) = 1/(1+e^{-z})"],
    [/θTx/g, "θ^T x"],
    [/θTxi/g, "θ^T x_i"],
    [/Pm i=1\(yi\s*[−-]\s*g\(θTxi\)\)xi/g, "sum_{i=1}^{m}(y_i - g(θ^T x_i))x_i"],
    [/P\(x\|y\)\s*=\s*prod\s+P\(x_i\|y\)/gi, "P(x|y) = prod_i P(x_i|y)"],
    [/P\(x\|y\)\s*=\s*prod_d\s+P\(x_d\|y\)/gi, "P(x|y) = prod_d P(x_d|y)"],
    [/L\(theta\)\s*=\s*sum_i\s+log\s+P\(x_i\s*\|\s*theta\)/gi, "L(theta) = sum_i log P(x_i | theta)"],
    [/theta_ML\s*=\s*argmax_theta\s+sum_i\s+log\s+P\(x_i\s*\|\s*theta\)/gi, "theta_ML = argmax_theta sum_i log P(x_i | theta)"],
    [
      /theta_MAP\s*=\s*argmax_theta\s*\[\s*sum_i\s+log\s+P\(x_i\s*\|\s*theta\)\s*\+\s*log\s+P\(theta\)\s*\]/gi,
      "theta_MAP = argmax_theta [ sum_i log P(x_i | theta) + log P(theta) ]",
    ],
    [/R\(w\)\s*=\s*\(w\^T\s*Sigma_between\s*w\)\s*\/\s*\(w\^T\s*Sigma_intra\s*w\)/gi, "R(w) = (w^T Sigma_between w) / (w^T Sigma_intra w)"],
    [/N\(x\s*\|\s*mu_k\s+Sigma_k\)/gi, "N(x | mu_k, Sigma_k)"],
    [/lambda_i\s*-\s*lambda_hat_i\s*!=\s*0/gi, "lambda_i - lambda_hat_i != 0"],
    [/D−1\/2U Tx/g, "D^{-1/2}U^T x"],
    [/J\(r\)\s*=\s*r⊤SBr\s*r⊤SW\s*r/g, "J(r) = (r^T S_B r)/(r^T S_W r)"],
  ];

  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text;
}

function toLatexExpression(value) {
  let latex = String(value ?? "").trim();

  latex = latex
    .replace(/>=/g, "\\ge ")
    .replace(/<=/g, "\\le ")
    .replace(/!=/g, "\\ne ")
    .replace(/\bargmax_([A-Za-z0-9]+)/g, "\\arg\\max_{$1}")
    .replace(/\bsum_([A-Za-z0-9]+)=([A-Za-z0-9]+)/g, "\\sum_{$1={$2}}")
    .replace(/\bsum_([A-Za-z0-9]+)/g, "\\sum_{$1}")
    .replace(/\bprod_([A-Za-z0-9]+)/g, "\\prod_{$1}")
    .replace(/\bprod\b/g, "\\prod")
    .replace(/\btheta\b/gi, "\\theta")
    .replace(/\bSigma\b/g, "\\Sigma")
    .replace(/\bmu\b/g, "\\mu")
    .replace(/\blambda\b/g, "\\lambda")
    .replace(/\bphi\b/gi, "\\phi")
    .replace(/\|/g, "\\mid ");

  return latex;
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
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

  // Reject prose-like phrases that happen to include '=' but lack equation structure.
  if (longWordCount >= 6 && symbolCount <= 1 && operatorCount === 1 && !greekOrNamedSignals.test(text)) {
    return false;
  }

  return true;
}

function wrapMathSegments(value) {
  const text = String(value ?? "");
  const candidatePattern = /([^\n<>.]{1,120}(?:<=|>=|!=|=|≤|≥|≠)[^\n<>.]{1,120})/g;

  return text.replace(candidatePattern, (match) => {
    const compact = match.trim().replace(/\s+/g, " ");

    if (!isLikelyMathExpression(compact)) {
      return match;
    }

    // If a sentence contains a colon before the formula, keep only the formula part in math mode.
    const colonIndex = compact.lastIndexOf(":");
    const equationCandidate = colonIndex >= 0 ? compact.slice(colonIndex + 1).trim() : compact;

    if (!isLikelyMathExpression(equationCandidate)) {
      return match;
    }

    const mathWrapped = `\\(${toLatexExpression(equationCandidate)}\\)`;
    if (colonIndex >= 0) {
      return `${compact.slice(0, colonIndex + 1)} ${mathWrapped}`;
    }

    return mathWrapped;
  });
}

function wrapTaggedMathSegments(value) {
  const text = String(value ?? "");
  if (!text.includes(MATH_TAG_START) || !text.includes(MATH_TAG_END)) {
    return text;
  }

  return text.replace(/\[\[MATH\]\]([\s\S]*?)\[\[\/MATH\]\]/g, (_match, expression) => {
    const trimmed = String(expression ?? "").trim();
    if (!trimmed) {
      return "";
    }

    return `\\(${toLatexExpression(trimmed)}\\)`;
  });
}

function formatRichText(value) {
  const normalized = standardizeEquationText(value);
  const withTaggedMath = wrapTaggedMathSegments(normalized);
  const withMath = withTaggedMath.includes("\\(") ? withTaggedMath : wrapMathSegments(withTaggedMath);
  const escaped = escapeHtml(withMath);
  const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/\r?\n/g, "<br>");
}

function typesetMath(root) {
  if (!root || !window.MathJax || typeof window.MathJax.typesetPromise !== "function") {
    return;
  }

  window.MathJax.typesetPromise([root]).catch((error) => {
    console.error("MathJax typeset failed", error);
  });
}

function formatFlashcardBack(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "No answer available";
  }

  const markdownPattern = /^\*\*answer:\*\*\s*([\s\S]*?)\s*\n\s*\n\s*\*\*basic explanation:\*\*\s*([\s\S]*)$/i;
  const plainPattern = /^answer:\s*([\s\S]*?)\s*\n\s*basic explanation:\s*([\s\S]*)$/i;
  const markdownMatch = raw.match(markdownPattern);
  const plainMatch = raw.match(plainPattern);

  if (markdownMatch) {
    return `<strong>answer:</strong> ${formatRichText(markdownMatch[1].trim())}<br><br><strong>basic explanation:</strong> ${formatRichText(markdownMatch[2].trim())}`;
  }

  if (plainMatch) {
    return `<strong>answer:</strong> ${formatRichText(plainMatch[1].trim())}<br><br><strong>basic explanation:</strong> ${formatRichText(plainMatch[2].trim())}`;
  }

  return formatRichText(raw);
}

function splitImageList(value) {
  return String(value ?? "")
    .split(/[;,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildOptionRecords(record) {
  const optionImageFiles = splitImageList(record["Options Image Files"]);
  const letters = ["A", "B", "C", "D", "E", "F"];

  return letters
    .map((letter, index) => ({
      letter,
      text: standardizeEquationText(record[`Option ${letter}`] || ""),
      image: optionImageFiles[index] || "",
    }))
    .filter((option) => option.text || option.image);
}

function mapExamRecordToCard(record, index) {
  const questionNumber = record["Question Number"] || String(index + 1);
  const questionType = record["Question Type"] || "MCQ";
  const questionText = record["Question Text"] || "";
  const questionImageFile = record["Question Image File"] || "";
  const correctAnswer = record["Correct Answer"] || "";

  return {
    id: `mock-${index}`,
    cardType: "mcq",
    Front: standardizeEquationText(questionText),
    Back: standardizeEquationText(correctAnswer),
    Context: MOCK_EXAM_CONTEXT,
    questionNumber,
    questionType,
    questionImageFile,
    options: buildOptionRecords(record),
    correctAnswer,
    explanations: {
      A: standardizeEquationText(record["Explanation A"] || ""),
      B: standardizeEquationText(record["Explanation B"] || ""),
      C: standardizeEquationText(record["Explanation C"] || ""),
      D: standardizeEquationText(record["Explanation D"] || ""),
      E: standardizeEquationText(record["Explanation E"] || ""),
      F: standardizeEquationText(record["Explanation F"] || ""),
    },
  };
}

function mapFlashcardRecordToCard(record, index) {
  return {
    id: `deck-${index}`,
    cardType: "flashcard",
    Front: standardizeEquationText(record.Front || ""),
    Back: standardizeEquationText(record.Back || ""),
    Context: record.Context || "General",
    questionNumber: "",
    questionType: "Flashcard",
    questionImageFile: "",
    options: [],
    correctAnswer: "",
    explanations: {},
  };
}

function isMcqCard(card) {
  return card?.cardType === "mcq";
}

function normalizedCorrectAnswerLetters(card) {
  const answerText = String(card.correctAnswer || "").trim();
  if (!answerText) {
    return [];
  }

  return answerText
    .replace(/and/gi, ",")
    .split(",")
    .map((entry) => entry.trim().match(/[A-F]/i)?.[0]?.toUpperCase())
    .filter(Boolean);
}

function optionExplanation(card, letter) {
  return String(card.explanations?.[letter] || "").trim();
}

function renderMcqExplanations(card) {
  elements.backDetails.innerHTML = "";

  const correctLetters = new Set(normalizedCorrectAnswerLetters(card));
  const explanationTitle = document.createElement("h4");
  explanationTitle.className = "explanation-title";
  explanationTitle.textContent = "Option Explanations";
  elements.backDetails.appendChild(explanationTitle);

  const explanationList = document.createElement("div");
  explanationList.className = "explanation-list";

  card.options.forEach((option) => {
    const block = document.createElement("section");
    block.className = "explanation-item";

    const header = document.createElement("div");
    header.className = "explanation-item-header";

    const label = document.createElement("strong");
    label.textContent = `Option ${option.letter}`;

    header.appendChild(label);

    if (correctLetters.has(option.letter)) {
      const badge = document.createElement("span");
      badge.className = "explanation-badge";
      badge.textContent = "Correct";
      header.appendChild(badge);
    }

    const detail = document.createElement("p");
    detail.className = "explanation-item-text";
    detail.innerHTML = formatRichText(optionExplanation(card, option.letter) || "No explanation provided.");

    block.append(header, detail);
    explanationList.appendChild(block);
  });

  elements.backDetails.appendChild(explanationList);
}

function filteredCards() {
  const search = normalizeText(state.searchQuery);

  return state.cards.filter((card) => {
    const matchesContext = state.currentFilter === "all" || card.Context === state.currentFilter;
    const matchesReviewOnly = !state.showReviewOnly || state.progress.cardState[card.id]?.status === "review";
    const searchableOptions = card.options.map((option) => `${option.letter} ${option.text}`).join(" ");
    const matchesSearch =
      !search ||
      normalizeText(card.Front).includes(search) ||
      normalizeText(card.Back).includes(search) ||
      normalizeText(card.Context).includes(search) ||
      normalizeText(card.questionNumber).includes(search) ||
      normalizeText(card.questionType).includes(search) ||
      normalizeText(searchableOptions).includes(search);

    return matchesContext && matchesReviewOnly && matchesSearch;
  });
}

function currentVisibleCard() {
  const cards = filteredCards();
  if (!cards.length) {
    return null;
  }

  const currentIndex = cards.findIndex((card) => card.id === state.currentCardId);
  if (currentIndex >= 0) {
    return cards[currentIndex];
  }

  return cards[0];
}

function goToCard(card) {
  if (!card) {
    state.currentCardId = null;
    state.isFlipped = false;
    saveProgress();
    render();
    return;
  }

  state.currentCardId = card.id;
  state.isFlipped = false;
  saveProgress();
  render();
}

function goNext() {
  const cards = filteredCards();
  if (!cards.length) {
    return;
  }

  const currentIndex = cards.findIndex((card) => card.id === state.currentCardId);
  if (currentIndex < 0) {
    goToCard(cards[0]);
    return;
  }

  const nextCard = cards[(currentIndex + 1) % cards.length];
  goToCard(nextCard);
}

function goPrevious() {
  const cards = filteredCards();
  if (!cards.length) {
    return;
  }

  const currentIndex = cards.findIndex((card) => card.id === state.currentCardId);
  if (currentIndex < 0) {
    goToCard(cards[0]);
    return;
  }

  const previousIndex = (currentIndex - 1 + cards.length) % cards.length;
  goToCard(cards[previousIndex]);
}

function toggleCard() {
  const card = currentVisibleCard();
  if (!card) {
    return;
  }

  state.isFlipped = !state.isFlipped;
  saveProgress();
  renderCard();
}

function shuffleFiltered() {
  const cards = filteredCards();
  if (!cards.length) {
    return;
  }

  const seed = Date.now();
  const shuffled = cards
    .map((card) => ({ card, random: Math.sin(card.id * seed) }))
    .sort((left, right) => left.random - right.random)
    .map((entry) => entry.card);

  const first = shuffled[0];
  state.currentCardId = first.id;
  state.isFlipped = false;
  state.progress.shuffleSeed = seed;
  saveProgress();
  render();
}

function resetProgress() {
  const confirmed = window.confirm(`Reset progress for ${state.userName}? This only clears data saved on this browser.`);
  if (!confirmed) {
    return;
  }

  state.progress.cardState = {};
  state.progress.currentCardId = null;
  state.currentCardId = state.cards[0]?.id ?? null;
  state.isFlipped = false;
  saveProgress();
  render();
}

function renderContextOptions() {
  const contexts = Array.from(new Set(state.cards.map((card) => card.Context))).sort();
  const currentValue = state.currentFilter;

  elements.contextFilter.innerHTML = '<option value="all">All contexts</option>';

  contexts.forEach((context) => {
    const option = document.createElement("option");
    option.value = context;
    option.textContent = context;
    elements.contextFilter.appendChild(option);
  });

  elements.contextFilter.value = currentValue;
}

function renderStats() {
  const cards = filteredCards();
  const completed = cards.filter((card) => state.progress.cardState[card.id]?.status === "known").length;
  const review = cards.filter((card) => state.progress.cardState[card.id]?.status === "review").length;
  const percent = cards.length ? Math.round((completed / cards.length) * 100) : 0;

  elements.deckSize.textContent = String(cards.length);
  elements.masteredCount.textContent = String(completed);
  elements.reviewCount.textContent = String(review);
  elements.progressText.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
}

function renderQueue() {
  const cards = filteredCards();
  elements.queueList.innerHTML = "";

  cards.slice(0, 8).forEach((card) => {
    const item = document.createElement("li");
    item.className = `queue-item${card.id === state.currentCardId ? " active" : ""}`;

    const left = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = isMcqCard(card) ? `Q ${card.questionNumber}` : card.Front;
    const meta = document.createElement("div");
    meta.className = "queue-item-meta";
    meta.textContent = `${card.Context} • ${(state.progress.cardState[card.id]?.status ?? "new").toUpperCase()}`;

    left.append(title, meta);

    const right = document.createElement("div");
    right.className = "queue-item-meta";
    right.textContent = card.id === state.currentCardId ? "Current" : `#${card.id + 1}`;

    item.append(left, right);
    elements.queueList.appendChild(item);
  });

  if (!cards.length) {
    const empty = document.createElement("li");
    empty.className = "queue-item";
    empty.textContent = "No cards match the current filter.";
    elements.queueList.appendChild(empty);
  }
}

function renderCard() {
  const card = currentVisibleCard();
  const hasCard = Boolean(card);

  elements.flashcardButton.classList.toggle("is-flipped", state.isFlipped);
  elements.previousButton.disabled = !hasCard;
  elements.nextButton.disabled = !hasCard;
  elements.knownButton.disabled = !hasCard;
  elements.reviewButton.disabled = !hasCard;

  if (!card) {
    elements.frontText.textContent = "No matching cards";
    elements.frontContext.textContent = "Adjust the search or context filter to continue.";
    elements.frontMedia.innerHTML = "";
    elements.frontOptions.innerHTML = "";
    elements.backAnswer.textContent = "";
    elements.backDetails.textContent = "";
    elements.cardCounter.textContent = "Card 0 of 0";
    elements.flashcardButton.classList.remove("is-flipped");
    return;
  }

  const visibleCards = filteredCards();
  const index = visibleCards.findIndex((entry) => entry.id === card.id) + 1;

  elements.frontText.innerHTML = formatRichText(card.Front);
  elements.frontContext.textContent = isMcqCard(card)
    ? `${MOCK_EXAM_CONTEXT} • ${card.questionType} ${card.questionNumber}`
    : card.Context;
  elements.frontMedia.innerHTML = "";
  elements.frontOptions.innerHTML = "";
  elements.backAnswer.textContent = "";
  elements.backDetails.innerHTML = "";

  if (isMcqCard(card) && card.questionImageFile) {
    const image = document.createElement("img");
    image.src = `./${card.questionImageFile}`;
    image.alt = `Question ${card.questionNumber} illustration`;
    image.loading = "lazy";
    elements.frontMedia.appendChild(image);
  }

  if (isMcqCard(card) && card.options.length) {
    const optionList = document.createElement("ol");
    optionList.className = "option-list";
    card.options.forEach((option) => {
      const item = document.createElement("li");

      const optionChoice = document.createElement("div");
      optionChoice.className = "option-choice";

      const optionLabel = document.createElement("span");
      optionLabel.className = "option-label";
      optionLabel.textContent = option.letter;

      const optionText = document.createElement("span");
      optionText.className = "option-text";
      optionText.innerHTML = formatRichText(option.text);

      optionChoice.append(optionLabel, optionText);

      if (option.image) {
        const image = document.createElement("img");
        image.src = `./${option.image}`;
        image.alt = `Option ${option.letter} image`;
        image.loading = "lazy";
        optionChoice.appendChild(image);
      }

      item.appendChild(optionChoice);
      optionList.appendChild(item);
    });

    elements.frontOptions.appendChild(optionList);
  }

  if (isMcqCard(card)) {
    elements.frontHint.textContent = "Tap to show answer and structured explanations.";
    elements.backAnswer.innerHTML = card.correctAnswer
      ? `<strong>Correct answer:</strong> ${formatRichText(card.correctAnswer)}`
      : "Correct answer unavailable";
    renderMcqExplanations(card);
  } else {
    elements.frontHint.textContent = "Tap to reveal the answer";
    elements.backAnswer.innerHTML = formatFlashcardBack(card.Back);
    elements.backDetails.innerHTML = "";
  }

  elements.cardCounter.textContent = `Card ${index} of ${visibleCards.length}`;
  typesetMath(elements.flashcardButton);
}

function render() {
  renderStats();
  renderQueue();
  renderCard();
}

function openNameModal() {
  elements.nameModal.classList.add("is-open");
  elements.nameInput.value = "";
  setTimeout(() => elements.nameInput.focus(), 0);
}

function closeNameModal() {
  elements.nameModal.classList.remove("is-open");
}

function setUser(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }

  state.userName = trimmed;
  elements.userLabel.textContent = trimmed;
  state.progress = loadProgress(trimmed);
  state.currentCardId = state.progress.currentCardId ?? state.cards[0]?.id ?? null;
  state.isFlipped = Boolean(state.progress.flipped);
  localStorage.setItem(STORAGE_USER_KEY, trimmed);
  closeNameModal();
  saveProgress();
  render();
}

function bindEvents() {
  elements.flashcardButton.addEventListener("click", toggleCard);
  elements.previousButton.addEventListener("click", goPrevious);
  elements.nextButton.addEventListener("click", goNext);
  elements.knownButton.addEventListener("click", () => {
    const card = currentVisibleCard();
    if (!card) {
      return;
    }

    setCardState(card.id, "known");
    goNext();
  });
  elements.reviewButton.addEventListener("click", () => {
    const card = currentVisibleCard();
    if (!card) {
      return;
    }

    setCardState(card.id, "review");
    goNext();
  });
  elements.shuffleButton.addEventListener("click", shuffleFiltered);
  elements.resetButton.addEventListener("click", resetProgress);
  elements.switchUserButton.addEventListener("click", openNameModal);
  elements.contextFilter.addEventListener("change", (event) => {
    state.currentFilter = event.target.value;
    render();
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    render();
  });
  elements.reviewOnlyToggle.addEventListener("change", (event) => {
    state.showReviewOnly = event.target.checked;
    render();
  });
  elements.nameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setUser(elements.nameInput.value);
  });
}

function parseAndLoadCards(flashcardsText, examText) {
  const flashcards = parseCsv(flashcardsText)
    .map(mapFlashcardRecordToCard)
    .filter((card) => card.Front);

  const examCards = parseCsv(examText)
    .map(mapExamRecordToCard)
    .filter((card) => card.Front);

  return [...flashcards, ...examCards];
}

async function init() {
  bindEvents();

  const [flashcardResponse, examResponse] = await Promise.all([
    fetch(FLASHCARD_CSV_PATH, { cache: "no-store" }),
    fetch(EXAM_CSV_PATH, { cache: "no-store" }),
  ]);

  const [flashcardCsv, examCsv] = await Promise.all([flashcardResponse.text(), examResponse.text()]);
  state.cards = parseAndLoadCards(flashcardCsv, examCsv);

  renderContextOptions();

  const savedUser = localStorage.getItem(STORAGE_USER_KEY);
  if (savedUser) {
    setUser(savedUser);
  } else {
    state.progress = loadProgress("Guest");
    state.currentCardId = state.cards[0]?.id ?? null;
    openNameModal();
    render();
  }

  if (!savedUser) {
    elements.userLabel.textContent = "Guest";
  }
}

init().catch((error) => {
  console.error(error);
  elements.frontText.textContent = "Unable to load the flashcards.";
  elements.backAnswer.textContent = "Check that flashcards.csv and pr_mock2526_solution_questions.csv are available and refresh the page.";
  elements.backDetails.textContent = "";
  elements.frontContext.textContent = "App error";
  elements.cardCounter.textContent = "Card 0 of 0";
});