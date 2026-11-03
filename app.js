import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import mqtt from "mqtt";

const CATALOG = [
  { id: "sofa120", name: "ソファベッド120", w: 120, d: 78, h: 75, color: "#7d8f72", note: "脚付き・2人同居向き" },
  { id: "sofa130", name: "ソファベッド130", w: 130, d: 80, h: 75, color: "#6f8570", note: "上限目安" },
  { id: "sofa2p", name: "2人掛けソファ", w: 150, d: 85, h: 80, color: "#8a9a7a", note: "ベッドなし" },
  { id: "bedd", name: "ダブルベッド", w: 140, d: 200, h: 45, color: "#7c9cbf", note: "洋室想定" },
  { id: "beds", name: "シングルベッド", w: 100, d: 200, h: 45, color: "#8aabcb", note: "" },
  { id: "bedsl", name: "サイドリフトベッド", w: 100, d: 210, h: 85, color: "#6f92b5", note: "収納付き" },
  { id: "desk150", name: "デスク150×60", w: 150, d: 60, h: 72, color: "#c4a574", note: "LDK側推奨" },
  { id: "desk120", name: "デスク120×60", w: 120, d: 60, h: 72, color: "#c9ad82", note: "" },
  { id: "desk100", name: "デスク100×50", w: 100, d: 50, h: 72, color: "#d0b58c", note: "狭所向け" },
  { id: "dining75", name: "ダイニング75角", w: 75, d: 75, h: 72, color: "#e0c39a", note: "2人向け" },
  { id: "gateleg", name: "蝶番テーブル(閉)", w: 30, d: 75, h: 72, color: "#c89b63", note: "ゲーテ系・閉じ時" },
  { id: "gateleg_o", name: "蝶番テーブル(半開)", w: 75, d: 75, h: 72, color: "#d2a86f", note: "片翼のみ" },
  { id: "gateleg_f", name: "蝶番テーブル(全開)", w: 120, d: 75, h: 72, color: "#b8894f", note: "30+45+45" },
  { id: "chair", name: "ダイニングチェア", w: 45, d: 50, h: 85, color: "#d6b48c", note: "" },
  { id: "office", name: "オフィスチェア", w: 60, d: 60, h: 110, color: "#8b9098", note: "" },
  { id: "tvboard", name: "テレビボード120", w: 120, d: 40, h: 40, color: "#6b7280", note: "" },
  { id: "tv", name: "TV 55インチ", w: 123, d: 8, h: 72, color: "#2c3138", note: "スタンド別" },
  { id: "fridge", name: "冷蔵庫", w: 60, d: 65, h: 180, color: "#9aa3ad", note: "" },
  { id: "washer", name: "洗濯機", w: 60, d: 60, h: 100, color: "#aeb6bf", note: "" },
  { id: "mw", name: "電子レンジ台", w: 50, d: 40, h: 80, color: "#b7a48a", note: "" },
  { id: "rack", name: "シェルフ90", w: 90, d: 35, h: 120, color: "#b08968", note: "" },
  { id: "chest", name: "チェスト80", w: 80, d: 40, h: 90, color: "#a67c52", note: "" },
  { id: "closet", name: "ハンガーラック", w: 90, d: 45, h: 160, color: "#8d7b6a", note: "" },
  { id: "plant", name: "観葉植物", w: 40, d: 40, h: 100, color: "#5f8f5a", note: "" },
  { id: "rug", name: "ラグ140×200", w: 140, d: 200, h: 2, color: "#c9b8a0", note: "床置き" },
  { id: "lowtable", name: "ローテーブル", w: 90, d: 50, h: 35, color: "#c2a079", note: "" },
  { id: "side", name: "サイドテーブル", w: 40, d: 40, h: 50, color: "#cbb18a", note: "" },
  { id: "kotatsu", name: "こたつ105", w: 105, d: 75, h: 40, color: "#b8946a", note: "" },
];

const LS_KEY = "maison-ks-kamihira-v1";
const DEFAULT_ROOM = "shared";
const DEFAULT_CATALOG = CATALOG.map((c) => ({ ...c }));

const state = {
  catalog: DEFAULT_CATALOG.map((c) => ({ ...c })),
  items: [],
  shop: [],
  todos: [],
  notes: "",
  selectedId: null,
  scaleX: 1.456,
  scaleY: 1.362,
  cam: { x: 0, y: 0, zoom: 1 },
  img: null,
  drag: null,
  pan: null,
  suppressSync: false,
};

