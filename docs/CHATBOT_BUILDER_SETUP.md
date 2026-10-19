# Hotel Mantri — External Chatbot Builder Integration Guide & Contract

**Document Version:** 1.0.0  
**Effective Date:** 2026-10-17  
**Scope:** Integration reference for conversational AI platforms (Voiceflow, Botpress, Landbot, Rasa, custom LLM tool-calling agents) connecting to Hotel Mantri's independent reservation engine.

---

## 1. Overview & Architectural Principles

Hotel Mantri provides a dedicated, independently deployable reservation and payment API designed specifically for conversational bots. The API enables conversational agents to:
1. Retrieve live, active room categories for the configured hotel property.
2. Check real-time room availability across multi-night stays `[check-in, check-out)`.
3. Generate server-authoritative quotes with dynamic GST calculation.
4. Create durable booking attempts with atomic inventory holds.
5. Create and verify Razorpay online payment orders.
6. Look up booking details using cryptographically signed, expiring guest tokens.

### Non-Negotiable Integration Rules
- **No Client Price Authority:** The chatbot must never pass guest-quoted prices, manual totals, or custom discounts. All pricing originates from the `/v1/public/quotes` endpoint.
- **Single Property Binding:** The API instance is permanently bound to a single hotel (e.g. Hotel Gopal). The chatbot does not need to send internal `hotel_id` parameters; any foreign `hotel_id` sent will be rejected.
- **Idempotent Bookings:** The chatbot MUST include an `Idempotency-Key` header with every booking attempt to prevent duplicate bookings during network retries or conversational hiccups.
- **Zero Secret Exposure:** Never embed Razorpay Key Secrets, Supabase service-role keys, or internal database credentials in the chatbot configuration.

---

## 2. Base URL & Rate Limiting

- **Staging Base URL:** `https://chatbot-api.hotelmantri.com` (or local `http://127.0.0.1:4000`)
- **API Version:** `/v1/public/`
- **Rate Limits:**
  - Standard Public Endpoints: 60 requests/minute per client IP.
  - Payment Order & Booking Creation: 20 requests/minute per client IP.
- **Security Headers Returned:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-Request-Id: HM-REQ-XXXXXXXX-XXXXXX`

---

## 3. Standard Request & Error Envelope

All responses return standard JSON envelopes.

### Success Envelope
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "CATEGORY_CAPACITY_EXCEEDED",
    "message": "Only 0 room(s) available for Suite AC."
  }
}
```

### Standard Error Codes
| HTTP Status | Error Code | Meaning | Bot Recommendation |
| :--- | :--- | :--- | :--- |
| `400` | `INVALID_DATE_FORMAT` | Dates must be strictly `YYYY-MM-DD` | Prompt guest for calendar date |
| `400` | `CHECKOUT_BEFORE_CHECKIN` | Check-out date is before or equal to check-in | Clarify departure date |
| `400` | `MAX_STAY_EXCEEDED` | Booking exceeds maximum 30 nights | Recommend contacting hotel front desk |
| `400` | `QUOTE_EXPIRED` | The server quote has expired (TTL: 15 mins) | Re-generate quote from `/v1/public/quotes` |
| `401` | `GUEST_TOKEN_MISSING` / `EXPIRED` | Guest lookup token is invalid or expired | Inform guest token expired |
| `403` | `FORBIDDEN_PROPERTY` | Attempted access to a different hotel | Do not override hotel configuration |
| `409` | `CATEGORY_CAPACITY_EXCEEDED` | No rooms left for category on requested dates | Offer alternative room categories |
| `409` | `ROOM_ALREADY_BOOKED` | Race condition: another guest took the last room | Offer alternative categories or dates |
| `409` | `IDEMPOTENCY_MISMATCH` | Idempotency key reused with different stay/guest | Generate a new UUID key for new intent |
| `429` | `RATE_LIMIT_EXCEEDED` | Too many requests from this IP | Back off and retry |

---

