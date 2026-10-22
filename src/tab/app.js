import { EVENTS } from "../shared/events.js";
import { logger } from "../shared/logger.js";
import { THEME_COLORS, SUPPORT_URL, EXTENSION_ID, GITHUB_URL } from "../shared/constants.js";
import { CHANGELOG } from "../shared/changelog.js";
import { t, setLanguage } from "../shared/i18n.js";
import { HomePage } from "./components/home.js";
import { DetailPage } from "./components/detail.js";
import { ModalManager } from "./components/modal.js";
import { isInProgress } from "./seriesView.js";
import { renderCollections } from "./components/collections.js";
import { openCollectionEditor } from "./components/collectionEditor.js";

let state = null;
let syncStatus = null;
let currentCollection = "";
let currentFilter = "all";
let currentSection = "home";
let currentSearch = "";
let currentSearchResults = null;
let searchTimeout = null;
let searchHintTimeout = null;
let recommendedPlaylists = null;
let activityPanelOpen = false;

const homePage = new HomePage();
const detailPage = new DetailPage();
const modalManager = new ModalManager();

document.addEventListener("DOMContentLoaded", async () => {
  bindUIEvents();
  listenBroadcasts();
  await loadState();
  applyTheme();
  updateToolbarIcon();

  // Apri settings se richiesto dal popup
  const params = new URLSearchParams(window.location.search);
  if (params.get("settings") === "1") {
    modalManager.open("settingsModal");
    populateSettingsForm();
    document
      .querySelectorAll(".settings-section-content")
      .forEach((s) => s.classList.remove("active"));
    document
      .querySelectorAll(".settings-tab")
      .forEach((t) => t.classList.remove("active"));
    const themeTab = document.querySelector(
      '.settings-tab[data-section="theme"]',
    );
    const themeSection = document.querySelector(
      '.settings-section-content[data-section="theme"]',
    );
    if (themeTab) themeTab.classList.add("active");
    if (themeSection) themeSection.classList.add("active");
  }

  const seriesParam = params.get("series");
  if (seriesParam && Object.prototype.hasOwnProperty.call(state.series, seriesParam)) {
    onSeriesClick(state.series[seriesParam]);
  }

  // Aggiorna stato/UI quando la scheda torna in focus
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      await loadState();
    }
  });
});
window.addEventListener("yt-series-add", async (e) => {
  const { playlistId } = e.detail;
  if (!playlistId) return;

  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url });
  if (response.success && response.series && state) {
    state.series[response.series.playlistId] = response.series;
    render();
  }
});

window.addEventListener("yt-series-delete", async (e) => {
  const { playlistId } = e.detail;
  const response = await sendMessage(EVENTS.SERIES_DELETE, { playlistId });
  if (response.success && state) {
    delete state.series[playlistId];
    render();
    if (response.deletedSeries) {
      showErrorToast(t('series_deleted_undo'), t('undo'), async () => {
        const restored = await sendMessage(EVENTS.SERIES_RESTORE, { series: response.deletedSeries });
        if (restored.success && restored.state) {
          state = restored.state;
          render();
        }
      });
    }
  }
});

async function loadState() {
  showLoading(true);

  try {
    const response = await sendMessage(EVENTS.STATE_GET);
    if (response.success) {
      state = response.state;
      syncStatus = response.syncStatus || null;
      applyLanguageFromSettings();
      translateUI();
      populateSyncUI();
      render();
    }
  } catch (err) {
    logger.error("Failed to load state:", err);
    showError(t("load_failed_msg"));
  }

  showLoading(false);
}

function applyLanguageFromSettings() {
  if (!state?.settings) return;
  const lang = state.settings.language || "system";
  if (lang !== "system") {
    setLanguage(lang);
  } else {
    setLanguage(null);
  }
  document.documentElement.lang =
    lang !== "system" ? lang : navigator.language.split("-")[0] || "en";
}

function translateUI() {
  const map = [
    ["searchInput", "placeholder", "search_placeholder"],
    ["settingsBtn", "title", "settings"],
    ["addPlaylistBtn", "textContent", "add_via_link"],
    ["addPlaylistConfirm", "textContent", "add_series"],
    ["addPlaylistCancel", "textContent", "cancel"],
    ["playlistUrlInput", "placeholder", "playlist_url_placeholder"],
    ["addPlaylistModalTitle", "textContent", "add_series_title"],
    ["addPlaylistDesc", "textContent", "add_series_desc"],
    ["settingsModalTitle", "textContent", "settings_title"],
    ["autoRefreshToggle", "nextText", "auto_refresh_desc"],

    ["bugReportText", "placeholder", "bug_placeholder"],
  ];

  for (const [id, prop, key] of map) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (prop === "nextText") {
      const next = el.nextElementSibling?.nextElementSibling;
      if (next) next.textContent = t(key);
    } else {
      el[prop] = t(key);
    }
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const attr = el.dataset.i18nAttr;
    if (attr) {
      el.setAttribute(attr, t(key));
    } else if (!el.querySelector('svg, img')) {
      el.textContent = t(key);
    }
  });

  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) settingsBtn.title = t("settings");
  const activityBtn = document.getElementById('activityBtn');
  if (activityBtn) {
    activityBtn.title = t('activity_title');
    activityBtn.setAttribute('aria-label', t('activity_title'));
  }
  const activityPanelClose = document.getElementById('activityPanelClose');
  if (activityPanelClose) activityPanelClose.setAttribute('aria-label', t('close'));

  document.querySelectorAll("#themeSelect option").forEach((opt) => {
    const key = `theme_${opt.value.replace(/-/g, "_")}`;
    opt.textContent = t(key);
  });

  document.querySelectorAll("#languageSelect option").forEach((opt) => {
    const key = `language_${opt.value}`;
    opt.textContent = t(key);
  });

  document.querySelectorAll(".nav-link[data-filter]").forEach((chip) => {
    const key = chip.dataset.filter;
    if (key === "watching") chip.textContent = t("watching");
    else if (key === "completed") chip.textContent = t("completed");
    else if (key === "new") chip.textContent = t("new_episodes");
  });

  const closeBtn = document.querySelector(
    "#settingsModal .modal-footer .btn-secondary",
  );
  if (closeBtn) closeBtn.textContent = t("close");
}

function initIconTheme() {
  updateToolbarIcon();

  // Also listen for system preference changes as fallback
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => updateToolbarIcon());
}

function updateToolbarIcon() {
  const themeName = state?.settings?.theme || "classic-red";
  const isDark = themeName !== "light";
  setToolbarIcon(isDark);
}

