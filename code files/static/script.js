const el = (id) => document.getElementById(id);
let lastPrediction = "";

// Log slider mapping helpers (slider: 0..100 -> value: [min..max] log-scale)
function logMap(sliderValue, min, max) {
  const t = Math.min(100, Math.max(0, Number(sliderValue))) / 100;
  const lo = Math.log(min);
  const hi = Math.log(max);
  return Math.exp(lo + (hi - lo) * t);
}

function invLogMap(value, min, max) {
  const v = Math.min(max, Math.max(min, Number(value)));
  const lo = Math.log(min);
  const hi = Math.log(max);
  const t = (Math.log(v) - lo) / (hi - lo);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

function fmtConfidence(c) {
  if (c === null || c === undefined || Number.isNaN(Number(c))) return "—";
  return `${Math.round(Number(c) * 100)}%`;
}

function setApiStatus(text, kind = "idle") {
  void text;
  void kind;
}

function setPrediction(text) {
  const predictionEl = el("predictionText");
  lastPrediction = String(text || "");
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("unknown planet") || normalized.includes("new planet")) {
    predictionEl.textContent = "NEW PLANET SPOTTED";
    return;
  }
  predictionEl.textContent = text || "—";
}

function setConfidence(c) {
  el("confidenceText").textContent = fmtConfidence(c);
}

