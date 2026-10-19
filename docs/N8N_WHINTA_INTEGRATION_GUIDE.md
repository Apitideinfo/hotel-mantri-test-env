# Hotel Mantri × n8n Cloud × Whinta WhatsApp Integration Guide

This guide details the complete architecture and step-by-step setup for connecting an **n8n Cloud** WhatsApp chatbot with **Hotel Mantri** and **Whinta WhatsApp Provider**.

---

## 1. High-Level Architecture & Flow

```mermaid
sequenceDiagram
    autonumber
    actor Guest as Guest (WhatsApp)
    participant Whinta as Whinta WhatsApp API
    participant n8n as n8n Cloud Chatbot
    participant API as Hotel Mantri Booking API (Port 5050)
    participant DB as Supabase PostgreSQL
    participant RZP as Razorpay Gateway

    Note over Guest,Whinta: Phase 1 — Availability & Booking Hold
    Guest->>Whinta: "I want a deluxe room for Oct 20-22"
    Whinta->>n8n: Inbound WhatsApp Webhook
    n8n->>API: POST /v1/public/availability (Stay dates & guests)
    API->>DB: Check room inventory & active holds
    API-->>n8n: Available categories & live count
    n8n->>API: POST /v1/public/quotes (categoryId, dates)
    API-->>n8n: Signed Quote Token & authoritative price
    n8n->>API: POST /v1/public/bookings (QuoteToken + Guest details)
    API->>DB: Atomic hold placed (15m TTL)
    API-->>n8n: Booking Reference (HM-BKG-XXXX) + Guest Token

    Note over Guest,RZP: Phase 2 — Razorpay Payment Link Delivery
    n8n->>API: POST /v1/public/bookings/HM-BKG-XXXX/payment
    API->>RZP: Create Order & Payment Link
    RZP-->>API: Payment Link URL (https://rzp.io/i/xxxx)
    API-->>n8n: { paymentUrl: "https://rzp.io/i/xxxx" }
    n8n->>Whinta: Send WhatsApp message with paymentUrl
    Whinta->>Guest: "Please complete your payment here: https://rzp.io/i/xxxx"

    Note over Guest,Whinta: Phase 3 — Payment Capture & Confirmation
    Guest->>RZP: Completes UPI/Card payment on mobile link
    RZP->>API: POST /v1/payments/razorpay/webhook (payment.captured)
    API->>API: Verify Raw HMAC-SHA256 signature
    API->>DB: Atomic RPC: Finalize booking, update ledger & clear hold
    API->>n8n: POST /webhook/hotelmantri-payment-confirmed (HMAC-SHA256 signed)
    n8n->>n8n: Verify X-HotelMantri-Signature
    n8n->>Whinta: Send Template "hotel_mantri_reservation_confirmation_"
    Whinta->>Guest: Official WhatsApp Booking Confirmation Message
```

---

## 2. Environment Variables Configuration

### Chatbot Booking API (`chatbot-booking-api/.env`)

Add or update the following variables:

```bash
# Shared secret token required for n8n Cloud requests (Bearer token)
N8N_API_TOKEN=your_secure_random_n8n_api_token_min_32_chars

# n8n Cloud Production Webhook URL triggered upon authoritative payment settlement
N8N_PAYMENT_WEBHOOK_URL=https://your-workspace.app.n8n.cloud/webhook/hotelmantri-payment-confirmed

# Dedicated signing secret for backend-to-n8n webhook events (HMAC-SHA256)
N8N_WEBHOOK_SECRET=your_secure_n8n_webhook_signing_secret_min_32_chars

# Approved Whinta WhatsApp Template Name
WHINTA_RESERVATION_TEMPLATE=hotel_mantri_reservation_confirmation_
```

---

## 3. n8n Cloud Workflow 1: Guest Interaction (HTTP Request Nodes)

Configure the following HTTP Request nodes in your n8n conversational workflow:

### Common Headers for all API Calls:
- `Content-Type`: `application/json`
- `Authorization`: `Bearer your_secure_random_n8n_api_token_min_32_chars`
- `X-API-Key`: `your_secure_random_n8n_api_token_min_32_chars`

---

### Node 1: Check Live Room Availability
- **Method**: `POST`
- **URL**: `https://api.yourhotel.com/v1/public/availability`
- **Body (JSON)**:
  ```json
  {
    "checkIn": "={{ $json.checkInDate }}",
    "checkOut": "={{ $json.checkOutDate }}",
    "adults": "={{ $json.adultsCount || 2 }}",
    "children": "={{ $json.childrenCount || 0 }}",
    "rooms": 1
  }
  ```
- **Response**: Returns available room categories with real-time inventory count and pricing.

---

### Node 2: Generate Rate Quote & Tamper-Proof Token
- **Method**: `POST`
- **URL**: `https://api.yourhotel.com/v1/public/quotes`
- **Body (JSON)**:
  ```json
  {
    "categoryId": "={{ $json.selectedCategoryId }}",
    "checkIn": "={{ $json.checkInDate }}",
    "checkOut": "={{ $json.checkOutDate }}",
    "rooms": 1,
    "adults": 2
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "quoteToken": "eyJhbGciOi...",
      "quoteExpiresAt": "2026-10-18T10:30:00.000Z",
      "pricing": {
        "totalAmountInr": 3500.00,
        "taxableAmountInr": 3125.00,
        "taxAmountInr": 375.00
      }
    }
  }
  ```

