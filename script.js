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
      const reduceMotion = matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
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
        menuToggle.setAttribute(
          "aria-label",
          open ? "Close menu" : "Open menu",
        );
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
              start:
                howTrack.getBoundingClientRect().top + window.scrollY - top,
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
            const raw =
              clamp01((window.scrollY - start) / length) * howTabs.length;
            const i = Math.min(howTabs.length - 1, Math.floor(raw));
            if (i !== howActive) setHowStep(i);
            howTabs[i].style.setProperty(
              "--local",
              Math.min(raw - i, 1).toFixed(3),
            );
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
        "main section:not(.full-bleed-section), .faq-item, .site-menu__item, .how-step",
      );

      revealEls.forEach((el, index) => {
        el.classList.add(
          "reveal",
          "opacity-0",
          "[transform:translate3d(0,28px,0)_scale(0.985)]",
          "[transition:opacity_700ms_ease,transform_700ms_cubic-bezier(0.22,1,0.36,1)]",
          "[transition-delay:var(--reveal-delay,0ms)]",
          "[will-change:opacity,transform]",
          "motion-reduce:!transition-none",
          "motion-reduce:transform-none",
          "motion-reduce:opacity-100",
        );
        el.style.setProperty(
          "--reveal-delay",
          `${Math.min(index * 60, 240)}ms`,
        );
      });

      if (!reduceMotion) {
        const revealObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add(
                  "is-visible",
                  "opacity-100",
                  "[transform:translate3d(0,0,0)_scale(1)]",
                );
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
          .forEach((el) =>
            el.classList.add(
              "is-visible",
              "opacity-100",
              "[transform:translate3d(0,0,0)_scale(1)]",
            ),
          );
      }

      const langButtons = document.querySelectorAll(".site-lang__item");
      langButtons.forEach((btn) =>
        btn.addEventListener("click", () =>
          langButtons.forEach((b) =>
            b.setAttribute("aria-pressed", String(b === btn)),
          ),
        ),
      );