const SETTINGS = {
  cityName: "Mersin Merkez",
  apiCity: "Mersin",
  apiCountry: "Turkey",

  /*
    AlAdhan method 13:
    Diyanet İşleri Başkanlığı, Turkey
  */
  method: 13,

  warningMinutes: 10
};

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

const el = {
  cityName: document.getElementById("cityName"),
  todayText: document.getElementById("todayText"),
  clockText: document.getElementById("clockText"),
  nextPrayerName: document.getElementById("nextPrayerName"),
  nextPrayerTime: document.getElementById("nextPrayerTime"),
  countdownText: document.getElementById("countdownText"),
  statusText: document.getElementById("statusText"),

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

function timeToDate(time, addDay = false) {
  const now = new Date();
  const [hour, minute] = time.split(":").map(Number);

  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0
  );

  if (addDay) {
    date.setDate(date.getDate() + 1);
  }

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

    if (date > now) {
      return {
        ...prayer,
        time,
        date
      };
    }
  }

  const firstPrayer = PRAYERS[0];
  const firstTime = cleanTime(prayerTimes[firstPrayer.key]);

  return {
    ...firstPrayer,
    time: firstTime,
    date: timeToDate(firstTime, true)
  };
}

function renderTimes() {
  el.timeFajr.textContent = cleanTime(prayerTimes.Fajr);
  el.timeSunrise.textContent = cleanTime(prayerTimes.Sunrise);
  el.timeDhuhr.textContent = cleanTime(prayerTimes.Dhuhr);
  el.timeAsr.textContent = cleanTime(prayerTimes.Asr);
  el.timeMaghrib.textContent = cleanTime(prayerTimes.Maghrib);
  el.timeIsha.textContent = cleanTime(prayerTimes.Isha);
}

function updateScreen() {
  const now = new Date();

  el.clockText.textContent = formatClock(now);
  el.todayText.textContent = getTurkishDate(now);

  if (!Object.keys(prayerTimes).length) return;

  nextPrayer = findNextPrayer();

  const diff = nextPrayer.date - now;
  const diffMinutes = diff / 1000 / 60;

  el.nextPrayerName.textContent = nextPrayer.name;
  el.nextPrayerTime.textContent = nextPrayer.time;
  el.countdownText.textContent = formatCountdown(diff);

  setActiveCard(nextPrayer.key);

  if (diffMinutes <= SETTINGS.warningMinutes) {
    document.body.classList.add("warning");
    el.statusText.textContent = "Son 10 dakika: dikkat modu aktif.";
  } else {
    document.body.classList.remove("warning");
    el.statusText.textContent = "Vakitler güncel.";
  }

  if (diff <= 0) {
    loadPrayerTimes();
  }
}

async function loadPrayerTimes() {
  try {
    el.statusText.textContent = "Vakitler yükleniyor...";

    const url =
      `https://api.aladhan.com/v1/timingsByCity` +
      `?city=${encodeURIComponent(SETTINGS.apiCity)}` +
      `&country=${encodeURIComponent(SETTINGS.apiCountry)}` +
      `&method=${SETTINGS.method}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("API yanıt vermedi.");
    }

    const result = await response.json();

    prayerTimes = result.data.timings;

    renderTimes();
    updateScreen();

    el.statusText.textContent = "Vakitler güncel.";
  } catch (error) {
    console.error(error);

    el.statusText.textContent = "Vakitler alınamadı. İnternet veya API bağlantısını kontrol et.";

    /*
      API çalışmazsa ekran boş kalmasın diye yedek örnek değerler.
      İstersen bunları silebilirsin.
    */
    prayerTimes = {
      Fajr: "03:30",
      Sunrise: "05:15",
      Dhuhr: "12:47",
      Asr: "17:52",
      Maghrib: "20:09",
      Isha: "21:46"
    };

    renderTimes();
    updateScreen();
  }
}

function init() {
  el.cityName.textContent = SETTINGS.cityName;

  loadPrayerTimes();

  setInterval(updateScreen, 1000);

  /*
    Gün değişimlerinde vakitleri tazelemek için.
  */
  setInterval(loadPrayerTimes, 1000 * 60 * 30);
}

init();
