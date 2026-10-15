// Popup: decides where to run and injects the page script (src/inject.js)
// into the active YouTube tab, in the page's MAIN world.

const WATCH_LATER_URL = "https://www.youtube.com/playlist?list=WL";
const $ = (id) => document.getElementById(id);
const msg = (key) => chrome.i18n.getMessage(key);

document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = msg(el.dataset.i18n);
});
$("version").textContent = "v" + chrome.runtime.getManifest().version;

async function launch(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = (tab && tab.url) || "";

  // "clean" must run on the Watch later playlist; "restore" works on any YouTube page.
  const ready =
    mode === "clean"
      ? /^https:\/\/www\.youtube\.com\/playlist\?.*list=WL/.test(url)
      : url.startsWith("https://www.youtube.com/");

  if (!ready) {
    await chrome.tabs.create({ url: WATCH_LATER_URL });
    $("status").textContent = msg("openedTab");
    return;
  }

  try {
    // window.ytcfg only exists in the page's own JS context, hence world: "MAIN".
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (m) => { window.__ywlMode = m; },
      args: [mode],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["src/inject.js"],
    });
    window.close();
  } catch (e) {
    $("status").textContent = msg("errorPrefix") + e.message;
  }
}

$("clean").addEventListener("click", () => launch("clean"));
$("restore").addEventListener("click", () => launch("restore"));
