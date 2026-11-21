/* Gaulingo — homepage interactions & motion.
   Loaded after script.js (which owns i18n, menu and smooth scrolling). */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (n, a = 0, b = 1) => Math.min(Math.max(n, a), b);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const lang = localStorage.getItem("gaulingo_lang") === "id" ? "id" : "en";
  const L = (en, id) => (lang === "id" ? id : en);
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));
  const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

  const el = (tag, cls = "", text = "") => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  /* ------------------------------------------------------------------
     Word-mask split (hero title, phrase of the day)
  ------------------------------------------------------------------ */
  function splitWords(node, base = 0) {
    const label = node.textContent.replace(/\s+/g, " ").trim();
    const frag = document.createDocumentFragment();
    let i = 0;
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(" ");
          const w = el("span", "w");
          w.setAttribute("aria-hidden", "true");
          const s = el("span", "", part);
          s.style.setProperty("--i", i++);
          w.append(s);
          frag.append(w);
        });
      } else {
        frag.append(child.cloneNode(true));
      }
    });
    node.replaceChildren(frag);
    node.setAttribute("aria-label", label);
    node.classList.add("words");
    node.style.setProperty("--base", `${base}ms`);
  }

  const heroTitle = $("#hero-title");
  if (heroTitle) {
    splitWords(heroTitle, 120);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => heroTitle.classList.add("is-in")),
    );
  }

  /* ------------------------------------------------------------------
     Reveal system — one IntersectionObserver for everything
  ------------------------------------------------------------------ */
  $$("[data-stagger]").forEach((group) => {
    const step = parseInt(group.dataset.stagger, 10) || 80;
    $$("[data-reveal]", group).forEach((node, i) =>
      node.style.setProperty("--d", `${i * step}ms`),
    );
  });
  $$("[data-lines]").forEach((title) =>
    $$(".line__in", title).forEach((node, i) => node.style.setProperty("--i", i)),
  );
  $$(".gf [data-f]").forEach((node, i) =>
    node.style.setProperty("--d", `${i * 90}ms`),
  );

  const potdPhrase = $("#potd-phrase");
  if (potdPhrase) splitWords(potdPhrase, 220);

  // .gf is excluded: its reveal is driven by footer scroll progress (applyReveal) when
  // pinned behind <main>, and by the observer below otherwise.
  const revealTargets = $$("[data-reveal], [data-lines], #potd-phrase");  if ("IntersectionObserver" in window && !reduce) {
    // Clip-path reveals start fully clipped, and the browser counts a fully
    // clipped box as not visible — so those are observed through their parent.
    const hosts = new Map();
    const watched = new Set();
    revealTargets.forEach((node) => {
      const clipped = ["mask", "wipe"].includes(node.dataset.reveal);
      const host = clipped ? node.parentElement : node;
      if (!hosts.has(host)) hosts.set(host, []);
      hosts.get(host).push(node);
      watched.add(host);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            hosts.get(entry.target).forEach((node) => node.classList.add("is-in"));
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    watched.forEach((host) => io.observe(host));
  } else {
    revealTargets.forEach((node) => node.classList.add("is-in"));
  }

  // Page tone: the AI-buddy section warms the page background.
  const toneSections = $$("[data-bg]");
  if (toneSections.length && "IntersectionObserver" in window) {
    const toneIO = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) document.body.dataset.tone = entry.target.dataset.bg;
          else if (document.body.dataset.tone === entry.target.dataset.bg)
            delete document.body.dataset.tone;
        }),
      { rootMargin: "-40% 0px -40% 0px" },
    );
    toneSections.forEach((s) => toneIO.observe(s));
  }

  /* ------------------------------------------------------------------
     Scroll-linked values — a single rAF-throttled handler
  ------------------------------------------------------------------ */
  const hero = $("#home");
  const cta = $("#cta");
  const ring = $("#gf-ring");
  let maxScroll = 1;
  let ticking = false;

  const measure = () => {
    maxScroll = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      if (hero && !reduce) {
        const h = hero.offsetHeight;
        if (y < h * 1.15) hero.style.setProperty("--hero-p", clamp(y / h).toFixed(4));
        // The sticky hero sits under .sheet once scrolled past; stop painting it.
        hero.classList.toggle("is-covered", y > h + innerHeight);
      }
      if (ring) ring.style.setProperty("--p", clamp(y / maxScroll).toFixed(4));
      if (cta && !reduce) {
        const r = cta.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight)
          cta.style.setProperty(
            "--cta-p",
            clamp((innerHeight - r.top) / (innerHeight + r.height)).toFixed(4),
          );
      }
    });
  };
  measure();
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);
  window.addEventListener("resize", measure);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------
     Audio — real files where we have them, the browser voice otherwise.
     Never pretends to play: state follows actual playback events.
  ------------------------------------------------------------------ */
  let active = null;
  const stopAudio = () => {
    if (!active) return;
    const session = active;
    active = null;
    session.stop();
  };

  function playPhrase({ text, src, rate = 1, onState }) {
    stopAudio();
    const session = { finished: false, node: null, timer: 0 };
    const finish = (ok = true) => {
      if (session.finished) return;
      session.finished = true;
      clearTimeout(session.timer);
      if (active === session) active = null;
      onState(false, ok);
    };
    session.stop = () => {
      if (session.node) {
        session.node.pause();
        session.node = null;
      }
      try {
        window.speechSynthesis?.cancel();
      } catch (_) {}
      finish(true);
    };
    active = session;

    const useVoice = () => {
      if (!("speechSynthesis" in window) || !text) return finish(false);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "id-ID";
      u.rate = rate;
      const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("id"));
      if (voice) u.voice = voice;
      u.onstart = () => {
        clearTimeout(session.timer);
        onState(true);
      };
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      session.timer = setTimeout(() => {
        if (!session.finished) {
          speechSynthesis.cancel();
          finish(false);
        }
      }, 2500);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    };

    if (src) {
      const audio = new Audio(src);
      session.node = audio;
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      audio.onplaying = () => onState(true);
      audio.onended = () => finish(true);
      audio.onerror = () => {
        session.node = null;
        useVoice();
      };
      audio.play().catch(() => {
        session.node = null;
        useVoice();
      });
    } else {
      useVoice();
    }
  }

  const setBtnPlaying = (btn, playing) => {
    btn.classList.toggle("is-playing", playing);
    const icon = $("i", btn);
    if (icon && btn.classList.contains("play-btn")) {
      icon.classList.toggle("ph-play", !playing);
      icon.classList.toggle("ph-pause", playing);
    }
    btn.setAttribute("aria-pressed", String(playing));
  };

  // Generic play buttons (stall card, chat answers)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".play-btn[data-say]");
    if (!btn) return;
    if (btn.classList.contains("is-playing")) return stopAudio();
    playPhrase({
      text: btn.dataset.say,
      src: btn.dataset.audio,
      rate: Number(btn.dataset.rate) || 1,
      onState: (playing, ok) => {
        setBtnPlaying(btn, playing);
        if (ok === false) btn.title = L("Audio isn't available in this browser.", "Audio tidak tersedia di browser ini.");
      },
    });
  });

  /* ------------------------------------------------------------------
     Three steps (tabs → listen → quiz)
  ------------------------------------------------------------------ */
  const SITUATIONS = {
    stall: [
      { t: "Berapa harganya?", en: "How much is this?", id: "Menanyakan harga barang", src: "./src/assets/audio/berapa-harganya.mp3" },
      { t: "Boleh kurang?", en: "Can it be cheaper?", id: "Menawar harga dengan sopan", src: "./src/assets/audio/boleh-kurang.mp3" },
      { t: "Terima kasih, Bu!", en: "Thank you, ma'am!", id: "Berterima kasih kepada penjual", src: "./src/assets/audio/terimakasih-bu.mp3" },
    ],
    school: [
      { t: "Permisi, Bu Guru.", en: "Excuse me, teacher.", id: "Menyapa guru dengan sopan" },
      { t: "Boleh saya bertanya?", en: "May I ask a question?", id: "Meminta izin bertanya" },
      { t: "Saya belum mengerti.", en: "I don't understand yet.", id: "Mengatakan belum paham" },
    ],
    transit: [
      { t: "Kiri, Bang!", en: "Stop on the left, please!", id: "Meminta sopir berhenti" },
      { t: "Berapa ongkosnya?", en: "What's the fare?", id: "Menanyakan tarif" },
      { t: "Lewat pasar, ya?", en: "Does this go past the market?", id: "Memastikan rute angkot" },
    ],
    intro: [
      { t: "Apa kabar?", en: "How are you?", id: "Menyapa dan menanyakan kabar" },
      { t: "Nama saya Gali.", en: "My name is Gali.", id: "Memperkenalkan diri" },
      { t: "Senang berkenalan!", en: "Nice to meet you!", id: "Mengungkapkan rasa senang bertemu" },
    ],
    emergency: [
      { t: "Tolong!", en: "Help!", id: "Meminta pertolongan" },
      { t: "Saya butuh dokter.", en: "I need a doctor.", id: "Meminta dokter" },
      { t: "Tolong panggil ambulans!", en: "Please call an ambulance!", id: "Meminta ambulans" },
    ],
  };
  const meaningOf = (p) => (lang === "id" ? p.id : p.en);
  const bare = (s) => s.replace(/[.!?]+$/, "");

  const how = $("#how");
  if (how) {
    const tabs = $$(".how-step", how);
    const panels = $$(".how-panel", how);
    const state = { step: 1, sit: "stall", idx: 0, speed: 1, q: 0, score: 0, streak: 0 };
    const phrases = () => SITUATIONS[state.sit];
    const motionOpts = { duration: 450, easing: ease };

    // --- step switching
    const setStep = (n, { focus = false } = {}) => {
      stopAudio();
      state.step = n;
      tabs.forEach((tab, i) => {
        const on = i + 1 === n;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      panels.forEach((panel) => {
        const on = Number(panel.dataset.panel) === n;
        panel.hidden = !on;
        panel.classList.toggle("is-active", on);
      });
      if (n === 2) renderPhrase(false);
      if (n === 3) renderQuiz();
      if (focus) tabs[n - 1].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => setStep(i + 1));
      tab.addEventListener("keydown", (e) => {
        const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        let next = null;
        if (e.key in keys) next = (i + keys[e.key] + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        setStep(next + 1, { focus: true });
      });
    });
    $$("[data-go-step]", how).forEach((btn) =>
      btn.addEventListener("click", () => setStep(Number(btn.dataset.goStep))),
    );

    // --- step 1: pick a place
    const sitButtons = $$(".how-sit__btn[data-sit]", how);
    const previewList = $("#how-preview-list");
    const renderPreview = () => {
      previewList.replaceChildren(
        ...phrases().map((p, i) => {
          const li = el("li", "preview-chip", p.t);
          li.style.setProperty("--k", i);
          return li;
        }),
      );
    };
    sitButtons.forEach((btn) =>
      btn.addEventListener("click", () => {
        state.sit = btn.dataset.sit;
        state.idx = 0;
        state.q = 0;
        sitButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        renderPreview();
      }),
    );
    renderPreview();

    // --- step 2: listen & repeat
    const phraseEl = $("#how-phrase");
    const meaningEl = $("#how-phrase-meaning");
    const countEl = $("#how-count");
    const audioBox = $("#how-audio");
    const playBtn = $("#how-audio-play");
    const note = $("#how-audio-note");
    const noAudio = L("Audio isn't available in this browser.", "Audio tidak tersedia di browser ini.");

    const renderPhrase = (animate = true) => {
      stopAudio();
      const p = phrases()[state.idx];
      phraseEl.textContent = p.t;
      meaningEl.textContent = `"${meaningOf(p)}"`;
      countEl.textContent = `${state.idx + 1} / ${phrases().length}`;
      note.textContent = "";
      if (animate && !reduce) {
        phraseEl.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], motionOpts);
        meaningEl.animate([{ opacity: 0 }, { opacity: 1 }], { ...motionOpts, delay: 80, fill: "backwards" });
      }
    };
    const cycle = (dir) => {
      state.idx = (state.idx + dir + phrases().length) % phrases().length;
      renderPhrase();
    };
    $("#how-prev").addEventListener("click", () => cycle(-1));
    $("#how-next").addEventListener("click", () => cycle(1));

    const setPlaying = (playing) => {
      audioBox.classList.toggle("is-playing", playing);
      const icon = $("i", playBtn);
      icon.classList.toggle("ph-play", !playing);
      icon.classList.toggle("ph-pause", playing);
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    };
    playBtn.addEventListener("click", () => {
      if (audioBox.classList.contains("is-playing")) return stopAudio();
      const p = phrases()[state.idx];
      note.textContent = "";
      playPhrase({
        text: p.t,
        src: p.src,
        rate: state.speed,
        onState: (playing, ok) => {
          setPlaying(playing);
          if (ok === false) note.textContent = noAudio;
        },
      });
    });
    const speedBtns = $$("[data-speed]", how);
    speedBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        state.speed = Number(btn.dataset.speed);
        speedBtns.forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
      }),
    );

    // --- step 3: quiz
    const quizQ = $("#quiz-q");
    const quizOptions = $("#quiz-options");
    const quizFeedback = $("#quiz-feedback");
    const quizNext = $("#quiz-next");
    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    function renderQuiz() {
      const list = phrases();
      const answer = list[state.q % list.length];
      quizQ.textContent = L(`Which one means “${bare(meaningOf(answer))}”?`, `Mana yang artinya “${bare(meaningOf(answer))}”?`);
      quizFeedback.replaceChildren();
      quizNext.hidden = true;
      quizOptions.replaceChildren(
        ...shuffle(list).map((p) => {
          const btn = el("button", "quiz-opt");
          btn.type = "button";
          btn.dataset.correct = String(p === answer);
          btn.append(el("span", "", p.t));
          const icon = el("i", "text-2xl");
          icon.setAttribute("aria-hidden", "true");
          btn.append(icon);
          btn.addEventListener("click", () => answerQuiz(btn));
          return btn;
        }),
      );
    }
    function answerQuiz(chosen) {
      const correct = chosen.dataset.correct === "true";
      $$(".quiz-opt", quizOptions).forEach((btn) => {
        btn.disabled = true;
        const isRight = btn.dataset.correct === "true";
        const icon = $("i", btn);
        if (btn === chosen) {
          btn.classList.add(correct ? "is-correct" : "is-wrong");
          icon.className = `ph-fill ${correct ? "ph-check-circle" : "ph-x-circle"} text-2xl`;
        } else if (isRight) {
          btn.classList.add("is-correct");
          icon.className = "ph-fill ph-check-circle text-2xl";
        } else {
          btn.classList.add("is-dim");
        }
      });
      state.streak = correct ? state.streak + 1 : 0;
      if (correct) state.score += 10;
      const badges = correct
        ? [[L("Nice one!", "Mantap!"), "bg-matahari font-bold"], [L("+10 points", "+10 poin"), "bg-pasir"], [L(`Streak: ${state.streak}`, `Beruntun: ${state.streak}`), "bg-biru-muda"]]
        : [[L("Oops!", "Ups!"), "bg-matahari font-bold"], [L("+0 points", "+0 poin"), "bg-pasir"], [L("Streak reset", "Beruntun diulang"), "bg-biru-muda"]];
      quizFeedback.replaceChildren(
        ...badges.map(([text, cls], i) => {
          const badge = el("span", `quiz-badge ${cls}`, text);
          badge.style.setProperty("--k", i);
          return badge;
        }),
        el("span", "text-sm font-semibold text-nila/70", L(`Score: ${state.score}`, `Skor: ${state.score}`)),
      );
      quizNext.hidden = false;
      quizNext.focus({ preventScroll: true });
    }
    quizNext.addEventListener("click", () => {
      state.q += 1;
      renderQuiz();
    });
  }

  /* ------------------------------------------------------------------
     Phrase of the day
  ------------------------------------------------------------------ */
  const potd = $(".potd");
  if (potd) {
    const DATA = {
      id: { t: "Terima kasih banyak!", pron: "teh-REE-mah KAH-see BAH-nyak", en: "Thank you very much!", idm: "Terima kasih banyak!", approx: false },
      su: { t: "Hatur nuhun pisan!", pron: "hah-toor noo-hoon pee-sahn", en: "Thank you very much!", idm: "Terima kasih banyak!", approx: true },
    };
    const phraseNode = $("#potd-phrase");
    const pron = $("#potd-pronunciation");
    const meaning = $("#potd-meaning");
    const note = $("#potd-note");
    const toggle = $(".potd__toggle");
    const toggleBtns = $$("[data-potd-lang]", toggle);
    const listen = $("#potd-listen");
    const slow = $("#potd-slow");
    let key = "id";

    const render = () => {
      const d = DATA[key];
      phraseNode.textContent = d.t;
      splitWords(phraseNode, 60);
      phraseNode.classList.remove("is-in");
      void phraseNode.offsetWidth;
      requestAnimationFrame(() => phraseNode.classList.add("is-in"));
      pron.textContent = d.pron;
      meaning.textContent = `"${lang === "id" ? d.idm : d.en}"`;
      note.textContent = "";
      if (!reduce) {
        [pron, meaning].forEach((node, i) =>
          node.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: ease, delay: 120 + i * 60, fill: "backwards" }),
        );
      }
    };
    toggleBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.potdLang === key) return;
        stopAudio();
        key = btn.dataset.potdLang;
        toggle.dataset.active = key;
        toggleBtns.forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        render();
      }),
    );

    const speak = (rate, btn) => {
      const d = DATA[key];
      if (btn.classList.contains("is-playing")) return stopAudio();
      note.textContent = "";
      playPhrase({
        text: d.t,
        rate,
        onState: (playing, ok) => {
          potd.classList.toggle("is-playing", playing);
          btn.classList.toggle("is-playing", playing);
          if (playing && d.approx)
            note.textContent = L("Sunda is read by an Indonesian voice, so it is approximate.", "Bahasa Sunda dibacakan suara Indonesia, jadi hanya mendekati.");
          if (ok === false) note.textContent = L("Audio isn't available in this browser.", "Audio tidak tersedia di browser ini.");
        },
      });
    };
    listen.addEventListener("click", () => speak(1, listen));
    slow.addEventListener("click", () => speak(0.6, slow));
  }

  // Culture tips dialog
  const dialog = $("#modal-budaya");
  if (dialog) {
    const closeLenis = () => typeof lenis !== "undefined" && lenis?.start();
    $$("[data-open-tips]").forEach((btn) =>
      btn.addEventListener("click", () => {
        dialog.showModal();
        if (typeof lenis !== "undefined") lenis?.stop();
      }),
    );
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", closeLenis);
  }

  /* ------------------------------------------------------------------
     Gali — honest demo. Built-in answers for a handful of topics;
     if a Gemini key is stored in localStorage ("gaulingo_gemini_key")
     the same UI uses it for live answers.
  ------------------------------------------------------------------ */
  const T = (en, id) => ({ en, id });
  const TOPICS = {
    spicy: {
      keys: ["spicy", "pedas", "pedes"],
      q: T("How do I ask for food that's not spicy?", "Gimana cara minta makanan yang tidak pedas?"),
      phrase: T("Nggak pedas, ya.", "Nggak pedas, ya."),
      say: "Nggak pedas, ya.",
      src: "./src/assets/audio/gak-pedes-ya.mp3",
      mean: T("“Not spicy, please.”", "“Jangan pedas, ya.”"),
      tip: T("Adding ya softens it.", "Menambah “ya” membuatnya lebih halus."),
    },
    bang: {
      keys: ["bang", "abang", "polite", "sopan"],
      q: T("Is “Bang” polite?", "Apakah “Bang” sopan?"),
      phrase: T("Yes — to a younger man.", "Ya — untuk pria yang lebih muda."),
      mean: T("", ""),
      tip: T("Use “Pak” if he looks older than you.", "Pakai “Pak” kalau dia tampak lebih tua darimu."),
    },
    bargain: {
      keys: ["bargain", "tawar", "kurang", "cheaper", "murah"],
      q: T("Teach me to bargain", "Ajarin cara menawar harga"),
      phrase: T("Boleh kurang?", "Boleh kurang?"),
      say: "Boleh kurang?",
      src: "./src/assets/audio/boleh-kurang.mp3",
      mean: T("“Can it be cheaper?”", "“Bisa lebih murah?”"),
      tip: T("Smile first, ask second, and thank them either way.", "Senyum dulu, baru tanya, dan tetap bilang terima kasih."),
    },
    gas: {
      keys: ["gas"],
      q: T("What does “gas” mean?", "Apa arti kata “gas”?"),
      phrase: T("Gas, yuk!", "Gas, yuk!"),
      say: "Gas, yuk!",
      mean: T("“Let's go!”", "“Ayo berangkat!”"),
      tip: T("Slang for “let's do it” — friends say it when a plan is on.", "Bahasa gaul untuk “ayo lakukan” — dipakai saat rencana sudah pasti."),
    },
    price: {
      keys: ["price", "how much", "harga", "berapa"],
      q: T("How do I ask the price?", "Gimana cara tanya harga?"),
      phrase: T("Berapa harganya?", "Berapa harganya?"),
      say: "Berapa harganya?",
      src: "./src/assets/audio/berapa-harganya.mp3",
      mean: T("“How much is this?”", "“Harganya berapa?”"),
      tip: T("Point at the item and say it with a smile.", "Tunjuk barangnya sambil tersenyum."),
    },
    thanks: {
      keys: ["thank", "terima kasih", "makasih"],
      q: T("How do I say thank you?", "Gimana cara bilang terima kasih?"),
      phrase: T("Terima kasih, Bu!", "Terima kasih, Bu!"),
      say: "Terima kasih, Bu!",
      src: "./src/assets/audio/terimakasih-bu.mp3",
      mean: T("“Thank you, ma'am!”", "“Terima kasih, Bu!”"),
      tip: T("Use “Pak” for a man, “Bu” for a woman.", "Pakai “Pak” untuk laki-laki, “Bu” untuk perempuan."),
    },
    bumbak: {
      keys: ["mbak", "bu or", "ibu"],
      q: T("Bu or Mbak, which one do I use?", "Bu atau Mbak, mana yang dipakai?"),
      phrase: T("Permisi, Bu.", "Permisi, Bu."),
      say: "Permisi, Bu.",
      mean: T("“Excuse me, ma'am.”", "“Permisi, Bu.”"),
      tip: T("“Mbak” suits a younger woman; when unsure, “Bu” is safe.", "“Mbak” untuk perempuan muda; kalau ragu, “Bu” aman."),
    },
    plastic: {
      keys: ["plastic", "plastik"],
      q: T("How do I say “no plastic bag”?", "Gimana bilang “tidak usah kantong plastik”?"),
      phrase: T("Nggak usah kantong plastik.", "Nggak usah kantong plastik."),
      say: "Nggak usah kantong plastik, ya.",
      mean: T("“No plastic bag, please.”", "“Tidak usah pakai kantong plastik.”"),
      tip: T("Say it before they start packing.", "Ucapkan sebelum barang dibungkus."),
    },
    change: {
      keys: ["kembalian", "change"],
      q: T("What does “kembalian” mean?", "Apa arti “kembalian”?"),
      phrase: T("Ini kembaliannya.", "Ini kembaliannya."),
      say: "Ini kembaliannya.",
      mean: T("“Here's your change.”", "“Uang kembalian Anda.”"),
      tip: T("Sellers say it when they hand back money.", "Penjual mengucapkannya saat memberi uang kembali."),
    },
  };
  const FALLBACK = {
    q: T("", ""),
    phrase: T("Permisi, mau tanya…", "Permisi, mau tanya…"),
    say: "Permisi, mau tanya.",
    mean: T("“Excuse me, may I ask…”", "“Permisi, boleh bertanya…”"),
    tip: T("Demo mode: I only know a handful of topics. Try one of the suggested questions.", "Mode demo: aku baru tahu beberapa topik. Coba salah satu pertanyaan yang disarankan."),
    fallback: true,
  };
  const pick = (v) => v[lang];
  const findTopic = (text) => {
    const q = text.toLowerCase();
    return Object.values(TOPICS).find((t) => t.keys.some((k) => q.includes(k))) || FALLBACK;
  };

  async function askGemini(question) {
    let key = "";
    try {
      key = (localStorage.getItem("gaulingo_gemini_key") || "").trim();
    } catch (_) {}
    if (!key) return null;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: `You are Gali, a warm Indonesian language buddy. Reply in ${lang === "id" ? "Bahasa Indonesia" : "simple English"}. Return JSON with: phrase (the Indonesian phrase to say), meaning (its translation in quotes), tip (one short etiquette or pronunciation tip).` }],
            },
            contents: [{ role: "user", parts: [{ text: question }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: { phrase: { type: "STRING" }, meaning: { type: "STRING" }, tip: { type: "STRING" } },
                required: ["phrase", "meaning", "tip"],
              },
            },
          }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      return { phrase: T(parsed.phrase, parsed.phrase), say: parsed.phrase, mean: T(parsed.meaning, parsed.meaning), tip: T(parsed.tip, parsed.tip) };
    } catch (err) {
      console.warn("Gali live answer failed, using demo answer:", err);
      return null;
    }
  }
  const answerFor = async (text) => (await askGemini(text)) || findTopic(text);

  const avatarSrc = "./src/assets/Illustration.png";
  const playButton = (topic, cls = "") => {
    const b = el("button", `play-btn ${cls}`);
    b.type = "button";
    b.dataset.say = topic.say;
    if (topic.src) b.dataset.audio = topic.src;
    b.setAttribute("aria-label", `Play: ${topic.say}`);
    b.innerHTML = '<i class="ph-fill ph-play"></i>';
    return b;
  };

  // --- inline editorial chat
  const gchat = $("#gchat");
  if (gchat) {
    let chain = Promise.resolve();
    const row = (cls) => {
      const r = el("div", `gchat__row ${cls} is-new`);
      return r;
    };
    const userRow = (text) => {
      const r = row("gchat__row--user");
      r.append(el("p", "gchat__user", text));
      return r;
    };
    const typingRow = () => {
      const r = row("gchat__row--gali");
      const img = el("img", "gchat__avatar");
      img.src = avatarSrc;
      img.alt = "";
      const dots = el("div", "gchat__typing");
      dots.setAttribute("aria-label", L("Gali is typing", "Gali sedang mengetik"));
      dots.append(el("span"), el("span"), el("span"));
      r.append(img, dots);
      return r;
    };
    const galiRow = (topic) => {
      const r = row("gchat__row--gali");
      const img = el("img", "gchat__avatar");
      img.src = avatarSrc;
      img.alt = "";
      const body = el("div");
      body.append(el("h3", "gchat__phrase", pick(topic.phrase)));
      const meaning = el("p", "gchat__meaning");
      const text = [pick(topic.mean), topic.fallback ? "" : pick(topic.tip)].filter(Boolean).join(" ");
      if (text) meaning.append(el("span", "", text));
      if (topic.say) meaning.append(playButton(topic));
      body.append(meaning);
      if (topic.fallback) body.append(el("p", "gchat__note", pick(topic.tip)));
      r.append(img, body);
      return r;
    };
    const trim = async () => {
      const rows = $$(".gchat__row", gchat);
      if (rows.length < 4) return;
      const old = rows.slice(0, rows.length - 2);
      old.forEach((r) => r.classList.add("is-leaving"));
      await sleep(450);
      old.forEach((r) => r.remove());
    };
    const exchange = async (question, topicPromise) => {
      await trim();
      gchat.append(userRow(question));
      await sleep(500);
      const typing = typingRow();
      gchat.append(typing);
      const [topic] = await Promise.all([topicPromise, sleep(1000)]);
      typing.remove();
      gchat.append(galiRow(topic));
    };
    const enqueue = (question, topicPromise) => {
      chain = chain.then(() => exchange(question, topicPromise)).catch(() => {});
      return chain;
    };

    // Autoplay the first two exchanges when the section scrolls into view.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      gchat.replaceChildren();
      enqueue(pick(TOPICS.spicy.q), Promise.resolve(TOPICS.spicy));
      enqueue(pick(TOPICS.bang.q), Promise.resolve(TOPICS.bang));
    };
    if ("IntersectionObserver" in window) {
      const startIO = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            startIO.disconnect();
            start();
          }
        },
        { threshold: 0.35 },
      );
      startIO.observe(gchat);
    } else {
      start();
    }

    $$("[data-prompt]").forEach((btn) =>
      btn.addEventListener("click", () => {
        started = true;
        const topic = TOPICS[btn.dataset.prompt];
        enqueue(pick(topic.q), Promise.resolve(topic));
      }),
    );
    const form = $("#gchat-form");
    const input = $("#gchat-input");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      started = true;
      enqueue(text, answerFor(text));
    });
  }

  // --- drawer (compact chat)
  const drawer = $("#gali-drawer");
  if (drawer) {
    const backdrop = $("#gali-drawer-backdrop");
    const body = $("#gali-drawer-body");
    const form = $("#gali-drawer-form");
    const input = $("#gali-drawer-input");
    const closeBtn = $("#gali-drawer-close");
    let opener = null;
    let hasMessages = false;

    const PRESETS = ["bargain", "bumbak", "plastic", "change"];
    const renderEmpty = () => {
      body.replaceChildren();
      hasMessages = false;
      const box = el("div", "my-auto flex flex-col items-center gap-3 py-4 text-center");
      const img = el("img", "size-16 rounded-full bg-biru-muda object-cover");
      img.src = avatarSrc;
      img.alt = "";
      box.append(img, el("h4", "text-lg font-bold text-nila", L("Hi! I'm Gali.", "Hai! Aku Gali.")), el("p", "max-w-65 text-xs leading-relaxed text-nila/75", L("Ask me how to say anything. Here are a few to start with:", "Tanya cara mengucapkan apa saja. Beberapa untuk memulai:")));
      const list = el("div", "mt-2 flex w-full flex-col gap-2");
      list.append(el("p", "text-left text-[10px] font-bold uppercase tracking-wider text-nila/55", L("Try asking", "Coba tanyakan")));
      PRESETS.forEach((k) => {
        const b = el("button", "w-full cursor-pointer rounded-full border border-nila/40 px-4 py-2.5 text-left text-xs font-semibold text-nila transition-colors hover:bg-nila hover:text-white", pick(TOPICS[k].q));
        b.type = "button";
        b.addEventListener("click", () => send(pick(TOPICS[k].q), Promise.resolve(TOPICS[k])));
        list.append(b);
      });
      box.append(list, el("p", "mt-2 text-[10px] text-nila/55", L("Gali can make mistakes. Check important info with a local.", "Gali bisa saja salah. Pastikan informasi penting dengan warga lokal.")));
      body.append(box);
    };
    const bubbleUser = (text) => {
      const wrap = el("div", "gali-msg flex justify-end");
      wrap.append(el("div", "max-w-[82%] rounded-2xl rounded-br-sm bg-nila px-4 py-2.5 text-xs font-medium leading-relaxed text-white", text));
      return wrap;
    };
    const bubbleTyping = () => {
      const wrap = el("div", "gali-msg flex items-center gap-2.5");
      const img = el("img", "size-7 shrink-0 rounded-full bg-biru-muda object-cover");
      img.src = avatarSrc;
      img.alt = "";
      const dots = el("div", "gchat__typing rounded-2xl border border-nila/15 bg-white px-4 py-3");
      dots.append(el("span"), el("span"), el("span"));
      wrap.append(img, dots);
      return wrap;
    };
    const bubbleGali = (topic) => {
      const wrap = el("div", "gali-msg flex items-end gap-2.5");
      const img = el("img", "size-7 shrink-0 rounded-full bg-biru-muda object-cover");
      img.src = avatarSrc;
      img.alt = "";
      const card = el("div", "flex max-w-[86%] flex-col gap-2.5 rounded-2xl rounded-bl-sm border border-nila/15 bg-white p-3.5");
      const phrase = el("div", "flex items-center justify-between gap-3 rounded-xl bg-krem p-3");
      const text = el("div");
      text.append(el("p", "text-sm font-bold text-nila", pick(topic.phrase)));
      if (pick(topic.mean)) text.append(el("p", "mt-0.5 text-xs text-nila/65", pick(topic.mean)));
      phrase.append(text);
      if (topic.say) {
        const p = playButton(topic, "size-9! text-xs");
        phrase.append(p);
      }
      card.append(phrase, el("p", "text-[11px] leading-relaxed text-nila/70", pick(topic.tip)));
      wrap.append(img, card);
      return wrap;
    };
    let busy = false;
    const send = async (question, topicPromise) => {
      if (busy) return;
      busy = true;
      if (!hasMessages) {
        hasMessages = true;
        body.replaceChildren();
      }
      body.append(bubbleUser(question));
      const typing = bubbleTyping();
      body.append(typing);
      body.scrollTo({ top: body.scrollHeight, behavior: reduce ? "auto" : "smooth" });
      const [topic] = await Promise.all([topicPromise, sleep(900)]);
      typing.remove();
      body.append(bubbleGali(topic));
      body.scrollTo({ top: body.scrollHeight, behavior: reduce ? "auto" : "smooth" });
      busy = false;
    };

    const open = (from) => {
      if (typeof setMenu === "function") setMenu(false);
      opener = from || document.activeElement;
      drawer.inert = false;
      drawer.setAttribute("aria-hidden", "false");
      drawer.classList.add("is-open");
      backdrop.classList.add("is-open");
      document.body.classList.add("is-drawer");
      setTimeout(() => input.focus({ preventScroll: true }), 250);
    };
    const close = () => {
      drawer.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      drawer.inert = true;
      document.body.classList.remove("is-drawer");
      stopAudio();
      opener?.focus?.({ preventScroll: true });
    };
    renderEmpty();
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-open-gali]");
      if (!trigger) return;
      e.preventDefault();
      open(trigger);
    });
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) close();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      send(text, answerFor(text));
    });
  }

  /* ------------------------------------------------------------------
     FAQ accordion
  ------------------------------------------------------------------ */
  const faqItems = $$(".faq-item");
  if (faqItems.length) {
    const setFaq = (item, open) => {
      const btn = $(".faq-q", item);
      const panel = $(".faq-a", item);
      item.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
      panel.inert = !open;
    };
    const buttons = faqItems.map((item) => $(".faq-q", item));
    faqItems.forEach((item, i) => {
      const btn = buttons[i];
      btn.addEventListener("click", () => {
        const willOpen = !item.classList.contains("is-open");
        faqItems.forEach((other) => setFaq(other, other === item && willOpen));
      });
      btn.addEventListener("keydown", (e) => {
        let next = null;
        if (e.key === "ArrowDown") next = (i + 1) % buttons.length;
        else if (e.key === "ArrowUp") next = (i - 1 + buttons.length) % buttons.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = buttons.length - 1;
        if (next === null) return;
        e.preventDefault();
        buttons[next].focus();
      });
    });
  }

  /* ------------------------------------------------------------------
     Footer: back-to-top, floating button hand-off, cursor-reactive G
  ------------------------------------------------------------------ */
  const footer = $("#site-footer");
  const toTop = $("#scroll-to-top");
  if (toTop) {
    toTop.addEventListener("click", () => {
      if (typeof scrollToY === "function") scrollToY(0);
      else window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  }
  const main = $("#main-content");
  const root = document.documentElement;
  let revealOn = false;
  let footerH = 0;
  const smooth = (t) => t * t * (3 - 2 * t);

  // Footer reveal: <main> lifts + scales away from a footer pinned behind it.
  // Only used when the footer fits the viewport and motion is allowed;
  // otherwise the footer stays a normal block (small screens, reduced motion).
  const applyReveal = () => {
    if (!revealOn) return;
    const maxY = document.documentElement.scrollHeight - innerHeight;
    const p = clamp((window.scrollY - (maxY - footerH)) / footerH);
    main.style.setProperty("--reveal-p", smooth(p).toFixed(4));
    main.classList.toggle("is-lifting", p > 0);
    footer.classList.toggle("is-in", p > 0.18);
    document.body.classList.toggle("is-footer", p > 0.5);
  };
  const setupReveal = () => {
    const h = footer ? footer.offsetHeight : 0;
    const want = !!(footer && main) && !reduce && h > 0 && h <= innerHeight * 0.92 && innerWidth >= 768;
    if (want !== revealOn) {
      revealOn = want;
      root.classList.toggle("has-reveal", want);
      if (!want) {
        main.classList.remove("is-lifting");
        main.style.removeProperty("--reveal-p");
        root.style.removeProperty("--footer-h");
      }
    }
    if (!want && footer) footer.classList.add("is-in");
    if (want) {
      footerH = h;
      root.style.setProperty("--footer-h", h + "px");
      applyReveal();
    }
  };
  setupReveal();
  window.addEventListener("resize", setupReveal);
  window.addEventListener("load", setupReveal);
  window.addEventListener("scroll", applyReveal, { passive: true });
  if ("ResizeObserver" in window && footer) new ResizeObserver(setupReveal).observe(footer);

  if (footer && "IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        if (!revealOn) document.body.classList.toggle("is-footer", entry.isIntersecting);
      },
      { rootMargin: "0px 0px -20% 0px" },
    ).observe(footer);
  }

  const mark = $("#gf-mark");
  const g = $("#gf-g");
  if (footer && mark && g && finePointer && !reduce) {
    const target = { x: 0, y: 0, r: 0 };
    const cur = { x: 0, y: 0, r: 0 };
    let raf = 0;
    const loop = () => {
      cur.x += (target.x - cur.x) * 0.1;
      cur.y += (target.y - cur.y) * 0.1;
      cur.r += (target.r - cur.r) * 0.1;
      g.style.setProperty("--tx", `${cur.x.toFixed(2)}px`);
      g.style.setProperty("--ty", `${cur.y.toFixed(2)}px`);
      g.style.setProperty("--rot", `${cur.r.toFixed(3)}deg`);
      const settled = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) + Math.abs(target.r - cur.r) < 0.02;
      raf = settled ? 0 : requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    footer.addEventListener("pointermove", (e) => {
      const rect = mark.getBoundingClientRect();
      const nx = clamp((e.clientX - (rect.left + rect.width / 2)) / (innerWidth / 2), -1, 1);
      const ny = clamp((e.clientY - (rect.top + rect.height / 2)) / (innerHeight / 2), -1, 1);
      target.x = nx * 16;
      target.y = ny * 8;
      target.r = nx * 3;
      kick();
    });
    footer.addEventListener("pointerleave", () => {
      target.x = target.y = target.r = 0;
      kick();
    });
  }
})();
