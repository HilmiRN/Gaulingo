document.querySelectorAll("[data-roll]").forEach((el) => {
  const text = el.textContent.trim();
  const chars = [...text]
    .map((ch, i) => {
      const c = ch === " " ? "&nbsp;" : ch;
      return `<span class="roll-char" style="--i: ${i}"><span class="roll-top">${c}</span><span class="roll-bot">${c}</span></span>`;
    })
    .join("");
  el.innerHTML = `<span class="sr-only">${text}</span><span class="roll inline-flex" aria-hidden="true">${chars}</span>`;
});
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lenis =
  !reduceMotion && window.Lenis
    ? new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: true })
    : null;
if (lenis) {
  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
const scrollToY = (y) =>
  lenis
    ? lenis.scrollTo(y, { duration: 1.4 })
    : window.scrollTo({
        top: y,
        behavior: reduceMotion ? "auto" : "smooth",
      });

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  const target =
    a.getAttribute("href").length > 1 &&
    document.querySelector(a.getAttribute("href"));
  if (!target) return;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    scrollToY(target.getBoundingClientRect().top + window.scrollY);
  });
});

const header = document.getElementById("site-header");
const menu = document.getElementById("site-menu");
const menuToggle = document.getElementById("menu-toggle");

const setMenu = (open) => {
  if (!header || !menu || !menuToggle) return;
  header.classList.toggle("is-nav-open", open);
  menu.classList.toggle("is-open", open);
  menu.toggleAttribute("inert", !open);
  menu.setAttribute("aria-hidden", String(!open));
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.documentElement.style.overflow = open ? "hidden" : "";
  if (lenis) open ? lenis.stop() : lenis.start();
};

if (menuToggle && menu) {
  menuToggle.addEventListener("click", () =>
    setMenu(!menu.classList.contains("is-open")),
  );
}

document.addEventListener("keydown", (e) => {
  if (!menu || !menuToggle) return;
  if (e.key === "Escape" && menu.classList.contains("is-open")) {
    setMenu(false);
    menuToggle.focus();
  }
});

const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
if (header) {
  import("./src/liquid-glass.js")
    .then(({ createGlass }) => {
      const glass = header.querySelector(".site-header__glass");
      if (!glass) return;
      createGlass(glass, {
        mode: "backdrop",
        fit: true,
        radius: 999,
        refraction: 30,
        bezel: 0.6,
        curvature: 4,
        ior: 1.5,
        chroma: 0.14,
        blur: 1.5,
        specular: 0.7,
        specularWidth: 2.5,
        lightAngle: -120,
        fallback: "blur(10px) saturate(1.7)",
      });
    })
    .catch(() => {});
}

const hero = document.getElementById("home");
if (hero) {
  const updateHero = () => {
    if (reduceMotion) return;
    const p = clamp01(window.scrollY / window.innerHeight);
    hero.style.setProperty("--hero-p", p.toFixed(4));
  };
  updateHero();
  window.addEventListener("scroll", updateHero, { passive: true });
}