const els = {
  palette: document.getElementById("palette"),
  selection: document.getElementById("selection"),
  selActions: document.getElementById("selActions"),
  canvas: document.getElementById("c2d"),
  c3d: document.getElementById("c3d"),
  scaleX: document.getElementById("scaleX"),
  scaleY: document.getElementById("scaleY"),
  saveMsg: document.getElementById("saveMsg"),
  syncStatus: document.getElementById("syncStatus"),
  shopList: document.getElementById("shopList"),
  todoList: document.getElementById("todoList"),
  shopSum: document.getElementById("shopSum"),
  sharedNotes: document.getElementById("sharedNotes"),
};

const ctx = els.canvas.getContext("2d");
let three = null;
let mqttClient = null;
let saveTimer = null;
const CLIENT_ID = "c-" + Math.random().toString(36).slice(2, 10);
const SYNC_TOPIC = "furniture-planner/00451590/maison-ks-kamihira/v1";
let lastRemoteTs = 0;
let peerSeenAt = 0;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function findCatalog(id) {
  return state.catalog.find((c) => c.id === id) || null;
}

function catalogOf(item) {
  const base = item.custom || findCatalog(item.type);
  if (!base) return null;
  return {
    ...base,
    w: item.w ?? base.w,
    d: item.d ?? base.d,
    h: item.h ?? base.h,
    name: item.name || base.name,
  };
}

function selected() {
  return state.items.find((i) => i.id === state.selectedId) || null;
}

function snapshot() {
  return {
    catalog: state.catalog,
    items: state.items,
    shop: state.shop,
    todos: state.todos,
    notes: state.notes,
    scaleX: state.scaleX,
    scaleY: state.scaleY,
  };
}

function applySnapshot(data, { fromRemote = false } = {}) {
  if (!data) return;
  state.suppressSync = true;
  if (Array.isArray(data.catalog) && data.catalog.length) {
    state.catalog = data.catalog.map((c) => ({ ...c }));
  }
  state.items = Array.isArray(data.items) ? data.items : [];
  state.shop = Array.isArray(data.shop) ? data.shop : [];
  state.todos = Array.isArray(data.todos) ? data.todos : [];
  state.notes = typeof data.notes === "string" ? data.notes : "";
  if (typeof data.scaleX === "number") {
    state.scaleX = data.scaleX;
    els.scaleX.value = data.scaleX;
  }
  if (typeof data.scaleY === "number") {
    state.scaleY = data.scaleY;
    els.scaleY.value = data.scaleY;
  }
  if (state.selectedId && !state.items.some((i) => i.id === state.selectedId)) {
    state.selectedId = null;
  }
  renderPalette();
  renderLists();
  updateSelectionUI();
  draw2d();
  rebuild3d();
  if (!fromRemote) persistLocal();
  state.suppressSync = false;
}

function persistLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot()));
    els.saveMsg.textContent = `保存済 ${new Date().toLocaleTimeString("ja-JP")}`;
  } catch (_) {
    els.saveMsg.textContent = "保存失敗（容量など）";
  }
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistLocal();
    pushRemote();
  }, 250);
}

function pushRemote() {
  if (state.suppressSync || !mqttClient || !mqttClient.connected) return;
  const payload = JSON.stringify({
    clientId: CLIENT_ID,
    ts: Date.now(),
    state: snapshot(),
  });
  mqttClient.publish(SYNC_TOPIC, payload, { qos: 0, retain: true });
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) applySnapshot(JSON.parse(raw));
  } catch (_) {}
}

function worldSize() {
  if (!state.img) return { w: 800, h: 800 };
  return {
    w: state.img.width * state.scaleX,
    h: state.img.height * state.scaleY,
  };
}

function stageSize(el) {
  const r = el.getBoundingClientRect();
  return {
    w: Math.max(1, Math.floor(r.width)),
    h: Math.max(1, Math.floor(r.height)),
  };
}

function resizeCanvas({ fit = false } = {}) {
  const wrap = els.canvas.parentElement;
  const { w, h } = stageSize(wrap);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  els.canvas.width = Math.floor(w * dpr);
  els.canvas.height = Math.floor(h * dpr);
  // Keep CSS size at 100% of parent — never set px width (avoids grid blowout)
  els.canvas.style.width = "100%";
  els.canvas.style.height = "100%";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (fit || !state.cam.zoom) fitView();
  else draw2d();
}

