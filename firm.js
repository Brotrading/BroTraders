/* firm.js — shared scripts for all firm profile pages */

// Accordion
document.querySelectorAll(".fps-title").forEach((btn) => {
  btn.addEventListener("click", () => {
    const content = btn.nextElementSibling;
    const arrow = btn.querySelector(".fps-arrow");
    const isActive = content.classList.contains("active");

    content.classList.toggle("active", !isActive);
    if (arrow) arrow.style.transform = isActive ? "rotate(0deg)" : "rotate(45deg)";
  });
});

// Copy button — .firm-btn (accordion discount card)
document.querySelectorAll(".firm-btn[data-code]").forEach((btn) => {
  btn.addEventListener("click", function () {
    const code = this.dataset.code;
    navigator.clipboard.writeText(code).catch(() => {});

    const originalHTML = this.innerHTML;
    this.innerHTML = '<i class="fas fa-check"></i> Copied ✓';
    setTimeout(() => {
      this.innerHTML = '<i class="fas fa-copy"></i> Code : ' + code;
    }, 2000);
  });
});

// Copy button — .copy-code (hero CTA section)
document.querySelectorAll(".copy-code").forEach((btn) => {
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    const code = this.dataset.code;
    navigator.clipboard.writeText(code).catch(() => {});

    const original = this.innerText;
    this.innerText = "Copied ✓";
    setTimeout(() => { this.innerText = original; }, 2000);
  });
});

// CTF Compare slider
(function () {
  const shell = document.getElementById("ctfSlider");
  if (!shell) return;
  const prevBtn = document.getElementById("ctfPrev");
  const nextBtn = document.getElementById("ctfNext");

  function updateButtons() {
    const maxScroll = shell.scrollWidth - shell.clientWidth;
    prevBtn.classList.toggle("disabled", shell.scrollLeft <= 5);
    nextBtn.classList.toggle("disabled", shell.scrollLeft >= maxScroll - 5);
  }

  nextBtn.addEventListener("click", () => shell.scrollBy({ left: shell.clientWidth, behavior: "smooth" }));
  prevBtn.addEventListener("click", () => shell.scrollBy({ left: -shell.clientWidth, behavior: "smooth" }));
  shell.addEventListener("scroll", updateButtons);
  window.addEventListener("resize", updateButtons);
  updateButtons();
})();
