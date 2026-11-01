const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const ordersList = document.querySelector("#ordersList");
const emptyOrders = document.querySelector("#emptyOrders");
const connectionState = document.querySelector("#connectionState");
const toast = document.querySelector("#merchantToast");
let orders = [];
let activeFilter = "open";
let toastTimeout;

const statusLabels = {
  awaiting_payment: "Awaiting payment",
  paid: "Payment received",
  preparing: "Preparing",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3500);
}

function formatTime(dateString) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateString));
}

function createText(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function visibleOrders() {
  return activeFilter === "all" ? orders : orders.filter((order) => !["completed", "cancelled"].includes(order.status));
}

function nextAction(order) {
  const actions = {
    awaiting_payment: {
      status: "paid",
      label: "Confirm payment received",
      hint: order.paymentMethod === "pay_at_shop" ? "Confirm payment at the counter first." : "Check the merchant UPI app first."
    },
    paid: { status: "preparing", label: "Start preparing", hint: "Payment manually confirmed." },
    preparing: { status: "ready", label: "Mark ready", hint: "Order is being prepared." },
    ready: { status: "completed", label: "Complete order", hint: "Hand over or deliver the order." }
  };
  return actions[order.status] || null;
}

function renderOrders() {
  const activeOrders = orders.filter((order) => !["completed", "cancelled"].includes(order.status));
  document.querySelector("#incomingCount").textContent = activeOrders.filter((order) => order.status === "awaiting_payment").length;
  const shownOrders = visibleOrders();
  emptyOrders.hidden = shownOrders.length > 0;
  ordersList.replaceChildren();

  for (const order of shownOrders) {
    const card = document.createElement("article");
    card.className = `order-card${order.status === "cancelled" ? " cancelled" : ""}`;
    card.dataset.status = order.status;
    const main = document.createElement("div");
    main.className = "order-main";

    const heading = document.createElement("div");
    heading.className = "order-heading";
    heading.append(createText("span", "order-number", order.token || `#${order.id.slice(0, 8).toUpperCase()}`));
    heading.append(createText("time", "order-time", formatTime(order.createdAt)));
    const status = createText("span", "status-pill", statusLabels[order.status] || order.status);
    status.dataset.status = order.status;
    heading.append(status);
    main.append(heading);

    main.append(createText("p", "fulfillment-line", "Shop pickup"));

    const itemList = document.createElement("ul");
    itemList.className = "item-list";
    for (const item of order.items) {
      const line = document.createElement("li");
      line.append(createText("span", "", `${item.name} · ${item.unit} × ${item.quantity}`));
      line.append(createText("strong", "", currency.format(item.lineTotal)));
      itemList.append(line);
    }
    main.append(itemList);
    const total = document.createElement("div");
    total.className = "order-total";
    total.append(createText("span", "", `Items ${currency.format(order.subtotal)} · Pickup free`));
    total.append(createText("strong", "", currency.format(order.total)));
    main.append(total);

    const payment = createText("div", `payment-state${order.paymentStatus === "pending" ? "" : " paid"}`, "");
    payment.append(createText("span", "", order.paymentMethod === "pay_at_shop" ? "Pay at shop" : "UPI QR"));
    const pendingLabel = order.paymentMethod === "pay_at_shop" ? "Due at pickup" : "Pending verification";
    payment.append(createText("strong", "", order.paymentStatus === "pending" ? pendingLabel : "Manually confirmed"));
    main.append(payment);

    const actions = document.createElement("div");
    actions.className = "order-actions";
    const action = nextAction(order);
    if (action) {
      const button = createText("button", "action-button", action.label);
      button.type = "button";
      button.addEventListener("click", () => updateOrder(order.id, action.status, button));
      actions.append(button);
      actions.append(createText("span", "action-hint", action.hint));
    } else {
      actions.append(createText("span", "action-hint", statusLabels[order.status] || "Order closed"));
    }
    if (!["completed", "cancelled"].includes(order.status)) {
      const cancel = createText("button", "action-button secondary", "Cancel order");
      cancel.type = "button";
      cancel.addEventListener("click", () => updateOrder(order.id, "cancelled", cancel));
      actions.append(cancel);
    }

    card.append(main, actions);
    ordersList.append(card);
  }
}

async function loadOrders() {
  const response = await fetch("/api/orders");
  if (response.status === 401) {
    window.location.replace("/shopkeeper-login.html");
    return;
  }
  if (!response.ok) throw new Error("Could not load orders.");
  orders = await response.json();
  renderOrders();
}

async function updateOrder(orderId, status, button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const result = await response.json();
    if (response.status === 401) {
      window.location.replace("/shopkeeper-login.html");
      return;
    }
    if (!response.ok) throw new Error(result.error || "Could not update order.");
    upsertOrder(result);
    const paymentMessage = orders.find((order) => order.id === orderId)?.paymentMethod === "pay_at_shop"
      ? "Payment marked received."
      : "Payment marked received. Verify it in your UPI app.";
    showToast(status === "paid" ? paymentMessage : `Order marked ${statusLabels[status].toLowerCase()}.`);
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

function upsertOrder(order) {
  const index = orders.findIndex((candidate) => candidate.id === order.id);
  if (index === -1) orders.unshift(order);
  else orders[index] = order;
  orders.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  renderOrders();
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("selected", selected);
      filterButton.setAttribute("aria-pressed", String(selected));
    });
    renderOrders();
  });
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await fetch("/api/staff/logout", { method: "POST" });
  window.location.replace("/shopkeeper-login.html");
});

const passwordDialog = document.querySelector("#passwordDialog");
const passwordForm = document.querySelector("#passwordForm");
document.querySelector("#openPasswordDialog").addEventListener("click", () => passwordDialog.showModal());
document.querySelector("#closePasswordDialog").addEventListener("click", () => passwordDialog.close());
passwordDialog.addEventListener("click", (event) => {
  if (event.target === passwordDialog) passwordDialog.close();
});
passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const error = document.querySelector("#passwordError");
  const submitButton = document.querySelector("#passwordSubmit");
  error.hidden = true;

  if (newPassword !== formData.get("confirmPassword")) {
    error.textContent = "The new passwords do not match.";
    error.hidden = false;
    return;
  }

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/staff/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const result = await response.json();
    if (response.status === 401) {
      window.location.replace("/shopkeeper-login.html");
      return;
    }
    if (!response.ok) throw new Error(result.error || "Could not change the password.");
    passwordForm.reset();
    passwordDialog.close();
    showToast("Password changed. Your other sessions have been signed out.");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

const events = new EventSource("/api/events");
events.addEventListener("open", () => {
  connectionState.classList.add("connected");
  connectionState.lastChild.textContent = " Live";
});
events.addEventListener("error", () => {
  connectionState.classList.remove("connected");
  connectionState.lastChild.textContent = " Reconnecting";
});
events.addEventListener("orders", (event) => {
  const update = JSON.parse(event.data);
  upsertOrder(update.order);
  if (update.type === "new-order") showToast(`Pickup order ${update.order.token} received. Payment is pending.`);
});

loadOrders().catch(() => showToast("Could not connect. Open this page from the running shop server."));