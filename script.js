const SETTINGS = {
  cityName: "Konum belirleniyor...",
  method: 13,
  school: 1,
  warningMinutes: 5,
  soundEnabled: true
};

const DEFAULT_LOCATION = {
  label: "Mersin Merkez",
  latitude: 36.8121,
  longitude: 34.6415
};

const LOCATION_STORAGE_KEY = "namazTvLocation";

const PRAYERS = [
  { key: "Fajr", label: "İMSAK", name: "İMSAK" },
  { key: "Sunrise", label: "GÜNEŞ", name: "GÜNEŞ" },
  { key: "Dhuhr", label: "ÖĞLE", name: "ÖĞLE" },
  { key: "Asr", label: "İKİNDİ", name: "İKİNDİ" },
  { key: "Maghrib", label: "AKŞAM", name: "AKŞAM" },
  { key: "Isha", label: "YATSI", name: "YATSI" }
];

let prayerTimes = {};
let nextPrayer = null;
let currentLocation = null;
let currentTimingsDateKey = null;
let audioUnlocked = false;
let lastBeepKey = null;
let activeWarningVideoKey = null;
let impactVideoEndedHandlerAdded = false;
let wakeLockSentinel = null;

const el = {
  cityName: document.getElementById("cityName"),
  todayText: document.getElementById("todayText"),
  clockText: document.getElementById("clockText"),
  nextPrayerName: document.getElementById("nextPrayerName"),
  countdownText: document.getElementById("countdownText"),
  statusText: document.getElementById("statusText"),
  warningSound: document.getElementById("warningSound"),
  warningVideoLayer: document.getElementById("warningVideoLayer"),
  impactVideo: document.getElementById("impactVideo"),
  loopVideo: document.getElementById("loopVideo"),
  appScreen: document.getElementById("appScreen"),
  presentationModeButton: document.getElementById("presentationModeButton"),
  presentationExitButton: document.getElementById("presentationExitButton"),
  locationButton: document.getElementById("locationButton"),
  locationModal: document.getElementById("locationModal"),
  locationCloseButton: document.getElementById("locationCloseButton"),
  locationSearchInput: document.getElementById("locationSearchInput"),
  manualLocationButton: document.getElementById("manualLocationButton"),
  useBrowserLocationButton: document.getElementById("useBrowserLocationButton"),

  timeFajr: document.getElementById("timeFajr"),
  timeSunrise: document.getElementById("timeSunrise"),
  timeDhuhr: document.getElementById("timeDhuhr"),
  timeAsr: document.getElementById("timeAsr"),
  timeMaghrib: document.getElementById("timeMaghrib"),
  timeIsha: document.getElementById("timeIsha")
};

function pad(num) {
  return String(num).padStart(2, "0");
}

function cleanTime(value) {
  return String(value || "--:--").split(" ")[0];
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function getTurkishDate(date) {
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long"
  });
}

function getApiDate(date = new Date()) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function timeToDate(time, addDay = false) {
  const now = new Date();
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  if (addDay) date.setDate(date.getDate() + 1);
  return date;
}

function setActiveCard(key) {
  document.querySelectorAll(".timeCard").forEach(card => {
    card.classList.toggle("active", card.dataset.prayer === key);
  });
}

function findNextPrayer() {
  const now = new Date();
  for (const prayer of PRAYERS) {
    const time = cleanTime(prayerTimes[prayer.key]);
    const date = timeToDate(time);
    if (date > now) return { ...prayer, time, date };
  }
  const firstPrayer = PRAYERS[0];
  const firstTime = cleanTime(prayerTimes[firstPrayer.key]);
  return { ...firstPrayer, time: firstTime, date: timeToDate(firstTime, true) };
}

function renderTimes() {
  el.timeFajr.textContent = cleanTime(prayerTimes.Fajr);
  el.timeSunrise.textContent = cleanTime(prayerTimes.Sunrise);
  el.timeDhuhr.textContent = cleanTime(prayerTimes.Dhuhr);
  el.timeAsr.textContent = cleanTime(prayerTimes.Asr);
  el.timeMaghrib.textContent = cleanTime(prayerTimes.Maghrib);
  el.timeIsha.textContent = cleanTime(prayerTimes.Isha);
}

function getSavedLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const location = JSON.parse(raw);
    if (!location || !location.label) return null;
    return location;
  } catch (error) {
    console.warn("Kayıtlı konum okunamadı:", error);
    return null;
  }
}

function saveLocation(location) {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.label,
      savedAt: Date.now()
    }));
  } catch (error) {
    console.warn("Konum kaydedilemedi:", error);
  }
}

function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tarayıcı konum desteği yok."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 1000 * 60 * 60 * 6
    });
  });
}

