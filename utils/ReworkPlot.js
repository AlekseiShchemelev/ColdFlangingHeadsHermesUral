class ReworkPlot {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas с id "${canvasId}" не найден`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(labels, reworkCounts, uniqueBottoms) {
    if (!this.ctx) return;

    try {
      if (this.chart) {
        this.chart.destroy();
      }

      if (!labels.length) {
        this.chart = new Chart(this.ctx, {
          type: "bar",
          data: {
            labels: ["Нет данных"],
            datasets: [
              {
                data: [0],
                backgroundColor: "#e5e7eb",
                borderWidth: 0,
              },
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
            scales: {
              y: { beginAtZero: true },
            },
          },
        });
        return;
      }

      this.chart = new Chart(this.ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Количество повторных исправлений",
              data: reworkCounts,
              backgroundColor: "rgba(239, 68, 68, 0.7)",
              borderColor: "rgba(239, 68, 68, 1)",
              borderWidth: 1,
              borderRadius: 6,
            },
            {
              label: "Уникальные бракованные днища",
              data: uniqueBottoms,
              backgroundColor: "rgba(59, 130, 246, 0.7)",
              borderColor: "rgba(59, 130, 246, 1)",
              borderWidth: 1,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "top",
              labels: {
                padding: 12,
                usePointStyle: true,
                font: { size: 11 },
              },
            },
            title: {
              display: true,
              text: "Повторные исправления по сварщикам",
              font: { size: 14, weight: "bold" },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Количество",
              },
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 0,
              },
            },
          },
        },
      });
    } catch (error) {
      console.error(
        "Ошибка при обновлении графика повторных исправлений:",
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
