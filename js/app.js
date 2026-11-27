(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const state = {
    image: null,
    settings: JSON.parse(localStorage.getItem("ss_settings") || "{}"),
    lastResult: null,
    busy: false,
    batchMode: false,
    selection: new Set()
  };

  const ageGate = $("age-gate");
  const appEl = $("app");
  const stepUpload = $("step-upload");
  const stepFilters = $("step-filters");
  const dropzone = $("dropzone");
  const fileInput = $("file-input");
  const grid = $("filter-grid");
  const search = $("filter-search");
  const resultBox = $("result-box");
  const downloadBtn = $("download-btn");
  const historyEl = $("history");
  const toastEl = $("toast");
  const batchToggle = $("batch-toggle");
  const batchBar = $("batch-bar");
  const batchCount = $("batch-count");
  const batchRun = $("batch-run");
  const batchClear = $("batch-clear");

  if (localStorage.getItem("ss_age_ok") === "1") enterApp();

  $("age-yes").addEventListener("click", () => {
    localStorage.setItem("ss_age_ok", "1");
    enterApp();
  });
  $("age-no").addEventListener("click", () => {
    ageGate.querySelector(".overlay-card").innerHTML =
      "<h1>See you later 👋</h1><p>This app is for adults only. Please come back when you're 18 or older.</p>";
  });

  function enterApp() {
    ageGate.classList.add("hidden");
    appEl.classList.remove("hidden");
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", e => { if (e.key === "Enter") fileInput.click(); });
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("drag");
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });
  $("change-photo").addEventListener("click", () => fileInput.click());

  function loadFile(file) {
    if (!file.type.startsWith("image/")) return toast("Please choose an image file", true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.image = img;
      $("source-img").src = url;
      stepUpload.classList.add("hidden");
      stepFilters.classList.remove("hidden");
    };
    img.onerror = () => toast("Could not read that image", true);
    img.src = url;
  }

  search.addEventListener("input", renderGrid);

  function renderGrid() {
    const q = search.value.trim().toLowerCase();
    grid.innerHTML = "";
    const list = FILTER_CATALOG.filter(f =>
      !q || f.name.toLowerCase().includes(q) || f.cat.toLowerCase().includes(q)
    );
    for (const f of list) {
      const btn = document.createElement("button");
      btn.className = "filter-card";
      if (state.selection.has(f.id)) btn.classList.add("selected");
      btn.innerHTML =
        '<div class="emoji">' + f.emoji + '</div>' +
        '<div class="name"></div>' +
        '<div class="cat"></div>' +
        '<div class="tune">⚡ auto-tuned</div>';
      btn.querySelector(".name").textContent = f.name;
      btn.querySelector(".cat").textContent = f.cat;
      btn.addEventListener("click", () => {
        if (state.batchMode) toggleSelect(f, btn);
        else runFilter(f, btn);
      });
      grid.appendChild(btn);
    }
    if (!list.length) grid.innerHTML = '<p class="muted">No filters match your search.</p>';
  }

  function toggleSelect(filter, btn) {
    if (state.selection.has(filter.id)) {
      state.selection.delete(filter.id);
      btn.classList.remove("selected");
    } else {
      state.selection.add(filter.id);
      btn.classList.add("selected");
    }
    updateBatchBar();
  }

  function updateBatchBar() {
    const n = state.selection.size;
    batchCount.textContent = n + " selected";
    batchBar.classList.toggle("hidden", !state.batchMode);
    batchRun.disabled = n === 0 || state.busy;
  }

  batchToggle.addEventListener("click", () => {
    state.batchMode = !state.batchMode;
    batchToggle.classList.toggle("active", state.batchMode);
    batchToggle.textContent = state.batchMode ? "✅ Batch mode on" : "🔀 Batch mode";
    if (!state.batchMode) {
      state.selection.clear();
      document.querySelectorAll(".filter-card.selected").forEach(c => c.classList.remove("selected"));
    }
    updateBatchBar();
  });

  batchClear.addEventListener("click", () => {
    state.selection.clear();
    document.querySelectorAll(".filter-card.selected").forEach(c => c.classList.remove("selected"));
    updateBatchBar();
  });

  batchRun.addEventListener("click", async () => {
    if (state.busy || !state.image || !state.selection.size) return;
    const filters = FILTER_CATALOG.filter(f => state.selection.has(f.id));
    state.busy = true;
    batchRun.disabled = true;
    let done = 0;
    for (const f of filters) {
      toast("Batch: " + f.name + " (" + (done + 1) + "/" + filters.length + ")");
      try {
        const result = await generate(f);
        addHistory(result, f);
      } catch (err) {
        toast(f.name + " failed: " + (err.message || "error"), true);
      }
      done++;
    }
    state.busy = false;
    batchRun.disabled = false;
    state.selection.clear();
    document.querySelectorAll(".filter-card.selected").forEach(c => c.classList.remove("selected"));
    updateBatchBar();
    toast("Batch complete ✨ " + done + " filters run — unlimited, as always");
  });

  async function generate(filter) {
    const provider = PROVIDERS[state.settings.provider || "demo"];
    if (provider.needsImage && !hasKey(provider)) {
      throw new Error("Add your API key in ⚙️ Settings first — or use the free built-in filters");
    }
    return await provider.generate({
      image: state.image,
      filter,
      strength: sliderStrength(filter),
      settings: state.settings
    });
  }

  function sliderStrength(filter) {
    const base = parseFloat($("strength").value);
    if (filter && typeof filter.strength === "number") {
      return ((base - 0.55) + filter.strength).toFixed(2);
    }
    return base;
  }

  async function runFilter(filter, btn) {
    if (state.busy || !state.image) return;
    state.busy = true;
    btn.disabled = true;
    resultBox.innerHTML = '<div class="spinner"></div>';
    downloadBtn.classList.add("hidden");
    try {
      const result = await generate(filter);
      showComparison(result);
      addHistory(result, filter);
      toast("Done ✨ Drag the slider to compare — unlimited, run it again anytime");
    } catch (err) {
      resultBox.innerHTML = '<p class="muted">Pick a filter to see the result here</p>';
      toast(err.message || "Something went wrong", true);
    } finally {
      state.busy = false;
      btn.disabled = false;
    }
  }

  function showComparison(resultImg) {
    state.lastResult = resultImg;
    resultBox.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "compare";
    wrap.style.setProperty("--pos", "50%");

    const after = resultImg.cloneNode();
    after.className = "compare-img";

    const beforeWrap = document.createElement("div");
    beforeWrap.className = "compare-before";
    const before = state.image.cloneNode();
    before.className = "compare-img";
    beforeWrap.appendChild(before);

    const labelAfter = document.createElement("span");
    labelAfter.className = "compare-label compare-label-right";
    labelAfter.textContent = "After";
    const labelBefore = document.createElement("span");
    labelBefore.className = "compare-label";
    labelBefore.textContent = "Before";

    const handle = document.createElement("div");
    handle.className = "compare-handle";

    wrap.appendChild(after);
    wrap.appendChild(beforeWrap);
    wrap.appendChild(labelAfter);
    wrap.appendChild(labelBefore);
    wrap.appendChild(handle);
    resultBox.appendChild(wrap);

    let dragging = false;
    const setPos = clientX => {
      const rect = wrap.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      wrap.style.setProperty("--pos", pct + "%");
    };
    wrap.addEventListener("pointerdown", e => {
      dragging = true;
      wrap.setPointerCapture(e.pointerId);
      setPos(e.clientX);
    });
    wrap.addEventListener("pointermove", e => { if (dragging) setPos(e.clientX); });
    wrap.addEventListener("pointerup", () => { dragging = false; });
    wrap.addEventListener("pointercancel", () => { dragging = false; });

    downloadBtn.classList.remove("hidden");
  }

  function hasKey(provider) {
    return provider.fields.some(f => f.type === "password" && state.settings[f.key]);
  }

  function addHistory(img, filter) {
    const thumb = document.createElement("img");
    thumb.src = img.src;
    thumb.alt = filter.name;
    thumb.title = filter.name;
    thumb.addEventListener("click", () => {
      showComparison(img);
    });
    historyEl.prepend(thumb);
    while (historyEl.children.length > 24) historyEl.lastChild.remove();
  }

  downloadBtn.addEventListener("click", () => {
    if (!state.lastResult) return;
    const a = document.createElement("a");
    a.href = state.lastResult.src;
    a.download = "selfie-studio-result.png";
    a.click();
  });

  const modal = $("settings-modal");
  $("settings-btn").addEventListener("click", openSettings);
  $("settings-cancel").addEventListener("click", () => modal.classList.add("hidden"));
  $("strength").addEventListener("input", e => {
    $("strength-val").textContent = e.target.value;
  });

  function openSettings() {
    $("provider-select").value = state.settings.provider || "demo";
    $("strength").value = state.settings.strength || 0.55;
    $("strength-val").textContent = $("strength").value;
    renderProviderFields();
    modal.classList.remove("hidden");
  }

  $("provider-select").addEventListener("change", renderProviderFields);

  function renderProviderFields() {
    const provider = PROVIDERS[$("provider-select").value];
    const wrap = $("provider-fields");
    wrap.innerHTML = "";
    for (const f of provider.fields) {
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = f.label;
      const input = document.createElement("input");
      input.type = f.type;
      input.placeholder = f.placeholder || "";
      input.value = state.settings[f.key] || "";
      input.dataset.key = f.key;
      label.appendChild(span);
      label.appendChild(input);
      wrap.appendChild(label);
    }
  }

  $("settings-save").addEventListener("click", () => {
    state.settings.provider = $("provider-select").value;
    state.settings.strength = $("strength").value;
    document.querySelectorAll("#provider-fields input").forEach(input => {
      if (input.value) state.settings[input.dataset.key] = input.value;
    });
    localStorage.setItem("ss_settings", JSON.stringify(state.settings));
    modal.classList.add("hidden");
    toast("Settings saved — stored only in this browser");
  });

  let toastTimer;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3500);
  }

  renderGrid();
  updateBatchBar();
})();
