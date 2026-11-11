# 💰 IPO Profit Splitter (Clean Name Mapping, Master Sheet & Loss Sharing)

A simple, fast web application built specifically for your exact IPO profit split formula with dynamic name replacement, multi-IPO master consolidation, loss sharing, and crystal-clear Excel export.

---

## 🧮 Built-In Split Options (Percentage Split & Direct Amount)

You can choose between **Percentage Split (%)** and **Direct Amount (₹)** per allotment or set as the default rule for any PAN Card Holder.

### 💵 Option 1: Direct Amount Split (₹)
When you agree on a fixed fee rather than a percentage:
* Specify exact fixed amounts in ₹ for **Holder** (e.g. ₹500 or ₹1,000), **Middleman** (optional), and **Partner** (optional).
* **Your Net Profit** = `Total Profit - (Holder Fixed ₹ + Middleman Fixed ₹ + Partner Fixed ₹)`.
* **On Loss**: By default, ₹0 payout on loss; or toggle "Pay holder fixed amount even on loss" if agreed.

### 📈 Option 2: Percentage Split (%)
Suppose you applied at **₹14,000** and sold at **₹18,000**:
* **Total Profit** = `₹18,000 - ₹14,000` = **₹4,000**
1. **Holder**: gets `10%` of Total Profit = **₹400**
2. **Middleman**: gets `10%` of the amount given to Holder = **₹40**
3. **Partner**: gets `15%` of `(4,000 - 400 - 40)` = **₹534**
4. **You (Main Investor)**: gets **the rest amount** = **₹3,026**

---

### 📉 Percentage Loss Sharing Rules
Suppose you applied at **₹14,000** and sold at **₹10,000**:
* **Total Loss** = `₹14,000 - ₹10,000` = **₹4,000**
1. **Holder**: gets **₹0** (no payout on loss)
2. **Middleman**: gets **₹0** (no payout on loss)
3. **Partner**: **PAYS YOU 15% of the Total Loss** = **₹600** *(Partner Contribution)*
4. **You (Main Investor)**: absorb **the rest of the loss** = **-₹3,400** *(Net Loss)*

---

## 🔒 Fixed vs 🎛️ Variable Applied / Bought At (₹)

In **Add / Edit Allotment Split**, you can choose between a **Fixed** or **Variable** Applied Amount:

### 🔒 Fixed Amount (Standard IPO Lot Cost)
* Ideal when all retail allotments in an IPO share the same standard lot cost (e.g. ₹14,000 or ₹14,850).
* Automatically pre-fills with the active IPO's Fixed Cost.
* Check **"Set as default Fixed cost for this IPO"** to update and remember the fixed lot cost so all subsequent allotments in this IPO inherit it automatically.
* Quick **"Reset to IPO Fixed"** button if you customized the value and want to revert to the IPO's standard lot cost.
* View and edit the IPO's fixed cost anytime via the **Fixed Cost** badge in the IPO dashboard header!

### 🎛️ Variable Amount (Multi-Lot & Custom Allotments)
* Ideal for multi-lot applications (e.g. 2 lots, 3 lots), sHNI (14 lots) or bHNI allotments, or custom buying prices.
* Type any custom variable amount directly into the input.
* Use the **Quick Lots** multiplier buttons (`1x`, `2x`, `3x`, `4x`, `5x`, `sHNI 14x`) to instantly multiply the base lot price.
* Entries are tagged with a subtle `Variable` badge in the splits table, Excel exports, and WhatsApp slips without affecting the IPO's base fixed cost.

---

When many IPOs run hand-in-hand, profits and losses are automatically netted out per person:
* **Example Multi-IPO Netting**:
  * **IPO 1**: Profit of ₹4,000 &rarr; Partner earns **+₹534**
  * **IPO 2**: Loss of ₹4,000 &rarr; Partner owes **-₹600**
  * **Master Consolidated Balance**: Shows that the partner **OWES YOU ₹66**!
* **Per-Person Aggregation**: Tracks each person across all IPOs with individual pill breakdowns (e.g. *Tata Tech: +₹534*, *Swiggy: -₹600*).
* **One-Click Settle / Collect**: Settle payments you owe, or mark partner loss contributions as collected in 1 click.
* **Consolidated WhatsApp Statement**: Sends a complete itemized slip detailing all profit shares, loss contributions, and the final net balance.
* **Master Excel Matrix**: Exports a full grid showing each person, all IPO columns, total earned, total settled, and balance due with automatic grand totals!

---

## ⚡ Master Settle & Settlement Dates

* **Accurate Settlement Date Tracking**: Every time a balance is settled with a person, the exact settlement date is recorded.
* **Date Picker on Settlement**: When clicking **Settle** or **Collect** in the Master IPO Sheet, choose today or any custom date.
* **Single IPO Table**: Shows the exact settlement date (e.g. `07 Nov 2026`) under the **Settled** badge. Click the date to edit or update it at any time.
* **Master Settle Button**: Click **"Master Settle IPO"** to settle all pending allotments for that specific IPO with today's date in 1 click.
* **Excel Table Exports**: Includes dedicated **Settlement Date** columns for audits and bookkeeping.
* **WhatsApp Slips**: Generates slips with `Settled On: DD MMM YYYY`.
* **Settle All Global**: On the Master Sheet, settle every pending payout across all IPOs in one click.

---

## ✨ No Confusing "X, Y, Z" Jargon & No Unnecessary Columns!

* **No PAN Card Numbers or UPI IDs**: Only real names and financial payouts matter.
* **Live Dynamic Auto-Replacement**: Typed names automatically replace generic labels in live previews.
* **Crystal-Clear Excel Export**: Clean headers, no cryptic letters, and automatic TOTAL rows.

---

## 👥 PAN Card Holders & Quick Select Search
* **Search by Name or Code**: Instantly find and auto-fill saved holders in **"Quick Select PAN Card Holder"** by typing their name or custom holder code (e.g. `H01`, `01`, `RP`). Includes interactive autocomplete dropdown with keyboard navigation (`↑`/`↓` and `Enter`).
* **Holder Codes**: Assign optional short codes/account codes (e.g. `H01`, `01`, `C-101`) to any holder for ultra-fast lookup.
* Save your permanent list under **"PAN Card Holders"** with default split percentages and intermediaries.
* Use **"Add in Bulk"** to search by name/code and attach multiple saved holders to any IPO in one shot!

---

## ☁️ Free Multi-Laptop Cloud Sync (Firebase Realtime Database)

Sync all your IPO allotments, PAN card holders, and settlement calculations live across laptops automatically via `config.js`:
* Pre-configured and protected: The Cloud Sync button has been safely removed from the UI header to prevent anyone from accidentally altering your Firebase API keys or Database URL.
* Background synchronization remains fully operational automatically using your settings in `config.js`.

---

## 🚀 How to Run
Double-click **`start.bat`** (or open **`index.html`** in your browser).