function setToolbarIcon(isDark) {
  const suffix = isDark ? "_light" : "";
  sendMessage(EVENTS.SET_ICON_THEME, { suffix }).catch(() => {});
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    if (!chrome.runtime?.sendMessage)
      return resolve({ success: false, error: "NO_RUNTIME" });
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: "RUNTIME_ERROR",
          message: chrome.runtime.lastError.message,
        });
      } else {
        resolve(response);
      }
    });
  });
}

async function handleAutoRefreshChange(e) {
  if (!state) return;
  const autoRefresh = e.target.checked;
  state.settings.autoRefresh = autoRefresh;
  await sendMessage(EVENTS.SETTINGS_UPDATE, { autoRefresh });
}

async function handleNextEpisodeOverlayChange(e) {
  if (!state) return;
  const nextEpisodeOverlay = e.target.checked;
  state.settings.nextEpisodeOverlay = nextEpisodeOverlay;
  await sendMessage(EVENTS.SETTINGS_UPDATE, { nextEpisodeOverlay });
}

async function handleResetStorage() {
  const confirmed = await modalManager.confirm(t("reset_confirm"));
  if (!confirmed) return;
  await sendMessage(EVENTS.STORAGE_RESET);
  state = null;
  await loadState();
  populateSettingsForm();
  translateUI();
}

function handleExportData() {
  if (!state?.series || !Object.keys(state.series).length) {
    showErrorToast(t('no_data_to_export'));
    return;
  }
  const json = JSON.stringify(state.series, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yt-series-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImportData() {
  const input = document.getElementById('importFileInput');
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length) {
      showErrorToast(t('invalid_import_format'));
      return;
    }

    const confirmed = await modalManager.confirm(t('import_confirm', { count: Object.keys(data).length }));
    if (!confirmed) { input.value = ''; return; }

    const response = await sendMessage(EVENTS.IMPORT_SERIES, { series: data });
    if (response.success) {
      await loadState();
      showSuccessToast(t('import_success'));
    } else {
      showErrorToast(response.message || t('import_error'));
    }
  } catch (_) {
    showErrorToast(t('invalid_import_format'));
  }
  input.value = '';
}

async function handleShowBackups() {
  const list = document.getElementById('backupList');
  if (!list) return;
  const response = await sendMessage(EVENTS.BACKUP_LIST);
  list.innerHTML = '';
  list.classList.remove('hidden');
  if (!response.success || !response.backups?.length) {
    list.textContent = t('no_backups');
    return;
  }
  for (const backup of response.backups) {
    const row = document.createElement('div');
    row.className = 'backup-row';
    const label = document.createElement('span');
    label.textContent = `${new Date(backup.at).toLocaleString()} · ${backup.seriesCount} ${t('series_count')}`;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn-secondary';
    restore.textContent = t('restore_backup');
    restore.addEventListener('click', async () => {
      if (!await modalManager.confirm(t('restore_backup_confirm'))) return;
      const result = await sendMessage(EVENTS.BACKUP_RESTORE, { id: backup.id });
      if (result.success && result.state) {
        state = result.state;
        render();
        list.classList.add('hidden');
      } else showErrorToast(t('restore_backup_error'));
    });
    row.append(label, restore);
    list.appendChild(row);
  }
}

function handleBugReport() {
  const text = document.getElementById("bugReportText").value.trim();
  const errorEl = document.getElementById("bugReportError");

  if (!text) {
    errorEl.textContent = t("bug_empty");
    errorEl.classList.remove("hidden");
    return;
  }

  errorEl.classList.add("hidden");
  const subject = encodeURIComponent("Bug Report - YT Series");
  const body = encodeURIComponent(text + "\n\n---\nYT Series Bug Report");
  window.open(
    `mailto:lollo.princigalli@gmail.com?subject=${subject}&body=${body}`,
    "_blank",
  );
  modalManager.close("bugReportModal");
}