function fitView() {
  if (!state.img) {
    draw2d();
    return;
  }
  const { w, h } = stageSize(els.canvas.parentElement);
  const ws = worldSize();
  const pad = 36;
  const zoom = Math.min((w - pad) / ws.w, (h - pad) / ws.h);
  state.cam.zoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  state.cam.x = (w - ws.w * state.cam.zoom) / 2;
  state.cam.y = (h - ws.h * state.cam.zoom) / 2;
  draw2d();
}

function resize3d() {
  if (!three) return;
  const host = els.c3d;
  const { w, h } = stageSize(host);
  three.camera.aspect = w / Math.max(h, 1);
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(w, h, false);
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - state.cam.x) / state.cam.zoom,
    y: (sy - state.cam.y) / state.cam.zoom,
  };
}

function hitTest(wx, wy) {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    const cat = catalogOf(item);
    if (!cat) continue;
    const rad = (-item.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = wx - item.x;
    const dy = wy - item.y;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    if (Math.abs(lx) <= cat.w / 2 && Math.abs(ly) <= cat.d / 2) return item;
  }
  return null;
}

function draw2d() {
  const { w, h } = stageSize(els.canvas.parentElement);
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ddd7ce";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(state.cam.x, state.cam.y);
  ctx.scale(state.cam.zoom, state.cam.zoom);

  const ws = worldSize();
  if (state.img) {
    ctx.drawImage(state.img, 0, 0, ws.w, ws.h);
  } else {
    ctx.fillStyle = "#f4efe6";
    ctx.fillRect(0, 0, ws.w, ws.h);
  }

  // scale bar 100cm
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(12, ws.h - 28, 100, 4);
  ctx.font = "11px sans-serif";
  ctx.fillText("100cm", 12, ws.h - 32);

  for (const item of state.items) {
    const cat = catalogOf(item);
    if (!cat) continue;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate((item.rot * Math.PI) / 180);
    ctx.fillStyle = cat.color || "#888";
    ctx.globalAlpha = 0.82;
    ctx.fillRect(-cat.w / 2, -cat.d / 2, cat.w, cat.d);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = item.id === state.selectedId ? "#1f4d38" : "rgba(0,0,0,0.35)";
    ctx.lineWidth = item.id === state.selectedId ? 3 / state.cam.zoom : 1 / state.cam.zoom;
    ctx.strokeRect(-cat.w / 2, -cat.d / 2, cat.w, cat.d);
    // front mark
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-8, cat.d / 2 - 6, 16, 4);
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(10, 12 / state.cam.zoom)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = (cat.name || "").slice(0, 8);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function addFromCatalog(cat, at) {
  const ws = worldSize();
  const item = {
    id: uid(),
    type: cat.id,
    x: at?.x ?? ws.w * 0.45,
    y: at?.y ?? ws.h * 0.45,
    rot: 0,
  };
  state.items.push(item);
  state.selectedId = item.id;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
}

function updateCatalogSize(id, patch) {
  const cat = findCatalog(id);
  if (!cat) return;
  if (patch.w != null) cat.w = Math.max(1, Number(patch.w) || cat.w);
  if (patch.d != null) cat.d = Math.max(1, Number(patch.d) || cat.d);
  if (patch.h != null) cat.h = Math.max(1, Number(patch.h) || cat.h);
  if (patch.name != null) cat.name = String(patch.name).trim() || cat.name;
  schedulePersist();
  renderPalette();
  updateSelectionUI();
  draw2d();
  rebuild3d();
}

function removeCatalog(id) {
  state.catalog = state.catalog.filter((c) => c.id !== id);
  schedulePersist();
  renderPalette();
}

function renderPalette() {
  els.palette.innerHTML = "";
  for (const cat of state.catalog) {
    const row = document.createElement("div");
    row.className = "pal-item";
    row.innerHTML = `
      <div class="pal-top">
        <button type="button" class="pal-add" data-add="${cat.id}">
          <strong>${escapeHtml(cat.name)}</strong>
          <span>${cat.note ? escapeHtml(cat.note) : "クリックで配置"}</span>
        </button>
        <button type="button" class="pal-del" data-del-cat="${cat.id}" title="選択肢から削除">✕</button>
      </div>
      <div class="pal-size">
        <label>幅<input type="number" min="1" step="1" value="${cat.w}" data-cat="${cat.id}" data-dim="w" /></label>
        <label>奥<input type="number" min="1" step="1" value="${cat.d}" data-cat="${cat.id}" data-dim="d" /></label>
        <label>高<input type="number" min="1" step="1" value="${cat.h}" data-cat="${cat.id}" data-dim="h" /></label>
      </div>`;
    els.palette.appendChild(row);
  }
}

function updateSelectionUI() {
  const item = selected();
  const sizeFields = document.getElementById("selSize");
  if (!item) {
    els.selection.classList.add("empty");
    els.selection.textContent = "家具を選ぶと回転・寸法・削除できます";
    els.selActions.hidden = true;
    if (sizeFields) sizeFields.hidden = true;
    return;
  }
  const cat = catalogOf(item);
  els.selection.classList.remove("empty");
  els.selection.innerHTML = `<b>${escapeHtml(cat?.name || item.type)}</b><br>回転 ${item.rot}°`;
  els.selActions.hidden = false;
  if (sizeFields) {
    sizeFields.hidden = false;
    document.getElementById("selW").value = cat?.w ?? "";
    document.getElementById("selD").value = cat?.d ?? "";
    document.getElementById("selH").value = cat?.h ?? "";
  }
}

function renderLists() {
  els.shopList.innerHTML = "";
  let sum = 0;
  for (const s of state.shop) {
    if (!s.done && s.price) sum += Number(s.price) || 0;
    const li = document.createElement("li");
    if (s.done) li.classList.add("done");
    li.innerHTML = `
      <input type="checkbox" ${s.done ? "checked" : ""} data-id="${s.id}" data-kind="shop" />
      <span>${escapeHtml(s.text)}</span>
      <span class="meta">${s.price ? "¥" + Number(s.price).toLocaleString() : ""}</span>
      <button type="button" class="icon" data-del="${s.id}" data-kind="shop">✕</button>`;
    els.shopList.appendChild(li);
  }
  els.shopSum.textContent = `¥${sum.toLocaleString()}`;

  els.todoList.innerHTML = "";
  for (const t of state.todos) {
    const li = document.createElement("li");
    if (t.done) li.classList.add("done");
    li.innerHTML = `
      <input type="checkbox" ${t.done ? "checked" : ""} data-id="${t.id}" data-kind="todo" />
      <span>${escapeHtml(t.text)}</span>
      <span class="meta">${t.date || ""}</span>
      <button type="button" class="icon" data-del="${t.id}" data-kind="todo">✕</button>`;
    els.todoList.appendChild(li);
  }

  if (document.activeElement !== els.sharedNotes) {
    els.sharedNotes.value = state.notes;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ---------- 3D ---------- */
function init3d() {
  if (three) return;
  const host = els.c3d;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e2d6);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
  camera.position.set(400, 500, 600);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(300, 0, 350);
  controls.update();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a890, 1.05);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(200, 400, 100);
  scene.add(dir);

  const group = new THREE.Group();
  scene.add(group);

  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  three = { scene, camera, renderer, controls, group, floor: null };
  resize3d();

  const loop = () => {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  rebuild3d();
}

function rebuild3d() {
  if (!three) return;
  while (three.group.children.length) {
    const o = three.group.children.pop();
    o.traverse?.((c) => {
      c.geometry?.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
        else c.material.dispose?.();
      }
    });
  }

  const ws = worldSize();
  const floorGeo = new THREE.PlaneGeometry(ws.w, ws.h);
  let floorMat;
  if (state.img) {
    const tex = new THREE.CanvasTexture(state.img);
    tex.colorSpace = THREE.SRGBColorSpace;
    floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  } else {
    floorMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe1, roughness: 1 });
  }
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ws.w / 2, 0, ws.h / 2);
  three.group.add(floor);

  // simple wall hint
  const wallH = 240;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf7f3ea,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const mkWall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    m.position.set(x, wallH / 2, z);
    three.group.add(m);
  };
  mkWall(ws.w, 8, ws.w / 2, 4);
  mkWall(ws.w, 8, ws.w / 2, ws.h - 4);
  mkWall(8, ws.h, 4, ws.h / 2);
  mkWall(8, ws.h, ws.w - 4, ws.h / 2);

  for (const item of state.items) {
    const cat = catalogOf(item);
    if (!cat) continue;
    const geo = new THREE.BoxGeometry(cat.w, Math.max(cat.h, 2), cat.d);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cat.color || "#888"),
      roughness: 0.75,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(item.x, Math.max(cat.h, 2) / 2, item.y);
    mesh.rotation.y = (-item.rot * Math.PI) / 180;
    three.group.add(mesh);
  }

  three.controls.target.set(ws.w / 2, 40, ws.h / 2);
}

