// app.js – точка входа, управление состоянием и связь между модулями

// ========== Глобальные переменные состояния ==========
let allData = [];
let filteredData = [];
let headers = [];
let defectRule = { field: "ИТОГО проволока", operator: "=", value: 0 };
let reworkPlot, otherDefectsPlot;
let efficiencyPlot, weldLengthPlot, defectPie;
let filteredDefectData = []; // отфильтрованные по дате записи брака (все операции)

// Множество допустимых фамилий сварщиков (из основного листа) – пока не используется, но оставим
let validWeldersSet = new Set();

// Для пагинации таблицы
let tableDisplayLimit = 500; // сколько последних записей показывать

const KPI_TARGETS = {
  defectRate: 5,
  avgLength: 30,
  monthlyTarget: 900,
};

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function formatNumber(num) {
  if (num === null || num === undefined) return "0";
  const value = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(value)) return "0";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Фильтрация брака по дате
function filterDefectData(dateFrom, dateTo) {
  if (!window.parser.getDefectData || !window.parser.getDefectData().length)
    return [];
  const allDefect = window.parser.getDefectData();

  const filtered = allDefect.filter((row) => {
    const dateStr = row["Дата выяв-ния несоответствия"];
    if (!dateStr) return true;
    const [day, month, year] = dateStr.split(".").map(Number);
    if (!day || !month || !year) return true;
    const rowDate = new Date(year, month - 1, day);

    if (dateFrom && dateFrom.trim() !== "") {
      const [fd, fm, fy] = dateFrom.split(".").map(Number);
      if (fd && fm && fy) {
        const fromDate = new Date(fy, fm - 1, fd);
        if (rowDate < fromDate) return false;
      }
    }
    if (dateTo && dateTo.trim() !== "") {
      const [td, tm, ty] = dateTo.split(".").map(Number);
      if (td && tm && ty) {
        const toDate = new Date(ty, tm - 1, td);
        if (rowDate > toDate) return false;
      }
    }
    return true;
  });

  console.log(
    `filterDefectData: ${filtered.length} записей из ${allDefect.length}`,
  );
  return filtered;
}

// Возвращает только записи брака с операцией "Предъявление продукции"
function getMainDefectData() {
  if (!filteredDefectData.length) return [];
  const main = filteredDefectData.filter(
    (d) => d["Технологическая операция"] === "Предъявление продукции",
  );
  return main;
}

// Возвращает только записи брака с операцией "Исправление повторное"
function getReworkDefectData() {
  if (!filteredDefectData.length) return [];
  return filteredDefectData.filter(
    (d) => d["Технологическая операция"] === "Исправление повторное",
  );
}

function getOtherDefectsData() {
  if (!filteredDefectData.length) return { labels: [], counts: [] };
  const other = filteredDefectData.filter((d) => {
    const op = d["Технологическая операция"];
    return (
      op && op !== "Предъявление продукции" && op !== "Исправление повторное"
    );
  });
  const byOperation = {};
  other.forEach((d) => {
    const op = d["Технологическая операция"] || "Не указано";
    byOperation[op] = (byOperation[op] || 0) + 1;
  });
  const labels = Object.keys(byOperation);
  const counts = labels.map((op) => byOperation[op]);
  return { labels, counts };
}

// ========== НОВАЯ ФУНКЦИЯ ДЛЯ РАСЧЁТА СТАТИСТИКИ ПО СВАРЩИКАМ ==========
function computeWeldersStats() {
  const welders = {};

  // Коэффициенты сложности раскроя (по первой букве)
  const cutCoeffs = {
    А: 2,
    Б: 2,
    В: 3,
    Г: 4,
    Д: 5,
    Е: 4.5,
  };
  // Проволоки углеродистой стали (для определения материала)
  const carbonWires = ["08Г2С", "10НМА", "08ГА"];

  filteredData.forEach((row) => {
    const welder = row["welder_normalized"] || "Неизвестно";
    const bottom = window.getBottomNumber(row);
    const length = window.safeParseFloat(row["Длина сварных швов"]);
    const cutType = row["Раскрой"] ? row["Раскрой"].toString().trim() : "";
    const wire = row["Проволока"] ? row["Проволока"].toString().trim() : "";
    const dateStr = row["Дата"]; // для сбора смен

    // Коэффициент раскроя: берём первый символ, если он есть в словаре, иначе 1
    let cutCoeff = 1;
    if (cutType) {
      const firstChar = cutType.charAt(0).toUpperCase();
      if (cutCoeffs.hasOwnProperty(firstChar)) {
        cutCoeff = cutCoeffs[firstChar];
      }
    }

    // Коэффициент материала: углеродистая = 1, нержавейка = 1.2
    let materialCoeff = 1.2; // по умолчанию нержавейка
    if (carbonWires.some((cw) => wire.includes(cw))) {
      materialCoeff = 1.0;
    }

    const weightedLength = length * cutCoeff * materialCoeff;

    if (!welders[welder]) {
      welders[welder] = {
        total: 0,
        totalLength: 0,
        weightedTotal: 0,
        bottoms: new Set(),
        days: new Set(), // добавляем множество дат
      };
    }
    welders[welder].total++;
    welders[welder].totalLength += length;
    welders[welder].weightedTotal += weightedLength;
    if (bottom) {
      welders[welder].bottoms.add(bottom);
    }
    if (dateStr) {
      welders[welder].days.add(dateStr);
    }
  });

  // Собираем бракованные днища из листа брака (только "Предъявление продукции")
  const defectiveBottoms = new Set();
  if (window.hasDefectData()) {
    const mainDefects = getMainDefectData();
    mainDefects.forEach((defectRow) => {
      const bottom = window.getBottomNumber(defectRow);
      if (bottom) defectiveBottoms.add(bottom);
    });
  }

  // Для каждого сварщика считаем брак и производные показатели
  Object.keys(welders).forEach((welder) => {
    const info = welders[welder];
    let defectCount = 0;
    if (info.bottoms) {
      info.bottoms.forEach((bottom) => {
        if (defectiveBottoms.has(bottom)) defectCount++;
      });
    }
    info.defect = defectCount;
    info.avgLength = info.total
      ? (info.totalLength / info.total).toFixed(2)
      : 0;
    info.defectRate = info.total
      ? ((defectCount / info.total) * 100).toFixed(1)
      : 0;

    // Новая метрика: средняя длина за смену
    const daysCount = info.days.size;
    info.avgLengthPerShift =
      daysCount > 0 ? (info.totalLength / daysCount).toFixed(2) : 0;

    // Рейтинг: взвешенная длина минус штраф за брак (10 за каждое бракованное днище)
    const penaltyPerDefect = 10; // можно настроить
    info.score = info.weightedTotal - defectCount * penaltyPerDefect;
  });

  return welders;
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Приложение инициализируется...");
  if (typeof Chart === "undefined") {
    console.error("Chart.js не загружен!");
    showError(
      "Библиотека Chart.js не загружена. Проверьте подключение скриптов.",
    );
    return;
  }

  try {
    const result = await window.parser.loadDataFromCSV();
    if (!result || !result.mainData.length) {
      showError(
        "Не удалось загрузить данные. Проверьте файлы data.csv/defect.csv или ссылки Google Sheets.",
      );
      return;
    }

    allData = result.mainData;
    headers = result.mainHeaders;
    window.defectData = result.defectData;
    filteredData = [...allData];
    filteredDefectData = result.defectData ? [...result.defectData] : [];

    // Заполняем множество допустимых сварщиков (оставим для совместимости)
    validWeldersSet.clear();
    allData.forEach((row) => {
      const welder = row["welder_normalized"];
      if (welder && welder !== "Неизвестно") {
        validWeldersSet.add(welder);
      }
    });
    console.log("Допустимые сварщики:", Array.from(validWeldersSet));

    initFilters();
    initDefectSelector();
    updateStats();
    renderTable();
    updateWeldersRanking();
    updateDefectSummary();
    updateTrends();

    efficiencyPlot = document.getElementById("efficiency-chart")
      ? new EfficiencyPlot("efficiency-chart")
      : null;
    weldLengthPlot = document.getElementById("weld-chart")
      ? new WeldLengthPlot("weld-chart")
      : null;
    defectPie = document.getElementById("defect-pie")
      ? new DefectPie("defect-pie")
      : null;
    reworkPlot = document.getElementById("rework-chart")
      ? new ReworkPlot("rework-chart")
      : null;
    otherDefectsPlot = document.getElementById("other-defects-chart")
      ? new OtherDefectsPlot("other-defects-chart")
      : null;
    window.reworkPie = document.getElementById("rework-pie-chart")
      ? new ReworkPie("rework-pie-chart")
      : null;

    // Далее обновления:
    updateReworkChart();
    updateOtherDefectsChart();
    buildEfficiencyChart();
    buildWeldLengthChart();
    updateDefectPie();
    updateReworkPie();

    setupEventListeners();
    console.log("Приложение успешно инициализировано");
  } catch (error) {
    console.error("Ошибка при инициализации:", error);
    showError(`Ошибка инициализации: ${error.message}`);
  }
});