function renderChangelog() {
  const body = document.getElementById("changelogBody");
  body.innerHTML = "";

  if (CHANGELOG.length === 0) {
    const empty = document.createElement("div");
    empty.className = "changelog-empty";
    empty.textContent = t("changelog_empty");
    body.appendChild(empty);
    return;
  }

  for (const entry of CHANGELOG) {
    const div = document.createElement("div");
    div.className = "changelog-entry";

    const version = document.createElement("div");
    version.className = "changelog-version";
    version.textContent = "v" + entry.version;
    div.appendChild(version);

    if (entry.date) {
      const date = document.createElement("div");
      date.className = "changelog-date";
      date.textContent = entry.date;
      div.appendChild(date);
    }

    const lang = (state?.settings?.language || "system") === "it" ? "it" : "en";
    const itemsKey = lang === "it" ? "items_it" : "items";
    const entryItems = entry[itemsKey] || entry.items;
    if (entryItems && entryItems.length > 0) {
      const list = document.createElement("ul");
      list.className = "changelog-items";
      for (const item of entryItems) {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
      div.appendChild(list);
    }

    body.appendChild(div);
  }
}

function bindUIEvents() {
  document.getElementById("addPlaylistBtn").addEventListener("click", () => {
    modalManager.open("addPlaylistModal");
  });

  document.getElementById('activityBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleActivityPanel();
  });
  document.getElementById('activityPanelClose')?.addEventListener('click', () => toggleActivityPanel(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activityPanelOpen) {
      toggleActivityPanel(false);
      document.getElementById('activityBtn').focus();
    }
  });
  document.addEventListener('click', (event) => {
    const container = document.querySelector('.activity-menu-container');
    if (activityPanelOpen && container && !container.contains(event.target)) toggleActivityPanel(false);
  });

  document.getElementById("settingsBtn").addEventListener("click", () => {
    modalManager.open("settingsModal");
    populateSettingsForm();

    document
      .querySelectorAll(".settings-section-content")
      .forEach((s) => s.classList.remove("active"));
    document
      .querySelectorAll(".settings-tab")
      .forEach((t) => t.classList.remove("active"));
    const themeTab = document.querySelector(
      '.settings-tab[data-section="theme"]',
    );
    const themeSection = document.querySelector(
      '.settings-section-content[data-section="theme"]',
    );
    if (themeTab) themeTab.classList.add("active");
    if (themeSection) themeSection.classList.add("active");
  });

  document.getElementById("headerProBtn").addEventListener("click", () => {
    if (SUPPORT_URL) {
      window.open(SUPPORT_URL, "_blank");
    }
  });

  // Settings tabs handling
  document.querySelectorAll(".settings-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = tab.dataset.section;

      // Remove active class from all tabs
      document
        .querySelectorAll(".settings-tab")
        .forEach((t) => t.classList.remove("active"));
      // Add active class to clicked tab
      tab.classList.add("active");

      // Hide all sections
      document
        .querySelectorAll(".settings-section-content")
        .forEach((s) => s.classList.remove("active"));
      // Show selected section
      const targetSection = document.querySelector(
        `.settings-section-content[data-section="${section}"]`,
      );
      if (targetSection) {
        targetSection.classList.add("active");
      }
    });
  });

  document
    .getElementById("addPlaylistConfirm")
    .addEventListener("click", handleAddPlaylist);
  document.getElementById("addPlaylistCancel").addEventListener("click", () => {
    modalManager.close("addPlaylistModal");
  });
  document
    .getElementById("playlistUrlInput")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddPlaylist();
    });



  document
    .getElementById("themeSelect")
    .addEventListener("change", handleThemeChange);
  document
    .getElementById("languageSelect")
    .addEventListener("change", handleLanguageChange);
  document
    .getElementById("nextEpisodeOverlayToggle")
    .addEventListener("change", handleNextEpisodeOverlayChange);
  document
    .getElementById("autoRefreshToggle")
    .addEventListener("change", handleAutoRefreshChange);
  document
    .getElementById("resetStorageBtn")
    .addEventListener("click", handleResetStorage);
  document
    .getElementById("exportDataBtn")
    .addEventListener("click", handleExportData);
  document
    .getElementById("importDataBtn")
    .addEventListener("click", () => document.getElementById("importFileInput").click());
  document.getElementById("showBackupsBtn")?.addEventListener("click", handleShowBackups);
  document
    .getElementById("importFileInput")
    .addEventListener("change", handleImportData);
  document
    .getElementById("syncLoginBtn")
    ?.addEventListener("click", handleSyncLogin);
  document
    .getElementById("syncLogoutBtn")
    ?.addEventListener("click", handleSyncLogout);
  document
    .getElementById("syncNowBtn")
    ?.addEventListener("click", handleSyncNow);

  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.parentElement.classList.toggle("open");
    });
  });

  document.getElementById("footerFaqLink").addEventListener("click", (e) => {
    e.preventDefault();
    modalManager.open("faqModal");
  });

  document.getElementById("footerBugLink").addEventListener("click", (e) => {
    e.preventDefault();
    modalManager.open("bugReportModal");
    document.getElementById("bugReportText").value = "";
    document.getElementById("bugReportError").classList.add("hidden");
  });

  document
    .getElementById("footerChangelogLink")
    .addEventListener("click", (e) => {
      e.preventDefault();
      renderChangelog();
      modalManager.open("changelogModal");
    });

  document
    .getElementById("bugReportSend")
    .addEventListener("click", handleBugReport);
  document.getElementById("bugReportText").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) handleBugReport();
  });

  document
    .getElementById("bugReportGithubLink")
    .addEventListener("click", (e) => {
      e.preventDefault();
      window.open(`${GITHUB_URL}/issues/new`, "_blank", "noopener");
    });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    currentSearch = e.target.value.trim().toLowerCase().slice(0, 200);
    const clearBtn = document.getElementById("searchClear");
    if (currentSearch) {
      clearBtn.classList.remove("hidden");
      // Show hint after 2s if user hasn't searched yet
      if (searchHintTimeout) clearTimeout(searchHintTimeout);
      if (!currentSearchResults) {
        searchHintTimeout = setTimeout(() => renderHome(), 2000);
      }
    } else {
      clearBtn.classList.add("hidden");
      currentSearchResults = null;
      if (searchHintTimeout) clearTimeout(searchHintTimeout);
    }
    // Update local filter immediately (no API call)
    renderHome();
  });

  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && currentSearch && currentSection !== 'saved') {
      if (searchTimeout) clearTimeout(searchTimeout);
      if (searchHintTimeout) clearTimeout(searchHintTimeout);
      doYouTubeSearch();
    }
  });

  document.getElementById("searchClear").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    currentSearch = "";
    currentSearchResults = null;
    document.getElementById("searchClear").classList.add("hidden");
    renderHome();
  })
async function doYouTubeSearch() {
  const response = await sendMessage(EVENTS.PLAYLIST_SEARCH, {
    query: currentSearch,
  });
  if (response.success) {
    currentSearchResults = response;
  }
  renderHome();
};

  document.querySelectorAll(".nav-link[data-filter]").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      currentSection = "home";
      currentCollection = "";
      document.querySelector('.nav-link[data-view="saved"]').classList.remove('active');
      document
        .querySelectorAll(".nav-link[data-filter]")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      document
        .querySelector('.nav-link[data-view="home"]')
        .classList.remove("active");
      currentFilter = chip.dataset.filter;
      renderHome();
    });
  });

  document
    .querySelectorAll(".modal-close, .btn-secondary[data-modal]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const modalId = btn.dataset.modal;
        if (modalId) modalManager.close(modalId);
      });
    });

  document
    .querySelector('.nav-link[data-view="home"]')
    .addEventListener("click", (e) => {
      e.preventDefault();
      currentFilter = "all";
      currentSection = "home";
      currentCollection = "";
      document.querySelector('.nav-link[data-view="saved"]').classList.remove('active');
      currentSearch = "";
      currentSearchResults = null;
      document.getElementById("searchInput").value = "";
      document.getElementById("searchClear").classList.add("hidden");
      document
        .querySelectorAll(".nav-link[data-filter]")
        .forEach((c) => c.classList.remove("active"));
      document
        .querySelector('.nav-link[data-view="home"]')
        .classList.add("active");
      renderHome();
    });

  let ticking = false;
  document.querySelector('.nav-link[data-view="saved"]').addEventListener('click', event => {
    event.preventDefault();
    currentSection = 'saved';
    currentFilter = 'all';
    currentCollection = '';
    currentSearch = '';
    currentSearchResults = null;
    clearTimeout(searchTimeout);
    clearTimeout(searchHintTimeout);
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.add('hidden');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === 'saved'));
    renderHome();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const header = document.getElementById("header");
          header.classList.toggle("scrolled", window.scrollY > 0);
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );
}

function listenBroadcasts() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender || sender.id !== chrome.runtime.id) return;
    if (message.type === EVENTS.STATE_UPDATED && message.state) {
      state = message.state;
      if (message.syncStatus) syncStatus = message.syncStatus;
      applyLanguageFromSettings();
      translateUI();
      populateSyncUI();
      render();
      if (detailPage.series) {
        const updated = state.series[detailPage.series.playlistId];
        if (updated) {
          detailPage.render(updated, _detailCallbacks());
        }
      }
    }
  });
}

