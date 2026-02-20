class EfficiencyPlot {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas с id "${canvasId}" не найден`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(labels, values, title) {
    if (!this.ctx) return;

    try {
      if (this.chart) {
        this.chart.destroy();
      }

      if (!labels.length || !values.length) {
        this.chart = new Chart(this.ctx, {
          type: "line",
          data: {
            labels: ["Нет данных"],
            datasets: [{
              data: [0],
              borderColor: "#e5e7eb",
              backgroundColor: "#e5e7eb",
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: {
                display: true,
                text: title || "Эффективность (нет данных)",
                font: { size: 14 }
              },
              tooltip: { enabled: false }
            },
            scales: {
              y: { beginAtZero: true }
            }
          }
        });
        return;
      }

      this.chart = new Chart(this.ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: "Длина швов (м)",
            data: values,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: "#3b82f6",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: title || "Эффективность",
              font: { size: 14, weight: "bold" }
            },
            tooltip: {
              mode: "index",
              intersect: false,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)} м`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Длина швов (м)"
              },
              ticks: {
                callback: (value) => formatNumber(value)
              }
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 0
              }
            }
          },
          interaction: {
            mode: "nearest",
            axis: "x",
            intersect: false
          }
        }
      });
    } catch (error) {
      console.error("Ошибка при обновлении графика эффективности:", error);
    }
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}