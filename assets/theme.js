document.documentElement.classList.add("js");

const shopRoot = window.Shopify?.routes?.root || "/";

function setMenuDrawer(open) {
  document.body.classList.toggle("menu-drawer-open", open);
}

function setCartDrawer(open) {
  document.body.classList.toggle("cart-drawer-open", open);
}

async function fetchSections(sectionNames = ["header", "cart-drawer"]) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("sections", sectionNames.join(","));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch updated theme sections.");
  }

  return response.json();
}

function replaceSection(containerId, html) {
  const container = document.getElementById(containerId);
  if (!container || !html) return;
  container.innerHTML = html;
}

async function renderCartSections({ openCart = false } = {}) {
  const sections = await fetchSections();
  replaceSection("SiteHeaderSection", sections["header"]);
  replaceSection("CartDrawerSection", sections["cart-drawer"]);

  initHeaderBehavior();
  initRevealObserver();
  bindProductForms();

  if (openCart) {
    setCartDrawer(true);
  }
}

async function addToCart(payload, { isFormData = false, openCart = true } = {}) {
  const response = await fetch(`${shopRoot}cart/add.js`, {
    method: "POST",
    headers: isFormData
      ? {
          Accept: "application/json",
        }
      : {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
    body: isFormData ? payload : JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.description || "Unable to add this item to cart.");
  }

  await response.json();
  await renderCartSections({ openCart });
}

async function changeCartLine(line, quantity) {
  const response = await fetch(`${shopRoot}cart/change.js`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      line,
      quantity,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to update the cart.");
  }

  await response.json();
  await renderCartSections({ openCart: true });
}

function initRevealObserver() {
  const reveals = document.querySelectorAll(".reveal-on-scroll");
  if (!reveals.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  reveals.forEach((item) => observer.observe(item));
}

function initHeaderBehavior() {
  window.micnicHeaderController?.abort?.();

  const controller = new AbortController();
  const { signal } = controller;
  window.micnicHeaderController = controller;

  const headerSection = document.getElementById("SiteHeaderSection");
  const header = headerSection?.querySelector("[data-site-header]");
  const announcementBar = document.querySelector("[data-announcement-bar]");

  if (!headerSection || !header) return;

  const stickyEnabled = header.dataset.stickyEnabled === "true";
  const transparentEnabled = header.dataset.transparentEnabled === "true";
  const firstSection = document.querySelector("#MainContent > .shopify-section:first-child");
  const transparentHeroEnabled = Boolean(
    transparentEnabled && firstSection?.querySelector(".hero-editorial, .collection-hero")
  );

  function measureHeader() {
    const computedHeight =
      header.offsetHeight ||
      parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"), 10) ||
      0;

    document.documentElement.style.setProperty("--site-header-height", `${computedHeight}px`);
    document.documentElement.style.setProperty("--site-header-total-height", `${computedHeight}px`);
    headerSection.style.minHeight = stickyEnabled ? `${computedHeight}px` : "";
  }

  function updateHeaderState() {
    const announcementHeight = announcementBar ? announcementBar.offsetHeight : 0;
    const shouldPin = stickyEnabled && window.scrollY > announcementHeight;

    headerSection.classList.toggle("is-header-pinned", shouldPin);
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    document.body.classList.toggle("has-sticky-header", stickyEnabled);
    document.body.classList.toggle("has-transparent-header", transparentEnabled);
    document.body.classList.toggle("has-transparent-hero", transparentHeroEnabled);
  }

  measureHeader();
  updateHeaderState();

  window.addEventListener(
    "scroll",
    () => {
      updateHeaderState();
    },
    { passive: true, signal }
  );

  window.addEventListener(
    "resize",
    () => {
      measureHeader();
      updateHeaderState();
    },
    { passive: true, signal }
  );
}

function bindProductForms() {
  document.querySelectorAll("[data-product-form]").forEach((form) => {
    if (form.dataset.productFormBound === "true") return;
    form.dataset.productFormBound = "true";

    const variants = JSON.parse(form.querySelector("[data-variants-json]")?.textContent || "[]");
    const hiddenInput = form.querySelector("[name='id']");
    const priceNode = form.querySelector("[data-variant-price]");
    const compareNode = form.querySelector("[data-variant-compare]");
    const submitButton = form.querySelector("[type='submit']");

    function updateVariant() {
      const groups = [...form.querySelectorAll("[data-option-group]")];
      const selectedOptions = groups.map((group) => {
        const checked = group.querySelector("input:checked");
        return checked ? checked.value : null;
      });

      const variant = variants.find((item) => {
        if (!item.options) return false;
        return item.options.every((value, index) => value === selectedOptions[index]);
      });

      if (!variant || !hiddenInput) return;

      hiddenInput.value = variant.id;

      if (priceNode) {
        priceNode.textContent = (variant.price / 100).toLocaleString(undefined, {
          style: "currency",
          currency: form.dataset.currency || "USD",
        });
      }

      if (compareNode) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          compareNode.textContent = (variant.compare_at_price / 100).toLocaleString(undefined, {
            style: "currency",
            currency: form.dataset.currency || "USD",
          });
          compareNode.hidden = false;
        } else {
          compareNode.hidden = true;
        }
      }

      if (submitButton) {
        submitButton.disabled = !variant.available;
        submitButton.textContent = variant.available ? "add to bag" : "sold out";
      }
    }

    form.addEventListener("change", updateVariant);
    updateVariant();
  });
}

