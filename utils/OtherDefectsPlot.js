// OtherDefectsPlot.js – круговая диаграмма прочих дефектов

class OtherDefectsPlot {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas с id "${canvasId}" не найден`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(labels, counts) {
    if (!this.ctx) return;

    try {
      if (this.chart) {
        this.chart.destroy();
      }

      if (!labels.length) {
        this.chart = new Chart(this.ctx, {
          type: "doughnut",
          data: {
            labels: ["Нет данных"],
            datasets: [{
              data: [1],
              backgroundColor: ["#e5e7eb"],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: {
                display: true,
                text: "Прочие дефекты (нет данных)",
                font: { size: 14 }
              },
              tooltip: { enabled: false }
            }
          }
        });
        return;
      }

      this.chart = new Chart(this.ctx, {
        type: "pie",
        data: {
          labels: labels,
          datasets: [{
            data: counts,
            backgroundColor: [
              "#3b82f6", "#ef4444", "#eab308", "#22c55e", "#a855f7",
              "#ec4899", "#14b8a6", "#f97316", "#6b7280", "#8b5cf6",
              "#06b6d4", "#f43f5e", "#84cc16", "#6366f1", "#fbbf24"
            ],
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: {
                padding: 12,
                usePointStyle: true,
                font: { size: 11 },
                boxWidth: 16
              }
            },
            title: {
              display: true,
              text: "Распределение прочих дефектов по типам операций",
              font: { size: 14, weight: "bold" }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const percent = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                  return `${ctx.label}: ${ctx.raw} (${percent}%)`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Ошибка при обновлении диаграммы прочих дефектов:", error);
    }
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}