function setupEventListeners() {
  document
    .getElementById("apply-filters")
    .addEventListener("click", applyFilters);
  document
    .getElementById("reset-filters")
    .addEventListener("click", resetFilters);
  document
    .getElementById("update-efficiency")
    .addEventListener("click", buildEfficiencyChart);
  document
    .getElementById("update-weld")
    .addEventListener("click", buildWeldLengthChart);
  document.getElementById("apply-defect-rule").addEventListener("click", () => {
    updateDefectRule();
    updateDefectPie();
    updateStats();
    updateWeldersRanking();
    updateDefectSummary();
    updateReworkPie();
  });
  document.getElementById("refresh-metrics").addEventListener("click", () => {
    updateStats();
    updateWeldersRanking();
    updateDefectSummary();
    updateTrends();
  });
  document.getElementById("export-data").addEventListener("click", exportToCSV);
  document.getElementById("help-btn").addEventListener("click", () => {
    document.getElementById("help-modal").classList.add("active");
  });
  document.querySelector(".close-modal").addEventListener("click", () => {
    document.getElementById("help-modal").classList.remove("active");
  });
  document.getElementById("help-modal").addEventListener("click", (e) => {
    if (e.target.id === "help-modal")
      document.getElementById("help-modal").classList.remove("active");
  });
  // Обработчик для иконок справки по KPI (делегирование через родительский контейнер)
  document.getElementById("stats-cards").addEventListener("click", (e) => {
    const target = e.target.closest(".kpi-info");
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      const kpiType = target.dataset.kpi;
      showKPIInfo(kpiType);
    }
  });

  // Кнопка загрузки ещё записей в таблице
  document.getElementById("load-more").addEventListener("click", () => {
    tableDisplayLimit += 500;
    renderTable();
    if (tableDisplayLimit >= filteredData.length) {
      document.getElementById("load-more").style.display = "none";
    }
  });

  // Обработчики для иконок справки по графикам
  document.querySelectorAll(".graph-info").forEach((icon) => {
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      const graph = e.target.dataset.graph;
      showGraphInfo(graph);
    });
  });

  // Закрытие модального окна справки по графикам
  document
    .querySelector("#graph-info-modal .close-modal")
    .addEventListener("click", () => {
      document.getElementById("graph-info-modal").classList.remove("active");
    });

  document.getElementById("graph-info-modal").addEventListener("click", (e) => {
    if (e.target.id === "graph-info-modal") {
      document.getElementById("graph-info-modal").classList.remove("active");
    }
  });

  function showKPIInfo(kpiType) {
    const modal = document.getElementById("graph-info-modal");
    const titleEl = document.getElementById("graph-info-title");
    const bodyEl = document.getElementById("graph-info-body");

    let title = "";
    let text = "";

    switch (kpiType) {
      case "total":
        title = "Всего операций";
        text = `
          <p><strong>Что показывает:</strong> общее количество сварочных операций (записей) за выбранный период.</p>
          <p><strong>Тренд:</strong> изменение количества операций между первой и второй половиной периода (относительное, в %). Рост — зелёный, падение — красный.</p>
          <p><em>Пример:</em> если в первой половине было 100 операций, во второй — 110, тренд +10%.</p>
        `;
        break;
      case "sum":
        title = "Сумма швов (м)";
        text = `
          <p><strong>Что показывает:</strong> суммарную длину всех сварных швов в метрах за выбранный период.</p>
          <p><strong>Тренд:</strong> изменение суммы между первой и второй половиной периода (относительное, в %). Рост — зелёный, падение — красный.</p>
        `;
        break;
      case "avg":
        title = "Средняя за смену (м)";
        text = `
          <p><strong>Что показывает:</strong> среднюю длину швов, выполненную за одну смену (уникальную дату). Рассчитывается как общая сумма швов, делённая на количество уникальных дат в периоде.</p>
          <p><strong>Норма:</strong> ≥${KPI_TARGETS.avgLength} м.</p>
          <p><strong>Тренд:</strong> изменение средней за смену между первой и второй половиной периода (относительное, в %). Рост — зелёный, падение — красный.</p>
        `;
        break;
      case "defect":
        title = "Брак (%)";
        text = `
          <p><strong>Что показывает:</strong> долю бракованных операций от общего числа.</p>
          <p>Брак определяется по реальным данным из листа "Брак" (только операция "Предъявление продукции") или по настраиваемому правилу.</p>
          <p><strong>Норма:</strong> ≤${KPI_TARGETS.defectRate}%.</p>
          <p><strong>Тренд:</strong> изменение процента брака между первой и второй половиной периода в процентных пунктах (п.п.). Рост брака — красный, снижение — зелёный.</p>
          <p><em>Пример:</em> брак вырос с 2% до 3% → тренд +1 п.п.</p>
        `;
        break;
      default:
        title = "Показатель";
        text = "<p>Описание отсутствует.</p>";
    }

    titleEl.textContent = `ℹ️ ${title}`;
    bodyEl.innerHTML = text;
    modal.classList.add("active");
  }

  // Также в самом конце файла добавляем новую функцию showGraphInfo
  function showGraphInfo(graph) {
    const modal = document.getElementById("graph-info-modal");
    const titleEl = document.getElementById("graph-info-title");
    const bodyEl = document.getElementById("graph-info-body");

    let title = "";
    let text = "";

    switch (graph) {
      case "welders":
        title = "Рейтинг сварщиков";
        text = `
          <p><strong>Как считается рейтинг:</strong></p>
          <ul>
            <li>Для каждого сварщика учитываются все операции за выбранный период.</li>
            <li>Рассчитывается взвешенная сумма длин швов с учётом коэффициентов сложности раскроя (А=2, Б=2, В=3, Г=4, Д=5, Е=4.5) и материала (нержавейка ×1.2, углеродистая ×1).</li>
            <li>Процент брака считается по уникальным забракованным днищам (из листа "Брак").</li>
            <li><strong>Средняя длина за смену</strong> — общая длина швов, выполненная сварщиком, делённая на количество дней (смен), когда он работал.</li>
            <li>Рейтинг = <code>(взвешенная длина) - (количество бракованных днищ × 10)</code>.</li>
            <li>Чем выше рейтинг, тем эффективнее работает сварщик с учётом сложности работ.</li>
          </ul>
          <p><strong>Данные:</strong> из основного листа (сварка) и листа "Брак" (при наличии).</p>
        `;
        break;
      case "defect-summary":
        title = "Анализ брака";
        text = `
          <p><strong>Общее количество бракованных операций:</strong> количество записей брака с операцией "Предъявление продукции" (уникальные днища) за период.</p>
          <p><strong>Процент брака:</strong> (бракованные операции / всего операций) × 100.</p>
          <p><strong>Топ сварщиков по браку:</strong> сварщики с наибольшим количеством бракованных операций (учитываются только те, кто есть в основном листе).</p>
          <p><strong>Источник данных:</strong> лист "Брак" или настраиваемое правило.</p>
        `;
        break;
      case "efficiency":
        title = "Динамика производства";
        text = `
          <p><strong>Формула:</strong> Σ (Длина сварных швов) за выбранный период.</p>
          <p><strong>Период группировки:</strong> день, месяц, квартал, год.</p>
          <p><strong>Данные:</strong> берутся из основного листа (поле "Длина сварных швов") с учётом фильтров.</p>
          <p>Зелёные столбцы – выше среднего, синие – ниже среднего. Оранжевая пунктирная линия – среднее значение за весь период.</p>
        `;
        break;
      case "weld-length":
        title = "Производительность сварщиков";
        text = `
          <p><strong>Что показывает:</strong> суммарную длину сварных швов по каждому сварщику за выбранный период (месяц или квартал).</p>
          <p>Каждая линия соответствует одному сварщику. По оси X – период, по оси Y – длина швов в метрах.</p>
          <p><strong>Данные:</strong> из основного листа (поля "Сварщик", "Длина сварных швов", "Дата").</p>
        `;
        break;
      case "defect-pie":
        title = "Распределение брака по сварщикам";
        text = `
          <p><strong>Как считается:</strong></p>
          <ul>
            <li>Для каждого сварщика берётся количество его уникальных дней, которые попали в брак (операция "Предъявление продукции" из листа "Брак").</li>
            <li>Если данных брака нет, используется настраиваемое правило (например, ИТОГО проволока = 0).</li>
            <li>Процент = (бракованные днища / общее количество дней, сваренных этим сварщиком) × 100.</li>
          </ul>
          <p>Размер сектора – доля брака данного сварщика в общем объёме брака (в процентах).</p>
        `;
        break;
      case "rework":
        title = "Повторные исправления";
        text = `
          <p><strong>Повторные исправления</strong> – это записи в листе "Брак" с операцией "Исправление повторное".</p>
          <p><strong>Столбчатая диаграмма показывает:</strong></p>
          <ul>
            <li><span style="color:#ef4444;">Красные столбцы</span> – количество уникальных днищ, которые были повторно исправлены (по каждому сварщику).</li>
            <li><span style="color:#3b82f6;">Синие столбцы</span> – общее количество уникальных днищ, сваренных этим сварщиком (для сравнения).</li>
          </ul>
          <p>Если сварщик не имеет повторных исправлений, красный столбец отсутствует.</p>
        `;
        break;
      case "rework-pie":
        title = "Доля повторных исправлений";
        text = `
          <p><strong>Круговая диаграмма показывает соотношение:</strong></p>
          <ul>
            <li><span style="color:#3b82f6;">Синий сектор</span> – количество записей брака с операцией "Предъявление продукции".</li>
            <li><span style="color:#ef4444;">Красный сектор</span> – количество записей с операцией "Исправление повторное".</li>
          </ul>
          <p>Таким образом, вы видите, какую долю от всех проблемных операций составляют повторные исправления.</p>
        `;
        break;
      case "other-defects":
        title = "Прочие дефекты";
        text = `
          <p><strong>Прочие дефекты</strong> – это записи брака, не относящиеся к "Предъявлению продукции" и "Исправлению повторному".</p>
          <p>Диаграмма показывает распределение таких записей по типам технологических операций (например, "Входной контроль", "Отбортовка", "Штамповка" и т.д.).</p>
          <p>Размер сектора – доля данного типа операции среди всех прочих дефектов.</p>
        `;
        break;
      case "trends":
        title = "Тренды и сравнения";
        text = `
          <p><strong>Текущий месяц:</strong> сумма длины швов за последний месяц, отображённый на графике.</p>
          <p><strong>Среднее за 3 месяца:</strong> среднее арифметическое за последние три месяца.</p>
          <p><strong>Целевой показатель:</strong> 1000 м/месяц (можно изменить в коде).</p>
          <p><strong>Всего за период:</strong> общая сумма длины швов за весь отображаемый период.</p>
          <p>Стрелки ↑/↓ показывают изменение относительно предыдущего аналогичного периода.</p>
        `;
        break;
      default:
        title = "Справка";
        text = "<p>Описание отсутствует.</p>";
    }

    titleEl.textContent = `ℹ️ ${title}`;
    bodyEl.innerHTML = text;
    modal.classList.add("active");
  }
  initDataSourceConfig();
}

