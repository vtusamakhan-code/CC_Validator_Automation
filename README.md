# Credit Card OCR & Validation Automation Pipeline

## Overview

This system processes credit card images from subfolders, extracts card data using a deployed OCR API, validates card numbers with the Luhn algorithm, and updates a **single user-uploaded CSV file**.

## Inputs

* **One CSV file** (uploaded once and used throughout)
* **One main directory** containing multiple subfolders

  * Each subfolder contains **1–3 credit card images**

## Processing Flow

1. Read the uploaded CSV file.
2. Iterate through each subfolder in the main directory.
3. Send images to OCR endpoint:

   * `POST /credit_card` (deployed API)
4. Extract credit card number from OCR response.
5. Validate extracted number using **Luhn algorithm**.
6. Immediately update the same CSV file.

## CSV Update Rules (Strict)

* **Do NOT create new CSV files**.
* **Only update these two columns**:

  * `CCN Actual`
  * `Luhn Test Actual`
* All other columns must remain unchanged.

## Output

* One continuously updated CSV file
* Each row reflects OCR result and Luhn validation status
* Final CSV is available for download after processing completes

## Key Constraints

* One CSV for the entire process
* One API endpoint only (`/credit_card`)
* No per-folder CSVs
* No delayed validation

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
