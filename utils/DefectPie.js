class DefectPie {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas с id "${canvasId}" не найден`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(labels, data, title) {
    if (!this.ctx) return;

    try {
      if (this.chart) {
        this.chart.destroy();
      }

      if (!labels.length || !data.length) {
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
                text: title || "Брак по сварщикам (нет данных)",
                font: { size: 14 }
              },
              tooltip: { enabled: false }
            }
          }
        });
        return;
      }

      // Генерируем цвета
      const colors = generateColors(labels.length);

      this.chart = new Chart(this.ctx, {
        type: "doughnut",
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
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
                padding: 15,
                usePointStyle: true,
                font: { size: 11 }
              }
            },
            title: {
              display: true,
              text: title || "Брак по сварщикам",
              font: { size: 14, weight: "bold" }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const value = ctx.raw || 0;
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${ctx.label}: ${value.toFixed(1)}% (${Math.round(value)} записей)`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Ошибка при обновлении круговой диаграммы:", error);
    }
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
