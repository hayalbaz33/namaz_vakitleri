const CONFIG = {
  city: "Mersin",
  country: "Turkey",
  method: 13, // AlAdhan: Diyanet İşleri Başkanlığı, Turkey
  school: 1,
  warningMinutes: 10,
  includeSunriseInCountdown: false,
  refreshApiMinutes: 60,
};

const PRAYERS = [
  { key: "Fajr", label: "İmsak", isPrayer: true },
  { key: "Sunrise", label: "Güneş", isPrayer: false },
  { key: "Dhuhr", label: "Öğle", isPrayer: true },
  { key: "Asr", label: "İkindi", isPrayer: true },
  { key: "Maghrib", label: "Akşam", isPrayer: true },
  { key: "Isha", label: "Yatsı", isPrayer: true },
];

const els = {
  location: document.getElementById("locationLabel"),
  today: document.getElementById("todayLabel"),
  clock: document.getElementById("clockLabel"),
  nextPrayer: document.getElementById("nextPrayerLabel"),
  countdown: document.getElementById("countdownLabel"),
  targetTime: document.getElementById("targetTimeLabel"),
  warning: document.getElementById("warningLabel"),
  source: document.getElementById("sourceLabel"),
  status: document.getElementById("statusLabel"),
  grid: document.getElementById("timesGrid"),
};

