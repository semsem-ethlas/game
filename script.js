document.addEventListener("DOMContentLoaded", () => {
  /**
   * APP CONFIGURATION
   * -----------------
   * These constants define the core settings of the game.
   */
  const NUM_GAMES = 20; // Total number of rewards in the album
  const SLOTS_PER_GAME = 8; // Number of sticker slots for each reward
  // Admin password is stored as a salted SHA-256 hash in localStorage
  const ADMIN_HASH_KEY = "rewardAdminPwdHash";
  const ADMIN_SALT = "reward-salt-v1:";

  // Rewards and images (ordered low -> high)
  const REWARDS = [
    "10 EGP",
    "20 EGP",
    "50 EGP",
    "1 Kinder chocolate",
    "Pencil & eraser set",
    "Small toy figurine",
    "Mystery gift (chosen by me)",
    "1 Android paid game (single title)",
    "1 day off",
    "100 EGP",
    "200 EGP",
    "500 EGP",
    "1000 EGP",
    "Wireless headphones",
    "2000 EGP",
    "5000 EGP",
    "Cairo Festival Mall day off",
    "Dream Park journey",
    "New mobile phone",
    "1 laptop",
  ];

  const REWARD_IMAGES = [
    "assets/rewards/reward01.jpg",
    "assets/rewards/reward02.jpg",
    "assets/rewards/reward03.jpg",
    "assets/rewards/reward04.jpg", // Kinder (sliced mosaic)
    "assets/rewards/reward05.jpg",
    "assets/rewards/reward06.jpg",
    "assets/rewards/reward07.jpg",
    "assets/rewards/reward08.jpg",
    "assets/rewards/reward09.jpg",
    "assets/rewards/reward10.jpg",
    "assets/rewards/reward11.jpg",
    "assets/rewards/reward12.jpg",
    "assets/rewards/reward13.jpg",
    "assets/rewards/reward14.jpg",
    "assets/rewards/reward15.jpg",
    "assets/rewards/reward16.jpg",
    "assets/rewards/reward17.jpg",
    "assets/rewards/reward18.jpg",
    "assets/rewards/reward19.jpg",
    "assets/rewards/reward20.jpg",
  ];

  const KINDER_INDEX = REWARDS.findIndex((n) =>
    n.toLowerCase().includes("kinder")
  );

  // Generic per-reward slicing (4x2 grid) prepared via Canvas so each tile is unique
  const TILE_COLS = 4;
  const TILE_ROWS = 2;
  const TILE_COUNT = TILE_COLS * TILE_ROWS;
  const rewardTiles = Array.from({ length: NUM_GAMES }, () =>
    new Array(TILE_COUNT).fill(null)
  );
  const rewardTilesReady = new Array(NUM_GAMES).fill(false);

  function prepareRewardTiles(rewardIndex) {
    if (rewardTilesReady[rewardIndex]) return Promise.resolve();
    const src = REWARD_IMAGES[rewardIndex];
    if (!src) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const tileWidth = Math.floor(img.width / TILE_COLS);
          const tileHeight = Math.floor(img.height / TILE_ROWS);
          for (let i = 0; i < TILE_COUNT; i++) {
            const col = i % TILE_COLS;
            const row = Math.floor(i / TILE_COLS);
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(
              img,
              col * tileWidth,
              row * tileHeight,
              tileWidth,
              tileHeight,
              0,
              0,
              canvas.width,
              canvas.height
            );
            rewardTiles[rewardIndex][i] = canvas.toDataURL("image/jpeg", 0.92);
          }
          rewardTilesReady[rewardIndex] = true;
        } catch (_) {}
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    }).then(() => {
      // Re-render once slices are ready so already-filled tiles update
      renderAlbum();
    });
  }

  function prepareAllRewardTiles() {
    return Promise.all(REWARD_IMAGES.map((_, idx) => prepareRewardTiles(idx)));
  }

  /**
   * APPLICATION STATE
   * -----------------
   * This object holds all the dynamic data of the app.
   * It's loaded from localStorage and saved back on changes.
   */
  let appData = {
    points: 0,
    games: [],
    audioUnlocked: false,
    soundTheme: "arcade",
    // Track duplicates per reward to detect perfect completion
    duplicates: Array(NUM_GAMES).fill(0),
    currentUser: "guest",
    // Weighted selection across rewards and slots
    rewardWeights: Array(NUM_GAMES).fill(1),
    slotWeights: Array(NUM_GAMES)
      .fill()
      .map(() => Array(SLOTS_PER_GAME).fill(1)),
    // Per-reward difficulty type: easy, medium, normal, hard, superhard
    rewardTypes: Array(NUM_GAMES).fill("normal"),
    // Rewards that are one-time (hard/superhard) and have been won permanently per user
    permanentWins: [],
    // For each reward, store two distinct slot indices that are very low (randomized)
    lowSlotIndices: Array(NUM_GAMES)
      .fill()
      .map(() => []),
  };

  /**
   * DOM ELEMENT REFERENCES
   * ----------------------
   * Caching DOM elements for faster access and cleaner code.
   */
  const albumGrid = document.getElementById("album-grid");
  const pointsDisplay = document.getElementById("points-display");
  const drawCouponButton = document.getElementById("draw-coupon-button");
  const adminButton = document.getElementById("admin-button");
  const albumButton = document.getElementById("album-button");
  const albumPage = document.getElementById("album-page");
  const albumMosaics = document.getElementById("album-mosaics");
  const backToMain = document.getElementById("back-to-main");
  const adminModal = document.getElementById("admin-modal");
  const rewardModal = document.getElementById("reward-modal");
  const closeButtons = document.querySelectorAll(".close-button");
  const submitPasswordButton = document.getElementById("submit-password");
  const adminPasswordInput = document.getElementById("admin-password");
  const adminPanel = document.getElementById("admin-panel");
  const passwordPrompt = document.getElementById("password-prompt");
  const addPointsButton = document.getElementById("add-points-button");
  const pointsToAddInput = document.getElementById("points-to-add");
  const gameToResetSelect = document.getElementById("game-to-reset");
  const resetGameButton = document.getElementById("reset-game-button");
  const soundThemeSelect = document.getElementById("sound-theme-select");
  const currentUserEl = document.getElementById("current-user");
  const loginModal = document.getElementById("login-modal");
  const loginSubmit = document.getElementById("login-submit");
  const userSelect = document.getElementById("user-select");
  const userPassword = document.getElementById("user-password");
  const adminTargetUser = document.getElementById("admin-target-user");
  const adminNotificationsEl = document.getElementById("admin-notifications");
  const clearNotificationsBtn = document.getElementById("clear-notifications");
  const switchUserBtn = document.getElementById("switch-user-button");
  const openAdminBtn = document.getElementById("open-admin-button");
  const backupListEl = document.getElementById("backup-list");
  const restoreBackupBtn = document.getElementById("restore-backup-button");
  const backupNowBtn = document.getElementById("backup-now-button");

  // Test sound buttons
  const testNewBtn = document.getElementById("test-new-sound");
  const testDupBtn = document.getElementById("test-duplicate-sound");

  // Web Audio API setup + Fallback
  const WebAudioCtor = window.AudioContext || window.webkitAudioContext;
  const hasWebAudio = !!WebAudioCtor;
  let audioCtx;
  let fallbackNewAudio = null;
  let fallbackDupAudio = null;

  // Ensure type helpers exist before first load
  function defaultTypeForIndex(idx) {
    const i = idx + 1;
    if (i >= 1 && i <= 7) return "easy";
    if (i === 8) return "medium";
    if (i >= 9 && i <= 11) return "easy";
    if (i >= 12 && i <= 14) return "normal";
    if (i >= 15 && i <= 18) return "hard";
    return "superhard";
  }

  function initializeTypesIfMissing(force = false) {
    const missing =
      force ||
      !Array.isArray(appData.rewardTypes) ||
      appData.rewardTypes.length !== NUM_GAMES;
    if (missing) {
      appData.rewardTypes = Array.from({ length: NUM_GAMES }, (_, i) =>
        defaultTypeForIndex(i)
      );
    }
  }

  // Helpers used by weight initialization and backups
  function typeFactor(type) {
    switch (type) {
      case "easy":
        return 3.0;
      case "medium":
        return 2.0;
      case "normal":
        return 1.2;
      case "hard":
        return 0.7;
      case "superhard":
        return 0.4;
      default:
        return 1.0;
    }
  }

  function randomizeSlotsByType(type) {
    const factor = typeFactor(type);
    return Array.from({ length: SLOTS_PER_GAME }, () => {
      let randMul = 1;
      if (type === "easy") randMul = 0.9 + Math.random() * 0.7; // 0.9..1.6
      else if (type === "medium")
        randMul = 0.9 + Math.random() * 0.5; // 0.9..1.4
      else if (type === "normal")
        randMul = 0.9 + Math.random() * 0.4; // 0.9..1.3
      else if (type === "hard") randMul = 0.7 + Math.random() * 0.4; // 0.7..1.1
      else randMul = 0.5 + Math.random() * 0.4; // superhard 0.5..0.9
      return Math.max(0.05, factor * randMul);
    });
  }

  function pickTwoDistinctLowIndices() {
    const indices = Array.from({ length: SLOTS_PER_GAME }, (_, i) => i);
    const a = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
    const b = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
    return [a, b];
  }

  function initFallbackAudio() {
    if (fallbackNewAudio && fallbackDupAudio) return;
    try {
      fallbackNewAudio = new Audio("assets/new_card.mp3");
      fallbackNewAudio.preload = "auto";
      fallbackNewAudio.volume = 0.9;
      fallbackDupAudio = new Audio("assets/duplicate.mp3");
      fallbackDupAudio.preload = "auto";
      fallbackDupAudio.volume = 0.8;
    } catch (_) {}
  }

  function initAudio() {
    if (!hasWebAudio) {
      initFallbackAudio();
      appData.audioUnlocked = true;
      return;
    }
    if (!audioCtx) {
      try {
        audioCtx = new WebAudioCtor();
      } catch (_) {
        audioCtx = null;
        initFallbackAudio();
      }
    }
    if (audioCtx.state === "suspended") {
      try {
        audioCtx.resume();
      } catch (_) {}
    }
    try {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      osc.connect(gainNode).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.01);
    } catch (_) {}
    // If WebAudio is not running after resume attempt, ensure fallback is ready
    if (!audioCtx || audioCtx.state !== "running") {
      initFallbackAudio();
    }
    appData.audioUnlocked = true;
  }

  // Also unlock on first user interaction anywhere
  document.addEventListener(
    "pointerdown",
    function oneTimeUnlock() {
      initAudio();
      document.removeEventListener("pointerdown", oneTimeUnlock);
    },
    { once: true }
  );

  function playTone({
    freqStart,
    freqEnd,
    duration = 0.25,
    type = "sine",
    gain = 0.1,
  }) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
    if (freqEnd !== undefined && freqEnd !== freqStart) {
      osc.frequency.linearRampToValueAtTime(
        freqEnd,
        audioCtx.currentTime + duration
      );
    }

    gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      audioCtx.currentTime + duration
    );

    osc.connect(gainNode).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  // Small synth helper: schedule a tone with ADSR and optional pan
  function scheduleTone({
    frequency,
    startAt = 0,
    duration = 0.25,
    type = "sine",
    gain = 0.1,
    pan = 0,
  }) {
    if (!audioCtx) return;
    const startTime = audioCtx.currentTime + startAt;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    let lastNode = gainNode;
    let panner = null;

    try {
      if (audioCtx.createStereoPanner) {
        panner = audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(pan, startTime);
        lastNode = panner;
      }
    } catch (_) {}

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    // Simple ADSR
    const attack = Math.min(0.02, duration * 0.2);
    const release = Math.min(0.15, duration * 0.6);
    const sustainTime = Math.max(0, duration - attack - release);
    const peak = gain;
    const sustain = gain * 0.6;

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(peak, startTime + attack);
    gainNode.gain.setValueAtTime(sustain, startTime + attack + sustainTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + attack + sustainTime + release
    );

    osc.connect(gainNode);
    if (panner) {
      gainNode.connect(panner).connect(audioCtx.destination);
    } else {
      gainNode.connect(audioCtx.destination);
    }

    osc.start(startTime);
    osc.stop(startTime + attack + sustainTime + release + 0.01);
  }

  function playNewCard() {
    const canUseWebAudio =
      hasWebAudio && audioCtx && audioCtx.state === "running";
    if (canUseWebAudio) {
      // Ascending sparkle arpeggio with gentle pan
      const notes = [660, 880, 1175, 1320];
      notes.forEach((f, i) =>
        scheduleTone({
          frequency: f,
          startAt: i * 0.08,
          duration: 0.18,
          type: i % 2 ? "triangle" : "sine",
          gain: 0.12,
          pan: i % 2 ? 0.2 : -0.2,
        })
      );
    } else {
      initFallbackAudio();
      try {
        const a = fallbackNewAudio.cloneNode();
        a.volume = 0.9;
        a.play().catch(() => {});
      } catch (_) {}
    }
    // Haptic feedback (mobile)
    try {
      if (navigator.vibrate) navigator.vibrate([35, 25, 35]);
    } catch (_) {}
  }

  function playDuplicate() {
    const canUseWebAudio =
      hasWebAudio && audioCtx && audioCtx.state === "running";
    if (canUseWebAudio) {
      // Two quick descending blips with slight detune
      scheduleTone({
        frequency: 440,
        startAt: 0,
        duration: 0.16,
        type: "sawtooth",
        gain: 0.08,
        pan: -0.1,
      });
      scheduleTone({
        frequency: 330,
        startAt: 0.12,
        duration: 0.16,
        type: "sawtooth",
        gain: 0.07,
        pan: 0.1,
      });
    } else {
      initFallbackAudio();
      try {
        const a = fallbackDupAudio.cloneNode();
        a.volume = 0.8;
        a.play().catch(() => {});
      } catch (_) {}
    }
    // Haptic feedback (mobile)
    try {
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (_) {}
  }

  function playCompletionFanfare() {
    const canUseWebAudio =
      hasWebAudio && audioCtx && audioCtx.state === "running";
    if (canUseWebAudio) {
      // C major triad then octave hit
      const triad = [523.25, 659.25, 783.99]; // C5 E5 G5
      triad.forEach((f, i) =>
        scheduleTone({
          frequency: f,
          startAt: 0,
          duration: 0.35,
          type: i === 1 ? "triangle" : "sine",
          gain: 0.14,
          pan: i === 0 ? -0.15 : i === 2 ? 0.15 : 0,
        })
      );
      scheduleTone({
        frequency: 1046.5,
        startAt: 0.4,
        duration: 0.45,
        type: "sine",
        gain: 0.16,
        pan: 0,
      });
    } else {
      // Fallback: play the new sound twice quickly
      initFallbackAudio();
      try {
        const a = fallbackNewAudio.cloneNode();
        a.volume = 0.95;
        a.play().catch(() => {});
        setTimeout(() => {
          try {
            const b = fallbackNewAudio.cloneNode();
            b.volume = 0.95;
            b.play().catch(() => {});
          } catch (_) {}
        }, 250);
      } catch (_) {}
    }
    // Haptic feedback + confetti
    try {
      if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 140]);
    } catch (_) {}
    launchConfetti();
  }

  // Simple confetti burst
  function launchConfetti() {
    const colors = ["#ff5252", "#ffca28", "#66bb6a", "#42a5f5", "#ab47bc"];
    const count = 60;
    const durationMs = 1200;
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = "100%";
    container.style.height = "0";
    container.style.zIndex = "2500";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);

    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      const size = 6 + Math.random() * 6;
      piece.style.width = `${size}px`;
      piece.style.height = `${size * 0.4}px`;
      piece.style.background = colors[i % colors.length];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.top = `0`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      piece.style.animationDelay = `${Math.random() * 0.2}s`;
      piece.style.opacity = "0.9";
      container.appendChild(piece);
    }

    setTimeout(() => {
      if (container.parentNode) container.parentNode.removeChild(container);
    }, durationMs + 400);
  }

  /**
   * ====================================================================
   * INITIALIZATION & DATA HANDLING
   * ====================================================================
   */
  function initializeApp() {
    loadData();
    prepareAllRewardTiles().finally(() => {
      renderAlbum();
      updatePointsDisplay();
    });
    ensureDailyBackup();
  }

  function activeStorageKey() {
    const u = appData.currentUser || "guest";
    return `rewardAlbumData:${u}`;
  }

  function storageKeyForUser(user) {
    return `rewardAlbumData:${user}`;
  }

  function loadUserData(user) {
    const raw = localStorage.getItem(storageKeyForUser(user));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function saveUserData(user, data) {
    localStorage.setItem(storageKeyForUser(user), JSON.stringify(data));
  }

  function loadData() {
    // Load last user
    const lastUser = localStorage.getItem("rewardAlbumData:lastUser");
    if (lastUser) appData.currentUser = lastUser;
    if (currentUserEl) currentUserEl.textContent = appData.currentUser;

    const savedData = localStorage.getItem(activeStorageKey());
    if (savedData) {
      appData = { ...appData, ...JSON.parse(savedData) };
    } else {
      // If no saved data, create the initial structure
      appData.games = Array(NUM_GAMES)
        .fill()
        .map((_, i) => ({
          id: i,
          slots: Array(SLOTS_PER_GAME).fill(false),
          completed: false,
        }));
      appData.points = 0;
      appData.duplicates = Array(NUM_GAMES).fill(0);
      saveData();
    }
    initializeTypesIfMissing();
    initializeWeightsIfMissing();
    // Migrate any legacy flat arrays (1..1,0.2,0.2) to randomized-by-type
    (function migrateLegacy() {
      try {
        let changed = false;
        for (let r = 0; r < NUM_GAMES; r++) {
          const sw = appData.slotWeights[r];
          if (!Array.isArray(sw) || sw.length !== SLOTS_PER_GAME) continue;
          const isLegacy =
            sw
              .slice(0, SLOTS_PER_GAME - 2)
              .every((v) => v === 1 || v === 1.0) &&
            sw[SLOTS_PER_GAME - 2] === 0.2 &&
            sw[SLOTS_PER_GAME - 1] === 0.2;
          if (isLegacy) {
            const type = appData.rewardTypes[r] || defaultTypeForIndex(r);
            let arr = randomizeSlotsByType(type);
            const [lowA, lowB] = pickTwoDistinctLowIndices();
            arr[lowA] = Math.max(0.01, 0.05 * typeFactor(type));
            arr[lowB] = Math.max(0.01, 0.05 * typeFactor(type));
            appData.slotWeights[r] = arr;
            appData.rewardWeights[r] = typeFactor(type);
            changed = true;
          }
        }
        if (changed) saveData();
      } catch (_) {}
    })();
  }

  function saveData() {
    localStorage.setItem(
      activeStorageKey(),
      JSON.stringify({
        points: appData.points,
        games: appData.games,
        soundTheme: appData.soundTheme,
        duplicates: appData.duplicates,
        rewardWeights: appData.rewardWeights,
        slotWeights: appData.slotWeights,
        rewardTypes: appData.rewardTypes,
        permanentWins: appData.permanentWins,
      })
    );
    localStorage.setItem("rewardAlbumData:lastUser", appData.currentUser);
  }

  const ADMIN_NOTIF_KEY = "rewardAlbumData:adminNotifications";
  function pushAdminNotification(message) {
    try {
      const list = JSON.parse(localStorage.getItem(ADMIN_NOTIF_KEY) || "[]");
      list.unshift({ message, ts: Date.now() });
      localStorage.setItem(ADMIN_NOTIF_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (_) {}
  }
  function getAdminNotifications() {
    try {
      return JSON.parse(localStorage.getItem(ADMIN_NOTIF_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }
  function renderAdminNotifications() {
    if (!adminNotificationsEl) return;
    const list = getAdminNotifications();
    if (list.length === 0) {
      adminNotificationsEl.innerHTML = "<em>No notifications</em>";
      return;
    }
    adminNotificationsEl.innerHTML = list
      .map((n) => {
        const d = new Date(n.ts);
        const t = d.toLocaleString();
        return `<div>[${t}] ${n.message}</div>`;
      })
      .join("");
  }

  function switchUser(newUser) {
    if (!newUser) return;
    appData.currentUser = newUser;
    if (currentUserEl) currentUserEl.textContent = appData.currentUser;
    // Reload this user's data
    const savedData = localStorage.getItem(activeStorageKey());
    if (savedData) {
      const parsed = JSON.parse(savedData);
      appData.points = parsed.points || 0;
      appData.games = parsed.games || appData.games;
      appData.soundTheme = parsed.soundTheme || appData.soundTheme;
      appData.duplicates = parsed.duplicates || Array(NUM_GAMES).fill(0);
      appData.rewardWeights = parsed.rewardWeights || appData.rewardWeights;
      appData.slotWeights = parsed.slotWeights || appData.slotWeights;
      appData.rewardTypes = parsed.rewardTypes || appData.rewardTypes;
      appData.permanentWins = parsed.permanentWins || [];
    } else {
      appData.points = 0;
      appData.games = Array(NUM_GAMES)
        .fill()
        .map((_, i) => ({
          id: i,
          slots: Array(SLOTS_PER_GAME).fill(false),
          completed: false,
        }));
      appData.duplicates = Array(NUM_GAMES).fill(0);
      initializeWeightsIfMissing(true);
      initializeTypesIfMissing(true);
      appData.permanentWins = [];
    }
    updatePointsDisplay();
    renderAlbum();
    saveData();
    ensureDailyBackup();
  }

  function initializeWeightsIfMissing(force = false) {
    const missingRewards =
      force ||
      !Array.isArray(appData.rewardWeights) ||
      appData.rewardWeights.length !== NUM_GAMES;
    const missingSlots =
      force ||
      !Array.isArray(appData.slotWeights) ||
      appData.slotWeights.length !== NUM_GAMES ||
      appData.slotWeights.some(
        (arr) => !Array.isArray(arr) || arr.length !== SLOTS_PER_GAME
      );
    if (missingRewards || missingSlots) {
      initializeTypesIfMissing(true);
      appData.rewardWeights = Array(NUM_GAMES).fill(0);
      appData.slotWeights = Array.from({ length: NUM_GAMES }, () =>
        Array(SLOTS_PER_GAME).fill(0)
      );
      for (let r = 0; r < NUM_GAMES; r++) {
        const type = appData.rewardTypes[r] || defaultTypeForIndex(r);
        appData.rewardWeights[r] = typeFactor(type);
        let slots = randomizeSlotsByType(type);
        const [lowA, lowB] = pickTwoDistinctLowIndices();
        slots[lowA] = Math.max(0.01, 0.05 * typeFactor(type));
        slots[lowB] = Math.max(0.01, 0.05 * typeFactor(type));
        appData.slotWeights[r] = slots;
      }
      saveData();
    }
  }

  function weightedPick(weights) {
    const total = weights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    if (!total || !isFinite(total)) {
      // fallback to uniform
      const idx = Math.floor(Math.random() * weights.length);
      return idx;
    }
    let x = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] > 0 ? weights[i] : 0;
      if (x < w) return i;
      x -= w;
    }
    return weights.length - 1;
  }

  // Backups: store list of { user, ts, data }
  const BACKUPS_KEY = "rewardAlbumData:backups";
  const LAST_BACKUP_KEY_PREFIX = "rewardAlbumData:lastBackup:"; // per-user timestamp
  function getBackups() {
    try {
      return JSON.parse(localStorage.getItem(BACKUPS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }
  function setBackups(list) {
    localStorage.setItem(BACKUPS_KEY, JSON.stringify(list.slice(0, 100)));
  }
  function doBackupForUser(user) {
    let data = loadUserData(user);
    if (!data) {
      // Create default dataset if none exists yet
      data = {
        points: 0,
        games: Array(NUM_GAMES)
          .fill()
          .map((_, i) => ({
            id: i,
            slots: Array(SLOTS_PER_GAME).fill(false),
            completed: false,
          })),
        soundTheme: "arcade",
        duplicates: Array(NUM_GAMES).fill(0),
        rewardWeights: Array.from({ length: NUM_GAMES }, (_, i) =>
          typeFactor(defaultTypeForIndex(i))
        ),
        slotWeights: Array.from({ length: NUM_GAMES }, (_, i) => {
          const type = defaultTypeForIndex(i);
          let arr = randomizeSlotsByType(type);
          const [lowA, lowB] = pickTwoDistinctLowIndices();
          arr[lowA] = Math.max(0.01, 0.05 * typeFactor(type));
          arr[lowB] = Math.max(0.01, 0.05 * typeFactor(type));
          return arr;
        }),
        rewardTypes: Array.from({ length: NUM_GAMES }, (_, i) =>
          defaultTypeForIndex(i)
        ),
        permanentWins: [],
      };
      saveUserData(user, data);
    }
    const list = getBackups();
    list.unshift({ user, ts: Date.now(), data });
    setBackups(list);
    localStorage.setItem(LAST_BACKUP_KEY_PREFIX + user, String(Date.now()));
  }
  function ensureDailyBackup() {
    const user = appData.currentUser;
    const last = parseInt(
      localStorage.getItem(LAST_BACKUP_KEY_PREFIX + user) || "0",
      10
    );
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    if (!last || now - last > oneDay) {
      doBackupForUser(user);
    }
  }

  function renderBackupList() {
    if (!backupListEl) return;
    const all = getBackups();
    const filterUser = adminTargetUser ? adminTargetUser.value : null;
    const list = filterUser ? all.filter((b) => b.user === filterUser) : all;
    if (list.length === 0) {
      backupListEl.innerHTML = "<option disabled>No backups yet</option>";
      return;
    }
    backupListEl.innerHTML = list
      .map((b) => {
        const d = new Date(b.ts).toLocaleString();
        return `<option data-user="${b.user}" data-ts="${b.ts}">${b.user} — ${d}</option>`;
      })
      .join("");
  }

  /**
   * ====================================================================
   * UI RENDERING & UPDATES
   * ====================================================================
   */
  function renderAlbum() {
    albumGrid.innerHTML = "";
    appData.games.forEach((game, index) => {
      const card = document.createElement("div");
      card.className = `game-card ${game.completed ? "completed" : ""}`;
      const filledCount = game.slots.reduce((acc, v) => acc + (v ? 1 : 0), 0);
      const titleText = game.completed
        ? REWARDS[index] || `Reward ${index + 1}`
        : `Mystery (${filledCount}/${SLOTS_PER_GAME})`;
      const badge = game.completed
        ? '<span class="badge-completed">Completed</span>'
        : "";
      card.innerHTML = `
                <h3>${titleText} ${badge}</h3>
                <div class="slots-container">
                    ${game.slots
                      .map((filled, i) => {
                        const filledClass = filled ? "filled" : "";
                        const src =
                          filled && rewardTilesReady[index]
                            ? rewardTiles[index][i]
                            : "";
                        return `
                            <div class="slot ${filledClass} tile-${i}">
                              ${
                                filled
                                  ? src
                                    ? `<img src=\"${src}\" alt=\"tile\"/>`
                                    : ""
                                  : "❓"
                              }
                            </div>
                          `;
                      })
                      .join("")}
                </div>
            `;
      albumGrid.appendChild(card);
    });
  }

  function renderAlbumMosaics() {
    if (!albumMosaics) return;
    albumMosaics.innerHTML = "";
    appData.games.forEach((game, index) => {
      if (!game.completed) return;
      const title = REWARDS[index] || `Reward ${index + 1}`;
      const wrapper = document.createElement("div");
      wrapper.className = "mosaic-card";
      const tiles = rewardTilesReady[index]
        ? rewardTiles[index]
        : new Array(8).fill(null);
      wrapper.innerHTML = `
        <h4 class="mosaic-title">${title}</h4>
        <div class="mosaic-tiles">
          ${tiles
            .map(
              (src, i) => `
            <div class="tile">
              ${src ? `<img src=\"${src}\" alt=\"tile\"/>` : ""}
            </div>
          `
            )
            .join("")}
        </div>
      `;
      albumMosaics.appendChild(wrapper);
    });
  }

  function updatePointsDisplay() {
    pointsDisplay.textContent = appData.points;
    drawCouponButton.disabled = appData.points <= 0;
  }

  function populateResetGameSelect() {
    if (!gameToResetSelect) return;
    const fragment = document.createDocumentFragment();
    // Add "All rewards" option on top
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All rewards";
    fragment.appendChild(allOpt);
    for (let i = 0; i < NUM_GAMES; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${REWARDS[i] || `Reward ${i + 1}`}`;
      fragment.appendChild(option);
    }
    gameToResetSelect.innerHTML = "";
    gameToResetSelect.appendChild(fragment);
  }

  /**
   * ====================================================================
   * CORE GAME LOGIC
   * ====================================================================
   */
  function drawCoupon() {
    if (appData.points <= 0) return;
    if (!appData.audioUnlocked) initAudio();

    appData.points--;

    // Weighted selection across ALL rewards (completed or not)
    initializeWeightsIfMissing();

    let gameIndex,
      slotIndex,
      wasDuplicate = false;
    {
      const rWeights = getEffectiveRewardWeights();
      gameIndex = weightedPick(rWeights);
      const slotWeights =
        appData.slotWeights[gameIndex] || Array(SLOTS_PER_GAME).fill(1);
      slotIndex = weightedPick(slotWeights);

      if (appData.games[gameIndex].slots[slotIndex]) {
        // It's a duplicate
        wasDuplicate = true;
        appData.duplicates[gameIndex] += 1;
        playDuplicate();
      } else {
        appData.games[gameIndex].slots[slotIndex] = true;
        playNewCard();
        // emoji pop at that slot after render
      }
    }

    if (appData.games[gameIndex].slots.every((s) => s)) {
      appData.games[gameIndex].completed = true;
      const isPerfect = (appData.duplicates[gameIndex] || 0) === 0;
      if (isPerfect) showPerfectBanner();
      playCompletionFanfare();
      // Mark one-time rewards permanently won
      const t =
        (loadUserData(appData.currentUser)?.rewardTypes ||
          appData.rewardTypes ||
          [])[gameIndex] || defaultTypeForIndex(gameIndex);
      if (t === "hard" || t === "superhard") {
        const d = loadUserData(appData.currentUser) || {};
        if (!Array.isArray(d.permanentWins)) d.permanentWins = [];
        if (!d.permanentWins.includes(gameIndex))
          d.permanentWins.push(gameIndex);
        saveUserData(appData.currentUser, d);
        appData.permanentWins = d.permanentWins.slice();
      }
      // Notify admin
      const rewardName = REWARDS[gameIndex] || `Reward ${gameIndex + 1}`;
      pushAdminNotification(`${appData.currentUser} completed: ${rewardName}`);
      showRewardModal(gameIndex);
    }

    // UI feedback
    drawCouponButton.classList.add("shake");
    setTimeout(() => drawCouponButton.classList.remove("shake"), 500);

    updatePointsDisplay();
    renderAlbum();
    saveData();
    decrementBoostIfActive();

    if (typeof gameIndex !== "undefined" && typeof slotIndex !== "undefined") {
      // emoji pop for new only
      if (!wasDuplicate) setTimeout(() => emojiPop(gameIndex, slotIndex), 30);
      setTimeout(
        () => flyToSlotAndHighlight(gameIndex, slotIndex, wasDuplicate),
        0
      );
    }
  }

  function flyToSlotAndHighlight(gameIndex, slotIndex, wasDuplicate) {
    const card = albumGrid.children[gameIndex];
    if (!card) return;
    const slots = card.querySelectorAll(".slot");
    const dest = slots[slotIndex];
    if (!dest) return;

    let src = "";
    if (rewardTilesReady[gameIndex] && rewardTiles[gameIndex][slotIndex]) {
      src = rewardTiles[gameIndex][slotIndex];
    } else {
      src = REWARD_IMAGES[gameIndex] || "";
    }

    const overlay = document.createElement("div");
    overlay.className = "fly-overlay";
    const img = document.createElement("img");
    img.className = "fly-card";
    img.src = src;

    const hint = document.createElement("div");
    hint.className = "fly-instruction";
    hint.textContent = `${
      wasDuplicate ? "Duplicate" : "New card"
    } — Tap to place`;

    overlay.appendChild(img);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    const startSize = 200;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    img.style.left = `${centerX - startSize / 2}px`;
    img.style.top = `${centerY - startSize / 2}px`;
    img.style.width = `${startSize}px`;
    img.style.height = `${startSize}px`;

    const animateToDest = () => {
      void img.offsetWidth;
      const rect = dest.getBoundingClientRect();
      img.style.left = `${rect.left}px`;
      img.style.top = `${rect.top}px`;
      img.style.width = `${rect.width}px`;
      img.style.height = `${rect.height}px`;

      const onDone = () => {
        img.removeEventListener("transitionend", onDone);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        card.classList.add("focused");
        dest.classList.add(wasDuplicate ? "just-duplicate" : "just-discovered");
        setTimeout(() => {
          dest.classList.remove("just-duplicate", "just-discovered");
          card.classList.remove("focused");
        }, 1200);
        try {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) {}
      };
      img.addEventListener("transitionend", onDone);
    };

    overlay.addEventListener(
      "click",
      () => {
        animateToDest();
      },
      { once: true }
    );
  }

  function focusOnDiscovered(gameIndex, slotIndex) {
    const card = albumGrid.children[gameIndex];
    if (!card) return;
    card.classList.add("focused");
    try {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (_) {}
    const slots = card.querySelectorAll(".slot");
    const slot = slots[slotIndex];
    if (slot) {
      slot.classList.add("just-discovered");
      setTimeout(() => {
        slot.classList.remove("just-discovered");
        card.classList.remove("focused");
      }, 1200);
    } else {
      setTimeout(() => card.classList.remove("focused"), 800);
    }
  }

  function emojiPop(gameIndex, slotIndex) {
    const card = albumGrid.children[gameIndex];
    if (!card) return;
    const slots = card.querySelectorAll(".slot");
    const slot = slots[slotIndex];
    if (!slot) return;
    const emojis = ["✨", "🎉", "🍬", "⭐", "🎈", "🍭", "🧩", "🎊"];
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("div");
      s.className = "emoji-pop";
      s.textContent = emojis[(Math.random() * emojis.length) | 0];
      s.style.left = `${8 + Math.random() * 24}px`;
      s.style.top = `${8 + Math.random() * 24}px`;
      slot.appendChild(s);
      setTimeout(() => {
        if (s.parentNode) s.parentNode.removeChild(s);
      }, 900);
    }
  }

  function showPerfectBanner() {
    const el = document.createElement("div");
    el.className = "perfect-banner";
    el.textContent = "Perfect!";
    document.body.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1600);
  }

  /**
   * ====================================================================
   * MODAL HANDLING
   * ====================================================================
   */
  function showRewardModal(gameIndex) {
    document.getElementById("reward-title").textContent = `You won Reward ${
      gameIndex + 1
    }! 🎉`;
    const rewardImg = document.getElementById("reward-image");
    rewardImg.src = REWARD_IMAGES[gameIndex] || "";
    rewardModal.style.display = "flex";

    // Add animation
    const rewardContent = rewardModal.querySelector(".modal-content");
    rewardContent.classList.add("animate");
    setTimeout(() => {
      rewardContent.classList.remove("animate");
    }, 1000); // Animation duration is 1s
  }

  /**
   * ====================================================================
   * EVENT LISTENERS
   * ====================================================================
   */
  drawCouponButton.addEventListener("click", () => {
    if (!appData.audioUnlocked) initAudio();
    drawCoupon();
  });

  adminButton.addEventListener("click", () => {
    // Only admin user can open admin; others get login
    if (appData.currentUser !== "admin") {
      if (loginModal) loginModal.style.display = "flex";
      return;
    }
    adminModal.style.display = "flex";
    adminPasswordInput.value = "";
    passwordPrompt.style.display = "block";
    adminPanel.style.display = "none";
  });

  if (albumButton && albumPage && backToMain) {
    albumButton.addEventListener("click", () => {
      albumGrid.style.display = "none";
      document.getElementById("draw-coupon-container").style.display = "none";
      albumPage.style.display = "block";
      renderAlbumMosaics();
    });
    backToMain.addEventListener("click", () => {
      albumPage.style.display = "none";
      albumGrid.style.display = "grid";
      document.getElementById("draw-coupon-container").style.display = "block";
    });
  }

  // Open login by clicking on user indicator
  if (currentUserEl && loginModal) {
    currentUserEl.parentElement.addEventListener("click", () => {
      loginModal.style.display = "flex";
      if (userSelect) userSelect.value = appData.currentUser;
      if (userPassword) userPassword.value = "";
    });
  }

  if (loginSubmit && userSelect && userPassword) {
    loginSubmit.addEventListener("click", async () => {
      const u = userSelect.value;
      const pw = userPassword.value;
      const ok = await verifyUserPassword(u, pw);
      if (ok) {
        loginModal.style.display = "none";
        switchUser(u);
      } else {
        alert("Wrong password");
      }
    });
  }

  if (openAdminBtn) {
    openAdminBtn.addEventListener("click", () => {
      // Open admin panel (password-protected) regardless of current user
      if (loginModal) loginModal.style.display = "none";
      adminModal.style.display = "flex";
      adminPasswordInput.value = "";
      passwordPrompt.style.display = "block";
      adminPanel.style.display = "none";
    });
  }

  closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      adminModal.style.display = "none";
      rewardModal.style.display = "none";
      if (loginModal) loginModal.style.display = "none";
    });
  });

  const weightsRewardSelect = document.getElementById("weights-reward-select");
  const rewardWeightInput = document.getElementById("reward-weight-input");
  const rewardTypeSelect = document.getElementById("reward-type-select");
  const slotsRerollBtn = document.getElementById("slots-reroll");
  const slotWeightInputs = [
    document.getElementById("slot-weight-0"),
    document.getElementById("slot-weight-1"),
    document.getElementById("slot-weight-2"),
    document.getElementById("slot-weight-3"),
    document.getElementById("slot-weight-4"),
    document.getElementById("slot-weight-5"),
    document.getElementById("slot-weight-6"),
    document.getElementById("slot-weight-7"),
  ];
  const weightsSaveBtn = document.getElementById("weights-save");
  const weightsResetBtn = document.getElementById("weights-reset");

  function populateWeightsRewardSelect() {
    if (!weightsRewardSelect) return;
    weightsRewardSelect.innerHTML = REWARDS.map(
      (name, i) => `<option value="${i}">${i + 1}. ${name}</option>`
    ).join("");
  }

  function getWeightsForUser(user) {
    const d = loadUserData(user);
    if (d && Array.isArray(d.rewardWeights) && Array.isArray(d.slotWeights))
      return { rw: d.rewardWeights, sw: d.slotWeights };
    // Defaults
    const rw = Array.from({ length: NUM_GAMES }, (_, i) =>
      i < 5 ? 3.0 : i >= NUM_GAMES - 5 ? 0.6 : 1.2
    );
    const sw = Array.from({ length: NUM_GAMES }, () => {
      const arr = Array(SLOTS_PER_GAME).fill(1.0);
      const lowA = SLOTS_PER_GAME - 2;
      const lowB = SLOTS_PER_GAME - 1;
      if (lowA >= 0) arr[lowA] = 0.2;
      if (lowB >= 0) arr[lowB] = 0.2;
      return arr;
    });
    return { rw, sw };
  }

  function loadWeightsEditor() {
    if (!weightsRewardSelect) return;
    const target = adminTargetUser
      ? adminTargetUser.value
      : appData.currentUser;
    const { rw, sw } = getWeightsForUser(target);
    const idx = parseInt(weightsRewardSelect.value || "0", 10) || 0;
    rewardWeightInput.value = rw[idx].toString();
    slotWeightInputs.forEach((input, i) => {
      if (input) input.value = (sw[idx][i] ?? 1).toString();
    });
    if (rewardTypeSelect) {
      const d = loadUserData(target) || {};
      const types = d.rewardTypes || appData.rewardTypes || [];
      rewardTypeSelect.value = types[idx] || defaultTypeForIndex(idx);
    }
  }

  function saveWeightsEditor() {
    const target = adminTargetUser
      ? adminTargetUser.value
      : appData.currentUser;
    const data = loadUserData(target) || {
      points: 0,
      games: Array(NUM_GAMES)
        .fill()
        .map((_, i) => ({
          id: i,
          slots: Array(SLOTS_PER_GAME).fill(false),
          completed: false,
        })),
      soundTheme: "arcade",
      duplicates: Array(NUM_GAMES).fill(0),
    };
    if (
      !Array.isArray(data.rewardWeights) ||
      data.rewardWeights.length !== NUM_GAMES
    )
      data.rewardWeights = Array.from({ length: NUM_GAMES }, () => 1);
    if (
      !Array.isArray(data.slotWeights) ||
      data.slotWeights.length !== NUM_GAMES
    )
      data.slotWeights = Array.from({ length: NUM_GAMES }, () =>
        Array(SLOTS_PER_GAME).fill(1)
      );
    const idx = parseInt(weightsRewardSelect.value || "0", 10) || 0;
    data.rewardWeights[idx] = Math.max(
      0,
      parseFloat(rewardWeightInput.value) || 0
    );
    slotWeightInputs.forEach((input, i) => {
      if (input)
        data.slotWeights[idx][i] = Math.max(0, parseFloat(input.value) || 0);
    });
    saveUserData(target, data);
    if (target === appData.currentUser) {
      appData.rewardWeights = data.rewardWeights;
      appData.slotWeights = data.slotWeights;
      saveData();
    }
    alert("Weights saved");
  }

  function resetWeightsDefaults() {
    const target = adminTargetUser
      ? adminTargetUser.value
      : appData.currentUser;
    const d = loadUserData(target) || {};
    d.rewardWeights = Array.from({ length: NUM_GAMES }, (_, i) =>
      i < 5 ? 3.0 : i >= NUM_GAMES - 5 ? 0.6 : 1.2
    );
    d.slotWeights = Array.from({ length: NUM_GAMES }, () => {
      const arr = Array(SLOTS_PER_GAME).fill(1.0);
      const lowA = SLOTS_PER_GAME - 2;
      const lowB = SLOTS_PER_GAME - 1;
      if (lowA >= 0) arr[lowA] = 0.2;
      if (lowB >= 0) arr[lowB] = 0.2;
      return arr;
    });
    saveUserData(target, d);
    if (target === appData.currentUser) {
      appData.rewardWeights = d.rewardWeights;
      appData.slotWeights = d.slotWeights;
      saveData();
    }
    loadWeightsEditor();
  }

  if (weightsSaveBtn)
    weightsSaveBtn.addEventListener("click", saveWeightsEditor);
  if (weightsResetBtn)
    weightsResetBtn.addEventListener("click", resetWeightsDefaults);
  if (weightsRewardSelect)
    weightsRewardSelect.addEventListener("change", loadWeightsEditor);
  if (adminTargetUser)
    adminTargetUser.addEventListener("change", () => {
      populateWeightsRewardSelect();
      loadWeightsEditor();
    });
  if (rewardTypeSelect) {
    rewardTypeSelect.addEventListener("change", () => {
      const target = adminTargetUser
        ? adminTargetUser.value
        : appData.currentUser;
      const idx = parseInt(weightsRewardSelect.value || "0", 10) || 0;
      const type = rewardTypeSelect.value;
      applyTypeToReward(target, idx, type, true);
      loadWeightsEditor();
      alert("Type updated and slots re-rolled");
    });
  }
  if (slotsRerollBtn) {
    slotsRerollBtn.addEventListener("click", () => {
      const target = adminTargetUser
        ? adminTargetUser.value
        : appData.currentUser;
      const idx = parseInt(weightsRewardSelect.value || "0", 10) || 0;
      const d = loadUserData(target) || {};
      const type =
        (d.rewardTypes && d.rewardTypes[idx]) || defaultTypeForIndex(idx);
      applyTypeToReward(target, idx, type, true);
      loadWeightsEditor();
      alert("Slots re-rolled for current type");
    });
  }

  const presetEasyBtn = document.getElementById("preset-easy");
  const presetNormalBtn = document.getElementById("preset-normal");
  const presetHardBtn = document.getElementById("preset-hard");
  const boostRewardSelect = document.getElementById("boost-reward-select");
  const boostMultInput = document.getElementById("boost-mult-input");
  const boostDrawsInput = document.getElementById("boost-draws-input");
  const applyBoostBtn = document.getElementById("apply-boost");
  const clearBoostBtn = document.getElementById("clear-boost");

  function populateBoostRewardSelect() {
    if (!boostRewardSelect) return;
    boostRewardSelect.innerHTML = REWARDS.map(
      (name, i) => `<option value="${i}">${i + 1}. ${name}</option>`
    ).join("");
  }

  function getOrInitBoostState(user) {
    const d = loadUserData(user) || {};
    if (!d.boosts)
      d.boosts = {
        active: false,
        rewardIndex: 0,
        multiplier: 2,
        remainingDraws: 0,
      };
    return d;
  }

  function saveBoostState(user, boosts) {
    const d = loadUserData(user) || {};
    d.boosts = boosts;
    saveUserData(user, d);
    if (user === appData.currentUser) {
      // no-op, draw uses loadUserData on save, but we keep consistent
    }
  }

  function applyPreset(user, preset) {
    const d = loadUserData(user) || {};
    const baseRw = Array.from({ length: NUM_GAMES }, (_, i) =>
      i < 5 ? 3.0 : i >= NUM_GAMES - 5 ? 0.6 : 1.2
    );
    let factor = 1;
    if (preset === "easy") factor = 1.5;
    if (preset === "hard") factor = 0.75;
    d.rewardWeights = baseRw.map((w) => Math.max(0, w * factor));
    d.slotWeights = Array.from({ length: NUM_GAMES }, () => {
      const arr = Array.from({ length: SLOTS_PER_GAME }, () => {
        // Randomize per-slot weight around the preset factor
        // Easy: wider and higher range, Normal: medium, Hard: lower
        let randMul = 1;
        if (preset === "easy")
          randMul = 1.0 + (Math.random() * 0.8 - 0.2); // ~0.8..1.6
        else if (preset === "hard") randMul = 0.8 + Math.random() * 0.4;
        // ~0.8..1.2 then scaled by factor 0.75
        else randMul = 0.9 + Math.random() * 0.4; // ~0.9..1.3
        return Math.max(0.05, factor * randMul);
      });
      // Force two slots very low
      const lowA = SLOTS_PER_GAME - 2;
      const lowB = SLOTS_PER_GAME - 1;
      if (lowA >= 0) arr[lowA] = Math.max(0.01, 0.05 * factor);
      if (lowB >= 0) arr[lowB] = Math.max(0.01, 0.05 * factor);
      return arr;
    });
    saveUserData(user, d);
    if (user === appData.currentUser) {
      appData.rewardWeights = d.rewardWeights;
      appData.slotWeights = d.slotWeights;
      saveData();
    }
  }

  if (presetEasyBtn)
    presetEasyBtn.addEventListener("click", () => {
      const u = adminTargetUser ? adminTargetUser.value : appData.currentUser;
      applyPreset(u, "easy");
      loadWeightsEditor();
      alert("Applied Easy preset");
    });
  if (presetNormalBtn)
    presetNormalBtn.addEventListener("click", () => {
      const u = adminTargetUser ? adminTargetUser.value : appData.currentUser;
      applyPreset(u, "normal");
      loadWeightsEditor();
      alert("Applied Normal preset");
    });
  if (presetHardBtn)
    presetHardBtn.addEventListener("click", () => {
      const u = adminTargetUser ? adminTargetUser.value : appData.currentUser;
      applyPreset(u, "hard");
      loadWeightsEditor();
      alert("Applied Hard preset");
    });

  if (applyBoostBtn)
    applyBoostBtn.addEventListener("click", () => {
      const u = adminTargetUser ? adminTargetUser.value : appData.currentUser;
      const d = getOrInitBoostState(u);
      d.boosts.active = true;
      d.boosts.rewardIndex = parseInt(boostRewardSelect.value || "0", 10) || 0;
      d.boosts.multiplier = Math.max(1, parseFloat(boostMultInput.value) || 2);
      d.boosts.remainingDraws = Math.max(
        1,
        parseInt(boostDrawsInput.value, 10) || 10
      );
      saveBoostState(u, d.boosts);
      alert("Boost applied");
    });

  if (clearBoostBtn)
    clearBoostBtn.addEventListener("click", () => {
      const u = adminTargetUser ? adminTargetUser.value : appData.currentUser;
      const d = getOrInitBoostState(u);
      d.boosts.active = false;
      d.boosts.remainingDraws = 0;
      saveBoostState(u, d.boosts);
      alert("Boost cleared");
    });

  function onAdminOpenedPopulateWeights() {
    populateWeightsRewardSelect();
    loadWeightsEditor();
    populateBoostRewardSelect();
  }

  function getEffectiveRewardWeights() {
    const u = appData.currentUser;
    const d = loadUserData(u) || {};
    const base = d.rewardWeights || appData.rewardWeights;
    const boosts = d.boosts;
    let arr = base.slice();
    if (boosts && boosts.active && boosts.remainingDraws > 0) {
      arr[boosts.rewardIndex] = Math.max(
        0,
        (arr[boosts.rewardIndex] || 0) * boosts.multiplier
      );
    }
    // Zero-out one-time rewards (hard/superhard) already won permanently
    const types = d.rewardTypes || appData.rewardTypes || [];
    const wins = d.permanentWins || appData.permanentWins || [];
    wins.forEach((ri) => {
      const t = types[ri] || defaultTypeForIndex(ri);
      if (t === "hard" || t === "superhard") arr[ri] = 0;
    });
    return arr;
  }

  function decrementBoostIfActive() {
    const u = appData.currentUser;
    const d = getOrInitBoostState(u);
    if (d.boosts && d.boosts.active && d.boosts.remainingDraws > 0) {
      d.boosts.remainingDraws -= 1;
      if (d.boosts.remainingDraws <= 0) d.boosts.active = false;
      saveBoostState(u, d.boosts);
    }
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function sha256Hex(message) {
    const enc = new TextEncoder();
    const data = enc.encode(message);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return toHex(hash);
  }

  async function ensureAdminHash() {
    let h = localStorage.getItem(ADMIN_HASH_KEY);
    if (!h) {
      // Initialize with a random one-time setup hash if none is present
      const randomInit = Math.random().toString(36).slice(2) + Date.now();
      h = await sha256Hex(ADMIN_SALT + randomInit);
      localStorage.setItem(ADMIN_HASH_KEY, h);
    }
    return h;
  }

  async function verifyAdminPassword(plain) {
    const stored = await ensureAdminHash();
    const attempt = await sha256Hex(ADMIN_SALT + String(plain || ""));
    return stored === attempt;
  }

  // Per-user password hashes
  const USER_HASH_PREFIX = "rewardUserPwdHash:";
  const USER_SALT = "reward-user-salt-v1:";

  async function ensureDefaultUserHashes() {
    const users = ["moka", "aser", "sila"];
    for (const user of users) {
      const key = USER_HASH_PREFIX + user;
      if (!localStorage.getItem(key)) {
        const randomInit = Math.random().toString(36).slice(2) + Date.now();
        const h = await sha256Hex(USER_SALT + randomInit);
        localStorage.setItem(key, h);
      }
    }
  }

  async function verifyUserPassword(user, plain) {
    const key = USER_HASH_PREFIX + user;
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    const attempt = await sha256Hex(USER_SALT + String(plain || ""));
    return stored === attempt;
  }

  submitPasswordButton.addEventListener("click", async () => {
    const ok = await verifyAdminPassword(adminPasswordInput.value);
    if (ok) {
      passwordPrompt.style.display = "none";
      adminPanel.style.display = "block";
      // Populate reset select lazily after admin panel is shown
      populateResetGameSelect();
      if (soundThemeSelect)
        soundThemeSelect.value = appData.soundTheme || "arcade";
      renderAdminNotifications();
      // Seed daily backups for known users and render list
      ["moka", "aser", "sila"].forEach((u) => {
        const last = parseInt(
          localStorage.getItem(LAST_BACKUP_KEY_PREFIX + u) || "0",
          10
        );
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        if (!last || now - last > oneDay) doBackupForUser(u);
      });
      renderBackupList();
      onAdminOpenedPopulateWeights();
    } else {
      alert("Wrong password!");
    }
  });

  addPointsButton.addEventListener("click", () => {
    const points = parseInt(pointsToAddInput.value, 10);
    if (!(points > 0)) return;
    const target = adminTargetUser
      ? adminTargetUser.value
      : appData.currentUser;
    const targetData = loadUserData(target) || {
      points: 0,
      games: Array(NUM_GAMES)
        .fill()
        .map((_, i) => ({
          id: i,
          slots: Array(SLOTS_PER_GAME).fill(false),
          completed: false,
        })),
      soundTheme: "arcade",
      duplicates: Array(NUM_GAMES).fill(0),
    };
    targetData.points = (targetData.points || 0) + points;
    saveUserData(target, targetData);
    // If editing current user, reflect immediately
    if (target === appData.currentUser) {
      appData.points = targetData.points;
      updatePointsDisplay();
      saveData();
    }
    alert(`Added ${points} points to ${target}`);
    pointsToAddInput.value = 1;
  });

  resetGameButton.addEventListener("click", () => {
    const selected = gameToResetSelect.value;
    const target = adminTargetUser
      ? adminTargetUser.value
      : appData.currentUser;
    const targetData = loadUserData(target) || {
      points: 0,
      games: Array(NUM_GAMES)
        .fill()
        .map((_, i) => ({
          id: i,
          slots: Array(SLOTS_PER_GAME).fill(false),
          completed: false,
        })),
      soundTheme: "arcade",
      duplicates: Array(NUM_GAMES).fill(0),
    };
    if (selected === "all") {
      for (let i = 0; i < targetData.games.length; i++) {
        targetData.games[i].slots.fill(false);
        targetData.games[i].completed = false;
      }
      targetData.duplicates = Array(NUM_GAMES).fill(0);
      saveUserData(target, targetData);
      if (target === appData.currentUser) {
        appData.games = targetData.games;
        appData.duplicates = targetData.duplicates;
        renderAlbum();
        saveData();
      }
      alert(`All rewards have been reset for ${target}.`);
      return;
    }
    const gameIndex = parseInt(selected, 10);
    if (!Number.isNaN(gameIndex) && targetData.games[gameIndex]) {
      targetData.games[gameIndex].slots.fill(false);
      targetData.games[gameIndex].completed = false;
      targetData.duplicates[gameIndex] = 0;
      saveUserData(target, targetData);
      if (target === appData.currentUser) {
        appData.games = targetData.games;
        appData.duplicates = targetData.duplicates;
        renderAlbum();
        saveData();
      }
      alert(
        `${
          REWARDS[gameIndex] || `Reward ${gameIndex + 1}`
        } has been reset for ${target}.`
      );
    }
  });

  window.addEventListener("click", (event) => {
    if (event.target == adminModal) {
      adminModal.style.display = "none";
    }
    if (event.target == rewardModal) {
      rewardModal.style.display = "none";
    }
  });

  // Hook up test buttons
  if (testNewBtn) {
    testNewBtn.addEventListener("click", () => {
      initAudio();
      playNewCard();
      const state = hasWebAudio
        ? audioCtx
          ? audioCtx.state
          : "no ctx"
        : "fallback";
      alert(`Audio: ${state}`);
    });
  }
  if (testDupBtn) {
    testDupBtn.addEventListener("click", () => {
      initAudio();
      playDuplicate();
      const state = hasWebAudio
        ? audioCtx
          ? audioCtx.state
          : "no ctx"
        : "fallback";
      alert(`Audio: ${state}`);
    });
  }

  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener("click", () => {
      localStorage.setItem(ADMIN_NOTIF_KEY, "[]");
      renderAdminNotifications();
    });
  }

  if (switchUserBtn) {
    switchUserBtn.addEventListener("click", () => {
      adminModal.style.display = "none";
      if (loginModal) {
        loginModal.style.display = "flex";
        if (userSelect) userSelect.value = appData.currentUser;
        if (userPassword) userPassword.value = "";
      }
    });
  }

  if (backupNowBtn) {
    backupNowBtn.addEventListener("click", () => {
      const target = adminTargetUser
        ? adminTargetUser.value
        : appData.currentUser;
      doBackupForUser(target);
      renderBackupList();
      alert(`Backup saved for ${target}`);
    });
  }

  if (restoreBackupBtn && backupListEl) {
    restoreBackupBtn.addEventListener("click", () => {
      const all = getBackups();
      const opt = backupListEl.selectedOptions[0];
      if (!opt) {
        alert("Select a backup first");
        return;
      }
      const userAttr = opt.getAttribute("data-user");
      const tsAttr = parseInt(opt.getAttribute("data-ts") || "0", 10);
      const b = all.find((x) => x.user === userAttr && x.ts === tsAttr);
      if (!b) {
        alert("Backup not found");
        return;
      }
      const target = adminTargetUser ? adminTargetUser.value : b.user;
      saveUserData(target, b.data);
      if (target === appData.currentUser) {
        switchUser(target);
      }
      alert(`Restored backup for ${target}`);
    });
  }

  if (adminTargetUser) {
    adminTargetUser.addEventListener("change", () => {
      renderBackupList();
    });
  }

  const passwordUserSelect = document.getElementById("password-user-select");
  const passwordUserNew = document.getElementById("password-user-new");
  const setUserPasswordBtn = document.getElementById("set-user-password");
  const adminPasswordNew = document.getElementById("admin-password-new");
  const setAdminPasswordBtn = document.getElementById("set-admin-password");

  if (setUserPasswordBtn && passwordUserSelect && passwordUserNew) {
    setUserPasswordBtn.addEventListener("click", async () => {
      const u = passwordUserSelect.value;
      const pwd = passwordUserNew.value || "";
      if (!pwd) {
        alert("Enter a new password");
        return;
      }
      const h = await sha256Hex(USER_SALT + pwd);
      localStorage.setItem(USER_HASH_PREFIX + u, h);
      passwordUserNew.value = "";
      alert(`Password updated for ${u}`);
    });
  }

  if (setAdminPasswordBtn && adminPasswordNew) {
    setAdminPasswordBtn.addEventListener("click", async () => {
      const pwd = adminPasswordNew.value || "";
      if (!pwd) {
        alert("Enter a new admin password");
        return;
      }
      const h = await sha256Hex(ADMIN_SALT + pwd);
      localStorage.setItem(ADMIN_HASH_KEY, h);
      adminPasswordNew.value = "";
      alert("Admin password updated");
    });
  }

  /**
   * ====================================================================
   * APP START
   * ====================================================================
   */
  initializeApp();
  // Initialize admin hash on first load
  ensureAdminHash();
  ensureDefaultUserHashes();
});