/* ---------- Collab (MQTT over public broker) ---------- */
function setSync(status, text) {
  els.syncStatus.className = `sync ${status}`;
  els.syncStatus.textContent = text;
}

function joinRoom() {
  try {
    if (mqttClient) {
      try { mqttClient.end(true); } catch (_) {}
      mqttClient = null;
    }

    setSync("connecting", "同期接続中…");
    mqttClient = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
      clientId: "planner-" + CLIENT_ID,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 3000,
      protocolVersion: 4,
    });

    mqttClient.on("connect", () => {
      setSync("online", "同期OK · 相手の接続待ち");
      mqttClient.subscribe(SYNC_TOPIC, { qos: 0 });
      pushRemote();
    });

    mqttClient.on("reconnect", () => setSync("connecting", "再接続中…"));
    mqttClient.on("close", () => setSync("offline", "切断 · 再接続します"));
    mqttClient.on("error", (err) => {
      console.error(err);
      setSync("offline", "同期エラー（ローカル保存は有効）");
    });

    mqttClient.on("message", (_topic, buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (!msg || !msg.state) return;
        if (msg.clientId === CLIENT_ID) return;
        if (msg.ts && msg.ts <= lastRemoteTs) return;
        lastRemoteTs = msg.ts || Date.now();
        peerSeenAt = Date.now();
        applySnapshot(msg.state, { fromRemote: true });
        setSync("online", "同期中 · 相手と接続中");
      } catch (err) {
        console.error(err);
      }
    });

    setInterval(() => {
      if (!mqttClient?.connected) return;
      if (peerSeenAt && Date.now() - peerSeenAt < 15000) {
        setSync("online", "同期中 · 相手と接続中");
      } else {
        setSync("online", "同期OK · 相手の接続待ち");
      }
    }, 5000);

    setTimeout(() => {
      if (!mqttClient?.connected) {
        setSync("offline", "同期できない（ローカル保存は有効）");
      }
    }, 8000);
  } catch (err) {
    console.error(err);
    setSync("offline", "ローカルのみ（同期失敗）");
  }
}