function _detailCallbacks() {
  return {
    onWatch: handleWatchEpisode,
    onUnwatch: handleUnwatchEpisode,
    onBack: () => {},
    onRefresh: handleRefreshSeries,
    onCompleteToggle: handleSeriesCompleteToggle,
    onCollectionSet: handleSeriesCollectionSet,
    collections: collectionNames(),
    onAddSeries,
  };
}

function render() {
  renderHome();
  updateActivityPanel();
}

function renderHome() {
  homePage.destroy();
  const main = document.getElementById("mainContent");
  main.innerHTML = "";

  if (currentSearch) {
    const searchHeader = document.createElement("div");
    searchHeader.className = "search-header";
    const h2 = document.createElement("h2");
    h2.className = "search-header-title";
    h2.textContent = `"${currentSearch}"`;
    searchHeader.appendChild(h2);
    // Show "Press Enter" hint if YouTube search hasn't been triggered yet
    if (currentSection !== 'saved' && !currentSearchResults && searchHintTimeout) {
      const hint = document.createElement("p");
      hint.className = "search-header-hint";
      hint.textContent = t("search_hint");
      searchHeader.appendChild(hint);
    }
    main.appendChild(searchHeader);
  }

  const seriesArray = Object.values(state?.series || {});
  if (currentSection === 'saved') {
    renderSavedLibrary(main, seriesArray);
    return;
  }

  if (seriesArray.length === 0) {
    if (currentSearchResults) {
      const hasResults =
        (currentSearchResults.playlists &&
          currentSearchResults.playlists.length > 0) ||
        (currentSearchResults.channels &&
          currentSearchResults.channels.length > 0);
      if (!hasResults) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const p = document.createElement("p");
        p.className = "empty-state-desc";
        p.textContent = t("no_results_for", { query: currentSearch });
        empty.appendChild(p);
        main.appendChild(empty);
        return;
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const h2 = document.createElement("h2");
      h2.className = "empty-state-title";
      h2.textContent = t("welcome_title");

      const p = document.createElement("p");
      p.className = "empty-state-desc";
      p.textContent = t("welcome_desc");

      empty.appendChild(h2);
      empty.appendChild(p);
      main.appendChild(empty);
      return;
    }
  }

  if (currentCollection && !seriesArray.some(s => s.collection === currentCollection)) currentCollection = "";
  const filtered = filterSeries(seriesArray);
  if (!filtered.length && seriesArray.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = t('filtered_empty');
    main.appendChild(empty);
  }
  const continueSeries = filtered.filter(isInProgress);
  const newSeries = filtered.filter((s) => s.newEpisodesCount > 0);

  if (!currentSearch && currentFilter === "all" && !currentCollection) {
    const heroSeries = buildHeroSeries(seriesArray);
    if (heroSeries.length > 0) {
      main.appendChild(
        homePage.renderHeroCarousel(
          heroSeries,
          onContinueWatching,
          onSeriesClick,
        ),
      );
    }
    if (currentFilter === "all" && !currentSearch) {
      const thisWeekSeries = getThisWeekSeries(seriesArray);
      if (thisWeekSeries.length > 0) {
        main.appendChild(
          homePage.renderRow(
            t("this_week"),
            thisWeekSeries.slice(0, 10),
            onSeriesClick,
          ),
        );
      }
    }
  }

  if (currentFilter === "all") {
    const watching = continueSeries.slice(0, 10);
    if (watching.length > 0) {
      main.appendChild(
        homePage.renderRow(t("in_progress"), watching, onSeriesClick),
      );
    }
  }

  if (
    newSeries.length > 0 &&
    currentFilter === "new"
  ) {
    main.appendChild(
      homePage.renderRow(
        t("new_episodes"),
        newSeries,
        onSeriesClick,
      ),
    );
  }
  if (
    currentFilter === "all" ||
    currentFilter === "watching" ||
    currentFilter === "completed"
  ) {
    const allShown = filtered;
    if (allShown.length > 0) {
      main.appendChild(
        homePage.renderRow(t("my_series"), allShown, onSeriesClick),
      );
    }
  }

  if (
    currentSearchResults &&
    currentSearchResults.playlists &&
    currentSearchResults.playlists.length > 0
  ) {
    main.appendChild(
      homePage.renderSearchPlaylists(
        currentSearchResults.playlists,
        onSearchAddPlaylist,
        "YouTube",
      ),
    );
  }

  if (
    currentSearchResults &&
    currentSearchResults.channels &&
    currentSearchResults.channels.length > 0
  ) {
    for (const ch of currentSearchResults.channels) {
      main.appendChild(
        homePage.renderChannelCard(
          ch,
          onSearchAddPlaylist,
          onFetchChannelPlaylists,
        ),
      );
    }
  }

  if (
    !currentSearch &&
    currentFilter === "all" && !currentCollection &&
    seriesArray.length > 0
  ) {
    const recSection = document.createElement("div");
    recSection.id = "recommendedSection";
    main.appendChild(recSection);
    if (recommendedPlaylists) {
      const el = homePage.renderSearchPlaylists(
        recommendedPlaylists,
        onSearchAddPlaylist,
        t("recommended"),
      );
      if (el) recSection.appendChild(el);
    } else {
      fetchRecommended();
    }
  }
}

function filterSeries(seriesArray) {
  let filtered = seriesArray;

  if (currentSearch) {
    const search = currentSearch;
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(search) ||
        (s.channelTitle && s.channelTitle.toLowerCase().includes(search)),
    );
  }

  if (currentCollection) {
    filtered = filtered.filter((series) => series.collection === currentCollection);
  }

  switch (currentFilter) {
    case "watching":
      filtered = filtered.filter(isInProgress);
      break;
    case "completed":
      filtered = filtered.filter(
        (s) =>
          s.completed ||
          (s.videos.length > 0 && s.videos.every((v) => v.watched)),
      );
      break;
    case "new":
      filtered = filtered.filter((s) => s.newEpisodesCount > 0);
      break;
  }

  filtered.sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;

    const aWatched = a.videos.filter((v) => v.watched).length;
    const bWatched = b.videos.filter((v) => v.watched).length;
    const aProgress = a.videos.length > 0 ? aWatched / a.videos.length : 0;
    const bProgress = b.videos.length > 0 ? bWatched / b.videos.length : 0;

    if (aProgress > 0 && aProgress < 1 && !(bProgress > 0 && bProgress < 1))
      return -1;
    if (bProgress > 0 && bProgress < 1 && !(aProgress > 0 && aProgress < 1))
      return 1;
    return (b.addedAt || 0) - (a.addedAt || 0);
  });

  return filtered;
}