if (header) {
  const updateHeader = () =>
    header.classList.toggle("is-visible", window.scrollY > 80);

  window.addEventListener("scroll", updateHeader, { passive: true });
}
const howTrack = document.getElementById("how-track");
if (howTrack) {
  const howPin = howTrack.querySelector(".how-pin");
  const howStage = howTrack.querySelector(".how-stage");
  const howTabs = [...howTrack.querySelectorAll(".how-step")];
  const howPanels = [...howTrack.querySelectorAll(".how-panel")];
  if (howPin && howStage && howTabs.length && howPanels.length) {
    let howActive = 0;
    const howRange = () => {
      const top = parseFloat(getComputedStyle(howPin).top) || 0;
      return {
        start: howTrack.getBoundingClientRect().top + window.scrollY - top,
        length: Math.max(howTrack.offsetHeight - howPin.offsetHeight, 1),
      };
    };
    const setHowStep = (i) => {
      howActive = i;
      howTabs.forEach((tab, j) => {
        tab.classList.toggle("is-active", j === i);
        tab.setAttribute("aria-selected", String(j === i));
      });
      howPanels.forEach((panel, j) =>
        panel.classList.toggle("is-active", j === i),
      );
      howStage.style.setProperty(
        "--c",
        howTabs[i].style.getPropertyValue("--c"),
      );
    };
    const updateHow = () => {
      const { start, length } = howRange();
      const raw = clamp01((window.scrollY - start) / length) * howTabs.length;
      const i = Math.min(howTabs.length - 1, Math.floor(raw));
      if (i !== howActive) setHowStep(i);
      howTabs[i].style.setProperty("--local", Math.min(raw - i, 1).toFixed(3));
    };
    howTabs.forEach((tab, i) =>
      tab.addEventListener("click", () => {
        const { start, length } = howRange();
        scrollToY(start + ((i + 0.1) / howTabs.length) * length);
      }),
    );

    const requestHowScroll = () => {
      updateHow();
    };
    window.addEventListener("scroll", requestHowScroll, {
      passive: true,
    });
    window.addEventListener("resize", requestHowScroll);
    updateHow();
  }
}
document.querySelectorAll(".faq-item").forEach((item) => {
  const button = item.querySelector("button");
  const panel = item.querySelector("[data-faq-panel]");
  if (!button || !panel) return;

  const updateFaq = () => {
    const isOpen = item.classList.contains("is-open");
    panel.hidden = !isOpen;
    panel.classList.toggle("hidden", !isOpen);
    panel.classList.toggle("flex", isOpen);
    button.setAttribute("aria-expanded", String(isOpen));
    const icon = button.querySelector("[data-faq-icon]");
    if (icon) icon.textContent = isOpen ? "−" : "+";
    button.classList.toggle("is-open", isOpen);
  };

  button.addEventListener("click", () => {
    const willOpen = !item.classList.contains("is-open");
    document.querySelectorAll(".faq-item").forEach((faq) => {
      faq.classList.remove("is-open");
      const faqBtn = faq.querySelector("button");
      const faqPanel = faq.querySelector("[data-faq-panel]");
      if (faqBtn) faqBtn.setAttribute("aria-expanded", "false");
      if (faqPanel) {
        faqPanel.hidden = true;
        faqPanel.classList.add("hidden");
        faqPanel.classList.remove("flex");
      }
      const faqIcon = faqBtn?.querySelector("[data-faq-icon]");
      if (faqIcon) faqIcon.textContent = "+";
    });

    item.classList.toggle("is-open", willOpen);
    updateFaq();
  });

  updateFaq();
});

const revealEls = document.querySelectorAll(
  "main section:not(.full-bleed-section):not(#home), .faq-item, .site-menu__item, .how-step, [data-cta-reveal], [data-footer-reveal]",
);

revealEls.forEach((el, index) => {
  el.classList.add("reveal");
  el.dataset.revealFrom =
    el.dataset.ctaReveal || el.dataset.footerReveal || "up";
  el.style.setProperty("--reveal-delay", `${Math.min(index * 60, 240)}ms`);
});

if (!reduceMotion) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 },
  );

  document
    .querySelectorAll(".reveal")
    .forEach((el) => revealObserver.observe(el));
} else {
  document
    .querySelectorAll(".reveal")
    .forEach((el) => el.classList.add("is-visible"));
}