/* ---------- Events ---------- */
document.getElementById("btnCopy").addEventListener("click", async () => {
  const url = location.href.split("?")[0].split("#")[0];
  try {
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById("btnCopy");
    const prev = btn.textContent;
    btn.textContent = "コピーしました";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1500);
  } catch {
    prompt("このURLを彼女に送ってください", url);
  }
});
document.getElementById("fit").addEventListener("click", fitView);
document.getElementById("resetCam").addEventListener("click", () => {
  if (!three) return;
  const ws = worldSize();
  three.camera.position.set(ws.w * 0.2, 520, ws.h * 1.15);
  three.controls.target.set(ws.w / 2, 40, ws.h / 2);
  three.controls.update();
});

els.scaleX.addEventListener("change", () => {
  state.scaleX = Number(els.scaleX.value) || state.scaleX;
  schedulePersist();
  draw2d();
  rebuild3d();
});
els.scaleY.addEventListener("change", () => {
  state.scaleY = Number(els.scaleY.value) || state.scaleY;
  schedulePersist();
  draw2d();
  rebuild3d();
});

els.palette.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const cat = findCatalog(add.dataset.add);
    if (cat) addFromCatalog(cat);
    return;
  }
  const del = e.target.closest("[data-del-cat]");
  if (del) {
    removeCatalog(del.dataset.delCat);
  }
});
els.palette.addEventListener("change", (e) => {
  const input = e.target.closest("input[data-cat][data-dim]");
  if (!input) return;
  updateCatalogSize(input.dataset.cat, { [input.dataset.dim]: input.value });
});

document.getElementById("btnResetCatalog").addEventListener("click", () => {
  if (!confirm("選択肢を最初の一覧に戻しますか？（配置済み家具はそのまま）")) return;
  state.catalog = DEFAULT_CATALOG.map((c) => ({ ...c }));
  renderPalette();
  schedulePersist();
  draw2d();
  rebuild3d();
});