const state = {
  todayDateKey: "",
  todayTimings: null,
  tomorrowTimings: null,
  lastFetchAt: 0,
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toApiDate(date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function cleanTime(raw) {
  const match = String(raw || "").match(/\d{1,2}:\d{2}/);
  return match ? match[0] : "--:--";
}

function dateFromTime(baseDate, time) {
  const [hour, minute] = cleanTime(time).split(":").map(Number);
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, 0, 0);
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

function apiUrlFor(date) {
  const params = new URLSearchParams({
    city: CONFIG.city,
    country: CONFIG.country,
    method: String(CONFIG.method),
    school: String(CONFIG.school),
  });

  return `https://api.aladhan.com/v1/timingsByCity/${toApiDate(date)}?${params.toString()}`;
}

function cacheKey(date) {
  return `namaz-tv:${CONFIG.city}:${CONFIG.country}:${toDateKey(date)}`;
}

function readCache(date) {
  try {
    const raw = localStorage.getItem(cacheKey(date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(date, value) {
  try {
    localStorage.setItem(cacheKey(date), JSON.stringify(value));
  } catch {
    // localStorage kapalıysa sessiz geç.
  }
}

async function fetchTimings(date) {
  const cached = readCache(date);
  const cacheDate = toDateKey(date);

  try {
    const response = await fetch(apiUrlFor(date), { cache: "no-store" });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);

    const json = await response.json();
    const timings = json?.data?.timings;
    if (!timings) throw new Error("API vakit bilgisi döndürmedi");

    const normalized = {};
    PRAYERS.forEach((item) => {
      normalized[item.key] = cleanTime(timings[item.key]);
    });

    const result = {
      dateKey: cacheDate,
      timings: normalized,
      readableDate: json?.data?.date?.readable || cacheDate,
      source: json?.data?.meta?.method?.name || "AlAdhan",
      fetchedAt: Date.now(),
    };

    writeCache(date, result);
    return result;
  } catch (error) {
    if (cached?.timings) {
      els.status.textContent = "API bağlantısı kurulamadı; kayıtlı son vakitler gösteriliyor.";
      return cached;
    }
    throw error;
  }
}

function shouldRefresh(now) {
  const dateChanged = toDateKey(now) !== state.todayDateKey;
  const tooOld = Date.now() - state.lastFetchAt > CONFIG.refreshApiMinutes * 60 * 1000;
  return dateChanged || tooOld || !state.todayTimings || !state.tomorrowTimings;
}

async function loadPrayerTimes(force = false) {
  const now = new Date();
  if (!force && !shouldRefresh(now)) return;

  els.status.textContent = "Vakitler güncelleniyor…";

  const today = await fetchTimings(now);
  const tomorrow = await fetchTimings(addDays(now, 1));

  state.todayDateKey = toDateKey(now);
  state.todayTimings = today.timings;
  state.tomorrowTimings = tomorrow.timings;
  state.lastFetchAt = Date.now();

  els.location.textContent = `${CONFIG.city} Merkez`;
  els.source.textContent = `${today.source}`;
  els.status.textContent = "Vakitler güncel.";

  renderCards();
}

function countdownTargets() {
  return PRAYERS.filter((item) => item.isPrayer || CONFIG.includeSunriseInCountdown);
}

function getTodayEvents(baseDate) {
  if (!state.todayTimings) return [];
  return countdownTargets().map((item) => ({
    ...item,
    time: state.todayTimings[item.key],
    date: dateFromTime(baseDate, state.todayTimings[item.key]),
  }));
}

function getTomorrowEvents(baseDate) {
  if (!state.tomorrowTimings) return [];
  const tomorrow = addDays(baseDate, 1);
  return countdownTargets().map((item) => ({
    ...item,
    time: state.tomorrowTimings[item.key],
    date: dateFromTime(tomorrow, state.tomorrowTimings[item.key]),
  }));
}

function getNextEvent(now) {
  const events = [...getTodayEvents(now), ...getTomorrowEvents(now)];
  return events.find((event) => event.date.getTime() > now.getTime()) || null;
}

function getPreviousEvent(now) {
  const yesterday = addDays(now, -1);
  const previousDayEvents = state.todayTimings
    ? countdownTargets().map((item) => ({
        ...item,
        time: state.todayTimings[item.key],
        date: dateFromTime(yesterday, state.todayTimings[item.key]),
      }))
    : [];

  const events = [...previousDayEvents, ...getTodayEvents(now)];
  return events.reverse().find((event) => event.date.getTime() <= now.getTime()) || null;
}

function renderCards(activeKey = "") {
  if (!state.todayTimings) return;

  els.grid.innerHTML = PRAYERS.map((item) => {
    const activeClass = item.key === activeKey ? " active" : "";
    return `
      <article class="timeCard${activeClass}" data-key="${item.key}">
        <span>${item.label}</span>
        <strong>${state.todayTimings[item.key] || "--:--"}</strong>
      </article>
    `;
  }).join("");
}

function updateDateAndClock(now) {
  els.clock.textContent = formatClock(now);
  els.today.textContent = now.toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function updateCountdown() {
  const now = new Date();
  updateDateAndClock(now);

  if (!state.todayTimings || !state.tomorrowTimings) return;

  const next = getNextEvent(now);
  if (!next) return;

  const remainingMs = next.date.getTime() - now.getTime();
  const warningMs = CONFIG.warningMinutes * 60 * 1000;

  els.nextPrayer.textContent = next.label;
  els.countdown.textContent = formatCountdown(remainingMs);
  els.targetTime.textContent = `Vakit: ${next.time}`;

  const isWarning = remainingMs > 0 && remainingMs <= warningMs;
  document.body.classList.toggle("warning", isWarning);
  els.warning.textContent = isWarning
    ? `${next.label} vaktine son ${CONFIG.warningMinutes} dakika.`
    : `Son ${CONFIG.warningMinutes} dakikada ekran dikkat moduna geçer.`;

  const previous = getPreviousEvent(now);
  if (previous) {
    const total = next.date.getTime() - previous.date.getTime();
    const passed = now.getTime() - previous.date.getTime();
    const progress = Math.min(1, Math.max(0, passed / total));
    document.documentElement.style.setProperty("--progress", `${progress * 360}deg`);
  }

  document.querySelectorAll(".timeCard").forEach((card) => {
    card.classList.toggle("active", card.dataset.key === next.key);
  });
}

async function boot() {
  renderCards();
  updateDateAndClock(new Date());

  try {
    await loadPrayerTimes(true);
  } catch (error) {
    els.status.textContent = "Vakitler alınamadı. İnternet bağlantısını veya API erişimini kontrol et.";
    console.error(error);
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
  setInterval(() => loadPrayerTimes(false).catch(console.error), 60 * 1000);
}

boot();
