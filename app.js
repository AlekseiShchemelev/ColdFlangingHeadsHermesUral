// app.js – точка входа, управление состоянием и связь между модулями

// Глобальные переменные состояния
let allData = [];
let filteredData = [];
let headers = [];
let defectRule = { field: "ИТОГО проволока", operator: "=", value: 0 };

let efficiencyPlot, weldLengthPlot, defectPie;

const KPI_TARGETS = {
  defectRate: 5,
  avgLength: 10,
  monthlyTarget: 1000,
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadDataFromCSV();
  if (allData.length === 0) return;

  initFilters();
  initDefectSelector();
  updateStats();
  renderTable();
  updateWeldersRanking();
  updateDefectSummary();
  updateTrends();

  efficiencyPlot = new EfficiencyPlot("efficiency-chart");
  weldLengthPlot = new WeldLengthPlot("weld-chart");
  defectPie = new DefectPie("defect-pie");

  buildEfficiencyChart();
  buildWeldLengthChart();
  updateDefectPie();

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
    if (e.target.id === "help-modal") {
      document.getElementById("help-modal").classList.remove("active");
    }
  });
});

// ==================== ФИЛЬТРЫ ====================
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
    div.innerHTML = `
      <label>${field.label}</label>
      <input type="${field.type}" id="${field.id}" placeholder="${field.placeholder}">
    `;
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

  filteredData = allData.filter((row) => {
    // Фильтр по дате
    if (dateFrom || dateTo) {
      const rowDate = row["Дата"];
      if (!rowDate) return false;
      const [day, month, year] = rowDate.split(".").map(Number);
      if (!day || !month || !year) return false;
      const rowDateObj = new Date(year, month - 1, day);

      if (dateFrom) {
        const [fromDay, fromMonth, fromYear] = dateFrom.split(".").map(Number);
        if (fromDay && fromMonth && fromYear) {
          const fromDateObj = new Date(fromYear, fromMonth - 1, fromDay);
          if (rowDateObj < fromDateObj) return false;
        }
      }
      if (dateTo) {
        const [toDay, toMonth, toYear] = dateTo.split(".").map(Number);
        if (toDay && toMonth && toYear) {
          const toDateObj = new Date(toYear, toMonth - 1, toDay);
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

    // Фильтр по диаметру
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

    // Фильтр по толщине
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
  updateUI();
}

// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ====================
function updateUI() {
  updateStats();
  renderTable();
  buildEfficiencyChart();
  buildWeldLengthChart();
  updateDefectPie();
  updateWeldersRanking();
  updateDefectSummary();
  updateTrends();
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function updateStats() {
  const total = filteredData.length;
  let totalLength = 0,
    totalWire = 0;
  filteredData.forEach((row) => {
    totalLength += parseFloat(row["Длина сварных швов"]) || 0;
    totalWire += parseFloat(row["ИТОГО проволока"]) || 0;
  });
  const avgLength = total ? (totalLength / total).toFixed(2) : 0;

  // Расчёт брака по отфильтрованным данным
  let defectCount, defectPct;
  if (hasDefectData()) {
    defectCount = 0;
    filteredData.forEach((row) => {
      if (isDefective(row)) {
        defectCount++;
      }
    });
    defectPct = total ? ((defectCount / total) * 100).toFixed(1) : 0;
  } else {
    defectCount = filteredData.filter((row) =>
      evaluateDefect(row, defectRule),
    ).length;
    defectPct = total ? ((defectCount / total) * 100).toFixed(1) : 0;
  }

  // Тренд
  const midPoint = Math.floor(filteredData.length / 2);
  const firstHalf = filteredData.slice(0, midPoint);
  const secondHalf = filteredData.slice(midPoint);
  const firstHalfLength = firstHalf.reduce(
    (sum, r) => sum + (parseFloat(r["Длина сварных швов"]) || 0),
    0,
  );
  const secondHalfLength = secondHalf.reduce(
    (sum, r) => sum + (parseFloat(r["Длина сварных швов"]) || 0),
    0,
  );
  const trend =
    firstHalfLength > 0
      ? (
          ((secondHalfLength - firstHalfLength) / firstHalfLength) *
          100
        ).toFixed(1)
      : 0;
  const trendClass = trend > 0 ? "up" : trend < 0 ? "down" : "neutral";
  const trendIcon = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";

  const defectStatus =
    parseFloat(defectPct) <= KPI_TARGETS.defectRate
      ? "good"
      : parseFloat(defectPct) <= KPI_TARGETS.defectRate * 2
        ? "warning"
        : "bad";
  const lengthStatus =
    parseFloat(avgLength) >= KPI_TARGETS.avgLength ? "good" : "warning";
  const defectSource = hasDefectData() ? 'из листа "Брак"' : "по правилу";

  document.getElementById("stats-cards").innerHTML = `
    <div class="stat-card ${lengthStatus}">
      <span class="stat-label">Всего операций</span>
      <div class="stat-value">${total}</div>
      <div class="stat-trend neutral">Количество записей за период</div>
    </div>
    <div class="stat-card ${lengthStatus}">
      <span class="stat-label">Сумма швов (м)</span>
      <div class="stat-value">${formatNumber(totalLength.toFixed(2))}</div>
      <div class="stat-trend ${trendClass}">${trendIcon} ${Math.abs(trend)}% vs прошлый период</div>
    </div>
    <div class="stat-card ${lengthStatus}">
      <span class="stat-label">Средняя длина (м)</span>
      <div class="stat-value">${avgLength}</div>
      <div class="stat-trend neutral">Норма: ≥${KPI_TARGETS.avgLength}м</div>
    </div>
    <div class="stat-card ${defectStatus}">
      <span class="stat-label">Брак (%)</span>
      <div class="stat-value">${defectPct}%</div>
      <div class="stat-trend neutral">Норма: ≤${KPI_TARGETS.defectRate}% (${defectSource})</div>
    </div>
  `;
}

function renderTable() {
  const visibleHeaders = headers.slice(0, 15);
  const thead = document.getElementById("table-header");
  const tbody = document.getElementById("table-body");
  const resultCount = document.getElementById("result-count");

  thead.innerHTML = `<tr>${visibleHeaders.map((h) => `<th>${h}</th>`).join("")}</tr>`;

  const columnWidths = calculateColumnWidths(visibleHeaders);
  const rowsToShow = filteredData.slice(0, 500);
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

  resultCount.innerText = filteredData.length;
  if (filteredData.length > 500) {
    let note = document.querySelector(".table-wrapper .pagination-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "pagination-note";
      note.style.padding = "0.5rem";
      note.style.color = "#64748b";
      note.style.textAlign = "center";
      document.querySelector(".table-wrapper").appendChild(note);
    }
    note.textContent = `Показано 500 из ${filteredData.length} записей`;
  }
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

// ==================== РЕЙТИНГ СВАРЩИКОВ ====================
function updateWeldersRanking() {
  const welders = {};
  filteredData.forEach((row) => {
    const welder = row["welder_normalized"] || "Неизвестно";
    if (!welders[welder]) {
      welders[welder] = { total: 0, totalLength: 0, defect: 0 };
    }
    welders[welder].total++;
    welders[welder].totalLength += parseFloat(row["Длина сварных швов"]) || 0;
  });

  // Расчёт брака по отфильтрованным данным
  if (hasDefectData()) {
    Object.keys(welders).forEach((w) => (welders[w].defect = 0));
    filteredData.forEach((row) => {
      if (isDefective(row)) {
        const welder = row["welder_normalized"] || "Неизвестно";
        if (welders[welder]) {
          welders[welder].defect++;
        }
      }
    });
  } else {
    filteredData.forEach((row) => {
      const welder = row["welder_normalized"] || "Неизвестно";
      if (evaluateDefect(row, defectRule)) {
        welders[welder].defect = (welders[welder].defect || 0) + 1;
      }
    });
  }

  // Расчёт средних и рейтинга
  Object.keys(welders).forEach((w) => {
    welders[w].avgLength = welders[w].total
      ? (welders[w].totalLength / welders[w].total).toFixed(2)
      : 0;
    welders[w].defectRate = welders[w].total
      ? ((welders[w].defect / welders[w].total) * 100).toFixed(1)
      : 0;
    welders[w].score =
      parseFloat(welders[w].avgLength) * 10 - parseFloat(welders[w].defectRate);
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
        <div class="welder-metric"><span class="welder-metric-label">Средняя длина (м)</span><span class="welder-metric-value">${data.avgLength}</span></div>
        <div class="welder-metric"><span class="welder-metric-label">Брак (%)</span><span class="welder-metric-value" style="color: ${data.defectRate <= KPI_TARGETS.defectRate ? "#22c55e" : "#ef4444"}">${data.defectRate}%</span></div>
      </div>
    </div>
  `,
    )
    .join("");
}

// ==================== АНАЛИЗ БРАКА ====================
function updateDefectSummary() {
  const total = filteredData.length;

  let defectCount, defectPct;
  if (hasDefectData()) {
    defectCount = 0;
    filteredData.forEach((row) => {
      if (isDefective(row)) {
        defectCount++;
      }
    });
    defectPct = total ? (defectCount / total) * 100 : 0;
  } else {
    defectCount = filteredData.filter((row) =>
      evaluateDefect(row, defectRule),
    ).length;
    defectPct = total ? (defectCount / total) * 100 : 0;
  }

  // Топ-3 сварщика по браку (среди отфильтрованных)
  const welderDefects = {};
  if (hasDefectData()) {
    filteredData.forEach((row) => {
      if (isDefective(row)) {
        const welder = row["welder_normalized"] || "Неизвестно";
        welderDefects[welder] = (welderDefects[welder] || 0) + 1;
      }
    });
  } else {
    filteredData.forEach((row) => {
      const welder = row["welder_normalized"] || "Неизвестно";
      if (evaluateDefect(row, defectRule)) {
        welderDefects[welder] = (welderDefects[welder] || 0) + 1;
      }
    });
  }

  const topDefectWelders = Object.entries(welderDefects)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const statusClass = defectPct <= KPI_TARGETS.defectRate ? "low" : "high";
  const defectSource = hasDefectData() ? 'Лист "Брак"' : "Правило";

  document.getElementById("defect-summary").innerHTML = `
    <div class="defect-card ${statusClass}">
      <div class="defect-card-title">Всего бракованных операций</div>
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
        ${hasDefectData() ? 'Лист "Брак" (реальные данные)' : "Правило (настроенное условие)"}
      </div>
    </div>
  `;
}

// ==================== ТРЕНДЫ ====================
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

// ==================== ЭКСПОРТ ====================
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

// ==================== ПРАВИЛО БРАКА ====================
function initDefectSelector() {
  const select = document.getElementById("defect-field");
  select.innerHTML = headers
    .map((h) => `<option value="${h}">${h}</option>`)
    .join("");
  select.value = defectRule.field;
  document.getElementById("defect-operator").value = defectRule.operator;
  document.getElementById("defect-value").value = defectRule.value;

  if (hasDefectData()) {
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
      return parseFloat(val) > parseFloat(rval);
    case "<":
      return parseFloat(val) < parseFloat(rval);
    default:
      return false;
  }
}

// ==================== ПОСТРОЕНИЕ ГРАФИКОВ ====================
function buildEfficiencyChart() {
  const period = document.getElementById("efficiency-group").value;
  const data = groupByDate(filteredData, "Длина сварных швов", period, "sum");
  efficiencyPlot.update(
    data.labels,
    data.values,
    `Сумма длины швов (${period})`,
  );
}

function buildWeldLengthChart() {
  const period = document.getElementById("weld-period").value;
  const { labels, datasets } = prepareWelderLines(period);
  weldLengthPlot.updateMultiLine(
    labels,
    datasets,
    `Динамика длины швов по сварщикам (${period === "month" ? "месяцам" : "кварталам"})`,
  );
}

function updateDefectPie() {
  if (hasDefectData()) {
    // Считаем количество бракованных операций по каждому сварщику среди отфильтрованных данных
    const defectCounts = {};
    filteredData.forEach((row) => {
      if (isDefective(row)) {
        const welder = row["welder_normalized"] || "Неизвестно";
        defectCounts[welder] = (defectCounts[welder] || 0) + 1;
      }
    });

    // Общее количество операций по сварщикам
    const welderTotals = {};
    filteredData.forEach((row) => {
      const w = row["welder_normalized"] || "Неизвестно";
      welderTotals[w] = (welderTotals[w] || 0) + 1;
    });

    const welders = Object.keys(defectCounts);
    const defectPercentages = welders.map((welder) => {
      const total = welderTotals[welder] || 1; // защита от деления на 0
      return (defectCounts[welder] / total) * 100;
    });

    defectPie.update(welders, defectPercentages, "% брака");
  } else {
    // Используем правило
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
    defectPie.update(labels, defectPercentages, "% брака");
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
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
    const val = parseFloat(row[valueField]) || 0;
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
    const length = parseFloat(row["Длина сварных швов"]) || 0;
    if (!series[welder][periodKey]) series[welder][periodKey] = 0;
    series[welder][periodKey] += length;
  });

  const allPeriods = new Set();
  welders.forEach((w) =>
    Object.keys(series[w]).forEach((p) => allPeriods.add(p)),
  );
  const sortedPeriods = Array.from(allPeriods).sort();

  const colors = generateColors(welders.length);
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