document.getElementById("btnCustom").addEventListener("click", () => {
  const name = document.getElementById("cName").value.trim() || "カスタム";
  const w = Number(document.getElementById("cW").value);
  const d = Number(document.getElementById("cD").value);
  const h = Number(document.getElementById("cH").value) || 70;
  if (!(w > 0 && d > 0)) {
    alert("幅・奥行をcmで入れてください");
    return;
  }
  const id = `custom-${uid()}`;
  const cat = { id, name, w, d, h, color: "#9a7b9c", note: "カスタム" };
  state.catalog.push(cat);
  renderPalette();
  addFromCatalog(cat);
  document.getElementById("cName").value = "";
  document.getElementById("cW").value = "";
  document.getElementById("cD").value = "";
});

function applySelectedSize() {
  const item = selected();
  if (!item) return;
  const w = Number(document.getElementById("selW").value);
  const d = Number(document.getElementById("selD").value);
  const h = Number(document.getElementById("selH").value);
  if (w > 0) item.w = w;
  if (d > 0) item.d = d;
  if (h > 0) item.h = h;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
}
["selW", "selD", "selH"].forEach((id) => {
  document.getElementById(id).addEventListener("change", applySelectedSize);
});

document.getElementById("rotL").addEventListener("click", () => {
  const item = selected();
  if (!item) return;
  item.rot = (item.rot + 270) % 360;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
});
document.getElementById("rotR").addEventListener("click", () => {
  const item = selected();
  if (!item) return;
  item.rot = (item.rot + 90) % 360;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
});
document.getElementById("dup").addEventListener("click", () => {
  const item = selected();
  if (!item) return;
  const cat = catalogOf(item);
  const copy = {
    id: uid(),
    type: item.type,
    x: item.x + 20,
    y: item.y + 20,
    rot: item.rot,
  };
  if (item.custom) copy.custom = { ...item.custom };
  state.items.push(copy);
  state.selectedId = copy.id;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
});
document.getElementById("del").addEventListener("click", () => {
  const item = selected();
  if (!item) return;
  state.items = state.items.filter((i) => i.id !== item.id);
  state.selectedId = null;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
});

document.getElementById("btnClear").addEventListener("click", () => {
  if (!confirm("配置中の家具を全部消しますか？")) return;
  state.items = [];
  state.selectedId = null;
  updateSelectionUI();
  schedulePersist();
  draw2d();
  rebuild3d();
});

document.getElementById("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "maison-ks-layout.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById("btnImport").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    applySnapshot(data);
    schedulePersist();
  } catch {
    alert("JSONの読み込みに失敗しました");
  }
  e.target.value = "";
});

document.getElementById("addShop").addEventListener("click", () => {
  const text = document.getElementById("shopText").value.trim();
  const price = document.getElementById("shopPrice").value;
  if (!text) return;
  state.shop.push({ id: uid(), text, price: price ? Number(price) : null, done: false });
  document.getElementById("shopText").value = "";
  document.getElementById("shopPrice").value = "";
  renderLists();
  schedulePersist();
});
document.getElementById("addTodo").addEventListener("click", () => {
  const text = document.getElementById("todoText").value.trim();
  const date = document.getElementById("todoDate").value;
  if (!text) return;
  state.todos.push({ id: uid(), text, date: date || "", done: false });
  document.getElementById("todoText").value = "";
  renderLists();
  schedulePersist();
});
els.shopList.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del?.dataset.kind === "shop") {
    state.shop = state.shop.filter((s) => s.id !== del.dataset.del);
    renderLists();
    schedulePersist();
  }
});
els.todoList.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del?.dataset.kind === "todo") {
    state.todos = state.todos.filter((t) => t.id !== del.dataset.del);
    renderLists();
    schedulePersist();
  }
});
els.shopList.addEventListener("change", (e) => {
  if (e.target.matches('input[type="checkbox"][data-kind="shop"]')) {
    const s = state.shop.find((x) => x.id === e.target.dataset.id);
    if (s) s.done = e.target.checked;
    renderLists();
    schedulePersist();
  }
});
els.todoList.addEventListener("change", (e) => {
  if (e.target.matches('input[type="checkbox"][data-kind="todo"]')) {
    const t = state.todos.find((x) => x.id === e.target.dataset.id);
    if (t) t.done = e.target.checked;
    renderLists();
    schedulePersist();
  }
});
els.sharedNotes.addEventListener("input", () => {
  state.notes = els.sharedNotes.value;
  schedulePersist();
});