function normalizeName(value) {
  return String(value || "").trim();
}

function uniquePush(list, value) {
  const clean = normalizeName(value);
  if (!clean) return;
  if (!list.some(item => item.toLocaleLowerCase("tr-TR") === clean.toLocaleLowerCase("tr-TR"))) {
    list.push(clean);
  }
}

function formatLocationLabel(data, fallback = DEFAULT_LOCATION.label) {
  const province = normalizeName(data.principalSubdivision || data.city || data.localityInfo?.administrative?.[0]?.name);
  const candidates = [];

  uniquePush(candidates, data.locality);
  uniquePush(candidates, data.city);

  (data.localityInfo?.informative || []).forEach(item => {
    if (["city", "town", "village", "suburb", "neighbourhood", "locality"].includes(item.description)) {
      uniquePush(candidates, item.name);
    }
  });

  const specific = candidates.find(name => province && name.toLocaleLowerCase("tr-TR") !== province.toLocaleLowerCase("tr-TR"));

  if (province && specific) return `${province} ${specific}`;
  if (province) return province;
  return normalizeName(data.locality || data.city) || fallback;
}

async function reverseGeocode(latitude, longitude) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=tr`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Reverse geocoding yanıt vermedi.");
  const data = await response.json();
  return formatLocationLabel(data);
}

async function geocodeManualLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=tr&q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Manuel konum araması yanıt vermedi.");
  const result = await response.json();
  const first = result[0];
  if (!first) throw new Error("Konum bulunamadı.");

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  let label = query.trim();

  try {
    label = await reverseGeocode(latitude, longitude);
  } catch (error) {
    console.warn("Manuel konum etiketi reverse geocode ile bulunamadı:", error);
  }

  return { latitude, longitude, label };
}

async function loadPrayerTimesByCoordinates(latitude, longitude, date = new Date()) {
  const url =
    `https://api.aladhan.com/v1/timings/${getApiDate(date)}` +
    `?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&method=${SETTINGS.method}` +
    `&school=${SETTINGS.school}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Koordinata göre vakit API yanıt vermedi.");
  const result = await response.json();
  prayerTimes = result.data.timings;
  currentTimingsDateKey = getDateKey(date);
}

async function loadPrayerTimesByCity(city) {
  const url =
    `https://api.aladhan.com/v1/timingsByCity` +
    `?city=${encodeURIComponent(city)}` +
    `&country=Turkey` +
    `&method=${SETTINGS.method}` +
    `&school=${SETTINGS.school}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Şehre göre vakit API yanıt vermedi.");
  const result = await response.json();
  prayerTimes = result.data.timings;
  currentTimingsDateKey = getDateKey();
}

async function applyLocation(location, options = {}) {
  currentLocation = location;
  el.cityName.textContent = location.label || "Konum belirleniyor...";
  el.statusText.textContent = "Vakitler yükleniyor...";

  if (options.save) saveLocation(location);

  try {
    if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      await loadPrayerTimesByCoordinates(location.latitude, location.longitude);
    } else {
      await loadPrayerTimesByCity(location.label);
    }

    renderTimes();
    updateScreen();
    el.statusText.textContent = audioUnlocked ? "Vakitler güncel." : "Ses için ekrana bir kere dokunun.";
  } catch (error) {
    console.error("Vakitler alınamadı:", error);
    el.statusText.textContent = "Vakitler alınamadı. Varsayılan konum deneniyor.";

    if (location !== DEFAULT_LOCATION) {
      await applyLocation(DEFAULT_LOCATION, { save: false });
    }
  }
}

function openLocationModal() {
  el.locationModal?.classList.add("active");
  el.locationModal?.setAttribute("aria-hidden", "false");
  setTimeout(() => el.locationSearchInput?.focus(), 50);
}

function closeLocationModal() {
  el.locationModal?.classList.remove("active");
  el.locationModal?.setAttribute("aria-hidden", "true");
}

async function useBrowserLocation(options = {}) {
  el.cityName.textContent = "Konum belirleniyor...";
  try {
    const position = await requestBrowserLocation();
    const { latitude, longitude } = position.coords;
    let label = DEFAULT_LOCATION.label;

    try {
      label = await reverseGeocode(latitude, longitude);
    } catch (error) {
      console.warn("Konum adı bulunamadı:", error);
    }

    await applyLocation({ latitude, longitude, label }, { save: true });
    closeLocationModal();
  } catch (error) {
    console.warn("Konum izni alınamadı:", error);
    el.statusText.textContent = "Konum izni verilmedi. Şehir seçebilirsiniz.";
    openLocationModal();

    if (options.fallbackToDefault) {
      await applyLocation(DEFAULT_LOCATION, { save: false });
    }
  }
}

async function useManualLocation() {
  const query = el.locationSearchInput?.value.trim();
  if (!query) return;

  el.statusText.textContent = "Konum aranıyor...";

  try {
    const location = await geocodeManualLocation(query);
    await applyLocation(location, { save: true });
    closeLocationModal();
  } catch (error) {
    console.warn("Koordinatlı manuel konum bulunamadı, şehir fallback deneniyor:", error);
    await applyLocation({ label: query }, { save: true });
    closeLocationModal();
  }
}

function unlockAudio() {
  if (!SETTINGS.soundEnabled || audioUnlocked || !el.warningSound) return;

  el.warningSound.muted = true;
  el.warningSound.play()
    .then(() => {
      el.warningSound.pause();
      el.warningSound.currentTime = 0;
      el.warningSound.muted = false;
      audioUnlocked = true;
      el.statusText.textContent = "Ses aktif. Vakitler güncel.";
      updateScreen();
    })
    .catch(error => {
      el.warningSound.muted = false;
      console.warn("Ses başlatılamadı:", error);
      el.statusText.textContent = "Ses için ekrana bir kere dokunun.";
    });
}

function playShortBeep() {
  if (!SETTINGS.soundEnabled || !audioUnlocked || !el.warningSound) return false;

  el.warningSound.currentTime = 0;
  el.warningSound.play().catch(error => {
    console.warn("Uyarı sesi çalınamadı:", error);
    lastBeepKey = null;
    el.statusText.textContent = "Ses için ekrana bir kere dokunun.";
  });

  return true;
}

function stopAlertSound() {
  if (!el.warningSound) return;
  el.warningSound.pause();
  el.warningSound.currentTime = 0;
}

function getBeepKey(prayer) {
  return `${getDateKey()}-${prayer.key}-${prayer.time}`;
}

function getWarningVideoKey(prayer) {
  return `${getDateKey()}-${prayer.key}-${prayer.time}`;
}

function safePlayVideo(video) {
  if (!video) return;
  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch(error => console.warn("Video autoplay engellendi:", error));
  }
}

function stopVideo(video) {
  if (!video) return;
  video.pause();
  try {
    video.currentTime = 0;
  } catch (error) {
    console.warn("Video sıfırlanamadı:", error);
  }
}

function startWarningVideoSequence(prayer) {
  if (!el.warningVideoLayer || !el.impactVideo || !el.loopVideo) return;
  const videoKey = getWarningVideoKey(prayer);
  if (activeWarningVideoKey === videoKey) return;

  activeWarningVideoKey = videoKey;
  el.warningVideoLayer.classList.add("active", "impact-playing");
  el.warningVideoLayer.classList.remove("loop-playing");

  stopVideo(el.loopVideo);
  stopVideo(el.impactVideo);

  el.impactVideo.muted = true;
  el.loopVideo.muted = true;
  el.impactVideo.playsInline = true;
  el.loopVideo.playsInline = true;
  safePlayVideo(el.impactVideo);

  if (!impactVideoEndedHandlerAdded) {
    el.impactVideo.addEventListener("ended", () => {
      if (!document.body.classList.contains("warning")) return;
      el.warningVideoLayer.classList.remove("impact-playing");
      el.warningVideoLayer.classList.add("loop-playing");
      stopVideo(el.impactVideo);
      el.loopVideo.muted = true;
      el.loopVideo.loop = true;
      safePlayVideo(el.loopVideo);
    });
    impactVideoEndedHandlerAdded = true;
  }
}

function stopWarningVideos() {
  if (!el.warningVideoLayer || !el.impactVideo || !el.loopVideo) return;
  el.warningVideoLayer.classList.remove("active", "impact-playing", "loop-playing");
  stopVideo(el.impactVideo);
  stopVideo(el.loopVideo);
  activeWarningVideoKey = null;
}

function updateScreen() {
  const now = new Date();
  el.clockText.textContent = formatClock(now);
  el.todayText.textContent = getTurkishDate(now);

  if (window.PRAYER_TEST_MODE?.active) return;
  if (!Object.keys(prayerTimes).length) return;

  nextPrayer = findNextPrayer();
  const diff = nextPrayer.date - now;
  const diffMinutes = diff / 1000 / 60;

  el.nextPrayerName.textContent = nextPrayer.name;
  el.countdownText.textContent = formatCountdown(diff);
  setActiveCard(nextPrayer.key);

  if (diffMinutes <= SETTINGS.warningMinutes && diff > 0) {
    document.body.classList.add("warning");
    startWarningVideoSequence(nextPrayer);

    const beepKey = getBeepKey(nextPrayer);
    if (lastBeepKey !== beepKey) {
      const played = playShortBeep();
      if (played) {
        lastBeepKey = beepKey;
      } else {
        el.statusText.textContent = "Ses için ekrana bir kere dokunun.";
        return;
      }
    }

    el.statusText.textContent = `Son ${SETTINGS.warningMinutes} dakika: dikkat modu aktif.`;
  } else {
    document.body.classList.remove("warning");
    stopWarningVideos();
    stopAlertSound();
    el.statusText.textContent = audioUnlocked ? "Vakitler güncel." : "Ses için ekrana bir kere dokunun.";
  }
}

async function refreshPrayerTimesIfNeeded(force = false) {
  if (!currentLocation) return;
  const today = getDateKey();
  if (!force && currentTimingsDateKey === today) return;
  await applyLocation(currentLocation, { save: false });
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function requestElementFullscreen(element) {
  if (!element) return Promise.reject(new Error("Sunum alanı bulunamadı."));
  const request = element.requestFullscreen || element.webkitRequestFullscreen || element.msRequestFullscreen;
  if (!request) return Promise.reject(new Error("Fullscreen API desteklenmiyor."));
  const result = request.call(element);
  return result instanceof Promise ? result : Promise.resolve();
}

function exitElementFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (!exit || !getFullscreenElement()) return Promise.resolve();
  const result = exit.call(document);
  return result instanceof Promise ? result : Promise.resolve();
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch (error) {
    console.warn("Wake Lock alınamadı:", error);
  }
}

async function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  try {
    await wakeLockSentinel.release();
  } catch (error) {
    console.warn("Wake Lock bırakılamadı:", error);
  } finally {
    wakeLockSentinel = null;
  }
}

function updatePresentationStageScale() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty("--tv-stage-scale", String(scale));
}

function resetPresentationStageScale() {
  document.documentElement.style.removeProperty("--tv-stage-scale");
}

function setPresentationMode(active) {
  document.body.classList.toggle("presentation-mode", active);
  if (active) updatePresentationStageScale();
  else resetPresentationStageScale();
  if (el.presentationModeButton) {
    el.presentationModeButton.textContent = active ? "Sunum Modu Aktif" : "TV / Sunum Modu";
  }
}

async function enterPresentationMode() {
  setPresentationMode(true);
  try {
    await requestElementFullscreen(el.appScreen || document.documentElement);
  } catch (error) {
    console.warn("Fullscreen açılamadı:", error);
  }
  await requestWakeLock();
}

async function exitPresentationMode() {
  setPresentationMode(false);
  await releaseWakeLock();
  try {
    await exitElementFullscreen();
  } catch (error) {
    console.warn("Fullscreen kapatılamadı:", error);
  }
}

function togglePresentationMode() {
  if (document.body.classList.contains("presentation-mode") || getFullscreenElement()) exitPresentationMode();
  else enterPresentationMode();
}

function syncPresentationMode() {
  const active = Boolean(getFullscreenElement());
  if (!active && document.body.classList.contains("presentation-mode")) {
    setPresentationMode(false);
    releaseWakeLock();
  }
}

async function initLocation() {
  el.cityName.textContent = "Konum belirleniyor...";
  const savedLocation = getSavedLocation();
  if (savedLocation) {
    await applyLocation(savedLocation, { save: false });
    return;
  }
  await useBrowserLocation({ fallbackToDefault: true });
}

function bindEvents() {
  document.addEventListener("click", unlockAudio, { once: true });
  document.addEventListener("touchstart", unlockAudio, { once: true });
  document.addEventListener("pointerdown", unlockAudio, { once: true });

  el.locationButton?.addEventListener("click", openLocationModal);
  el.locationCloseButton?.addEventListener("click", closeLocationModal);
  el.manualLocationButton?.addEventListener("click", useManualLocation);
  el.useBrowserLocationButton?.addEventListener("click", () => useBrowserLocation({ fallbackToDefault: false }));
  el.locationSearchInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") useManualLocation();
  });

  el.presentationModeButton?.addEventListener("click", togglePresentationMode);
  el.presentationExitButton?.addEventListener("click", exitPresentationMode);

  document.addEventListener("fullscreenchange", syncPresentationMode);
  document.addEventListener("webkitfullscreenchange", syncPresentationMode);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && document.body.classList.contains("presentation-mode")) {
      requestWakeLock();
      updatePresentationStageScale();
    }
  });

  window.addEventListener("resize", updatePresentationStageScale);
  window.addEventListener("orientationchange", updatePresentationStageScale);
}

async function init() {
  bindEvents();
  await initLocation();
  setInterval(updateScreen, 1000);
  setInterval(() => refreshPrayerTimesIfNeeded(true), 1000 * 60 * 30);
  setInterval(() => refreshPrayerTimesIfNeeded(false), 1000 * 60 * 5);
}

init();