function renderProbabilities(probabilities) {
  const container = el("probList");
  if (!container) return;
  container.innerHTML = "";

  const entries = probabilities ? Object.entries(probabilities) : [];
  if (!entries.length) {
    const div = document.createElement("div");
    div.className = "probItem probItem--empty";
    div.textContent = "No probability telemetry returned.";
    container.appendChild(div);
    return;
  }

  for (const [name, p] of entries) {
    const item = document.createElement("div");
    item.className = "probItem";

    const n = document.createElement("div");
    n.className = "probName";
    n.textContent = name;

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(0, Math.min(100, Number(p) * 100))}%`;
    bar.appendChild(fill);

    const v = document.createElement("div");
    v.className = "probVal";
    v.textContent = `${Math.round(Number(p) * 1000) / 10}%`;

    item.appendChild(n);
    item.appendChild(bar);
    item.appendChild(v);
    container.appendChild(item);
  }
}

function getPayload() {
  // IMPORTANT: luminosity/radius sliders are log-mapped (0..100).
  // Always compute the true physical values from the slider position
  // so we never accidentally send the (rounded) display number.
  const temperature = Number(el("temperature").value);
  const luminosity = logMap(el("luminosity").value, 0.000001, 200000);
  const radius = logMap(el("radius").value, 0.0001, 200);
  // Absolute magnitude already follows the scientific convention:
  // lower Mv => brighter. Our slider is [-12..20] with "Brighter" on the left,
  // so we should NOT invert it here.
  const abs_magnitude = Number(el("abs_magnitude").value);
  return { temperature, luminosity, radius, abs_magnitude };
}

function setStarId() {
  const { temperature, luminosity, radius, abs_magnitude } = getPayload();
  const seed =
    Math.round(temperature) * 3 +
    Math.round(luminosity * 100) * 5 +
    Math.round(radius * 1000) * 7 +
    Math.round(abs_magnitude * 10) * 11;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = letters[Math.abs(seed) % letters.length];
  const b = letters[Math.abs(seed * 13) % letters.length];
  const n = String((Math.abs(seed) % 900) + 100);
  const id = `NX-${a}${b}-${n}`;
  const node = el("starId");
  if (node) node.textContent = id;
}

function setStarVisual() {
  const frames = document.querySelectorAll(".rocky-frame");
  for (const frame of frames) {
    frame.classList.remove("is-glow");
    void frame.offsetWidth;
    frame.classList.add("is-glow");
    window.setTimeout(() => frame.classList.remove("is-glow"), 800);
  }
}

function setStarSphereColorByPrediction(prediction) {
  const root = document.documentElement;
  const p = String(prediction || "").toLowerCase();
  let ambient = "255, 90, 210";   // default pink theme
  let globe = "255, 150, 220";

  if (p === "sun-like") {
    ambient = "255, 214, 102";    // yellow theme
    globe = "255, 214, 102";
  } else if (p.includes("unknown planet") || p.includes("new planet")) {
    ambient = "8, 8, 10";         // black theme
    globe = "5, 5, 7";
  } else if (p.includes("white dwarf")) {
    ambient = "238, 244, 255";    // white theme
    globe = "238, 244, 255";
  } else if (p.includes("blue")) {
    ambient = "102, 170, 255";    // blue theme
    globe = "102, 170, 255";
  } else if (p.includes("red giant") || p.includes("dwarf")) {
    ambient = "255, 92, 92";      // red theme
    globe = "255, 92, 92";
  }

  root.style.setProperty("--theme-rgb", "255, 90, 210");
  root.style.setProperty("--ambient-rgb", ambient);
  root.style.setProperty("--result-rgb", globe);
}

function setPlanetSectionVisible(prediction) {
  const section = el("habitableSection") || el("planetProfile");
  const img = el("planetImg");
  const headline = el("hzHeadline");
  const sub = el("hzSub");
  if (!section || !img) return;

  const assetByType = {
    "Red Dwarf": "static/img/star_red_dwarf.svg",
    "Sun-like": "static/img/star_sun_like.svg",
    "Red Giant": "static/img/star_red_giant.svg",
    "White Dwarf": "static/img/star_white_dwarf.svg",
    "Blue Giant": "static/img/star_blue_giant.svg",
  };

  img.src = assetByType[prediction] || assetByType["Sun-like"];

  if (prediction === "Sun-like") {
    headline.textContent = "Within habitable range";
    sub.textContent = "Safe star signature detected.";
  } else {
    headline.textContent = "Outside habitable range";
    sub.textContent = "Caution: not suitable for habitation.";
  }
  section.hidden = false;
}

function updateEnergyBars() {
  const inputs = document.querySelectorAll("input[data-energy]");
  for (const input of inputs) {
    const wrap = input.closest(".energy");
    if (!wrap) continue;
    const bar = wrap.querySelector(".energy__bar > span");
    if (!bar) continue;
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Number(input.value);
    const pct = ((val - min) / (max - min)) * 100;
    bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number(n)));
}

function updateHrDot() {
  return;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isSafeStar(prediction) {
  return prediction === "Sun-like";
}

function getDangerLevel(prediction) {
  const p = String(prediction || "").toLowerCase();
  if (p.includes("unknown planet") || p.includes("new planet")) return "unknown";
  if (p.includes("blue giant")) return "extreme";
  if (p.includes("red dwarf") || p.includes("red giant")) return "high";
  if (p.includes("white dwarf")) return "moderate";
  if (p.includes("sun-like")) return "safe";
  return "moderate";
}

function setRockyReaction(prediction) {
  const rockyEmotion = el("rockyEmotion");
  const rockyMessage = el("rockyMessage");
  if (!rockyEmotion || !rockyMessage) return;

  const level = getDangerLevel(prediction);

  if (level === "safe") {
    rockyEmotion.textContent = "😄🪨";
    rockyMessage.textContent = "All clear, Commander! This star looks safe and friendly.";
  } else if (level === "unknown") {
    rockyEmotion.textContent = "🤩🪨";
    rockyMessage.textContent = "Wow! New planet spotted! This is a legendary discovery!";
  } else if (level === "moderate") {
    rockyEmotion.textContent = "😟🪨";
    rockyMessage.textContent = "This zone feels unstable. We should stay alert.";
  } else if (level === "high") {
    rockyEmotion.textContent = "😨🪨";
    rockyMessage.textContent = "Danger is high here! I do not like this star system.";
  } else {
    // Extreme danger: strongest fear reaction.
    rockyEmotion.textContent = "😱🪨";
    rockyMessage.textContent = "Extreme danger detected! We need to retreat now!";
  }
}

function clearDangerEffects(command) {
  if (!command) return;
  command.classList.remove(
    "danger-effect-moderate",
    "danger-effect-high",
    "danger-effect-extreme",
  );
}

function triggerDangerEffects(prediction) {
  const command = el("screenCommand");
  if (!command) return;

  clearDangerEffects(command);
  const level = getDangerLevel(prediction);
  if (level === "safe" || level === "unknown") return;

  if (level === "moderate") {
    command.classList.add("danger-effect-moderate");
  } else if (level === "high") {
    command.classList.add("danger-effect-high");
  } else if (level === "extreme") {
    command.classList.add("danger-effect-extreme");
  }

  const durationByLevel = {
    moderate: 1700,
    high: 2400,
    extreme: 3200,
  };
  const duration = durationByLevel[level] || 1700;
  window.setTimeout(() => {
    clearDangerEffects(command);
  }, duration);
}

function setClassificationGlow(prediction) {
  const box = el("classificationBox");
  if (!box) return;
  box.classList.remove("classification-glow-safe", "classification-glow-danger");
  if (!prediction || prediction === "—") return;
  if (isSafeStar(prediction)) box.classList.add("classification-glow-safe");
  else box.classList.add("classification-glow-danger");
}

function showScanMessage() {
  const box = el("scanMessage");
  const classification = el("classificationBox");
  const habitable = el("habitableSection");
  const telemetry = el("telemetrySection");
  if (!box) return;
  box.style.display = "block";
  if (classification) classification.classList.add("is-hidden");
  if (habitable) habitable.classList.add("is-hidden");
  if (telemetry) telemetry.classList.add("is-hidden");
}

function hideScanMessage() {
  const box = el("scanMessage");
  const classification = el("classificationBox");
  const habitable = el("habitableSection");
  const telemetry = el("telemetrySection");
  if (!box) return;
  box.style.display = "none";
  if (classification) classification.classList.remove("is-hidden");
  if (habitable) habitable.classList.remove("is-hidden");
  if (telemetry) telemetry.classList.remove("is-hidden");
}

async function runPrediction() {
  const payload = getPayload();
  setApiStatus("RUNNING");
  showScanMessage();
  await sleep(1500);
  hideScanMessage();

  try {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) {
      const msg = (data && data.error) || `Request failed (${res.status}).`;
      setApiStatus("ERROR", "err");
      setPrediction("—");
      setConfidence(null);
      renderProbabilities(null);
      throw new Error(msg);
    }

    setApiStatus("OK", "ok");
    setPrediction(data.prediction);
    setConfidence(data.confidence);
    renderProbabilities(data.probabilities);
    setStarSphereColorByPrediction(data.prediction);
    setStarVisual(data.prediction);
    setRockyReaction(data.prediction);
    setClassificationGlow(data.prediction);
    triggerDangerEffects(data.prediction);
    setPlanetSectionVisible(data.prediction);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setApiStatus("ERROR", "err");
    setPrediction("—");
    setConfidence(null);
    renderProbabilities(null);
    setClassificationGlow(null);
    console.error("Prediction error:", msg);
  }
}


function wirePairedInputs({ sliderId, numberId, min, max, mapMode }) {
  const slider = el(sliderId);
  const number = el(numberId);
  const notify = () => {
    updateHrDot();
    updateEnergyBars();
    setStarId();
  };

  const setNumberFromSlider = () => {
    if (mapMode === "log") {
      const v = logMap(slider.value, min, max);
      number.value =
        v < 0.01 ? v.toPrecision(3) : String(Math.round(v * 1000) / 1000);
    } else {
      number.value = slider.value;
    }
  };

  const setSliderFromNumber = () => {
    if (mapMode === "log") {
      slider.value = String(invLogMap(number.value, min, max));
    } else {
      slider.value = String(number.value);
    }
  };

  slider.addEventListener("input", () => {
    setNumberFromSlider();
    notify();
  });
  number.addEventListener("input", () => {
    setSliderFromNumber();
    notify();
  });

  // Initialize: ensure they are consistent with number's default.
  setSliderFromNumber();
  setNumberFromSlider();
  notify();
}

function resetDefaults() {
  el("temperatureNum").value = "5800";
  el("luminosityNum").value = "1";
  el("radiusNum").value = "1";
  el("abs_magnitude").value = "4.8";

  // Re-sync sliders
  el("temperature").value = el("temperatureNum").value;
  el("luminosity").value = String(
    invLogMap(el("luminosityNum").value, 0.000001, 200000),
  );
  el("radius").value = String(invLogMap(el("radiusNum").value, 0.0001, 200));

  setApiStatus("IDLE", "idle");
  setPrediction("—");
  setConfidence(null);
  renderProbabilities(null);
  updateHrDot();
  updateEnergyBars();
  setStarId();
  setStarSphereColorByPrediction("Unknown");
  setPlanetSectionVisible("Unknown");
  setStarVisual("Unknown");
  setClassificationGlow(null);
  const rockyEmotion = el("rockyEmotion");
  const rockyMessage = el("rockyMessage");
  if (rockyEmotion) rockyEmotion.textContent = "🙂🪨";
  if (rockyMessage) rockyMessage.textContent = "Rocky is standing by for your scan.";
  hideScanMessage();
  lastPrediction = "";
}

window.addEventListener("DOMContentLoaded", () => {
  updateEnergyBars();
  setStarId();
  setStarSphereColorByPrediction("Unknown");
  setPlanetSectionVisible("Unknown");
  setStarVisual("Unknown");
  setClassificationGlow(null);

  wirePairedInputs({
    sliderId: "temperature",
    numberId: "temperatureNum",
    min: 1500,
    max: 60000,
    mapMode: "linear",
  });

  wirePairedInputs({
    sliderId: "luminosity",
    numberId: "luminosityNum",
    min: 0.000001,
    max: 200000,
    mapMode: "log",
  });

  wirePairedInputs({
    sliderId: "radius",
    numberId: "radiusNum",
    min: 0.0001,
    max: 200,
    mapMode: "log",
  });
  wirePairedInputs({
    sliderId: "abs_magnitude",
    numberId: "absMagNum",
    min: -12,
    max: 20,
    mapMode: "linear",
  });
  el("starForm").addEventListener("submit", (e) => {
    e.preventDefault();
    runPrediction();
  });

  el("abortInputBtn").addEventListener("click", () => {
    const p = String(lastPrediction || "").toLowerCase();
    const shouldWarn =
      p.includes("red giant") ||
      p.includes("blue giant") ||
      p.includes("red dwarf") ||
      p.includes("white dwarf");
    if (shouldWarn) {
      showScreen("screenWarning");
      return;
    }
    if (p.includes("sun-like")) {
      showScreen("screenEnding");
      return;
    }
  });
  el("warningAbortBtn").addEventListener("click", () => showScreen("screenCommand"));
  el("restartBtn").addEventListener("click", () => window.location.reload());

  const screenIds = ["screenSplash", "screenRocky", "screenMarry", "screenCommand", "screenWarning", "screenEnding"];
  const showScreen = (id) => {
    for (const screenId of screenIds) {
      const screen = el(screenId);
      if (!screen) continue;
      screen.style.display = screenId === id ? "block" : "none";
      if (screenId === id) screen.classList.add("screen--active");
      else screen.classList.remove("screen--active");
    }
    window.scrollTo(0, 0);
  };

  el("startExploringBtn").addEventListener("click", () => showScreen("screenRocky"));
  el("goRockyBtn").addEventListener("click", () => showScreen("screenMarry"));
  el("goMarryBtn").addEventListener("click", () => showScreen("screenCommand"));
  showScreen("screenSplash");

  fetch("/health")
    .then((r) => r.json())
    .then(() => setApiStatus("IDLE", "ok"))
    .catch(() => setApiStatus("OFFLINE", "err"));
});
