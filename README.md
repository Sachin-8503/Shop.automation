# Naariyal Coconut Shop

A small coconut-shop demo for a college project. The storefront uses HTML, CSS, and browser JavaScript; a built-in Node.js server saves customer orders and sends live updates to the shopkeeper dashboard. No npm packages are required.

## Run it

Install Node.js 18 or newer, open a terminal in this project folder, and run either:

```powershell
node server.js
# or
npm start
```

Open the customer shop at `http://localhost:3000/` and the shopkeeper dashboard at `http://localhost:3000/shopkeeper.html`. If port 3000 is already in use, run `$env:PORT = '3002'; node server.js` and use port 3002 in both addresses. Keep the server running while testing. Product photos are stored locally in `images/`.

On the first server start, it prints an initial shopkeeper password in the terminal. Use it at the shopkeeper sign-in page, then use **Change password** in the dashboard to set your own. New passwords must be 10 to 128 characters. The password is stored as a salted hash in `data/staff-auth.json` and remains in effect after a server restart. Keep the `data/` folder private and do not share the password or hash file.

If the current password is lost, set a replacement in the PowerShell terminal before starting the server; this resets the saved hash without printing the password:

```powershell
$env:PORT = '3002'
$env:SHOPKEEPER_PASSWORD = 'A-new-private-password-10-or-more-characters'
npm start
```

Keep both pages open to demonstrate the live order notification. Customers place the cart without entering personal details and choose either **UPI QR** or **Pay at shop**. The server creates a daily pickup token such as `N-20261101-001`; checkout shows the token and the selected payment instructions, and the shopkeeper dashboard lists the same token, items, total, payment method, and status. Orders are saved in `data/orders.json`; the cart remains saved in the customer's browser using `localStorage`. Orders are for pickup at the shop, with no delivery fee. For a phone demo, run the server on a computer and open `http://<computer-local-IP>:3000/` on a phone connected to the same Wi-Fi.

## Change products

Open `script.js` and edit the `products` list. Each product has an `id`, `name`, `category`, `price`, `unit`, `tag`, and `image` path. Product image filenames match their IDs, for example `id: "new-product"` uses `images/new-product.jpg`. Prices are in Indian rupees. Add another object to the list to create another product; categories are built from the product data automatically.

## Payment methods

Customers can choose **UPI QR** or **Pay at shop**. The second option is payment in person at pickup, not another online payment gateway. In `script.js`, change `merchant.upiId` from `yourshop@upi` to the merchant's UPI ID and update `merchant.name` to use the UPI QR with a real account.

The dashboard starts each order as **Awaiting payment**. The shopkeeper should check the merchant UPI app and manually confirm payment there before pressing **Confirm payment received**. This demo does not automatically verify payment. A real store needs an approved payment provider and a server-side payment webhook to mark an order paid; never trust a customer-side button or put gateway secret keys in browser JavaScript.

The shopkeeper page and order-management APIs require a password-protected staff session; the customer storefront and order submission remain public. Sessions expire after eight hours and are held in memory, so a server restart signs staff out. Login attempts are temporarily blocked after repeated failures. Changing the password signs out other active sessions.

This is still a local college demo, not a production deployment. Do not expose it publicly or enter real customer information without HTTPS, production-grade account management, persistent sessions, and payment-gateway verification.

## Files

- `intexx.html`: customer page structure (HTML).
- `styles.css`: customer page appearance (CSS).
- `script.js`: customer-side products, cart, and checkout (browser JavaScript).
- `shopkeeper.html`: shopkeeper dashboard structure (HTML).
- `shopkeeper.css`: dashboard appearance (CSS).
- `shopkeeper.js`: dashboard updates and order controls (browser JavaScript).
- `shopkeeper-login.html`, `shopkeeper-login.css`, `shopkeeper-login.js`: staff sign-in page.
- `server.js`: Node.js backend, order API, file storage, and live notifications.
- `package.json`: Node.js project metadata and the `npm start` command.
- `images/`: local product and hero photos.
- `data/orders.json`: saved demo orders, created automatically by the server.
- `data/staff-auth.json`: salted shopkeeper password hash, created automatically by the server.
- `data/token-sequence.json`: daily pickup-token counter, retained when old orders are cleared so token numbers are not reused.