function renderSavedLibrary(main, seriesArray) {
  if (currentCollection && !collectionNames().includes(currentCollection)) currentCollection = '';
  renderCollectionFilters(main, seriesArray);
  const heading = document.createElement('h2');
  heading.className = 'collection-content-title';
  heading.tabIndex = -1;
  heading.textContent = currentCollection || t('all_saved');
  main.append(heading);
  if (currentCollection) {
    const actions = document.createElement('div');
    actions.className = 'collection-management';
    for (const mode of ['add', 'edit', 'move', 'delete']) {
      if (mode === 'move' && !seriesArray.some(s => s.collection === currentCollection)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-secondary';
      button.textContent = t(mode === 'add' ? 'add_collection_series' : mode === 'delete' ? 'delete_collection' : mode === 'edit' ? 'edit_collection' : 'move_series');
      button.addEventListener('click', () => manageCollection(mode));
      actions.append(button);
    }
    main.append(actions);
  }
  const filtered = filterSeries(seriesArray);
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = t(currentCollection && !currentSearch ? 'collection_empty' : seriesArray.length ? 'filtered_empty' : 'saved_empty');
    main.append(empty);
  }
  main.append(homePage.renderLibraryGrid(filtered, onSeriesClick));
}

function renderCollectionFilters(container, seriesArray) {
  const section = renderCollections(seriesArray, currentCollection, name => {
    currentCollection = name;
    render();
    const target = name ? document.querySelector('.collection-content-title') :
      [...document.querySelectorAll('.collection-tile')].find(el => el.dataset.collection === '');
    target?.focus({ preventScroll: true });
  }, state?.collections || [], () => manageCollection('create'));
  if (section) {
    container.append(section);
    if (currentCollection) {
      const shelf = section.querySelector('.collections-shelf');
      const selected = section.querySelector('[aria-pressed="true"]');
      if (selected) shelf.scrollLeft = Math.max(0, selected.offsetLeft - shelf.offsetLeft - 12);
    }
  }
}

function collectionNames() {
  return [...new Set([...(state?.collections || []), ...Object.values(state?.series || {}).map(s => s.collection).filter(Boolean)])].sort();
}

async function manageCollection(mode) {
  const name = currentCollection;
  if (mode === 'delete') {
    if (!await modalManager.confirm(t('delete_collection_confirm', { name }))) return;
    try {
      const response = await sendMessage(EVENTS.COLLECTION_DELETE, { name });
      if (!response.success) throw new Error();
      state = response.state; currentCollection = ''; render();
    } catch { showErrorToast(t('collection_save_error')); }
    return;
  }
  openCollectionEditor({ name, mode,
    series: Object.values(state.series).filter(s => mode === 'create' || mode === 'add' || s.collection === name),
    collections: collectionNames(),
    onSave: async payload => {
      const response = await sendMessage(mode === 'create' ? EVENTS.COLLECTION_CREATE : mode === 'edit' ? EVENTS.COLLECTION_EDIT : EVENTS.COLLECTION_MOVE, payload);
      if (!response.success) throw new Error(response.message || response.error);
      state = response.state;
      currentCollection = mode === 'create' ? payload.name : mode === 'edit' ? payload.nextName : name;
      if (mode === 'create') {
        currentSearch = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchClear').classList.add('hidden');
      }
      render();
      if (mode === 'move' || mode === 'add') {
        showErrorToast(t('collection_move_result', { moved: response.moved, skipped: response.skipped }), response.undoToken ? t('undo') : null, response.undoToken ? async () => {
          try {
            const result = await sendMessage(EVENTS.COLLECTION_UNDO, { token: response.undoToken });
            if (!result.success) throw new Error();
            state = result.state; render();
            showErrorToast(t('collection_undo_result', { restored: result.restored, skipped: result.skipped }));
          } catch { showErrorToast(t('collection_undo_expired')); }
        } : null);
      }
    }
  });
}

function activityLocale() {
  const language = state?.settings?.language || 'system';
  return language === 'system' ? navigator.language : language;
}

function getThisWeekSeries(allSeries) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return Object.values(allSeries).filter((s) => {
    if (s.completed) return false;
    return s.videos.some((v) => {
      if (!v.publishedAt) return false;
      const d = new Date(v.publishedAt);
      return d >= monday && d <= sunday;
    });
  });
}

function buildHeroSeries(allSeries) {
  const inProgress = [];
  const notStarted = [];
  const completed = [];

  for (const s of Object.values(allSeries)) {
    const watched = s.videos.filter((v) => v.watched).length;
    if (s.completed || (s.videos.length > 0 && watched === s.videos.length)) {
      completed.push(s);
    } else if (watched > 0) {
      inProgress.push(s);
    } else {
      notStarted.push(s);
    }
  }

  inProgress.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  notStarted.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  return [...inProgress, ...notStarted, ...completed].slice(0, 8);
}

function onSeriesClick(series) {
  detailPage.render(series, _detailCallbacks());
}

function onContinueWatching(series) {
  const nextEpisode = series.videos.find((v) => !v.watched);
  if (nextEpisode) {
    const resumeAt = Number.isFinite(nextEpisode.resumeTime) && nextEpisode.resumeTime > 0 ? `&t=${Math.floor(nextEpisode.resumeTime)}` : "";
    window.open(
      `https://www.youtube.com/watch?v=${nextEpisode.id}&list=${series.playlistId}${resumeAt}`,
      "_blank",
      "noopener",
    );
  }
}

async function handleWatchEpisode(playlistId, videoId) {
  try {
    const response = await sendMessage(EVENTS.EPISODE_WATCH, {
      playlistId,
      videoId,
    });
    if (response.success && response.state) {
      state = response.state;
      render();
      if (detailPage.series && detailPage.series.playlistId === playlistId) {
        const updated = state.series[playlistId];
        if (updated) {
          detailPage.render(updated, _detailCallbacks());
        }
      }
    } else if (!response.success && response.message) {
      showErrorToast(response.message);
    }
  } catch (err) {
    logger.error("Failed to mark episode watched:", err);
  }
}

async function handleUnwatchEpisode(playlistId, videoId) {
  try {
    const response = await sendMessage(EVENTS.EPISODE_UNWATCH, {
      playlistId,
      videoId,
    });
    if (response.success && response.state) {
      state = response.state;
      render();
      if (detailPage.series && detailPage.series.playlistId === playlistId) {
        const updated = state.series[playlistId];
        if (updated) {
          detailPage.render(updated, _detailCallbacks());
        }
      }
    } else if (!response.success && response.message) {
      showErrorToast(response.message);
    }
  } catch (err) {
    logger.error("Failed to mark episode unwatched:", err);
  }
}

