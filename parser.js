// parser.js – загрузка и парсинг CSV

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQixzAsPJHQYMiHKyQILPshMPMaJSDOWQ_XKRg9mwmfBDs1pGWmgg70QrenN3SYRlAygLeMKZtLTGYq/pub?output=csv";
const DEFECT_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQixzAsPJHQYMiHKyQILPshMPMaJSDOWQ_XKRg9mwmfBDs1pGWmgg70QrenN3SYRlAygLeMKZtLTGYq/pub?gid=1780562708&single=true&output=csv";

let defectData = [];
let defectHeaders = [];
let defectMap = new Set(); // ключи "номер заказа_номер днища" для быстрой проверки

const STRING_FIELDS = [
  "Заказ",
  "№Заказа",
  "Номер заказа",
  "Заказчик",
  "Сварщик",
  "ФИО",
  "ФИО сварщика",
  "Тип днища",
  "Дата",
  "№Днища",
  "№ Днища",
  "№ Днища, № чертежа, артикул",
  "Номер днища",
  "Номер Днища", // добавлено
  "Материал",
  "Вид контроля",
  "Вид дефекта",
  "Описание несоответствия",
  "№ акта о несоответствии",
  "Исполнитель",
  "Причина несоответствия",
  "Способ устранения",
  "Контроль выполнил",
  "Раскрой",
];

const INTEGER_FIELDS = [
  "Месяц",
  "Днище",
  "Толщина",
  "Диаметр",
  "Количество выявленных дефектов",
  "Номер днища",
  "Номер Днища",
];

// Вспомогательные функции для извлечения номера заказа и номера днища
function getOrderNumber(row) {
  return row["Номер заказа"] || row["№Заказа"] || row["Заказ"] || "";
}

function getBottomNumber(row) {
  return (
    row["№ Днища, № чертежа, артикул"] ||
    row["№Днища"] ||
    row["№ Днища"] ||
    row["Номер днища"] ||
    row["Номер Днища"] || // важное добавление
    ""
  );
}

// Нормализация фамилии: первое слово, без точек и цифр
function normalizeWelderName(rawName) {
  if (!rawName) return "";
  let name = rawName.trim().split(/\s+/)[0];
  name = name.replace(/[.,0-9]/g, "").trim();
  return name;
}

async function loadDataFromCSV() {
  const statusIndicator = document.querySelector(".status-indicator");
  const statusText = document.querySelector(".status-text");

  try {
    statusText.textContent = "Загрузка данных о сварке...";
    statusIndicator.className = "status-indicator";

    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvText = await response.text();
    await parseWeldingData(csvText);

    statusText.textContent = "Загрузка данных о браке...";
    try {
      const defectResponse = await fetch(DEFECT_CSV_URL);
      if (defectResponse.ok) {
        const defectCsvText = await defectResponse.text();
        await parseDefectData(defectCsvText);
        statusText.textContent = `Загружено: ${allData.length} операций, ${defectData.length} записей брака`;
      } else {
        console.warn(
          "Не удалось загрузить данные о браке, используется правило",
        );
        statusText.textContent = `Загружено ${allData.length} записей (брак по правилу)`;
      }
    } catch (e) {
      console.warn("Ошибка загрузки данных о браке:", e);
      statusText.textContent = `Загружено ${allData.length} записей (брак по правилу)`;
    }

    statusIndicator.className = "status-indicator loaded";
  } catch (e) {
    console.error("Fetch error:", e);
    statusText.textContent = "Ошибка загрузки";
    statusIndicator.className = "status-indicator error";
    alert("Ошибка загрузки CSV. Подробности в консоли.");
  }
}

function parseWeldingData(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (result) => {
        if (result.data.length === 0) {
          alert("CSV с данными о сварке пуст.");
          resolve();
          return;
        }
        allData = result.data.map((row) => {
          const newRow = {};
          Object.keys(row).forEach((key) => {
            let val = row[key]?.trim() || "";
            const isStringField = STRING_FIELDS.some((sf) =>
              key.toLowerCase().includes(sf.toLowerCase()),
            );
            const isIntegerField = INTEGER_FIELDS.some((ifield) =>
              key.toLowerCase().includes(ifield.toLowerCase()),
            );

            if (isStringField) {
              newRow[key] = val;
            } else if (isIntegerField && val !== "" && !isNaN(val)) {
              newRow[key] = parseInt(val, 10);
            } else if (val.includes(",") && !isNaN(val.replace(",", "."))) {
              newRow[key] = parseFloat(val.replace(",", "."));
            } else if (val !== "" && !isNaN(val)) {
              // Для длины сварных швов: переводим миллиметры в метры
              if (key.toLowerCase().includes("длина сварных швов")) {
                newRow[key] = parseFloat(val) / 1000;
              } else {
                newRow[key] = parseFloat(val);
              }
            } else {
              newRow[key] = val;
            }
          });
          const rawWelder =
            newRow["Сварщик"] || newRow["ФИО"] || newRow["ФИО сварщика"] || "";
          newRow["welder_normalized"] = normalizeWelderName(rawWelder);
          return newRow;
        });
        headers = result.meta.fields || Object.keys(allData[0] || {});
        filteredData = [...allData];
        resolve();
      },
      error: reject,
    });
  });
}

function parseDefectData(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (result) => {
        if (result.data.length === 0) {
          console.warn("Лист с браком пуст");
          resolve();
          return;
        }
        defectData = result.data.map((row) => {
          const newRow = {};
          Object.keys(row).forEach((key) => {
            let val = row[key]?.trim() || "";
            const isStringField = STRING_FIELDS.some((sf) =>
              key.toLowerCase().includes(sf.toLowerCase()),
            );
            const isIntegerField = INTEGER_FIELDS.some((ifield) =>
              key.toLowerCase().includes(ifield.toLowerCase()),
            );

            if (isStringField) {
              newRow[key] = val;
            } else if (isIntegerField && val !== "" && !isNaN(val)) {
              newRow[key] = parseInt(val, 10);
            } else if (val.includes(",") && !isNaN(val.replace(",", "."))) {
              newRow[key] = parseFloat(val.replace(",", "."));
            } else if (val !== "" && !isNaN(val)) {
              newRow[key] = parseFloat(val);
            } else {
              newRow[key] = val;
            }
          });
          const rawExecutor =
            newRow["Исполнитель, допустивший несоответствие"] || "";
          newRow["executor_normalized"] = normalizeWelderName(rawExecutor);
          return newRow;
        });
        defectHeaders = result.meta.fields || Object.keys(defectData[0] || {});

        // Строим defectMap для быстрой проверки
        defectMap.clear();
        defectData.forEach((defect) => {
          const order = String(getOrderNumber(defect)).trim();
          const bottom = String(getBottomNumber(defect)).trim();
          if (order && bottom) {
            defectMap.add(`${order}_${bottom}`);
          }
        });

        console.log("Данные о браке загружены:", {
          totalDefects: defectData.length,
          uniqueBottoms: defectMap.size,
          headers: defectHeaders,
        });
        resolve();
      },
      error: reject,
    });
  });
}

// Проверка, является ли операция бракованной (по номеру заказа и номеру днища)
function isDefective(row) {
  const order = String(getOrderNumber(row)).trim();
  const bottom = String(getBottomNumber(row)).trim();
  if (!order || !bottom) return false;
  return defectMap.has(`${order}_${bottom}`);
}

function hasDefectData() {
  return defectData.length > 0;
}