## 4. Chatbot Conversation & API Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Bot as Chatbot Engine
    participant API as Chatbot Booking API
    participant DB as Hotel Mantri Database
    participant RP as Razorpay Gateway

    Guest->>Bot: "I want a room in Hotel Gopal from Nov 20 to Nov 22"
    Bot->>API: GET /v1/public/room-categories
    API-->>Bot: List of active categories (Deluxe, Suite, etc.)
    Bot->>API: POST /v1/public/availability (dates, rooms: 1)
    API->>DB: Check room inventory [2029-11-20, 2029-11-22)
    API-->>Bot: Available categories & room counts
    Bot->>Guest: "We have Deluxe AC (₹2,000/night) and Suite AC (₹3,500/night). Which do you prefer?"
    Guest->>Bot: "Suite AC please"
    Bot->>API: POST /v1/public/quotes (categoryId, checkIn, checkOut, rooms: 1)
    API-->>Bot: Signed quoteToken, base: ₹7,000, GST: ₹840, total: ₹7,840
    Bot->>Guest: "Total for 2 nights is ₹7,840 incl. GST. May I have your name and phone?"
    Guest->>Bot: "Rahul Verma, +919876543210"
    Bot->>API: POST /v1/public/bookings (quoteToken, guest details, Idempotency-Key)
    API->>DB: Atomic hold & room assignment (HM-BKG-XXXXXX)
    API-->>Bot: bookingReference: "HM-BKG-A1B2C3", guestToken, holdExpiresAt
    Bot->>API: POST /v1/public/bookings/HM-BKG-A1B2C3/payment
    API->>RP: Create Razorpay Order (amount: 784000 paise)
    API-->>Bot: orderId: "order_Qz1234", amount: 784000, keyId
    Bot->>Guest: Display Razorpay Checkout link / popup
    Guest->>RP: Pays ₹7,840
    RP-->>Bot: paymentId, orderId, signature
    Bot->>API: POST /v1/public/bookings/HM-BKG-A1B2C3/verify
    API->>RP: Authoritative fetch & verify captured status
    API->>DB: Atomic settlement & confirm reservation
    API-->>Bot: status: "confirmed", advancePaid: 7840
    Bot->>Guest: "Your booking is confirmed! Reference: HM-BKG-A1B2C3"
```

---

## 5. Endpoints Reference & Payloads

### 5.1 Get Room Categories
`GET /v1/public/room-categories`

Retrieves all active, bookable room categories for the hotel.

#### Request Example
```http
GET /v1/public/room-categories HTTP/1.1
Host: chatbot-api.hotelmantri.com
Accept: application/json
```

#### Response Example (200 OK)
```json
{
  "success": true,
  "data": {
    "hotel": {
      "id": "bd8f18de-2f97-48e7-b029-d2e536feb7cb",
      "name": "HOTEL GOPAL",
      "address": "Bhubaneswar, Odisha",
      "phone": "+91 99094 42195"
    },
    "categories": [
      {
        "id": "df58097d-ca77-49f9-aa2f-e8bb164931a5",
        "name": "Deluxe AC",
        "description": "Premium air-conditioned room with king-size bed and modern amenities",
        "baseTariff": 2000,
        "maxOccupancy": 2,
        "totalPhysicalRooms": 10
      },
      {
        "id": "c0e6ce78-2d2f-48d1-9ce9-aefb2046ca9f",
        "name": "Suite AC",
        "description": "Executive suite with dedicated living room and premium hospitality",
        "baseTariff": 3500,
        "maxOccupancy": 4,
        "totalPhysicalRooms": 2
      }
    ]
  }
}
```

---

### 5.2 Check Live Availability
`POST /v1/public/availability`

Checks unallocated physical room inventory across the entire stay interval `[checkIn, checkOut)`.

#### Request Example
```http
POST /v1/public/availability HTTP/1.1
Host: chatbot-api.hotelmantri.com
Content-Type: application/json