async function handleSeriesCompleteToggle(playlistId) {
  const response = await sendMessage(EVENTS.SERIES_COMPLETE_TOGGLE, {
    playlistId,
  });
  if (response.success && response.state) {
    state = response.state;
    const series = state.series[playlistId];
    const wasJustCompleted = series?.completed;

    if (series) {
      detailPage.render(series, _detailCallbacks());
    }
    render();
  }
}

async function handleSeriesCollectionSet(playlistId, collection) {
  const response = await sendMessage(EVENTS.SERIES_COLLECTION_SET, { playlistId, collection });
  if (response.success && response.state) {
    state = response.state;
    detailPage.render(state.series[playlistId], _detailCallbacks());
    render();
  } else {
    showErrorToast(response.message || t("collection_save_error"));
  }
}

function describeActivity(event) {
  const series = event.playlistId ? state?.series?.[event.playlistId] : null;
  const episode = series?.videos?.find((video) => video.id === event.videoId);
  const title = episode?.title || series?.title || event.title || t('unknown_series');
  const labels = { series_added: 'activity_series_added', series_deleted: 'activity_series_deleted', series_completed: 'activity_series_completed', series_reopened: 'activity_series_reopened', collection_changed: 'activity_collection_changed', episode_watched: 'activity_episode_watched', episode_unwatched: 'activity_episode_unwatched', library_imported: 'activity_library_imported' };
  return t(labels[event.type] || 'recent_activity_item', { title });
}

function updateActivityPanel() {
  const badge = document.getElementById('activityBadge');
  const list = document.getElementById('activityPanelList');
  if (!badge || !list) return;
  const events = state?.activity || [];
  const unread = events.filter(event => event.at > (state?.activityReadAt || 0)).length;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.classList.toggle('hidden', unread === 0);
  document.getElementById('activityBtn')?.setAttribute('aria-label', t('activity_unread', { n: unread }));
  list.innerHTML = '';
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'activity-panel-empty';
    empty.textContent = t('no_activity');
    list.appendChild(empty);
  } else {
    for (const event of events) {
      const targetSeries = state?.series?.[event.playlistId];
      const targetVideo = targetSeries?.videos?.find(video => video.id === event.videoId);
      const row = document.createElement(targetSeries ? (targetVideo ? 'a' : 'button') : 'div');
      row.className = 'activity-panel-item';
      if (targetSeries) {
        row.classList.add('activity-panel-link');
        if (targetVideo) {
          const url = new URL('https://www.youtube.com/watch');
          url.searchParams.set('v', targetVideo.id);
          url.searchParams.set('list', targetSeries.playlistId);
          if (!targetVideo.watched && targetVideo.resumeTime > 0) url.searchParams.set('t', Math.floor(targetVideo.resumeTime) + 's');
          row.href = url.href;
          row.target = '_blank';
          row.rel = 'noopener noreferrer';
        } else row.type = 'button';
        row.addEventListener('click', () => {
          toggleActivityPanel(false);
          if (!targetVideo) onSeriesClick(targetSeries);
        });
      }
      const marker = document.createElement('span');
      marker.className = 'activity-panel-marker';
      marker.textContent = event.type === 'episode_watched' ? '✓' : '•';
      const body = document.createElement('span');
      body.className = 'activity-panel-body';
      body.textContent = describeActivity(event);
      const time = document.createElement('time');
      time.textContent = new Intl.RelativeTimeFormat(activityLocale(), { numeric: 'auto' }).format(Math.round((event.at - Date.now()) / 60000), 'minute');
      row.append(marker, body, time);
      list.appendChild(row);
    }
  }
}

function toggleActivityPanel(force) {
  const panel = document.getElementById('activityPanel');
  const button = document.getElementById('activityBtn');
  if (!panel || !button) return;
  activityPanelOpen = force === undefined ? !activityPanelOpen : force;
  panel.classList.toggle('hidden', !activityPanelOpen);
  button.setAttribute('aria-expanded', String(activityPanelOpen));
  if (activityPanelOpen) {
    updateActivityPanel();
    markVisibleActivityRead();
  }
}

async function markVisibleActivityRead() {
  const through = Math.max(0, ...(state?.activity || []).map(event => event.at));
  if (through <= (state?.activityReadAt || 0)) return;
  try {
    const response = await sendMessage(EVENTS.ACTIVITY_MARK_READ, { through });
    if (!response.success) throw new Error(response.message);
    state.activityReadAt = Math.max(state.activityReadAt || 0, response.activityReadAt);
    updateActivityPanel();
  } catch {
    showErrorToast(t('activity_read_error'));
  }
}

async function handleRefreshSeries(playlistId) {
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = t("refreshing");
  }

  try {
    const response = await sendMessage(EVENTS.SERIES_REFRESH, { playlistId });

    if (response.success && state && response.series) {
      state.series[playlistId] = response.series;
      const series = state.series[playlistId];
      detailPage.render(series, _detailCallbacks());
    } else {
      logger.error("Refresh failed:", response);
      showErrorToast(response?.message || t("refresh_failed"));
    }
  } catch (err) {
    logger.error("Refresh error:", err);
    showErrorToast(t("refresh_network_error"));
  }
}

async function fetchRecommended() {
  if (!state) return;
  const savedIds = new Set(Object.keys(state.series));

  const channelCount = {};
  for (const s of Object.values(state.series)) {
    if (s.channelId) {
      channelCount[s.channelId] = (channelCount[s.channelId] || 0) + 1;
    }
  }

  const entries = Object.entries(channelCount);
  if (entries.length === 0) return;

  const totalSaved = entries.reduce((sum, [, c]) => sum + c, 0);
  const TARGET = 10;

  const allPlaylists = [];
  const seenIds = new Set();

  for (const [chId, count] of entries) {
    const pls = await onFetchChannelPlaylists(chId);
    const proportion = count / totalSaved;
    const slots = Math.max(1, Math.round(TARGET * proportion));

    let added = 0;
    for (const pl of pls) {
      if (added >= slots) break;
      if (savedIds.has(pl.playlistId) || seenIds.has(pl.playlistId)) continue;
      seenIds.add(pl.playlistId);
      allPlaylists.push(pl);
      added++;
    }
  }

  for (let i = allPlaylists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPlaylists[i], allPlaylists[j]] = [allPlaylists[j], allPlaylists[i]];
  }

  recommendedPlaylists = allPlaylists.slice(0, TARGET);

  const recSection = document.getElementById("recommendedSection");
  if (recSection) {
    recSection.innerHTML = "";
    const el = homePage.renderSearchPlaylists(
      recommendedPlaylists,
      onSearchAddPlaylist,
      t("recommended"),
    );
    if (el) recSection.appendChild(el);
  }
}