// ========== НАСТРОЙКА ИСТОЧНИКОВ ДАННЫХ ==========
function initDataSourceConfig() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const sourceConfigs = document.querySelectorAll(".source-config");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const source = btn.dataset.source;
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      sourceConfigs.forEach((config) => {
        config.classList.remove("active");
        if (config.id === `${source}-source-config`)
          config.classList.add("active");
      });
    });
  });

  const toggleBtn = document.getElementById("toggle-data-source");
  const configDiv = document.getElementById("data-source-config");
  toggleBtn.addEventListener("click", () => {
    if (configDiv.style.display === "none") {
      configDiv.style.display = "block";
      toggleBtn.textContent = "▼";
    } else {
      configDiv.style.display = "none";
      toggleBtn.textContent = "▶";
    }
  });

  document
    .getElementById("apply-google-config")
    .addEventListener("click", applyGoogleConfig);
  document.getElementById("reload-data").addEventListener("click", reloadData);
  loadSavedConfig();
  updateCurrentSourceDisplay();
}

function applyGoogleConfig() {
  const mainUrl = document.getElementById("main-sheet-url").value.trim();
  const defectUrl = document.getElementById("defect-sheet-url").value.trim();
  if (!mainUrl && !defectUrl) {
    alert("Введите хотя бы одну ссылку на Google Таблицу");
    return;
  }
  if (mainUrl && !mainUrl.includes("docs.google.com/spreadsheets")) {
    alert(
      "Некорректная ссылка на основной файл. Ожидается ссылка на Google Sheets в формате CSV",
    );
    return;
  }
  if (defectUrl && !defectUrl.includes("docs.google.com/spreadsheets")) {
    alert(
      "Некорректная ссылка на файл брака. Ожидается ссылка на Google Sheets в формате CSV",
    );
    return;
  }

  window.parser.CONFIG.MAIN_CSV_URL = mainUrl || null;
  window.parser.CONFIG.DEFECT_CSV_URL = defectUrl || null;
  localStorage.setItem(
    "googleSheetsConfig",
    JSON.stringify({ mainUrl: mainUrl || null, defectUrl: defectUrl || null }),
  );
  updateCurrentSourceDisplay();
  alert(
    'Настройки сохранены! Нажмите "Перезагрузить данные" для применения изменений.',
  );
}