document.addEventListener("click", async (event) => {
  const menuToggle = event.target.closest("[data-menu-drawer-toggle]");
  const menuClose = event.target.closest("[data-menu-drawer-close]");
  const menuOverlay = event.target.closest(".header-drawer");

  const cartToggle = event.target.closest("[data-cart-drawer-toggle]");
  const cartClose = event.target.closest("[data-cart-drawer-close]");
  const cartOverlay = event.target.closest(".cart-drawer");

  const thumb = event.target.closest("[data-media-thumb]");
  const quickAdd = event.target.closest("[data-cart-add-variant]");
  const lineChange = event.target.closest("[data-cart-line-change]");

  if (menuToggle) {
    event.preventDefault();
    setMenuDrawer(true);
  }

  if (menuClose) {
    event.preventDefault();
    setMenuDrawer(false);
  }

  if (menuOverlay && event.target === menuOverlay) {
    setMenuDrawer(false);
  }

  if (cartToggle) {
    event.preventDefault();
    setCartDrawer(true);
  }

  if (cartClose) {
    event.preventDefault();
    setCartDrawer(false);
  }

  if (cartOverlay && event.target === cartOverlay) {
    setCartDrawer(false);
  }

  if (thumb) {
    event.preventDefault();
    const gallery = thumb.closest("[data-product-gallery]");
    const target = gallery?.querySelector("[data-main-image]");
    if (!gallery || !target) return;

    const image = thumb.getAttribute("data-media-thumb");
    const srcset = thumb.getAttribute("data-media-srcset");
    const alt = thumb.getAttribute("data-media-alt");

    if (image) target.src = image;
    if (srcset) target.srcset = srcset;
    if (alt) target.alt = alt;

    gallery
      .querySelectorAll("[data-media-thumb]")
      .forEach((item) => item.classList.remove("is-active"));
    thumb.classList.add("is-active");
  }

  if (quickAdd) {
    event.preventDefault();

    const variantId = Number(quickAdd.dataset.cartAddVariant);
    let properties = undefined;
    if (!variantId) return;

    if (quickAdd.dataset.cartAddProperties) {
      try {
        properties = JSON.parse(quickAdd.dataset.cartAddProperties);
      } catch (error) {
        console.error("Unable to parse cart add properties", error);
      }
    }

    quickAdd.disabled = true;

    try {
      await addToCart({
        items: [
          {
            id: variantId,
            quantity: 1,
            ...(properties ? { properties } : {}),
          },
        ],
      });
    } catch (error) {
      console.error(error);
    } finally {
      quickAdd.disabled = false;
    }
  }

  if (lineChange) {
    event.preventDefault();

    const line = Number(lineChange.dataset.cartLineChange);
    const quantity = Math.max(0, Number(lineChange.dataset.cartLineQuantity));

    if (!line && line !== 0) return;

    lineChange.disabled = true;

    try {
      await changeCartLine(line, quantity);
    } catch (error) {
      console.error(error);
      lineChange.disabled = false;
    }
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-product-form]");
  if (!form) return;

  if (event.submitter && event.submitter.closest(".shopify-payment-button")) {
    return;
  }

  event.preventDefault();

  const submitButton = event.submitter || form.querySelector("[type='submit']");
  const formData = new FormData(form);

  if (!formData.get("quantity")) {
    formData.set("quantity", "1");
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await addToCart(formData, { isFormData: true, openCart: true });
  } catch (error) {
    console.error(error);
    if (submitButton) submitButton.disabled = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuDrawer(false);
    setCartDrawer(false);
  }
});

initRevealObserver();
initHeaderBehavior();
bindProductForms();
