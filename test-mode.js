(function () {
  const TEST_TOTAL_SECONDS = 5 * 60 + 30;
  const TEST_WARNING_SECONDS = SETTINGS.warningMinutes * 60;
  const TEST_ALERT_KEY = "test-warning-alert";

  const button = document.getElementById("testModeButton");
  let timerId = null;
  let remainingSeconds = TEST_TOTAL_SECONDS;

  window.PRAYER_TEST_MODE = window.PRAYER_TEST_MODE || { active: false };

  function renderTestCountdown() {
    el.nextPrayerName.textContent = "TEST";
    el.countdownText.textContent = formatCountdown(remainingSeconds * 1000);

    if (remainingSeconds > TEST_WARNING_SECONDS) {
      el.statusText.textContent =
        `Test modu: alarm ${formatCountdown((remainingSeconds - TEST_WARNING_SECONDS) * 1000)} sonra başlayacak.`;
    } else {
      el.statusText.textContent =
        `Test modu: alarm aktif. Ses bitince ${SETTINGS.alertRepeatSeconds} saniye sonra tekrar çalacak.`;
    }
  }

  function startWarningTest() {
    document.body.classList.add("warning");

    if (lastAlertKey === TEST_ALERT_KEY) return;

    stopAlertSound();
    lastAlertKey = TEST_ALERT_KEY;

    const played = playAlertSound(TEST_ALERT_KEY);

    if (!played) {
      lastAlertKey = null;
      el.statusText.textContent = "Test modu: ses için ekrana bir kere tıklayın.";
    }
  }

  function tickTestCountdown() {
    remainingSeconds -= 1;

    if (remainingSeconds <= 0) {
      stopTestMode();
      return;
    }

    if (remainingSeconds <= TEST_WARNING_SECONDS) {
      startWarningTest();
    }

    renderTestCountdown();
  }

  function startTestMode() {
    window.PRAYER_TEST_MODE.active = true;
    remainingSeconds = TEST_TOTAL_SECONDS;

    clearInterval(timerId);
    stopAlertSound();
    document.body.classList.remove("warning");

    button.classList.add("active");
    button.textContent = "Testi Durdur";

    renderTestCountdown();
    timerId = setInterval(tickTestCountdown, 1000);
  }

  function stopTestMode() {
    clearInterval(timerId);
    timerId = null;

    window.PRAYER_TEST_MODE.active = false;
    stopAlertSound();
    document.body.classList.remove("warning");

    button.classList.remove("active");
    button.textContent = "Test 05:30";

    updateScreen();
  }

  if (button) {
    button.addEventListener("click", () => {
      if (window.PRAYER_TEST_MODE.active) {
        stopTestMode();
      } else {
        startTestMode();
      }
    });
  }
})();