async function reloadData() {
  const btn = document.getElementById("reload-data");
  const originalText = btn.textContent;
  btn.textContent = "⏳ Загрузка...";
  btn.disabled = true;

  try {
    const result = await window.parser.loadDataFromCSV();
    if (result && result.mainData.length) {
      allData = result.mainData;
      headers = result.mainHeaders;
      window.defectData = result.defectData;
      filteredData = [...allData];
      filteredDefectData = result.defectData ? [...result.defectData] : [];

      validWeldersSet.clear();
      allData.forEach((row) => {
        const welder = row["welder_normalized"];
        if (welder && welder !== "Неизвестно") {
          validWeldersSet.add(welder);
        }
      });

      updateUI();
      alert("Данные успешно перезагружены!");
    } else {
      alert("Не удалось загрузить данные. Проверьте консоль.");
    }
  } catch (error) {
    console.error("Ошибка при перезагрузке данных:", error);
    alert("Ошибка при перезагрузке данных. Подробности в консоли (F12)");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function loadSavedConfig() {
  try {
    const saved = localStorage.getItem("googleSheetsConfig");
    if (saved) {
      const config = JSON.parse(saved);
      if (config.mainUrl)
        document.getElementById("main-sheet-url").value = config.mainUrl;
      if (config.defectUrl)
        document.getElementById("defect-sheet-url").value = config.defectUrl;
      if (config.mainUrl || config.defectUrl)
        document.querySelector('.tab-btn[data-source="google"]').click();
    } else {
      if (window.parser.CONFIG.MAIN_CSV_URL)
        document.getElementById("main-sheet-url").value =
          window.parser.CONFIG.MAIN_CSV_URL;
      if (window.parser.CONFIG.DEFECT_CSV_URL)
        document.getElementById("defect-sheet-url").value =
          window.parser.CONFIG.DEFECT_CSV_URL;
      if (
        window.parser.CONFIG.MAIN_CSV_URL ||
        window.parser.CONFIG.DEFECT_CSV_URL
      ) {
        document.querySelector('.tab-btn[data-source="google"]').click();
      }
    }
  } catch (error) {
    console.warn("Ошибка при загрузке сохранённых настроек:", error);
  }
}

function updateCurrentSourceDisplay() {
  const display = document.getElementById("current-source-display");
  const config = window.parser.CONFIG;
  if (config.MAIN_CSV_URL || config.DEFECT_CSV_URL) {
    const sources = [];
    if (config.MAIN_CSV_URL) sources.push("Основной файл");
    if (config.DEFECT_CSV_URL) sources.push("Брак");
    display.textContent = `Google Таблицы (${sources.join(", ")})`;
  } else {
    display.textContent = "Локальные файлы";
  }
}

// ========== ФИЛЬТРЫ ==========
function initFilters() {
  const container = document.getElementById("filters-container");
  container.innerHTML = "";
  const filterFields = [
    {
      label: "Дата (с)",
      id: "filter-date-from",
      type: "text",
      placeholder: "ДД.ММ.ГГГГ",
    },
    {
      label: "Дата (по)",
      id: "filter-date-to",
      type: "text",
      placeholder: "ДД.ММ.ГГГГ",
    },
    { label: "Заказ", id: "filter-order", type: "text", placeholder: "Все" },
    {
      label: "Номер днища",
      id: "filter-bottom",
      type: "text",
      placeholder: "Все",
    },
    {
      label: "ФИО сварщика",
      id: "filter-welder",
      type: "text",
      placeholder: "Все",
    },
    {
      label: "Диаметр",
      id: "filter-diameter",
      type: "text",
      placeholder: "Все",
    },
    {
      label: "Толщина",
      id: "filter-thickness",
      type: "text",
      placeholder: "Все",
    },
    {
      label: "Раскрой",
      id: "filter-cutting",
      type: "text",
      placeholder: "Все",
    },
  ];
  filterFields.forEach((field) => {
    const div = document.createElement("div");
    div.className = "filter-item";
    div.innerHTML = `<label>${field.label}</label><input type="${field.type}" id="${field.id}" placeholder="${field.placeholder}">`;
    container.appendChild(div);
  });
}

function applyFilters() {
  const dateFrom = document.getElementById("filter-date-from").value.trim();
  const dateTo = document.getElementById("filter-date-to").value.trim();
  const order = document
    .getElementById("filter-order")
    .value.trim()
    .toLowerCase();
  const bottom = document
    .getElementById("filter-bottom")
    .value.trim()
    .toLowerCase();
  const welder = document
    .getElementById("filter-welder")
    .value.trim()
    .toLowerCase();
  const diameter = document.getElementById("filter-diameter").value.trim();
  const thickness = document.getElementById("filter-thickness").value.trim();
  const cutting = document
    .getElementById("filter-cutting")
    .value.trim()
    .toLowerCase();

  if (dateFrom && !window.isValidDateFormat(dateFrom)) {
    alert("Некорректный формат даты 'с'. Используйте ДД.ММ.ГГГГ");
    return;
  }
  if (dateTo && !window.isValidDateFormat(dateTo)) {
    alert("Некорректный формат даты 'по'. Используйте ДД.ММ.ГГГГ");
    return;
  }

  filteredData = allData.filter((row) => {
    if (dateFrom || dateTo) {
      const rowDate = row["Дата"];
      if (!rowDate) return false;
      const [day, month, year] = rowDate.split(".").map(Number);
      if (!day || !month || !year) return false;
      const rowDateObj = new Date(year, month - 1, day);

      if (dateFrom) {
        const [fd, fm, fy] = dateFrom.split(".").map(Number);
        if (fd && fm && fy) {
          const fromDateObj = new Date(fy, fm - 1, fd);
          if (rowDateObj < fromDateObj) return false;
        }
      }
      if (dateTo) {
        const [td, tm, ty] = dateTo.split(".").map(Number);
        if (td && tm && ty) {
          const toDateObj = new Date(ty, tm - 1, td);
          if (rowDateObj > toDateObj) return false;
        }
      }
    }

    if (order) {
      const rowOrder = (
        row["Заказ"] ||
        row["№Заказа"] ||
        row["Номер заказа"] ||
        ""
      )
        .toString()
        .toLowerCase();
      if (!rowOrder.includes(order)) return false;
    }
    if (bottom) {
      const rowBottom = (
        row["№Днища"] ||
        row["№ Днища"] ||
        row["Номер днища"] ||
        ""
      )
        .toString()
        .toLowerCase();
      if (!rowBottom.includes(bottom)) return false;
    }
    if (welder) {
      const rowWelder = (
        row["Сварщик"] ||
        row["ФИО"] ||
        row["ФИО сварщика"] ||
        ""
      )
        .toString()
        .toLowerCase();
      if (!rowWelder.includes(welder)) return false;
    }
    if (diameter) {
      const rowDiameter = row["Диаметр"];
      if (
        rowDiameter === undefined ||
        rowDiameter === null ||
        rowDiameter === ""
      )
        return false;
      if (typeof rowDiameter === "number") {
        if (parseFloat(diameter) !== rowDiameter) return false;
      } else {
        const rowDiameterNum = parseFloat(rowDiameter);
        const filterDiameterNum = parseFloat(diameter);
        if (!isNaN(rowDiameterNum) && !isNaN(filterDiameterNum)) {
          if (rowDiameterNum !== filterDiameterNum) return false;
        } else {
          if (
            !rowDiameter
              .toString()
              .toLowerCase()
              .includes(diameter.toLowerCase())
          )
            return false;
        }
      }
    }
    if (thickness) {
      const rowThickness = row["Толщина"];
      if (
        rowThickness === undefined ||
        rowThickness === null ||
        rowThickness === ""
      )
        return false;
      if (typeof rowThickness === "number") {
        if (parseFloat(thickness) !== rowThickness) return false;
      } else {
        const rowThicknessNum = parseFloat(rowThickness);
        const filterThicknessNum = parseFloat(thickness);
        if (!isNaN(rowThicknessNum) && !isNaN(filterThicknessNum)) {
          if (rowThicknessNum !== filterThicknessNum) return false;
        } else {
          if (
            !rowThickness
              .toString()
              .toLowerCase()
              .includes(thickness.toLowerCase())
          )
            return false;
        }
      }
    }
    if (cutting) {
      const rowCutting = (row["Раскрой"] || "").toString().toLowerCase();
      if (!rowCutting.includes(cutting)) return false;
    }
    return true;
  });

  filteredDefectData = filterDefectData(dateFrom, dateTo);
  tableDisplayLimit = 500;
  updateUI();
}

function resetFilters() {
  document.getElementById("filter-date-from").value = "";
  document.getElementById("filter-date-to").value = "";
  document.getElementById("filter-order").value = "";
  document.getElementById("filter-bottom").value = "";
  document.getElementById("filter-welder").value = "";
  document.getElementById("filter-diameter").value = "";
  document.getElementById("filter-thickness").value = "";
  document.getElementById("filter-cutting").value = "";

  filteredData = [...allData];
  filteredDefectData = window.parser.getDefectData
    ? [...window.parser.getDefectData()]
    : [];
  tableDisplayLimit = 500;
  updateUI();
}

function updateUI() {
  updateStats();
  renderTable();
  buildEfficiencyChart();
  buildWeldLengthChart();
  updateDefectPie();
  updateReworkChart();
  updateOtherDefectsChart();
  updateWeldersRanking();
  updateDefectSummary();
  updateTrends();
  updateReworkPie();
}

function updateStats() {
  const total = filteredData.length;
  let totalLength = 0,
    totalWire = 0;

  // Общее количество уникальных дат (для средней за смену)
  const uniqueDates = new Set();

  filteredData.forEach((row) => {
    totalLength += window.safeParseFloat(row["Длина сварных швов"]);
    totalWire += window.safeParseFloat(row["ИТОГО проволока"]);
    const dateStr = row["Дата"];
    if (dateStr) uniqueDates.add(dateStr);
  });

  const daysCount = uniqueDates.size;
  const avgPerShift = daysCount > 0 ? (totalLength / daysCount).toFixed(2) : 0;

  // Брак (общий)
  let defectCount, defectPct;
  if (window.hasDefectData()) {
    const mainDefects = getMainDefectData();
    defectCount = mainDefects.length;
    defectPct = total ? ((defectCount / total) * 100).toFixed(1) : 0;
  } else {
    defectCount = filteredData.filter((row) =>
      evaluateDefect(row, defectRule),
    ).length;
    defectPct = total ? ((defectCount / total) * 100).toFixed(1) : 0;
  }

  // --- РАСЧЁТ ТРЕНДОВ (по половинам) ---
  const midPoint = Math.floor(filteredData.length / 2);
  const firstHalf = filteredData.slice(0, midPoint);
  const secondHalf = filteredData.slice(midPoint);

  // Сумма швов по половинам (уже было)
  const firstHalfLength = firstHalf.reduce(
    (sum, r) => sum + window.safeParseFloat(r["Длина сварных швов"]),
    0,
  );
  const secondHalfLength = secondHalf.reduce(
    (sum, r) => sum + window.safeParseFloat(r["Длина сварных швов"]),
    0,
  );
  const lengthTrend =
    firstHalfLength > 0
      ? (
          ((secondHalfLength - firstHalfLength) / firstHalfLength) *
          100
        ).toFixed(1)
      : 0;

  // Количество операций по половинам
  const firstHalfCount = firstHalf.length;
  const secondHalfCount = secondHalf.length;
  const countTrend =
    firstHalfCount > 0
      ? (((secondHalfCount - firstHalfCount) / firstHalfCount) * 100).toFixed(1)
      : 0;

  // Уникальные даты и средняя за смену по половинам
  const firstHalfDates = new Set();
  firstHalf.forEach((r) => {
    const d = r["Дата"];
    if (d) firstHalfDates.add(d);
  });
  const secondHalfDates = new Set();
  secondHalf.forEach((r) => {
    const d = r["Дата"];
    if (d) secondHalfDates.add(d);
  });
  const firstHalfAvg =
    firstHalfDates.size > 0 ? firstHalfLength / firstHalfDates.size : 0;
  const secondHalfAvg =
    secondHalfDates.size > 0 ? secondHalfLength / secondHalfDates.size : 0;
  const avgTrend =
    firstHalfAvg > 0
      ? (((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1)
      : 0;

  // Процент брака по половинам
  let firstHalfDefect = 0;
  let secondHalfDefect = 0;
  if (window.hasDefectData()) {
    // Используем реальные данные брака
    const mainDefects = getMainDefectData(); // все записи брака за период
    // Превратим в Set номеров днищ для быстрого поиска
    const defectiveBottoms = new Set();
    mainDefects.forEach((d) => {
      const b = window.getBottomNumber(d);
      if (b) defectiveBottoms.add(b);
    });
    // Считаем брак в первой половине: количество уникальных днищ из firstHalf, попавших в defectiveBottoms
    const firstHalfBottoms = new Set();
    firstHalf.forEach((r) => {
      const b = window.getBottomNumber(r);
      if (b) firstHalfBottoms.add(b);
    });
    firstHalfDefect = [...firstHalfBottoms].filter((b) =>
      defectiveBottoms.has(b),
    ).length;
    const secondHalfBottoms = new Set();
    secondHalf.forEach((r) => {
      const b = window.getBottomNumber(r);
      if (b) secondHalfBottoms.add(b);
    });
    secondHalfDefect = [...secondHalfBottoms].filter((b) =>
      defectiveBottoms.has(b),
    ).length;
  } else {
    // Используем правило
    firstHalfDefect = firstHalf.filter((r) =>
      evaluateDefect(r, defectRule),
    ).length;
    secondHalfDefect = secondHalf.filter((r) =>
      evaluateDefect(r, defectRule),
    ).length;
  }
  const firstHalfDefectPct =
    firstHalfCount > 0 ? (firstHalfDefect / firstHalfCount) * 100 : 0;
  const secondHalfDefectPct =
    secondHalfCount > 0 ? (secondHalfDefect / secondHalfCount) * 100 : 0;
  const defectTrend = (secondHalfDefectPct - firstHalfDefectPct).toFixed(1); // в п.п.

  // Определяем классы и значки для трендов
  const getTrendInfo = (value, type = "percent") => {
    if (value == 0) return { class: "neutral", icon: "→" };
    const isPositive = value > 0;
    if (type === "defect") {
      // для брака: рост – плохо (красный вверх), падение – хорошо (зелёный вниз)
      return {
        class: isPositive ? "up bad" : "down good",
        icon: isPositive ? "↑" : "↓",
      };
    } else {
      // для остальных: рост – хорошо (зелёный вверх), падение – плохо (красный вниз)
      return {
        class: isPositive ? "up good" : "down bad",
        icon: isPositive ? "↑" : "↓",
      };
    }
  };

  const lengthTrendInfo = getTrendInfo(parseFloat(lengthTrend), "length");
  const countTrendInfo = getTrendInfo(parseFloat(countTrend), "count");
  const avgTrendInfo = getTrendInfo(parseFloat(avgTrend), "avg");
  const defectTrendInfo = getTrendInfo(parseFloat(defectTrend), "defect");

  // Статусы для окраски карточек
  const defectStatus =
    parseFloat(defectPct) <= KPI_TARGETS.defectRate
      ? "good"
      : parseFloat(defectPct) <= KPI_TARGETS.defectRate * 2
        ? "warning"
        : "bad";

  const lengthStatus =
    parseFloat(avgPerShift) >= KPI_TARGETS.avgLength ? "good" : "warning";

  const defectSource = window.hasDefectData()
    ? 'из листа "Брак" (только Предъявление продукции)'
    : "по правилу";

  document.getElementById("stats-cards").innerHTML = `
    <div class="stat-card ${lengthStatus}">
      <span class="stat-label">Всего операций <span class="info-icon kpi-info" data-kpi="total" title="Подробнее">ⓘ</span></span>
      <div class="stat-value">${total}</div>
      <div class="stat-trend ${countTrendInfo.class}">${countTrendInfo.icon} ${Math.abs(countTrend)}%</div>
    </div>
    <div class="stat-card ${lengthStatus}">
      <span class="stat-label">Сумма швов (м) <span class="info-icon kpi-info" data-kpi="sum" title="Подробнее">ⓘ</span></span>
      <div class="stat-value">${formatNumber(totalLength)}</div>
      <div class="stat-trend ${lengthTrendInfo.class}">${lengthTrendInfo.icon} ${Math.abs(lengthTrend)}%</div>
    </div>
    <div class="stat-card ${lengthStatus}">
      <span class="stat-label">Средняя за смену (м) <span class="info-icon kpi-info" data-kpi="avg" title="Подробнее">ⓘ</span></span>
      <div class="stat-value">${avgPerShift}</div>
      <div class="stat-trend ${avgTrendInfo.class}">${avgTrendInfo.icon} ${Math.abs(avgTrend)}%</div>
      <div class="stat-trend neutral">Норма: ≥${KPI_TARGETS.avgLength} м</div>
    </div>
    <div class="stat-card ${defectStatus}">
      <span class="stat-label">Брак (%) <span class="info-icon kpi-info" data-kpi="defect" title="Подробнее">ⓘ</span></span>
      <div class="stat-value">${defectPct}%</div>
      <div class="stat-trend ${defectTrendInfo.class}">${defectTrendInfo.icon} ${Math.abs(defectTrend)} п.п.</div>
      <div class="stat-trend neutral">Норма: ≤${KPI_TARGETS.defectRate}% (${defectSource})</div>
    </div>
  `;
}

function renderTable() {
  const visibleHeaders = headers.slice(0, 15);
  const thead = document.getElementById("table-header");
  const tbody = document.getElementById("table-body");
  const resultCount = document.getElementById("result-count");
  const loadMoreBtn = document.getElementById("load-more");

  const totalRows = filteredData.length;
  const startIndex = Math.max(0, totalRows - tableDisplayLimit);
  const rowsToShow = filteredData.slice(startIndex, totalRows).reverse(); // показать последние сверху

  thead.innerHTML = `<tr>${visibleHeaders.map((h) => `<th>${h}</th>`).join("")}</tr>`;

  const columnWidths = calculateColumnWidths(visibleHeaders);
  tbody.innerHTML = rowsToShow
    .map((row) => {
      return `<tr>${visibleHeaders
        .map((h, idx) => {
          let val = row[h];
          const width = columnWidths[idx];
          let displayValue,
            cellClass = "";
          if (val === undefined || val === null || val === "") {
            displayValue = "—";
            cellClass = "empty";
          } else if (typeof val === "number") {
            const isIntegerField = [
              "Месяц",
              "Днище",
              "Толщина",
              "Диаметр",
              "Номер днища",
              "Количество выявленных дефектов",
            ].some((field) => h.toLowerCase().includes(field.toLowerCase()));
            if (isIntegerField && Number.isInteger(val)) {
              displayValue = val.toString();
              cellClass = "number integer";
            } else {
              displayValue = val.toFixed(2);
              cellClass = "number";
            }
          } else {
            displayValue = val;
          }
          return `<td class="${cellClass}" style="width: ${width}%; min-width: 80px;">${displayValue}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  const headerCells = thead.querySelectorAll("th");
  headerCells.forEach((th, idx) => {
    th.style.width = `${columnWidths[idx]}%`;
    th.style.minWidth = "80px";
  });

  resultCount.innerText = totalRows;

  if (totalRows > tableDisplayLimit) {
    loadMoreBtn.style.display = "inline-block";
    loadMoreBtn.textContent = `Загрузить ещё (показано ${rowsToShow.length} из ${totalRows})`;
  } else {
    loadMoreBtn.style.display = "none";
  }

  const oldNote = document.querySelector(".table-wrapper .pagination-note");
  if (oldNote) oldNote.remove();
}

function calculateColumnWidths(headers) {
  const sampleSize = Math.min(filteredData.length, 100);
  const columnScores = headers.map((header, idx) => {
    let score = String(header).length * 1.5;
    for (let i = 0; i < sampleSize; i++) {
      const val = filteredData[i][header];
      if (val !== undefined && val !== null && val !== "") {
        score += String(val).length;
      }
    }
    return score / sampleSize;
  });
  const totalScore = columnScores.reduce((sum, score) => sum + score, 0);
  const minWidthPercent = 5;
  const percentages = columnScores.map((score) =>
    Math.max(minWidthPercent, (score / totalScore) * 100),
  );
  const totalPct = percentages.reduce((sum, pct) => sum + pct, 0);
  return percentages.map((pct) => (pct / totalPct) * 100);
}

// ========== ОБНОВЛЁННАЯ ФУНКЦИЯ РЕЙТИНГА СВАРЩИКОВ ==========
function updateWeldersRanking() {
  const welders = computeWeldersStats();
  console.log("Welders from main (после фильтрации):", Object.keys(welders));

  console.log("=== Детальный расчёт процента брака (по днищам) ===");
  Object.keys(welders).forEach((w) => {
    console.log(
      `${w}: операции = ${welders[w].total}, брак = ${welders[w].defect}, % = ${welders[w].defectRate}, взвешенная длина = ${welders[w].weightedTotal.toFixed(2)}`,
    );
  });

  const sorted = Object.entries(welders)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 10);

  const container = document.getElementById("welders-ranking");
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👷</div><div class="empty-state-text">Нет данных о сварщиках</div></div>`;
    return;
  }

  container.innerHTML = sorted
    .map(
      ([welder, data], idx) => `
    <div class="welder-card">
      <div class="welder-name">${welder} <span class="welder-rank">${idx + 1}</span></div>
      <div class="welder-metrics">
        <div class="welder-metric"><span class="welder-metric-label">Операций</span><span class="welder-metric-value">${data.total}</span></div>
        <div class="welder-metric"><span class="welder-metric-label">Сумма швов (м)</span><span class="welder-metric-value">${formatNumber(data.totalLength.toFixed(2))}</span></div>
        <!-- Заменяем старую метрику на новую -->
        <div class="welder-metric"><span class="welder-metric-label">Средняя за смену (м)</span><span class="welder-metric-value">${data.avgLengthPerShift}</span></div>
        <div class="welder-metric"><span class="welder-metric-label">Брак (%)</span><span class="welder-metric-value" style="color: ${data.defectRate <= KPI_TARGETS.defectRate ? "#22c55e" : "#ef4444"}">${data.defectRate}%</span></div>
      </div>
    </div>
  `,
    )
    .join("");
}

// ========== ОБНОВЛЁННАЯ ФУНКЦИЯ АНАЛИЗА БРАКА ==========
function updateDefectSummary() {
  const total = filteredData.length;

  // Используем общую функцию для получения статистики по сварщикам
  const welders = computeWeldersStats();

  // Общее количество бракованных операций (уникальные днища)
  const defectCount = Object.values(welders).reduce(
    (sum, w) => sum + w.defect,
    0,
  );
  const defectPct = total ? (defectCount / total) * 100 : 0;

  // Топ сварщиков по количеству бракованных операций (абсолютное число)
  const topDefectWelders = Object.entries(welders)
    .sort((a, b) => b[1].defect - a[1].defect)
    .slice(0, 3)
    .map(([welder, data]) => [welder, data.defect]);

  const statusClass = defectPct <= KPI_TARGETS.defectRate ? "low" : "high";
  const defectSource = window.hasDefectData()
    ? 'Лист "Брак" (только Предъявление продукции)'
    : "Правило";

  document.getElementById("defect-summary").innerHTML = `
    <div class="defect-card ${statusClass}">
      <div class="defect-card-title">Всего бракованных операций (сварка)</div>
      <div class="defect-card-value">${defectCount}</div>
      <div style="font-size: 0.85rem; color: ${statusClass === "low" ? "#166534" : "#991b1b"}; margin-top: 0.5rem;">
        ${defectPct.toFixed(1)}% от общего объёма (${defectSource})
      </div>
    </div>
    <div class="defect-card ${statusClass}">
      <div class="defect-card-title">Топ сварщиков по браку</div>
      <div style="margin-top: 0.5rem;">
        ${topDefectWelders
          .map(
            ([welder, count]) => `
          <div style="display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid ${statusClass === "low" ? "#bbf7d0" : "#fecaca"};">
            <span>${welder}</span>
            <strong>${count}</strong>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
    <div class="defect-card ${statusClass}">
      <div class="defect-card-title">Источник данных</div>
      <div style="margin-top: 0.5rem; font-size: 0.9rem;">
        ${window.hasDefectData() ? 'Лист "Брак" (реальные данные, только Предъявление продукции)' : "Правило (настроенное условие)"}
      </div>
    </div>
  `;
}

function updateTrends() {
  const monthlyData = groupByDate(
    filteredData,
    "Длина сварных швов",
    "month",
    "sum",
  );
  if (monthlyData.labels.length < 2) {
    document.getElementById("trends-container").innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">Недостаточно данных для анализа трендов</div>
      </div>
    `;
    return;
  }

  const currentMonth = monthlyData.values[monthlyData.values.length - 1];
  const previousMonth = monthlyData.values[monthlyData.values.length - 2];
  const monthTrend =
    previousMonth > 0
      ? (((currentMonth - previousMonth) / previousMonth) * 100).toFixed(1)
      : 0;
  const monthTrendClass = monthTrend >= 0 ? "positive" : "negative";
  const monthTrendIcon = monthTrend >= 0 ? "↑" : "↓";

  const last3Months = monthlyData.values.slice(-3);
  const avg3Months =
    last3Months.reduce((a, b) => a + b, 0) / last3Months.length;
  const prev3Months = monthlyData.values.slice(-6, -3);
  const avgPrev3Months =
    prev3Months.length > 0
      ? prev3Months.reduce((a, b) => a + b, 0) / prev3Months.length
      : 0;
  const quarterTrend =
    avgPrev3Months > 0
      ? (((avg3Months - avgPrev3Months) / avgPrev3Months) * 100).toFixed(1)
      : 0;
  const quarterTrendClass = quarterTrend >= 0 ? "positive" : "negative";
  const quarterTrendIcon = quarterTrend >= 0 ? "↑" : "↓";

  document.getElementById("trends-container").innerHTML = `
    <div class="trend-card">
      <div class="trend-metric">Текущий месяц</div>
      <div class="trend-value">${formatNumber(currentMonth.toFixed(2))} м</div>
      <div class="trend-change ${monthTrendClass}">
        ${monthTrendIcon} ${Math.abs(monthTrend)}% vs прошлый месяц
      </div>
    </div>
    <div class="trend-card">
      <div class="trend-metric">Среднее за 3 месяца</div>
      <div class="trend-value">${formatNumber(avg3Months.toFixed(2))} м</div>
      <div class="trend-change ${quarterTrendClass}">
        ${quarterTrendIcon} ${Math.abs(quarterTrend)}% vs предыдущие 3 месяца
      </div>
    </div>
    <div class="trend-card">
      <div class="trend-metric">Целевой показатель (месяц)</div>
      <div class="trend-value">${formatNumber(KPI_TARGETS.monthlyTarget)} м</div>
      <div class="trend-change ${currentMonth >= KPI_TARGETS.monthlyTarget ? "positive" : "negative"}">
        ${currentMonth >= KPI_TARGETS.monthlyTarget ? "✓ Выполнено" : "✗ Не выполнено"}
      </div>
    </div>
    <div class="trend-card">
      <div class="trend-metric">Всего за период</div>
      <div class="trend-value">${formatNumber(monthlyData.values.reduce((a, b) => a + b, 0).toFixed(2))} м</div>
      <div class="trend-change neutral">
        ${monthlyData.labels.length} месяцев данных
      </div>
    </div>
  `;
}

function exportToCSV() {
  if (filteredData.length === 0) {
    alert("Нет данных для экспорта");
    return;
  }
  const headersRow = headers.join(",");
  const rows = filteredData.map((row) =>
    headers
      .map((h) => {
        let val = row[h];
        if (val === undefined || val === null) return "";
        if (typeof val === "number") return val.toFixed(2);
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  const csvContent = [headersRow, ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `аналитика_сварка_${new Date().toISOString().split("T")[0]}.csv`,
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function initDefectSelector() {
  const select = document.getElementById("defect-field");
  select.innerHTML = headers
    .map((h) => `<option value="${h}">${h}</option>`)
    .join("");
  select.value = defectRule.field;
  document.getElementById("defect-operator").value = defectRule.operator;
  document.getElementById("defect-value").value = defectRule.value;

  if (window.hasDefectData()) {
    document.querySelector(".defect-rule-config").style.display = "none";
  }
}

function updateDefectRule() {
  defectRule.field = document.getElementById("defect-field").value;
  defectRule.operator = document.getElementById("defect-operator").value;
  const raw = document.getElementById("defect-value").value.trim();
  defectRule.value = isNaN(raw)
    ? raw
    : raw.includes(".")
      ? parseFloat(raw)
      : raw;
}

function evaluateDefect(row, rule) {
  const val = row[rule.field];
  const rval = rule.value;
  switch (rule.operator) {
    case "=":
      return val == rval;
    case "!=":
      return val != rval;
    case ">":
      return window.safeParseFloat(val) > window.safeParseFloat(rval);
    case "<":
      return window.safeParseFloat(val) < window.safeParseFloat(rval);
    default:
      return false;
  }
}

function buildEfficiencyChart() {
  if (!efficiencyPlot) return;
  const period = document.getElementById("efficiency-group").value;
  const data = groupByDate(filteredData, "Длина сварных швов", period, "sum");
  efficiencyPlot.update(
    data.labels,
    data.values,
    `Сумма длины швов (${period})`,
  );
}

function buildWeldLengthChart() {
  if (!weldLengthPlot) return;
  const period = document.getElementById("weld-period").value;
  const { labels, datasets } = prepareWelderLines(period);
  weldLengthPlot.updateMultiLine(
    labels,
    datasets,
    `Динамика длины швов по сварщикам (${period === "month" ? "месяцам" : "кварталам"})`,
  );
}

// Новая версия updateDefectPie, основанная на номерах днищ
function updateDefectPie() {
  if (!defectPie) return;
  if (!window.hasDefectData()) {
    // Если данных брака нет, используем старый метод по правилу
    const welders = {};
    filteredData.forEach((row) => {
      const welder = row["welder_normalized"] || "Неизвестно";
      if (!welders[welder]) welders[welder] = { total: 0, defect: 0 };
      welders[welder].total++;
      if (evaluateDefect(row, defectRule)) welders[welder].defect++;
    });
    const labels = Object.keys(welders);
    const defectPercentages = labels.map(
      (w) => (welders[w].defect / welders[w].total) * 100 || 0,
    );
    defectPie.update(labels, defectPercentages, "% брака (по правилу)");
    return;
  }

  // Собираем данные о сварщиках из основного листа
  const welderBottoms = {};
  filteredData.forEach((row) => {
    const welder = row["welder_normalized"] || "Неизвестно";
    const bottom = window.getBottomNumber(row);
    if (!welderBottoms[welder]) {
      welderBottoms[welder] = {
        totalBottoms: new Set(),
        totalOps: 0,
      };
    }
    welderBottoms[welder].totalOps++;
    if (bottom) welderBottoms[welder].totalBottoms.add(bottom);
  });

  // Собираем бракованные днища
  const defectiveBottoms = new Set();
  const mainDefects = getMainDefectData();
  mainDefects.forEach((defectRow) => {
    const bottom = window.getBottomNumber(defectRow);
    if (bottom) defectiveBottoms.add(bottom);
  });

  // Для каждого сварщика считаем, сколько его уникальных днищ попали в брак
  const labels = [];
  const defectPercentages = [];
  Object.keys(welderBottoms).forEach((welder) => {
    const info = welderBottoms[welder];
    let defectCount = 0;
    info.totalBottoms.forEach((bottom) => {
      if (defectiveBottoms.has(bottom)) defectCount++;
    });
    const percent = info.totalOps ? (defectCount / info.totalOps) * 100 : 0;
    labels.push(welder);
    defectPercentages.push(percent);
  });

  console.log("Defect pie data (по днищам):", labels, defectPercentages);
  defectPie.update(labels, defectPercentages, "% брака (по уникальным днищам)");
}

// Новая версия getReworkData, основанная на номерах днищ
function getReworkData() {
  if (!filteredDefectData.length)
    return { labels: [], reworkCounts: [], uniqueBottoms: [] };

  // Собираем днища, которые были повторно исправлены
  const reworkBottoms = new Set();
  const reworks = getReworkDefectData();
  reworks.forEach((r) => {
    const bottom = window.getBottomNumber(r);
    if (bottom) reworkBottoms.add(bottom);
  });

  // Собираем для каждого сварщика его уникальные днища из основного листа
  const welderBottoms = {};
  filteredData.forEach((row) => {
    const welder = row["welder_normalized"] || "Неизвестно";
    const bottom = window.getBottomNumber(row);
    if (!welderBottoms[welder]) {
      welderBottoms[welder] = new Set();
    }
    if (bottom) welderBottoms[welder].add(bottom);
  });

  // Для каждого сварщика считаем, сколько его уникальных днищ попали в reworkBottoms
  const labels = [];
  const reworkCounts = [];
  const uniqueBottoms = []; // здесь можно оставить общее количество уникальных днищ сварщика

  Object.keys(welderBottoms).forEach((welder) => {
    const bottoms = welderBottoms[welder];
    let count = 0;
    bottoms.forEach((bottom) => {
      if (reworkBottoms.has(bottom)) count++;
    });
    labels.push(welder);
    reworkCounts.push(count);
    uniqueBottoms.push(bottoms.size);
  });

  return { labels, reworkCounts, uniqueBottoms };
}

function updateReworkChart() {
  if (!reworkPlot) return;
  const { labels, reworkCounts, uniqueBottoms } = getReworkData();
  reworkPlot.update(labels, reworkCounts, uniqueBottoms);
}

function updateOtherDefectsChart() {
  if (!otherDefectsPlot) return;
  const { labels, counts } = getOtherDefectsData();
  otherDefectsPlot.update(labels, counts);
}

function updateReworkPie() {
  if (!window.reworkPie) return;
  const mainDefects = getMainDefectData().length;
  const reworks = filteredDefectData.filter(
    (d) => d["Технологическая операция"] === "Исправление повторное",
  ).length;
  window.reworkPie.update(mainDefects, reworks);
}

function groupByDate(data, valueField, period, aggType = "sum") {
  const groups = {};
  data.forEach((row) => {
    const dateStr = row["Дата"];
    if (!dateStr) return;
    const [day, month, year] = dateStr.split(".").map(Number);
    if (!day || !month || !year) return;
    let key;
    if (period === "day")
      key = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    else if (period === "month")
      key = `${year}-${month.toString().padStart(2, "0")}`;
    else if (period === "quarter") {
      const q = Math.ceil(month / 3);
      key = `${year}-Q${q}`;
    } else if (period === "year") key = `${year}`;
    if (!groups[key]) groups[key] = [];
    const val = window.safeParseFloat(row[valueField]);
    groups[key].push(val);
  });
  const sortedKeys = Object.keys(groups).sort();
  let values;
  if (aggType === "sum")
    values = sortedKeys.map((k) => groups[k].reduce((a, b) => a + b, 0));
  else if (aggType === "avg")
    values = sortedKeys.map(
      (k) => groups[k].reduce((a, b) => a + b, 0) / groups[k].length,
    );
  else if (aggType === "count")
    values = sortedKeys.map((k) => groups[k].length);
  return { labels: sortedKeys, values };
}

function prepareWelderLines(period = "month") {
  const welders = [
    ...new Set(filteredData.map((r) => r["welder_normalized"]).filter(Boolean)),
  ];
  const series = {};
  welders.forEach((w) => (series[w] = {}));

  filteredData.forEach((row) => {
    const welder = row["welder_normalized"];
    if (!welder) return;
    const dateStr = row["Дата"];
    if (!dateStr) return;
    const [day, month, year] = dateStr.split(".").map(Number);
    if (!day || !month || !year) return;
    let periodKey;
    if (period === "month")
      periodKey = `${year}-${month.toString().padStart(2, "0")}`;
    else if (period === "quarter") {
      const q = Math.ceil(month / 3);
      periodKey = `${year}-Q${q}`;
    }
    const length = window.safeParseFloat(row["Длина сварных швов"]);
    if (!series[welder][periodKey]) series[welder][periodKey] = 0;
    series[welder][periodKey] += length;
  });

  const allPeriods = new Set();
  welders.forEach((w) =>
    Object.keys(series[w]).forEach((p) => allPeriods.add(p)),
  );
  const sortedPeriods = Array.from(allPeriods).sort();

  const colors = window.helpers.generateColors(welders.length);
  const datasets = welders.map((welder, idx) => ({
    label: welder,
    data: sortedPeriods.map((p) => series[welder][p] || 0),
    borderColor: colors[idx],
    backgroundColor: colors[idx] + "20",
    tension: 0.2,
    fill: false,
    pointRadius: 3,
  }));

  return { labels: sortedPeriods, datasets };
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-banner";
  errorDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #dc2626;
    color: white;
    padding: 1rem;
    text-align: center;
    z-index: 9999;
    font-weight: bold;
  `;
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
}