{
  "checkIn": "2029-11-20",
  "checkOut": "2029-11-22",
  "rooms": 1,
  "adults": 2,
  "children": 0
}
```

#### Response Example (200 OK)
```json
{
  "success": true,
  "data": {
    "stay": {
      "checkIn": "2029-11-20",
      "checkOut": "2029-11-22",
      "nights": 2,
      "requestedRooms": 1,
      "adults": 2,
      "children": 0
    },
    "availableCategories": [
      {
        "categoryId": "df58097d-ca77-49f9-aa2f-e8bb164931a5",
        "categoryName": "Deluxe AC",
        "availableRooms": 9,
        "isAvailable": true,
        "baseRatePerNight": 2000,
        "estimatedNightsTotal": 4000
      },
      {
        "categoryId": "c0e6ce78-2d2f-48d1-9ce9-aefb2046ca9f",
        "categoryName": "Suite AC",
        "availableRooms": 1,
        "isAvailable": true,
        "baseRatePerNight": 3500,
        "estimatedNightsTotal": 7000
      }
    ]
  }
}
```

---

### 5.3 Generate Authoritative Quote
`POST /v1/public/quotes`

Calculates authoritative pricing with GST and returns a tamper-proof cryptographically signed `quoteToken` (HMAC-SHA256).

#### Request Example
```http
POST /v1/public/quotes HTTP/1.1
Host: chatbot-api.hotelmantri.com
Content-Type: application/json

{
  "categoryId": "c0e6ce78-2d2f-48d1-9ce9-aefb2046ca9f",
  "checkIn": "2029-11-20",
  "checkOut": "2029-11-22",
  "rooms": 1,
  "adults": 2,
  "children": 0
}
```

#### Response Example (200 OK)
```json
{
  "success": true,
  "data": {
    "quoteId": "HM-QTE-F92B3C01E4",
    "quoteToken": "eyJxdW90ZUlkIjoiSE0tUV...3c9a",
    "expiresAt": "2026-10-17T01:25:00.000Z",
    "stay": {
      "checkIn": "2029-11-20",
      "checkOut": "2029-11-22",
      "nights": 2,
      "rooms": 1,
      "adults": 2,
      "children": 0,
      "categoryId": "c0e6ce78-2d2f-48d1-9ce9-aefb2046ca9f",
      "categoryName": "Suite AC"
    },
    "pricing": {
      "currency": "INR",
      "ratePerNight": 3500,
      "subtotal": 7000,
      "taxableAmount": 7000,
      "taxRatePercent": 12,
      "taxAmount": 840,
      "totalAmount": 7840,
      "totalAmountPaise": 784000,
      "gstMode": "EXCLUSIVE"
    }
  }
}
```

---

### 5.4 Create Booking Attempt & Inventory Hold
`POST /v1/public/bookings`

Places a durable booking attempt and reserves the inventory hold. Requires an `Idempotency-Key` header.

#### Headers
- `Content-Type: application/json`
- `Idempotency-Key: BKG-20291120-USER1001-A1` *(Unique UUID or conversation-scoped identifier)*

#### Request Example
```http
POST /v1/public/bookings HTTP/1.1
Host: chatbot-api.hotelmantri.com
Content-Type: application/json
Idempotency-Key: BKG-20291120-USER1001-A1

{
  "quoteToken": "eyJxdW90ZUlkIjoiSE0tUV...3c9a",
  "guestName": "Rahul Verma",
  "guestPhone": "+919876543210",
  "guestEmail": "rahul.verma@example.com",
  "guestAddress": "Bhubaneswar, Odisha",
  "specialRequests": "Upper floor preferred"
}
```

#### Response Example (201 Created)
```json
{
  "success": true,
  "data": {
    "bookingReference": "HM-BKG-8C103F29A1",
    "status": "pending_payment",
    "holdExpiresAt": "2026-10-17T01:30:00.000Z",
    "guestToken": "eyJib29raW5nUmVmIjoiSE...9a8f",
    "idempotent": false,
    "stay": {
      "checkIn": "2029-11-20",
      "checkOut": "2029-11-22",
      "nights": 2,
      "rooms": 1,
      "categoryName": "Suite AC"
    },
    "pricing": {
      "currency": "INR",
      "totalAmount": 7840,
      "totalAmountPaise": 784000
    }
  }
}
```

---

### 5.5 Create Razorpay Payment Order
`POST /v1/public/bookings/:reference/payment`

Generates an authoritative Razorpay order strictly bound to the booking attempt and server price.

#### Request Example
```http
POST /v1/public/bookings/HM-BKG-8C103F29A1/payment HTTP/1.1
Host: chatbot-api.hotelmantri.com
Content-Type: application/json

