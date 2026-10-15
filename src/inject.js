/*!
 * YouTube Watch Later Cleaner - page script (runs in the page's MAIN world)
 * MIT License
 *
 * Modes (set by the popup through window.__ywlMode):
 *   "clean"   -> removes every video from the Watch later playlist (WL)
 *   "restore" -> adds back every video found in a backup file
 *
 * Everything runs locally in your browser, using your own logged-in session.
 * No data is sent to any server other than YouTube itself.
 */
(async () => {
  "use strict";

  if (window.__ywlActive) return;
  window.__ywlActive = true;
  const MODE = window.__ywlMode === "restore" ? "restore" : "clean";

  // ---------------------------------------------------------------- i18n
  const LANG = String(navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";

  const STR = {
    pt: {
      title_clean: "Limpar Ver mais tarde",
      title_restore: "Restaurar Ver mais tarde",
      need_playlist: 'Abra a página "Ver mais tarde" (youtube.com/playlist?list=WL) e inicie de novo.',
      cancel: "Cancelar",
      close: "Fechar",
      stop: "Parar",
      remove: "Remover",
      restore: "Restaurar",
      reload: "Recarregar página",
      choose_file: "Escolher arquivo",
      all: "todos",
      confirm_all: "Confirmar: remover todos ({n})",
      loading: "Carregando a lista...\n{n} vídeos encontrados",
      none_found: "Nenhum vídeo encontrado. Você está logado nesta conta?",
      found: "{n} vídeos encontrados em Ver mais tarde.",
      backup_ok: "Backup (.json) baixado.",
      backup_fail: "Não consegui baixar o backup.",
      ask_remove: "Quantos remover? (vazio = todos)\nDica: teste com 5 primeiro.",
      progress_clean: "Removendo... {done}/{total}\nRemovidos: {ok} | Falhas: {fail}\n{title}",
      progress_restore: "Restaurando... {done}/{total}\nRestaurados: {ok} | Falhas: {fail}\n{title}",
      throttled: "O YouTube pediu para desacelerar.\nRetomando em {s}s...",
      no_perm: "\nSem permissão (status {st}). Confira se você está logado.",
      done: "Concluído",
      interrupted: "Interrompido",
      summary_clean: "{state}. Removidos: {ok} | Falhas: {fail}{err}\nRecarregue a página para conferir. Se sobrar algo, rode de novo.",
      summary_restore: "{state}. Restaurados: {ok} | Falhas: {fail}{err}\nRecarregue a página para conferir.",
      pick_file: "Selecione o arquivo de backup (.json) gerado por esta extensão.",
      invalid_backup: "Arquivo inválido. Use um backup de Ver mais tarde gerado por esta extensão.",
      backup_loaded: "{n} vídeos no backup.\nSerão adicionados do último para o primeiro da lista, para tentar preservar a ordem.\nQuantos restaurar? (vazio = todos)",
      error: "Erro: {m}",
    },
    en: {
      title_clean: "Clean Watch later",
      title_restore: "Restore Watch later",
      need_playlist: 'Open the "Watch later" page (youtube.com/playlist?list=WL) and start again.',
      cancel: "Cancel",
      close: "Close",
      stop: "Stop",
      remove: "Remove",
      restore: "Restore",
      reload: "Reload page",
      choose_file: "Choose file",
      all: "all",
      confirm_all: "Confirm: remove all ({n})",
      loading: "Loading the list...\n{n} videos found",
      none_found: "No videos found. Are you logged into this account?",
      found: "{n} videos found in Watch later.",
      backup_ok: "Backup (.json) downloaded.",
      backup_fail: "Could not download the backup.",
      ask_remove: "How many to remove? (empty = all)\nTip: try 5 first.",
      progress_clean: "Removing... {done}/{total}\nRemoved: {ok} | Failed: {fail}\n{title}",
      progress_restore: "Restoring... {done}/{total}\nRestored: {ok} | Failed: {fail}\n{title}",
      throttled: "YouTube asked us to slow down.\nResuming in {s}s...",
      no_perm: "\nNo permission (status {st}). Check that you are logged in.",
      done: "Done",
      interrupted: "Stopped",
      summary_clean: "{state}. Removed: {ok} | Failed: {fail}{err}\nReload the page to check. If anything is left, run it again.",
      summary_restore: "{state}. Restored: {ok} | Failed: {fail}{err}\nReload the page to check.",
      pick_file: "Select the backup file (.json) created by this extension.",
      invalid_backup: "Invalid file. Use a Watch later backup created by this extension.",
      backup_loaded: "{n} videos in the backup.\nThey will be added from the last to the first of the list, to try to preserve the order.\nHow many to restore? (empty = all)",
      error: "Error: {m}",
    },
  };

  const t = (key, vars = {}) =>
    STR[LANG][key].replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));

  // -------------------------------------------------------------- config
  const CFG = {
    playlistId: "WL",
    backupFormat: "youtube-watch-later-cleaner-backup",
    backupVersion: 1,
    scrollPauseMs: 1200, // wait after each scroll so YouTube can load more items
    stableRounds: 5,     // scroll rounds without new items = end of list
    delayMs: 700,        // base pause between requests
    jitterMs: 400,       // random extra pause
    throttleWaitS: 60,   // wait on HTTP 429
  };

  // One playlist edit per request (the safest default). Same internal action
  // names the "Save to Watch later" button on thumbnails uses.
  const EDIT_ACTION = {
    clean: (id) => ({ action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: id }),
    restore: (id) => ({ action: "ACTION_ADD_VIDEO", addedVideoId: id }),
  };

  const ID_RE = /^[\w-]{11}$/;
  const COLOR = { blue: "#3ea6ff", red: "#e53935", gray: "#555" };
  const LIST_RE = new RegExp("[?&]list=" + CFG.playlistId + "\\b");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------------ UI
  // YouTube enforces Trusted Types: never use innerHTML here.
  const el = (tag, opts = {}, kids = []) => {
    const e = document.createElement(tag);
    if (opts.text != null) e.textContent = opts.text;
    if (opts.css) e.style.cssText = opts.css;
    for (const k of ["type", "value", "min", "placeholder", "onclick"]) {
      if (k in opts) e[k] = opts[k];
    }
    kids.forEach((c) => e.appendChild(c));
    return e;
  };

  const panel = el("div", {
    css:
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;padding:14px;" +
      "background:#212121;color:#fff;border-radius:12px;font:14px/1.4 Roboto,Arial,sans-serif;" +
      "box-shadow:0 4px 24px rgba(0,0,0,.5)",
  });
  const titleEl = el("div", { text: t("title_" + MODE), css: "font-weight:700;margin-bottom:8px" });
  const msg = el("div", { css: "margin-bottom:10px;white-space:pre-line;word-break:break-word" });
  const bar = el("div", { css: "height:100%;width:0;background:" + COLOR.blue + ";border-radius:3px" });
  const barOuter = el(
    "div",
    { css: "height:6px;background:#444;border-radius:3px;margin-bottom:10px;display:none" },
    [bar]
  );
  const actions = el("div", { css: "display:flex;gap:8px;align-items:center;flex-wrap:wrap" });
  [titleEl, msg, barOuter, actions].forEach((c) => panel.appendChild(c));
  document.body.appendChild(panel);

  const button = (text, onclick, color = COLOR.blue) =>
    el("button", {
      text,
      onclick,
      css: `background:${color};color:#fff;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:14px`,
    });
  const numberInput = () =>
    el("input", {
      type: "number",
      min: "1",
      placeholder: t("all"),
      css: "width:80px;padding:6px;border-radius:6px;border:0",
    });
  const setActions = (...items) => actions.replaceChildren(...items);
  const closePanel = () => {
    stop = true;
    panel.remove();
    window.__ywlActive = false;
  };

  let stop = false;

  // ---------------------------------------------------------- collection
  async function collectVideos() {
    const found = new Map(); // id -> title
    const useRenderer = !!document.querySelector("ytd-playlist-video-renderer");
    const selector = useRenderer
      ? 'ytd-playlist-video-renderer a[href*="/watch?v="]'
      : `a[href*="/watch?v="][href*="list=${CFG.playlistId}"]`;

    const read = () => {
      document.querySelectorAll(selector).forEach((a) => {
        const m = a.href.match(/[?&]v=([\w-]{11})/);
        if (!m) return;
        const title =
          a.id === "video-title" ? (a.getAttribute("title") || a.textContent || "").trim() : "";
        if (!found.has(m[1]) || (!found.get(m[1]) && title)) found.set(m[1], title);
      });
    };

    let previous = -1;
    let stable = 0;
    while (stable < CFG.stableRounds && !stop) {
      read();
      msg.textContent = t("loading", { n: found.size });
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(CFG.scrollPauseMs);
      read();
      stable = found.size === previous ? stable + 1 : 0;
      previous = found.size;
    }
    window.scrollTo(0, 0);
    return [...found].map(([id, title]) => ({ id, title }));
  }

  // -------------------------------------------------------------- backup
  function downloadBackup(videos) {
    try {
      const data = {
        format: CFG.backupFormat,
        version: CFG.backupVersion,
        exportedAt: new Date().toISOString(),
        total: videos.length,
        videos, // same order as shown on the page
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        "youtube-watch-later-backup_" +
        new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") +
        ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return true;
    } catch (e) {
      console.warn("[YWL] backup download failed:", e);
      return false;
    }
  }

  // Accepts this extension's backup format, or a plain array of { id, title }.
  // Backups made by other tools (for example the likes cleaner) are rejected.
  function parseBackup(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data) && data && data.format && data.format !== CFG.backupFormat) {
      throw new Error("wrong backup type");
    }
    const raw = Array.isArray(data) ? data : data && data.videos;
    if (!Array.isArray(raw)) throw new Error("bad format");
    const seen = new Set();
    const videos = [];
    for (const v of raw) {
      const id = v && typeof v.id === "string" ? v.id : "";
      if (!ID_RE.test(id) || seen.has(id)) continue;
      seen.add(id);
      videos.push({ id, title: String(v.title ?? v.titulo ?? "") });
    }
    if (!videos.length) throw new Error("empty");
    return videos;
  }

  // ------------------------------------------------ YouTube playlist edit
  // Same internal endpoint the web client uses to add/remove playlist items,
  // authenticated with the SAPISIDHASH header derived from your own session.
  // Returns 200 on success, otherwise the HTTP status (or a negative code).
  async function editPlaylist(mode, videoId) {
    const cfg = window.ytcfg;
    if (!cfg || !cfg.get) return -2;
    const context = cfg.get("INNERTUBE_CONTEXT");
    const apiKey = cfg.get("INNERTUBE_API_KEY");
    const cookie = document.cookie.match(/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
    if (!cookie) return 401;

    const ts = Math.floor(Date.now() / 1000);
    const origin = "https://www.youtube.com";
    const digest = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(`${ts} ${cookie[1]} ${origin}`)
    );
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

    const headers = {
      "Content-Type": "application/json",
      Authorization: `SAPISIDHASH ${ts}_${hash}`,
      "X-Goog-AuthUser": String(cfg.get("SESSION_INDEX") ?? 0),
      "X-Origin": origin,
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": context.client.clientVersion,
    };
    const pageId = cfg.get("DELEGATED_SESSION_ID"); // brand accounts
    if (pageId) headers["X-Goog-PageId"] = pageId;

    try {
      const res = await fetch(`/youtubei/v1/browse/edit_playlist?key=${apiKey}&prettyPrint=false`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          context,
          playlistId: CFG.playlistId,
          actions: [EDIT_ACTION[mode](videoId)],
        }),
      });
      if (!res.ok) return res.status;

      // The API answers 200 with a status field; treat anything other than
      // STATUS_SUCCEEDED as a failure (if the field is absent, trust the 200).
      try {
        const json = await res.json();
        if (json && json.status && json.status !== "STATUS_SUCCEEDED") return -3;
      } catch (e) { /* empty body */ }
      return 200;
    } catch (e) {
      return -1;
    }
  }

  // ------------------------------------------------------------- runner
  async function run(videos, mode) {
    stop = false;
    barOuter.style.display = "block";
    bar.style.width = "0";
    setActions(button(t("stop"), () => { stop = true; }, COLOR.gray));

    let ok = 0;
    let fail = 0;
    let err = "";

    for (let i = 0; i < videos.length && !stop; i++) {
      const v = videos[i];
      let status = await editPlaylist(mode, v.id);

      if (status === 429) {
        for (let s = CFG.throttleWaitS; s > 0 && !stop; s--) {
          msg.textContent = t("throttled", { s });
          await sleep(1000);
        }
        if (stop) break;
        status = await editPlaylist(mode, v.id);
      }
      if (status === 401 || status === 403) {
        err = t("no_perm", { st: status });
        break;
      }

      if (status === 200) ok++;
      else {
        fail++;
        console.warn("[YWL] request failed:", v, "status", status);
      }

      msg.textContent = t("progress_" + mode, {
        done: ok + fail,
        total: videos.length,
        ok,
        fail,
        title: (v.title || v.id).slice(0, 60),
      });
      bar.style.width = ((ok + fail) / videos.length) * 100 + "%";
      await sleep(CFG.delayMs + Math.random() * CFG.jitterMs);
    }

    msg.textContent = t("summary_" + mode, {
      state: stop ? t("interrupted") : t("done"),
      ok,
      fail,
      err,
    });
    setActions(button(t("reload"), () => location.reload()), button(t("close"), closePanel, COLOR.gray));
  }

  // --------------------------------------------------------------- flows
  async function flowClean() {
    if (!LIST_RE.test(location.search)) {
      msg.textContent = t("need_playlist");
      setActions(button(t("close"), closePanel, COLOR.gray));
      return;
    }

    setActions(button(t("cancel"), closePanel, COLOR.gray));
    const videos = await collectVideos();
    if (stop) return;

    if (!videos.length) {
      msg.textContent = t("none_found");
      setActions(button(t("close"), closePanel, COLOR.gray));
      return;
    }

    const backupOk = downloadBackup(videos);
    msg.textContent =
      t("found", { n: videos.length }) + "\n" + t(backupOk ? "backup_ok" : "backup_fail") + "\n" + t("ask_remove");

    // Removing everything needs a second click as a safety net.
    const qty = numberInput();
    let armed = false;
    const go = button(
      t("remove"),
      () => {
        const n = parseInt(qty.value, 10) || 0;
        if (n > 0) return run(videos.slice(0, n), "clean");
        if (armed) return run(videos, "clean");
        armed = true;
        go.textContent = t("confirm_all", { n: videos.length });
      },
      COLOR.red
    );
    qty.addEventListener("input", () => {
      armed = false;
      go.textContent = t("remove");
    });
    setActions(qty, go, button(t("cancel"), closePanel, COLOR.gray));
  }

  function flowRestore() {
    msg.textContent = t("pick_file");

    const file = el("input", { type: "file" });
    file.accept = ".json,application/json";
    file.style.display = "none";
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let videos;
      try {
        videos = parseBackup(await f.text());
      } catch (e) {
        msg.textContent = t("invalid_backup");
        return;
      }

      msg.textContent = t("backup_loaded", { n: videos.length });
      const qty = numberInput();
      const go = button(
        t("restore"),
        () => {
          const n = parseInt(qty.value, 10) || 0;
          const subset = n > 0 ? videos.slice(0, n) : videos;
          // New items are expected to land at the top, so add from the end of
          // the backup to the start to recreate the original order.
          run(subset.slice().reverse(), "restore");
        },
        COLOR.blue
      );
      setActions(qty, go, button(t("cancel"), closePanel, COLOR.gray));
    });

    setActions(
      button(t("choose_file"), () => file.click()),
      button(t("cancel"), closePanel, COLOR.gray),
      file
    );
  }

  try {
    if (MODE === "restore") flowRestore();
    else await flowClean();
  } catch (e) {
    console.error("[YWL]", e);
    msg.textContent = t("error", { m: e.message });
    setActions(button(t("close"), closePanel, COLOR.gray));
  }
})();
