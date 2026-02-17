const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  getSession(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  setSession(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }
};

const seededProducts = [
  { id: "p1", manufacturer: "Apple", model: "iPhone 15 Pro Max 128GB", category: "Smartphones", grade: "A", region: "Miami", storage: "128GB", price: 100, available: 100, image: "images/iphone_15_Pro.png", locations: { Miami: 40, Dubai: 20, "Hong Kong": 25, Japan: 15 } },
  { id: "p2", manufacturer: "Apple", model: "iPhone 15 Pro Max 256GB", category: "Smartphones", grade: "A", region: "Dubai", storage: "256GB", price: 110, available: 0, image: "images/iphone_15_Pro.png", locations: { Miami: 0, Dubai: 0, "Hong Kong": 0, Japan: 0 } },
  { id: "p9", manufacturer: "Apple", model: "iPhone 15 Pro 128GB", category: "Smartphones", grade: "A", region: "Miami", storage: "128GB", price: 98, available: 52, image: "images/iphone_15_Pro.png", locations: { Miami: 20, Dubai: 14, "Hong Kong": 10, Japan: 8 } },
  { id: "p10", manufacturer: "Apple", model: "iPhone 15 128GB", category: "Smartphones", grade: "A", region: "Japan", storage: "128GB", price: 88, available: 46, image: "images/iphone_15_Pro.png", locations: { Miami: 16, Dubai: 10, "Hong Kong": 8, Japan: 12 } },
  { id: "p3", manufacturer: "Samsung", model: "Galaxy A07 64GB", category: "Smartphones", grade: "A", region: "Miami", storage: "64GB", price: 100, available: 100, locations: { Miami: 55, Dubai: 15, "Hong Kong": 10, Japan: 20 } },
  { id: "p4", manufacturer: "Google", model: "Pixel 8 128GB", category: "Smartphones", grade: "B", region: "Japan", storage: "128GB", price: 90, available: 65, locations: { Miami: 20, Dubai: 15, "Hong Kong": 10, Japan: 20 } },
  { id: "p5", manufacturer: "Apple", model: "iPad Pro 11 256GB", category: "Tablets", grade: "A", region: "Miami", storage: "256GB", price: 180, available: 45, locations: { Miami: 15, Dubai: 10, "Hong Kong": 12, Japan: 8 } },
  { id: "p6", manufacturer: "Lenovo", model: "Yoga Slim 9i", category: "Laptops", grade: "A", region: "Dubai", storage: "512GB", price: 300, available: 12, locations: { Miami: 4, Dubai: 2, "Hong Kong": 3, Japan: 3 } },
  { id: "p7", manufacturer: "Apple", model: "Watch Ultra 47mm", category: "Wearables", grade: "A", region: "Hong Kong", storage: "32GB", price: 220, available: 22, locations: { Miami: 4, Dubai: 7, "Hong Kong": 9, Japan: 2 } },
  { id: "p8", manufacturer: "Apple", model: "AirPods Pro", category: "Accessories", grade: "A", region: "Miami", storage: "N/A", price: 75, available: 80, locations: { Miami: 25, Dubai: 25, "Hong Kong": 10, Japan: 20 } }
];

const categoryImagePlaceholders = {
  Smartphones: "https://unsplash.com/photos/HpZrngfKpG8/download?force=true&w=900",
  Tablets: "https://unsplash.com/photos/6AA9MDixOYM/download?force=true&w=900",
  Laptops: "https://unsplash.com/photos/fJdEMpA83NM/download?force=true&w=900",
  Wearables: "https://unsplash.com/photos/zIkV81RVwYY/download?force=true&w=900",
  Accessories: "https://unsplash.com/photos/KSmo3sxapCo/download?force=true&w=900"
};

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: "◔" },
  { key: "orders", label: "Orders", icon: "▭" },
  {
    key: "products",
    label: "Products",
    iconSvg: `
      <svg class="nav-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7.2" y="3" width="9.6" height="18" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="12" cy="18.1" r="1" fill="currentColor"/>
      </svg>
    `
  },
  { key: "requests", label: "Requests", icon: "▣" },
  { key: "feedback", label: "Feedback", icon: "✎" },
  { key: "settings", label: "Settings", icon: "⚙" }
];

