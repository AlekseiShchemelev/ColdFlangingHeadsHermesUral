// ReworkPie.js – круговая диаграмма повторных исправлений

class ReworkPie {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas с id "${canvasId}" не найден`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(mainDefectCount, reworkCount) {
    if (!this.ctx) return;

    try {
      if (this.chart) {
        this.chart.destroy();
      }

      const total = mainDefectCount + reworkCount;
      if (total === 0) {
        this.chart = new Chart(this.ctx, {
          type: "doughnut",
          data: {
            labels: ["Нет данных"],
            datasets: [
              { data: [1], backgroundColor: ["#e5e7eb"], borderWidth: 0 },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: {
                display: true,
                text: "Повторные исправления (нет данных)",
                font: { size: 14 },
              },
              tooltip: { enabled: false },
            },
          },
        });
        return;
      }

      const mainPercent = ((mainDefectCount / total) * 100).toFixed(1);
      const reworkPercent = ((reworkCount / total) * 100).toFixed(1);

      this.chart = new Chart(this.ctx, {
        type: "doughnut",
        data: {
          labels: [
            `Предъявление продукции (${mainDefectCount} шт., ${mainPercent}%)`,
            `Повторные исправления (${reworkCount} шт., ${reworkPercent}%)`,
          ],
          datasets: [
            {
              data: [mainDefectCount, reworkCount],
              backgroundColor: ["#3b82f6", "#ef4444"],
              borderWidth: 2,
              borderColor: "#ffffff",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { padding: 15, usePointStyle: true, font: { size: 11 } },
            },
            title: {
              display: true,
              text: "Доля повторных исправлений в общем браке",
              font: { size: 14, weight: "bold" },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const value = ctx.raw || 0;
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const percent =
                    total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${ctx.label.split("(")[0].trim()}: ${value} (${percent}%)`;
                },
              },
            },
          },
        },
      });
    } catch (error) {
      console.error(
        "Ошибка при обновлении диаграммы повторных исправлений:",
        error,
      );
    }
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