async function onFetchChannelPlaylists(channelId) {
  const response = await sendMessage(EVENTS.FETCH_CHANNEL_PLAYLISTS, {
    channelId,
  });
  if (response.success) return response.playlists;
  return [];
}

async function _addPlaylistById(playlistId, { clearSearch = false } = {}) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url });
  if (response.success && response.series && state) {
    state.series[response.series.playlistId] = response.series;
    if (clearSearch) {
      currentSearchResults = null;
      document.getElementById("searchInput").value = "";
      currentSearch = "";
      document.getElementById("searchClear").classList.add("hidden");
    }
    render();
  } else {
    showErrorToast(response?.message || t("add_failed"));
  }
}

async function onAddSeries(playlistId) {
  return _addPlaylistById(playlistId);
}

async function onSearchAddPlaylist(playlist) {
  return _addPlaylistById(playlist.playlistId, { clearSearch: true });
}

async function handleAddPlaylist() {
  const input = document.getElementById("playlistUrlInput");
  const errorEl = document.getElementById("playlistError");
  const url = input.value.trim();

  errorEl.classList.add("hidden");
  document.getElementById("addPlaylistConfirm").disabled = true;
  document.getElementById("addPlaylistConfirm").textContent = t("adding");

  try {
    if (!url) {
      throw new Error(t("enter_url"));
    }

    const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) {
      const existsResp = await sendMessage(EVENTS.PLAYLIST_EXISTS, { playlistId: listMatch[1] });
      if (existsResp.exists) {
        showErrorToast(t('playlist_already_added'));
        return;
      }
    }

    const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url });

    if (!response.success) {
      throw new Error(response.message || t("add_failed"));
    }

    state.series[response.series.playlistId] = response.series;
    modalManager.close("addPlaylistModal");
    input.value = "";
    render();
  } catch (err) {
    errorEl.textContent = err.message || t("add_failed");
    errorEl.classList.remove("hidden");
    logger.error("Add playlist error:", err);
  } finally {
    document.getElementById("addPlaylistConfirm").disabled = false;
    document.getElementById("addPlaylistConfirm").textContent = t("add_series");
  }
}

function handleBuyPro() {
  if (SUPPORT_URL) {
    window.open(SUPPORT_URL, "_blank");
  }
}

function populateSettingsForm() {
  if (!state) return;

  if (state.settings) {
    document.getElementById("themeSelect").value =
      state.settings.theme || "classic-red";
    document.getElementById("languageSelect").value =
      state.settings.language || "system";
    document.getElementById("nextEpisodeOverlayToggle").checked =
      state.settings.nextEpisodeOverlay !== false;
    document.getElementById("autoRefreshToggle").checked =
      state.settings.autoRefresh || false;
  }

  populateSyncUI();
  populateDevTools();
}

function populateDevTools() {
  if (EXTENSION_ID) {
    const tab = document.querySelector('.settings-tab[data-section="dev"]');
    const content = document.querySelector('.settings-section-content[data-section="dev"]');
    if (tab) tab.style.display = 'none';
    if (content) content.style.display = 'none';
    return;
  }
  const tab = document.querySelector('.settings-tab[data-section="dev"]');
  const content = document.querySelector('.settings-section-content[data-section="dev"]');
  if (tab) tab.style.display = '';
  if (content) content.style.display = '';

  // Load demo data button
  const demoBtn = document.getElementById("loadDemoBtn");
  if (demoBtn) {
    demoBtn.onclick = async () => {
      demoBtn.disabled = true;
      demoBtn.textContent = 'Loading...';
      try {
        const response = await sendMessage(EVENTS.LOAD_DEMO_DATA);
        if (response.success) {
          demoBtn.textContent = `Loaded ${response.count} series!`;
          setTimeout(() => { demoBtn.textContent = 'Load demo data'; demoBtn.disabled = false; }, 2000);
        } else {
          demoBtn.textContent = 'Failed';
          demoBtn.disabled = false;
        }
      } catch (_) {
        demoBtn.textContent = 'Load demo data';
        demoBtn.disabled = false;
      }
    };
  }
}

function formatSyncTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return "—";
  }
}

function populateSyncUI() {
  const section = document.getElementById("cloudSyncSection");
  const statusEl = document.getElementById("syncStatusText");
  const loginBtn = document.getElementById("syncLoginBtn");
  const logoutBtn = document.getElementById("syncLogoutBtn");
  const nowBtn = document.getElementById("syncNowBtn");
  const msgEl = document.getElementById("syncMessage");
  if (!section || !statusEl) return;

  const s = syncStatus || {};
  if (!s.configured) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  if (msgEl) msgEl.classList.add("hidden");

  if (s.loggedIn) {
    if (loginBtn) {
      loginBtn.classList.add("hidden");
      loginBtn.hidden = true;
    }
    if (logoutBtn) {
      logoutBtn.classList.remove("hidden");
      logoutBtn.hidden = false;
    }
    if (nowBtn) {
      nowBtn.classList.remove("hidden");
      nowBtn.hidden = false;
    }
    let statusLine = s.email
      ? t("sync_signed_in_as", { email: s.email })
      : t("sync_status_ok");
    if (s.syncing) statusLine = t("sync_status_syncing");
    else if (s.lastError)
      statusLine = `${t("sync_status_error")}: ${s.lastError}`;
    else if (!navigator.onLine) statusLine = t("sync_status_offline");
    if (s.lastSyncAt) {
      statusLine += ` · ${t("sync_last_sync", { time: formatSyncTime(s.lastSyncAt) })}`;
    }
    if (s.pendingChanges) statusLine += ` · ${t("sync_pending_changes", { count: s.pendingChanges })}`;
    statusEl.textContent = statusLine;
  } else {
    if (loginBtn) {
      loginBtn.classList.remove("hidden");
      loginBtn.hidden = false;
    }
    if (logoutBtn) {
      logoutBtn.classList.add("hidden");
      logoutBtn.hidden = true;
    }
    if (nowBtn) {
      nowBtn.classList.add("hidden");
      nowBtn.hidden = true;
    }
    statusEl.textContent = t("sync_status_logged_out");
  }

  const busy = !!s.syncing;
  if (loginBtn) loginBtn.disabled = busy;
  if (logoutBtn) logoutBtn.disabled = busy;
  if (nowBtn) nowBtn.disabled = busy;
}

