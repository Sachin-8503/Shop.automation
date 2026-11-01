const products = [
  { id: "tender-coconut", name: "Green coconut (small)", category: "Fresh coconuts", price: 55, unit: "Small · 1 piece", tag: "Green & tender", image: "images/tender-coconut.jpg" },
  { id: "green-coconut-large", name: "Green coconut (large)", category: "Fresh coconuts", price: 75, unit: "Large · 1 piece", tag: "Extra refreshing", image: "images/green-coconut-large.jpg" },
  { id: "whole-coconut", name: "Whole coconut", category: "Fresh coconuts", price: 40, unit: "Medium · 1 piece", tag: "Brown shell", image: "images/whole-coconut.jpg" },
  { id: "coconut-water", name: "Coconut water", category: "Drinks", price: 80, unit: "Pack of 2 · 500 ml", tag: "Best seller", image: "images/coconut-water.jpg" },
  { id: "coconut-oil", name: "Cold-pressed oil", category: "Pantry", price: 240, unit: "500 ml bottle", tag: "Small batch", image: "images/coconut-oil.jpg" },
  { id: "dry-coconut", name: "Dried coconut", category: "Pantry", price: 120, unit: "250 g pack", tag: "Kitchen staple", image: "images/dry-coconut.jpg" },
  { id: "coconut-chips", name: "Toasted coconut chips", category: "Snacks", price: 95, unit: "150 g pouch", tag: "Crunchy", image: "images/coconut-chips.jpg" },
  { id: "coconut-milk", name: "Coconut milk", category: "Pantry", price: 110, unit: "400 ml carton", tag: "Dairy free", image: "images/coconut-milk.jpg" }
];

const merchant = {
  name: "Naariyal Coconut Shop",
  upiId: "yourshop@upi"
};

const storageKey = "naariyal-coconut-shop-cart";
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
let activeCategory = "All items";
let searchTerm = "";
let toastTimeout;

const productGrid = document.querySelector("#productGrid");
const categoryFilters = document.querySelector("#categoryFilters");
const cartItems = document.querySelector("#cartItems");
const cartEmpty = document.querySelector("#cartEmpty");
const cartBottom = document.querySelector("#cartBottom");
const modal = document.querySelector("#paymentModal");
const customerOrderForm = document.querySelector("#customerOrderForm");

function readCart() {
  try {
    const savedCart = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return Object.fromEntries(Object.entries(savedCart).filter(([id, quantity]) =>
      products.some((product) => product.id === id) && Number.isInteger(quantity) && quantity > 0
    ));
  } catch {
    return {};
  }
}

let cart = readCart();

function saveCart() {
  localStorage.setItem(storageKey, JSON.stringify(cart));
}

function renderCategories() {
  const categories = ["All items", ...new Set(products.map((product) => product.category))];
  categoryFilters.innerHTML = categories.map((category) => `
    <button class="category-button${category === activeCategory ? " selected" : ""}" type="button" data-category="${category}" aria-pressed="${category === activeCategory}">${category}</button>
  `).join("");
}

