/**
 * Converts a number to Nigerian Naira words.
 * e.g. 500000 → "Five Hundred Thousand"
 */
const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const convertChunk = (n) => {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100)
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  return (
    ones[Math.floor(n / 100)] +
    " Hundred" +
    (n % 100 ? " " + convertChunk(n % 100) : "")
  );
};

const numberToWords = (num) => {
  if (num === 0) return "Zero";
  if (num < 0) return "Negative " + numberToWords(-num);

  let result = "";
  const billion = Math.floor(num / 1_000_000_000);
  const million = Math.floor((num % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((num % 1_000_000) / 1_000);
  const remainder = num % 1_000;

  if (billion) result += convertChunk(billion) + " Billion ";
  if (million) result += convertChunk(million) + " Million ";
  if (thousand) result += convertChunk(thousand) + " Thousand ";
  if (remainder) result += convertChunk(remainder);

  return result.trim();
};

const toNairaWords = (amount) => {
  const naira = Math.floor(amount);
  const kobo = Math.round((amount - naira) * 100);
  let result = numberToWords(naira) + " Naira";
  if (kobo > 0) result += " and " + numberToWords(kobo) + " Kobo";
  result += " Only";
  return result;
};

module.exports = { numberToWords, toNairaWords };