async function handleSyncLogin() {
  const loginBtn = document.getElementById("syncLoginBtn");
  if (loginBtn) loginBtn.disabled = true;
  try {
    let response = await sendMessage(EVENTS.SYNC_LOGIN);
    if (!response.success && response.error === 'ACCOUNT_CHANGED') {
      const confirmed = await modalManager.confirm(response.message || 'Use this Google account for the local library?');
      if (confirmed) response = await sendMessage(EVENTS.SYNC_LOGIN, { allowAccountChange: true });
    }
    if (response.syncStatus) syncStatus = response.syncStatus;
    if (response.success) {
      await loadState();
      populateSyncUI();
    } else {
      const msgEl = document.getElementById("syncMessage");
      if (msgEl) {
        msgEl.textContent = response.message || t("sync_login_failed");
        msgEl.style.color = "var(--primary)";
        msgEl.classList.remove("hidden");
      }
    }
  } finally {
    populateSyncUI();
  }
}

async function handleSyncLogout() {
  const response = await sendMessage(EVENTS.SYNC_LOGOUT);
  if (response.syncStatus) syncStatus = response.syncStatus;
  populateSyncUI();
}

async function handleSyncNow() {
  const nowBtn = document.getElementById("syncNowBtn");
  if (nowBtn) nowBtn.disabled = true;
  try {
    const response = await sendMessage(EVENTS.SYNC_NOW);
    if (response.syncStatus) syncStatus = response.syncStatus;
    if (response.success) {
      await loadState();
    } else {
      const msgEl = document.getElementById("syncMessage");
      if (msgEl) {
        msgEl.textContent = response.message || t("sync_status_error");
        msgEl.style.color = "var(--primary)";
        msgEl.classList.remove("hidden");
      }
    }
  } finally {
    populateSyncUI();
  }
}

async function handleThemeChange(e) {
  if (!state) return;
  const theme = e.target.value;
  state.settings.theme = theme;
  applyTheme();
  updateToolbarIcon();
  await sendMessage(EVENTS.SETTINGS_UPDATE, { theme });
}

async function handleLanguageChange(e) {
  if (!state) return;
  const lang = e.target.value;
  state.settings.language = lang;
  applyLanguageFromSettings();
  await sendMessage(EVENTS.SETTINGS_UPDATE, { language: lang });
  translateUI();
  populateSyncUI();
  render();
}

function applyTheme() {
  const themeName = state?.settings?.theme || "classic-red";
  const colors = THEME_COLORS[themeName] || THEME_COLORS["classic-red"];
  const root = document.documentElement;
  const isDark = themeName !== "light";

  // Header logo icon switches based on theme
  const logoIcon = document.querySelector(".header-logo-icon");
  if (logoIcon) {
    logoIcon.src = isDark ? "../../icons/icon_full_128.png" : "../../icons/icon_full_128_light.png";
  }

  root.style.setProperty("--bg", colors.bg);
  root.style.setProperty("--surface", colors.surface);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--primary-rgb", colors.primaryRgb);
  root.style.setProperty("--primary-hover", colors.primaryHover);
  root.style.setProperty("--text", colors.text);
  root.style.setProperty("--text-muted", colors.textMuted);
  root.style.setProperty("--card-bg", colors.cardBg);
  root.style.setProperty("--card-hover", colors.cardHover);
  root.style.setProperty("--border", colors.border);
  root.style.setProperty("--modal-bg", colors.modalBg);
  root.style.setProperty("--danger", colors.danger);
  root.style.setProperty("--success", colors.success);
  root.style.setProperty("--warning", colors.warning);
  root.style.setProperty("--border-light", colors.borderLight);
  root.style.setProperty("--hover-overlay", isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)");
  root.style.setProperty("--hover-overlay-strong", isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)");
  root.style.setProperty("--input-bg", isDark ? "rgba(0,0,0,0.3)" : colors.surface);
  root.style.setProperty("--card-shadow", isDark ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.06)");
  root.style.setProperty("--card-elevated", isDark ? "0 8px 30px rgba(0,0,0,0.5)" : "0 8px 30px rgba(0,0,0,0.12)");
  root.style.setProperty("--shadow-card", isDark ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.06)");
  root.style.setProperty("--shadow-elevated", isDark ? "0 8px 30px rgba(0,0,0,0.5)" : "0 8px 30px rgba(0,0,0,0.12)");
  root.style.setProperty("--modal-close-bg", isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)");
  root.style.setProperty("--modal-close-border", isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)");
  root.style.setProperty("--modal-close-hover-bg", isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)");
  root.style.setProperty("--text-on-primary", "#fff");

  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement("meta");
    metaTheme.name = "theme-color";
    document.head.appendChild(metaTheme);
  }
  metaTheme.content = colors.bg;
}

function showLoading(visible) {
  const loading = document.getElementById("loadingScreen");
  if (loading) loading.classList.toggle("hidden", !visible);
}

function showError(message) {
  const main = document.getElementById("mainContent");
  main.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-state-icon";
  icon.textContent = "\u26A0\uFE0F";

  const h2 = document.createElement("h2");
  h2.className = "empty-state-title";
  h2.textContent = t("something_wrong");

  const p = document.createElement("p");
  p.className = "empty-state-desc";
  p.textContent = message;

  empty.appendChild(icon);
  empty.appendChild(h2);
  empty.appendChild(p);
  main.appendChild(empty);
}

function showErrorToast(message, actionLabel, actionFn) {
  const existing = document.querySelector(".toast-error");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-error";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    background: "var(--primary)",
    color: "#fff",
    borderRadius: "8px",
    fontSize: "14px",
    zIndex: "300",
    animation: "fadeIn 0.2s ease",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    maxWidth: "480px",
  });

  const msgSpan = document.createElement("span");
  msgSpan.textContent = message;
  msgSpan.style.flex = "1";
  toast.appendChild(msgSpan);

  if (actionLabel && actionFn) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    Object.assign(btn.style, {
      padding: "6px 14px",
      background: "#fff",
      color: "var(--primary)",
      border: "none",
      borderRadius: "16px",
      fontSize: "12px",
      fontWeight: "700",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toast.remove();
      actionFn();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 5000);
}

function showSuccessToast(message) {
  const existing = document.querySelector(".toast-success");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-success";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    background: "var(--success)",
    color: "#fff",
    borderRadius: "8px",
    fontSize: "14px",
    zIndex: "300",
    animation: "fadeIn 0.2s ease",
    maxWidth: "480px",
  });
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