const langButtons = document.querySelectorAll(".site-lang__item");
langButtons.forEach((btn) =>
  btn.addEventListener("click", () =>
    langButtons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b === btn)),
    ),
  ),
);
{
  const homeMain = document.querySelector("#home.sticky")?.closest("main");
  const mainContent = homeMain || document.querySelector("main");
  const footer = document.getElementById("site-footer");
  const scrollTopBtn = document.getElementById("scroll-to-top");
  let animationFrame = 0;

  function updateMainAnimation() {
    animationFrame = 0;
    if (!mainContent || !footer) return;

    if (reduceMotion) {
      mainContent.style.transform = "scale(1)";
      mainContent.style.borderRadius = "0";
      mainContent.style.clipPath = "none";
      mainContent.style.opacity = "1";
      mainContent.style.backgroundColor = "";
      document.documentElement.style.backgroundColor = "";
      return;
    }

    const windowHeight = window.innerHeight;
    const mainBottom =
      mainContent.offsetTop + mainContent.offsetHeight - window.scrollY;
    const progress = clamp01(
      (windowHeight * 1.25 - mainBottom) / windowHeight,
    );
    const easedProgress = progress * progress * (3 - 2 * progress);
    const radiusProgress = clamp01(progress * 2);
    const easedRadiusProgress =
      radiusProgress * radiusProgress * (3 - 2 * radiusProgress);
    mainContent.style.backgroundColor = "";
    document.documentElement.style.backgroundColor = "";
    const radius = easedRadiusProgress * 44;
    mainContent.style.transform = homeMain
      ? `translateY(${easedProgress * 24}px) scale(${1 - easedProgress * 0.08})`
      : `scale(${1 - easedProgress * 0.2})`;
    mainContent.style.borderRadius = `${radius}px ${radius}px 0 0`;
    mainContent.style.clipPath = `inset(0 round ${radius}px ${radius}px 0 0)`;
    mainContent.style.opacity = "1";
  }

  function requestMainAnimation() {
    if (!animationFrame) {
      animationFrame = requestAnimationFrame(updateMainAnimation);
    }
  }

  window.addEventListener("scroll", requestMainAnimation, { passive: true });
  window.addEventListener("resize", requestMainAnimation);
  requestMainAnimation();

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener("click", () => scrollToY(0));
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const filterButtons = document.querySelectorAll(".filter-btn");
  const cardsGrid = document.getElementById("cards-grid");
  const countEl = document.getElementById("situation-count");
  if (!cardsGrid) return;

  const cards = [...cardsGrid.querySelectorAll(".situation-card")];
  const sortContainer = document.getElementById("sort-dropdown-container");
  const sortButton = document.getElementById("sort-menu-button");
  const sortMenu = document.getElementById("sort-menu");
  const sortCaret = document.getElementById("sort-caret");
  const sortLabel = document.getElementById("sort-current-label");
  const sortOptions = document.querySelectorAll(".sort-option");

  const sortCards = (type) => {
    const compare = {
      "most-used": (a, b) =>
        Number(a.dataset.order || 0) - Number(b.dataset.order || 0),
      alphabetical: (a, b) =>
        (a.dataset.title || "").localeCompare(b.dataset.title || "", undefined, {
          sensitivity: "base",
        }),
      newest: (a, b) =>
        Number(b.dataset.newest || 0) - Number(a.dataset.newest || 0),
    }[type];

    if (!compare) return;
    cards.sort(compare).forEach((card) => cardsGrid.appendChild(card));
  };

  const setSortMenuOpen = (open) => {
    if (!sortButton || !sortMenu) return;
    sortMenu.classList.toggle("hidden", !open);
    sortMenu.classList.toggle("flex", open);
    sortCaret?.classList.toggle("rotate-180", open);
    sortButton.setAttribute("aria-expanded", String(open));
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      let visibleCount = 0;

      filterButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("bg-nila", selected);
        item.classList.toggle("text-white", selected);
        item.classList.toggle("border", !selected);
        item.classList.toggle("border-nila/25", !selected);
        item.classList.toggle("text-nila", !selected);
      });

      cards.forEach((card) => {
        const visible =
          filter === "all" ||
          (card.dataset.category || "").split(" ").includes(filter);
        card.style.display = visible ? "flex" : "none";
        if (visible) visibleCount++;
      });

      if (countEl) countEl.textContent = `${visibleCount} situations`;
    });
  });

  if (sortButton && sortMenu) {
    sortButton.addEventListener("click", () => {
      setSortMenuOpen(sortMenu.classList.contains("hidden"));
    });

    sortOptions.forEach((option) => {
      option.addEventListener("click", () => {
        const type = option.dataset.sort;
        if (!type) return;
        sortCards(type);
        if (sortLabel) sortLabel.textContent = option.textContent.trim();
        sortOptions.forEach((item) =>
          item.classList.toggle("bg-nila/10", item === option),
        );
        setSortMenuOpen(false);
      });
    });

    document.addEventListener("click", (event) => {
      if (!sortContainer?.contains(event.target)) setSortMenuOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    });
  }
});
