// helpers.js – общие вспомогательные функции

// Предопределённая палитра цветов
const COLOR_PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7",
  "#ec4899", "#14b8a6", "#f97316", "#6b7280", "#8b5cf6",
  "#06b6d4", "#f43f5e", "#84cc16", "#6366f1", "#fbbf24",
  "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4",
  "#84cc16", "#f43f5e", "#6366f1", "#fbbf24", "#10b981",
  "#0ea5e9", "#d946ef", "#22c55e", "#f97316", "#14b8a6",
  "#8b5cf6", "#ef4444", "#eab308", "#3b82f6", "#a855f7",
];

function generateColors(count) {
  if (count <= 0) return [];
  const colors = [];
  for (let i = 0; i < count; i++) {
    if (i < COLOR_PALETTE.length) {
      colors.push(COLOR_PALETTE[i]);
    } else {
      const hue = (i * 137.508) % 360;
      const saturation = 65 + (i % 3) * 10;
      const lightness = 45 + (i % 2) * 15;
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
  }
  return colors;
}

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return num.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parts[2];
    if (month >= 0 && month < 12) return `${day} ${months[month]} ${year}`;
  }
  return dateStr;
}

function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const parts = dateStr.split(".");
  if (parts.length !== 3) return false;
  const [day, month, year] = parts.map(Number);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (day < 1 || day > 31) return false;
  if (month < 1 || month > 12) return false;
  if (year < 2000 || year > 2100) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (!isValidDate(dateStr)) return null;
  const [day, month, year] = dateStr.split(".").map(Number);
  return new Date(year, month - 1, day);
}

function compareDates(dateStr1, dateStr2) {
  const date1 = parseDate(dateStr1);
  const date2 = parseDate(dateStr2);
  if (!date1 && !date2) return 0;
  if (!date1) return -1;
  if (!date2) return 1;
  return date1.getTime() - date2.getTime();
}

function groupBy(array, key) {
  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) result[groupKey] = [];
    result[groupKey].push(item);
    return result;
  }, {});
}

function sortBy(array, key, order = "asc") {
  return [...array].sort((a, b) => {
    const valA = a[key];
    const valB = b[key];
    if (valA === valB) return 0;
    const comparison = valA > valB ? 1 : -1;
    return order === "asc" ? comparison : -comparison;
  });
}

function unique(array) {
  return [...new Set(array)];
}

function truncate(str, maxLength = 50) {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

function isEmpty(str) {
  return !str || str.trim().length === 0;
}

function normalizeString(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  const clonedObj = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) clonedObj[key] = deepClone(obj[key]);
  }
  return clonedObj;
}

function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  function isObject(item) {
    return item && typeof item === "object" && !Array.isArray(item);
  }

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }
  return deepMerge(target, ...sources);
}

function debugLog(...args) {
  if (window.location.hostname === "localhost" || 
      window.location.hostname === "127.0.0.1" ||
      window.location.search.includes("debug=true")) {
    console.log("[DEBUG]", ...args);
  }
}

function measureTime(fn, label = "Function") {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`[PERF] ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

// Экспорт в глобальную область
if (typeof window !== "undefined") {
  window.helpers = {
    generateColors,
    formatNumber,
    formatPercent,
    formatDate,
    isValidDate,
    parseDate,
    compareDates,
    groupBy,
    sortBy,
    unique,
    truncate,
    isEmpty,
    normalizeString,
    deepClone,
    deepMerge,
    debugLog,
    measureTime
  };
  // Для обратной совместимости также делаем функции доступными глобально
  window.generateColors = generateColors;
  window.formatNumber = formatNumber;
  window.formatPercent = formatPercent;
  window.formatDate = formatDate;
  window.isValidDate = isValidDate;
  window.parseDate = parseDate;
  window.compareDates = compareDates;
  window.groupBy = groupBy;
  window.sortBy = sortBy;
  window.unique = unique;
  window.truncate = truncate;
  window.isEmpty = isEmpty;
  window.normalizeString = normalizeString;
  window.deepClone = deepClone;
  window.deepMerge = deepMerge;
  window.debugLog = debugLog;
  window.measureTime = measureTime;
}