function renderProducts() {
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === "All items" || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.category} ${product.tag}`.toLowerCase().includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  productGrid.innerHTML = visibleProducts.map((product, index) => `
    <article class="product-card" style="animation-delay:${index * 55}ms">
      <div class="product-image-wrap">
        <img class="product-image" src="${product.image}" alt="${product.name}" loading="lazy">
        <span class="product-tag">${product.tag}</span>
      </div>
      <div class="product-info">
        <p class="product-category">${product.category}</p>
        <div class="product-name-row"><h3 class="product-name">${product.name}</h3><span class="product-price">${currency.format(product.price)}</span></div>
        <p class="product-unit">${product.unit}</p>
        <button class="add-button" type="button" data-add="${product.id}" aria-label="Add ${product.name} to bag"><span aria-hidden="true">+</span> Add to bag</button>
      </div>
    </article>
  `).join("");
  document.querySelector("#emptyProducts").hidden = visibleProducts.length > 0;
}

function getSubtotal() {
  return products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0);
}

function getItemCount() {
  return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
}

function renderCart() {
  const items = products.filter((product) => cart[product.id]);
  const subtotal = getSubtotal();
  const delivery = 0;
  const count = getItemCount();

  document.querySelector("#headerCartCount").textContent = count;
  document.querySelector("#cartItemLabel").textContent = `(${count})`;
  cartEmpty.hidden = items.length > 0;
  cartItems.innerHTML = items.map((product) => `
    <div class="cart-line">
      <img class="cart-thumb" src="${product.image}" alt="" loading="lazy">
      <div class="cart-line-main">
        <p class="cart-line-name">${product.name}</p>
        <span class="cart-line-price">${currency.format(product.price)} / ${product.unit}</span>
        <div class="cart-controls">
          <button class="quantity-button" type="button" data-change="${product.id}" data-step="-1" aria-label="Remove one ${product.name}">−</button>
          <span class="quantity-value">${cart[product.id]}</span>
          <button class="quantity-button" type="button" data-change="${product.id}" data-step="1" aria-label="Add one ${product.name}">+</button>
          <button class="remove-button" type="button" data-remove="${product.id}">Remove</button>
        </div>
      </div>
      <span class="line-total">${currency.format(product.price * cart[product.id])}</span>
    </div>
  `).join("");

  cartBottom.hidden = items.length === 0;
  document.querySelector("#subtotalValue").textContent = currency.format(subtotal);
  document.querySelector("#deliveryValue").textContent = delivery === 0 ? "Free" : currency.format(delivery);
  document.querySelector("#totalValue").textContent = currency.format(subtotal + delivery);
  document.querySelector("#shippingNote").textContent = "Shop pickup · No delivery fee";
}

function updateCart(productId, step) {
  const quantity = (cart[productId] || 0) + step;
  if (quantity > 0) cart[productId] = quantity;
  else delete cart[productId];
  saveCart();
  renderCart();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function closePayment() {
  modal.hidden = true;
  document.querySelector("#checkoutButton").focus();
}

function openPayment() {
  if (!cartItems.children.length) return;
  customerOrderForm.reset();
  document.querySelector("#paymentStage").hidden = true;
  customerOrderForm.hidden = false;
  document.querySelector("#orderFormError").hidden = true;
  modal.hidden = false;
  document.querySelector("#createOrderButton").focus();
}

async function submitCustomerOrder(event) {
  event.preventDefault();
  const button = document.querySelector("#createOrderButton");
  const errorMessage = document.querySelector("#orderFormError");
  const paymentMethod = new FormData(customerOrderForm).get("paymentMethod");
  const payload = {
    paymentMethod,
    items: products.filter((product) => cart[product.id]).map((product) => ({ id: product.id, quantity: cart[product.id] }))
  };

  button.disabled = true;
  errorMessage.hidden = true;
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not create the order.");

    const usesUpi = result.paymentMethod === "upi_qr";
    const upiUri = usesUpi
      ? `upi://pay?${new URLSearchParams({
          pa: merchant.upiId,
          pn: merchant.name,
          am: result.total.toFixed(2),
          cu: "INR",
          tn: result.token
        }).toString()}`
      : "";
    document.querySelector("#orderReference").textContent = `Your pickup token: ${result.token}`;
    document.querySelector("#paymentAmount").textContent = currency.format(result.total);
    document.querySelector("#paymentStageTitle").textContent = usesUpi ? "Pay with UPI" : "Order placed";
    document.querySelector("#paymentInstructions").textContent = usesUpi
      ? "Scan this QR or open your UPI app. Show your token and payment confirmation when collecting."
      : "Pay at the shop when collecting your order. Show your pickup token to the shopkeeper.";
    document.querySelector("#paymentQrFrame").hidden = !usesUpi;
    document.querySelector("#paymentUpiLabel").hidden = !usesUpi;
    document.querySelector("#upiAppLink").hidden = !usesUpi;
    document.querySelector("#paymentMethodNote").textContent = usesUpi
      ? "Payment stays pending until the shopkeeper verifies it in the merchant UPI app."
      : "Payment is due at the shop. The shopkeeper will mark it received when you pay.";
    document.querySelector("#paymentUpiLabel").textContent = `Paying to ${merchant.upiId}`;
    document.querySelector("#upiAppLink").href = upiUri || "#";
    document.querySelector("#paymentQr").replaceChildren();

    if (usesUpi && window.QRCode) {
      new QRCode(document.querySelector("#paymentQr"), {
        text: upiUri,
        width: 176,
        height: 176,
        colorDark: "#174a35",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    } else if (usesUpi) {
      document.querySelector("#paymentQr").textContent = "QR library unavailable. Use the UPI app link below.";
    }

    cart = {};
    saveCart();
    renderCart();
    customerOrderForm.hidden = true;
    document.querySelector("#paymentStage").hidden = false;
    document.querySelector("#finishPayment").focus();
    if (usesUpi && merchant.upiId === "yourshop@upi") showToast("Demo order sent. Set your merchant UPI ID for a usable payment request.");
  } catch (error) {
    errorMessage.textContent = window.location.protocol === "file:"
      ? "Orders need the Node server. Start it with `node server.js`, then open http://localhost:3000."
      : error.message;
    errorMessage.hidden = false;
  } finally {
    button.disabled = false;
  }
}

categoryFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  renderCategories();
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  updateCart(button.dataset.add, 1);
  showToast(`${products.find((product) => product.id === button.dataset.add).name} added to your bag.`);
});

cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-change]");
  const removeButton = event.target.closest("[data-remove]");
  if (quantityButton) updateCart(quantityButton.dataset.change, Number(quantityButton.dataset.step));
  if (removeButton) updateCart(removeButton.dataset.remove, -cart[removeButton.dataset.remove]);
});

document.querySelector("#productSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderProducts();
});
document.querySelector("#checkoutButton").addEventListener("click", openPayment);
customerOrderForm.addEventListener("submit", submitCustomerOrder);
document.querySelector("#closePayment").addEventListener("click", closePayment);
document.querySelector("#finishPayment").addEventListener("click", closePayment);
modal.addEventListener("click", (event) => { if (event.target === modal) closePayment(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closePayment();
});
document.querySelector("#cartJump").addEventListener("click", () => {
  document.querySelector("#cartPanel").scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelector("#currentYear").textContent = new Date().getFullYear();
renderCategories();
renderProducts();
renderCart();