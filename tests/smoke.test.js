const { JSDOM } = require("jsdom");
const fs = require("fs");
const code = fs.readFileSync(require("path").join(__dirname, "..", "src", "inject.js"), "utf8");

function makeWindow(mode, url, anchorsHtml) {
  const dom = new JSDOM(`<!doctype html><body>${anchorsHtml}</body>`, {
    url, runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;
  const calls = [];
  w.setTimeout = (f) => { queueMicrotask(f); return 0; };   // sem esperas reais
  w.scrollTo = () => {};
  w.ytcfg = { get: (k) => ({
    INNERTUBE_CONTEXT: { client: { clientVersion: "2.0" } },
    INNERTUBE_API_KEY: "KEY", SESSION_INDEX: 0 }[k]) };
  Object.defineProperty(w.document, "cookie", { get: () => "SAPISID=abc123", set() {} });
  Object.defineProperty(w, "crypto", { value: globalThis.crypto });
  w.TextEncoder = TextEncoder; w.Uint8Array = Uint8Array;
  w.fetch = async (u, o) => { const body = JSON.parse(o.body); calls.push({ u, body, auth: o.headers.Authorization });
    const failId = w.__failId; const bad = failId && JSON.stringify(body).includes(failId);
    return { ok: true, status: 200, json: async () => ({ status: bad ? "STATUS_FAILED" : "STATUS_SUCCEEDED" }) }; };
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
  w.__downloads = [];
  const origClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () { if (this.download) w.__downloads.push(this.download); };
  w.__ywlMode = mode;
  return { w, calls };
}
const text = (w) => w.document.body.lastElementChild.textContent;
const btn = (w, re) => [...w.document.querySelectorAll("button")].find((b) => re.test(b.textContent));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FALHOU:", m); process.exitCode = 1; } else console.log("ok  -", m); };

(async () => {
  // ---------- CLEAN ----------
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  const anchors = ids.map((id, i) =>
    `<ytd-playlist-video-renderer><a id="video-title" title="Video ${i}" href="/watch?v=${id}&list=WL&index=${i}">Video ${i}</a></ytd-playlist-video-renderer>`).join("");
  const { w, calls } = makeWindow("clean", "https://www.youtube.com/playlist?list=WL", anchors);
  w.eval(code);
  await wait(100);
  assert(text(w).includes("3 "), "coletou 3 vídeos: " + JSON.stringify(text(w).slice(0, 60)));
  assert(w.__downloads.length === 1, "backup baixado: " + w.__downloads[0]);
  w.document.querySelector("input").value = "";
  btn(w, /^(Remover|Remove)$/).click();                         // 1º clique: só arma
  assert(calls.length === 0 && btn(w, /^(Confirmar|Confirm)/), "1º clique pede confirmação");
  btn(w, /^(Confirmar|Confirm)/).click();
  await wait(100);
  assert(calls.length === 3, "3 chamadas de remoção");
  assert(calls.every((c) => c.u.includes("/browse/edit_playlist?key=KEY")), "endpoint edit_playlist");
  assert(calls.every((c) => c.body.playlistId === "WL" && c.body.actions[0].action === "ACTION_REMOVE_VIDEO_BY_VIDEO_ID"), "ação de remover na playlist WL");
  assert(calls.every((c) => /^SAPISIDHASH \d+_[0-9a-f]{40}$/.test(c.auth)), "header SAPISIDHASH válido");
  assert(calls.map((c) => c.body.actions[0].removedVideoId).join() === ids.join(), "ordem de remoção");
  assert(/Removidos: 3|Removed: 3/.test(text(w)), "resumo final");

  // ---------- CLEAN fora da playlist ----------
  const o = makeWindow("clean", "https://www.youtube.com/", "");
  o.w.eval(code); await wait(20);
  assert(/Ver mais tarde|Watch later/.test(text(o.w)), "avisa quando não está na playlist");

  // ---------- RESTORE ----------
  const r = makeWindow("restore", "https://www.youtube.com/", "");
  r.w.eval(code);
  const backup = { format: "youtube-watch-later-cleaner-backup", version: 1, videos: [
    { id: "newest00001", title: "N" }, { id: "middle00002", title: "M" }, { id: "oldest00003", title: "O" },
    { id: "invalid", title: "x" }, { id: "oldest00003", title: "dup" } ] };
  const input = r.w.document.querySelector('input[type=file]');
  Object.defineProperty(input, "files", { value: [{ text: async () => JSON.stringify(backup) }] });
  input.dispatchEvent(new r.w.Event("change"));
  await wait(50);
  assert(/3 /.test(text(r.w)), "backup lido: 3 válidos (inválido e duplicado descartados)");
  btn(r.w, /^(Restaurar|Restore)$/).click();
  await wait(100);
  assert(r.calls.length === 3 && r.calls.every((c) => c.body.actions[0].action === "ACTION_ADD_VIDEO" && c.body.playlistId === "WL"), "ação de adicionar na playlist WL");
  assert(r.calls.map((c) => c.body.actions[0].addedVideoId).join() === "oldest00003,middle00002,newest00001", "restaura do mais antigo ao mais novo");

  // ---------- RESTORE: arquivo inválido e formato antigo ----------
  const r2 = makeWindow("restore", "https://www.youtube.com/", "");
  r2.w.eval(code);
  const i2 = r2.w.document.querySelector('input[type=file]');
  Object.defineProperty(i2, "files", { configurable: true, value: [{ text: async () => "not json" }] });
  i2.dispatchEvent(new r2.w.Event("change")); await wait(30);
  assert(/inválido|Invalid/.test(text(r2.w)), "rejeita arquivo inválido");
  Object.defineProperty(i2, "files", { configurable: true, value: [{ text: async () => JSON.stringify([{ id: "legacy00001", titulo: "Antigo" }]) }] });
  i2.dispatchEvent(new r2.w.Event("change")); await wait(30);
  assert(/1 v/.test(text(r2.w)), "aceita formato antigo (array com 'titulo')");

  // ---------- RESTORE: backup de outro tipo (likes) é rejeitado ----------
  const r3 = makeWindow("restore", "https://www.youtube.com/", "");
  r3.w.eval(code);
  const i3 = r3.w.document.querySelector('input[type=file]');
  Object.defineProperty(i3, "files", { value: [{ text: async () => JSON.stringify({ format: "youtube-likes-cleaner-backup", videos: [{ id: "aaaaaaaaaaa", title: "x" }] }) }] });
  i3.dispatchEvent(new r3.w.Event("change")); await wait(30);
  assert(/inválido|Invalid/.test(text(r3.w)), "rejeita backup de outro projeto (likes)");

  // ---------- CLEAN: STATUS_FAILED da API conta como falha ----------
  const f = makeWindow("clean", "https://www.youtube.com/playlist?list=WL", anchors);
  f.w.__failId = "bbbbbbbbbbb";
  f.w.eval(code); await wait(100);
  f.w.document.querySelector("input").value = "3";
  btn(f.w, /^(Remover|Remove)$/).click();
  await wait(100);
  assert(/Removidos: 2 \| Falhas: 1|Removed: 2 \| Failed: 1/.test(text(f.w)), "STATUS_FAILED contado como falha: " + JSON.stringify(text(f.w).slice(0, 70)));
})();