const app = {
  state: {
    user: storage.get("pcs.user", null),
    route: "products",
    productsView: "home",
    selectedCategory: "Smartphones",
    search: "",
    filters: {},
    cart: storage.getSession("pcs.cart", []),
    requestStatusFilter: "All",
    requestSearch: "",
    activeRequestId: null
  },

  init() {
    this.render();
  },

  get companyKey() {
    return this.state.user ? this.state.user.company.toLowerCase().trim() : "anon";
  },

  get requestsKey() {
    return `pcs.requests.${this.companyKey}`;
  },

  setCart(items) {
    this.state.cart = items;
    storage.setSession("pcs.cart", items);
  },

  render() {
    if (!this.state.user) {
      this.renderLogin();
      return;
    }

    const root = document.getElementById("app");
    root.innerHTML = document.getElementById("app-template").innerHTML;

    document.getElementById("session-company").textContent = this.state.user.company;
    document.getElementById("logout").onclick = () => {
      storage.set("pcs.user", null);
      this.state.user = null;
      this.render();
    };

    this.renderNav();
    this.renderView();
  },

  renderLogin() {
    const root = document.getElementById("app");
    root.innerHTML = document.getElementById("login-template").innerHTML;
    const form = document.getElementById("login-form");

    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = (fd.get("email") || "").toString().trim();
      const password = (fd.get("password") || "").toString().trim();
      const company = (fd.get("company") || "").toString().trim();
      if (!email || !password || !company) return;

      this.state.user = { email, company };
      storage.set("pcs.user", this.state.user);
      this.render();
    };
  },

  renderNav() {
    const nav = document.getElementById("nav");
    nav.innerHTML = "";

    for (const item of navItems) {
      const btn = document.createElement("button");
      const iconMarkup = item.iconSvg ? item.iconSvg : `<span class="nav-icon">${item.icon}</span>`;
      btn.innerHTML = `
        <span class="nav-icon-wrap">${iconMarkup}</span>
        <span class="nav-label">${item.label}</span>
      `;
      btn.className = item.key === this.state.route ? "active" : "";
      btn.onclick = () => {
        this.state.route = item.key;
        if (item.key === "products") {
          this.state.productsView = "home";
          this.state.filters = {};
          this.state.search = "";
        }
        this.renderView();
        this.renderNav();
      };
      nav.appendChild(btn);
    }
  },

  renderView() {
    const view = document.getElementById("view");

    if (this.state.route === "products") {
      this.renderProducts(view);
      return;
    }

    if (this.state.route === "requests") {
      this.renderRequests(view);
      return;
    }

    view.innerHTML = `
      <section class="panel">
        <h2 class="page-title" style="font-size:2rem; margin-bottom:8px;">${this.titleForRoute(this.state.route)}</h2>
        <p class="muted">This section is not part of MVP flow in this demo build.</p>
      </section>
    `;
  },

  renderProducts(view) {
    if (this.state.productsView === "home") {
      this.renderProductsHome(view);
      return;
    }
    this.renderProductsCategory(view);
  },

  renderProductsHome(view) {
    const categories = [...new Set(seededProducts.map((p) => p.category))];
    view.innerHTML = `
      <h1 class="page-title">Products</h1>
      <section class="panel home-hero">
        <div>
          <h2 style="margin:0; font-size:2rem; font-weight:400;">Categories</h2>
          <p class="muted" style="margin-top:6px;">Browse device classes and open a filtered catalog view.</p>
        </div>
        <div class="category-strip">
          ${categories.map((c) => `
            <button class="category-btn" data-open-category="${c}">
              <span class="cat-icon">${this.categoryIconSvg(c)}</span>
              <span class="cat-label">${c}</span>
            </button>
          `).join("")}
        </div>
      </section>

      ${categories.map((cat) => this.categorySection(cat)).join("")}
    `;

    view.querySelectorAll("[data-open-category]").forEach((el) => {
      el.onclick = () => {
        this.state.selectedCategory = el.dataset.openCategory;
        this.state.productsView = "category";
        this.state.filters = {};
        this.state.search = "";
        this.renderView();
      };
    });

    view.querySelectorAll("[data-open-product]").forEach((el) => {
      el.onclick = () => {
        const p = seededProducts.find((x) => x.id === el.dataset.openProduct);
        if (p) this.openProductModal(p);
      };
    });

    view.querySelectorAll("button[data-add]").forEach((btn) => {
      btn.onclick = () => {
        const p = seededProducts.find((x) => x.id === btn.dataset.add);
        if (!p || p.available < 1) return;
        this.addToCart(p, 1, "");
      };
    });
  },

  renderProductsCategory(view) {
    const source = seededProducts.filter((p) => p.category === this.state.selectedCategory);
    const fields = [
      { key: "manufacturer", title: "Manufacturers" },
      { key: "modelFamily", title: "Models" },
      { key: "region", title: "Region / Location" },
      { key: "storage", title: "Storage Capacity" }
    ];

    const filtered = source.filter((p) => {
      const text = `${p.manufacturer} ${p.model} ${p.category}`.toLowerCase();
      if (this.state.search && !text.includes(this.state.search.toLowerCase())) return false;

      return fields.every((f) => {
        const active = this.state.filters[f.key];
        if (!active || !active.length) return true;
        const candidate = f.key === "modelFamily" ? this.modelFamilyOf(p.model) : p[f.key];
        return active.includes(candidate);
      });
    });

    view.innerHTML = `
      <h1 class="page-title">Products</h1>
      <div class="products-shell">
        <aside class="filters-panel">
          <div class="filter-head">
            <h3 style="margin:0; font-weight:500;">Filters</h3>
            <button id="clear-filters" class="pill-clear">Clear</button>
          </div>

          ${fields.map((f) => this.filterBlock(f, source)).join("")}
        </aside>

        <section class="products-main">
          <div class="products-top">
            <div>
              <p class="small"><span class="crumb-link" id="back-home">Home</span> > ${this.selectedCategoryLabel()}</p>
              <h2 style="margin:4px 0 0; font-size:2.6rem; font-weight:400;">${this.selectedCategoryLabel()}</h2>
            </div>
            <div class="right-actions">
              <input id="search-input" placeholder="Search by model" value="${this.escapeHtml(this.state.search)}" style="width:220px;" />
              <button class="request-btn" id="open-cart">Requested items (${this.state.cart.length})</button>
            </div>
          </div>

          <div class="products-grid">
            ${filtered.map((p) => this.productCard(p)).join("")}
          </div>
        </section>
      </div>
    `;

    document.getElementById("back-home").onclick = () => {
      this.state.productsView = "home";
      this.state.filters = {};
      this.state.search = "";
      this.renderView();
    };

    document.getElementById("clear-filters").onclick = () => {
      this.state.filters = {};
      this.state.search = "";
      this.renderView();
    };

    document.getElementById("search-input").oninput = (e) => {
      this.state.search = e.target.value;
      this.renderView();
    };

    document.getElementById("open-cart").onclick = () => {
      this.openCartModal();
    };

    view.querySelectorAll("input[data-filter]").forEach((input) => {
      input.onchange = () => {
        const key = input.dataset.key;
        const val = input.value;
        const set = new Set(this.state.filters[key] || []);
        if (input.checked) set.add(val); else set.delete(val);
        this.state.filters[key] = [...set];
        this.renderView();
      };
    });

    view.querySelectorAll("[data-open-product]").forEach((el) => {
      el.onclick = () => {
        const p = seededProducts.find((x) => x.id === el.dataset.openProduct);
        if (p) this.openProductModal(p);
      };
    });

    view.querySelectorAll("button[data-add]").forEach((btn) => {
      btn.onclick = () => {
        const p = seededProducts.find((x) => x.id === btn.dataset.add);
        if (!p || p.available < 1) return;
        this.addToCart(p, 1, "");
      };
    });
  },

  filterBlock(field, products) {
    const values = [...new Set(products.map((p) => {
      if (field.key === "modelFamily") return this.modelFamilyOf(p.model);
      return p[field.key];
    }))].sort();
    return `
      <div class="filter-row">
        <h4>${field.title}</h4>
        ${values.map((v) => `
          <label class="checkbox-item">
            <input type="checkbox" data-filter="1" data-key="${field.key}" value="${this.escapeHtml(v)}" ${(this.state.filters[field.key] || []).includes(v) ? "checked" : ""} />
            <span>${this.escapeHtml(v)}</span>
          </label>
        `).join("")}
      </div>
    `;
  },

  productCard(p) {
    const unavailable = p.available < 1;
    const img = this.imageForProduct(p);
    return `
      <article class="card">
        <div class="thumb product-thumb" data-open-product="${p.id}">
          <img src="${img}" alt="${this.escapeHtml(p.model)}" loading="lazy" />
        </div>
        <div class="brand product-brand">${p.manufacturer}</div>
        <div class="name product-name" data-open-product="${p.id}">${this.escapeHtml(p.model)}</div>
        <div class="price">$${p.price.toFixed(2)}</div>
        <div class="product-meta">Device Grade ${p.grade}</div>
        <div class="avail ${unavailable ? "bad" : "ok"}">${unavailable ? "Currently not available" : `${p.available} items available`}</div>
        <button class="add-btn" data-add="${p.id}" ${unavailable ? "disabled" : ""}>Add to request</button>
      </article>
    `;
  },

  categorySection(category) {
    const products = seededProducts.filter((p) => p.category === category).slice(0, 6);
    return `
      <section class="panel">
        <div class="category-header">
          <h3 style="margin:0; font-size:2rem; font-weight:400;">${category}</h3>
          <button class="ghost-btn" data-open-category="${category}">View all</button>
        </div>
        <div class="products-grid">${products.map((p) => this.productCard(p)).join("")}</div>
      </section>
    `;
  },

  addToCart(product, qty, note) {
    const existing = this.state.cart.find((i) => i.productId === product.id && i.note === note);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + qty, product.available);
    } else {
      this.state.cart.push({
        id: crypto.randomUUID(),
        productId: product.id,
        model: product.model,
        grade: product.grade,
        quantity: qty,
        offerPrice: product.price,
        note
      });
    }
    this.setCart([...this.state.cart]);
    this.renderView();
  },

  openProductModal(product) {
    const dialog = document.getElementById("product-modal");
    const content = document.getElementById("product-modal-content");
    const img = this.imageForProduct(product);

    content.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <p class="small" style="margin:0;">${product.manufacturer.toUpperCase()}</p>
            <h3 style="margin:2px 0; font-size:2rem;">${this.escapeHtml(product.model)}</h3>
            <div style="font-size:2rem; font-weight:700;">$${product.price.toFixed(2)}</div>
          </div>
          <button class="close-btn" id="close-product-modal">X</button>
        </div>

        <div class="modal-grid">
          <div class="modal-box">
            <div class="thumb" style="height:190px;">
              <img src="${img}" alt="${this.escapeHtml(product.model)}" />
            </div>
            <h4>Device Specifications</h4>
            <table class="table">
              <tr><td>Device Class</td><td>${product.category}</td></tr>
              <tr><td>Grade</td><td>${product.grade}</td></tr>
              <tr><td>Manufacturer</td><td>${product.manufacturer}</td></tr>
              <tr><td>Storage</td><td>${product.storage}</td></tr>
              <tr><td>Region</td><td>${product.region}</td></tr>
            </table>
          </div>

          <div>
            <div class="modal-box" style="background:#eef9f3;">
              <h4 style="margin-top:0;">Availability</h4>
              <p class="small">Total across all locations <strong>${product.available}</strong></p>
              <table class="table">
                ${Object.entries(product.locations).map(([loc, qty]) => `<tr><td>${loc}</td><td>${qty}</td></tr>`).join("")}
              </table>
            </div>

            <div class="modal-box" style="margin-top:10px;">
              <h4 style="margin-top:0;">Create request for this product</h4>
              <label>Quantity</label>
              <div class="qty-control">
                <input id="modal-qty" type="number" min="1" max="${Math.max(1, product.available)}" value="1" ${product.available < 1 ? "disabled" : ""} />
                <button id="inc-qty" type="button">+</button>
                <button id="dec-qty" type="button">-</button>
              </div>
              <label>Additional request note (optional)</label>
              <input id="modal-note" type="text" placeholder="Write note" ${product.available < 1 ? "disabled" : ""} />
              <button id="modal-add" style="margin-top:10px;" ${product.available < 1 ? "disabled" : ""}>Add to request</button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (!dialog.open) dialog.showModal();

    document.getElementById("close-product-modal").onclick = () => dialog.close();

    const qtyInput = document.getElementById("modal-qty");
    const maxQty = Math.max(1, product.available);

    document.getElementById("inc-qty").onclick = () => {
      qtyInput.value = String(Math.min(maxQty, Number(qtyInput.value || 1) + 1));
    };

    document.getElementById("dec-qty").onclick = () => {
      qtyInput.value = String(Math.max(1, Number(qtyInput.value || 1) - 1));
    };

    document.getElementById("modal-add").onclick = () => {
      const qty = Math.max(1, Math.min(maxQty, Math.floor(Number(qtyInput.value || 1))));
      const note = (document.getElementById("modal-note").value || "").trim();
      this.addToCart(product, qty, note);
      dialog.close();
    };
  },

  openCartModal() {
    const dialog = document.getElementById("cart-modal");
    const content = document.getElementById("cart-modal-content");

    const rows = this.state.cart.map((item) => {
      const lineTotal = Number(item.offerPrice || 0) * Number(item.quantity || 0);
      return { ...item, lineTotal };
    });

    const totalUnits = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const grandTotal = rows.reduce((sum, r) => sum + r.lineTotal, 0);

    content.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <h3 style="margin:0; font-size:2rem; font-weight:500;">Requested items</h3>
          <button class="close-btn" id="close-cart-modal">X</button>
        </div>

        <div class="cart-scroll">
          <table class="table cart-table">
            <colgroup>
              <col class="cart-col-name-col" />
              <col class="cart-col-grade-col" />
              <col class="cart-col-offer-col" />
              <col class="cart-col-qty-col" />
              <col class="cart-col-total-col" />
              <col class="cart-col-action-col" />
            </colgroup>
            <thead>
              <tr><th>Product Name</th><th>Grade</th><th>Offer Price</th><th>Qty</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((r) => `
                <tr>
                  <td class="cart-col-name" title="${this.escapeHtml(r.model)}">${this.escapeHtml(r.model)}</td>
                  <td class="cart-col-grade">${r.grade}</td>
                  <td class="cart-col-offer"><input class="cart-input" data-offer="${r.id}" type="number" min="0" step="0.01" value="${Number(r.offerPrice || 0)}" /></td>
                  <td class="cart-col-qty"><input class="cart-input" data-qty="${r.id}" type="number" min="1" max="9999" value="${Number(r.quantity || 1)}" /></td>
                  <td class="cart-col-total"><span data-line-total="${r.id}">$${r.lineTotal.toFixed(2)}</span></td>
                  <td class="cart-col-action"><button class="delete-btn cart-delete-btn" data-remove="${r.id}">Delete</button></td>
                </tr>
              `).join("") : `<tr><td colspan="6" class="small">No requested items yet.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="cart-footer">
          <div>
            <strong>Grand Total</strong>
            <div class="small"><span id="cart-units">${totalUnits}</span> units | $<span id="cart-grand">${grandTotal.toFixed(2)}</span></div>
          </div>
          <div class="cart-actions">
            <button id="clear-cart" class="delete-btn">Delete all</button>
            <button id="submit-request" class="submit-btn" ${this.canSubmit() ? "" : "disabled"}>Submit request</button>
          </div>
        </div>
      </div>
    `;

    if (!dialog.open) dialog.showModal();

    document.getElementById("close-cart-modal").onclick = () => dialog.close();

    const recalcCartUi = () => {
      let units = 0;
      let total = 0;
      for (const row of this.state.cart) {
        const qty = Math.max(1, Math.floor(Number(row.quantity || 1)));
        const offer = Number(row.offerPrice || 0);
        const lineTotal = qty * offer;
        units += qty;
        total += lineTotal;
        const lineEl = content.querySelector(`[data-line-total="${row.id}"]`);
        if (lineEl) lineEl.textContent = `$${lineTotal.toFixed(2)}`;
      }
      const unitsEl = document.getElementById("cart-units");
      const grandEl = document.getElementById("cart-grand");
      if (unitsEl) unitsEl.textContent = String(units);
      if (grandEl) grandEl.textContent = total.toFixed(2);
      const submit = document.getElementById("submit-request");
      if (submit) submit.disabled = !this.canSubmit();
      this.setCart([...this.state.cart]);
    };

    content.querySelectorAll("input[data-offer]").forEach((input) => {
      input.oninput = () => {
        const row = this.state.cart.find((i) => i.id === input.dataset.offer);
        if (!row) return;
        row.offerPrice = input.value === "" ? "" : Number(input.value);
        recalcCartUi();
      };
    });

    content.querySelectorAll("input[data-qty]").forEach((input) => {
      input.oninput = () => {
        const row = this.state.cart.find((i) => i.id === input.dataset.qty);
        if (!row) return;
        row.quantity = Math.max(1, Math.min(9999, Math.floor(Number(input.value || 1))));
        recalcCartUi();
      };
    });

    content.querySelectorAll("button[data-remove]").forEach((btn) => {
      btn.onclick = () => {
        this.setCart(this.state.cart.filter((i) => i.id !== btn.dataset.remove));
        this.openCartModal();
        this.renderView();
      };
    });

    document.getElementById("clear-cart").onclick = () => {
      this.setCart([]);
      this.openCartModal();
      this.renderView();
    };

    const submitBtn = document.getElementById("submit-request");
    if (submitBtn) {
      submitBtn.onclick = () => {
        this.submitRequest();
        dialog.close();
      };
    }
  },

  canSubmit() {
    if (!this.state.cart.length) return false;
    return this.state.cart.every((i) => i.offerPrice !== "" && Number(i.quantity) >= 1 && Number(i.offerPrice) >= 0);
  },

  submitRequest() {
    if (!this.canSubmit()) return;

    const requests = storage.get(this.requestsKey, []);
    const timestamp = new Date().toISOString();
    const requestNumber = `REQ-${new Date().getFullYear()}-${String(requests.length + 1).padStart(4, "0")}`;
    const lines = this.state.cart.map((x) => ({
      productId: x.productId,
      model: x.model,
      grade: x.grade,
      quantity: Number(x.quantity),
      offerPrice: Number(x.offerPrice),
      note: x.note || ""
    }));

    const total = lines.reduce((sum, l) => sum + l.quantity * l.offerPrice, 0);

    requests.push({
      id: crypto.randomUUID(),
      requestNumber,
      company: this.state.user.company,
      createdBy: this.state.user.email,
      createdAt: timestamp,
      status: "New",
      lines,
      total
    });

    storage.set(this.requestsKey, requests);
    this.setCart([]);
    this.state.route = "requests";
    this.renderNav();
    this.renderView();
  },

  renderRequests(view) {
    const requests = storage.get(this.requestsKey, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const statuses = ["All", "New", "Received", "Estimate Created", "Completed"];

    const filtered = requests
      .filter((r) => this.state.requestStatusFilter === "All" || r.status === this.state.requestStatusFilter)
      .filter((r) => r.requestNumber.toLowerCase().includes(this.state.requestSearch.toLowerCase()));

    const active = requests.find((r) => r.id === this.state.activeRequestId) || null;

    view.innerHTML = `
      <section class="panel">
        <h2 class="page-title" style="font-size:2rem; margin-bottom:10px;">Requests</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          ${statuses.map((s) => `<button class="ghost-btn" data-status="${s}" style="${this.state.requestStatusFilter === s ? "border-color:#256fd6;color:#256fd6;" : ""}">${s}</button>`).join("")}
          <input id="request-search" placeholder="Search request #" value="${this.escapeHtml(this.state.requestSearch)}" style="max-width:220px;" />
        </div>

        <table class="table">
          <thead><tr><th>Request #</th><th>Status</th><th>Created</th><th>Total</th><th></th></tr></thead>
          <tbody>
            ${filtered.length ? filtered.map((r) => `
              <tr>
                <td>${r.requestNumber}</td>
                <td>${r.status}</td>
                <td>${new Date(r.createdAt).toLocaleString()}</td>
                <td>$${r.total.toFixed(2)}</td>
                <td><button class="ghost-btn" data-open-request="${r.id}">View</button></td>
              </tr>
            `).join("") : `<tr><td colspan="5" class="small">No requests found.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h3 style="margin-top:0;">Request details</h3>
        ${active ? `
          <p><strong>${active.requestNumber}</strong> | ${active.status}</p>
          <table class="table">
            <thead><tr><th>Product</th><th>Grade</th><th>Qty</th><th>Offer</th><th>Total</th></tr></thead>
            <tbody>
              ${active.lines.map((l) => `<tr><td>${this.escapeHtml(l.model)}</td><td>${l.grade}</td><td>${l.quantity}</td><td>$${l.offerPrice.toFixed(2)}</td><td>$${(l.quantity * l.offerPrice).toFixed(2)}</td></tr>`).join("")}
            </tbody>
          </table>
        ` : `<p class="small">Choose a request above.</p>`}
      </section>
    `;

    view.querySelectorAll("button[data-status]").forEach((btn) => {
      btn.onclick = () => {
        this.state.requestStatusFilter = btn.dataset.status;
        this.renderView();
      };
    });

    document.getElementById("request-search").oninput = (e) => {
      this.state.requestSearch = e.target.value;
      this.renderView();
    };

    view.querySelectorAll("button[data-open-request]").forEach((btn) => {
      btn.onclick = () => {
        this.state.activeRequestId = btn.dataset.openRequest;
        this.renderView();
      };
    });
  },

  titleForRoute(route) {
    const item = navItems.find((n) => n.key === route);
    return item ? item.label : "Page";
  },

  selectedCategoryLabel() {
    return this.state.selectedCategory || "Products";
  },

  modelFamilyOf(model) {
    return model
      .split(" ")
      .filter((token) => !/^\d+(gb|tb)$/i.test(token))
      .join(" ")
      .trim();
  },

  imageForProduct(product) {
    return product.image || categoryImagePlaceholders[product.category] || "";
  },

  categoryIconSvg(category) {
    if (category === "Smartphones") {
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="16" y="4" width="32" height="56" rx="6" fill="#147bd1"/>
          <rect x="21" y="12" width="22" height="38" fill="#eef0f3"/>
          <circle cx="32" cy="54" r="2.8" fill="none" stroke="#eef0f3" stroke-width="1.3"/>
        </svg>
      `;
    }
    if (category === "Tablets") {
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="12" y="4" width="40" height="56" rx="6" fill="#147bd1"/>
          <rect x="18" y="12" width="28" height="38" fill="#eef0f3"/>
          <circle cx="32" cy="54" r="2.3" fill="none" stroke="#eef0f3" stroke-width="1.2"/>
          <rect x="28" y="8" width="8" height="1.5" rx="1" fill="none" stroke="#eef0f3" stroke-width="0.9"/>
        </svg>
      `;
    }
    if (category === "Laptops") {
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="8" y="13" width="48" height="26" rx="1.6" fill="#147bd1"/>
          <rect x="13" y="18" width="38" height="16" fill="#eef0f3"/>
          <path d="M5 41h54c-1.2 6.2-5.4 10-13.5 10h-27C10.4 51 6.2 47.2 5 41z" fill="#147bd1"/>
          <rect x="28.5" y="44.2" width="7" height="2.1" rx="0.8" fill="none" stroke="#eef0f3" stroke-width="0.9"/>
        </svg>
      `;
    }
    if (category === "Wearables") {
      return `
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="22" y="2" width="20" height="60" rx="5" fill="#147bd1"/>
          <rect x="14" y="12" width="36" height="40" rx="8" fill="#147bd1"/>
          <rect x="19" y="18" width="26" height="28" rx="5" fill="#eef0f3"/>
          <rect x="50" y="24" width="3" height="6" fill="#147bd1"/>
          <rect x="50" y="34" width="3" height="6" fill="#147bd1"/>
        </svg>
      `;
    }
    return `
      <svg class="accessories-icon" viewBox="0 0 64 64" aria-hidden="true">
        <!-- Headset -->
        <path d="M8 24a8 8 0 0 1 16 0" fill="none" stroke="#147bd1" stroke-width="3.4" stroke-linecap="round"/>
        <rect x="6.5" y="23.2" width="3.9" height="10.2" rx="1.9" fill="#147bd1"/>
        <rect x="21.6" y="23.2" width="3.9" height="10.2" rx="1.9" fill="#147bd1"/>
        <rect x="8" y="25.1" width="1.3" height="6.3" rx="0.65" fill="#eef0f3"/>
        <rect x="22.7" y="25.1" width="1.3" height="6.3" rx="0.65" fill="#eef0f3"/>

        <!-- Charger + charging cable -->
        <rect x="39.2" y="18" width="13.6" height="15.2" rx="2.1" fill="#147bd1"/>
        <rect x="41.8" y="15.4" width="1.6" height="2.6" rx="0.35" fill="#147bd1"/>
        <rect x="48.4" y="15.4" width="1.6" height="2.6" rx="0.35" fill="#147bd1"/>
        <path d="M44.7 21.3h2.6l-1.8 2.7h2.1L44.4 28.1l.9-2.9h-1.6z" fill="none" stroke="#eef0f3" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M52.8 25h2.2c1.1 0 1.9.9 1.9 1.9v2.5c0 1-.8 1.9-1.9 1.9h-1.2" fill="none" stroke="#147bd1" stroke-width="1.3" stroke-linecap="round"/>
        <rect x="53.6" y="30.2" width="2" height="3.9" rx="0.75" fill="#147bd1"/>

        <!-- Keyboard -->
        <rect x="6.3" y="38.8" width="51.4" height="13.4" rx="2.4" fill="#147bd1"/>
        ${Array.from({ length: 3 }).map((_, r) =>
          Array.from({ length: 10 }).map((__, c) =>
            `<rect x="${8.6 + c * 4.8}" y="${40.7 + r * 3.1}" width="3.15" height="1.9" rx="0.45" fill="#eef0f3"/>`
          ).join("")
        ).join("")}
        <rect x="18.7" y="49.7" width="26.8" height="1.35" rx="0.65" fill="#eef0f3"/>
      </svg>
    `;
  },

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }
};

app.init();
