(function () {
  const TEST_TOTAL_SECONDS = 5 * 60 + 30;
  const TEST_WARNING_SECONDS = SETTINGS.warningMinutes * 60;
  const TEST_BEEP_KEY = "test-warning-beep";
  const TEST_VIDEO_KEY = "test-warning-video";

  const button = document.getElementById("testModeButton");
  const warningVideoLayer = document.getElementById("warningVideoLayer");
  const impactVideo = document.getElementById("impactVideo");
  const loopVideo = document.getElementById("loopVideo");

  let timerId = null;
  let remainingSeconds = TEST_TOTAL_SECONDS;
  let activeTestVideoKey = null;
  let impactVideoEndedHandlerAdded = false;

  window.PRAYER_TEST_MODE = window.PRAYER_TEST_MODE || { active: false };

  function safePlayVideo(video) {
    if (!video) return;

    const playPromise = video.play();

    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.warn("Test videosu autoplay engellendi:", error);
      });
    }
  }

  function stopVideo(video) {
    if (!video) return;

    video.pause();

    try {
      video.currentTime = 0;
    } catch (error) {
      console.warn("Test videosu sıfırlanamadı:", error);
    }
  }

  function startTestVideoSequence() {
    if (!warningVideoLayer || !impactVideo || !loopVideo) return;

    if (activeTestVideoKey === TEST_VIDEO_KEY) {
      return;
    }

    activeTestVideoKey = TEST_VIDEO_KEY;

    warningVideoLayer.classList.add("active");
    warningVideoLayer.classList.add("impact-playing");
    warningVideoLayer.classList.remove("loop-playing");

    stopVideo(loopVideo);
    stopVideo(impactVideo);

    impactVideo.muted = true;
    impactVideo.playsInline = true;
    loopVideo.muted = true;
    loopVideo.playsInline = true;

    safePlayVideo(impactVideo);

    if (!impactVideoEndedHandlerAdded) {
      impactVideo.addEventListener("ended", () => {
        if (!window.PRAYER_TEST_MODE.active || !document.body.classList.contains("warning")) return;

        warningVideoLayer.classList.remove("impact-playing");
        warningVideoLayer.classList.add("loop-playing");

        stopVideo(impactVideo);

        loopVideo.muted = true;
        loopVideo.playsInline = true;
        loopVideo.loop = true;
        safePlayVideo(loopVideo);
      });

      impactVideoEndedHandlerAdded = true;
    }
  }

  function stopTestVideos() {
    if (!warningVideoLayer || !impactVideo || !loopVideo) return;

    warningVideoLayer.classList.remove("active");
    warningVideoLayer.classList.remove("impact-playing");
    warningVideoLayer.classList.remove("loop-playing");

    stopVideo(impactVideo);
    stopVideo(loopVideo);

    activeTestVideoKey = null;
  }

  function renderTestCountdown() {
    el.nextPrayerName.textContent = "TEST";
    el.countdownText.textContent = formatCountdown(remainingSeconds * 1000);

    if (remainingSeconds > TEST_WARNING_SECONDS) {
      el.statusText.textContent =
        `Test modu: alarm ve video ${formatCountdown((remainingSeconds - TEST_WARNING_SECONDS) * 1000)} sonra başlayacak.`;
    } else {
      el.statusText.textContent = "Test modu: alarm, kırmızı ekran ve video aktif.";
    }
  }

  function startWarningTest() {
    document.body.classList.add("warning");
    startTestVideoSequence();

    if (lastBeepKey === TEST_BEEP_KEY) return;

    const played = playShortBeep();

    if (played) {
      lastBeepKey = TEST_BEEP_KEY;
    } else {
      el.statusText.textContent = "Test modu: ses için ekrana bir kere dokunun.";
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
    lastBeepKey = null;
    activeTestVideoKey = null;

    clearInterval(timerId);
    stopAlertSound();
    stopTestVideos();
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
    stopTestVideos();
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