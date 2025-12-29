/**
 * Universal Credit Card Validator
 * Checks:
 * 1. Network Identification (BIN)
 * 2. Length Validation
 * 3. Luhn Checksum
 */
const CreditCardValidator = (function () {
  // 1. Define Constants for Card Lengths
  const LENGTHS = {
    AMEX: [15],
    VISA: [13, 16, 19],
    MASTER: [16],
    DISCOVER: [16, 19],
    JCB: [16, 19],
    DINERS: [14, 16, 19],
    UNIONPAY: [16, 17, 18, 19],
    MAESTRO: [12, 13, 14, 15, 16, 17, 18, 19]
  };

  /**
   * Internal: Performs the Luhn Algorithm
   */
  function luhnCheck(number: string): boolean {
  let sum = 0;
    let shouldDouble = false;
    // Loop through digits from right to left
    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i));
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return (sum % 10) === 0;
  }

  /**
   * Internal: Determines card type and validates length
   */
  function validateTypeAndLength(number: string): boolean {
    // Amex: 34, 37
    if (/^3[47]/.test(number)) {
      return LENGTHS.AMEX.includes(number.length);
    }
    // Visa: 4
    if (/^4/.test(number)) {
      return LENGTHS.VISA.includes(number.length);
    }
    // Mastercard: 51-55 or 2221-2720
    if (
      /^5[1-5]|^2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(number)
    ) {
      return LENGTHS.MASTER.includes(number.length);
    }
    // Discover: 6011, 622126-622925, 644-649, 65
    if (
      /^6(?:011|5|4[4-9]|22(?:12[6-9]|1[3-9]\d|[2-8]\d{2}|9[01]\d|92[0-5]))/.test(number)
    ) {
      return LENGTHS.DISCOVER.includes(number.length);
    }
    // JCB: 3528-3589
    if (/^35(?:2[89]|[3-8]\d)/.test(number)) {
      return LENGTHS.JCB.includes(number.length);
    }
    // Diners Club: 300-305, 36, 38, 39
    if (/^3(?:0[0-5]|[689])/.test(number)) {
      return LENGTHS.DINERS.includes(number.length);
  }
    // UnionPay: 62
    if (/^62/.test(number)) {
      return LENGTHS.UNIONPAY.includes(number.length);
    }
    // Maestro: Multiple prefixes
    if (/^(5018|5020|5038|58|6304|6759|676[1-3])/.test(number)) {
      return LENGTHS.MAESTRO.includes(number.length);
}
    return false; // Unknown type
  }

  // Public Method
  return {
    validate: function (rawNumber: string | number): boolean {
      const cleaned = String(rawNumber).replace(/\D/g, '');
      if (!cleaned) return false;

      // Step 1: Type & Length Validation
      if (!validateTypeAndLength(cleaned)) return false;

      // Step 2: Luhn Check
      return luhnCheck(cleaned);
    }
  };
})();

// Export the validator function
export function luhn_validate(fullcode: string): boolean {
  return CreditCardValidator.validate(fullcode);
}

// Also export the full validator for direct use if needed
export { CreditCardValidator };
