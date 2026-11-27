const PROVIDERS = {
  demo: {
    label: "Built-in filters (offline, free)",
    fields: [],
    needsImage: false,
    async generate({ image, filter }) {
      const preset = DEMO_PRESETS[filter.id] || DEMO_PRESETS._default;
      return applyCanvasFilters(image, preset);
    }
  },

  replicate: {
    label: "Replicate",
    fields: [
      { key: "replicateKey", label: "Replicate API token", type: "password", placeholder: "r8_..." },
      { key: "replicateModel", label: "Model version or owner/name", type: "text", placeholder: "black-forest-labs/flux-kontext-pro" }
    ],
    needsImage: true,
    async generate({ image, filter, strength, settings }) {
      const dataUrl = await toDataUrl(image, 1024);
      const body = {
        input: {
          prompt: filter.prompt,
          image: dataUrl,
          strength: Number(strength)
        }
      };
      const model = settings.replicateModel || "black-forest-labs/flux-kontext-pro";
      const create = await fetch("https://api.replicate.com/v1/models/" + model + "/predictions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + settings.replicateKey,
          "Content-Type": "application/json",
          "Prefer": "wait"
        },
        body: JSON.stringify(body)
      });
      if (!create.ok) throw new Error("Replicate error " + create.status + ": " + (await create.text()).slice(0, 300));
      let prediction = await create.json();
      while (["starting", "processing"].includes(prediction.status)) {
        await sleep(1500);
        const poll = await fetch(prediction.urls.get, { headers: { "Authorization": "Bearer " + settings.replicateKey } });
        prediction = await poll.json();
      }
      if (prediction.status !== "succeeded") throw new Error("Generation failed: " + prediction.status);
      return await urlToImage(prediction.output);
    }
  },

  fal: {
    label: "fal.ai",
    fields: [
      { key: "falKey", label: "fal.ai API key", type: "password", placeholder: "key_id:key_secret" },
      { key: "falModel", label: "Model id", type: "text", placeholder: "fal-ai/flux-pro/kontext" }
    ],
    needsImage: true,
    async generate({ image, filter, strength, settings }) {
      const dataUrl = await toDataUrl(image, 1024);
      const model = settings.falModel || "fal-ai/flux-pro/kontext";
      const submit = await fetch("https://queue.fal.run/" + model, {
        method: "POST",
        headers: {
          "Authorization": "Key " + settings.falKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: filter.prompt,
          image_url: dataUrl,
          strength: Number(strength)
        })
      });
      if (!submit.ok) throw new Error("fal.ai error " + submit.status + ": " + (await submit.text()).slice(0, 300));
      let job = await submit.json();
      while (job.status && job.status !== "COMPLETED") {
        await sleep(1500);
        const poll = await fetch(job.status_url, { headers: { "Authorization": "Key " + settings.falKey } });
        job = await poll.json();
      }
      const resultUrl = job.response_url || job.result_url;
      if (resultUrl) {
        const res = await fetch(resultUrl, { headers: { "Authorization": "Key " + settings.falKey } });
        job = await res.json();
      }
      const out = (job.images && job.images[0] && job.images[0].url) || (job.image && job.image.url) || job.output;
      if (!out) throw new Error("No image in fal.ai response");
      return await urlToImage(out);
    }
  },

  openai: {
    label: "OpenAI-compatible",
    fields: [
      { key: "openaiKey", label: "API key", type: "password", placeholder: "sk-..." },
      { key: "openaiBase", label: "Base URL", type: "url", placeholder: "https://api.openai.com/v1" },
      { key: "openaiModel", label: "Image model", type: "text", placeholder: "gpt-image-1" }
    ],
    needsImage: true,
    async generate({ image, filter, settings }) {
      const base = (settings.openaiBase || "https://api.openai.com/v1").replace(/\/$/, "");
      const model = settings.openaiModel || "gpt-image-1";
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", filter.prompt);
      form.append("image", blob, "input.png");
      const res = await fetch(base + "/images/edits", {
        method: "POST",
        headers: { "Authorization": "Bearer " + settings.openaiKey },
        body: form
      });
      if (!res.ok) throw new Error("API error " + res.status + ": " + (await res.text()).slice(0, 300));
      const data = await res.json();
      const b64 = data.data && data.data[0] && (data.data[0].b64_json || data.data[0].url);
      if (!b64) throw new Error("No image in response");
      if (b64.startsWith("http")) return await urlToImage(b64);
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      return img;
    }
  }
};

const DEMO_PRESETS = {
  _default: { saturate: 1.1, contrast: 1.05 },
  anime: { saturate: 1.4, contrast: 1.25, hueRotate: -12 },
  vintage: { sepia: 0.45, contrast: 0.92, brightness: 1.05 },
  noir: { grayscale: 1, contrast: 1.35 },
  platinum: { brightness: 1.08, saturate: 0.85 },
  pastel: { hueRotate: 300, saturate: 1.3 },
  blue: { hueRotate: 200, saturate: 1.2 },
  cyberpunk: { hueRotate: 260, saturate: 1.5, contrast: 1.2 },
  watercolor: { saturate: 0.8, brightness: 1.1, blur: 0.4 },
  pixel: { pixelate: 12 },
  old: { sepia: 0.3, contrast: 1.1 },
  young: { brightness: 1.06, saturate: 1.1 },
  claymation: { saturate: 1.2, contrast: 1.1 },
  superhero: { saturate: 1.4, contrast: 1.2 },
  vampire: { brightness: 0.92, saturate: 0.7, contrast: 1.25 }
};

async function applyCanvasFilters(image, preset) {
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.round(image.naturalWidth * scale);
  const h = Math.round(image.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (preset.pixelate) {
    const tiny = document.createElement("canvas");
    const t = Math.max(1, Math.round(Math.min(w, h) / preset.pixelate));
    tiny.width = t;
    tiny.height = t;
    tiny.getContext("2d").drawImage(image, 0, 0, t, t);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, w, h);
  } else {
    const parts = [];
    if (preset.brightness) parts.push("brightness(" + preset.brightness + ")");
    if (preset.contrast) parts.push("contrast(" + preset.contrast + ")");
    if (preset.saturate) parts.push("saturate(" + preset.saturate + ")");
    if (preset.sepia) parts.push("sepia(" + preset.sepia + ")");
    if (preset.grayscale) parts.push("grayscale(" + preset.grayscale + ")");
    if (preset.hueRotate) parts.push("hue-rotate(" + preset.hueRotate + "deg)");
    if (preset.blur) parts.push("blur(" + preset.blur + "px)");
    ctx.filter = parts.join(" ") || "none";
    ctx.drawImage(image, 0, 0, w, h);
  }
  const img = new Image();
  img.src = canvas.toDataURL("image/png");
  await img.decode();
  return img;
}

function toDataUrl(image, maxSize) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function urlToImage(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
