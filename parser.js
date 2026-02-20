// parser.js – парсинг CSV-файлов, нормализация и загрузка данных

// ========== КОНФИГУРАЦИЯ ==========
const CONFIG = {
  MAIN_CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQixzAsPJHQYMiHKyQILPshMPMaJSDOWQ_XKRg9mwmfBDs1pGWmgg70QrenN3SYRlAygLeMKZtLTGYq/pub?output=csv",
  DEFECT_CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQixzAsPJHQYMiHKyQILPshMPMaJSDOWQ_XKRg9mwmfBDs1pGWmgg70QrenN3SYRlAygLeMKZtLTGYq/pub?gid=1780562708&single=true&output=csv",
  MAIN_FILE: "data.csv",
  DEFECT_FILE: "defect.csv",
  MAX_ROWS_TO_PREVIEW: 100,
  REQUIRED_MAIN_COLUMNS: ["Дата", "Длина сварных швов"],
  REQUIRED_DEFECT_COLUMNS: ["Дата выяв-ния несоответствия"],
};

// Внутренние переменные для хранения данных брака
let _defectData = [];
let _defectHeaders = [];

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function safeParseFloat(value, defaultValue = 0) {
  if (typeof value === "number") return value;
  if (!value && value !== 0) return defaultValue;
  const parsed = parseFloat(
    value.toString().replace(",", ".").replace(/\s/g, ""),
  );
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeParseInt(value, defaultValue = 0) {
  const floatVal = safeParseFloat(value, defaultValue);
  return Math.round(floatVal);
}

function isValidDateFormat(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const parts = dateStr.split(".");
  if (parts.length !== 3) return false;
  const [day, month, year] = parts.map(Number);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (day < 1 || day > 31) return false;
  if (month < 1 || month > 12) return false;
  if (year < 2000 || year > 2100) return false;
  return true;
}

// Нормализация: оставляем только первое слово (фамилию), убираем точки и цифры
function normalizeName(name) {
  if (!name) return "";
  let firstWord = name
    .toString()
    .trim()
    .split(/[\s,.]+/)[0];
  firstWord = firstWord.replace(/[.,0-9]/g, "").trim();
  return firstWord.toUpperCase();
}

function normalizeNameTitle(name) {
  if (!name) return "";
  let normalized = normalizeName(name);
  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getOrderNumber(row) {
  return row["Номер заказа"] || row["№Заказа"] || row["Заказ"] || "";
}

function getBottomNumber(row) {
  return (
    row["№ Днища, № чертежа, артикул"] ||
    row["№Днища"] ||
    row["№ Днища"] ||
    row["Номер днища"] ||
    row["Номер Днища"] ||
    ""
  );
}

function detectSeparator(line) {
  const separators = [";", ","];
  let bestSeparator = ",";
  let maxCount = 0;
  for (const sep of separators) {
    const count = (line.match(new RegExp(`\\${sep}`, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestSeparator = sep;
    }
  }
  console.log(
    `Автоматически определён разделитель: "${bestSeparator}" (встречен ${maxCount} раз)`,
  );
  return bestSeparator;
}

function parseCSVLine(line, separator = ";") {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ========== ПАРСИНГ ДАННЫХ ==========
function parseMainCSV(content) {
  console.log("Начинаем парсинг основного CSV...");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    console.error("CSV-файл пуст или содержит только заголовки");
    return {
      headers: [],
      data: [],
      errors: ["Файл пуст или содержит только заголовки"],
    };
  }

  const separator = detectSeparator(lines[0]);
  const headers = parseCSVLine(lines[0], separator).map((h) =>
    h.trim().replace(/^"|"$/g, ""),
  );
  console.log(`Заголовки (${headers.length}):`, headers);
  console.log(`Используемый разделитель: "${separator}"`);

  const missingColumns = CONFIG.REQUIRED_MAIN_COLUMNS.filter(
    (col) => !headers.includes(col),
  );
  if (missingColumns.length > 0) {
    console.error("Отсутствуют обязательные колонки:", missingColumns);
    return {
      headers,
      data: [],
      errors: [
        `Отсутствуют обязательные колонки: ${missingColumns.join(", ")}`,
      ],
    };
  }

  const data = [];
  const errors = [];
  const warnings = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    if (values.length !== headers.length) {
      warnings.push(
        `Строка ${i + 1}: несоответствие количества колонок (ожидается ${headers.length}, получено ${values.length})`,
      );
      continue;
    }

    const row = {};
    let hasError = false;

    headers.forEach((header, idx) => {
      let value = values[idx] ? values[idx].replace(/^"|"$/g, "") : "";

      // Специальная обработка для числовых полей
      if (header.toLowerCase().includes("длина сварных швов")) {
        row[header] = safeParseFloat(value) / 1000; // перевод из мм в м
      } else if (
        header.toLowerCase().includes("итого проволока") ||
        header.toLowerCase().includes("диаметр") ||
        header.toLowerCase().includes("толщина")
      ) {
        row[header] = safeParseFloat(value, 0);
      } else if (
        header.toLowerCase().includes("месяц") ||
        header.toLowerCase().includes("количество")
      ) {
        row[header] = safeParseInt(value, 0);
      } else {
        row[header] = value;
      }

      // Валидация даты
      if (header === "Дата" && value && !isValidDateFormat(value)) {
        warnings.push(`Строка ${i + 1}: некорректный формат даты "${value}"`);
        hasError = true;
      }
    });

    if (!hasError) {
      const welderField = headers.find(
        (h) =>
          h.toLowerCase().includes("сварщик") ||
          h.toLowerCase().includes("фио"),
      );
      if (welderField && row[welderField]) {
        row["welder_normalized"] = normalizeName(row[welderField]);
      } else {
        row["welder_normalized"] = "Неизвестно";
      }
      data.push(row);
    }
  }

  console.log(
    `Парсинг завершён: ${data.length} записей, ${errors.length} ошибок, ${warnings.length} предупреждений`,
  );
  if (warnings.length > 0)
    console.warn("Предупреждения:", warnings.slice(0, 10));
  return { headers, data, errors, warnings };
}

function parseDefectCSV(content) {
  console.log("Начинаем парсинг файла брака...");
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    console.warn("Файл брака пуст или содержит только заголовки");
    return { headers: [], data: [], errors: ["Файл брака пуст"] };
  }

  const separator = detectSeparator(lines[0]);
  console.log(`Используемый разделитель: "${separator}"`);

  const rawHeaders = parseCSVLine(lines[0], separator).map((h) =>
    h.trim().replace(/^"|"$/g, ""),
  );
  console.log(`Заголовки файла брака (${rawHeaders.length}):`, rawHeaders);

  // ---------- УЛУЧШЕННЫЙ ПОИСК ПОЛЯ ИСПОЛНИТЕЛЯ ----------
  const possibleExecutorFields = [
    "Исполнитель, допустивший несоответствие",
    "Исполнитель",
    "Сварщик",
    "ФИО",
    "executor",
    "Исполнитель по устранению",
    "Контроль выполнил",
  ];
  let executorField = null;
  for (const candidate of possibleExecutorFields) {
    const found = rawHeaders.find(
      (h) =>
        h.includes(candidate) ||
        h.toLowerCase().includes(candidate.toLowerCase()),
    );
    if (found) {
      executorField = found;
      break;
    }
  }
  console.log(`Найдено поле исполнителя: "${executorField}"`);

  const data = [];
  const errors = [];
  const warnings = [];
  let adjustedLines = 0;

  for (let i = 1; i < lines.length; i++) {
    let values = parseCSVLine(lines[i], separator);

    // Корректируем количество полей
    if (values.length !== rawHeaders.length) {
      adjustedLines++;
      if (values.length > rawHeaders.length) {
        // Объединяем лишние поля в последнее
        const base = values.slice(0, rawHeaders.length - 1);
        const lastParts = values.slice(rawHeaders.length - 1);
        const lastCombined = lastParts.join(separator);
        values = [...base, lastCombined];
      } else {
        // Дополняем пустыми строками
        values = values.concat(
          Array(rawHeaders.length - values.length).fill(""),
        );
      }
    }

    const row = {};
    let hasError = false;

    rawHeaders.forEach((header, idx) => {
      let value = values[idx] ? values[idx].replace(/^"|"$/g, "") : "";
      row[header] = value;

      if (
        header === "Дата выяв-ния несоответствия" &&
        value &&
        !isValidDateFormat(value)
      ) {
        warnings.push(
          `Строка ${i + 1} (брак): некорректный формат даты "${value}"`,
        );
        hasError = true;
      }
    });

    // ---------- ИЗВЛЕЧЕНИЕ ИСПОЛНИТЕЛЯ ----------
    let rawExecutor = "";
    if (executorField && row[executorField]) {
      rawExecutor = row[executorField];
    } else {
      // Резервный поиск по подстроке во всех полях
      for (const header of rawHeaders) {
        const val = row[header];
        if (val && /[а-яА-ЯёЁ]{4,}/.test(val) && !/^[0-9\.,\-№]+$/.test(val)) {
          // Если значение похоже на фамилию (хотя бы 4 буквы)
          rawExecutor = val;
          break;
        }
      }
      // Если не нашли, берём последнее непустое поле
      if (!rawExecutor) {
        for (let j = rawHeaders.length - 1; j >= 0; j--) {
          if (row[rawHeaders[j]]) {
            rawExecutor = row[rawHeaders[j]];
            break;
          }
        }
      }
    }

    // Сохраняем raw-значение для отладки
    row["executor_raw"] = rawExecutor;
    row["executor_normalized"] = normalizeName(rawExecutor) || "Неизвестно";

    // Диагностика первых 5 записей
    if (data.length < 5) {
      console.log(
        `Запись ${data.length + 1}: извлечённый исполнитель = "${row["executor_normalized"]}" (raw: "${rawExecutor}")`,
      );
    }

    if (!hasError) {
      data.push(row);
    }
  }

  console.log(
    `Парсинг брака завершён: ${data.length} записей, скорректировано ${adjustedLines} строк.`,
  );
  if (warnings.length > 0) {
    console.warn("Предупреждения при парсинге брака:", warnings.slice(0, 10));
  }

  return { headers: rawHeaders, data, errors, warnings };
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadDataFromCSV() {
  console.log("=== ЗАГРУЗКА ДАННЫХ ===");
  const useGoogleSheets = CONFIG.MAIN_CSV_URL || CONFIG.DEFECT_CSV_URL;
  console.log(
    useGoogleSheets ? "Используем Google Sheets" : "Используем локальные файлы",
  );

  try {
    const mainUrl = CONFIG.MAIN_CSV_URL || CONFIG.MAIN_FILE;
    console.log(`Загрузка основного файла из: ${mainUrl}`);
    const mainResponse = await fetch(mainUrl);
    if (!mainResponse.ok)
      throw new Error(
        `Не удалось загрузить основной файл: ${mainResponse.status}`,
      );
    const mainContent = await mainResponse.text();
    const mainResult = parseMainCSV(mainContent);
    if (mainResult.errors.length > 0)
      throw new Error(mainResult.errors.join("; "));

    let defectData = [];
    let defectHeaders = [];
    try {
      const defectUrl = CONFIG.DEFECT_CSV_URL || CONFIG.DEFECT_FILE;
      console.log(`Загрузка файла брака из: ${defectUrl}`);
      const defectResponse = await fetch(defectUrl);
      if (defectResponse.ok) {
        const defectContent = await defectResponse.text();
        const defectResult = parseDefectCSV(defectContent);
        defectData = defectResult.data;
        defectHeaders = defectResult.headers;
        console.log(`Загружено ${defectData.length} записей брака`);
      } else {
        console.warn(`Файл брака не найден (${defectUrl})`);
      }
    } catch (defectError) {
      console.warn("Не удалось загрузить файл брака:", defectError.message);
    }

    _defectData = defectData;
    _defectHeaders = defectHeaders;

    console.log("=== ЗАГРУЗКА ЗАВЕРШЕНА УСПЕШНО ===");
    return {
      mainData: mainResult.data,
      mainHeaders: mainResult.headers,
      defectData,
      defectHeaders,
    };
  } catch (error) {
    console.error("=== ОШИБКА ЗАГРУЗКИ ===", error);
    return null;
  }
}

function hasDefectData() {
  return _defectData.length > 0;
}

function getDefectData() {
  return _defectData;
}

function getDefectHeaders() {
  return _defectHeaders;
}

// ========== ЭКСПОРТ ==========
if (typeof window !== "undefined") {
  window.parser = {
    CONFIG,
    safeParseFloat,
    safeParseInt,
    isValidDateFormat,
    normalizeName,
    normalizeNameTitle,
    getOrderNumber,
    getBottomNumber,
    parseMainCSV,
    parseDefectCSV,
    loadDataFromCSV,
    hasDefectData,
    getDefectData,
    getDefectHeaders,
  };
  // Также делаем ключевые функции глобальными для совместимости с существующим кодом
  window.hasDefectData = hasDefectData;
  window.isValidDateFormat = isValidDateFormat;
  window.safeParseFloat = safeParseFloat;
  window.safeParseInt = safeParseInt;
  window.normalizeName = normalizeName;
  window.normalizeNameTitle = normalizeNameTitle;
  window.getOrderNumber = getOrderNumber;
  window.getBottomNumber = getBottomNumber;
}