---

### Node 3: Create Booking Attempt & Inventory Hold
- **Method**: `POST`
- **URL**: `https://api.yourhotel.com/v1/public/bookings`
- **Headers**:
  - `Idempotency-Key`: `={{ 'N8N-IDEMP-' + $json.guestPhone + '-' + $json.checkInDate }}`
  - `Authorization`: `Bearer your_secure_random_n8n_api_token_min_32_chars`
- **Body (JSON)**:
  ```json
  {
    "quoteToken": "={{ $json.quoteToken }}",
    "guestName": "={{ $json.guestName }}",
    "guestPhone": "={{ $json.guestPhone }}",
    "guestEmail": "={{ $json.guestEmail }}",
    "specialRequests": "={{ $json.specialRequests || 'Chatbot WhatsApp Booking' }}"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "bookingReference": "HM-BKG-8A2F1B9C",
      "status": "pending_payment",
      "holdExpiresAt": "2026-10-18T10:45:00.000Z",
      "guestToken": "HM-GUEST-eyJ..."
    }
  }
  ```

---

### Node 4: Generate Clickable Razorpay Payment Link
- **Method**: `POST`
- **URL**: `https://api.yourhotel.com/v1/public/bookings/{{ $json.bookingReference }}/payment`
- **Headers**:
  - `Authorization`: `Bearer your_secure_random_n8n_api_token_min_32_chars`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "order_MVCOL3I812345",
      "paymentUrl": "https://rzp.io/i/XyZ123abc",
      "amountInr": 3500.00,
      "amountPaise": 350000,
      "currency": "INR",
      "bookingReference": "HM-BKG-8A2F1B9C"
    }
  }
  ```
- **n8n Action**: Send `{{ $json.data.paymentUrl }}` to the guest on WhatsApp so they can open and pay.

---

## 4. n8n Cloud Workflow 2: Automated Payment Confirmation & Whinta Dispatch

Create a separate workflow in n8n Cloud to handle asynchronous confirmation:

### Step 1: Webhook Node
- **HTTP Method**: `POST`
- **Path**: `hotelmantri-payment-confirmed`
- **Response Mode**: `Immediately` (200 OK)

---

### Step 2: Code Node (Verify HMAC-SHA256 Signature)
Add a **Code Node** right after the Webhook node to verify that the request came genuinely from Hotel Mantri:

```javascript
const crypto = require('crypto');

const secret = 'your_secure_n8n_webhook_signing_secret_min_32_chars'; // or $env.N8N_WEBHOOK_SECRET
const signatureHeader = $input.item.headers['x-hotelmantri-signature'] || $input.item.headers['x-signature-sha256'];
const rawBody = JSON.stringify($input.item.json);

if (!signatureHeader) {
  throw new Error('Missing X-HotelMantri-Signature header');
}

const cleanSignature = signatureHeader.replace(/^sha256=/, '').trim();
const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

if (cleanSignature !== expectedSignature) {
  throw new Error('HMAC-SHA256 signature verification failed. Untrusted webhook sender.');
}

return $input.item;
```

---

### Step 3: Whinta Dispatch (HTTP Request Node)
Hotel Mantri automatically generates a pre-formatted `whintaTemplate` object in the event payload. Map this directly into your Whinta HTTP Request node:

- **Method**: `POST`
- **URL**: `https://app.whinta.com/api/v1/whatsapp/messages/template`
- **Headers**:
  - `Authorization`: `Bearer your_whinta_api_token_here`
  - `Content-Type`: `application/json`
- **Body (JSON)**:
  ```json
  {
    "recipient": "={{ $json.whintaTemplate.recipientPhone }}",
    "template_name": "={{ $json.whintaTemplate.templateName }}",
    "language": "={{ $json.whintaTemplate.language }}",
    "components": "={{ $json.whintaTemplate.components }}"
  }
  ```

---

## 5. Whinta Template Variable Specification

Approved Template: `hotel_mantri_reservation_confirmation_`

| Parameter | Field | Example |
| :--- | :--- | :--- |
| `{{1}}` | Guest Full Name | Ananya Sharma |
| `{{2}}` | Booking Reference | HM-BKG-8A2F1B9C |
| `{{3}}` | Room Number or Category | 204 (or Deluxe Suite) |
| `{{4}}` | Check-in Date | 2026-12-01 |
| `{{5}}` | Check-out Date | 2026-12-03 |
| `{{6}}` | Total Amount (INR) | 3,500 |
| `{{7}}` | Invoice / Receipt URL | https://www.hotelmantri.com |

---

## 6. Security Guarantees

1. **Idempotency Protection**: Every booking and payment link request requires an `Idempotency-Key`. Retries with the same key safely return the existing reservation or payment link without creating duplicate holds or charging twice.
2. **Fail-Closed Verification**: The backend verifies Razorpay payment status directly with Razorpay API and confirms `status === 'captured'` before finalizing the booking.
3. **Signed Quote Integrity**: Quotes cannot be manipulated by the chatbot or client; the total price is cryptographically sealed in the `quoteToken`.
4. **Single-Hotel Isolation**: All availability, bookings, and payments are strictly bound to the configured hotel property (`bd8f18de-2f97-48e7-b029-d2e536feb7cb`).