/* canvas interaction */
els.canvas.addEventListener("pointerdown", (e) => {
  const rect = els.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(sx, sy);
  const hit = hitTest(w.x, w.y);
  if (hit) {
    state.selectedId = hit.id;
    state.drag = { id: hit.id, ox: w.x - hit.x, oy: w.y - hit.y };
    els.canvas.setPointerCapture(e.pointerId);
  } else {
    state.selectedId = null;
    state.pan = { x: e.clientX, y: e.clientY, cx: state.cam.x, cy: state.cam.y };
    els.canvas.setPointerCapture(e.pointerId);
  }
  updateSelectionUI();
  draw2d();
});
els.canvas.addEventListener("pointermove", (e) => {
  const rect = els.canvas.getBoundingClientRect();
  if (state.drag) {
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const item = state.items.find((i) => i.id === state.drag.id);
    if (item) {
      item.x = w.x - state.drag.ox;
      item.y = w.y - state.drag.oy;
      draw2d();
    }
  } else if (state.pan) {
    state.cam.x = state.pan.cx + (e.clientX - state.pan.x);
    state.cam.y = state.pan.cy + (e.clientY - state.pan.y);
    draw2d();
  }
});
els.canvas.addEventListener("pointerup", () => {
  if (state.drag) {
    state.drag = null;
    schedulePersist();
    rebuild3d();
  }
  state.pan = null;
});
els.canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    state.cam.zoom = Math.min(4, Math.max(0.2, state.cam.zoom * factor));
    state.cam.x = sx - before.x * state.cam.zoom;
    state.cam.y = sy - before.y * state.cam.zoom;
    draw2d();
  },
  { passive: false }
);

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const item = selected();
    if (!item) return;
    state.items = state.items.filter((i) => i.id !== item.id);
    state.selectedId = null;
    updateSelectionUI();
    schedulePersist();
    draw2d();
    rebuild3d();
  }
  if (e.key === "r" || e.key === "R") {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const item = selected();
    if (!item) return;
    item.rot = (item.rot + 90) % 360;
    updateSelectionUI();
    schedulePersist();
    draw2d();
    rebuild3d();
  }
});

function layoutAll({ fit = false } = {}) {
  resizeCanvas({ fit });
  resize3d();
}

window.addEventListener("resize", () => layoutAll());

const ro = new ResizeObserver(() => layoutAll());
ro.observe(els.canvas.parentElement);
ro.observe(els.c3d);

/* boot */
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
  setSync("offline", "エラーあり（コンソール参照）");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
});

renderPalette();
loadLocal();

try {
  init3d();
} catch (err) {
  console.error(err);
  setSync("offline", "3D初期化失敗");
}

joinRoom();

const img = new Image();
img.decoding = "async";
img.onload = () => {
  state.img = img;
  layoutAll({ fit: true });
  rebuild3d();
};
img.onerror = () => {
  setSync("offline", "間取り画像の読み込み失敗");
};
img.src = new URL("madori.jpg", import.meta.url).href;

if (!state.shop.length) {
  state.shop = [
    { id: uid(), text: "ソファベッド（幅≦130・脚付き・座面高め）", price: 40000, done: false },
    { id: uid(), text: "蝶番ダイニング（木製・両翼 / 閉時幅〜30）", price: 25000, done: false },
    { id: uid(), text: "デスク（DK置き・洋室は厳しい）", price: 15000, done: false },
    { id: uid(), text: "サイドリフト or ベッド", price: 35000, done: false },
  ];
}
if (!state.todos.length) {
  state.todos = [
    { id: uid(), text: "DKの短い辺・長い辺を再測", date: "", done: false },
    { id: uid(), text: "キッチン前ニッチ（壁〜壁）を測る", date: "", done: false },
    { id: uid(), text: "コンセント・窓際の干渉を写真で撮る", date: "", done: false },
  ];
}
if (!state.notes) {
  state.notes =
    "メゾンKS加美平 1DK。縮尺は洋室実測ベース（横1.456 / 縦1.362 cm/px）。\n同居: 180cm / 168cm。ソファベッドは幅130cm以内・脚付き希望。デスク150はDK側。";
}
renderLists();
persistLocal();
requestAnimationFrame(() => layoutAll({ fit: true }));