{
  "quoteToken": "eyJxdW90ZUlkIjoiSE0tUV...3c9a"
}
```

#### Response Example (200 OK)
```json
{
  "success": true,
  "data": {
    "bookingReference": "HM-BKG-8C103F29A1",
    "orderId": "order_Qz123456789abc",
    "amountPaise": 784000,
    "currency": "INR",
    "keyId": "rzp_test_rG5U42N4fHq3z1",
    "prefill": {
      "name": "Rahul Verma",
      "contact": "+919876543210",
      "email": "rahul.verma@example.com"
    },
    "checkoutOptions": {
      "key": "rzp_test_rG5U42N4fHq3z1",
      "amount": 784000,
      "currency": "INR",
      "name": "HOTEL GOPAL",
      "description": "Reservation HM-BKG-8C103F29A1",
      "order_id": "order_Qz123456789abc"
    }
  }
}
```

---

### 5.6 Verify Payment & Confirm Booking
`POST /v1/public/bookings/:reference/verify`

Verifies the Razorpay checkout signature and captures authoritative payment details from the bank before confirming the reservation.

#### Request Example
```http
POST /v1/public/bookings/HM-BKG-8C103F29A1/verify HTTP/1.1
Host: chatbot-api.hotelmantri.com
Content-Type: application/json

{
  "razorpay_order_id": "order_Qz123456789abc",
  "razorpay_payment_id": "pay_Qz876543210def",
  "razorpay_signature": "5b9a8f2c3d4e..."
}
```

#### Response Example (200 OK)
```json
{
  "success": true,
  "data": {
    "bookingReference": "HM-BKG-8C103F29A1",
    "status": "confirmed",
    "paymentStatus": "PAID",
    "paymentId": "pay_Qz876543210def",
    "advancePaid": 7840,
    "balanceDue": 0,
    "confirmedAt": "2026-10-17T01:15:30.000Z"
  }
}
```

---

### 5.7 Get Booking Details (Guest Token Protected)
`GET /v1/public/bookings/:reference`

Allows guests or the chatbot to check booking status. Requires the `guestToken` returned during booking creation to protect personal guest data.

#### Request Example
```http
GET /v1/public/bookings/HM-BKG-8C103F29A1 HTTP/1.1
Host: chatbot-api.hotelmantri.com
Authorization: Bearer eyJib29raW5nUmVmIjoiSE...9a8f
Accept: application/json
```

#### Response Example (200 OK)
```json
{
  "success": true,
  "data": {
    "bookingReference": "HM-BKG-8C103F29A1",
    "status": "confirmed",
    "paymentStatus": "PAID",
    "stay": {
      "checkIn": "2029-11-20",
      "checkOut": "2029-11-22",
      "nights": 2,
      "guestCount": {
        "adults": 2,
        "children": 0
      }
    },
    "pricing": {
      "currency": "INR",
      "totalAmount": 7840,
      "advancePaid": 7840,
      "balanceDue": 0
    },
    "holdExpiresAt": null,
    "nextAction": "CONFIRMED"
  }
}
```

---

## 6. Asynchronous Razorpay Webhook Settlement
`POST /v1/payments/razorpay/webhook`

When a guest pays through external checkout or payment links, Razorpay posts events asynchronously to this endpoint.

- **Header:** `X-Razorpay-Signature: <hmac_hex>`
- **Verification:** Computed using `RAZORPAY_WEBHOOK_SECRET` over the raw, unparsed request buffer.
- **Handling:** Idempotently records `payment.captured` into the `payment_transactions` ledger and marks the reservation paid without double-crediting.

---

## 7. Chatbot Error Handling Strategy

1. **Network Timeout during `POST /v1/public/bookings`:**
   - Always retry with the exact same `Idempotency-Key` and payload.
   - The service will return the original booking attempt with `idempotent: true`.
2. **Category Sold Out (`409 CATEGORY_CAPACITY_EXCEEDED`):**
   - Present available alternative room categories returned from `/v1/public/availability`.
3. **Expired Quote (`400 QUOTE_EXPIRED`):**
   - Seamlessly request a fresh quote using `POST /v1/public/quotes` and ask the guest to re-confirm before charging.
4. **Hold Expiration:**
   - Holds are held for 15 minutes (`BOOKING_HOLD_TTL_SECONDS = 900`).
   - If payment is not completed before expiration, the room is released back to general inventory.
